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

export interface DocumentData {
  title: string
  text: string
  annotations: Annotation[]
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
}
