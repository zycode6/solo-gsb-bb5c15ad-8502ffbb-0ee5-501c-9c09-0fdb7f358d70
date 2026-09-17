import assert from 'node:assert'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
})
const { window } = dom
;(globalThis as unknown as { window: typeof window }).window = window
;(globalThis as unknown as { document: Document }).document = window.document
;(globalThis as unknown as { navigator: Navigator }).navigator = window.navigator
;(globalThis as unknown as { HTMLElement: typeof HTMLElement }).HTMLElement =
  window.HTMLElement
;(globalThis as unknown as { Element: typeof Element }).Element = window.Element
;(globalThis as unknown as { Node: typeof Node }).Node = window.Node
;(globalThis as unknown as { NodeFilter: typeof NodeFilter }).NodeFilter =
  window.NodeFilter
;(globalThis as unknown as { getSelection: typeof window.getSelection }).getSelection =
  window.getSelection.bind(window)
;(globalThis as unknown as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame =
  ((cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0) as unknown) as typeof requestAnimationFrame
;(globalThis as unknown as { cancelAnimationFrame: typeof cancelAnimationFrame }).cancelAnimationFrame =
  ((id: number) => clearTimeout(id) as unknown) as typeof cancelAnimationFrame
;(globalThis as unknown as { localStorage: Storage }).localStorage = window.localStorage

const React = (await import('react')).default
const { createRoot } = await import('react-dom/client')
const { default: App } = await import('../src/App')

const container = document.getElementById('root')!
const root = createRoot(container)

await new Promise<void>((resolve) => {
  root.render(
    React.createElement(React.StrictMode, null, React.createElement(App)),
  )
  setTimeout(resolve, 100)
})

const html = container.innerHTML
assert.ok(html.includes('原文锚点标注台'), '顶栏标题应渲染')
assert.ok(html.includes('粘贴'), '空文档应显示粘贴入口')
console.log('  ✓ 空文档首次渲染成功（编辑模式）')

// 模拟已保存文档 + 一条 pending 标注的渲染路径
const saved = {
  title: '测试文档',
  text: '这是一段用于渲染冒烟测试的原文，包含【重点片段】和普通文字。'.repeat(3),
  updatedAt: Date.now(),
  annotations: [
    {
      id: 'a_bound',
      quote: '重点片段',
      start: 0,
      end: 4,
      note: '备注一',
      tags: ['重点', '测试'],
      status: 'bound',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      contextBefore: '',
      contextAfter: '】和普通文字。',
    },
    {
      id: 'a_pending',
      quote: '已删除的引文XYZ',
      start: 100,
      end: 110,
      note: '',
      tags: [],
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      contextBefore: '前文',
      contextAfter: '后文',
      pendingReason: '原文中已找不到该引文，需要手动重新选择',
    },
  ],
}
// start/end 对齐到真实位置，避免高亮错位
saved.annotations[0].start = saved.text.indexOf('重点片段') - 1
saved.annotations[0].end = saved.annotations[0].start + 6

localStorage.setItem('anchor-annotation-console:v1', JSON.stringify(saved))

// 重新挂载，让 App 从 localStorage 读取初始状态
root.unmount()
const container2 = document.createElement('div')
container2.id = 'root2'
document.body.appendChild(container2)
const root2 = createRoot(container2)

await new Promise<void>((resolve) => {
  root2.render(
    React.createElement(React.StrictMode, null, React.createElement(App)),
  )
  setTimeout(resolve, 100)
})

const html2 = container2.innerHTML
assert.ok(html2.includes('测试文档'), '应显示文档标题')
assert.ok(html2.includes('待处理'), '应渲染待处理分区')
assert.ok(html2.includes('重新选择片段'), 'pending 标注应有重绑按钮')
assert.ok(html2.includes('备注一'), '应渲染备注')
assert.ok(html2.includes('#重点'), '应渲染标签')
assert.ok(html2.includes('互斥规则'), '旧数据（无规则字段）也应渲染规则配置区')
assert.ok(!html2.includes('冲突审阅（'), '未配置规则时不渲染冲突审阅面板')
console.log('  ✓ 含 bound/pending 标注的文档渲染成功')

root2.unmount()
container2.remove()

// 配置互斥规则 + 两条区间相交的冲突标注 → 冲突审阅面板
const saved3 = {
  title: '冲突文档',
  text: '甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥',
  updatedAt: Date.now(),
  mutexRules: [{ id: 'r1', a: '重点', b: '存疑' }],
  ignoredConflicts: [],
  annotations: [
    {
      id: 'a_x',
      quote: '丙丁戊己',
      start: 2,
      end: 6,
      note: '',
      tags: ['重点'],
      status: 'bound',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      contextBefore: '甲乙',
      contextAfter: '庚辛',
    },
    {
      id: 'a_y',
      quote: '戊己庚辛',
      start: 4,
      end: 8,
      note: '',
      tags: ['存疑'],
      status: 'bound',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      contextBefore: '丙丁',
      contextAfter: '壬癸',
    },
  ],
}
localStorage.setItem('anchor-annotation-console:v1', JSON.stringify(saved3))

const container3 = document.createElement('div')
container3.id = 'root3'
document.body.appendChild(container3)
const root3 = createRoot(container3)

await new Promise<void>((resolve) => {
  root3.render(
    React.createElement(React.StrictMode, null, React.createElement(App)),
  )
  setTimeout(resolve, 100)
})

const html3 = container3.innerHTML
assert.ok(html3.includes('冲突审阅（1）'), '应渲染 1 条待审阅冲突')
assert.ok(html3.includes('交叠 2 字'), '应显示交叠字数')
assert.ok(html3.includes('戊己'), '应展示交叠原文')
assert.ok(html3.includes('#重点 ↔ #存疑'), '应列出命中的互斥规则')
assert.ok(html3.includes('标记为忽略'), '应提供忽略操作')
assert.ok(html3.includes('1 处标签冲突'), '底部状态栏应显示冲突计数')
console.log('  ✓ 冲突审阅面板渲染成功（规则、交叠原文、操作齐全）')

// ---------- 交互：忽略 → 签名入本地 → 恢复 → 重现 ----------

function findButton(rootEl: HTMLElement, text: string): HTMLButtonElement {
  const btn = [...rootEl.querySelectorAll('button')].find((b) =>
    (b.textContent ?? '').includes(text),
  )
  assert.ok(btn, `应存在按钮「${text}」`)
  return btn as HTMLButtonElement
}

async function flush() {
  await new Promise((r) => setTimeout(r, 50))
}

// 点击「标记为忽略」
findButton(container3, '标记为忽略').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true }),
)
await flush()

