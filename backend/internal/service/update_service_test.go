//go:build unit

package service

import (
	"archive/tar"
	"archive/zip"
	"bytes"
	"compress/gzip"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type updateServiceCacheStub struct {
	data string
}

func (s *updateServiceCacheStub) GetUpdateInfo(context.Context) (string, error) {
	if s.data == "" {
		return "", errors.New("cache miss")
	}
	return s.data, nil
}

func (s *updateServiceCacheStub) SetUpdateInfo(_ context.Context, data string, _ time.Duration) error {
	s.data = data
	return nil
}

type updateServiceGitHubClientStub struct {
	release        *GitHubRelease
	recentReleases []*GitHubRelease
	recentErr      error
}

func (s *updateServiceGitHubClientStub) FetchLatestRelease(context.Context, string) (*GitHubRelease, error) {
	return s.release, nil
}

func (s *updateServiceGitHubClientStub) FetchRecentReleases(context.Context, string, int) ([]*GitHubRelease, error) {
	return s.recentReleases, s.recentErr
}

func (s *updateServiceGitHubClientStub) DownloadFile(context.Context, string, string, int64) error {
	panic("DownloadFile should not be called when no update is available")
}

func (s *updateServiceGitHubClientStub) FetchChecksumFile(context.Context, string) ([]byte, error) {
	panic("FetchChecksumFile should not be called when no update is available")
}

func TestUpdateServicePerformUpdateNoUpdateReturnsSentinel(t *testing.T) {
	svc := NewUpdateService(
		&updateServiceCacheStub{},
		&updateServiceGitHubClientStub{
			release: &GitHubRelease{
				TagName: "v0.1.132",
				Name:    "v0.1.132",
			},
		},
		"0.1.132",
		"release",
	)

	err := svc.PerformUpdate(context.Background())

	require.Error(t, err)
	require.True(t, errors.Is(err, ErrNoUpdateAvailable))
	require.ErrorIs(t, err, ErrNoUpdateAvailable)
}

func TestUpdateServiceCheckUpdateOffersFirstRURevisionToOfficialBaseline(t *testing.T) {
	svc := NewUpdateService(
		&updateServiceCacheStub{},
		&updateServiceGitHubClientStub{
			release: &GitHubRelease{
				TagName: "v0.1.169-ru.1",
				Name:    "Sub2API RU 0.1.169-ru.1",
			},
		},
		"0.1.169",
		"release",
	)

	info, err := svc.CheckUpdate(context.Background(), true)

	require.NoError(t, err)
	require.True(t, info.HasUpdate)
	require.Equal(t, "0.1.169", info.CurrentVersion)
	require.Equal(t, "0.1.169-ru.1", info.LatestVersion)
}

func newRollbackTestService(current string, releases []*GitHubRelease) *UpdateService {
	return NewUpdateService(
		&updateServiceCacheStub{},
		&updateServiceGitHubClientStub{recentReleases: releases},
		current,
		"release",
	)
}

func TestUpdateServiceListRollbackVersionsFiltersAndCaps(t *testing.T) {
	releases := []*GitHubRelease{
		{TagName: "v0.1.148", PublishedAt: "2026-07-09T00:00:00Z"},                       // newer than current: excluded
		{TagName: "v0.1.147", PublishedAt: "2026-07-08T00:00:00Z"},                       // current: excluded
		{TagName: "v0.1.146-rc1", PublishedAt: "2026-07-07T12:00:00Z", Prerelease: true}, // prerelease: excluded
		{TagName: "v0.1.146", PublishedAt: "2026-07-07T00:00:00Z"},
		{TagName: "v0.1.145", PublishedAt: "2026-07-06T00:00:00Z", Draft: true}, // draft: excluded
		{TagName: "v0.1.144", PublishedAt: "2026-07-05T00:00:00Z"},
		{TagName: "v0.1.144", PublishedAt: "2026-07-05T00:00:00Z"}, // duplicate: excluded
		{TagName: "v0.1.143", PublishedAt: "2026-07-04T00:00:00Z"},
		{TagName: "v0.1.142", PublishedAt: "2026-07-03T00:00:00Z"}, // beyond cap of 3: excluded
	}
	svc := newRollbackTestService("0.1.147", releases)

	versions, err := svc.ListRollbackVersions(context.Background())

	require.NoError(t, err)
	require.Len(t, versions, 3)
	require.Equal(t, "0.1.146", versions[0].Version)
	require.Equal(t, "0.1.144", versions[1].Version)
	require.Equal(t, "0.1.143", versions[2].Version)
}

func TestUpdateServiceListRollbackVersionsSortsUnorderedInput(t *testing.T) {
	releases := []*GitHubRelease{
		{TagName: "v0.1.144"},
		{TagName: "v0.1.146"},
		{TagName: "v0.1.145"},
	}
	svc := newRollbackTestService("0.1.147", releases)

	versions, err := svc.ListRollbackVersions(context.Background())

	require.NoError(t, err)
	require.Len(t, versions, 3)
	require.Equal(t, "0.1.146", versions[0].Version)
	require.Equal(t, "0.1.145", versions[1].Version)
	require.Equal(t, "0.1.144", versions[2].Version)
}

func TestUpdateServiceListRollbackVersionsSkipsMalformedTags(t *testing.T) {
	releases := []*GitHubRelease{
		{TagName: "not-a-version"},
		{TagName: "v0.1.168-rc.1"},
		{TagName: "v0.1.168-ru.0"},
		{TagName: "v0.1.168-ru.2"},
	}
	svc := newRollbackTestService("0.1.169-ru.1", releases)

	versions, err := svc.ListRollbackVersions(context.Background())

	require.NoError(t, err)
	require.Len(t, versions, 1)
	require.Equal(t, "0.1.168-ru.2", versions[0].Version)
}

func TestUpdateServiceListRollbackVersionsEmptyWhenNoneOlder(t *testing.T) {
	releases := []*GitHubRelease{
		{TagName: "v0.1.147"},
		{TagName: "v0.1.148"},
	}
	svc := newRollbackTestService("0.1.147", releases)

	versions, err := svc.ListRollbackVersions(context.Background())

	require.NoError(t, err)
	require.Empty(t, versions)
}

func TestUpdateServiceListRollbackVersionsPropagatesFetchError(t *testing.T) {
	svc := NewUpdateService(
		&updateServiceCacheStub{},
		&updateServiceGitHubClientStub{recentErr: errors.New("github unavailable")},
		"0.1.147",
		"release",
	)

	_, err := svc.ListRollbackVersions(context.Background())

	require.Error(t, err)
	require.Contains(t, err.Error(), "github unavailable")
}

func TestUpdateServiceRollbackToVersionRejectsDisallowedTargets(t *testing.T) {
	releases := []*GitHubRelease{
		{TagName: "v0.1.148"},
		{TagName: "v0.1.147"},
		{TagName: "v0.1.146"},
		{TagName: "v0.1.145"},
		{TagName: "v0.1.144"},
		{TagName: "v0.1.143"},
		{TagName: "v0.1.142"},
	}
	svc := newRollbackTestService("0.1.147", releases)

	for _, target := range []string{
		"",         // empty
		"0.1.147",  // current version
		"v0.1.147", // current version with prefix
		"0.1.148",  // newer than current
		"0.1.142",  // older than the 3 most recent
		"9.9.9",    // nonexistent
	} {
		err := svc.RollbackToVersion(context.Background(), target)
		require.ErrorIs(t, err, ErrRollbackVersionNotAllowed, "target %q should be rejected", target)
	}
}

func TestUpdateServiceRollbackToVersionAcceptsVPrefix(t *testing.T) {
	// No platform asset in the release: the target passes the allowlist check
	// and fails later at asset lookup, proving the version itself was accepted.
	releases := []*GitHubRelease{
		{TagName: "v0.1.147"},
		{TagName: "v0.1.146"},
	}
	svc := newRollbackTestService("0.1.147", releases)

	err := svc.RollbackToVersion(context.Background(), "v0.1.146")

	require.Error(t, err)
	require.NotErrorIs(t, err, ErrRollbackVersionNotAllowed)
	require.Contains(t, err.Error(), "expected exactly one archive")
}

func TestSelectReleaseAssetsRequiresExactVersionedArchiveAndChecksum(t *testing.T) {
	version := "0.1.175-ru.2"
	exactArchive := "sub2api_0.1.175-ru.2_linux_amd64.tar.gz"
	assets := []Asset{
		{Name: exactArchive + ".evil", DownloadURL: "https://github.com/YLeon2007/sub2api/releases/download/v0.1.175-ru.2/confusable"},
		{Name: exactArchive, DownloadURL: "https://github.com/YLeon2007/sub2api/releases/download/v0.1.175-ru.2/" + exactArchive},
		{Name: "checksums.txt", DownloadURL: "https://github.com/YLeon2007/sub2api/releases/download/v0.1.175-ru.2/checksums.txt"},
	}

	archive, checksum, err := selectReleaseAssets(version, "linux", "amd64", assets)

	require.NoError(t, err)
	require.Equal(t, exactArchive, archive.Name)
	require.Equal(t, "checksums.txt", checksum.Name)

	_, _, err = selectReleaseAssets(version, "linux", "amd64", assets[:2])
	require.ErrorContains(t, err, "checksums.txt")

	_, _, err = selectReleaseAssets(version, "linux", "amd64", append(assets, assets[1]))
	require.ErrorContains(t, err, "exactly one archive")

	_, _, err = selectReleaseAssets(version, "linux", "amd64", append(assets, assets[2]))
	require.ErrorContains(t, err, "exactly one checksums.txt")
}

func TestExpectedChecksumForFileRequiresOneExactBasename(t *testing.T) {
	name := "sub2api_0.1.175-ru.2_linux_amd64.tar.gz"
	digest := strings.Repeat("a", 64)

	got, err := expectedChecksumForFile([]byte(digest+"  "+name+"\n"), name)
	require.NoError(t, err)
	require.Equal(t, digest, got)

	_, err = expectedChecksumForFile([]byte(digest+"  "+name+".evil\n"), name)
	require.ErrorContains(t, err, "exactly one checksum")

	_, err = expectedChecksumForFile([]byte(digest+"  "+name+"\n"+digest+"  "+name+"\n"), name)
	require.ErrorContains(t, err, "exactly one checksum")

	_, err = expectedChecksumForFile([]byte("not-a-sha256  "+name+"\n"), name)
	require.ErrorContains(t, err, "invalid SHA-256")
}

func TestExtractBinarySupportsZipAndRequiresExactlyOneBinary(t *testing.T) {
	t.Parallel()
	svc := &UpdateService{}

	writeZip := func(t *testing.T, members map[string][]byte) string {
		t.Helper()
		path := filepath.Join(t.TempDir(), "release.zip")
		file, err := os.Create(path)
		require.NoError(t, err)
		archive := zip.NewWriter(file)
		for name, data := range members {
			member, createErr := archive.Create(name)
			require.NoError(t, createErr)
			_, writeErr := member.Write(data)
			require.NoError(t, writeErr)
		}
		require.NoError(t, archive.Close())
		require.NoError(t, file.Close())
		return path
	}

	archive := writeZip(t, map[string][]byte{"sub2api.exe": []byte("WINDOWS-BINARY"), "README.md": []byte("docs")})
	dest := filepath.Join(t.TempDir(), "sub2api.exe")
	require.NoError(t, svc.extractBinary(archive, dest))
	got, err := os.ReadFile(dest)
	require.NoError(t, err)
	require.Equal(t, []byte("WINDOWS-BINARY"), got)

	duplicate := writeExtractionTestZip(t, []extractionArchiveMember{
		{name: "sub2api.exe", data: []byte("FIRST")},
		{name: "sub2api.exe", data: []byte("SECOND")},
	})
	err = svc.extractBinary(duplicate, filepath.Join(t.TempDir(), "duplicate.exe"))
	require.ErrorContains(t, err, "duplicate archive member")
}

func TestExtractBinaryRequiresExactlyOneTarBinary(t *testing.T) {
	t.Parallel()
	var raw bytes.Buffer
	gz := gzip.NewWriter(&raw)
	archive := tar.NewWriter(gz)
	for _, member := range []struct {
		name string
		data []byte
	}{{"sub2api", []byte("FIRST")}, {"sub2api", []byte("SECOND")}} {
		require.NoError(t, archive.WriteHeader(&tar.Header{Name: member.name, Mode: 0o755, Size: int64(len(member.data)), Typeflag: tar.TypeReg}))
		_, err := archive.Write(member.data)
		require.NoError(t, err)
	}
	require.NoError(t, archive.Close())
	require.NoError(t, gz.Close())

	path := filepath.Join(t.TempDir(), "release.tar.gz")
	require.NoError(t, os.WriteFile(path, raw.Bytes(), 0o600))
	err := (&UpdateService{}).extractBinary(path, filepath.Join(t.TempDir(), "sub2api"))
	require.ErrorContains(t, err, "duplicate archive member")
}

type extractionArchiveMember struct {
	name     string
	data     []byte
	mode     os.FileMode
	tarType  byte
	linkName string
}

func writeExtractionTestZip(t *testing.T, members []extractionArchiveMember) string {
	t.Helper()
	archivePath := filepath.Join(t.TempDir(), "release.zip")
	file, err := os.Create(archivePath)
	require.NoError(t, err)
	archive := zip.NewWriter(file)
	for _, item := range members {
		header := &zip.FileHeader{Name: item.name, Method: zip.Deflate}
		mode := item.mode
		if mode == 0 {
			mode = 0o644
		}
		header.SetMode(mode)
		member, createErr := archive.CreateHeader(header)
		require.NoError(t, createErr)
		_, writeErr := member.Write(item.data)
		require.NoError(t, writeErr)
	}
	require.NoError(t, archive.Close())
	require.NoError(t, file.Close())
	return archivePath
}

func writeExtractionTestTar(t *testing.T, members []extractionArchiveMember) string {
	t.Helper()
	var raw bytes.Buffer
	gz := gzip.NewWriter(&raw)
	archive := tar.NewWriter(gz)
	for _, item := range members {
		typeFlag := item.tarType
		if typeFlag == 0 {
			typeFlag = tar.TypeReg
		}
		name := item.name
		if typeFlag == tar.TypeDir && !strings.HasSuffix(name, "/") {
			name += "/"
		}
		header := &tar.Header{
			Name:     name,
			Mode:     0o755,
			Size:     int64(len(item.data)),
			Typeflag: typeFlag,
			Linkname: item.linkName,
		}
		if typeFlag != tar.TypeReg && typeFlag != tar.TypeRegA {
			header.Size = 0
		}
		require.NoError(t, archive.WriteHeader(header))
		if header.Size > 0 {
			_, err := archive.Write(item.data)
			require.NoError(t, err)
		}
	}
	require.NoError(t, archive.Close())
	require.NoError(t, gz.Close())
	archivePath := filepath.Join(t.TempDir(), "release.tar.gz")
	require.NoError(t, os.WriteFile(archivePath, raw.Bytes(), 0o600))
	return archivePath
}

func TestExtractBinaryRejectsAmbiguousOrUnsupportedZipMembersBeforeDestinationWrite(t *testing.T) {
	t.Parallel()
	cases := map[string][]extractionArchiveMember{
		"duplicate non-binary path": {
			{name: "sub2api.exe", data: []byte("BINARY")},
			{name: "README.md", data: []byte("FIRST")},
			{name: "README.md", data: []byte("SECOND")},
		},
		"nested binary path": {
			{name: "nested/sub2api.exe", data: []byte("BINARY")},
		},
		"symbolic link": {
			{name: "sub2api.exe", data: []byte("BINARY")},
			{name: "docs-link", data: []byte("README.md"), mode: os.ModeSymlink | 0o777},
		},
		"absolute path": {
			{name: "sub2api.exe", data: []byte("BINARY")},
			{name: "/README.md", data: []byte("docs")},
		},
		"traversal path": {
			{name: "sub2api.exe", data: []byte("BINARY")},
			{name: "docs/../README.md", data: []byte("docs")},
		},
	}
	for name, members := range cases {
		name, members := name, members
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			archivePath := writeExtractionTestZip(t, members)
			destPath := filepath.Join(t.TempDir(), "sub2api.exe")
			require.NoError(t, os.WriteFile(destPath, []byte("ORIGINAL"), 0o700))
			err := (&UpdateService{}).extractBinary(archivePath, destPath)
			require.Error(t, err)
			got, readErr := os.ReadFile(destPath)
			require.NoError(t, readErr)
			require.Equal(t, []byte("ORIGINAL"), got)
		})
	}
}

