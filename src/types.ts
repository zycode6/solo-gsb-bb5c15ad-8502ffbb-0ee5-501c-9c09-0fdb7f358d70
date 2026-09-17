// 核心数据模型

/** 标注状态：已绑定区间 / 待人工处理（重定位失败或最高分并列、得分为 0） */
export type AnnotationStatus = 'bound' | 'pending'

/** 上一次重定位所走的策略 */
export type RelocateReason =
  | 'local-exact' // 旧位置前后 200 字内精确匹配
  | 'unique' // 全文唯一匹配
  | 'context-score' // 前后文相同字符数评分
  | 'failed' // 未找到 / 并列 / 得分为 0

export interface RelocationInfo {
  reason: RelocateReason
  /** 评分命中时的相同字符数（左右连续相同字符之和） */
  score: number
  /** 重定位所基于的旧起点（字符偏移） */
  oldStart: number
  oldEnd: number
  /** 重定位发生时所对照的原文版本（用长度+摘要生成指纹） */
  sourceFingerprint: string
  timestamp: number
}

export interface Annotation {
  id: string
  quote: string
  start: number
  end: number
  note: string
  tags: string[]
  status: AnnotationStatus
  createdAt: number
  updatedAt: number
  /** 创建 / 最近一次成功绑定时截取的上下文（两侧各 CONTEXT_RADIUS 字） */
  contextBefore: string
  contextAfter: string
  /** 上一次自动重定位的诊断信息 */
  lastRelocation?: RelocationInfo
  /** 待处理原因说明（用于界面展示，不参与算法） */
  pendingReason?: string
}

/** 互斥标签对：两条已绑定标注区间相交且分别命中同一规则时构成冲突 */
export interface MutexRule {
  id: string
  a: string
  b: string
}

/**
 * 一条被忽略的冲突。
 * 签名 = 两个标注 ID（排序）+ 命中规则 ID 集合（排序），不含位置信息：
 * 区间重定位不改变签名；标签变化导致命中规则集合变化时签名改变，冲突自动重新出现。
 */
export interface IgnoredConflict {
  signature: string
  ignoredAt: number
}

export interface DocumentData {
  title: string
  text: string
  annotations: Annotation[]
  /** 用户配置的互斥标签对 */
  mutexRules: MutexRule[]
  /** 已忽略冲突的签名记录 */
  ignoredConflicts: IgnoredConflict[]
  updatedAt: number
}

/** 导出 JSON 的顶层结构 */
export interface ExportPayload {
  format: 'anchor-annotation-console'
  version: 1
  exportedAt: string
  document: {
    title: string
    text: string
    annotationCount: number
  }
  annotations: Array<{
    id: string
    status: AnnotationStatus
    quote: string
    note: string
    tags: string[]
    position: { start: number; end: number } | null
    context: { before: string; after: string }
    pendingReason: string | null
    lastRelocation: RelocationInfo | null
    createdAt: string
    updatedAt: string
  }>
  /** 互斥标签对配置（旧版本导出文件可能缺失，导入时按空数组处理） */
  mutexRules: MutexRule[]
  /** 已忽略冲突签名（旧版本导出文件可能缺失，导入时按空数组处理） */
  ignoredConflicts: Array<{ signature: string; ignoredAt: string }>
}
