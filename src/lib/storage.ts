import type { DocumentData } from '../types'

const STORAGE_KEY = 'anchor-annotation-console:v1'

export function loadDocument(): DocumentData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as DocumentData
    if (typeof data.text !== 'string' || !Array.isArray(data.annotations)) {
      return null
    }
    return {
      title: typeof data.title === 'string' ? data.title : '未命名文档',
      text: data.text,
      annotations: data.annotations,
      updatedAt: data.updatedAt ?? Date.now(),
    }
  } catch {
    return null
  }
}

export function saveDocument(doc: DocumentData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(doc))
  } catch {
    // 存储满或隐私模式下静默失败；导出仍可使用
  }
}

export function clearDocument(): void {
  localStorage.removeItem(STORAGE_KEY)
}
