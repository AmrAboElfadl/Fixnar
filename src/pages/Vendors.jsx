import { useEffect, useState } from 'react'
import { supabase, fetchAllRows } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const hasErr = (e) => e && Object.keys(e).length
const EMPTY = { name:'', specialty:'', vendor_type:'external', contact_name:'', phone:'', email:'', trade_license:'', notes:'', is_active:true }

export default function Vendors() {
  const { isAdmin } = useAuth()
  const [vendors, setVendors] = useState([])
  const [stats, setStats]     = useState({})
  const [logins, setLogins]   = useState({})
  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState(null)
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)
  const [search, setSearch]   = useState('')
  const [sortBy, setSortBy]   = useState('name')

  useEffect(() => { load() }, [])

  function flash(text, type = 'ok') { setMsg({ text, type }); setTimeout(() => setMsg(null), 5000) }

  async function load() {
    setLoading(true)
    const [v, w, q, p] = await Promise.all([
      supabase.from('vendors').select('*').order('name'),
      fetchAllRows(() => supabase.from('work_orders').select('vendor_id,status,cost,parts_cost,created_at,arrived_at,work_started_at,completed_at,closed_at,sla_due_at,hold_reason').not('vendor_id', 'is', null).order('id')),
      supabase.from('vendor_quotes').select('vendor_id,status,kind,amount'),
      supabase.from('profiles').select('id,full_name,email,vendor_id').not('vendor_id', 'is', null),
    ])
    if (hasErr(v.error)) flash(v.error.message, 'error')
    const s = {}
    const blank = () => ({ jobs:0, open:0, cost:0, pending:0, done:0, slaMet:0, slaKnown:0, firstFix:0, respSum:0, respN:0 })
    ;(w.data || []).forEach(r => {
      const x = s[r.vendor_id] = s[r.vendor_id] || blank()
      x.jobs++; x.cost += Number(r.cost || 0) + Number(r.parts_cost || 0)
      const finished = ['completed','closed'].includes(r.status)
      if (!finished) x.open++
      const arrive = r.arrived_at || r.work_started_at
      if (arrive) { x.respSum += (new Date(arrive) - new Date(r.created_at)) / 3600000; x.respN++ }
      if (finished) {
        x.done++
        if (!r.hold_reason) x.firstFix++
        const doneAt = r.completed_at || r.closed_at
        if (r.sla_due_at && doneAt) { x.slaKnown++; if (new Date(doneAt) <= new Date(r.sla_due_at)) x.slaMet++ }
      }
    })
    Object.values(s).forEach(x => {
      x.slaPct  = x.slaKnown ? Math.round((x.slaMet / x.slaKnown) * 100) : null
      x.fixPct  = x.done ? Math.round((x.firstFix / x.done) * 100) : null
      x.respAvg = x.respN ? x.respSum / x.respN : null
      x.avgCost = x.done ? x.cost / x.done : null
      // Score out of 100: SLA 50%, first-visit fix 30%, response speed 20% (≤2h = full marks, ≥24h = 0)
      const resp = x.respAvg == null ? null : Math.max(0, Math.min(1, (24 - x.respAvg) / 22))
      const parts = [[x.slaPct, 0.5], [x.fixPct, 0.3], [resp == null ? null : resp * 100, 0.2]].filter(([v]) => v != null)
      const wsum = parts.reduce((a, [, wt]) => a + wt, 0)
      x.score = wsum ? Math.round(parts.reduce((a, [v, wt]) => a + v * wt, 0) / wsum) : null
    })
    ;(q.data || []).forEach(r => {
      const x = s[r.vendor_id] = s[r.vendor_id] || { jobs:0, open:0, cost:0, pending:0, score:null }
      if (r.status === 'submitted') x.pending++
    })
    const l = {}
    ;(p.data || []).forEach(u => { (l[u.vendor_id] = l[u.vendor_id] || []).push(u) })
    setVendors(v.data || []); setStats(s); setLogins(l); setLoading(false)
  }

  async function save() {
    if (!form.name.trim()) return flash('Vendor name is required', 'error')
    setSaving(true)
    const row = { ...form, name: form.name.trim() }
    delete row.id; delete row.created_at
    const res = form.id
      ? await supabase.from('vendors').update(row).eq('id', form.id)
      : await supabase.from('vendors').insert(row)
    setSaving(false)
    if (hasErr(res.error)) return flash(res.error.message, 'error')
    flash('✅ Saved'); setForm(null); load()
  }

  const shown = vendors.filter(v => !search || `${v.name} ${v.specialty || ''}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const sa = stats[a.id] || {}, sb = stats[b.id] || {}
      if (sortBy === 'score') return (sb.score ?? -1) - (sa.score ?? -1)
      if (sortBy === 'spend') return (sb.cost || 0) - (sa.cost || 0)
      if (sortBy === 'jobs')  return (sb.jobs || 0) - (sa.jobs || 0)
      return a.name.localeCompare(b.name)
    })
  const scoreColor = (n) => n == null ? 'var(--text3)' : n >= 80 ? 'var(--green)' : n >= 60 ? 'var(--amber)' : 'var(--red)'
  const card = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }
  const inp  = { background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, width:'100%', boxSizing:'border-box' }
  const lbl  = { fontSize:11, fontWeight:600, color:'var(--text3)', marginBottom:5, display:'block' }
  const btn  = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:9, padding:'8px 14px', fontSize:13, cursor:'pointer', color:'var(--text)' }

  return (
    <div style={{ color:'var(--text)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12, marginBottom:18 }}>
        <div>
          <h2 style={{ margin:0, fontSize:22, fontWeight:700 }}>Vendors</h2>
          <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--text3)' }}>
            Contractors, their jobs and spend. To give a vendor a login: Users &amp; Access → Invite → role “vendor”.
          </p>
        </div>
        {isAdmin && <button onClick={() => setForm({ ...EMPTY })} style={{ ...btn, background:'var(--green)', color:'white', border:'none', fontWeight:600 }}>+ Add vendor</button>}
      </div>

      {msg && <div style={{ padding:'10px 14px', borderRadius:10, marginBottom:12, fontSize:13, background: msg.type === 'error' ? 'var(--red-bg)' : 'var(--green-bg)', color: msg.type === 'error' ? 'var(--red)' : 'var(--green)' }}>{msg.text}</div>}

      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendors…" style={{ ...inp, maxWidth:280 }}/>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...inp, width:'auto' }}>
          <option value="name">Sort: name</option><option value="score">Sort: performance score</option>
          <option value="spend">Sort: spend</option><option value="jobs">Sort: number of jobs</option>
        </select>
      </div>

      {loading ? <div style={{ padding:40, textAlign:'center', color:'var(--text3)' }}>Loading…</div> : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:12 }}>
          {shown.map(v => {
            const s = stats[v.id] || { jobs:0, open:0, cost:0, pending:0, score:null }
            return (
              <div key={v.id} style={{ ...card, padding:16, opacity: v.is_active === false ? 0.6 : 1 }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
                  <div>
                    <div style={{ fontWeight:700, fontSize:15 }}>{v.name}</div>
                    <div style={{ fontSize:12, color:'var(--text3)' }}>{v.specialty || (v.vendor_type === 'internal' ? 'In-house technician' : 'External vendor')}</div>
                  </div>
                  {isAdmin && <button onClick={() => setForm({ ...EMPTY, ...v })} style={{ ...btn, padding:'4px 10px', fontSize:12, height:'fit-content' }}>Edit</button>}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginTop:12 }}>
                  {[['Jobs', s.jobs], ['Open', s.open], ['Spend', `AED ${Math.round(s.cost).toLocaleString()}`]].map(([l, val]) => (
                    <div key={l} style={{ background:'var(--bg)', borderRadius:8, padding:'6px 8px' }}>
                      <div style={{ fontSize:10, color:'var(--text3)' }}>{l}</div>
                      <div style={{ fontWeight:700, fontSize:14 }}>{val}</div>
                    </div>
                  ))}
                </div>
                {s.jobs > 0 && (
                  <div style={{ marginTop:10, padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <span style={{ fontSize:11, fontWeight:700, color:'var(--text3)' }}>PERFORMANCE</span>
                      <span style={{ fontSize:16, fontWeight:800, color:scoreColor(s.score) }}>{s.score ?? '—'}<span style={{ fontSize:11, fontWeight:400, color:'var(--text3)' }}>/100</span></span>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2px 10px', fontSize:12, marginTop:4, color:'var(--text2)' }}>
                      <span>SLA met: <b>{s.slaPct != null ? s.slaPct + '%' : '—'}</b></span>
                      <span>Fixed 1st visit: <b>{s.fixPct != null ? s.fixPct + '%' : '—'}</b></span>
                      <span>Avg response: <b>{s.respAvg != null ? (s.respAvg < 1 ? Math.round(s.respAvg * 60) + 'm' : s.respAvg.toFixed(1) + 'h') : '—'}</b></span>
                      <span>Avg cost/job: <b>{s.avgCost != null ? 'AED ' + Math.round(s.avgCost).toLocaleString() : '—'}</b></span>
                    </div>
                  </div>
                )}
                {s.pending > 0 && <div style={{ marginTop:8, fontSize:12, color:'var(--amber)', fontWeight:600 }}>💰 {s.pending} quote/invoice waiting for approval</div>}
                <div style={{ marginTop:10, fontSize:12, color:'var(--text2)', display:'grid', gap:2 }}>
                  {v.contact_name && <span>👤 {v.contact_name}</span>}
                  {v.phone && <a href={`tel:${v.phone}`} style={{ color:'var(--blue)', textDecoration:'none' }}>📞 {v.phone}</a>}
                  {v.email && <span>✉️ {v.email}</span>}
                  <span style={{ color:'var(--text3)' }}>🔑 Portal logins: {(logins[v.id] || []).map(u => u.full_name || u.email).join(', ') || 'none'}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {form && (
        <div onClick={e => { if (e.target === e.currentTarget) setForm(null) }} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ ...card, padding:24, width:'100%', maxWidth:520, maxHeight:'90vh', overflowY:'auto' }}>
            <h3 style={{ margin:'0 0 16px' }}>{form.id ? 'Edit vendor' : 'Add vendor'}</h3>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:12 }}>
              {[['NAME *','name'],['SPECIALTY','specialty'],['CONTACT PERSON','contact_name'],['PHONE','phone'],['EMAIL','email'],['TRADE LICENSE NO.','trade_license']].map(([l, k]) => (
                <div key={k}><label style={lbl}>{l}</label><input value={form[k] || ''} onChange={e => setForm({ ...form, [k]:e.target.value })} style={inp}/></div>
              ))}
              <div><label style={lbl}>TYPE</label>
                <select value={form.vendor_type || 'external'} onChange={e => setForm({ ...form, vendor_type:e.target.value })} style={inp}>
                  <option value="external">External vendor</option><option value="internal">In-house</option>
                </select>
              </div>
              <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:13, marginTop:18 }}>
                <input type="checkbox" checked={form.is_active !== false} onChange={e => setForm({ ...form, is_active:e.target.checked })} style={{ accentColor:'var(--green)' }}/> Active
              </label>
              <div style={{ gridColumn:'1 / -1' }}><label style={lbl}>NOTES</label><textarea rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes:e.target.value })} style={{ ...inp, resize:'vertical' }}/></div>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:16 }}>
              <button onClick={() => setForm(null)} style={btn}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ ...btn, background:'var(--green)', color:'white', border:'none', fontWeight:600 }}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
