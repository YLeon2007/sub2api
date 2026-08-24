package service

import (
	"archive/tar"
	"archive/zip"
	"bufio"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	pathpkg "path"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	infraerrors "github.com/Wei-Shaw/sub2api/internal/pkg/errors"
)

var (
	ErrNoUpdateAvailable         = infraerrors.Conflict("ALREADY_UP_TO_DATE", "no update available; current version is latest")
	ErrRollbackVersionNotAllowed = infraerrors.BadRequest("ROLLBACK_VERSION_NOT_ALLOWED", "version is not in the allowed rollback list")
)

const (
	updateCacheKey = "update_check_cache"
	updateCacheTTL = 1200 // 20 minutes
	githubRepo     = "YLeon2007/sub2api"

	// Security: allowed download domains for updates
	allowedDownloadHost = "github.com"
	allowedAssetHost    = "objects.githubusercontent.com"

	// Security: max download size (500MB)
	maxDownloadSize = 500 * 1024 * 1024

	// Security budgets for checksum-valid release archives. The published assets are
	// substantially smaller; these ceilings prevent unbounded member and inflate work.
	maxArchiveMembers           = 1024
	maxArchiveUncompressedBytes = 1024 * 1024 * 1024
	maxArchiveTrailingBytes     = 1024 * 1024

	// Rollback: expose at most the 3 most recent versions older than current
	maxRollbackVersions = 3
	// Fetch a few extra releases so filtering (current/newer/prerelease) still leaves enough candidates
	rollbackFetchPageSize = 15
)

// UpdateCache defines cache operations for update service
type UpdateCache interface {
	GetUpdateInfo(ctx context.Context) (string, error)
	SetUpdateInfo(ctx context.Context, data string, ttl time.Duration) error
}

// GitHubReleaseClient 获取 GitHub release 信息的接口
type GitHubReleaseClient interface {
	FetchLatestRelease(ctx context.Context, repo string) (*GitHubRelease, error)
	FetchRecentReleases(ctx context.Context, repo string, perPage int) ([]*GitHubRelease, error)
	DownloadFile(ctx context.Context, url, dest string, maxSize int64) error
	FetchChecksumFile(ctx context.Context, url string) ([]byte, error)
}

// UpdateService handles software updates
type UpdateService struct {
	cache          UpdateCache
	githubClient   GitHubReleaseClient
	currentVersion string
	buildType      string // "source" for manual builds, "release" for CI builds
	operationMu    sync.Mutex
}

// NewUpdateService creates a new UpdateService
func NewUpdateService(cache UpdateCache, githubClient GitHubReleaseClient, version, buildType string) *UpdateService {
	return &UpdateService{
		cache:          cache,
		githubClient:   githubClient,
		currentVersion: version,
		buildType:      buildType,
	}
}

// UpdateInfo contains update information
type UpdateInfo struct {
	CurrentVersion string       `json:"current_version"`
	LatestVersion  string       `json:"latest_version"`
	HasUpdate      bool         `json:"has_update"`
	ReleaseInfo    *ReleaseInfo `json:"release_info,omitempty"`
	Cached         bool         `json:"cached"`
	Warning        string       `json:"warning,omitempty"`
	BuildType      string       `json:"build_type"` // "source" or "release"
}

// ReleaseInfo contains GitHub release details
type ReleaseInfo struct {
	Name        string  `json:"name"`
	Body        string  `json:"body"`
	PublishedAt string  `json:"published_at"`
	HTMLURL     string  `json:"html_url"`
	Assets      []Asset `json:"assets,omitempty"`
}

// Asset represents a release asset
type Asset struct {
	Name        string `json:"name"`
	DownloadURL string `json:"download_url"`
	Size        int64  `json:"size"`
}

// GitHubRelease represents GitHub API response
type GitHubRelease struct {
	TagName     string        `json:"tag_name"`
	Name        string        `json:"name"`
	Body        string        `json:"body"`
	PublishedAt string        `json:"published_at"`
	HTMLURL     string        `json:"html_url"`
	Draft       bool          `json:"draft"`
	Prerelease  bool          `json:"prerelease"`
	Assets      []GitHubAsset `json:"assets"`
}

