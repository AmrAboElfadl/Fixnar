import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, fetchAllRows } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const hasErr = (e) => e && Object.keys(e).length
const AED = (n) => `AED ${Math.round(Number(n || 0)).toLocaleString('en-US')}`

function brandOf(name = '') {
  const n = name.toLowerCase()
  if (n.startsWith('jv ') || n.includes('juan valdez')) return 'Juan Valdez'
  if (n.includes('solidare')) return 'Solidare'
  if (n.includes('derwandi') || n.includes('derawandi')) return 'JJ Derawandi'
  return 'JJ Chicken'
}
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
function shiftMonth(key, n) { const [y, m] = key.split('-').map(Number); return monthKey(new Date(y, m - 1 + n, 1)) }
// Month boundaries in Dubai time (UTC+4) to match the server's calculation
const dubaiStart = (key) => new Date(`${key}T00:00:00+04:00`).toISOString()

export default function Budgets() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const [month, setMonth]     = useState(monthKey(new Date()))
  const [stores, setStores]   = useState([])
  const [budgets, setBudgets] = useState({})     // store_id -> row
  const [spend, setSpend]     = useState({})     // store_id -> { jobs, parts, count }
  const [drafts, setDrafts]   = useState({})
  const [loading, setLoading] = useState(true)
  const [msg, setMsg]         = useState(null)

  useEffect(() => { load() }, [month])
  function flash(text, type = 'ok') { setMsg({ text, type }); setTimeout(() => setMsg(null), 5000) }

  async function load() {
    setLoading(true)
    const next = shiftMonth(month, 1)
    const [s, b, w] = await Promise.all([
      supabase.from('stores').select('id,name').order('name'),
      supabase.from('budgets').select('*').eq('month', month),
      fetchAllRows(() => supabase.from('work_orders').select('id,store_id,cost,parts_cost')
        .gte('spend_at', dubaiStart(month)).lt('spend_at', dubaiStart(next)).order('id')),
    ])
    if (hasErr(b.error)) flash(b.error.message, 'error')
    const bm = {}; (b.data || []).forEach(r => { bm[r.store_id] = r })
    const sp = {}
    ;(w.data || []).forEach(r => {
      const x = sp[r.store_id] = sp[r.store_id] || { jobs:0, parts:0, count:0 }
      x.jobs += Number(r.cost || 0); x.parts += Number(r.parts_cost || 0); x.count++
    })
    setStores(s.data || []); setBudgets(bm); setSpend(sp); setDrafts({}); setLoading(false)
  }

  async function saveBudget(storeId) {
    const val = drafts[storeId]
    if (val === undefined) return
    const amount = val === '' ? 0 : Number(val)
    if (isNaN(amount) || amount < 0) return flash('Enter a valid amount', 'error')
    const { error } = await supabase.from('budgets').upsert({ store_id:storeId, month, amount }, { onConflict:'store_id,month' })
    if (hasErr(error)) return flash(error.message, 'error')
    flash('✅ Budget saved'); load()
  }

  async function copyLastMonth() {
    const prev = shiftMonth(month, -1)
    const { data, error } = await supabase.from('budgets').select('store_id,amount').eq('month', prev)
    if (hasErr(error)) return flash(error.message, 'error')
    if (!data?.length) return flash('No budgets found for last month', 'error')
    const rows = data.filter(r => !budgets[r.store_id]).map(r => ({ store_id:r.store_id, month, amount:r.amount }))
    if (!rows.length) return flash('All stores already have a budget this month')
    const res = await supabase.from('budgets').insert(rows)
    if (hasErr(res.error)) return flash(res.error.message, 'error')
    flash(`✅ Copied ${rows.length} budgets from last month`); load()
  }

  const rows = useMemo(() => stores.map(s => {
    const sp = spend[s.id] || { jobs:0, parts:0, count:0 }
    const total = sp.jobs + sp.parts
    const budget = budgets[s.id] ? Number(budgets[s.id].amount) : null
    return { ...s, brand: brandOf(s.name), ...sp, total, budget, pct: budget ? Math.round((total / budget) * 100) : null }
  }), [stores, spend, budgets])

  const brands = useMemo(() => {
    const m = {}
    rows.forEach(r => {
      const x = m[r.brand] = m[r.brand] || { brand:r.brand, total:0, budget:0, stores:0 }
      x.total += r.total; x.budget += r.budget || 0; x.stores++
    })
    return Object.values(m).sort((a, b) => b.total - a.total)
  }, [rows])

  const totSpend = rows.reduce((a, r) => a + r.total, 0)
  const totBudget = rows.reduce((a, r) => a + (r.budget || 0), 0)
  const over = rows.filter(r => r.budget && r.total > r.budget).length
  const label = new Date(`${month}T00:00:00`).toLocaleDateString('en-GB', { month:'long', year:'numeric' })
  const barColor = (pct) => pct == null ? 'var(--border2)' : pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--amber)' : 'var(--green)'

  const card = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }
  const btn  = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:13, cursor:'pointer', color:'var(--text)' }
  const inp  = { background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 10px', color:'var(--text)', fontSize:13, width:110 }

  return (
    <div style={{ color:'var(--text)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12, marginBottom:18 }}>
        <div>
          <h2 style={{ margin:0, fontSize:22, fontWeight:700 }}>Budget vs Actual</h2>
          <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--text3)' }}>Maintenance spend per store = approved job/vendor cost + spare parts used, counted in the month the job was completed. Admins get an alert at 80% and 100%.</p>
        </div>
        <div style={{ display:'flex', gap:6, alignItems:'center' }}>
          <button onClick={() => setMonth(shiftMonth(month, -1))} style={btn}>←</button>
          <div style={{ fontWeight:700, minWidth:140, textAlign:'center' }}>{label}</div>
          <button onClick={() => setMonth(shiftMonth(month, 1))} style={btn}>→</button>
          {isAdmin && <button onClick={copyLastMonth} style={btn}>Copy last month's budgets</button>}
        </div>
      </div>

      {msg && <div style={{ padding:'10px 14px', borderRadius:10, marginBottom:12, fontSize:13, background: msg.type === 'error' ? 'var(--red-bg)' : 'var(--green-bg)', color: msg.type === 'error' ? 'var(--red)' : 'var(--green)' }}>{msg.text}</div>}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(170px, 1fr))', gap:12, marginBottom:16 }}>
        {[['Total budget', AED(totBudget), 'var(--text)'], ['Spent', AED(totSpend), totBudget && totSpend > totBudget ? 'var(--red)' : 'var(--green)'],
          ['Remaining', AED(Math.max(0, totBudget - totSpend)), 'var(--blue)'], ['Stores over budget', over, over ? 'var(--red)' : 'var(--text)']].map(([l, v, c]) => (
          <div key={l} style={{ ...card, padding:'14px 16px' }}>
            <div style={{ fontSize:12, color:'var(--text3)' }}>{l}</div>
            <div style={{ fontSize:22, fontWeight:700, color:c, marginTop:4 }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:12, marginBottom:16 }}>
        {brands.map(b => {
          const pct = b.budget ? Math.round((b.total / b.budget) * 100) : null
          return (
            <div key={b.brand} style={{ ...card, padding:'12px 14px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:13 }}><b>{b.brand}</b><span style={{ color:'var(--text3)' }}>{b.stores} stores</span></div>
              <div style={{ fontSize:13, marginTop:6 }}>{AED(b.total)} <span style={{ color:'var(--text3)' }}>of {b.budget ? AED(b.budget) : 'no budget'}</span></div>
              <div style={{ height:6, background:'var(--bg3)', borderRadius:3, marginTop:6, overflow:'hidden' }}>
                <div style={{ width:`${Math.min(100, pct || 0)}%`, height:'100%', background:barColor(pct) }}/>
              </div>
            </div>
          )
        })}
      </div>

      {loading ? <div style={{ padding:40, textAlign:'center', color:'var(--text3)' }}>Loading…</div> : (
        <div style={{ ...card, overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead><tr style={{ borderBottom:'1px solid var(--border)', color:'var(--text3)', fontSize:11, textAlign:'left' }}>
              {['Store','Jobs','Job / vendor cost','Parts','Total spent','Budget','Used'].map(h => <th key={h} style={{ padding:'10px 12px', fontWeight:600 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={{ padding:'10px 12px' }}>
                    <button onClick={() => navigate(`/work-orders?store=${r.id}`)} style={{ background:'none', border:'none', padding:0, color:'var(--text)', fontWeight:600, cursor:'pointer', textAlign:'left' }}>{r.name}</button>
                    <div style={{ fontSize:11, color:'var(--text3)' }}>{r.brand}</div>
                  </td>
                  <td style={{ padding:'10px 12px' }}>{r.count}</td>
                  <td style={{ padding:'10px 12px' }}>{AED(r.jobs)}</td>
                  <td style={{ padding:'10px 12px' }}>{AED(r.parts)}</td>
                  <td style={{ padding:'10px 12px', fontWeight:700 }}>{AED(r.total)}</td>
                  <td style={{ padding:'10px 12px' }}>
                    {isAdmin ? (
                      <input type="number" min="0" step="100" style={inp}
                        value={drafts[r.id] ?? (r.budget ?? '')} placeholder="Set budget"
                        onChange={e => setDrafts({ ...drafts, [r.id]: e.target.value })}
                        onBlur={() => saveBudget(r.id)}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}/>
                    ) : (r.budget != null ? AED(r.budget) : '—')}
                  </td>
                  <td style={{ padding:'10px 12px', minWidth:140 }}>
                    {r.pct == null ? <span style={{ color:'var(--text3)' }}>—</span> : (
                      <>
                        <div style={{ fontSize:12, fontWeight:700, color:barColor(r.pct) }}>{r.pct}%</div>
                        <div style={{ height:6, background:'var(--bg3)', borderRadius:3, overflow:'hidden', marginTop:3 }}>
                          <div style={{ width:`${Math.min(100, r.pct)}%`, height:'100%', background:barColor(r.pct) }}/>
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
