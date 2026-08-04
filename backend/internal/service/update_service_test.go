//go:build unit

package service

import (
	"context"
	"errors"
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
	version := "0.1.171-ru.1"
	exactArchive := "sub2api_0.1.171-ru.1_linux_amd64.tar.gz"
	assets := []Asset{
		{Name: exactArchive + ".evil", DownloadURL: "https://github.com/YLeon2007/sub2api/releases/download/v0.1.171-ru.1/confusable"},
		{Name: exactArchive, DownloadURL: "https://github.com/YLeon2007/sub2api/releases/download/v0.1.171-ru.1/" + exactArchive},
		{Name: "checksums.txt", DownloadURL: "https://github.com/YLeon2007/sub2api/releases/download/v0.1.171-ru.1/checksums.txt"},
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
	name := "sub2api_0.1.171-ru.1_linux_amd64.tar.gz"
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