// RollbackVersion describes a release version the system can roll back to
type RollbackVersion struct {
	Version     string `json:"version"` // without "v" prefix, e.g. "0.1.146"
	PublishedAt string `json:"published_at"`
	HTMLURL     string `json:"html_url"`
}

type GitHubAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

// CheckUpdate checks for available updates
func (s *UpdateService) CheckUpdate(ctx context.Context, force bool) (*UpdateInfo, error) {
	// Try cache first
	if !force {
		if cached, err := s.getFromCache(ctx); err == nil && cached != nil {
			return cached, nil
		}
	}

	// Fetch from GitHub
	info, err := s.fetchLatestRelease(ctx)
	if err != nil {
		// Return cached on error
		if cached, cacheErr := s.getFromCache(ctx); cacheErr == nil && cached != nil {
			cached.Warning = "Using cached data: " + err.Error()
			return cached, nil
		}
		return &UpdateInfo{
			CurrentVersion: s.currentVersion,
			LatestVersion:  s.currentVersion,
			HasUpdate:      false,
			Warning:        err.Error(),
			BuildType:      s.buildType,
		}, nil
	}

	// Cache result
	s.saveToCache(ctx, info)
	return info, nil
}

// PerformUpdate downloads and applies the update
// Uses atomic file replacement pattern for safe in-place updates
func (s *UpdateService) PerformUpdate(ctx context.Context) error {
	info, err := s.CheckUpdate(ctx, true)
	if err != nil {
		return err
	}

	if !info.HasUpdate {
		return ErrNoUpdateAvailable
	}

	return s.applyReleaseAssets(ctx, info.LatestVersion, info.ReleaseInfo.Assets)
}

// applyReleaseAssets downloads the platform archive from the given release assets,
// verifies its checksum, and atomically swaps the running binary.
// Shared by PerformUpdate (latest) and RollbackToVersion (specific older version).
func (s *UpdateService) applyReleaseAssets(ctx context.Context, version string, releaseAssets []Asset) error {
	s.operationMu.Lock()
	defer s.operationMu.Unlock()

	archive, checksum, err := selectReleaseAssets(version, runtime.GOOS, runtime.GOARCH, releaseAssets)
	if err != nil {
		return err
	}
	downloadURL := archive.DownloadURL
	checksumURL := checksum.DownloadURL

	// SECURITY: Validate download URL is from trusted domain
	if err := validateDownloadURL(downloadURL); err != nil {
		return fmt.Errorf("invalid download URL: %w", err)
	}
	if err := validateDownloadURL(checksumURL); err != nil {
		return fmt.Errorf("invalid checksum URL: %w", err)
	}

	// Get current executable path
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}
	exePath, err = filepath.EvalSymlinks(exePath)
	if err != nil {
		return fmt.Errorf("failed to resolve symlinks: %w", err)
	}

	exeDir := filepath.Dir(exePath)

	// Create temp directory in the SAME directory as executable
	// This ensures os.Rename is atomic (same filesystem)
	tempDir, err := os.MkdirTemp(exeDir, ".sub2api-update-*")
	if err != nil {
		return fmt.Errorf("failed to create temp dir: %w", err)
	}
	defer func() { _ = os.RemoveAll(tempDir) }()

	// Download archive
	archivePath := filepath.Join(tempDir, archive.Name)
	if err := s.downloadFile(ctx, downloadURL, archivePath); err != nil {
		return fmt.Errorf("download failed: %w", err)
	}

	// A release checksum is mandatory: never install an unverified archive.
	if err := s.verifyChecksum(ctx, archivePath, checksumURL); err != nil {
		return fmt.Errorf("checksum verification failed: %w", err)
	}

	// Extract binary from archive
	newBinaryPath := filepath.Join(tempDir, "sub2api")
	if err := s.extractBinary(archivePath, newBinaryPath); err != nil {
		return fmt.Errorf("extraction failed: %w", err)
	}

	// Set executable permission before replacement
	if err := os.Chmod(newBinaryPath, 0755); err != nil {
		return fmt.Errorf("chmod failed: %w", err)
	}

	return replaceExecutableWithBackup(exePath, newBinaryPath, atomicReplace)
}

