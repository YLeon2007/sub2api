import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(process.cwd(), '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const version = read('backend/cmd/server/VERSION').trim()
const cases = [
  ['README.md', 'Upgrade'], ['README_CN.md', '升级'], ['README_JA.md', 'アップグレード'],
] as const

describe('root Docker upgrade entry points use explicit immutable selection', () => {
  for (const [path, heading] of cases) {
    it(`${path} changes the pinned image before invoking the mount-aware guide and verifies runtime`, () => {
      const marker = `#### ${heading}\n`
      const docker = read(path).split(/^### .*Docker Compose.*\n/m)
      expect(docker).toHaveLength(2)
      const dockerSection = docker[1]!.split('\n### ')[0]!
      expect(dockerSection.split(marker)).toHaveLength(2)
      const section = dockerSection.split(marker)[1]!.split('\n#### ')[0]!
      const image = section.indexOf(`image: ghcr.io/yleon2007/sub2api:${version}`)
      const guide = section.indexOf('(deploy/README.md#safe-immutable-upgrade)')
      expect(image).toBeGreaterThanOrEqual(0)
      expect(guide).toBeGreaterThan(image)
      expect(section).toContain('https://github.com/YLeon2007/sub2api/releases')
      expect(section).toContain('/app')
      expect(section).toContain('docker exec sub2api /app/sub2api --version')
      // These entry points must not retain a second, blind pull/up recipe beside
      // the reviewed mount-specific executable path in the deployment guide.
      for (const fence of section.matchAll(/```(?:bash|sh)\n([\s\S]*?)```/g)) {
        expect(fence[1]).not.toMatch(/docker compose[^\n]*(?:\bpull\b|\bup\b)/)
      }
      const guideSource = read('deploy/README.md')
      expect(guideSource).toContain('## Safe immutable upgrade')
      expect(guideSource).toContain('RUNTIME_IMAGE_SYNC_PASS')
      expect(guideSource).toContain('docker exec sub2api /app/sub2api --version')
      expect(read('deploy/docker-compose.local.yml')).toMatch(/image: ghcr\.io\/yleon2007\/sub2api:\d+\.\d+\.\d+-ru\.\d+/)
    })
  }
})
