import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const EMPTY_ASSET = { name:'', category:'', location:'', store_id:'', serial_number:'', status:'operational', notes:'' }
const EMPTY_STORE = { name:'', address:'', manager_name:'', phone:'', email:'', maps_url:'' }
const STATUS_COLORS = { operational:'#1D9E75', maintenance:'#EF9F27', inactive:'#f85149', retired:'#6b7280' }
const TABS = ['Assets', 'Stores']

export default function Assets() {
  const { isAdmin } = useAuth()
  const [tab, setTab]         = useState('Assets')
  const [assets, setAssets]   = useState([])
  const [stores, setStores]   = useState([])
  const [loading, setLoading] = useState(true)
  const [showAssetForm, setShowAssetForm] = useState(false)
  const [showStoreForm, setShowStoreForm] = useState(false)
  const [assetForm, setAssetForm] = useState(EMPTY_ASSET)
  const [storeForm, setStoreForm] = useState(EMPTY_STORE)
  const [saving, setSaving]   = useState(false)
  const [search, setSearch]   = useState('')
  const [editStore, setEditStore] = useState(null)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [aRes, sRes] = await Promise.all([
      supabase.from('assets').select('*,stores(name)').order('name'),
      supabase.from('stores').select('*').order('name'),
    ])
    setAssets(aRes.data || [])
    setStores(sRes.data || [])
    setLoading(false)
  }

  async function handleSaveAsset() {
    setSaving(true)
    await supabase.from('assets').insert(assetForm)
    setShowAssetForm(false); setAssetForm(EMPTY_ASSET); fetchAll()
    setSaving(false)
  }

  async function handleSaveStore() {
    setSaving(true)
    if (editStore) {
      await supabase.from('stores').update(storeForm).eq('id', editStore.id)
    } else {
      await supabase.from('stores').insert(storeForm)
    }
    setShowStoreForm(false); setStoreForm(EMPTY_STORE); setEditStore(null); fetchAll()
    setSaving(false)
  }

  function startEditStore(store) {
    setEditStore(store)
    setStoreForm({
      name: store.name || '',
      address: store.address || '',
      manager_name: store.manager_name || '',
      phone: store.phone || '',
      email: store.email || '',
      maps_url: store.maps_url || '',
    })
    setShowStoreForm(true)
  }

  const filteredAssets = assets.filter(a => !search || a.name?.toLowerCase().includes(search.toLowerCase()) || a.stores?.name?.toLowerCase().includes(search.toLowerCase()))
  const filteredStores = stores.filter(s => !search || s.name?.toLowerCase().includes(search.toLowerCase()))

  const inp = { background:'#0d1117', border:'1px solid #30363d', borderRadius:8, padding:'9px 12px', color:'#e6edf3', fontSize:13, width:'100%', boxSizing:'border-box', outline:'none' }

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ color:'#e6edf3', fontSize:22, fontWeight:600, margin:0 }}>
            {tab === 'Assets' ? 'Assets' : 'Stores & Locations'}
          </h1>
          <p style={{ color:'#6b7280', fontSize:13, margin:'4px 0 0' }}>
            {tab === 'Assets' ? `${assets.length} total assets` : `${stores.length} stores`}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => tab === 'Assets' ? setShowAssetForm(true) : setShowStoreForm(true)}
            style={{ background:'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'10px 18px', fontSize:13, fontWeight:500, cursor:'pointer' }}
          >
            {tab === 'Assets' ? '+ Add Asset' : '+ Add Store'}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, marginBottom:16, background:'#161b22', border:'1px solid #21262d', borderRadius:10, padding:4, width:'fit-content' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => { setTab(t); setSearch('') }}
            style={{ background: tab === t ? '#1D9E75' : 'transparent', color: tab === t ? 'white' : '#8b949e', border:'none', borderRadius:7, padding:'7px 20px', fontSize:13, fontWeight:500, cursor:'pointer', transition:'all 0.15s' }}>
            {t}
          </button>
        ))}
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder={tab === 'Assets' ? 'Search assets...' : 'Search stores...'}
        style={{ ...inp, width:260, marginBottom:16 }}/>

      {/* ── ASSETS TAB ── */}
      {tab === 'Assets' && (
        <>
          {showAssetForm && (
            <div style={{ background:'#161b22', border:'1px solid #1D9E75', borderRadius:12, padding:24, marginBottom:20 }}>
              <h3 style={{ color:'#e6edf3', fontSize:15, fontWeight:500, margin:'0 0 16px' }}>Add New Asset</h3>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {[['name','Asset Name *'],['category','Category'],['location','Location'],['serial_number','Serial Number']].map(([key,label]) => (
                  <div key={key}>
                    <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>{label}</label>
                    <input style={inp} value={assetForm[key]} onChange={e => setAssetForm({...assetForm, [key]:e.target.value})} placeholder={label.replace(' *','')}/>
                  </div>
                ))}
                <div>
                  <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Store</label>
                  <select style={{ ...inp, cursor:'pointer' }} value={assetForm.store_id} onChange={e => setAssetForm({...assetForm, store_id:e.target.value})}>
                    <option value="">Select store</option>
                    {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Status</label>
                  <select style={{ ...inp, cursor:'pointer' }} value={assetForm.status} onChange={e => setAssetForm({...assetForm, status:e.target.value})}>
                    <option value="operational">Operational</option>
                    <option value="maintenance">Under Maintenance</option>
                    <option value="inactive">Inactive</option>
                    <option value="retired">Retired</option>
                  </select>
                </div>
              </div>
              <div style={{ display:'flex', gap:10, marginTop:14 }}>
                <button onClick={handleSaveAsset} disabled={saving||!assetForm.name}
                  style={{ background:saving||!assetForm.name?'#155740':'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'10px 20px', fontSize:13, cursor:'pointer' }}>
                  {saving ? 'Saving...' : 'Save Asset'}
                </button>
                <button onClick={() => { setShowAssetForm(false); setAssetForm(EMPTY_ASSET) }}
                  style={{ background:'transparent', color:'#8b949e', border:'1px solid #30363d', borderRadius:8, padding:'10px 16px', fontSize:13, cursor:'pointer' }}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))', gap:10 }}>
            {loading ? (
              <div style={{ color:'#6b7280', gridColumn:'1/-1', padding:40, textAlign:'center' }}>Loading...</div>
            ) : filteredAssets.length === 0 ? (
              <div style={{ color:'#6b7280', gridColumn:'1/-1', padding:40, textAlign:'center' }}>No assets found</div>
            ) : filteredAssets.map(a => (
              <div key={a.id} style={{ background:'#161b22', border:'1px solid #21262d', borderRadius:12, padding:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ color:'#e6edf3', fontSize:13, fontWeight:500 }}>{a.name}</div>
                    <div style={{ color:'#6b7280', fontSize:11, marginTop:2 }}>{a.category || 'Uncategorized'}</div>
                  </div>
                  <span style={{ background: STATUS_COLORS[a.status]+'22', color: STATUS_COLORS[a.status], fontSize:10, padding:'2px 7px', borderRadius:5, fontWeight:500, whiteSpace:'nowrap' }}>
                    {a.status}
                  </span>
                </div>
                <div style={{ borderTop:'1px solid #21262d', paddingTop:8 }}>
                  <div style={{ color:'#6b7280', fontSize:11 }}>{a.stores?.name || 'No store assigned'}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── STORES TAB ── */}
      {tab === 'Stores' && (
        <>
          {showStoreForm && (
            <div style={{ background:'#161b22', border:'1px solid #1D9E75', borderRadius:12, padding:24, marginBottom:20 }}>
              <h3 style={{ color:'#e6edf3', fontSize:15, fontWeight:500, margin:'0 0 16px' }}>
                {editStore ? `Edit — ${editStore.name}` : 'Add New Store'}
              </h3>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {[['name','Store Name *'],['manager_name','Manager Name'],['phone','Phone Number'],['email','Email'],['address','Address'],['maps_url','Google Maps URL']].map(([key,label]) => (
                  <div key={key} style={{ gridColumn: key === 'address' || key === 'maps_url' ? '1/-1' : 'auto' }}>
                    <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>{label}</label>
                    <input style={inp} value={storeForm[key]} onChange={e => setStoreForm({...storeForm, [key]:e.target.value})} placeholder={label.replace(' *','')}/>
                  </div>
                ))}
              </div>
              <div style={{ display:'flex', gap:10, marginTop:14 }}>
                <button onClick={handleSaveStore} disabled={saving||!storeForm.name}
                  style={{ background:saving||!storeForm.name?'#155740':'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'10px 20px', fontSize:13, cursor:'pointer' }}>
                  {saving ? 'Saving...' : editStore ? 'Update Store' : 'Save Store'}
                </button>
                <button onClick={() => { setShowStoreForm(false); setStoreForm(EMPTY_STORE); setEditStore(null) }}
                  style={{ background:'transparent', color:'#8b949e', border:'1px solid #30363d', borderRadius:8, padding:'10px 16px', fontSize:13, cursor:'pointer' }}>Cancel</button>
              </div>
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px,1fr))', gap:12 }}>
            {loading ? (
              <div style={{ color:'#6b7280', gridColumn:'1/-1', padding:40, textAlign:'center' }}>Loading...</div>
            ) : filteredStores.length === 0 ? (
              <div style={{ color:'#6b7280', gridColumn:'1/-1', padding:40, textAlign:'center' }}>No stores found</div>
            ) : filteredStores.map(s => (
              <div key={s.id} style={{ background:'#161b22', border:'1px solid #21262d', borderRadius:12, padding:18 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ color:'#e6edf3', fontSize:14, fontWeight:500 }}>{s.name}</div>
                    {s.manager_name && (
                      <div style={{ color:'#1D9E75', fontSize:12, marginTop:3 }}>👤 {s.manager_name}</div>
                    )}
                  </div>
                  {isAdmin && (
                    <button onClick={() => startEditStore(s)}
                      style={{ background:'transparent', color:'#6b7280', border:'1px solid #30363d', borderRadius:6, padding:'4px 10px', fontSize:11, cursor:'pointer' }}>
                      Edit
                    </button>
                  )}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6, borderTop:'1px solid #21262d', paddingTop:10 }}>
                  {s.phone && (
                    <a href={`tel:${s.phone}`} style={{ color:'#8b949e', fontSize:12, textDecoration:'none', display:'flex', alignItems:'center', gap:6 }}>
                      📞 {s.phone}
                    </a>
                  )}
                  {s.email && (
                    <a href={`mailto:${s.email}`} style={{ color:'#8b949e', fontSize:12, textDecoration:'none', display:'flex', alignItems:'center', gap:6 }}>
                      ✉️ {s.email}
                    </a>
                  )}
                  {s.maps_url && (
                    <a href={s.maps_url} target="_blank" rel="noreferrer" style={{ color:'#378ADD', fontSize:12, textDecoration:'none', display:'flex', alignItems:'center', gap:6 }}>
                      📍 View on Google Maps →
                    </a>
                  )}
                  <div style={{ color:'#6b7280', fontSize:11, marginTop:2 }}>
                    {assets.filter(a => a.store_id === s.id).length} assets registered
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