// Rollback restores the previous version
func (s *UpdateService) Rollback() error {
	s.operationMu.Lock()
	defer s.operationMu.Unlock()

	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get executable path: %w", err)
	}
	exePath, err = filepath.EvalSymlinks(exePath)
	if err != nil {
		return fmt.Errorf("failed to resolve symlinks: %w", err)
	}

	backupFile := exePath + ".backup"
	if _, err := os.Stat(backupFile); os.IsNotExist(err) {
		return fmt.Errorf("no backup found")
	}

	// Replace current with backup
	if err := atomicReplace(backupFile, exePath); err != nil {
		return fmt.Errorf("rollback failed: %w", err)
	}
	return syncDirectory(filepath.Dir(exePath))
}

// ListRollbackVersions returns up to maxRollbackVersions release versions that are
// strictly older than the current version (the current version itself is excluded),
// newest first. Draft and prerelease entries are skipped.
func (s *UpdateService) ListRollbackVersions(ctx context.Context) ([]RollbackVersion, error) {
	releases, err := s.fetchRollbackCandidates(ctx)
	if err != nil {
		return nil, err
	}

	versions := make([]RollbackVersion, 0, len(releases))
	for _, r := range releases {
		versions = append(versions, RollbackVersion{
			Version:     strings.TrimPrefix(r.TagName, "v"),
			PublishedAt: r.PublishedAt,
			HTMLURL:     r.HTMLURL,
		})
	}
	return versions, nil
}

// RollbackToVersion downloads and installs a specific older version.
// The target must be one of the versions returned by ListRollbackVersions;
// anything else (including the current version) is rejected.
func (s *UpdateService) RollbackToVersion(ctx context.Context, version string) error {
	target := strings.TrimPrefix(strings.TrimSpace(version), "v")
	if target == "" {
		return ErrRollbackVersionNotAllowed
	}

	releases, err := s.fetchRollbackCandidates(ctx)
	if err != nil {
		return err
	}

	var match *GitHubRelease
	for _, r := range releases {
		if strings.TrimPrefix(r.TagName, "v") == target {
			match = r
			break
		}
	}
	if match == nil {
		return ErrRollbackVersionNotAllowed
	}

	assets := make([]Asset, len(match.Assets))
	for i, a := range match.Assets {
		assets[i] = Asset{
			Name:        a.Name,
			DownloadURL: a.BrowserDownloadURL,
			Size:        a.Size,
		}
	}

	return s.applyReleaseAssets(ctx, target, assets)
}

// fetchRollbackCandidates fetches recent releases and keeps the newest
// maxRollbackVersions entries strictly older than the current version.
func (s *UpdateService) fetchRollbackCandidates(ctx context.Context) ([]*GitHubRelease, error) {
	releases, err := s.githubClient.FetchRecentReleases(ctx, githubRepo, rollbackFetchPageSize)
	if err != nil {
		return nil, err
	}

	seen := make(map[string]bool, len(releases))
	candidates := make([]*GitHubRelease, 0, maxRollbackVersions)
	for _, r := range releases {
		if r == nil || r.Draft || r.Prerelease {
			continue
		}
		v := strings.TrimPrefix(r.TagName, "v")
		if v == "" || seen[v] {
			continue
		}
		if _, valid := parseVersion(v); !valid {
			continue
		}
		// Only versions strictly older than current (also excludes current itself)
		if compareVersions(v, s.currentVersion) >= 0 {
			continue
		}
		seen[v] = true
		candidates = append(candidates, r)
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		return compareVersions(
			strings.TrimPrefix(candidates[i].TagName, "v"),
			strings.TrimPrefix(candidates[j].TagName, "v"),
		) > 0
	})

	if len(candidates) > maxRollbackVersions {
		candidates = candidates[:maxRollbackVersions]
	}
	return candidates, nil
}

