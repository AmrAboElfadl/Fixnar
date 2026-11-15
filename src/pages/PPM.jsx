import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, fetchAllRows } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { CATEGORIES } from '../lib/workOrderCategories'
import { CHECKLIST_TEMPLATES, PPM_FREQUENCIES, frequencyLabel } from '../lib/checklists'

const hasErr = (e) => e && Object.keys(e).length
const today = () => new Date().toISOString().slice(0, 10)

const EMPTY = {
  title:'', category:'HVAC', store_id:'', asset_id:'', assigned_to:'', vendor_name:'',
  freq:'Quarterly', due_date: today(), lead_days:3, priority:'P4', duration_hours:2,
  checklist:[], notes:'', is_active:true,
}

function daysUntil(d) {
  const a = new Date(today()); const b = new Date(String(d).slice(0, 10))
  return Math.round((b - a) / 86400000)
}

function dueBadge(plan) {
  if (plan.is_active === false) return { label:'Paused', color:'var(--text3)', bg:'var(--bg3)' }
  if (plan.status === 'in_progress') return { label:'Work order open', color:'var(--blue)', bg:'var(--blue-bg)' }
  const d = daysUntil(plan.due_date)
  if (d < 0)  return { label:`${Math.abs(d)}d overdue`, color:'var(--red)', bg:'var(--red-bg)' }
  if (d <= 7) return { label: d === 0 ? 'Due today' : `Due in ${d}d`, color:'var(--amber)', bg:'var(--amber-bg)' }
  return { label:`Due in ${d}d`, color:'var(--green)', bg:'var(--green-bg)' }
}

