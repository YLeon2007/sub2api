import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('Russian channel monitor matrix fallbacks', () => {
  it('uses a Russian fallback axis label', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/features/channel-monitor-v2/RelayPulseMatrix.vue'),
      'utf8'
    )
    expect(source).not.toContain("'时间脉冲'")
    expect(source).toContain("t('channelMonitorV2.matrix.title')")
  })
})
