// Shared building blocks for the Finance pages (module level so inputs keep focus)
import { STATUS_COLOR } from '../../lib/finance'

export const INP = { background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 13, width: '100%', boxSizing: 'border-box' }
export const LBL = { fontSize: 11, fontWeight: 600, color: 'var(--text3)', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '.03em' }
export const BTN = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: 'var(--text)', whiteSpace: 'nowrap' }
export const PRIMARY = { ...BTN, background: 'var(--green)', color: 'white', border: 'none', fontWeight: 600 }
export const DANGER = { ...BTN, color: 'var(--red)', borderColor: 'var(--red)' }
export const CARD = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
export const TH = { padding: '9px 10px', fontWeight: 600, fontSize: 11, color: 'var(--text3)', textAlign: 'left', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }
export const TD = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid var(--border)', verticalAlign: 'top' }
export const NUM = { ...TD, textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }

export function Field({ label, children, span }) {
  return <div style={span ? { gridColumn: '1 / -1' } : null}><label style={LBL}>{label}</label>{children}</div>
}

export function Pill({ status, labels }) {
  const c = STATUS_COLOR[status] || 'var(--text3)'
  return <span style={{ fontSize: 11, fontWeight: 700, color: c, border: `1px solid ${c}`, borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>{labels?.[status] || status}</span>
}

export function Stat({ label, value, color = 'var(--text)', sub, onClick }) {
  return (
    <div onClick={onClick} style={{ ...CARD, padding: '12px 14px', cursor: onClick ? 'pointer' : 'default' }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export function Modal({ title, onClose, children, width = 560, busy }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 12px', overflowY: 'auto' }}>
      <div style={{ background: 'var(--bg)', borderRadius: 14, padding: 18, width: '100%', maxWidth: width, border: '1px solid var(--border)', color: 'var(--text)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17 }}>{title}</h3>
          <button onClick={onClose} disabled={busy} style={BTN}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Msg({ msg }) {
  if (!msg) return null
  const ok = msg.type === 'ok'
  return <div style={{ padding: '9px 12px', borderRadius: 10, margin: '10px 0', fontSize: 13, background: ok ? 'var(--green-bg)' : 'var(--red-bg)', color: ok ? 'var(--green)' : 'var(--red)' }}>{msg.text}</div>
}

export function Empty({ children }) {
  return <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>{children}</div>
}

export function Table({ head, children, foot }) {
  return (
    <div style={{ ...CARD, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>{head.map((h, i) => <th key={i} style={{ ...TH, textAlign: h?.right ? 'right' : 'left' }}>{h?.label ?? h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
        {foot && <tfoot>{foot}</tfoot>}
      </table>
    </div>
  )
}

export function Toolbar({ children }) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>{children}</div>
}
