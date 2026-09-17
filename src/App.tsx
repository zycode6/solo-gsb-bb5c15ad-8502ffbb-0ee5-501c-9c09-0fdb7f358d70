import { useEffect, useMemo, useRef, useState } from 'react'
import type { Annotation, DocumentData, ExportPayload, MutexRule } from './types'
import {
  fingerprint,
  makeContext,
  rebindAnnotation,
  relocateAnnotations,
  REASON_LABEL,
} from './lib/relocation'
import { buildSegments } from './lib/segments'
import {
  detectConflicts,
  sanitizeIgnoredConflicts,
  sanitizeMutexRules,
  validateRule,
  type ConflictItem,
} from './lib/conflicts'
import { loadDocument, saveDocument } from './lib/storage'
import { clearSelection, elementAtOffset } from './lib/dom'
import { TextView, type ViewRect } from './components/TextView'
import { TextEditor } from './components/TextEditor'
import { Sidebar } from './components/Sidebar'
import { Popover } from './components/Popover'
import { AnnotationForm } from './components/AnnotationForm'
import { ConflictPanel } from './components/ConflictPanel'
import { MutexRulesEditor } from './components/MutexRulesEditor'
import { badgeColor } from './lib/segments'

type PopoverState =
  | { kind: 'create'; range: { start: number; end: number }; rect: ViewRect }
  | { kind: 'inspect'; ids: string[]; rect: ViewRect }
  | { kind: 'edit'; id: string; rect: ViewRect }
  | { kind: 'rebind-confirm'; range: { start: number; end: number }; rect: ViewRect }

interface Notice {
  id: number
  auto: number
  pending: number
}

const EMPTY_DOC: DocumentData = {
  title: '未命名文档',
  text: '',
  annotations: [],
  mutexRules: [],
  ignoredConflicts: [],
  updatedAt: Date.now(),
}

