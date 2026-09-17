import type { ReactNode } from 'react'
import type { Annotation } from '../types'
import { REASON_LABEL } from '../lib/relocation'
import { badgeColor } from '../lib/segments'

interface Props {
  annotations: Annotation[]
  activeId: string | null
  onFocus: (a: Annotation) => void
  onEdit: (a: Annotation) => void
  onRebindStart: (a: Annotation) => void
  onDelete: (a: Annotation) => void
  /** 渲染在待处理/标注列表之前的额外分区（如冲突审阅、互斥规则） */
  topSections?: ReactNode
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function AnnotationItem({
  a,
  active,
  onFocus,
  onEdit,
  onRebindStart,
  onDelete,
}: {
  a: Annotation
  active: boolean
} & Omit<Props, 'annotations' | 'activeId'>) {
  return (
    <div className={`ann-item ${active ? 'ann-active' : ''} ${a.status === 'pending' ? 'ann-pending' : ''}`}>
      <button
        type="button"
        className="ann-main"
        title="在原文中定位"
        onClick={() => (a.status === 'bound' ? onFocus(a) : onRebindStart(a))}
      >
        <span className="ann-badge" style={{ backgroundColor: badgeColor(a.id) }} />
        <span className="ann-quote">
          {a.status === 'pending' && <em className="ann-pending-flag">[待绑定] </em>}
          {a.quote || <span className="ann-empty-quote">（空引文）</span>}
        </span>
      </button>
      {a.tags.length > 0 && (
        <div className="ann-tags">
          {a.tags.map((t) => (
            <span className="ann-tag" key={t}>
              #{t}
            </span>
          ))}
        </div>
      )}
      {a.note && <p className="ann-note">{a.note}</p>}
      {a.status === 'pending' && a.pendingReason && (
        <p className="ann-pending-reason">{a.pendingReason}</p>
      )}
      {a.status === 'bound' && a.lastRelocation && (
        <p className="ann-meta">
          {REASON_LABEL[a.lastRelocation.reason]}
          {a.lastRelocation.reason === 'context-score' && `（${a.lastRelocation.score} 字）`}
          {' · '}
          {formatTime(a.lastRelocation.timestamp)}
        </p>
      )}
      <div className="ann-actions">
        {a.status === 'pending' ? (
          <button className="btn btn-small btn-warn" onClick={() => onRebindStart(a)}>
            重新选择片段
          </button>
        ) : (
          <button className="btn btn-small btn-ghost" onClick={() => onFocus(a)}>
            定位
          </button>
        )}
        <button className="btn btn-small btn-ghost" onClick={() => onEdit(a)}>
          编辑
        </button>
        <button
          className="btn btn-small btn-ghost btn-danger-text"
          onClick={() => {
            if (confirm('确定删除这条标注吗？')) onDelete(a)
          }}
        >
          删除
        </button>
      </div>
    </div>
  )
}

export function Sidebar(props: Props) {
  const pending = props.annotations
    .filter((a) => a.status === 'pending')
    .sort((x, y) => y.updatedAt - x.updatedAt)
  const bound = props.annotations
    .filter((a) => a.status === 'bound')
    .sort((x, y) => x.start - y.start)

  return (
    <aside className="sidebar">
      {props.topSections}
      {pending.length > 0 && (
        <section className="side-section">
          <h2 className="side-heading side-heading-pending">
            待处理（{pending.length}）
          </h2>
          <p className="side-hint">这些标注无法安全地自动重定位，请在原文中重新选择片段完成绑定。</p>
          {pending.map((a) => (
            <AnnotationItem
              key={a.id}
              a={a}
              active={props.activeId === a.id}
              onFocus={props.onFocus}
              onEdit={props.onEdit}
              onRebindStart={props.onRebindStart}
              onDelete={props.onDelete}
            />
          ))}
        </section>
      )}
      <section className="side-section">
        <h2 className="side-heading">
          标注列表（{bound.length}
          {pending.length > 0 ? ` / 共 ${props.annotations.length}` : ''}）
        </h2>
        {bound.length === 0 && pending.length === 0 && (
          <p className="side-hint">在左侧原文中拖选一段文字即可添加标注。同一区间可以保留任意多条标注。</p>
        )}
        {bound.map((a) => (
          <AnnotationItem
            key={a.id}
            a={a}
            active={props.activeId === a.id}
            onFocus={props.onFocus}
            onEdit={props.onEdit}
            onRebindStart={props.onRebindStart}
            onDelete={props.onDelete}
          />
        ))}
      </section>
    </aside>
  )
}
