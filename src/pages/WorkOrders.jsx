import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import SLABadge from '../components/SLABadge'
import { useSearchParams } from 'react-router-dom'

const P_COLORS = { P1:'#f85149', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }
const STATUSES = ['open','in_progress','on_hold','closed']
const PRIORITIES = ['P1','P2','P3','P4']

const EMPTY_FORM = { title:'', description:'', priority:'P2', store_id:'', asset_id:'', assigned_to:'', status:'open' }

export default function WorkOrders() {
  const { profile, isAdmin, isOperations } = useAuth()
  const [searchParams] = useSearchParams()
  const [wos, setWos]       = useState([])
  const [stores, setStores] = useState([])
  const [assets, setAssets] = useState([])
  const [techs, setTechs]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(!!searchParams.get('new'))
  const [form, setForm]         = useState(EMPTY_FORM)
  const [saving, setSaving]     = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [woRes, storeRes, assetRes, techRes] = await Promise.all([
      supabase.from('work_orders').select('*,stores(name),assets(name),profiles(full_name)').order('created_at', { ascending:false }),
      supabase.from('stores').select('id,name'),
      supabase.from('assets').select('id,name'),
      supabase.from('profiles').select('id,full_name').eq('role','technician'),
    ])
    setWos(woRes.data || [])
    setStores(storeRes.data || [])
    setAssets(assetRes.data || [])
    setTechs(techRes.data || [])
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    const payload = { ...form, created_by: profile.id }
    if (!isAdmin) payload.store_id = profile.store_id
    const { error } = await supabase.from('work_orders').insert(payload)
    if (!error) { setShowForm(false); setForm(EMPTY_FORM); fetchAll() }
    setSaving(false)
  }

  async function updateStatus(id, status) {
    await supabase.from('work_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    fetchAll()
  }

  const filtered = wos.filter(w => {
    if (filterStatus !== 'all' && w.status !== filterStatus) return false
    if (filterPriority !== 'all' && w.priority !== filterPriority) return false
    if (search && !w.title?.toLowerCase().includes(search.toLowerCase())) return false
    if (isOperations && profile?.store_id && w.store_id !== profile.store_id) return false
    return true
  })

  const inp = { background:'#0d1117', border:'1px solid #30363d', borderRadius:8, padding:'9px 12px', color:'#e6edf3', fontSize:13, width:'100%', boxSizing:'border-box', outline:'none' }
  const sel = { ...inp, cursor:'pointer' }

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ color:'#e6edf3', fontSize:22, fontWeight:600, margin:0 }}>Work Orders</h1>
          <p style={{ color:'#6b7280', fontSize:13, margin:'4px 0 0' }}>{wos.length} total · {wos.filter(w=>w.status==='open').length} open</p>
        </div>
        <button onClick={() => setShowForm(true)} style={{ background:'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'10px 18px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
          + New Work Order
        </button>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search work orders..." style={{ ...inp, width:200 }}/>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...sel, width:140 }}>
          <option value="all">All status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ ...sel, width:130 }}>
          <option value="all">All priority</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* New WO Form */}
      {showForm && (
        <div style={{ background:'#161b22', border:'1px solid #1D9E75', borderRadius:12, padding:24, marginBottom:20 }}>
          <h3 style={{ color:'#e6edf3', fontSize:15, fontWeight:500, margin:'0 0 18px' }}>Create New Work Order</h3>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Title *</label>
              <input style={inp} value={form.title} onChange={e => setForm({...form, title:e.target.value})} placeholder="Describe the issue..."/>
            </div>
            <div>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Priority *</label>
              <select style={sel} value={form.priority} onChange={e => setForm({...form, priority:e.target.value})}>
                <option value="P1">P1 — Critical (4h SLA)</option>
                <option value="P2">P2 — High (8h SLA)</option>
                <option value="P3">P3 — Medium (12h SLA)</option>
                <option value="P4">P4 — Low (7 days SLA)</option>
              </select>
            </div>
            <div>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Store / Location</label>
              <select style={sel} value={form.store_id} onChange={e => setForm({...form, store_id:e.target.value})}>
                <option value="">Select store</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Asset</label>
              <select style={sel} value={form.asset_id} onChange={e => setForm({...form, asset_id:e.target.value})}>
                <option value="">Select asset</option>
                {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            {isAdmin && (
              <div>
                <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Assign Technician</label>
                <select style={sel} value={form.assigned_to} onChange={e => setForm({...form, assigned_to:e.target.value})}>
                  <option value="">Unassigned</option>
                  {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
            )}
            <div style={{ gridColumn:'1/-1' }}>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Description</label>
              <textarea style={{ ...inp, height:80, resize:'vertical' }} value={form.description} onChange={e => setForm({...form, description:e.target.value})} placeholder="Additional details..."/>
            </div>
          </div>
          <div style={{ display:'flex', gap:10, marginTop:16 }}>
            <button onClick={handleSave} disabled={saving || !form.title} style={{ background: saving||!form.title?'#155740':'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'10px 20px', fontSize:13, fontWeight:500, cursor: saving||!form.title?'not-allowed':'pointer' }}>
              {saving ? 'Saving...' : 'Create Work Order'}
            </button>
            <button onClick={() => { setShowForm(false); setForm(EMPTY_FORM) }} style={{ background:'transparent', color:'#8b949e', border:'1px solid #30363d', borderRadius:8, padding:'10px 16px', fontSize:13, cursor:'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background:'#161b22', border:'1px solid #21262d', borderRadius:12, overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#6b7280' }}>Loading work orders...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'#6b7280' }}>No work orders found</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #21262d' }}>
                {['#','Priority','Title','Store','Assigned To','Status','SLA'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', color:'#6b7280', fontSize:12, fontWeight:500, textAlign:'left', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((wo, i) => (
                <tr key={wo.id} style={{ borderBottom:'1px solid #21262d' }}
                  onMouseEnter={e => e.currentTarget.style.background='#1c2128'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}
                >
                  <td style={{ padding:'12px 14px', color:'#6b7280', fontSize:12 }}>#{String(i+1).padStart(4,'0')}</td>
                  <td style={{ padding:'12px 14px' }}>
                    <span style={{ background: P_COLORS[wo.priority]+'22', color: P_COLORS[wo.priority], fontSize:11, padding:'3px 10px', borderRadius:6, fontWeight:600 }}>{wo.priority}</span>
                  </td>
                  <td style={{ padding:'12px 14px', color:'#e6edf3', fontSize:13, maxWidth:200 }}>{wo.title}</td>
                  <td style={{ padding:'12px 14px', color:'#8b949e', fontSize:12 }}>{wo.stores?.name || '—'}</td>
                  <td style={{ padding:'12px 14px', color:'#8b949e', fontSize:12 }}>{wo.profiles?.full_name || 'Unassigned'}</td>
                  <td style={{ padding:'12px 14px' }}>
                    <select value={wo.status} onChange={e => updateStatus(wo.id, e.target.value)}
                      style={{ background:'#0d1117', border:'1px solid #30363d', borderRadius:6, padding:'4px 8px', color:'#e6edf3', fontSize:12, cursor:'pointer' }}>
                      {STATUSES.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
                    </select>
                  </td>
                  <td style={{ padding:'12px 14px', minWidth:160 }}>
                    <SLABadge priority={wo.priority} createdAt={wo.created_at} status={wo.status}/>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
