import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const STATUS_COLORS = { operational:'#1D9E75', maintenance:'#EF9F27', inactive:'#f85149', retired:'#6b7280' }
const EMPTY_ASSET = { name:'', category:'', location:'', store_id:'', serial_number:'', status:'operational' }

export default function Assets() {
  const { isAdmin } = useAuth()
  const [stores, setStores]         = useState([])
  const [assets, setAssets]         = useState([])
  const [selectedStore, setSelectedStore] = useState(null)
  const [view, setView]             = useState('stores') // 'stores' | 'store-detail' | 'store-assets'
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [showAssetForm, setShowAssetForm] = useState(false)
  const [assetForm, setAssetForm]   = useState(EMPTY_ASSET)
  const [saving, setSaving]         = useState(false)
  const [editingStore, setEditingStore] = useState(null)
  const [storeForm, setStoreForm]   = useState({})
  const [savingStore, setSavingStore] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [sRes, aRes] = await Promise.all([
      supabase.from('stores').select('*').order('name'),
      supabase.from('assets').select('*').order('name'),
    ])
    setStores(sRes.data || [])
    setAssets(aRes.data || [])
    setLoading(false)
  }

  function selectStore(store) {
    setSelectedStore(store)
    setView('store-detail')
    setSearch('')
  }

  function goBack() {
    if (view === 'store-assets') { setView('store-detail') }
    else { setView('stores'); setSelectedStore(null) }
    setSearch('')
  }

  async function handleSaveAsset() {
    setSaving(true)
    await supabase.from('assets').insert({ ...assetForm, store_id: selectedStore.id })
    setShowAssetForm(false); setAssetForm(EMPTY_ASSET); fetchAll()
    setSaving(false)
  }

  async function handleUpdateAssetStatus(id, status) {
    await supabase.from('assets').update({ status }).eq('id', id)
    fetchAll()
  }

  function startEditStore(store) {
    setEditingStore(store.id)
    setStoreForm({
      name: store.name || '',
      manager_name: store.manager_name || '',
      phone: store.phone || '',
      email: store.email || '',
      address: store.address || '',
      maps_url: store.maps_url || '',
    })
  }

  async function handleSaveStore() {
    setSavingStore(true)
    await supabase.from('stores').update(storeForm).eq('id', editingStore)
    setEditingStore(null)
    await fetchAll()
    // Refresh selected store
    const updated = stores.find(s => s.id === editingStore)
    if (updated) setSelectedStore({ ...updated, ...storeForm })
    setSavingStore(false)
  }

  const storeAssets = selectedStore ? assets.filter(a => a.store_id === selectedStore.id) : []
  const filteredStores = stores.filter(s => !search || s.name?.toLowerCase().includes(search.toLowerCase()))
  const filteredAssets = storeAssets.filter(a => !search || a.name?.toLowerCase().includes(search.toLowerCase()) || a.category?.toLowerCase().includes(search.toLowerCase()))

  const inp = { background:'#0d1117', border:'1px solid #30363d', borderRadius:8, padding:'9px 12px', color:'#e6edf3', fontSize:13, width:'100%', boxSizing:'border-box', outline:'none' }

  // ── STORES LIST VIEW ──
  if (view === 'stores') return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ color:'#e6edf3', fontSize:22, fontWeight:600, margin:0 }}>Stores</h1>
          <p style={{ color:'#6b7280', fontSize:13, margin:'4px 0 0' }}>{stores.length} locations · {assets.length} total assets</p>
        </div>
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search stores..."
        style={{ ...inp, width:260, marginBottom:16 }}/>

      {loading ? (
        <div style={{ color:'#6b7280', padding:40, textAlign:'center' }}>Loading stores...</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:12 }}>
          {filteredStores.map(s => {
            const storeAssetCount = assets.filter(a => a.store_id === s.id).length
            return (
              <div key={s.id} onClick={() => selectStore(s)}
                style={{ background:'#161b22', border:'1px solid #21262d', borderRadius:12, padding:18, cursor:'pointer', transition:'border-color 0.15s' }}
                onMouseEnter={e => e.currentTarget.style.borderColor='#1D9E75'}
                onMouseLeave={e => e.currentTarget.style.borderColor='#21262d'}
              >
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                  <div>
                    <div style={{ color:'#e6edf3', fontSize:14, fontWeight:600 }}>{s.name}</div>
                    {s.manager_name && <div style={{ color:'#1D9E75', fontSize:12, marginTop:3 }}>👤 {s.manager_name}</div>}
                  </div>
                  <span style={{ background:'#1d2f26', color:'#1D9E75', fontSize:11, padding:'3px 8px', borderRadius:6, fontWeight:500, whiteSpace:'nowrap' }}>
                    {storeAssetCount} assets
                  </span>
                </div>
                <div style={{ borderTop:'1px solid #21262d', paddingTop:10, display:'flex', flexDirection:'column', gap:5 }}>
                  {s.phone && <div style={{ color:'#8b949e', fontSize:12 }}>📞 {s.phone}</div>}
                  {s.email && <div style={{ color:'#8b949e', fontSize:12 }}>✉️ {s.email}</div>}
                  {!s.phone && !s.email && <div style={{ color:'#6b7280', fontSize:12 }}>No contact info</div>}
                </div>
                <div style={{ marginTop:10, color:'#378ADD', fontSize:12, fontWeight:500 }}>
                  View details →
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // ── STORE DETAIL VIEW ──
  if (view === 'store-detail' && selectedStore) return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>
      {/* Breadcrumb */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
        <button onClick={goBack} style={{ background:'transparent', border:'none', color:'#6b7280', cursor:'pointer', fontSize:13, padding:0 }}>
          ← Stores
        </button>
        <span style={{ color:'#30363d' }}>/</span>
        <span style={{ color:'#e6edf3', fontSize:13, fontWeight:500 }}>{selectedStore.name}</span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
        {/* Store Info Card */}
        <div style={{ background:'#161b22', border:'1px solid #21262d', borderRadius:12, padding:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <h2 style={{ color:'#e6edf3', fontSize:16, fontWeight:600, margin:0 }}>{selectedStore.name}</h2>
            {isAdmin && editingStore !== selectedStore.id && (
              <button onClick={() => startEditStore(selectedStore)}
                style={{ background:'transparent', color:'#6b7280', border:'1px solid #30363d', borderRadius:6, padding:'4px 12px', fontSize:12, cursor:'pointer' }}>
                Edit
              </button>
            )}
          </div>

          {editingStore === selectedStore.id ? (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[['manager_name','Manager Name'],['phone','Phone'],['email','Email'],['address','Address'],['maps_url','Google Maps URL']].map(([key,label]) => (
                <div key={key}>
                  <label style={{ color:'#8b949e', fontSize:11, display:'block', marginBottom:4 }}>{label}</label>
                  <input style={{ ...inp, fontSize:12 }} value={storeForm[key] || ''} onChange={e => setStoreForm({...storeForm,[key]:e.target.value})}/>
                </div>
              ))}
              <div style={{ display:'flex', gap:8, marginTop:4 }}>
                <button onClick={handleSaveStore} disabled={savingStore}
                  style={{ background:'#1D9E75', color:'white', border:'none', borderRadius:7, padding:'8px 16px', fontSize:12, cursor:'pointer' }}>
                  {savingStore ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => setEditingStore(null)}
                  style={{ background:'transparent', color:'#8b949e', border:'1px solid #30363d', borderRadius:7, padding:'8px 12px', fontSize:12, cursor:'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {selectedStore.manager_name && (
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <span style={{ color:'#6b7280', fontSize:12, width:80 }}>Manager</span>
                  <span style={{ color:'#1D9E75', fontSize:13, fontWeight:500 }}>👤 {selectedStore.manager_name}</span>
                </div>
              )}
              {selectedStore.phone && (
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <span style={{ color:'#6b7280', fontSize:12, width:80 }}>Phone</span>
                  <a href={`tel:${selectedStore.phone}`} style={{ color:'#e6edf3', fontSize:13, textDecoration:'none' }}>📞 {selectedStore.phone}</a>
                </div>
              )}
              {selectedStore.email && (
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <span style={{ color:'#6b7280', fontSize:12, width:80 }}>Email</span>
                  <a href={`mailto:${selectedStore.email}`} style={{ color:'#e6edf3', fontSize:13, textDecoration:'none' }}>✉️ {selectedStore.email}</a>
                </div>
              )}
              {selectedStore.address && (
                <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                  <span style={{ color:'#6b7280', fontSize:12, width:80 }}>Address</span>
                  <span style={{ color:'#8b949e', fontSize:12 }}>{selectedStore.address}</span>
                </div>
              )}
              {selectedStore.maps_url && (
                <a href={selectedStore.maps_url} target="_blank" rel="noreferrer"
                  style={{ display:'inline-flex', alignItems:'center', gap:6, background:'#1a2b3c', color:'#378ADD', border:'1px solid #1f3a56', borderRadius:8, padding:'8px 14px', fontSize:12, textDecoration:'none', marginTop:4, width:'fit-content' }}>
                  📍 Open in Google Maps →
                </a>
              )}
            </div>
          )}
        </div>

        {/* Stats Card */}
        <div style={{ background:'#161b22', border:'1px solid #21262d', borderRadius:12, padding:20 }}>
          <h3 style={{ color:'#e6edf3', fontSize:14, fontWeight:500, margin:'0 0 16px' }}>Store Overview</h3>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {[
              { label:'Total Assets',    value: storeAssets.length,                                    color:'#e6edf3' },
              { label:'Operational',     value: storeAssets.filter(a=>a.status==='operational').length, color:'#1D9E75' },
              { label:'Maintenance',     value: storeAssets.filter(a=>a.status==='maintenance').length, color:'#EF9F27' },
              { label:'Inactive',        value: storeAssets.filter(a=>a.status==='inactive').length,    color:'#f85149' },
            ].map(k => (
              <div key={k.label} style={{ background:'#0d1117', borderRadius:8, padding:'12px 14px' }}>
                <div style={{ color:'#6b7280', fontSize:11 }}>{k.label}</div>
                <div style={{ color: k.color, fontSize:22, fontWeight:600 }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* View Assets Button */}
      <button onClick={() => setView('store-assets')}
        style={{ background:'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'12px 24px', fontSize:14, fontWeight:500, cursor:'pointer', marginBottom:20, display:'flex', alignItems:'center', gap:8 }}>
        ◈ View All {storeAssets.length} Assets →
      </button>
    </div>
  )

  // ── STORE ASSETS VIEW ──
  if (view === 'store-assets' && selectedStore) return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>
      {/* Breadcrumb */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
        <button onClick={() => { setView('stores'); setSelectedStore(null) }} style={{ background:'transparent', border:'none', color:'#6b7280', cursor:'pointer', fontSize:13, padding:0 }}>
          ← Stores
        </button>
        <span style={{ color:'#30363d' }}>/</span>
        <button onClick={() => setView('store-detail')} style={{ background:'transparent', border:'none', color:'#6b7280', cursor:'pointer', fontSize:13, padding:0 }}>
          {selectedStore.name}
        </button>
        <span style={{ color:'#30363d' }}>/</span>
        <span style={{ color:'#e6edf3', fontSize:13, fontWeight:500 }}>Assets</span>
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
        <div>
          <h1 style={{ color:'#e6edf3', fontSize:20, fontWeight:600, margin:0 }}>{selectedStore.name} — Assets</h1>
          <p style={{ color:'#6b7280', fontSize:13, margin:'4px 0 0' }}>{storeAssets.length} assets registered</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowAssetForm(!showAssetForm)}
            style={{ background:'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'10px 18px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            + Add Asset
          </button>
        )}
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search assets..."
        style={{ ...inp, width:260, marginBottom:16 }}/>

      {showAssetForm && (
        <div style={{ background:'#161b22', border:'1px solid #1D9E75', borderRadius:12, padding:20, marginBottom:16 }}>
          <h3 style={{ color:'#e6edf3', fontSize:14, fontWeight:500, margin:'0 0 14px' }}>Add Asset to {selectedStore.name}</h3>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {[['name','Name *'],['category','Category'],['location','Location'],['serial_number','Serial #']].map(([key,label]) => (
              <div key={key}>
                <label style={{ color:'#8b949e', fontSize:11, display:'block', marginBottom:4 }}>{label}</label>
                <input style={inp} value={assetForm[key]||''} onChange={e => setAssetForm({...assetForm,[key]:e.target.value})}/>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:8, marginTop:12 }}>
            <button onClick={handleSaveAsset} disabled={saving||!assetForm.name}
              style={{ background:saving||!assetForm.name?'#155740':'#1D9E75', color:'white', border:'none', borderRadius:7, padding:'9px 18px', fontSize:13, cursor:'pointer' }}>
              {saving?'Saving...':'Save Asset'}
            </button>
            <button onClick={() => setShowAssetForm(false)}
              style={{ background:'transparent', color:'#8b949e', border:'1px solid #30363d', borderRadius:7, padding:'9px 14px', fontSize:13, cursor:'pointer' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Group assets by category */}
      {(() => {
        const grouped = filteredAssets.reduce((acc, a) => {
          const cat = a.category || 'General'
          if (!acc[cat]) acc[cat] = []
          acc[cat].push(a)
          return acc
        }, {})

        return Object.entries(grouped).sort().map(([cat, items]) => (
          <div key={cat} style={{ marginBottom:20 }}>
            <div style={{ color:'#8b949e', fontSize:12, fontWeight:500, textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10, display:'flex', alignItems:'center', gap:8 }}>
              {cat}
              <span style={{ background:'#21262d', color:'#6b7280', fontSize:10, padding:'2px 7px', borderRadius:10 }}>{items.length}</span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px,1fr))', gap:8 }}>
              {items.map(a => (
                <div key={a.id} style={{ background:'#161b22', border:'1px solid #21262d', borderRadius:10, padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ color:'#e6edf3', fontSize:13, fontWeight:500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.name}</div>
                    {a.serial_number && <div style={{ color:'#6b7280', fontSize:11, marginTop:2 }}>S/N: {a.serial_number}</div>}
                  </div>
                  <select value={a.status} onChange={e => handleUpdateAssetStatus(a.id, e.target.value)}
                    style={{ background: STATUS_COLORS[a.status]+'22', color: STATUS_COLORS[a.status], border:'none', borderRadius:6, padding:'3px 6px', fontSize:11, cursor:'pointer', fontWeight:500, marginLeft:8 }}>
                    <option value="operational">Operational</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="inactive">Inactive</option>
                    <option value="retired">Retired</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))
      })()}
    </div>
  )

  return null
}
