import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const EMPTY = { name:'', category:'', location:'', store_id:'', serial_number:'', status:'operational', notes:'' }
const STATUS_COLORS = { operational:'#1D9E75', maintenance:'#EF9F27', inactive:'#f85149', retired:'#6b7280' }

export default function Assets() {
  const { isAdmin } = useAuth()
  const [assets, setAssets] = useState([])
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [aRes, sRes] = await Promise.all([
      supabase.from('assets').select('*,stores(name)').order('created_at', { ascending:false }),
      supabase.from('stores').select('id,name'),
    ])
    setAssets(aRes.data || [])
    setStores(sRes.data || [])
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    await supabase.from('assets').insert(form)
    setShowForm(false); setForm(EMPTY); fetchAll()
    setSaving(false)
  }

  const filtered = assets.filter(a => !search || a.name?.toLowerCase().includes(search.toLowerCase()))
  const inp = { background:'#0d1117', border:'1px solid #30363d', borderRadius:8, padding:'9px 12px', color:'#e6edf3', fontSize:13, width:'100%', boxSizing:'border-box', outline:'none' }

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ color:'#e6edf3', fontSize:22, fontWeight:600, margin:0 }}>Assets</h1>
          <p style={{ color:'#6b7280', fontSize:13, margin:'4px 0 0' }}>{assets.length} total assets tracked</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowForm(true)} style={{ background:'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'10px 18px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            + Add Asset
          </button>
        )}
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assets..." style={{ ...inp, width:240, marginBottom:16 }}/>

      {showForm && (
        <div style={{ background:'#161b22', border:'1px solid #1D9E75', borderRadius:12, padding:24, marginBottom:20 }}>
          <h3 style={{ color:'#e6edf3', fontSize:15, fontWeight:500, margin:'0 0 16px' }}>Add New Asset</h3>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[['name','Asset Name *'],['category','Category'],['location','Location'],['serial_number','Serial Number']].map(([key,label]) => (
              <div key={key}>
                <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>{label}</label>
                <input style={inp} value={form[key]} onChange={e => setForm({...form, [key]:e.target.value})} placeholder={label.replace(' *','')}/>
              </div>
            ))}
            <div>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Store</label>
              <select style={{ ...inp, cursor:'pointer' }} value={form.store_id} onChange={e => setForm({...form, store_id:e.target.value})}>
                <option value="">Select store</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Status</label>
              <select style={{ ...inp, cursor:'pointer' }} value={form.status} onChange={e => setForm({...form, status:e.target.value})}>
                <option value="operational">Operational</option>
                <option value="maintenance">Under Maintenance</option>
                <option value="inactive">Inactive</option>
                <option value="retired">Retired</option>
              </select>
            </div>
          </div>
          <div style={{ display:'flex', gap:10, marginTop:14 }}>
            <button onClick={handleSave} disabled={saving||!form.name} style={{ background:saving||!form.name?'#155740':'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'10px 20px', fontSize:13, fontWeight:500, cursor:saving||!form.name?'not-allowed':'pointer' }}>
              {saving ? 'Saving...' : 'Save Asset'}
            </button>
            <button onClick={() => { setShowForm(false); setForm(EMPTY) }} style={{ background:'transparent', color:'#8b949e', border:'1px solid #30363d', borderRadius:8, padding:'10px 16px', fontSize:13, cursor:'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:12 }}>
        {loading ? (
          <div style={{ color:'#6b7280', gridColumn:'1/-1', padding:40, textAlign:'center' }}>Loading assets...</div>
        ) : filtered.length === 0 ? (
          <div style={{ color:'#6b7280', gridColumn:'1/-1', padding:40, textAlign:'center' }}>No assets yet. Add your first asset!</div>
        ) : filtered.map(a => (
          <div key={a.id} style={{ background:'#161b22', border:'1px solid #21262d', borderRadius:12, padding:18 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
              <div style={{ flex:1 }}>
                <div style={{ color:'#e6edf3', fontSize:14, fontWeight:500 }}>{a.name}</div>
                <div style={{ color:'#6b7280', fontSize:12, marginTop:2 }}>{a.category || 'Uncategorized'}</div>
              </div>
              <span style={{ background: STATUS_COLORS[a.status]+'22', color: STATUS_COLORS[a.status], fontSize:11, padding:'3px 8px', borderRadius:6, fontWeight:500, whiteSpace:'nowrap' }}>
                {a.status}
              </span>
            </div>
            <div style={{ borderTop:'1px solid #21262d', paddingTop:10, display:'flex', flexDirection:'column', gap:5 }}>
              {[['Store', a.stores?.name], ['Location', a.location], ['Serial', a.serial_number]].map(([l, v]) => v ? (
                <div key={l} style={{ display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:'#6b7280', fontSize:12 }}>{l}</span>
                  <span style={{ color:'#8b949e', fontSize:12 }}>{v}</span>
                </div>
              ) : null)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
