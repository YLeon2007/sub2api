import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function setBrowserLanguage(language: string): void {
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    value: language
  })
}

describe('locale registration', () => {
  beforeEach(() => {
    vi.resetModules()
    localStorage.clear()
    setBrowserLanguage('en-US')
  })

  afterEach(() => {
    localStorage.clear()
    setBrowserLanguage('en-US')
    vi.resetModules()
  })

  it('registers Russian as an explicit selectable locale', async () => {
    const { availableLocales } = await import('../index')

    expect(availableLocales.map((locale) => locale.code)).toContain('ru')
  })

  it('selects Russian for ru-RU browser language', async () => {
    setBrowserLanguage('ru-RU')
    const { getLocale } = await import('../index')

    expect(getLocale()).toBe('ru')
  })
})
