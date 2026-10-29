import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(process.cwd(), '..')
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const packageJson = JSON.parse(read('frontend/package.json'))

describe('build toolchain compatibility', () => {
  it('declares the Node 22 minimum required by the patched Vue I18n release', () => {
    expect(packageJson.dependencies['vue-i18n']).toBe('^11.4.14')
    expect(packageJson.devDependencies['@intlify/message-compiler']).toBe('11.4.14')
    expect(packageJson.engines?.node).toBe('>=22')
  })

  it.each(['backend-ci.yml', 'security-scan.yml', 'release.yml'])(
    '%s selects a supported Node runtime for every install/build/audit job',
    (workflow) => {
      const versions = [...read(`.github/workflows/${workflow}`).matchAll(/node-version:\s*['"]?(\d+)/g)]
      expect(versions.length).toBeGreaterThan(0)
      for (const version of versions) expect(Number(version[1])).toBeGreaterThanOrEqual(22)
    },
  )

  it.each(['Dockerfile', 'deploy/Dockerfile'])(
    '%s defaults to the declared Go toolchain and a supported Node runtime',
    (dockerfile) => {
      const source = read(dockerfile)
      const goVersion = /^go (\d+\.\d+\.\d+)$/m.exec(read('backend/go.mod'))?.[1]
      expect(goVersion).toBeDefined()
      expect(source).toContain(`ARG GOLANG_IMAGE=golang:${goVersion}-alpine`)
      const nodeVersion = /ARG NODE_IMAGE=node:(\d+)/.exec(source)?.[1]
      expect(Number(nodeVersion)).toBeGreaterThanOrEqual(22)
    },
  )
})