func TestExtractBinaryRejectsAmbiguousOrUnsupportedTarMembersBeforeDestinationWrite(t *testing.T) {
	t.Parallel()
	cases := map[string][]extractionArchiveMember{
		"duplicate non-binary path": {
			{name: "sub2api", data: []byte("BINARY")},
			{name: "README.md", data: []byte("FIRST")},
			{name: "README.md", data: []byte("SECOND")},
		},
		"nested binary path": {
			{name: "nested/sub2api", data: []byte("BINARY")},
		},
		"symbolic link": {
			{name: "sub2api", data: []byte("BINARY")},
			{name: "docs-link", tarType: tar.TypeSymlink, linkName: "README.md"},
		},
		"hard link": {
			{name: "sub2api", data: []byte("BINARY")},
			{name: "docs-link", tarType: tar.TypeLink, linkName: "README.md"},
		},
		"fifo": {
			{name: "sub2api", data: []byte("BINARY")},
			{name: "pipe", tarType: tar.TypeFifo},
		},
		"absolute path": {
			{name: "sub2api", data: []byte("BINARY")},
			{name: "/README.md", data: []byte("docs")},
		},
		"traversal path": {
			{name: "sub2api", data: []byte("BINARY")},
			{name: "docs/../README.md", data: []byte("docs")},
		},
	}
	for name, members := range cases {
		name, members := name, members
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			archivePath := writeExtractionTestTar(t, members)
			destPath := filepath.Join(t.TempDir(), "sub2api")
			require.NoError(t, os.WriteFile(destPath, []byte("ORIGINAL"), 0o700))
			err := (&UpdateService{}).extractBinary(archivePath, destPath)
			require.Error(t, err)
			got, readErr := os.ReadFile(destPath)
			require.NoError(t, readErr)
			require.Equal(t, []byte("ORIGINAL"), got)
		})
	}
}

