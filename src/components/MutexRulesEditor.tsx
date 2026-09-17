import { useState } from 'react'
import type { MutexRule } from '../types'

interface Props {
  rules: MutexRule[]
  /** 标签补全候选（取自现有标注标签） */
  suggestions: string[]
  /** 返回错误文案；添加成功返回 null */
  onAdd: (a: string, b: string) => string | null
  onRemove: (id: string) => void
}

export function MutexRulesEditor({ rules, suggestions, onAdd, onRemove }: Props) {
  const [open, setOpen] = useState(rules.length === 0)
  const [tagA, setTagA] = useState('')
  const [tagB, setTagB] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    const err = onAdd(tagA.trim().replace(/^#/, ''), tagB.trim().replace(/^#/, ''))
    setError(err)
    if (!err) {
      setTagA('')
      setTagB('')
    }
  }

  return (
    <section className="side-section">
      <h2 className="side-heading">
        互斥规则（{rules.length}）
        <span className="form-spacer" />
        <button className="btn btn-small btn-ghost" onClick={() => setOpen((v) => !v)}>
          {open ? '收起' : '管理'}
        </button>
      </h2>
      {open && (
        <>
          <p className="side-hint">
            配置互斥标签对后，区间相交且分别命中同一规则的两条已绑定标注会进入上方的「冲突审阅」。
          </p>
          {rules.length > 0 && (
            <div className="rule-list">
              {rules.map((r) => (
                <div className="rule-item" key={r.id}>
                  <span className="ann-tag">#{r.a}</span>
                  <span className="rule-sep">↔</span>
                  <span className="ann-tag">#{r.b}</span>
                  <span className="form-spacer" />
                  <button
                    type="button"
                    className="tag-chip-x"
                    aria-label={`删除规则 ${r.a} ↔ ${r.b}`}
                    onClick={() => onRemove(r.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="rule-form">
            <input
              value={tagA}
              list="mutex-tag-suggestions"
              placeholder="标签 A"
              onChange={(e) => setTagA(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submit()
                }
              }}
            />
            <span className="rule-sep">↔</span>
            <input
              value={tagB}
              list="mutex-tag-suggestions"
              placeholder="标签 B"
              onChange={(e) => setTagB(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submit()
                }
              }}
            />
            <button
              className="btn btn-small btn-primary"
              disabled={!tagA.trim() || !tagB.trim()}
              onClick={submit}
            >
              添加
            </button>
          </div>
          <datalist id="mutex-tag-suggestions">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          {error && <p className="rule-error">{error}</p>}
        </>
      )}
    </section>
  )
}
