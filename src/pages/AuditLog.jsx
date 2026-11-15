import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const TABLE_LABELS = {
  work_orders: 'Work Order', assets: 'Asset', stores: 'Store', profiles: 'User',
  user_stores: 'Store Access', vendors: 'Vendor', ppm_tasks: 'PPM Task',
  ppm_plans: 'PPM Plan', wo_checklist_items: 'Checklist', vendor_quotes: 'Vendor Quote',
}
const ACTION_STYLE = {
  INSERT: { label:'Created', color:'var(--green)', bg:'var(--green-bg)' },
  UPDATE: { label:'Changed', color:'var(--blue)',  bg:'var(--blue-bg)' },
  DELETE: { label:'Deleted', color:'var(--red)',   bg:'var(--red-bg)' },
}
const PAGE = 50

function fmt(v) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'object') return JSON.stringify(v)
  const s = String(v)
  return s.length > 80 ? s.slice(0, 80) + '…' : s
}

function describe(row) {
  const r = row.new_row || row.old_row || {}
  return r.title || r.name || r.full_name || r.email || ''
}

export default function AuditLog() {
  const [params, setParams] = useSearchParams()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [page, setPage]       = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [table, setTable]     = useState(params.get('table') || 'all')
  const [action, setAction]   = useState('all')
  const [search, setSearch]   = useState('')
  const record = params.get('record') || ''

  useEffect(() => { load() }, [page, table, action, record])

  async function load() {
    setLoading(true); setError('')
    let q = supabase.from('audit_log').select('*').order('created_at', { ascending:false })
      .range(page * PAGE, page * PAGE + PAGE)
    if (table !== 'all')  q = q.eq('table_name', table)
    if (action !== 'all') q = q.eq('action', action)
    if (record)           q = q.eq('record_id', record)
    const { data, error } = await q
    if (error && Object.keys(error).length) { setError(error.message || 'Could not load audit log'); setRows([]) }
    else { setRows((data || []).slice(0, PAGE)); setHasMore((data || []).length > PAGE) }
    setLoading(false)
  }

  const shown = rows.filter(r => {
    if (!search) return true
    const s = search.toLowerCase()
    return (r.actor_name || '').toLowerCase().includes(s) || describe(r).toLowerCase().includes(s)
      || JSON.stringify(r.changes || {}).toLowerCase().includes(s)
  })

  const sel = { padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)', fontSize:13 }

  return (
    <div style={{ color:'var(--text)' }}>
      <div style={{ marginBottom:20 }}>
        <h2 style={{ margin:0, fontSize:22, fontWeight:700 }}>Audit Trail</h2>
        <p style={{ margin:'4px 0 0', color:'var(--text3)', fontSize:13 }}>
          Every create, change and delete — who did it and when. Only admins can see this page.
        </p>
      </div>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search user, item or value…" style={{ ...sel, minWidth:240 }}/>
        <select value={table} onChange={e => { setPage(0); setTable(e.target.value) }} style={sel}>
          <option value="all">All records</option>
          {Object.entries(TABLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={action} onChange={e => { setPage(0); setAction(e.target.value) }} style={sel}>
          <option value="all">All actions</option>
          <option value="INSERT">Created</option>
          <option value="UPDATE">Changed</option>
          <option value="DELETE">Deleted</option>
        </select>
        {record && (
          <button onClick={() => { params.delete('record'); setParams(params) }} style={{ ...sel, cursor:'pointer' }}>
            ✕ Clear record filter
          </button>
        )}
      </div>

      {error && <div style={{ padding:12, borderRadius:10, background:'var(--red-bg)', color:'var(--red)', marginBottom:12, fontSize:13 }}>{error}</div>}

      {loading ? (
        <div style={{ color:'var(--text3)', padding:30, textAlign:'center' }}>Loading…</div>
      ) : shown.length === 0 ? (
        <div style={{ color:'var(--text3)', padding:30, textAlign:'center', background:'var(--surface)', borderRadius:12, border:'1px solid var(--border)' }}>
          No activity recorded yet.
        </div>
      ) : (
        <div style={{ display:'grid', gap:8 }}>
          {shown.map(r => {
            const a = ACTION_STYLE[r.action] || ACTION_STYLE.UPDATE
            const label = TABLE_LABELS[r.table_name] || r.table_name
            const name = describe(r)
            return (
              <div key={r.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 16px' }}>
                <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                  <span style={{ fontSize:11, fontWeight:700, color:a.color, background:a.bg, borderRadius:20, padding:'2px 10px' }}>{a.label}</span>
                  <span style={{ fontWeight:600, fontSize:13 }}>{label}</span>
                  {name && <span style={{ fontSize:13, color:'var(--text2)' }}>· {name}</span>}
                  {r.table_name === 'work_orders' && r.action !== 'DELETE' && r.record_id && (
                    <Link to={`/work-orders/${r.record_id}`} style={{ fontSize:12, color:'var(--green)' }}>open ↗</Link>
                  )}
                  <span style={{ marginLeft:'auto', fontSize:12, color:'var(--text3)' }}>
                    {r.actor_name || 'System'} · {new Date(r.created_at).toLocaleString('en-GB', { dateStyle:'medium', timeStyle:'short' })}
                  </span>
                </div>
                {r.changes && (
                  <div style={{ marginTop:8, display:'grid', gap:4 }}>
                    {Object.entries(r.changes).map(([field, c]) => (
                      <div key={field} style={{ fontSize:12, color:'var(--text2)', display:'flex', gap:6, flexWrap:'wrap' }}>
                        <span style={{ fontWeight:600, color:'var(--text)' }}>{field.replace(/_/g, ' ')}:</span>
                        <span style={{ textDecoration:'line-through', color:'var(--text3)' }}>{fmt(c?.old)}</span>
                        <span>→</span>
                        <span>{fmt(c?.new)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display:'flex', gap:10, justifyContent:'center', marginTop:16 }}>
        <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ ...sel, cursor:'pointer', opacity: page === 0 ? 0.5 : 1 }}>← Newer</button>
        <button disabled={!hasMore} onClick={() => setPage(p => p + 1)} style={{ ...sel, cursor:'pointer', opacity: hasMore ? 1 : 0.5 }}>Older →</button>
      </div>
    </div>
  )
}