func TestExtractBinaryRejectsUnknownArchiveFormatBeforeDestinationWrite(t *testing.T) {
	t.Parallel()
	archivePath := filepath.Join(t.TempDir(), "release.bin")
	require.NoError(t, os.WriteFile(archivePath, []byte("UNRECOGNIZED"), 0o600))
	destPath := filepath.Join(t.TempDir(), "sub2api")
	require.NoError(t, os.WriteFile(destPath, []byte("ORIGINAL"), 0o700))

	err := (&UpdateService{}).extractBinary(archivePath, destPath)
	require.ErrorContains(t, err, "unsupported archive format")
	got, readErr := os.ReadFile(destPath)
	require.NoError(t, readErr)
	require.Equal(t, []byte("ORIGINAL"), got)
}

func TestExtractBinaryAllowsSafeArchiveDirectories(t *testing.T) {
	t.Parallel()
	zipPath := writeExtractionTestZip(t, []extractionArchiveMember{
		{name: "docs/", mode: os.ModeDir | 0o755},
		{name: "sub2api.exe", data: []byte("ZIP-BINARY")},
	})
	zipDest := filepath.Join(t.TempDir(), "sub2api.exe")
	require.NoError(t, (&UpdateService{}).extractBinary(zipPath, zipDest))
	zipData, err := os.ReadFile(zipDest)
	require.NoError(t, err)
	require.Equal(t, []byte("ZIP-BINARY"), zipData)

	tarPath := writeExtractionTestTar(t, []extractionArchiveMember{
		{name: "docs", tarType: tar.TypeDir},
		{name: "sub2api", data: []byte("TAR-BINARY")},
	})
	tarDest := filepath.Join(t.TempDir(), "sub2api")
	require.NoError(t, (&UpdateService{}).extractBinary(tarPath, tarDest))
	tarData, err := os.ReadFile(tarDest)
	require.NoError(t, err)
	require.Equal(t, []byte("TAR-BINARY"), tarData)
}

