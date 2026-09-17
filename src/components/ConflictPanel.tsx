import { useState } from 'react'
import type { Annotation } from '../types'
import type { ConflictItem } from '../lib/conflicts'
import { badgeColor } from '../lib/segments'

interface Props {
  /** 原文（用于展示交叠片段） */
  text: string
  /** 待审阅的冲突（未忽略），已按交叠起点排序 */
  conflicts: ConflictItem[]
  /** 已忽略且当前仍命中的冲突 */
  ignored: ConflictItem[]
  annotations: Annotation[]
  onFocus: (a: Annotation) => void
  onEdit: (a: Annotation) => void
  onIgnore: (c: ConflictItem) => void
  onRestore: (c: ConflictItem) => void
}

export function ConflictPanel(props: Props) {
  const [showIgnored, setShowIgnored] = useState(false)
  const byId = new Map(props.annotations.map((a) => [a.id, a]))

  if (props.conflicts.length === 0 && props.ignored.length === 0) return null

  const renderItem = (c: ConflictItem, index: number | null, isIgnored: boolean) => {
    const a = byId.get(c.aId)
    const b = byId.get(c.bId)
    if (!a || !b) return null
    return (
      <div className={`conflict-item ${isIgnored ? 'conflict-item-ignored' : ''}`} key={c.signature}>
        <div className="conflict-head">
          <span className="conflict-title">
            {index !== null ? `冲突 ${index + 1}` : '已忽略'} · 交叠 {c.overlapEnd - c.overlapStart} 字
          </span>
          <span className="form-spacer" />
          {isIgnored ? (
            <button className="btn btn-small btn-ghost" onClick={() => props.onRestore(c)}>
              恢复审阅
            </button>
          ) : (
            <button
              className="btn btn-small btn-ghost"
              title="忽略后，区间重定位不会让它重现；任一标注标签变化时会重新出现"
              onClick={() => props.onIgnore(c)}
            >
              标记为忽略
            </button>
          )}
        </div>
        <div className="conflict-rules">
          {c.rules.map((r) => (
            <span className="conflict-rule" key={r.id}>
              #{r.a} ↔ #{r.b}
            </span>
          ))}
        </div>
        <blockquote
          className="conflict-overlap"
          title={`交叠区间 [${c.overlapStart}, ${c.overlapEnd})`}
        >
          {props.text.slice(c.overlapStart, c.overlapEnd)}
        </blockquote>
        {[a, b].map((ann) => (
          <div className="conflict-ann" key={ann.id}>
            <div className="conflict-ann-main">
              <span className="ann-badge" style={{ backgroundColor: badgeColor(ann.id) }} />
              <span className="conflict-ann-quote">{ann.quote}</span>
            </div>
            <div className="conflict-ann-foot">
              {ann.tags.map((t) => (
                <span className="ann-tag" key={t}>
                  #{t}
                </span>
              ))}
              <span className="form-spacer" />
              <button className="btn btn-small btn-ghost" onClick={() => props.onFocus(ann)}>
                定位
              </button>
              <button className="btn btn-small btn-ghost" onClick={() => props.onEdit(ann)}>
                编辑
              </button>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <section className="side-section">
      <h2 className="side-heading side-heading-conflict">
        冲突审阅（{props.conflicts.length}）
      </h2>
      <p className="side-hint">
        已绑定标注区间相交且标签命中互斥规则，按交叠起点排序。可定位、编辑任一标注，或将冲突标记为忽略。
      </p>
      {props.conflicts.length === 0 && <p className="side-hint">当前没有待审阅的冲突。</p>}
      {props.conflicts.map((c, i) => renderItem(c, i, false))}
      {props.ignored.length > 0 && (
        <div className="conflict-ignored">
          <button
            type="button"
            className="conflict-ignored-toggle"
            onClick={() => setShowIgnored((v) => !v)}
          >
            {showIgnored ? '▾' : '▸'} 已忽略（{props.ignored.length}）
          </button>
          {showIgnored && props.ignored.map((c) => renderItem(c, null, true))}
        </div>
      )}
    </section>
  )
}
