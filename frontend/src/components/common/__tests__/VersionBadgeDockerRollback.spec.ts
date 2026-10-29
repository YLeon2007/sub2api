import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parse } from 'vue/compiler-sfc'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

function actualCommand(version = '0.2.17-ru.1') {
  const text = readFileSync(resolve(process.cwd(), 'src/components/common/VersionBadge.vue'), 'utf8')
  const { descriptor } = parse(text)
  const file = ts.createSourceFile('VersionBadge.ts', descriptor.scriptSetup!.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const names = new Set(['GITHUB_REPO', 'DOCKER_IMAGE', 'RU_RELEASE_VERSION_RE', 'dockerRollbackCommand', 'inspectedRemoteScriptCommand'])
  const selected = file.statements.filter(node =>
    (ts.isFunctionDeclaration(node) && !!node.name && names.has(node.name.text)) ||
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(decl => ts.isIdentifier(decl.name) && names.has(decl.name.text))),
  )
  expect(selected).toHaveLength(names.size)
  const code = ts.transpileModule(selected.map(node => node.getText(file)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
  return new Function('computed', 'selectedRollbackVersion', 't', `${code}\nreturn dockerRollbackCommand`)(
    (fn: () => string) => fn(), { value: version }, (key: string) => key,
  ) as string
}
function execute(mount: string, composeFile: string, configuredImage = 'ghcr.io/yleon2007/sub2api:0.2.17-ru.1') {
  const root = mkdtempSync(join(tmpdir(), 'rollback-command-'))
  const log = join(root, 'calls.log')
  const command = actualCommand()
  const files: Record<string, string> = {
    docker: `#!/usr/bin/env bash
set -eu
printf 'docker|%s|%s\\n' "\${COMPOSE_FILE:-unset}" "$*" >> "$PROBE_LOG"
case "$*" in
  'compose config --quiet') ;;
  'compose config --format json') printf '{"services":{"sub2api":{"image":"%s"}}}\\n' "$PROBE_IMAGE" ;;
  'compose pull sub2api') ;;
  'compose ps -q sub2api') echo fixture-container ;;
  'inspect fixture-container --format {{.Name}}') echo /sub2api ;;
  'inspect fixture-container --format '*) printf '%s' "$PROBE_MOUNT" ;;
  'compose exec -T sub2api /app/sub2api --version') echo 'Sub2API 0.2.17-ru.1' ;;
  'compose up -d --no-deps --force-recreate sub2api') ;;
  *) echo "unexpected docker: $*" >&2; exit 91 ;;
esac
`,
    curl: `#!/usr/bin/env bash
set -eu
printf 'curl|%s\\n' "$*" >> "$PROBE_LOG"
while [[ $# -gt 0 ]]; do
  if [[ "$1" == -o ]]; then target="$2"; shift 2; else shift; fi
done
cat > "$target" <<'HELPER'
#!/usr/bin/env bash
set -eu
printf 'helper|%s|%s|%s\\n' "\${COMPOSE_FILE:-unset}" "$1" "$2" >> "$PROBE_LOG"
HELPER
`,
    less: '#!/usr/bin/env bash\nprintf "inspected\\n" >> "$PROBE_LOG"\n',
    // Model sudo's environment scrubbing; the generated command must restore
    // COMPOSE_FILE explicitly inside its privileged invocation.
    sudo: '#!/usr/bin/env bash\nexec env -u COMPOSE_FILE "$@"\n',
  }
  try {
    for (const [name, content] of Object.entries(files)) writeFileSync(join(root, name), content, { mode: 0o700 })
    writeFileSync(log, '')
    const result = spawnSync('bash', ['-eu', '-c', command], { cwd: root, encoding: 'utf8', input: 'y\n', timeout: 10000,
      env: { ...process.env, PATH: `${root}:${process.env.PATH}`, COMPOSE_FILE: composeFile,
        PROBE_LOG: log, PROBE_IMAGE: configuredImage, PROBE_MOUNT: mount },
    })
    return { status: result.status, output: result.stdout + result.stderr, calls: readFileSync(log, 'utf8'), root, command }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('actual rendered Docker rollback command', () => {
  it('inspects and syncs named runtime, retaining the selected Compose file across sudo', () => {
    const result = execute('volume:fixture-runtime', 'custom-deployment.yml')
    expect(result.output).not.toContain('command not found')
    expect(result.status).toBe(0)
    expect(result.calls).toContain('docker|custom-deployment.yml|inspect fixture-container --format ')
    expect(result.calls).toContain('https://raw.githubusercontent.com/YLeon2007/sub2api/v0.2.17-ru.1/deploy/sync-runtime-from-image.sh')
    expect(result.calls).toContain('inspected\nhelper|custom-deployment.yml|ghcr.io/yleon2007/sub2api:0.2.17-ru.1|')
    expect(result.calls).not.toContain('compose up -d --no-deps --force-recreate sub2api')
  })
  it.each(['docker-compose.local.yml', 'docker-compose.standalone.yml'])('recreates %s without a runtime helper', composeFile => {
    const result = execute('', composeFile)
    expect(result.status).toBe(0)
    expect(result.calls).toContain(`docker|${composeFile}|inspect fixture-container --format `)
    expect(result.calls).toContain(`docker|${composeFile}|compose up -d --no-deps --force-recreate sub2api`)
    expect(result.calls).not.toContain('curl|')
    expect(result.calls).not.toContain('helper|')
  })
  it.each(['bind:', 'tmpfs:', 'volume:'])('refuses unsupported /app mount %s before mutation', mount => {
    const result = execute(mount, 'custom.yml')
    expect(result.status).not.toBe(0)
    expect(result.calls).toContain('inspect fixture-container --format ')
    expect(result.calls).not.toContain('helper|')
    expect(result.calls).not.toContain('compose up ')
  })
  it('refuses a Compose image different from the selected rollback image before pulling', () => {
    const result = execute('', 'custom.yml', 'ghcr.io/yleon2007/sub2api:0.2.19-ru.1')
    expect(result.status).not.toBe(0)
    expect(result.calls).toContain('compose config --format json')
    expect(result.calls).not.toContain('compose pull ')
    expect(result.calls).not.toContain('compose up ')
    expect(result.calls).not.toContain('helper|')
  })
  it.each(['0.2.17-ru.1;touch PWNED', 'latest', '0.2.17', '0.2.17-ru.0'])('rejects non-release version %s', version => {
    expect(actualCommand(version)).toBe('')
  })
})