func TestExtractBinaryRejectsCorruptOrAmbiguousCompleteArchives(t *testing.T) {
	t.Parallel()
	svc := &UpdateService{}

	t.Run("corrupt gzip trailer", func(t *testing.T) {
		path := writeExtractionTestTar(t, []extractionArchiveMember{{name: "sub2api", data: []byte("BINARY")}})
		raw, err := os.ReadFile(path)
		require.NoError(t, err)
		require.Greater(t, len(raw), 8)
		raw[len(raw)-8] ^= 0xff
		require.NoError(t, os.WriteFile(path, raw, 0o600))
		dest := filepath.Join(t.TempDir(), "sub2api")
		require.NoError(t, os.WriteFile(dest, []byte("ORIGINAL"), 0o700))
		require.Error(t, svc.extractBinary(path, dest))
		got, readErr := os.ReadFile(dest)
		require.NoError(t, readErr)
		require.Equal(t, []byte("ORIGINAL"), got)
	})

	for name, members := range map[string][]extractionArchiveMember{
		"canonical directory collision": {
			{name: "sub2api", data: []byte("BINARY")},
			{name: "docs", tarType: tar.TypeDir},
			{name: "docs", data: []byte("FILE")},
		},
		"drive-qualified path": {
			{name: "sub2api", data: []byte("BINARY")},
			{name: "C:/payload", data: []byte("DATA")},
		},
		"root and nested binary": {
			{name: "sub2api", data: []byte("BINARY")},
			{name: "nested/sub2api", data: []byte("SECOND")},
		},
	} {
		name, members := name, members
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			path := writeExtractionTestTar(t, members)
			dest := filepath.Join(t.TempDir(), "sub2api")
			require.NoError(t, os.WriteFile(dest, []byte("ORIGINAL"), 0o700))
			require.Error(t, svc.extractBinary(path, dest))
			got, err := os.ReadFile(dest)
			require.NoError(t, err)
			require.Equal(t, []byte("ORIGINAL"), got)
		})
	}
}

