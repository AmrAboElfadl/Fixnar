import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const EMPTY = { title:'', asset_id:'', store_id:'', frequency_months:3, assigned_to:'', due_date:'', notes:'' }

export default function PPM() {
  const { isAdmin } = useAuth()
  const [tasks, setTasks]   = useState([])
  const [assets, setAssets] = useState([])
  const [stores, setStores] = useState([])
  const [techs, setTechs]   = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [tRes, aRes, sRes, pRes] = await Promise.all([
      supabase.from('ppm_tasks').select('*,assets(name),stores(name),profiles(full_name)').order('due_date', { ascending:true }),
      supabase.from('assets').select('id,name'),
      supabase.from('stores').select('id,name'),
      supabase.from('profiles').select('id,full_name').eq('role','technician'),
    ])
    setTasks(tRes.data || [])
    setAssets(aRes.data || [])
    setStores(sRes.data || [])
    setTechs(pRes.data || [])
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    await supabase.from('ppm_tasks').insert(form)
    setShowForm(false); setForm(EMPTY); fetchAll()
    setSaving(false)
  }

  async function updateStatus(id, status) {
    const updates = { status }
    if (status === 'done') {
      const task = tasks.find(t => t.id === id)
      if (task) {
        const next = new Date(task.due_date)
        next.setMonth(next.getMonth() + (task.frequency_months || 3))
        updates.next_due = next.toISOString()
      }
    }
    await supabase.from('ppm_tasks').update(updates).eq('id', id)
    fetchAll()
  }

  function getDaysUntilDue(dueDate) {
    const now = new Date(); const due = new Date(dueDate)
    return Math.round((due - now) / (1000*60*60*24))
  }

  function dueBadge(days, status) {
    if (status === 'done') return { label:'Done', bg:'#1d2f26', color:'#1D9E75' }
    if (days < 0)  return { label:`${Math.abs(days)}d overdue`, bg:'#2d1b1b', color:'#f85149' }
    if (days <= 7) return { label:`Due in ${days}d`, bg:'#2d2208', color:'#EF9F27' }
    return { label:`Due in ${days}d`, bg:'#1a2b3c', color:'#378ADD' }
  }

  const inp = { background:'#0d1117', border:'1px solid #30363d', borderRadius:8, padding:'9px 12px', color:'#e6edf3', fontSize:13, width:'100%', boxSizing:'border-box', outline:'none' }

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ color:'#e6edf3', fontSize:22, fontWeight:600, margin:0 }}>PPM Schedule</h1>
          <p style={{ color:'#6b7280', fontSize:13, margin:'4px 0 0' }}>Preventive maintenance — 3-month SLA</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowForm(true)} style={{ background:'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'10px 18px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            + Schedule PPM
          </button>
        )}
      </div>

      {showForm && (
        <div style={{ background:'#161b22', border:'1px solid #1D9E75', borderRadius:12, padding:24, marginBottom:20 }}>
          <h3 style={{ color:'#e6edf3', fontSize:15, fontWeight:500, margin:'0 0 16px' }}>Schedule PPM Task</h3>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Task Title *</label>
              <input style={inp} value={form.title} onChange={e => setForm({...form, title:e.target.value})} placeholder="e.g. Exhaust Hood Quarterly Service"/>
            </div>
            <div>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Asset</label>
              <select style={{ ...inp, cursor:'pointer' }} value={form.asset_id} onChange={e => setForm({...form, asset_id:e.target.value})}>
                <option value="">Select asset</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Store</label>
              <select style={{ ...inp, cursor:'pointer' }} value={form.store_id} onChange={e => setForm({...form, store_id:e.target.value})}>
                <option value="">Select store</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Due Date *</label>
              <input type="date" style={{ ...inp, cursor:'pointer' }} value={form.due_date} onChange={e => setForm({...form, due_date:e.target.value})}/>
            </div>
            <div>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Frequency (months)</label>
              <select style={{ ...inp, cursor:'pointer' }} value={form.frequency_months} onChange={e => setForm({...form, frequency_months:parseInt(e.target.value)})}>
                {[1,2,3,6,12].map(m => <option key={m} value={m}>Every {m} month{m>1?'s':''}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Assign Technician</label>
              <select style={{ ...inp, cursor:'pointer' }} value={form.assigned_to} onChange={e => setForm({...form, assigned_to:e.target.value})}>
                <option value="">Unassigned</option>
                {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display:'flex', gap:10, marginTop:14 }}>
            <button onClick={handleSave} disabled={saving||!form.title||!form.due_date} style={{ background:saving?'#155740':'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'10px 20px', fontSize:13, fontWeight:500, cursor:saving?'not-allowed':'pointer' }}>
              {saving ? 'Saving...' : 'Schedule Task'}
            </button>
            <button onClick={() => { setShowForm(false); setForm(EMPTY) }} style={{ background:'transparent', color:'#8b949e', border:'1px solid #30363d', borderRadius:8, padding:'10px 16px', fontSize:13, cursor:'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ background:'#161b22', border:'1px solid #21262d', borderRadius:12, overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#6b7280' }}>Loading PPM tasks...</div>
        ) : tasks.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'#6b7280' }}>No PPM tasks scheduled yet</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #21262d' }}>
                {['Task','Asset','Store','Assigned','Due Date','Frequency','Status'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', color:'#6b7280', fontSize:12, fontWeight:500, textAlign:'left', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tasks.map(t => {
                const days = getDaysUntilDue(t.due_date)
                const badge = dueBadge(days, t.status)
                return (
                  <tr key={t.id} style={{ borderBottom:'1px solid #21262d' }}
                    onMouseEnter={e => e.currentTarget.style.background='#1c2128'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}
                  >
                    <td style={{ padding:'12px 14px', color:'#e6edf3', fontSize:13 }}>{t.title}</td>
                    <td style={{ padding:'12px 14px', color:'#8b949e', fontSize:12 }}>{t.assets?.name || '—'}</td>
                    <td style={{ padding:'12px 14px', color:'#8b949e', fontSize:12 }}>{t.stores?.name || '—'}</td>
                    <td style={{ padding:'12px 14px', color:'#8b949e', fontSize:12 }}>{t.profiles?.full_name || 'Unassigned'}</td>
                    <td style={{ padding:'12px 14px', color:'#8b949e', fontSize:12, whiteSpace:'nowrap' }}>{new Date(t.due_date).toLocaleDateString()}</td>
                    <td style={{ padding:'12px 14px', color:'#8b949e', fontSize:12 }}>Every {t.frequency_months}mo</td>
                    <td style={{ padding:'12px 14px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ background: badge.bg, color: badge.color, fontSize:11, padding:'3px 8px', borderRadius:6, fontWeight:500, whiteSpace:'nowrap' }}>{badge.label}</span>
                        {t.status !== 'done' && isAdmin && (
                          <button onClick={() => updateStatus(t.id, 'done')} style={{ background:'transparent', color:'#1D9E75', border:'1px solid #1D9E75', borderRadius:6, padding:'2px 8px', fontSize:11, cursor:'pointer' }}>
                            Mark done
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
