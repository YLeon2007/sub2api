import { describe, expect, it } from 'vitest'

import en from '../locales/en'
import ru from '../locales/ru'
import zh from '../locales/zh'

describe('risk control locale copy', () => {
  it('describes worker runtime as audit and pre-block record processing', () => {
    expect(zh.admin.riskControl.workerStatusHint).toContain('前置拦截记录任务')
    expect(zh.admin.riskControl.workerStatusHint).not.toContain('异步观察任务')
    expect(en.admin.riskControl.workerStatusHint).toContain('pre-block record tasks')
    expect(en.admin.riskControl.workerStatusHint).not.toContain('observation tasks')
  })

  it('keeps pre-block audit key summary aware of async worker load', () => {
    expect(zh.admin.riskControl.preBlockAPIKeyLoadSummary).toContain('worker：{workerActive} / {workerTotal}')
    expect(en.admin.riskControl.preBlockAPIKeyLoadSummary).toContain('worker: {workerActive} / {workerTotal}')
  })

  it('does not describe pre-block audit key polling as bypassing the worker pool', () => {
    expect(zh.admin.riskControl.preBlockAPIKeyLoadHint).toBe('同步前置拦截直接轮询可用审核 Key。')
    expect(zh.admin.riskControl.preBlockAPIKeyLoadHint).not.toContain('Worker 池')
    expect(en.admin.riskControl.preBlockAPIKeyLoadHint).not.toContain('worker pool')
  })

  it('keeps the Russian runtime and result labels localized', () => {
    expect(ru.admin.riskControl.preBlockAPIKeyLoadHint).toBe(
      'Синхронная предблокировка напрямую перебирает доступные ключи аудита.'
    )
    expect(ru.admin.riskControl.preBlockAPIKeyLoadSummary).toContain('Синхронно активно')
    expect(ru.admin.riskControl.workerStatus).toBe('Состояние worker-ов')
    expect(ru.admin.riskControl.workerStatusHint).toContain('задач аудита и записи предблокировки')
    expect(ru.admin.riskControl.preBlockSyncHint).toContain('Текущие счётчики')
    expect(ru.admin.riskControl.tabs.runtime).toBe('Выполнение')
    expect(ru.admin.riskControl.blockedKeywordsPlaceholder).toContain('Одно ключевое слово на строку')
    expect(ru.admin.riskControl.blockedKeywordsPreBlockHint).toContain('Предблокировка')
    expect(ru.admin.riskControl.keywordModeKeywordAndApi).toBe('Ключевые слова + API')
    expect(ru.admin.riskControl.violationCount).toBe('Срабатываний: {count}')
    expect(ru.admin.riskControl.queueDelay).toBe('В очереди {ms} мс')
  })
})