func TestExtractBinaryRejectsContentOutsideArchiveContainer(t *testing.T) {
	t.Parallel()
	svc := &UpdateService{}

	t.Run("zip suffix", func(t *testing.T) {
		path := writeExtractionTestZip(t, []extractionArchiveMember{{name: "sub2api.exe", data: []byte("BINARY")}})
		file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0)
		require.NoError(t, err)
		_, err = file.Write([]byte("HIDDEN-ZIP-SUFFIX"))
		require.NoError(t, err)
		require.NoError(t, file.Close())
		dest := filepath.Join(t.TempDir(), "sub2api.exe")
		require.NoError(t, os.WriteFile(dest, []byte("ORIGINAL"), 0o700))
		require.Error(t, svc.extractBinary(path, dest))
		got, readErr := os.ReadFile(dest)
		require.NoError(t, readErr)
		require.Equal(t, []byte("ORIGINAL"), got)
	})

	t.Run("non-zero decompressed tar tail", func(t *testing.T) {
		path := writeExtractionTestTar(t, []extractionArchiveMember{{name: "sub2api", data: []byte("BINARY")}})
		raw, err := os.ReadFile(path)
		require.NoError(t, err)
		reader, err := gzip.NewReader(bytes.NewReader(raw))
		require.NoError(t, err)
		payload, err := io.ReadAll(reader)
		require.NoError(t, err)
		require.NoError(t, reader.Close())
		var rebuilt bytes.Buffer
		writer := gzip.NewWriter(&rebuilt)
		_, err = writer.Write(append(payload, []byte("HIDDEN-TAR-TAIL")...))
		require.NoError(t, err)
		require.NoError(t, writer.Close())
		require.NoError(t, os.WriteFile(path, rebuilt.Bytes(), 0o600))
		dest := filepath.Join(t.TempDir(), "sub2api")
		require.NoError(t, os.WriteFile(dest, []byte("ORIGINAL"), 0o700))
		require.Error(t, svc.extractBinary(path, dest))
		got, readErr := os.ReadFile(dest)
		require.NoError(t, readErr)
		require.Equal(t, []byte("ORIGINAL"), got)
	})

	t.Run("concatenated gzip member", func(t *testing.T) {
		path := writeExtractionTestTar(t, []extractionArchiveMember{{name: "sub2api", data: []byte("BINARY")}})
		raw, err := os.ReadFile(path)
		require.NoError(t, err)
		var second bytes.Buffer
		writer := gzip.NewWriter(&second)
		_, err = writer.Write([]byte("SECOND-GZIP-MEMBER"))
		require.NoError(t, err)
		require.NoError(t, writer.Close())
		require.NoError(t, os.WriteFile(path, append(raw, second.Bytes()...), 0o600))
		dest := filepath.Join(t.TempDir(), "sub2api")
		require.NoError(t, os.WriteFile(dest, []byte("ORIGINAL"), 0o700))
		require.Error(t, svc.extractBinary(path, dest))
		got, readErr := os.ReadFile(dest)
		require.NoError(t, readErr)
		require.Equal(t, []byte("ORIGINAL"), got)
	})
}