func (s *UpdateService) fetchLatestRelease(ctx context.Context) (*UpdateInfo, error) {
	release, err := s.githubClient.FetchLatestRelease(ctx, githubRepo)
	if err != nil {
		return nil, err
	}

	latestVersion := strings.TrimPrefix(release.TagName, "v")

	assets := make([]Asset, len(release.Assets))
	for i, a := range release.Assets {
		assets[i] = Asset{
			Name:        a.Name,
			DownloadURL: a.BrowserDownloadURL,
			Size:        a.Size,
		}
	}

	return &UpdateInfo{
		CurrentVersion: s.currentVersion,
		LatestVersion:  latestVersion,
		HasUpdate:      compareVersions(s.currentVersion, latestVersion) < 0,
		ReleaseInfo: &ReleaseInfo{
			Name:        release.Name,
			Body:        release.Body,
			PublishedAt: release.PublishedAt,
			HTMLURL:     release.HTMLURL,
			Assets:      assets,
		},
		Cached:    false,
		BuildType: s.buildType,
	}, nil
}

func (s *UpdateService) downloadFile(ctx context.Context, downloadURL, dest string) error {
	return s.githubClient.DownloadFile(ctx, downloadURL, dest, maxDownloadSize)
}

func expectedReleaseArchiveName(version, goos, goarch string) (string, error) {
	if _, valid := parseVersion(version); !valid {
		return "", fmt.Errorf("invalid release version %q", version)
	}
	extension := ".tar.gz"
	if goos == "windows" {
		extension = ".zip"
	}
	return fmt.Sprintf("sub2api_%s_%s_%s%s", version, goos, goarch, extension), nil
}

func selectReleaseAssets(version, goos, goarch string, assets []Asset) (Asset, Asset, error) {
	expectedArchive, err := expectedReleaseArchiveName(version, goos, goarch)
	if err != nil {
		return Asset{}, Asset{}, err
	}

	archives := make([]Asset, 0, 1)
	checksums := make([]Asset, 0, 1)
	for _, asset := range assets {
		switch asset.Name {
		case expectedArchive:
			archives = append(archives, asset)
		case "checksums.txt":
			checksums = append(checksums, asset)
		}
	}
	if len(archives) != 1 {
		return Asset{}, Asset{}, fmt.Errorf("expected exactly one archive %q, found %d", expectedArchive, len(archives))
	}
	if len(checksums) != 1 {
		return Asset{}, Asset{}, fmt.Errorf("expected exactly one checksums.txt, found %d", len(checksums))
	}
	return archives[0], checksums[0], nil
}

// validateDownloadURL checks if the URL is from an allowed domain
// SECURITY: This prevents SSRF and ensures downloads only come from trusted GitHub domains
func validateDownloadURL(rawURL string) error {
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("invalid URL: %w", err)
	}

	// Must be HTTPS
	if parsedURL.Scheme != "https" {
		return fmt.Errorf("only HTTPS URLs are allowed")
	}

	// Check against allowed hosts
	host := parsedURL.Host
	// GitHub release URLs can be from github.com or objects.githubusercontent.com
	if host != allowedDownloadHost &&
		!strings.HasSuffix(host, "."+allowedDownloadHost) &&
		host != allowedAssetHost &&
		!strings.HasSuffix(host, "."+allowedAssetHost) {
		return fmt.Errorf("download from untrusted host: %s", host)
	}

	return nil
}

func (s *UpdateService) verifyChecksum(ctx context.Context, filePath, checksumURL string) error {
	// Download checksums file
	checksumData, err := s.githubClient.FetchChecksumFile(ctx, checksumURL)
	if err != nil {
		return fmt.Errorf("failed to download checksums: %w", err)
	}

	// Calculate file hash
	f, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer func() { _ = f.Close() }()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}
	actualHash := hex.EncodeToString(h.Sum(nil))

	fileName := filepath.Base(filePath)
	expectedHash, err := expectedChecksumForFile(checksumData, fileName)
	if err != nil {
		return err
	}
	if expectedHash != actualHash {
		return fmt.Errorf("checksum mismatch: expected %s, got %s", expectedHash, actualHash)
	}
	return nil
}

