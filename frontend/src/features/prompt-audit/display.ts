import type { PromptProbeResult } from './types'

type Translate = (key: string) => string

const statusKeys: Record<string, string> = {
  healthy: 'healthy', ok: 'healthy', failed: 'failed', unavailable: 'failed',
  disabled: 'disabled', running: 'running', degraded: 'degraded', error: 'error', stale: 'stale',
}
const modes = new Set(['off', 'async_audit', 'blocking'])
export const PROMPT_ERROR_CODES = new Set([
  'endpoint_invalid', 'endpoint_unsafe', 'probe_request_invalid', 'connection_failed', 'timeout',
  'response_read_failed', 'response_too_large', 'authentication_failed', 'probe_http_error',
  'prompt_guard_unavailable', 'prompt_guard_invalid_response', 'prompt_guard_blocked',
  'database_unavailable', 'payload_store_unavailable', 'no_enabled_endpoint', 'payload_missing',
  'prompt_audit_config_conflict', 'prompt_audit_config_unavailable', 'prompt_audit_encryption_key_required',
  'prompt_guard_requires_audit_enabled', 'prompt_audit_unknown_unsafe', 'content_policy_violation',
])

// Translate display text only. Never rewrite persisted enums, endpoint IDs,
// user-defined node names, probe results or request/update payloads.
export function promptStatusLabel(status: string, t: Translate): string {
  return Object.prototype.hasOwnProperty.call(statusKeys, status)
    ? t(`admin.promptAudit.status.${statusKeys[status]}`)
    : t('common.unknown')
}

export function promptModeLabel(mode: string, t: Translate): string {
  return modes.has(mode) ? t(`admin.promptAudit.mode.${mode}`) : t('common.unknown')
}

export function promptErrorLabel(code: string | undefined, t: Translate, fallback = 'admin.promptAudit.status.error'): string {
  return code && PROMPT_ERROR_CODES.has(code) ? t(`runtimeUi.promptErrors.${code}`) : t(fallback)
}

export function promptProbeMessage(result: PromptProbeResult, t: Translate): string {
  if (result.ok) {
    return t(result.message === '审计节点模型调用正常'
      ? 'runtimeUi.probeModelSucceeded' : 'admin.promptAudit.messages.probeSucceeded')
  }
  return promptErrorLabel(result.error_code, t, 'admin.promptAudit.errors.probe')
}

export function promptDiagnosticDetails(value: { status?: string; error_code?: string; message?: string }): string {
  return JSON.stringify({ status: value.status, error_code: value.error_code, message: value.message }, null, 2)
}
