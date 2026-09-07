package service

import "testing"

func TestCompareVersionsRUForkOrdering(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		left    string
		right   string
		wantCmp int
	}{
		{name: "official baseline upgrades to first RU revision", left: "0.1.169", right: "0.1.169-ru.1", wantCmp: -1},
		{name: "RU hotfix increments", left: "0.1.169-ru.1", right: "0.1.169-ru.2", wantCmp: -1},
		{name: "next upstream release wins", left: "0.1.169-ru.99", right: "0.1.170-ru.1", wantCmp: -1},
		{name: "leading v is ignored", left: "v0.1.170-ru.1", right: "0.1.170-ru.1", wantCmp: 0},
		{name: "newer RU revision is greater", left: "0.1.170-ru.3", right: "0.1.170-ru.2", wantCmp: 1},
		{name: "multi-digit RU revision is numeric", left: "0.1.170-ru.10", right: "0.1.170-ru.9", wantCmp: 1},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := compareVersions(tt.left, tt.right); got != tt.wantCmp {
				t.Fatalf("compareVersions(%q, %q) = %d, want %d", tt.left, tt.right, got, tt.wantCmp)
			}
		})
	}
}

func TestUpdateRepositoryIsRUFork(t *testing.T) {
	t.Parallel()
	if githubRepo != "YLeon2007/sub2api" {
		t.Fatalf("githubRepo = %q, want YLeon2007/sub2api", githubRepo)
	}
}

func TestCompareVersionsRejectsMalformedReleaseTags(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name    string
		current string
		latest  string
		wantCmp int
	}{
		{name: "malformed latest never triggers update", current: "0.1.169-ru.1", latest: "0.1.170-rc.1", wantCmp: 1},
		{name: "zero RU revision is invalid", current: "0.1.169-ru.1", latest: "0.1.170-ru.0", wantCmp: 1},
		{name: "valid release replaces an unknown source version", current: "dev", latest: "0.1.169-ru.1", wantCmp: -1},
		{name: "equal unknown versions remain equal", current: "dev", latest: "dev", wantCmp: 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := compareVersions(tt.current, tt.latest); got != tt.wantCmp {
				t.Fatalf("compareVersions(%q, %q) = %d, want %d", tt.current, tt.latest, got, tt.wantCmp)
			}
		})
	}
}