func expectedChecksumForFile(checksumData []byte, fileName string) (string, error) {
	matches := make([]string, 0, 1)
	scanner := bufio.NewScanner(strings.NewReader(string(checksumData)))
	for scanner.Scan() {
		parts := strings.Fields(scanner.Text())
		if len(parts) == 2 && strings.TrimPrefix(parts[1], "*") == fileName {
			matches = append(matches, parts[0])
		}
	}
	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("read checksum manifest: %w", err)
	}
	if len(matches) != 1 {
		return "", fmt.Errorf("expected exactly one checksum for %s, found %d", fileName, len(matches))
	}
	digest := strings.ToLower(matches[0])
	decoded, err := hex.DecodeString(digest)
	if err != nil || len(decoded) != sha256.Size || len(digest) != sha256.Size*2 {
		return "", fmt.Errorf("invalid SHA-256 checksum for %s", fileName)
	}
	return digest, nil
}

func syncPath(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer func() { _ = file.Close() }()
	return file.Sync()
}

func copyExecutableDurably(source, destination string, mode os.FileMode, rename func(string, string) error) error {
	sourceFile, err := os.Open(source)
	if err != nil {
		return err
	}
	defer func() { _ = sourceFile.Close() }()
	temp, err := os.CreateTemp(filepath.Dir(destination), ".sub2api-backup-*")
	if err != nil {
		return err
	}
	tempPath := temp.Name()
	defer func() { _ = os.Remove(tempPath) }()
	if err := temp.Chmod(mode.Perm()); err != nil {
		_ = temp.Close()
		return err
	}
	if _, err := io.Copy(temp, sourceFile); err != nil {
		_ = temp.Close()
		return err
	}
	if err := temp.Sync(); err != nil {
		_ = temp.Close()
		return err
	}
	if err := temp.Close(); err != nil {
		return err
	}
	if err := rename(tempPath, destination); err != nil {
		return err
	}
	return syncDirectory(filepath.Dir(destination))
}

func replaceExecutableWithBackup(executable, staged string, rename func(string, string) error) error {
	info, err := os.Stat(executable)
	if err != nil {
		return fmt.Errorf("stat current executable: %w", err)
	}
	if err := syncPath(staged); err != nil {
		return fmt.Errorf("sync staged executable: %w", err)
	}
	backup := executable + ".backup"
	if err := copyExecutableDurably(executable, backup, info.Mode(), rename); err != nil {
		return fmt.Errorf("create durable backup: %w", err)
	}
	// This is the only operation that changes the live executable path. On
	// supported platforms it atomically replaces an existing regular file.
	if err := rename(staged, executable); err != nil {
		return fmt.Errorf("atomic executable replacement: %w", err)
	}
	if err := syncDirectory(filepath.Dir(executable)); err != nil {
		return fmt.Errorf("sync executable directory: %w", err)
	}
	return nil
}

func writeVerifiedReleaseBinary(destPath string, size int64, reader io.Reader) error {
	const maxBinarySize = 500 * 1024 * 1024
	if size <= 0 || size > maxBinarySize {
		return fmt.Errorf("invalid binary size: %d bytes (max %d)", size, maxBinarySize)
	}

	temp, err := os.CreateTemp(filepath.Dir(destPath), ".sub2api-extract-*")
	if err != nil {
		return err
	}
	tempPath := temp.Name()
	defer func() { _ = os.Remove(tempPath) }()

	written, copyErr := io.Copy(temp, io.LimitReader(reader, maxBinarySize+1))
	closeErr := temp.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	if written != size || written > maxBinarySize {
		return fmt.Errorf("binary size mismatch: expected %d bytes, wrote %d", size, written)
	}
	return os.Rename(tempPath, destPath)
}