func TestExtractBinaryEnforcesArchiveMemberBudget(t *testing.T) {
	t.Parallel()
	const memberLimit = 1024
	members := make([]extractionArchiveMember, 0, memberLimit+2)
	members = append(members, extractionArchiveMember{name: "sub2api", data: []byte("BINARY")})
	for index := 0; index <= memberLimit; index++ {
		members = append(members, extractionArchiveMember{name: fmt.Sprintf("docs/%04d", index), data: nil})
	}
	path := writeExtractionTestTar(t, members)
	dest := filepath.Join(t.TempDir(), "sub2api")
	require.NoError(t, os.WriteFile(dest, []byte("ORIGINAL"), 0o700))
	err := (&UpdateService{}).extractBinary(path, dest)
	require.ErrorContains(t, err, "too many archive members")
	got, readErr := os.ReadFile(dest)
	require.NoError(t, readErr)
	require.Equal(t, []byte("ORIGINAL"), got)
}

func TestSyncDirectoryAfterAtomicReplacement(t *testing.T) {
	dir := t.TempDir()
	require.NoError(t, syncDirectory(dir))
}

func TestAtomicReplaceOverwritesExistingDestination(t *testing.T) {
	dir := t.TempDir()
	destination := filepath.Join(dir, "sub2api")
	source := filepath.Join(dir, "staged")
	require.NoError(t, os.WriteFile(destination, []byte("OLD"), 0o755))
	require.NoError(t, os.WriteFile(source, []byte("NEW"), 0o755))
	require.NoError(t, atomicReplace(source, destination))
	got, err := os.ReadFile(destination)
	require.NoError(t, err)
	require.Equal(t, []byte("NEW"), got)
	_, err = os.Stat(source)
	require.ErrorIs(t, err, os.ErrNotExist)
}

