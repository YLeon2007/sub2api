//go:build unit

package service

import (
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/Wei-Shaw/sub2api/internal/domain"
	"github.com/stretchr/testify/require"
)

// The frontend's mounted run-result tests consume these same wire messages.
// Exercise the real producer, not a reimplementation of quotaDegradedHint.
func TestQuotaWarningProducerDisplayContracts(t *testing.T) {
	data, err := os.ReadFile("testdata/quota_warning_contracts.json")
	require.NoError(t, err)
	var rows []struct {
		Name     string                      `json:"name"`
		Snapshot domain.MonitorQuotaSnapshot `json:"snapshot"`
		Message  string                      `json:"message"`
	}
	require.NoError(t, json.Unmarshal(data, &rows))
	require.Len(t, rows, 15)
	for _, row := range rows {
		t.Run(row.Name, func(t *testing.T) {
			before, err := json.Marshal(row.Snapshot)
			require.NoError(t, err)
			result := deriveQuotaCheckResult(&row.Snapshot, "quota", time.Date(2026, 10, 29, 0, 0, 0, 0, time.UTC))
			require.Equal(t, MonitorStatusDegraded, result.Status)
			require.Equal(t, row.Message, result.Message)
			after, err := json.Marshal(row.Snapshot)
			require.NoError(t, err)
			require.Equal(t, before, after)
		})
	}
}