func canonicalArchiveMember(name string) (string, error) {
	if name == "" || strings.Contains(name, "\\") || strings.ContainsRune(name, '\x00') || strings.HasPrefix(name, "/") {
		return "", fmt.Errorf("unsafe archive member path: %q", name)
	}
	normalized := strings.TrimSuffix(name, "/")
	if normalized == "" || pathpkg.Clean(normalized) != normalized || strings.HasPrefix(normalized, "../") {
		return "", fmt.Errorf("unsafe archive member path: %q", name)
	}
	first := strings.SplitN(normalized, "/", 2)[0]
	if strings.Contains(first, ":") {
		return "", fmt.Errorf("drive-qualified archive member path: %q", name)
	}
	return normalized, nil
}

func accountArchiveMember(count *int, total *int64, canonical string, size int64, seen map[string]struct{}) error {
	*count++
	if *count > maxArchiveMembers {
		return fmt.Errorf("too many archive members: %d (max %d)", *count, maxArchiveMembers)
	}
	if _, duplicate := seen[canonical]; duplicate {
		return fmt.Errorf("duplicate archive member after canonicalization %q", canonical)
	}
	seen[canonical] = struct{}{}
	if size < 0 || *total > maxArchiveUncompressedBytes-size {
		return fmt.Errorf("archive uncompressed size exceeds %d bytes", maxArchiveUncompressedBytes)
	}
	*total += size
	return nil
}

func binaryLikeMember(canonical, expected string) bool {
	return pathpkg.Base(canonical) == expected && canonical != expected
}

func validateZipContainerEnd(archivePath string) error {
	file, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer func() { _ = file.Close() }()
	info, err := file.Stat()
	if err != nil {
		return err
	}
	const minimumEndRecord = int64(22)
	const maximumComment = int64(65535)
	if info.Size() < minimumEndRecord {
		return fmt.Errorf("ZIP end record missing")
	}
	window := minimumEndRecord + maximumComment
	if info.Size() < window {
		window = info.Size()
	}
	start := info.Size() - window
	tail := make([]byte, int(window))
	if _, err := file.ReadAt(tail, start); err != nil {
		return err
	}
	for offset := len(tail) - int(minimumEndRecord); offset >= 0; offset-- {
		if !bytes.Equal(tail[offset:offset+4], []byte{'P', 'K', 5, 6}) {
			continue
		}
		commentLength := int(tail[offset+20]) | int(tail[offset+21])<<8
		if start+int64(offset)+minimumEndRecord+int64(commentLength) == info.Size() {
			return nil
		}
	}
	return fmt.Errorf("ZIP has data outside its end record")
}