export default function PPM() {
  const { isAdmin, profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'operations'
  const navigate = useNavigate()

  const [plans, setPlans]     = useState([])
  const [stores, setStores]   = useState([])
  const [assets, setAssets]   = useState([])
  const [techs, setTechs]     = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState(null)   // null = closed
  const [saving, setSaving]   = useState(false)
  const [msg, setMsg]         = useState(null)
  const [filterStore, setFilterStore] = useState('all')
  const [filterState, setFilterState] = useState('all')
  const [newItem, setNewItem] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [p, s, a, t, v] = await Promise.all([
      supabase.from('ppm_tasks').select('*,assets(name),stores(name),profiles(full_name)').order('due_date'),
      supabase.from('stores').select('id,name').order('name'),
      fetchAllRows(() => supabase.from('assets').select('id,name,store_id').order('name')),
      supabase.from('profiles').select('id,full_name').eq('role','technician').order('full_name'),
      supabase.from('vendors').select('name').eq('is_active', true).order('name'),
    ])
    if (hasErr(p.error)) flash(p.error.message, 'error')
    setPlans(p.data || []); setStores(s.data || []); setAssets(a.data || [])
    setTechs(t.data || []); setVendors(v.data || [])
    setLoading(false)
  }

  function flash(text, type = 'ok') {
    setMsg({ text, type }); setTimeout(() => setMsg(null), 5000)
  }

  function openNew() { setForm({ ...EMPTY }); setNewItem('') }
  function openEdit(p) {
    const f = PPM_FREQUENCIES.find(x => (p.frequency_days ? x.days === p.frequency_days : x.months === (p.frequency_months || 3)))
    setForm({
      id: p.id, title: p.title || '', category: p.category || 'HVAC', store_id: p.store_id || '',
      asset_id: p.asset_id || '', assigned_to: p.assigned_to || '', vendor_name: p.vendor_name || '',
      freq: f ? f.label : 'Quarterly', due_date: String(p.due_date).slice(0, 10), lead_days: p.lead_days ?? 3,
      priority: p.priority || 'P4', duration_hours: p.duration_hours || 2,
      checklist: Array.isArray(p.checklist) ? p.checklist : [], notes: p.notes || '', is_active: p.is_active !== false,
    })
    setNewItem('')
  }

  async function save() {
    if (!form.title.trim() || !form.store_id || !form.due_date) return flash('Title, store and first due date are required', 'error')
    setSaving(true)
    const f = PPM_FREQUENCIES.find(x => x.label === form.freq) || { months: 3 }
    const row = {
      title: form.title.trim(), category: form.category, store_id: form.store_id,
      asset_id: form.asset_id || null, assigned_to: form.assigned_to || null, vendor_name: form.vendor_name || null,
      frequency_days: f.days || null, frequency_months: f.months || null,
      due_date: form.due_date, next_due: form.due_date, lead_days: Number(form.lead_days) || 0,
      priority: form.priority, duration_hours: Number(form.duration_hours) || 2,
      checklist: form.checklist, notes: form.notes || null, is_active: form.is_active,
    }
    const res = form.id
      ? await supabase.from('ppm_tasks').update(row).eq('id', form.id)
      : await supabase.from('ppm_tasks').insert({ ...row, status:'pending' })
    setSaving(false)
    if (hasErr(res.error)) return flash(res.error.message, 'error')
    flash(form.id ? '✅ Plan updated' : '✅ PPM plan created')
    setForm(null); fetchAll()
  }

  async function toggleActive(p) {
    const { error } = await supabase.from('ppm_tasks').update({ is_active: p.is_active === false }).eq('id', p.id)
    if (hasErr(error)) return flash(error.message, 'error')
    fetchAll()
  }

  async function remove(p) {
    if (!window.confirm(`Delete PPM plan "${p.title}"? Work orders already created stay.`)) return
    const { error } = await supabase.from('ppm_tasks').delete().eq('id', p.id)
    if (hasErr(error)) return flash(error.message, 'error')
    fetchAll()
  }

  async function generateNow() {
    setSaving(true)
    const { data, error } = await supabase.rpc('run_ppm_generator')
    setSaving(false)
    if (hasErr(error)) return flash(error.message, 'error')
    flash(data > 0 ? `✅ ${data} PPM work order${data > 1 ? 's' : ''} created` : 'Nothing due yet — no work orders needed')
    fetchAll()
  }

  const visible = useMemo(() => plans.filter(p => {
    if (filterStore !== 'all' && p.store_id !== filterStore) return false
    const d = daysUntil(p.due_date)
    if (filterState === 'overdue') return p.is_active !== false && p.status !== 'in_progress' && d < 0
    if (filterState === 'week') return p.is_active !== false && d <= 7
    if (filterState === 'open') return p.status === 'in_progress'
    if (filterState === 'paused') return p.is_active === false
    return true
  }), [plans, filterStore, filterState])

  const active   = plans.filter(p => p.is_active !== false)
  const overdue  = active.filter(p => p.status !== 'in_progress' && daysUntil(p.due_date) < 0).length
  const dueWeek  = active.filter(p => daysUntil(p.due_date) <= 7 && daysUntil(p.due_date) >= 0).length
  const inProg   = active.filter(p => p.status === 'in_progress').length

  const card = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }
  const inp  = { background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, width:'100%', boxSizing:'border-box', outline:'none' }
  const lbl  = { fontSize:11, fontWeight:600, color:'var(--text3)', marginBottom:5, display:'block' }
  const btn  = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:9, padding:'9px 16px', fontSize:13, cursor:'pointer', color:'var(--text)' }
  const primary = { ...btn, background:'var(--green)', border:'none', color:'white', fontWeight:600 }

  return (
    <div style={{ color:'var(--text)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ fontSize:22, fontWeight:700, margin:0 }}>PPM Plans</h2>
          <p style={{ color:'var(--text3)', fontSize:13, margin:'4px 0 0' }}>
            Planned preventive maintenance. Work orders are created automatically every morning before each due date.
          </p>
        </div>
        {canEdit && (
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={generateNow} disabled={saving} style={btn}>⚙️ Create due work orders now</button>
            <button onClick={openNew} style={primary}>+ New PPM plan</button>
          </div>
        )}
      </div>

      {msg && (
        <div style={{ padding:'10px 14px', borderRadius:10, marginBottom:14, fontSize:13,
          background: msg.type === 'error' ? 'var(--red-bg)' : 'var(--green-bg)',
          color: msg.type === 'error' ? 'var(--red)' : 'var(--green)' }}>{msg.text}</div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:12, marginBottom:18 }}>
        {[['Active plans', active.length, 'var(--text)', 'all'], ['Due in 7 days', dueWeek, 'var(--amber)', 'week'],
          ['Overdue', overdue, 'var(--red)', 'overdue'], ['Work order open', inProg, 'var(--blue)', 'open']].map(([l, v, c, k]) => (
          <button key={l} onClick={() => setFilterState(k)} style={{ ...card, padding:'14px 16px', textAlign:'left', cursor:'pointer', outline: filterState === k ? '2px solid var(--green)' : 'none' }}>
            <div style={{ fontSize:12, color:'var(--text3)' }}>{l}</div>
            <div style={{ fontSize:26, fontWeight:700, color:c, marginTop:4 }}>{v}</div>
          </button>
        ))}
      </div>

      <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
        <select value={filterStore} onChange={e => setFilterStore(e.target.value)} style={{ ...inp, width:'auto' }}>
          <option value="all">All stores</option>
          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterState} onChange={e => setFilterState(e.target.value)} style={{ ...inp, width:'auto' }}>
          <option value="all">All plans</option>
          <option value="week">Due in 7 days</option>
          <option value="overdue">Overdue</option>
          <option value="open">Work order open</option>
          <option value="paused">Paused</option>
        </select>
      </div>

      {loading ? (
        <div style={{ color:'var(--text3)', padding:40, textAlign:'center' }}>Loading…</div>
      ) : visible.length === 0 ? (
        <div style={{ ...card, padding:40, textAlign:'center', color:'var(--text3)' }}>
          {plans.length === 0
            ? <>No PPM plans yet.{canEdit && <> Click <b>+ New PPM plan</b> to add your first one (e.g. quarterly AC service for each store).</>}</>
            : 'No plans match these filters.'}
        </div>
      ) : (
        <div style={{ ...card, overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)', color:'var(--text3)', fontSize:11, textAlign:'left' }}>
                {['Plan','Store','Frequency','Next due','Assigned','Checklist','Status',''].map(h => <th key={h} style={{ padding:'10px 12px', fontWeight:600 }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {visible.map(p => {
                const b = dueBadge(p)
                return (
                  <tr key={p.id} style={{ borderBottom:'1px solid var(--border)', opacity: p.is_active === false ? 0.6 : 1 }}>
                    <td style={{ padding:'10px 12px' }}>
                      <div style={{ fontWeight:600 }}>{p.title}</div>
                      <div style={{ fontSize:11, color:'var(--text3)' }}>{CATEGORIES[p.category]?.icon} {p.category}{p.assets?.name ? ` · ${p.assets.name}` : ''}</div>
                    </td>
                    <td style={{ padding:'10px 12px' }}>{p.stores?.name || '—'}</td>
                    <td style={{ padding:'10px 12px' }}>{frequencyLabel(p)}</td>
                    <td style={{ padding:'10px 12px', whiteSpace:'nowrap' }}>{new Date(p.due_date).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}</td>
                    <td style={{ padding:'10px 12px' }}>{p.profiles?.full_name || p.vendor_name || <span style={{ color:'var(--text3)' }}>Unassigned</span>}</td>
                    <td style={{ padding:'10px 12px' }}>{Array.isArray(p.checklist) && p.checklist.length ? `${p.checklist.length} items` : '—'}</td>
                    <td style={{ padding:'10px 12px' }}>
                      <span style={{ fontSize:11, fontWeight:600, color:b.color, background:b.bg, borderRadius:20, padding:'3px 10px', whiteSpace:'nowrap' }}>{b.label}</span>
                    </td>
                    <td style={{ padding:'10px 12px', whiteSpace:'nowrap', textAlign:'right' }}>
                      {p.last_wo_id && <button onClick={() => navigate(`/work-orders/${p.last_wo_id}`)} style={{ ...btn, padding:'5px 10px', fontSize:12, marginRight:6 }}>Last WO</button>}
                      {canEdit && <button onClick={() => openEdit(p)} style={{ ...btn, padding:'5px 10px', fontSize:12, marginRight:6 }}>Edit</button>}
                      {canEdit && <button onClick={() => toggleActive(p)} style={{ ...btn, padding:'5px 10px', fontSize:12, marginRight:6 }}>{p.is_active === false ? 'Resume' : 'Pause'}</button>}
                      {isAdmin && <button onClick={() => remove(p)} style={{ ...btn, padding:'5px 10px', fontSize:12, color:'var(--red)' }}>Delete</button>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create / edit plan ── */}
      {form && (
        <div onClick={e => { if (e.target === e.currentTarget) setForm(null) }}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
          <div style={{ background:'var(--surface)', borderRadius:16, padding:24, width:'100%', maxWidth:640, maxHeight:'92vh', overflowY:'auto', border:'1px solid var(--border)' }}>
            <h3 style={{ margin:'0 0 16px', fontSize:18 }}>{form.id ? 'Edit PPM plan' : 'New PPM plan'}</h3>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:12 }}>
              <div style={{ gridColumn:'1 / -1' }}>
                <label style={lbl}>PLAN NAME *</label>
                <input value={form.title} onChange={e => setForm({ ...form, title:e.target.value })} placeholder="e.g. AC quarterly service" style={inp}/>
              </div>
              <div>
                <label style={lbl}>STORE *</label>
                <select value={form.store_id} onChange={e => setForm({ ...form, store_id:e.target.value, asset_id:'' })} style={inp}>
                  <option value="">Select store…</option>
                  {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>ASSET (optional)</label>
                <select value={form.asset_id} onChange={e => setForm({ ...form, asset_id:e.target.value })} style={inp} disabled={!form.store_id}>
                  <option value="">Whole store / no specific asset</option>
                  {assets.filter(a => a.store_id === form.store_id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>CATEGORY</label>
                <select value={form.category} onChange={e => setForm({ ...form, category:e.target.value })} style={inp}>
                  {[...Object.keys(CATEGORIES), 'PPM'].filter((v, i, a) => a.indexOf(v) === i).map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>FREQUENCY</label>
                <select value={form.freq} onChange={e => setForm({ ...form, freq:e.target.value })} style={inp}>
                  {PPM_FREQUENCIES.map(f => <option key={f.label} value={f.label}>{f.label}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>{form.id ? 'NEXT DUE DATE' : 'FIRST DUE DATE'} *</label>
                <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date:e.target.value })} style={inp}/>
              </div>
              <div>
                <label style={lbl}>CREATE WORK ORDER … DAYS BEFORE</label>
                <input type="number" min="0" max="30" value={form.lead_days} onChange={e => setForm({ ...form, lead_days:e.target.value })} style={inp}/>
              </div>
              <div>
                <label style={lbl}>TECHNICIAN</label>
                <select value={form.assigned_to} onChange={e => setForm({ ...form, assigned_to:e.target.value })} style={inp}>
                  <option value="">Unassigned</option>
                  {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>OR VENDOR</label>
                <select value={form.vendor_name} onChange={e => setForm({ ...form, vendor_name:e.target.value })} style={inp}>
                  <option value="">In-house</option>
                  {vendors.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>PRIORITY</label>
                <select value={form.priority} onChange={e => setForm({ ...form, priority:e.target.value })} style={inp}>
                  {['P1','P2','P3','P4'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>EXPECTED DURATION (HOURS)</label>
                <input type="number" min="0.5" step="0.5" value={form.duration_hours} onChange={e => setForm({ ...form, duration_hours:e.target.value })} style={inp}/>
              </div>

              <div style={{ gridColumn:'1 / -1' }}>
                <label style={lbl}>CHECKLIST — technician ticks each item on the work order</label>
                <select value="" onChange={e => { const t = CHECKLIST_TEMPLATES[e.target.value]; if (t) setForm({ ...form, checklist:[...form.checklist, ...t.filter(x => !form.checklist.includes(x))] }) }} style={{ ...inp, marginBottom:8 }}>
                  <option value="">+ Add items from a template…</option>
                  {Object.keys(CHECKLIST_TEMPLATES).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <div style={{ display:'grid', gap:6 }}>
                  {form.checklist.map((item, i) => (
                    <div key={i} style={{ display:'flex', gap:6, alignItems:'center' }}>
                      <span style={{ color:'var(--text3)', fontSize:12, width:18 }}>{i + 1}.</span>
                      <input value={item} onChange={e => { const c = [...form.checklist]; c[i] = e.target.value; setForm({ ...form, checklist:c }) }} style={inp}/>
                      <button onClick={() => setForm({ ...form, checklist: form.checklist.filter((_, j) => j !== i) })} style={{ ...btn, padding:'6px 10px' }}>✕</button>
                    </div>
                  ))}
                  <div style={{ display:'flex', gap:6 }}>
                    <input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Add your own item…" style={inp}
                      onKeyDown={e => { if (e.key === 'Enter' && newItem.trim()) { setForm({ ...form, checklist:[...form.checklist, newItem.trim()] }); setNewItem('') } }}/>
                    <button onClick={() => { if (newItem.trim()) { setForm({ ...form, checklist:[...form.checklist, newItem.trim()] }); setNewItem('') } }} style={btn}>Add</button>
                  </div>
                </div>
              </div>

              <div style={{ gridColumn:'1 / -1' }}>
                <label style={lbl}>NOTES / SCOPE</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes:e.target.value })} rows={2} style={{ ...inp, resize:'vertical' }}/>
              </div>
              <label style={{ gridColumn:'1 / -1', display:'flex', gap:8, alignItems:'center', fontSize:13 }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active:e.target.checked })} style={{ accentColor:'var(--green)' }}/>
                Active (create work orders automatically)
              </label>
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:18 }}>
              <button onClick={() => setForm(null)} style={btn}>Cancel</button>
              <button onClick={save} disabled={saving} style={{ ...primary, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving…' : 'Save plan'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