function makeId(): string {
  return `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function makeRuleId(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export default function App() {
  const initialLoadedDoc = useRef<DocumentData | null>(null)
  const [doc, setDoc] = useState<DocumentData>(() => {
    const loaded = loadDocument()
    initialLoadedDoc.current = loaded
    return loaded ?? EMPTY_DOC
  })
  const [mode, setMode] = useState<'view' | 'edit'>(
    () => (initialLoadedDoc.current?.text ? 'view' : 'edit'),
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [rebindId, setRebindId] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)
  const rootElRef = useRef<HTMLElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 本地持久化
  useEffect(() => {
    saveDocument(doc)
  }, [doc])

  // 通知自动消失
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 7000)
    return () => clearTimeout(t)
  }, [notice])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    doc.annotations.forEach((a) => a.tags.forEach((t) => set.add(t)))
    return [...set]
  }, [doc.annotations])

  const segments = useMemo(
    () =>
      buildSegments(
        doc.text.length,
        doc.annotations
          .filter((a) => a.status === 'bound' && a.end > a.start)
          .map((a) => ({ start: a.start, end: a.end, id: a.id })),
      ),
    [doc.text.length, doc.annotations],
  )

  const rebindTarget = doc.annotations.find((a) => a.id === rebindId) ?? null
  const pendingCount = doc.annotations.filter((a) => a.status === 'pending').length

  // ---------- 冲突审阅 ----------

  const conflicts = useMemo(
    () => detectConflicts(doc.annotations, doc.mutexRules),
    [doc.annotations, doc.mutexRules],
  )
  const ignoredSignatures = useMemo(
    () => new Set(doc.ignoredConflicts.map((x) => x.signature)),
    [doc.ignoredConflicts],
  )
  const visibleConflicts = useMemo(
    () => conflicts.filter((c) => !ignoredSignatures.has(c.signature)),
    [conflicts, ignoredSignatures],
  )
  const ignoredConflictItems = useMemo(
    () => conflicts.filter((c) => ignoredSignatures.has(c.signature)),
    [conflicts, ignoredSignatures],
  )

  const addMutexRule = (a: string, b: string): string | null => {
    const err = validateRule(a, b, doc.mutexRules)
    if (err) return err
    const rule: MutexRule = { id: makeRuleId(), a, b }
    setDoc((d) => ({ ...d, mutexRules: [...d.mutexRules, rule], updatedAt: Date.now() }))
    return null
  }

  const removeMutexRule = (id: string) => {
    setDoc((d) => ({
      ...d,
      mutexRules: d.mutexRules.filter((r) => r.id !== id),
      updatedAt: Date.now(),
    }))
  }

  const ignoreConflict = (c: ConflictItem) => {
    setDoc((d) =>
      d.ignoredConflicts.some((x) => x.signature === c.signature)
        ? d
        : {
            ...d,
            ignoredConflicts: [
              ...d.ignoredConflicts,
              { signature: c.signature, ignoredAt: Date.now() },
            ],
            updatedAt: Date.now(),
          },
    )
  }

  const restoreConflict = (c: ConflictItem) => {
    setDoc((d) => ({
      ...d,
      ignoredConflicts: d.ignoredConflicts.filter((x) => x.signature !== c.signature),
      updatedAt: Date.now(),
    }))
  }

  // ---------- 选区与弹层 ----------

  const handleSelect = (range: { start: number; end: number }, rect: ViewRect) => {
    if (rebindId) {
      setPopover({ kind: 'rebind-confirm', range, rect })
    } else {
      setPopover({ kind: 'create', range, rect })
    }
  }

  const handleInspect = (ids: string[], rect: ViewRect) => {
    if (rebindId) return
    setPopover({ kind: 'inspect', ids, rect })
  }

  // ---------- 标注增改删 ----------

  const createAnnotation = (data: { note: string; tags: string[] }) => {
    if (popover?.kind !== 'create') return
    const { start, end } = popover.range
    const ctx = makeContext(doc.text, start, end)
    const now = Date.now()
    const a: Annotation = {
      id: makeId(),
      quote: doc.text.slice(start, end),
      start,
      end,
      note: data.note,
      tags: data.tags,
      status: 'bound',
      createdAt: now,
      updatedAt: now,
      contextBefore: ctx.before,
      contextAfter: ctx.after,
    }
    setDoc((d) => ({ ...d, annotations: [...d.annotations, a], updatedAt: now }))
    setActiveId(a.id)
    setPopover(null)
    clearSelection()
  }

  const saveAnnotation = (id: string, data: { note: string; tags: string[] }) => {
    setDoc((d) => ({
      ...d,
      annotations: d.annotations.map((a) =>
        a.id === id ? { ...a, ...data, updatedAt: Date.now() } : a,
      ),
    }))
    setPopover(null)
  }

  const deleteAnnotation = (id: string) => {
    setDoc((d) => ({
      ...d,
      annotations: d.annotations.filter((a) => a.id !== id),
      updatedAt: Date.now(),
    }))
    if (activeId === id) setActiveId(null)
    if (rebindId === id) setRebindId(null)
    setPopover(null)
  }

  // ---------- 编辑原文与重定位 ----------

  const applyEdit = (title: string, text: string) => {
    const oldFingerprint = fingerprint(doc.text)
    const textChanged = text !== doc.text

    if (textChanged && doc.annotations.length > 0) {
      const relocated = relocateAnnotations(doc.annotations, text, oldFingerprint)
      const auto = relocated.filter(
        (a) => a.status === 'bound' && a.lastRelocation?.reason !== 'failed',
      ).length
      const pending = relocated.filter((a) => a.status === 'pending').length
      setDoc((d) => ({ ...d, title, text, annotations: relocated, updatedAt: Date.now() }))
      setNotice({ id: Date.now(), auto, pending })
    } else {
      setDoc((d) => ({ ...d, title, text, updatedAt: Date.now() }))
    }

    setMode('view')
    setPopover(null)
    setActiveId(null)
    clearSelection()
  }

  // ---------- 手动重新绑定 ----------

  const startRebind = (a: Annotation) => {
    setRebindId(a.id)
    setActiveId(a.id)
    setPopover(null)
    clearSelection()
  }

  const cancelRebind = () => {
    setRebindId(null)
    setPopover(null)
    clearSelection()
  }

  const confirmRebind = (range: { start: number; end: number }) => {
    if (!rebindId) return
    setDoc((d) => ({
      ...d,
      annotations: d.annotations.map((a) =>
        a.id === rebindId ? rebindAnnotation(a, d.text, range.start, range.end) : a,
      ),
      updatedAt: Date.now(),
    }))
    setRebindId(null)
    setPopover(null)
    clearSelection()
  }

  // ---------- 定位 ----------

  const focusAnnotation = (a: Annotation) => {
    if (a.status !== 'bound') return
    setActiveId(a.id)
    requestAnimationFrame(() => {
      const el = elementAtOffset(rootElRef.current as HTMLElement, a.start)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  /** 居中弹层打开编辑表单（侧栏与冲突审阅面板共用） */
  const openEdit = (a: Annotation) => {
    setPopover({
      kind: 'edit',
      id: a.id,
      rect: { top: -1, bottom: -1, left: -1, right: -1 },
    })
  }

  // ---------- 导入 / 导出 / 新建 ----------

  const exportJson = () => {
    const payload: ExportPayload = {
      format: 'anchor-annotation-console',
      version: 1,
      exportedAt: new Date().toISOString(),
      document: {
        title: doc.title,
        text: doc.text,
        annotationCount: doc.annotations.length,
      },
      annotations: doc.annotations.map((a) => ({
        id: a.id,
        status: a.status,
        quote: a.quote,
        note: a.note,
        tags: a.tags,
        position: a.status === 'bound' ? { start: a.start, end: a.end } : null,
        context: { before: a.contextBefore, after: a.contextAfter },
        pendingReason: a.pendingReason ?? null,
        lastRelocation: a.lastRelocation ?? null,
        createdAt: new Date(a.createdAt).toISOString(),
        updatedAt: new Date(a.updatedAt).toISOString(),
      })),
      mutexRules: doc.mutexRules,
      ignoredConflicts: doc.ignoredConflicts.map((x) => ({
        signature: x.signature,
        ignoredAt: new Date(x.ignoredAt).toISOString(),
      })),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const safeTitle = doc.title.replace(/[\\/:*?"<>|\s]+/g, '_')
    link.href = url
    link.download = `标注导出_${safeTitle}_${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  const importJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as ExportPayload
      if (parsed.format !== 'anchor-annotation-console' || typeof parsed.document?.text !== 'string') {
        alert('无法识别的文件格式，请选择本工具导出的 JSON。')
        return
      }
      if (
        !confirm(
          `导入「${parsed.document.title}」将替换当前文档（当前本地数据可先导出备份）。是否继续？`,
        )
      ) {
        return
      }
      const annotations: Annotation[] = parsed.annotations.map((x, i) => ({
        id: x.id || `imp_${i}`,
        quote: x.quote,
        start: x.position?.start ?? 0,
        end: x.position?.end ?? 0,
        note: x.note,
        tags: x.tags,
        status: x.status,
        createdAt: x.createdAt ? Date.parse(x.createdAt) || Date.now() : Date.now(),
        updatedAt: x.updatedAt ? Date.parse(x.updatedAt) || Date.now() : Date.now(),
        contextBefore: x.context?.before ?? '',
        contextAfter: x.context?.after ?? '',
        pendingReason: x.pendingReason ?? undefined,
        lastRelocation: x.lastRelocation ?? undefined,
      }))
      setDoc({
        title: parsed.document.title,
        text: parsed.document.text,
        annotations,
        // 旧版本导出文件没有这两个字段，清洗函数会按空配置处理
        mutexRules: sanitizeMutexRules(parsed.mutexRules),
        ignoredConflicts: sanitizeIgnoredConflicts(parsed.ignoredConflicts),
        updatedAt: Date.now(),
      })
      setMode('view')
      setPopover(null)
      setRebindId(null)
      setActiveId(null)
    } catch {
      alert('文件解析失败，请确认是有效的 JSON 导出文件。')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const newDocument = () => {
    if (
      doc.annotations.length > 0 &&
      !confirm('将清空当前原文与全部标注（建议先导出 JSON 备份），确定新建吗？')
    ) {
      return
    }
    setDoc({ ...EMPTY_DOC, updatedAt: Date.now() })
    setMode('edit')
    setPopover(null)
    setRebindId(null)
    setActiveId(null)
  }

  // ---------- 渲染 ----------

  const editingAnnotation = popover?.kind === 'edit'
    ? doc.annotations.find((a) => a.id === popover.id) ?? null
    : null

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">⚓</span>
          <span className="brand-name">原文锚点标注台</span>
        </div>
        <div className="doc-title-wrap">
          {mode === 'view' && <h1 className="doc-title">{doc.title}</h1>}
        </div>
        <div className="topbar-actions">
          {mode === 'view' ? (
            <button className="btn btn-primary" onClick={() => setMode('edit')}>
              {doc.text ? '粘贴 / 编辑原文' : '粘贴原文'}
            </button>
          ) : (
            <button className="btn btn-ghost" onClick={() => setMode('view')} disabled={!doc.text}>
              返回查看
            </button>
          )}
          <button className="btn btn-ghost" onClick={() => fileInputRef.current?.click()}>
            导入 JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void importJson(f)
            }}
          />
          <button
            className="btn btn-ghost"
            onClick={exportJson}
            disabled={!doc.text}
            title="导出含原文、引文、上下文及状态的 JSON"
          >
            导出 JSON
          </button>
          <button className="btn btn-ghost" onClick={newDocument}>
            新建
          </button>
        </div>
      </header>

      {notice && (
        <div className={`toast ${notice.pending > 0 ? 'toast-warn' : ''}`}>
          {notice.auto > 0 && <span>{notice.auto} 条标注已自动重定位。</span>}
          {notice.pending > 0 && (
            <strong>{notice.pending} 条标注进入待处理列表，需要手动绑定。</strong>
          )}
          <button className="toast-close" onClick={() => setNotice(null)}>
            ×
          </button>
        </div>
      )}

      {mode === 'edit' ? (
        <main className="main main-edit">
          <TextEditor
            initialTitle={doc.title}
            initialText={doc.text}
            annotationCount={doc.annotations.length}
            onCancel={() => setMode(doc.text ? 'view' : 'edit')}
            onApply={applyEdit}
          />
        </main>
      ) : (
        <main className="main">
          <section className="content-pane">
            {rebindTarget && (
              <div className="rebind-banner">
                <span>
                  正在为待处理标注选择新区间：
                  <strong>「{rebindTarget.quote.slice(0, 40) || '空引文'}
                  {rebindTarget.quote.length > 40 ? '…' : ''}」</strong>
                  ，请在原文中拖选目标片段。
                </span>
                <button className="btn btn-small btn-ghost" onClick={cancelRebind}>
                  取消绑定
                </button>
              </div>
            )}
            <div className="text-scroll">
              <TextView
                text={doc.text}
                segments={segments}
                activeIds={activeId ? [activeId] : []}
                rebinding={!!rebindId}
                onSelect={handleSelect}
                onInspect={handleInspect}
                registerRef={(el) => {
                  rootElRef.current = el
                }}
              />
            </div>
            <footer className="content-foot">
              共 {doc.text.length} 字 · {doc.annotations.length} 条标注
              {pendingCount > 0 && <span className="foot-pending">（{pendingCount} 条待处理）</span>}
              {visibleConflicts.length > 0 && (
                <span className="foot-conflict">（{visibleConflicts.length} 处标签冲突）</span>
              )}
              {' '}· 数据自动保存在本浏览器
            </footer>
          </section>

          <Sidebar
            annotations={doc.annotations}
            activeId={activeId}
            onFocus={focusAnnotation}
            onEdit={openEdit}
            onRebindStart={startRebind}
            onDelete={(a) => deleteAnnotation(a.id)}
            topSections={
              <>
                <ConflictPanel
                  text={doc.text}
                  conflicts={visibleConflicts}
                  ignored={ignoredConflictItems}
                  annotations={doc.annotations}
                  onFocus={focusAnnotation}
                  onEdit={openEdit}
                  onIgnore={ignoreConflict}
                  onRestore={restoreConflict}
                />
                <MutexRulesEditor
                  rules={doc.mutexRules}
                  suggestions={allTags}
                  onAdd={addMutexRule}
                  onRemove={removeMutexRule}
                />
              </>
            }
          />
        </main>
      )}

      {/* 浮动面板 */}
      {popover && (
        <Popover rect={popover.rect} onClose={() => setPopover(null)}>
          {popover.kind === 'create' && (
            <AnnotationForm
              mode="create"
              quote={doc.text.slice(popover.range.start, popover.range.end)}
              allTags={allTags}
              onCancel={() => {
                setPopover(null)
                clearSelection()
              }}
              onCreate={createAnnotation}
            />
          )}

          {popover.kind === 'edit' && editingAnnotation && (
            <AnnotationForm
              mode="edit"
              annotation={editingAnnotation}
              allTags={allTags}
              onCancel={() => setPopover(null)}
              onSave={(data) => saveAnnotation(editingAnnotation.id, data)}
              onDelete={() => deleteAnnotation(editingAnnotation.id)}
            />
          )}

          {popover.kind === 'rebind-confirm' && (
            <div className="annotation-form">
              <div className="form-title">确认绑定到新片段</div>
              <blockquote className="form-quote">
                {doc.text.slice(popover.range.start, popover.range.end)}
              </blockquote>
              <p className="form-hint">
                绑定后引文与上下文快照将更新为新位置内容，之后的编辑仍可据此自动重定位。
              </p>
              <div className="form-actions">
                <span className="form-spacer" />
                <button className="btn btn-ghost" onClick={() => setPopover(null)}>
                  重新选择
                </button>
                <button className="btn btn-primary" onClick={() => confirmRebind(popover.range)}>
                  确认绑定
                </button>
              </div>
            </div>
          )}

          {popover.kind === 'inspect' && (
            <div className="inspect-list">
              <div className="form-title">
                此区间的 {popover.ids.length} 条标注
              </div>
              {popover.ids.map((id) => {
                const a = doc.annotations.find((x) => x.id === id)
                if (!a) return null
                return (
                  <div key={id} className="inspect-item">
                    <div className="inspect-head">
                      <span
                        className="ann-badge"
                        style={{ backgroundColor: badgeColor(a.id) }}
                      />
                      {a.tags.map((t) => (
                        <span className="ann-tag" key={t}>
                          #{t}
                        </span>
                      ))}
                      <span className="form-spacer" />
                      <button
                        className="btn btn-small btn-ghost"
                        onClick={() => setPopover({ kind: 'edit', id, rect: popover.rect })}
                      >
                        编辑
                      </button>
                    </div>
                    <p className="inspect-note">{a.note || <em>（无备注）</em>}</p>
                    {a.lastRelocation && a.lastRelocation.reason !== 'failed' && (
                      <p className="ann-meta">
                        {REASON_LABEL[a.lastRelocation.reason]}
                        {a.lastRelocation.reason === 'context-score' &&
                          `（${a.lastRelocation.score} 字）`}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Popover>
      )}
    </div>
  )
}
