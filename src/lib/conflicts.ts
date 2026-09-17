// 冲突审阅：互斥标签对规则、冲突检测与忽略签名
//
// 判定规则（仅针对已绑定标注）：
//   两条标注区间有至少 1 个字符交集，且其标签分别命中同一互斥对（任一方向）。
// 同一标注对命中多条规则时只产生一个冲突项，命中规则全部列出。
// 忽略签名 = 两个标注 ID（排序）+ 命中规则 ID 集合（排序），不含位置：
//   区间重定位签名不变（忽略不失效）；标签变化改变命中集合时签名改变（自动重新出现）。

import type { Annotation, IgnoredConflict, MutexRule } from '../types'

export interface ConflictItem {
  /** 两条标注 id 排序后的稳定对键 */
  pairKey: string
  aId: string
  bId: string
  /** 交叠区间 [overlapStart, overlapEnd)，长度 ≥ 1 */
  overlapStart: number
  overlapEnd: number
  /** 命中的全部互斥规则 */
  rules: MutexRule[]
  /** 忽略签名：两个标注 ID + 命中规则集合 */
  signature: string
}

/** 标注对的稳定键（与顺序无关） */
export function pairKeyOf(aId: string, bId: string): string {
  return [aId, bId].sort().join('\u0001')
}

export function conflictSignature(aId: string, bId: string, ruleIds: string[]): string {
  return `${pairKeyOf(aId, bId)}|${[...ruleIds].sort().join(',')}`
}

/** 两条标注的标签是否命中某条互斥规则（任一方向） */
function ruleHits(rule: MutexRule, a: Annotation, b: Annotation): boolean {
  return (
    (a.tags.includes(rule.a) && b.tags.includes(rule.b)) ||
    (a.tags.includes(rule.b) && b.tags.includes(rule.a))
  )
}

/**
 * 检测全部冲突，按交叠起点升序返回（起点相同则终点、对键依次兜底，保证稳定）。
 * 只统计 status 为 bound 且区间非空的标注。
 */
export function detectConflicts(annotations: Annotation[], rules: MutexRule[]): ConflictItem[] {
  if (rules.length === 0) return []
  const bound = annotations.filter((a) => a.status === 'bound' && a.end > a.start)
  const items: ConflictItem[] = []
  for (let i = 0; i < bound.length; i++) {
    for (let j = i + 1; j < bound.length; j++) {
      const a = bound[i]
      const b = bound[j]
      const overlapStart = Math.max(a.start, b.start)
      const overlapEnd = Math.min(a.end, b.end)
      if (overlapEnd - overlapStart < 1) continue // 至少 1 个字符交集
      const hit = rules.filter((r) => ruleHits(r, a, b))
      if (hit.length === 0) continue
      items.push({
        pairKey: pairKeyOf(a.id, b.id),
        aId: a.id,
        bId: b.id,
        overlapStart,
        overlapEnd,
        rules: hit,
        signature: conflictSignature(a.id, b.id, hit.map((r) => r.id)),
      })
    }
  }
  items.sort(
    (x, y) =>
      x.overlapStart - y.overlapStart ||
      x.overlapEnd - y.overlapEnd ||
      x.pairKey.localeCompare(y.pairKey),
  )
  return items
}

// ---------- 规则校验与数据清洗 ----------

/** 标签对的规范化（与方向无关），用于去重 */
export function normalizePair(a: string, b: string): [string, string] {
  return a <= b ? [a, b] : [b, a]
}

/** 新增规则前的校验；返回错误文案，合法时返回 null */
export function validateRule(a: string, b: string, existing: MutexRule[]): string | null {
  if (!a || !b) return '请填写两个标签'
  if (a === b) return '两个标签不能相同'
  const [x, y] = normalizePair(a, b)
  const dup = existing.some((r) => {
    const [p, q] = normalizePair(r.a, r.b)
    return p === x && q === y
  })
  return dup ? '该互斥对已存在' : null
}

/**
 * 清洗外部输入的互斥规则（localStorage / 导入 JSON）：
 * 丢弃非法项，按规范化标签对去重，缺失/重复的 id 自动补齐。
 */
export function sanitizeMutexRules(raw: unknown): MutexRule[] {
  if (!Array.isArray(raw)) return []
  const out: MutexRule[] = []
  const seenPairs = new Set<string>()
  const usedIds = new Set<string>()
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const { a, b, id } = r as Record<string, unknown>
    if (typeof a !== 'string' || typeof b !== 'string') continue
    const ta = a.trim()
    const tb = b.trim()
    if (!ta || !tb || ta === tb) continue
    const pairKey = normalizePair(ta, tb).join('\u0001')
    if (seenPairs.has(pairKey)) continue
    seenPairs.add(pairKey)
    let rid = typeof id === 'string' && id ? id : `r_gen_${out.length}`
    while (usedIds.has(rid)) rid = `${rid}_`
    usedIds.add(rid)
    out.push({ id: rid, a: ta, b: tb })
  }
  return out
}

/**
 * 清洗外部输入的忽略记录：丢弃非法项、按签名去重；
 * ignoredAt 兼容时间戳数字与 ISO 字符串。
 */
export function sanitizeIgnoredConflicts(raw: unknown): IgnoredConflict[] {
  if (!Array.isArray(raw)) return []
  const out: IgnoredConflict[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const { signature, ignoredAt } = item as Record<string, unknown>
    if (typeof signature !== 'string' || !signature || seen.has(signature)) continue
    seen.add(signature)
    let ts = Date.now()
    if (typeof ignoredAt === 'number' && Number.isFinite(ignoredAt)) ts = ignoredAt
    else if (typeof ignoredAt === 'string') ts = Date.parse(ignoredAt) || Date.now()
    out.push({ signature, ignoredAt: ts })
  }
  return out
}
