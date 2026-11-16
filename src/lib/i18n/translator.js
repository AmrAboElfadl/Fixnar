// Runtime UI translator. When Arabic is on, every text node and placeholder/title/aria-label
// rendered by React is swapped for its Arabic version from ar.js. Only fixed UI text is in the
// dictionary, so user data (store names, job titles, notes) stays exactly as typed.
// Anything inside an element with translate="no" (printed invoices, reports, labels) is left alone.
import { AR, AR_PATTERNS } from './ar'

const norm = (s) => s.replace(/\s+/g, ' ').trim()
const EXACT = new Map(); const LOWER = new Map()
for (const [k, v] of Object.entries(AR)) { EXACT.set(norm(k), v); LOWER.set(norm(k).toLowerCase(), v) }

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const PATTERNS = AR_PATTERNS.map(([en, ar]) => ({
  re: new RegExp('^' + norm(en).split('{}').map(esc).join('(.+?)') + '$', 'i'), ar,
}))

// leading decoration: symbols, emoji, "+", arrows, bullets…  trailing: ":", "*", "…", "...", "→", "↗", "("
const LEAD = /^[^\p{L}\p{N}"'“(]+/u
const TRAIL = /(\s*(?:[:*…→↗›(]|\.\.\.))+$/u

const cache = new Map()
function lookup(core) {
  return EXACT.get(core) ?? LOWER.get(core.toLowerCase())
}
export function tr(input) {
  if (input == null) return input
  const raw = String(input)
  if (!/[A-Za-z]/.test(raw)) return raw
  if (cache.has(raw)) return cache.get(raw)
  const lead = raw.match(/^\s*/)[0], tail = raw.match(/\s*$/)[0]
  const s = norm(raw)
  let out = lookup(s)
  if (out == null) {
    const pre = (s.match(LEAD) || [''])[0]
    let core = s.slice(pre.length)
    const post = (core.match(TRAIL) || [''])[0]
    core = core.slice(0, core.length - post.length).trim()
    const hit = core && lookup(core)
    if (hit != null) out = pre + hit + post
    else out = pattern(s)
    if (out == null && pre && core) { const p = pattern(core); if (p != null) out = pre + p + post }
  }
  const res = out == null ? raw : lead + out + tail
  if (cache.size > 5000) cache.clear()
  cache.set(raw, res)
  return res
}
function pattern(s) {
  for (const p of PATTERNS) {
    const m = s.match(p.re)
    if (m) { let i = 0; return p.ar.replace(/\{\}/g, () => { const v = m[++i]; const t = tr(v); return t === v ? v : t }) }
  }
  return null
}

// ── DOM wiring
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT', 'SVG'])
const ATTRS = ['placeholder', 'title', 'aria-label']
function skipped(el) {
  for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
    if (SKIP_TAGS.has(e.tagName) || e.getAttribute('translate') === 'no' || e.isContentEditable) return true
  }
  return false
}
function doText(n) {
  const v = n.nodeValue
  if (!v || !/[A-Za-z]/.test(v) || skipped(n.parentElement)) return
  const t = tr(v); if (t !== v) n.nodeValue = t
}
function doAttrs(el) {
  for (const a of ATTRS) {
    const v = el.getAttribute && el.getAttribute(a)
    if (v && /[A-Za-z]/.test(v)) { const t = tr(v); if (t !== v && !skipped(el)) el.setAttribute(a, t) }
  }
}
function walk(root) {
  if (root.nodeType === 3) return doText(root)
  if (root.nodeType !== 1 || skipped(root)) return
  doAttrs(root)
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  let n
  while ((n = w.nextNode())) n.nodeType === 3 ? doText(n) : doAttrs(n)
}

let observer = null, origAlert, origConfirm, origPrompt, titleTimer
export function startTranslating() {
  if (observer) return
  walk(document.body)
  observer = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'characterData') doText(m.target)
      else if (m.type === 'attributes') doAttrs(m.target)
      else m.addedNodes.forEach(walk)
    }
  })
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS })
  origAlert = window.alert; origConfirm = window.confirm; origPrompt = window.prompt
  window.alert = (m) => origAlert.call(window, tr(m))
  window.confirm = (m) => origConfirm.call(window, tr(m))
  window.prompt = (m, d) => origPrompt.call(window, tr(m), d)
  titleTimer = setInterval(() => { const t = tr(document.title); if (t !== document.title) document.title = t }, 1000)
}
export function stopTranslating() {
  if (!observer) return
  observer.disconnect(); observer = null; clearInterval(titleTimer)
  window.alert = origAlert; window.confirm = origConfirm; window.prompt = origPrompt
}
