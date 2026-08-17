import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const frontendRoot = process.cwd()
const packageJson = JSON.parse(readFileSync(resolve(frontendRoot, 'package.json'), 'utf8'))
const lockfile = readFileSync(resolve(frontendRoot, 'pnpm-lock.yaml'), 'utf8')

function versionTuple(version: string): [number, number, number] {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`unexpected DOMPurify version: ${version}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function atLeast(version: string, minimum: [number, number, number]): boolean {
  const actual = versionTuple(version)
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== minimum[index]) return actual[index] > minimum[index]
  }
  return true
}

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = resolve(root, entry)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(?:ts|vue|js)$/.test(entry) ? [path] : []
  })
}

describe('DOMPurify security boundary', () => {
  it('pins every direct and transitive runtime instance to 3.4.13 or newer', () => {
    expect(packageJson.dependencies.dompurify).toBe('^3.4.13')
    expect(packageJson.pnpm.overrides['dompurify@<3.4.13']).toBe('3.4.13')

    const resolvedVersions = Array.from(
      lockfile.matchAll(/^ {2}dompurify@(\d+\.\d+\.\d+):$/gm),
      (match) => match[1],
    )
    expect(resolvedVersions.length).toBeGreaterThan(0)
    expect(resolvedVersions.every((version) => atLeast(version, [3, 4, 13]))).toBe(true)
  })

  it('does not enable the DOM-object IN_PLACE sanitization mode', () => {
    const offenders = sourceFiles(resolve(frontendRoot, 'src'))
      .filter((path) => !path.includes('/__tests__/'))
      .filter((path) => readFileSync(path, 'utf8').includes('IN_PLACE'))
    expect(offenders).toEqual([])
  })
})