const htmlAfterIgnore = container3.innerHTML
assert.ok(htmlAfterIgnore.includes('冲突审阅（0）'), '忽略后待审阅数应为 0')
assert.ok(htmlAfterIgnore.includes('已忽略（1）'), '应出现已忽略分组')
const persisted = JSON.parse(localStorage.getItem('anchor-annotation-console:v1')!)
assert.strictEqual(persisted.ignoredConflicts.length, 1, '忽略签名应写入本地存储')
assert.ok(
  persisted.ignoredConflicts[0].signature.includes('a_x') &&
    persisted.ignoredConflicts[0].signature.includes('a_y') &&
    persisted.ignoredConflicts[0].signature.includes('r1'),
  '签名应包含两个标注 ID 与命中规则 ID',
)
console.log('  ✓ 标记为忽略：面板归零，签名（标注对+规则集合）已持久化')

// 展开已忽略并恢复
findButton(container3, '已忽略（1）').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true }),
)
await flush()
findButton(container3, '恢复审阅').dispatchEvent(
  new window.MouseEvent('click', { bubbles: true }),
)
await flush()
assert.ok(container3.innerHTML.includes('冲突审阅（1）'), '恢复后冲突应重新出现')
assert.strictEqual(
  JSON.parse(localStorage.getItem('anchor-annotation-console:v1')!).ignoredConflicts.length,
  0,
  '恢复后忽略记录应清除',
)
console.log('  ✓ 恢复审阅：冲突重新出现，忽略记录清除')

root3.unmount()
container3.remove()
console.log('\n全部渲染冒烟测试通过')
