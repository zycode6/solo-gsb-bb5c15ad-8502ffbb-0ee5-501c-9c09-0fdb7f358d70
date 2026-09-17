import assert from 'node:assert'
import { JSDOM } from 'jsdom'
import type { DocumentData } from '../src/types'

// storage.ts 依赖 localStorage，用 jsdom 提供
const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://localhost/' })
;(globalThis as unknown as { localStorage: Storage }).localStorage = dom.window.localStorage

const { loadDocument, saveDocument, clearDocument } = await import('../src/lib/storage')

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

const KEY = 'anchor-annotation-console:v1'

check('旧版本数据（无互斥规则/忽略字段）加载后补默认值，其余字段原样保留', () => {
  const legacy = {
    title: '旧文档',
    text: '旧版本保存的原文',
    annotations: [
      {
        id: 'a1',
        quote: '旧版本',
        start: 0,
        end: 3,
        note: 'n',
        tags: ['X'],
        status: 'bound',
        createdAt: 1,
        updatedAt: 2,
        contextBefore: '',
        contextAfter: '保存的',
      },
    ],
    updatedAt: 123,
  }
  localStorage.setItem(KEY, JSON.stringify(legacy))
  const doc = loadDocument()
  assert.ok(doc)
  assert.strictEqual(doc!.title, '旧文档')
  assert.strictEqual(doc!.annotations.length, 1)
  assert.deepStrictEqual(doc!.mutexRules, [])
  assert.deepStrictEqual(doc!.ignoredConflicts, [])
  assert.strictEqual(doc!.updatedAt, 123)
})

check('互斥规则与忽略状态随文档保存/加载往返一致', () => {
  const doc: DocumentData = {
    title: 't',
    text: 'text',
    annotations: [],
    mutexRules: [{ id: 'r1', a: 'X', b: 'Y' }],
    ignoredConflicts: [{ signature: 'ab|r1', ignoredAt: 456 }],
    updatedAt: 789,
  }
  saveDocument(doc)
  const loaded = loadDocument()
  assert.ok(loaded)
  assert.deepStrictEqual(loaded!.mutexRules, doc.mutexRules)
  assert.deepStrictEqual(loaded!.ignoredConflicts, doc.ignoredConflicts)
})

check('存储中的非法规则/忽略记录会被清洗而不是报错', () => {
  localStorage.setItem(
    KEY,
    JSON.stringify({
      title: 't',
      text: 'x',
      annotations: [],
      mutexRules: [{ a: 'X', b: 'Y' }, { a: '', b: 'Z' }, 'junk'],
      ignoredConflicts: [{ signature: 's', ignoredAt: '2026-09-17T00:00:00.000Z' }, 42],
      updatedAt: 1,
    }),
  )
  const doc = loadDocument()
  assert.ok(doc)
  assert.strictEqual(doc!.mutexRules.length, 1)
  assert.ok(doc!.mutexRules[0].id, '缺失 id 应被生成')
  assert.strictEqual(doc!.ignoredConflicts.length, 1)
  assert.strictEqual(doc!.ignoredConflicts[0].ignoredAt, Date.parse('2026-09-17T00:00:00.000Z'))
})

check('损坏的 JSON 返回 null；clearDocument 后无文档', () => {
  localStorage.setItem(KEY, '{broken')
  assert.strictEqual(loadDocument(), null)
  saveDocument({
    title: 't',
    text: 'x',
    annotations: [],
    mutexRules: [],
    ignoredConflicts: [],
    updatedAt: 1,
  })
  clearDocument()
  assert.strictEqual(loadDocument(), null)
})

console.log(`\n全部 ${passed} 项通过`)