func (s *UpdateService) extractBinary(archivePath, destPath string) error {
	const maxBinarySize = 500 * 1024 * 1024
	archiveName := strings.ToLower(archivePath)
	expectedBinary := "sub2api"
	isZip := strings.HasSuffix(archiveName, ".zip")
	if isZip {
		expectedBinary = "sub2api.exe"
	} else if !strings.HasSuffix(archiveName, ".tar.gz") {
		return fmt.Errorf("unsupported archive format: %s", filepath.Base(archivePath))
	}

	if isZip {
		if err := validateZipContainerEnd(archivePath); err != nil {
			return err
		}
		reader, err := zip.OpenReader(archivePath)
		if err != nil {
			return err
		}
		defer func() { _ = reader.Close() }()
		seen := make(map[string]struct{}, len(reader.File))
		count := 0
		var total int64
		var binary []byte
		matches := 0
		for _, member := range reader.File {
			canonical, err := canonicalArchiveMember(member.Name)
			if err != nil {
				return err
			}
			modeType := member.FileInfo().Mode() & os.ModeType
			isDirectory := member.FileInfo().IsDir()
			if isDirectory {
				if modeType != 0 && modeType != os.ModeDir {
					return fmt.Errorf("unsupported archive member type for %q", member.Name)
				}
				if err := accountArchiveMember(&count, &total, canonical, 0, seen); err != nil {
					return err
				}
				continue
			}
			if modeType != 0 {
				return fmt.Errorf("unsupported archive member type for %q", member.Name)
			}
			if binaryLikeMember(canonical, expectedBinary) {
				return fmt.Errorf("nested binary-like archive member %q", member.Name)
			}
			if member.UncompressedSize64 > uint64(maxArchiveUncompressedBytes) {
				return fmt.Errorf("archive member too large: %q", member.Name)
			}
			if err := accountArchiveMember(&count, &total, canonical, int64(member.UncompressedSize64), seen); err != nil {
				return err
			}
			stream, err := member.Open()
			if err != nil {
				return err
			}
			data, readErr := io.ReadAll(io.LimitReader(stream, int64(member.UncompressedSize64)+1))
			closeErr := stream.Close()
			if readErr != nil {
				return fmt.Errorf("read zip member %q: %w", member.Name, readErr)
			}
			if closeErr != nil {
				return fmt.Errorf("close zip member %q: %w", member.Name, closeErr)
			}
			if uint64(len(data)) != member.UncompressedSize64 {
				return fmt.Errorf("archive member size mismatch for %q", member.Name)
			}
			if canonical == expectedBinary {
				matches++
				if matches > 1 {
					return fmt.Errorf("expected exactly one binary in archive, found %d", matches)
				}
				if len(data) == 0 || len(data) > maxBinarySize {
					return fmt.Errorf("invalid binary size: %d bytes (max %d)", len(data), maxBinarySize)
				}
				binary = data
			}
		}
		if matches != 1 {
			return fmt.Errorf("expected exactly one binary %q in archive, found %d", expectedBinary, matches)
		}
		return writeVerifiedReleaseBinary(destPath, int64(len(binary)), bytes.NewReader(binary))
	}

	file, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer func() { _ = file.Close() }()
	buffered := bufio.NewReader(file)
	gzr, err := gzip.NewReader(buffered)
	if err != nil {
		return err
	}
	defer func() { _ = gzr.Close() }()
	gzr.Multistream(false)

	tr := tar.NewReader(gzr)
	seen := make(map[string]struct{})
	count := 0
	var total int64
	var binary []byte
	matches := 0
	for {
		hdr, nextErr := tr.Next()
		if nextErr == io.EOF {
			break
		}
		if nextErr != nil {
			return nextErr
		}
		canonical, err := canonicalArchiveMember(hdr.Name)
		if err != nil {
			return err
		}
		if hdr.Typeflag != tar.TypeDir && hdr.Typeflag != tar.TypeReg && hdr.Typeflag != tar.TypeRegA {
			return fmt.Errorf("unsupported archive member type for %q", hdr.Name)
		}
		if hdr.Typeflag != tar.TypeDir && binaryLikeMember(canonical, expectedBinary) {
			return fmt.Errorf("nested binary-like archive member %q", hdr.Name)
		}
		memberSize := hdr.Size
		if hdr.Typeflag == tar.TypeDir {
			memberSize = 0
		}
		if err := accountArchiveMember(&count, &total, canonical, memberSize, seen); err != nil {
			return err
		}
		if hdr.Typeflag == tar.TypeDir {
			continue
		}
		data, readErr := io.ReadAll(io.LimitReader(tr, hdr.Size+1))
		if readErr != nil {
			return readErr
		}
		if int64(len(data)) != hdr.Size {
			return fmt.Errorf("archive member size mismatch for %q", hdr.Name)
		}
		if canonical == expectedBinary {
			matches++
			if matches > 1 {
				return fmt.Errorf("expected exactly one binary in archive, found %d", matches)
			}
			if len(data) == 0 || len(data) > maxBinarySize {
				return fmt.Errorf("invalid binary size: %d bytes (max %d)", len(data), maxBinarySize)
			}
			binary = data
		}
	}
	// tar.Reader stops after the TAR EOF blocks. The only valid remaining
	// decompressed bytes are bounded zero padding from the TAR record layout.
	trailing := int64(0)
	buffer := make([]byte, 64*1024)
	for {
		n, readErr := gzr.Read(buffer)
		if n > 0 {
			trailing += int64(n)
			if trailing > maxArchiveTrailingBytes {
				return fmt.Errorf("excessive decompressed data after tar EOF")
			}
			for _, value := range buffer[:n] {
				if value != 0 {
					return fmt.Errorf("non-zero decompressed data after tar EOF")
				}
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return fmt.Errorf("validate gzip trailer: %w", readErr)
		}
	}
	if _, readErr := buffered.ReadByte(); readErr == nil {
		return fmt.Errorf("data after first gzip member")
	} else if readErr != io.EOF {
		return fmt.Errorf("validate bytes after gzip member: %w", readErr)
	}
	if matches != 1 {
		return fmt.Errorf("expected exactly one binary %q in archive, found %d", expectedBinary, matches)
	}
	return writeVerifiedReleaseBinary(destPath, int64(len(binary)), bytes.NewReader(binary))
}

func (s *UpdateService) getFromCache(ctx context.Context) (*UpdateInfo, error) {
	data, err := s.cache.GetUpdateInfo(ctx)
	if err != nil {
		return nil, err
	}

	var cached struct {
		Latest      string       `json:"latest"`
		ReleaseInfo *ReleaseInfo `json:"release_info"`
		Timestamp   int64        `json:"timestamp"`
	}
	if err := json.Unmarshal([]byte(data), &cached); err != nil {
		return nil, err
	}

	if time.Now().Unix()-cached.Timestamp > updateCacheTTL {
		return nil, fmt.Errorf("cache expired")
	}

	return &UpdateInfo{
		CurrentVersion: s.currentVersion,
		LatestVersion:  cached.Latest,
		HasUpdate:      compareVersions(s.currentVersion, cached.Latest) < 0,
		ReleaseInfo:    cached.ReleaseInfo,
		Cached:         true,
		BuildType:      s.buildType,
	}, nil
}

func (s *UpdateService) saveToCache(ctx context.Context, info *UpdateInfo) {
	cacheData := struct {
		Latest      string       `json:"latest"`
		ReleaseInfo *ReleaseInfo `json:"release_info"`
		Timestamp   int64        `json:"timestamp"`
	}{
		Latest:      info.LatestVersion,
		ReleaseInfo: info.ReleaseInfo,
		Timestamp:   time.Now().Unix(),
	}

	data, _ := json.Marshal(cacheData)
	_ = s.cache.SetUpdateInfo(ctx, string(data), time.Duration(updateCacheTTL)*time.Second)
}

var ruReleaseVersionPattern = regexp.MustCompile(`^v?([0-9]+)\.([0-9]+)\.([0-9]+)(?:-ru\.([0-9]+))?$`)

// compareVersions compares official upstream versions and RU fork revisions.
// A plain upstream version is treated as RU revision zero, so an installed
// official 0.1.169 binary can upgrade to 0.1.169-ru.1 through the panel.
// Malformed release tags are never considered newer than a valid install.
func compareVersions(current, latest string) int {
	currentParts, currentValid := parseVersion(current)
	latestParts, latestValid := parseVersion(latest)

	switch {
	case currentValid && !latestValid:
		return 1
	case !currentValid && latestValid:
		return -1
	case !currentValid && !latestValid:
		return 0
	}

	for i := 0; i < len(currentParts); i++ {
		if currentParts[i] < latestParts[i] {
			return -1
		}
		if currentParts[i] > latestParts[i] {
			return 1
		}
	}
	return 0
}

func parseVersion(v string) ([4]int, bool) {
	matches := ruReleaseVersionPattern.FindStringSubmatch(strings.TrimSpace(v))
	if matches == nil {
		return [4]int{}, false
	}

	result := [4]int{}
	for i := 1; i <= 3; i++ {
		parsed, err := strconv.Atoi(matches[i])
		if err != nil {
			return [4]int{}, false
		}
		result[i-1] = parsed
	}

	if matches[4] != "" {
		revision, err := strconv.Atoi(matches[4])
		if err != nil || revision < 1 {
			return [4]int{}, false
		}
		result[3] = revision
	}

	return result, true
}
