import assert from 'node:assert'
import type { Annotation, MutexRule } from '../src/types'
import {
  conflictSignature,
  detectConflicts,
  normalizePair,
  sanitizeIgnoredConflicts,
  sanitizeMutexRules,
  validateRule,
} from '../src/lib/conflicts'

let passed = 0
function check(name: string, fn: () => void) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

function ann(
  id: string,
  start: number,
  end: number,
  tags: string[],
  status: 'bound' | 'pending' = 'bound',
): Annotation {
  return {
    id,
    quote: '',
    start,
    end,
    note: '',
    tags,
    status,
    createdAt: 0,
    updatedAt: 0,
    contextBefore: '',
    contextAfter: '',
  }
}

const rXY: MutexRule = { id: 'r1', a: 'X', b: 'Y' }
const rPQ: MutexRule = { id: 'r2', a: 'P', b: 'Q' }

// ---------- 冲突检测 ----------

check('区间至少 1 字符交集才构成冲突；首尾相接不算', () => {
  const rules = [rXY]
  // [0,5) 与 [4,10) 交叠 1 字符 → 冲突
  const hit = detectConflicts([ann('a', 0, 5, ['X']), ann('b', 4, 10, ['Y'])], rules)
  assert.strictEqual(hit.length, 1)
  assert.strictEqual(hit[0].overlapStart, 4)
  assert.strictEqual(hit[0].overlapEnd, 5)

  // [0,5) 与 [5,10) 首尾相接，无字符交集 → 不冲突
  const touch = detectConflicts([ann('a', 0, 5, ['X']), ann('b', 5, 10, ['Y'])], rules)
  assert.strictEqual(touch.length, 0)

  // 完全分离 → 不冲突
  const apart = detectConflicts([ann('a', 0, 5, ['X']), ann('b', 6, 10, ['Y'])], rules)
  assert.strictEqual(apart.length, 0)
})

check('标签按任一方向命中同一互斥对均算冲突', () => {
  const rules = [rXY]
  const forward = detectConflicts([ann('a', 0, 5, ['X']), ann('b', 3, 8, ['Y'])], rules)
  const reverse = detectConflicts([ann('a', 0, 5, ['Y']), ann('b', 3, 8, ['X'])], rules)
  assert.strictEqual(forward.length, 1)
  assert.strictEqual(reverse.length, 1)

  // 两条标注都只有 X：没有“分别命中” → 不冲突
  const sameSide = detectConflicts([ann('a', 0, 5, ['X']), ann('b', 3, 8, ['X'])], rules)
  assert.strictEqual(sameSide.length, 0)
})

check('同一标注对命中多条规则只展示一次，并列出全部命中规则', () => {
  const annotations = [ann('a', 0, 6, ['X', 'P']), ann('b', 3, 9, ['Y', 'Q'])]
  const items = detectConflicts(annotations, [rXY, rPQ])
  assert.strictEqual(items.length, 1)
  assert.deepStrictEqual(
    items[0].rules.map((r) => r.id).sort(),
    ['r1', 'r2'],
  )
  // 签名包含两个规则 id
  assert.strictEqual(items[0].signature, conflictSignature('a', 'b', ['r1', 'r2']))
})

check('只检测已绑定标注；pending 与空区间不参与', () => {
  const rules = [rXY]
  const items = detectConflicts(
    [
      ann('a', 0, 5, ['X']),
      ann('b', 3, 8, ['Y'], 'pending'),
      ann('c', 2, 2, ['Y']), // 空区间
    ],
    rules,
  )
  assert.strictEqual(items.length, 0)
})

check('无规则时不产生冲突；审阅面板按交叠起点排序', () => {
  const annotations = [
    ann('a', 20, 30, ['X']),
    ann('b', 25, 35, ['Y']),
    ann('c', 2, 8, ['X']),
    ann('d', 5, 12, ['Y']),
  ]
  assert.strictEqual(detectConflicts(annotations, []).length, 0)

  const items = detectConflicts(annotations, [rXY])
  assert.strictEqual(items.length, 2)
  assert.ok(items[0].overlapStart < items[1].overlapStart)
  assert.strictEqual(items[0].overlapStart, 5)
  assert.strictEqual(items[1].overlapStart, 25)
})

check('签名不含位置：区间重定位后签名不变，忽略不失效', () => {
  const before = detectConflicts([ann('a', 0, 5, ['X']), ann('b', 3, 8, ['Y'])], [rXY])
  // 模拟重定位：两条标注整体平移，区间都变了
  const after = detectConflicts([ann('a', 100, 105, ['X']), ann('b', 103, 108, ['Y'])], [rXY])
  assert.strictEqual(before.length, 1)
  assert.strictEqual(after.length, 1)
  assert.strictEqual(before[0].signature, after[0].signature)
})

