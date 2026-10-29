import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import * as Vue from 'vue'
import type { RenderFunction } from 'vue'
import { compileTemplate, parse } from 'vue/compiler-sfc'
import { createI18n } from 'vue-i18n'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import en from '../locales/en'
import ru from '../locales/ru'
import zh from '../locales/zh'

// Compile and render the shipped template nodes, not replacement test markup.
function actualLabels() {
  const { descriptor } = parse(readFileSync('src/views/user/BatchImageGuideView.vue', 'utf8'))
  const template = descriptor.template!.content
  const headers = template.match(/<thead\b[^>]*>[\s\S]*?<\/thead>/)?.[0]
  const apiLabel = template.match(/<label\b[^>]*>[^<]*<\/label>(?=\s*<select v-model\.number="form\.apiKeyId")/)?.[0]
  const promptLabel = template.match(/<label class="input-label mb-0">[\s\S]*?<\/label>/)?.[0]
  const apiControl = template.match(/<select v-model\.number="form\.apiKeyId"[\s\S]*?<\/select>/)?.[0]
  expect(headers).toBeTruthy()
  expect(apiLabel).toBeTruthy()
  expect(promptLabel).toBeTruthy()
  expect(apiControl).toBeTruthy()
  const compiled = compileTemplate({ filename: 'BatchImageGuideView.vue', id: 'batch-labels',
    source: `<div><table>${headers}</table><section>${apiLabel}${apiControl}${promptLabel}</section></div>`,
    compilerOptions: { hoistStatic: false },
  })
  expect(compiled.errors).toEqual([])
  const output = ts.transpileModule(compiled.code, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText
  const exports: Record<string, unknown> = {}
  new Function('require', 'exports', output)((name: string) => {
    expect(name).toBe('vue')
    return Vue
  }, exports)
  return exports.render as RenderFunction
}

describe('actual batch-image table and create-form labels', () => {
  it.each(['ru', 'en', 'zh'] as const)('renders localized fields without changing IDs (%s)', async locale => {
    const i18n = createI18n({ legacy: false, locale, fallbackLocale: false, messages: { en, ru, zh } })
    const form = Vue.reactive({ apiKeyId: 17 })
    const component = Vue.defineComponent({ setup: () => ({ t: i18n.global.t, form, loadingKeys: false,
      geminiApiKeys: [{ id: 17, name: 'Custom key', group: { name: 'Custom group' } },
        { id: 22, name: 'Second custom key', group: { name: 'Second group' } }],
    }), render: actualLabels() })
    const wrapper = mount(component)
    expect(wrapper.findAll('th').map(node => node.text())).toEqual([
      'runtimeUi.batchCustomId', 'runtimeUi.batchPrompt', 'common.status', 'batchImage.detail.preview', 'batchImage.detail.result',
    ].map(key => i18n.global.t(key)))
    expect(wrapper.findAll('label').map(node => node.text())).toEqual([
      i18n.global.t('batchImage.columns.apiKey'), i18n.global.t('runtimeUi.batchPrompt'),
    ])
    expect(wrapper.findAll('option').map(node => node.attributes('value'))).toEqual(['0', '17', '22'])
    expect(wrapper.findAll('option')[1].text()).toBe('Custom key · Custom group')
    expect((wrapper.get('select').element as HTMLSelectElement).value).toBe('17')
    await wrapper.get('select').setValue('22')
    expect(form.apiKeyId).toBe(22)
    wrapper.unmount()
  })
})
