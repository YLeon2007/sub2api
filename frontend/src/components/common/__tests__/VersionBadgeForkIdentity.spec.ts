import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(process.cwd(), 'src/components/common/VersionBadge.vue'), 'utf8')

describe('RU fork update and rollback identity', () => {
  it('uses the RU fork for release scripts', () => {
    expect(source).toContain("const GITHUB_REPO = 'YLeon2007/sub2api'")
    expect(source).not.toContain("const GITHUB_REPO = 'Wei-Shaw/sub2api'")
  })

  it('uses the versioned GHCR image published by the RU fork', () => {
    expect(source).toContain("const DOCKER_IMAGE = 'ghcr.io/yleon2007/sub2api'")
    expect(source).not.toContain("const DOCKER_IMAGE = 'weishaw/sub2api'")
  })

  it('syncs the selected image into the persistent runtime volume', () => {
    expect(source).toContain('sync-runtime-from-image.sh')
  })

  it('downloads, exposes and confirms remote scripts before execution', () => {
    expect(source).not.toMatch(/curl[^\n|]*\|\s*(?:sudo\s+)?bash/)
    expect(source).toContain('script_path="$(mktemp)"')
    expect(source).toContain("curl -fL --proto '=https' --tlsv1.2 -o \"$script_path\"")
    expect(source).toContain('less "$script_path"')
    expect(source).toContain("read -r answer")
    expect(source).toContain('sudo bash "$script_path"')
  })
})