check('标签变化改变命中规则集合 → 签名改变，冲突自动重新出现', () => {
  const base = [ann('a', 0, 6, ['X', 'P']), ann('b', 3, 9, ['Y', 'Q'])]
  const twoRules = detectConflicts(base, [rXY, rPQ])
  assert.strictEqual(twoRules.length, 1)

  // 编辑标注 a，去掉标签 P → 只命中 r1，签名改变
  const edited = detectConflicts([ann('a', 0, 6, ['X']), ann('b', 3, 9, ['Y', 'Q'])], [rXY, rPQ])
  assert.strictEqual(edited.length, 1)
  assert.notStrictEqual(edited[0].signature, twoRules[0].signature)

  // 标签改到不再命中任何规则 → 冲突消失
  const cleared = detectConflicts([ann('a', 0, 6, ['Z']), ann('b', 3, 9, ['Y', 'Q'])], [rXY, rPQ])
  assert.strictEqual(cleared.length, 0)
})

check('签名与标注顺序无关', () => {
  assert.strictEqual(
    conflictSignature('a', 'b', ['r1', 'r2']),
    conflictSignature('b', 'a', ['r2', 'r1']),
  )
})

// ---------- 规则校验与清洗 ----------

check('validateRule：空标签、相同标签、重复对（含反向）均被拒绝', () => {
  assert.strictEqual(validateRule('', 'Y', []), '请填写两个标签')
  assert.strictEqual(validateRule('X', 'X', []), '两个标签不能相同')
  assert.strictEqual(validateRule('X', 'Y', [rXY]), '该互斥对已存在')
  assert.strictEqual(validateRule('Y', 'X', [rXY]), '该互斥对已存在')
  assert.strictEqual(validateRule('X', 'Z', [rXY]), null)
})

check('normalizePair 与方向无关', () => {
  assert.deepStrictEqual(normalizePair('b', 'a'), ['a', 'b'])
  assert.deepStrictEqual(normalizePair('a', 'b'), ['a', 'b'])
})

check('sanitizeMutexRules：丢弃非法项、去重、补齐缺失/重复 id', () => {
  const rules = sanitizeMutexRules([
    { id: 'r1', a: ' X ', b: 'Y' },
    { id: 'r2', a: 'Y', b: 'X' }, // 反向重复 → 丢弃
    { a: 'P', b: 'Q' }, // 缺 id → 生成
    { id: 'r1', a: 'M', b: 'N' }, // id 冲突 → 改写
    { id: 'r3', a: 'S', b: 'S' }, // 相同标签 → 丢弃
    { id: 'r4', a: '', b: 'T' }, // 空标签 → 丢弃
    'junk',
    null,
  ])
  assert.strictEqual(rules.length, 3)
  assert.deepStrictEqual(rules[0], { id: 'r1', a: 'X', b: 'Y' })
  assert.strictEqual(rules[1].a, 'P')
  assert.ok(rules[1].id, '应为缺失 id 生成新 id')
  assert.strictEqual(rules[2].a, 'M')
  assert.notStrictEqual(rules[2].id, 'r1', '重复 id 应被改写')
  assert.strictEqual(new Set(rules.map((r) => r.id)).size, 3, 'id 必须唯一')

  assert.deepStrictEqual(sanitizeMutexRules(undefined), [])
  assert.deepStrictEqual(sanitizeMutexRules('nope'), [])
})

check('sanitizeIgnoredConflicts：签名去重，时间兼容数字与 ISO 字符串', () => {
  const items = sanitizeIgnoredConflicts([
    { signature: 's1', ignoredAt: 123 },
    { signature: 's1', ignoredAt: 456 }, // 重复签名 → 丢弃
    { signature: 's2', ignoredAt: '2026-09-17T00:00:00.000Z' },
    { signature: '', ignoredAt: 1 }, // 空签名 → 丢弃
    { ignoredAt: 1 }, // 缺签名 → 丢弃
    'junk',
  ])
  assert.strictEqual(items.length, 2)
  assert.deepStrictEqual(items[0], { signature: 's1', ignoredAt: 123 })
  assert.strictEqual(items[1].ignoredAt, Date.parse('2026-09-17T00:00:00.000Z'))

  assert.deepStrictEqual(sanitizeIgnoredConflicts(undefined), [])
})

console.log(`\n全部 ${passed} 项通过`)