func TestReplaceExecutableKeepsDestinationPresentAndDurableBackup(t *testing.T) {
	dir := t.TempDir()
	executable := filepath.Join(dir, "sub2api")
	staged := filepath.Join(dir, "staged")
	require.NoError(t, os.WriteFile(executable, []byte("OLD"), 0o755))
	require.NoError(t, os.WriteFile(staged, []byte("NEW"), 0o755))

	renameChecked := false
	rename := func(oldPath, newPath string) error {
		if oldPath == staged && newPath == executable {
			renameChecked = true
			current, err := os.ReadFile(executable)
			require.NoError(t, err)
			require.Equal(t, []byte("OLD"), current)
		}
		return os.Rename(oldPath, newPath)
	}
	require.NoError(t, replaceExecutableWithBackup(executable, staged, rename))
	require.True(t, renameChecked)
	current, err := os.ReadFile(executable)
	require.NoError(t, err)
	require.Equal(t, []byte("NEW"), current)
	backup, err := os.ReadFile(executable + ".backup")
	require.NoError(t, err)
	require.Equal(t, []byte("OLD"), backup)

	failedStaged := filepath.Join(dir, "failed-staged")
	require.NoError(t, os.WriteFile(failedStaged, []byte("BROKEN"), 0o755))
	injected := errors.New("injected final rename failure")
	err = replaceExecutableWithBackup(executable, failedStaged, func(oldPath, newPath string) error {
		if oldPath == failedStaged && newPath == executable {
			return injected
		}
		return os.Rename(oldPath, newPath)
	})
	require.ErrorIs(t, err, injected)
	current, readErr := os.ReadFile(executable)
	require.NoError(t, readErr)
	require.Equal(t, []byte("NEW"), current)
}

func TestUpdateMutationsUseOperationLock(t *testing.T) {
	svc := &UpdateService{}
	svc.operationMu.Lock()
	started := make(chan struct{})
	done := make(chan struct{})
	go func() {
		close(started)
		_ = svc.applyReleaseAssets(context.Background(), "0.1.175-ru.2", nil)
		close(done)
	}()
	<-started
	select {
	case <-done:
		t.Fatal("update mutation bypassed operation lock")
	case <-time.After(50 * time.Millisecond):
	}
	svc.operationMu.Unlock()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("update mutation did not resume after operation lock release")
	}
}
