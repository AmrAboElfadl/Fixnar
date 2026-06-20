import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const FIELDS = [
  { key:'name',          label:'Store Name *',    type:'text',   col:2 },
  { key:'address',       label:'Address',          type:'text',   col:2 },
  { key:'city',          label:'City',             type:'text',   col:1 },
  { key:'manager_name',  label:'Manager Name',     type:'text',   col:1 },
  { key:'phone',         label:'Phone',            type:'tel',    col:1 },
  { key:'email',         label:'Email',            type:'email',  col:1 },
  { key:'latitude',      label:'Latitude',         type:'text',   col:1 },
  { key:'longitude',     label:'Longitude',        type:'text',   col:1 },
  { key:'opening_hours', label:'Opening Hours',    type:'text',   col:1 },
  { key:'notes',         label:'Notes',            type:'text',   col:2 },
]

const EMPTY = { name:'', address:'', city:'', manager_name:'', phone:'', email:'', latitude:'', longitude:'', opening_hours:'', notes:'' }

const PRIORITY_COLOR = { P1:'#E24B4A', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }
const STATUS_COLOR = {
  open:        { bg:'#FBE9E7', text:'#BF360C', label:'Open' },
  in_progress: { bg:'#FFF3E0', text:'#E65100', label:'In Progress' },
  on_hold:     { bg:'#ECEFF1', text:'#455A64', label:'On Hold' },
  closed:      { bg:'#E8F5E9', text:'#1B5E20', label:'Closed' },
}
const ASSET_STATUS_COLOR = {
  operational: { bg:'#E8F5E9', text:'#1B5E20' },
  maintenance: { bg:'#FFF3E0', text:'#E65100' },
  inactive:    { bg:'#ECEFF1', text:'#455A64' },
  retired:     { bg:'#FBE9E7', text:'#BF360C' },
}
const CAT_ICON = {
  'Kitchen Equipment':'🍳', 'Office Equipment':'🖥️', 'Furniture & Fittings':'🪑',
  'Operational Equipment':'⚙️', 'Vehicles':'🚐', 'HVAC':'❄️', 'Electrical':'⚡', 'Plumbing':'🔧',
}
const AED = (n) => `AED ${Number(n||0).toLocaleString(undefined,{minimumFractionDigits:0, maximumFractionDigits:2})}`

export default function Stores() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const isAdmin     = profile?.role === 'admin'

  const [stores,   setStores]   = useState([])
  const [woCounts, setWoCounts] = useState({})
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing,  setEditing]  = useState(null)
  const [form,     setForm]     = useState(EMPTY)
  const [saving,   setSaving]   = useState(false)
  const [msg,      setMsg]      = useState({ text:'', type:'' })
  const [confirmDel, setConfirmDel] = useState(null)
  const [view,     setView]     = useState('grid')

  const [detailStore,   setDetailStore]   = useState(null)
  const [detailTab,     setDetailTab]     = useState('assets')
  const [detailAssets,  setDetailAssets]  = useState([])
  const [detailWOs,     setDetailWOs]     = useState([])
  const [detailLoading, setDetailLoading] = useState(false)

  const [assetSearch,  setAssetSearch]  = useState('')
  const [assetCat,     setAssetCat]     = useState('all')
  const [assetStatus,  setAssetStatus]  = useState('all')
  const [collapsed,    setCollapsed]    = useState({})

  const [selectedAsset,  setSelectedAsset]  = useState(null)
  const [assetWOs,       setAssetWOs]       = useState([])
  const [assetWOLoading, setAssetWOLoading] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const [storeRes, woRes] = await Promise.all([
      supabase.from('stores').select('*').order('name'),
      supabase.from('work_orders').select('store_id, status').neq('status','closed'),
    ])
    setStores(storeRes.data || [])
    const counts = {}
    ;(woRes.data || []).forEach(wo => { counts[wo.store_id] = (counts[wo.store_id] || 0) + 1 })
    setWoCounts(counts)
    setLoading(false)
  }

  async function openDetail(store) {
    setDetailStore(store)
    setDetailTab('assets')
    setDetailAssets([]); setDetailWOs([])
    setSelectedAsset(null)
    setAssetSearch(''); setAssetCat('all'); setAssetStatus('all'); setCollapsed({})
    setDetailLoading(true)

    const [assetRes, woRes] = await Promise.all([
      supabase.from('assets')
        .select('id, name, category, subcategory, location, serial_number, status, brand, model, purchase_date, notes')
        .eq('store_id', store.id)
        .order('name'),
      supabase.from('work_orders')
        .select('id, title, priority, status, asset_id, created_at, closed_at')
        .eq('store_id', store.id)
        .order('created_at', { ascending:false }),
    ])
    if (assetRes.error && Object.keys(assetRes.error).length) console.error('Asset load error:', assetRes.error)
    if (woRes.error && Object.keys(woRes.error).length) console.error('WO load error:', woRes.error)
    setDetailAssets(assetRes.data || [])
    setDetailWOs(woRes.data || [])
    setDetailLoading(false)
  }

  function closeDetail() {
    setDetailStore(null); setDetailAssets([]); setDetailWOs([]); setSelectedAsset(null)
  }

  async function openAsset(asset) {
    setSelectedAsset(asset)
    setAssetWOs([])
    setAssetWOLoading(true)
    const { data, error } = await supabase.from('work_orders')
      .select('id, title, priority, status, category, vendor_name, cost, work_update, created_at, completed_at, closed_at, signature_url, photos')
      .eq('asset_id', asset.id)
      .order('created_at', { ascending:false })
    if (error && Object.keys(error).length) console.error('Asset WO load error:', error)
    setAssetWOs(data || [])
    setAssetWOLoading(false)
  }

  const flashTimer = useRef(null)
  function flash(text, type='success') {
    if (flashTimer.current) clearTimeout(flashTimer.current)
    setMsg({ text, type })
    flashTimer.current = setTimeout(() => setMsg({ text:'', type:'' }), 4000)
  }

  function openNew() { setEditing(null); setForm(EMPTY); setShowForm(true) }
  function openEdit(store) { setEditing(store); setForm({ ...EMPTY, ...store }); setShowForm(true) }

  async function save() {
    if (!form.name.trim()) return flash('Store name is required', 'error')
    setSaving(true)
    const payload = { ...form }
    if (!payload.latitude) delete payload.latitude
    if (!payload.longitude) delete payload.longitude
    const { error } = editing
      ? await supabase.from('stores').update(payload).eq('id', editing.id)
      : await supabase.from('stores').insert(payload)
    if (error) flash('❌ ' + error.message, 'error')
    else { flash(editing ? '✅ Store updated' : '✅ Store added'); setShowForm(false); loadAll() }
    setSaving(false)
  }

  async function deleteStore(store) {
    setSaving(true)
    const { error } = await supabase.from('stores').delete().eq('id', store.id)
    if (error) flash('❌ ' + error.message, 'error')
    else flash(`✅ "${store.name}" deleted`)
    setConfirmDel(null); loadAll(); setSaving(false)
  }

  const filtered = stores.filter(s =>
    s.name?.toLowerCase().includes(search.toLowerCase()) ||
    s.city?.toLowerCase().includes(search.toLowerCase()) ||
    s.manager_name?.toLowerCase().includes(search.toLowerCase())
  )

  const assetCategories = [...new Set(detailAssets.map(a => a.category).filter(Boolean))].sort()
  const filteredAssets = detailAssets.filter(a => {
    if (assetCat !== 'all' && a.category !== assetCat) return false
    if (assetStatus !== 'all' && (a.status || 'operational') !== assetStatus) return false
    if (assetSearch) {
      const q = assetSearch.toLowerCase()
      const hay = [a.name, a.brand, a.model, a.serial_number, a.subcategory, a.location].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  const grouped = {}
  filteredAssets.forEach(a => {
    const cat = a.category || 'Uncategorized'
    const sub = a.subcategory || '—'
    if (!grouped[cat]) grouped[cat] = {}
    if (!grouped[cat][sub]) grouped[cat][sub] = []
    grouped[cat][sub].push(a)
  })

  const breakdownCount  = assetWOs.length
  const totalRepairCost = assetWOs.reduce((sum, wo) => sum + Number(wo.cost || 0), 0)

  function renderDrawerBody() {
    if (selectedAsset) {
      const sc = ASSET_STATUS_COLOR[selectedAsset.status] || ASSET_STATUS_COLOR.operational
      return (
        <div>
          <button onClick={() => setSelectedAsset(null)} style={{ background:'none', border:'none', color:'var(--green)', fontSize:13, fontWeight:600, cursor:'pointer', padding:0, marginBottom:16 }}>← Back to assets</button>

          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:18 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
              <div>
                <div style={{ fontSize:18, fontWeight:700 }}>{selectedAsset.name}</div>
                <div style={{ fontSize:12, color:'var(--text3)', marginTop:3 }}>
                  {[CAT_ICON[selectedAsset.category], selectedAsset.category, selectedAsset.subcategory].filter(Boolean).join(' · ')}
                </div>
              </div>
              <span style={{ background:sc.bg, color:sc.text, borderRadius:20, padding:'3px 12px', fontSize:11, fontWeight:700, textTransform:'capitalize', flexShrink:0 }}>{selectedAsset.status || 'operational'}</span>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:16 }}>
              <Spec label="Brand"         value={selectedAsset.brand}/>
              <Spec label="Model"         value={selectedAsset.model}/>
              <Spec label="Serial No."    value={selectedAsset.serial_number}/>
              <Spec label="Location"      value={selectedAsset.location}/>
              <Spec label="Purchase Date" value={selectedAsset.purchase_date ? new Date(selectedAsset.purchase_date).toLocaleDateString() : null}/>
              <Spec label="Category"      value={selectedAsset.category}/>
            </div>
            {selectedAsset.notes && (
              <div style={{ marginTop:12, fontSize:13, color:'var(--text2)', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 12px' }}>📝 {selectedAsset.notes}</div>
            )}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:14 }}>
            <StatCard label="No. of Breakdowns" value={breakdownCount} accent="#E24B4A"/>
            <StatCard label="Total Repair Cost" value={AED(totalRepairCost)} accent="#1D9E75"/>
          </div>

          <button onClick={() => { const sid = detailStore.id, aid = selectedAsset.id; closeDetail(); navigate(`/work-orders?store=${sid}&asset=${aid}`) }}
            style={{ width:'100%', marginTop:14, padding:'10px', background:'var(--green)11', color:'var(--green)', border:'1px solid var(--green)44', borderRadius:9, fontSize:13, fontWeight:600, cursor:'pointer' }}>
            + Open New Ticket for this Asset
          </button>

          <h4 style={{ margin:'22px 0 12px', fontSize:14, fontWeight:700 }}>Service History / Reports</h4>
          {assetWOLoading ? (
            <div style={{ textAlign:'center', padding:30, color:'var(--text3)' }}>Loading service history…</div>
          ) : assetWOs.length === 0 ? (
            <Empty>No service reports yet — this asset has had no work orders.</Empty>
          ) : (
            <div style={{ display:'grid', gap:10 }}>
              {assetWOs.map(wo => {
                const st = STATUS_COLOR[wo.status] || STATUS_COLOR.open
                return (
                  <div key={wo.id} onClick={() => { closeDetail(); navigate(`/work-orders/${wo.id}`) }}
                    style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', cursor:'pointer' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                        <span style={{ width:8, height:8, borderRadius:'50%', background:PRIORITY_COLOR[wo.priority]||'#888', flexShrink:0 }}/>
                        <span style={{ fontWeight:600, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{wo.title}</span>
                      </div>
                      <span style={{ background:st.bg, color:st.text, borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:700, flexShrink:0 }}>{st.label}</span>
                    </div>
                    {wo.work_update && (
                      <div style={{ fontSize:12, color:'var(--text2)', marginTop:6, lineHeight:1.5 }}>{wo.work_update}</div>
                    )}
                    <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginTop:8, fontSize:12, color:'var(--text3)' }}>
                      {wo.vendor_name && <span>🏢 {wo.vendor_name}</span>}
                      {wo.category && <span>🏷️ {wo.category}</span>}
                      {Number(wo.cost) > 0 && <span style={{ color:'#1D9E75', fontWeight:700 }}>💰 {AED(wo.cost)}</span>}
                      {wo.created_at && <span>📅 {new Date(wo.created_at).toLocaleDateString()}</span>}
                      {wo.completed_at && <span>✅ {new Date(wo.completed_at).toLocaleDateString()}</span>}
                      {wo.signature_url && <span>✍️ Signed</span>}
                      {Array.isArray(wo.photos) && wo.photos.length > 0 && <span>📷 {wo.photos.length}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )
    }

    if (detailLoading) {
      return <div style={{ textAlign:'center', padding:40, color:'var(--text3)' }}>Loading…</div>
    }

    if (detailTab === 'assets') {
      return (
        <div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginBottom:16 }}>
            <input value={assetSearch} onChange={e => setAssetSearch(e.target.value)} placeholder="Search assets, brand, serial…"
              style={{ flex:1, minWidth:180, padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)', fontSize:13, boxSizing:'border-box' }}/>
            <select value={assetCat} onChange={e => setAssetCat(e.target.value)}
              style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)', fontSize:13, cursor:'pointer' }}>
              <option value="all">All categories</option>
              {assetCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={assetStatus} onChange={e => setAssetStatus(e.target.value)}
              style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)', fontSize:13, cursor:'pointer' }}>
              <option value="all">All status</option>
              <option value="operational">Operational</option>
              <option value="maintenance">Maintenance</option>
              <option value="inactive">Inactive</option>
              <option value="retired">Retired</option>
            </select>
          </div>

          <div style={{ fontSize:12, color:'var(--text3)', marginBottom:12 }}>
            Showing {filteredAssets.length} of {detailAssets.length} assets
          </div>

          {filteredAssets.length === 0 ? (
            <Empty>No assets match your filters.</Empty>
          ) : (
            Object.keys(grouped).sort().map(cat => {
              const subs = grouped[cat]
              const catCount = Object.values(subs).reduce((n, arr) => n + arr.length, 0)
              const isCollapsed = collapsed[cat]
              return (
                <div key={cat} style={{ marginBottom:16 }}>
                  <div onClick={() => setCollapsed(c => ({ ...c, [cat]: !c[cat] }))}
                    style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, cursor:'pointer', userSelect:'none' }}>
                    <span style={{ fontSize:16 }}>{CAT_ICON[cat] || '📦'}</span>
                    <span style={{ fontWeight:700, fontSize:14 }}>{cat}</span>
                    <span style={{ background:'var(--green)11', color:'var(--green)', borderRadius:20, padding:'1px 9px', fontSize:11, fontWeight:700 }}>{catCount}</span>
                    <span style={{ marginLeft:'auto', color:'var(--text3)', fontSize:13 }}>{isCollapsed ? '▸' : '▾'}</span>
                  </div>

                  {!isCollapsed && Object.keys(subs).sort().map(sub => (
                    <div key={sub} style={{ marginTop:8 }}>
                      {sub !== '—' && (
                        <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', letterSpacing:'0.04em', textTransform:'uppercase', margin:'8px 0 6px 4px' }}>{sub}</div>
                      )}
                      <div style={{ display:'grid', gap:8 }}>
                        {subs[sub].map(a => {
                          const sc = ASSET_STATUS_COLOR[a.status] || ASSET_STATUS_COLOR.operational
                          return (
                            <div key={a.id} onClick={() => openAsset(a)}
                              style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'11px 14px', cursor:'pointer' }}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                                <div style={{ fontWeight:600, fontSize:13.5 }}>{a.name}</div>
                                <span style={{ background:sc.bg, color:sc.text, borderRadius:20, padding:'2px 10px', fontSize:10.5, fontWeight:700, flexShrink:0, textTransform:'capitalize' }}>{a.status || 'operational'}</span>
                              </div>
                              <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginTop:5, fontSize:11.5, color:'var(--text3)' }}>
                                {a.brand && <span>🏭 {a.brand}</span>}
                                {a.model && <span>📋 {a.model}</span>}
                                {a.serial_number && <span>#️⃣ {a.serial_number}</span>}
                                {a.location && <span>📌 {a.location}</span>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })
          )}
        </div>
      )
    }

    // Work orders tab
    return (
      detailWOs.length === 0 ? (
        <Empty>No work orders for this store yet.</Empty>
      ) : (
        <div style={{ display:'grid', gap:10 }}>
          {detailWOs.map(wo => {
            const st = STATUS_COLOR[wo.status] || STATUS_COLOR.open
            const asset = detailAssets.find(a => a.id === wo.asset_id)
            return (
              <div key={wo.id} onClick={() => { closeDetail(); navigate(`/work-orders/${wo.id}`) }}
                style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', cursor:'pointer' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', background:PRIORITY_COLOR[wo.priority]||'#888', flexShrink:0 }}/>
                    <span style={{ fontWeight:600, fontSize:14, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{wo.title}</span>
                  </div>
                  <span style={{ background:st.bg, color:st.text, borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:700, flexShrink:0 }}>{st.label}</span>
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginTop:6, fontSize:12, color:'var(--text3)' }}>
                  <span style={{ color:PRIORITY_COLOR[wo.priority], fontWeight:700 }}>{wo.priority}</span>
                  {asset && <span>🔧 {asset.name}</span>}
                  {wo.created_at && <span>📅 {new Date(wo.created_at).toLocaleDateString()}</span>}
                  {wo.closed_at && <span>✅ {new Date(wo.closed_at).toLocaleDateString()}</span>}
                </div>
              </div>
            )
          })}
        </div>
      )
    )
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'50vh', color:'var(--text3)' }}>
      Loading stores…
    </div>
  )

  return (
    <div style={{ color:'var(--text)' }}>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24, flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ margin:0, fontSize:22, fontWeight:700 }}>Stores</h2>
          <p style={{ margin:'4px 0 0', color:'var(--text3)', fontSize:13 }}>
            {stores.length} branches · {Object.keys(woCounts).length} with open work orders
          </p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <div style={{ display:'flex', border:'1px solid var(--border)', borderRadius:8, overflow:'hidden' }}>
            {['grid','list'].map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding:'7px 14px', border:'none', cursor:'pointer', fontSize:12, fontWeight:600,
                background: view===v ? 'var(--green)' : 'var(--surface)',
                color: view===v ? 'white' : 'var(--text3)',
              }}>{v==='grid'?'⊞ Grid':'≡ List'}</button>
            ))}
          </div>
          {isAdmin && (
            <button onClick={openNew} style={{ background:'var(--green)', color:'white', border:'none', borderRadius:10, padding:'10px 20px', fontSize:14, cursor:'pointer', fontWeight:600 }}>+ Add Store</button>
          )}
        </div>
      </div>

      <div style={{ marginBottom:20 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, city, manager…"
          style={{ width:'100%', maxWidth:360, padding:'10px 14px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)', fontSize:14, boxSizing:'border-box' }}/>
      </div>

      {msg.text && (
        <div style={{ padding:'12px 16px', borderRadius:10, marginBottom:16, fontSize:13,
          background: msg.type==='error' ? '#FBE9E7' : '#E8F5E9',
          color: msg.type==='error' ? '#BF360C' : '#1B5E20',
          border: `1px solid ${msg.type==='error'?'#E24B4A':'#1D9E75'}` }}>{msg.text}</div>
      )}

      {view === 'grid' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
          {filtered.map(s => {
            const openWOs = woCounts[s.id] || 0
            return (
              <div key={s.id} style={{ background:'var(--surface)', borderRadius:14, border: `1px solid ${openWOs > 0 ? '#EF9F2766' : 'var(--border)'}`, padding:20, display:'flex', flexDirection:'column', gap:10, transition:'box-shadow 0.15s', cursor:'pointer' }}
                onClick={() => openDetail(s)}
                onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,.1)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow='none'}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:15, marginBottom:2 }}>{s.name}</div>
                    {s.city && <div style={{ fontSize:12, color:'var(--text3)' }}>📍 {s.city}</div>}
                  </div>
                  {openWOs > 0 && (
                    <span style={{ background:'#EF9F2722', color:'#EF9F27', border:'1px solid #EF9F27', borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:700, flexShrink:0 }}>🔧 {openWOs} WO{openWOs>1?'s':''}</span>
                  )}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  {s.address && <div style={{ fontSize:12, color:'var(--text2)' }}>🏠 {s.address}</div>}
                  {s.manager_name && <div style={{ fontSize:12, color:'var(--text2)' }}>👤 {s.manager_name}</div>}
                  {s.phone && <div style={{ fontSize:12, color:'var(--text2)' }}>📞 {s.phone}</div>}
                  {s.opening_hours && <div style={{ fontSize:12, color:'var(--text2)' }}>🕐 {s.opening_hours}</div>}
                  {s.latitude && <div style={{ fontSize:11, color:'var(--text3)' }}>🗺️ {parseFloat(s.latitude).toFixed(4)}, {parseFloat(s.longitude).toFixed(4)}</div>}
                </div>
                <div style={{ display:'flex', gap:8, marginTop:'auto', paddingTop:8, borderTop:'1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => openDetail(s)} style={{ flex:1, padding:'7px', background:'var(--green)11', color:'var(--green)', border:'1px solid var(--green)44', borderRadius:8, fontSize:12, cursor:'pointer', fontWeight:600 }}>View Details</button>
                  {isAdmin && <>
                    <button onClick={() => openEdit(s)} style={{ padding:'7px 14px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, fontSize:12, cursor:'pointer', color:'var(--text)' }}>✏️</button>
                    <button onClick={() => setConfirmDel(s)} style={{ padding:'7px 14px', background:'#FBE9E7', border:'1px solid #E24B4A', borderRadius:8, fontSize:12, cursor:'pointer', color:'#E24B4A' }}>🗑️</button>
                  </>}
                  {s.latitude && (
                    <a href={`https://maps.google.com/?q=${s.latitude},${s.longitude}`} target="_blank" rel="noreferrer" style={{ padding:'7px 10px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, fontSize:12, textDecoration:'none', color:'var(--text)' }}>🗺️</a>
                  )}
                </div>
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div style={{ gridColumn:'1/-1', textAlign:'center', padding:40, color:'var(--text3)' }}>No stores found matching "{search}"</div>
          )}
        </div>
      )}

      {view === 'list' && (
        <div style={{ display:'grid', gap:8 }}>
          {filtered.map(s => {
            const openWOs = woCounts[s.id] || 0
            return (
              <div key={s.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 18px', background:'var(--surface)', borderRadius:12, border:`1px solid ${openWOs>0?'#EF9F2744':'var(--border)'}`, flexWrap:'wrap', cursor:'pointer' }}
                onClick={() => openDetail(s)}>
                <div style={{ flex:1, minWidth:200 }}>
                  <div style={{ fontWeight:600, fontSize:14 }}>{s.name}</div>
                  <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>
                    {[s.city, s.manager_name&&`👤 ${s.manager_name}`, s.phone&&`📞 ${s.phone}`].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {openWOs > 0 && (
                  <span style={{ background:'#EF9F2722', color:'#EF9F27', border:'1px solid #EF9F27', borderRadius:20, padding:'3px 12px', fontSize:12, fontWeight:700 }}>🔧 {openWOs} open</span>
                )}
                {s.latitude && (
                  <span style={{ fontSize:11, color:'var(--text3)' }}>📍 {parseFloat(s.latitude).toFixed(4)}, {parseFloat(s.longitude).toFixed(4)}</span>
                )}
                <div style={{ display:'flex', gap:6, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => openDetail(s)} style={{ padding:'6px 12px', background:'var(--green)11', color:'var(--green)', border:'1px solid var(--green)44', borderRadius:8, fontSize:12, cursor:'pointer', fontWeight:600 }}>Details</button>
                  {isAdmin && <>
                    <button onClick={() => openEdit(s)} style={{ padding:'6px 12px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, fontSize:12, cursor:'pointer', color:'var(--text)' }}>✏️ Edit</button>
                    <button onClick={() => setConfirmDel(s)} style={{ padding:'6px 12px', background:'#FBE9E7', border:'1px solid #E24B4A', borderRadius:8, fontSize:12, cursor:'pointer', color:'#E24B4A' }}>🗑️</button>
                  </>}
                  {s.latitude && (
                    <a href={`https://maps.google.com/?q=${s.latitude},${s.longitude}`} target="_blank" rel="noreferrer" style={{ padding:'6px 10px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, fontSize:12, textDecoration:'none', color:'var(--text)' }}>🗺️</a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {detailStore && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1100, display:'flex', justifyContent:'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) closeDetail() }}>
          <div style={{ width:'100%', maxWidth:680, height:'100vh', background:'var(--bg)', boxShadow:'-8px 0 40px rgba(0,0,0,.3)', overflowY:'auto', display:'flex', flexDirection:'column' }}>

            <div style={{ padding:'24px 28px', borderBottom:'1px solid var(--border)', background:'var(--surface)', position:'sticky', top:0, zIndex:2 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
                <div>
                  <h2 style={{ margin:0, fontSize:20, fontWeight:700 }}>{detailStore.name}</h2>
                  {detailStore.city && <div style={{ fontSize:13, color:'var(--text3)', marginTop:4 }}>📍 {detailStore.city}</div>}
                </div>
                <button onClick={closeDetail} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, width:34, height:34, fontSize:18, cursor:'pointer', color:'var(--text)', lineHeight:1 }}>✕</button>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:14 }}>
                {detailStore.address && <Chip>🏠 {detailStore.address}</Chip>}
                {detailStore.manager_name && <Chip>👤 {detailStore.manager_name}</Chip>}
                {detailStore.phone && <Chip>📞 {detailStore.phone}</Chip>}
                {detailStore.email && <Chip>✉️ {detailStore.email}</Chip>}
                {detailStore.opening_hours && <Chip>🕐 {detailStore.opening_hours}</Chip>}
                {detailStore.latitude && (
                  <a href={`https://maps.google.com/?q=${detailStore.latitude},${detailStore.longitude}`} target="_blank" rel="noreferrer" style={{ textDecoration:'none' }}><Chip>🗺️ Open in Maps</Chip></a>
                )}
              </div>

              {!selectedAsset && (
                <div style={{ display:'flex', gap:8, marginTop:18 }}>
                  {[
                    { key:'assets',     label:`Assets (${detailAssets.length})` },
                    { key:'workorders', label:`Work Orders (${detailWOs.length})` },
                  ].map(t => (
                    <button key={t.key} onClick={() => setDetailTab(t.key)} style={{
                      padding:'8px 16px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer',
                      border: `1px solid ${detailTab===t.key ? 'var(--green)' : 'var(--border)'}`,
                      background: detailTab===t.key ? 'var(--green)' : 'var(--surface)',
                      color: detailTab===t.key ? 'white' : 'var(--text2)',
                    }}>{t.label}</button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ padding:'20px 28px', flex:1 }}>
              {renderDrawerBody()}
            </div>

            {!selectedAsset && (
              <div style={{ padding:'16px 28px', borderTop:'1px solid var(--border)', background:'var(--surface)', display:'flex', gap:10, position:'sticky', bottom:0 }}>
                <button onClick={() => { closeDetail(); navigate(`/work-orders?store=${detailStore.id}`) }}
                  style={{ flex:1, padding:'10px', background:'var(--green)', color:'white', border:'none', borderRadius:9, fontSize:14, fontWeight:600, cursor:'pointer' }}>
                  View All Work Orders
                </button>
                {isAdmin && (
                  <button onClick={() => { const st = detailStore; closeDetail(); openEdit(st) }}
                    style={{ padding:'10px 18px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:9, fontSize:14, cursor:'pointer', color:'var(--text)' }}>✏️ Edit Store</button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => { if(e.target===e.currentTarget) setShowForm(false) }}>
          <div style={{ background:'var(--surface)', borderRadius:16, padding:28, width:'100%', maxWidth:600, boxShadow:'0 8px 40px rgba(0,0,0,.3)', maxHeight:'90vh', overflowY:'auto' }}>
            <h3 style={{ margin:'0 0 20px', fontSize:18, fontWeight:700 }}>{editing ? `Edit: ${editing.name}` : '+ Add New Store'}</h3>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              {FIELDS.map(f => (
                <div key={f.key} style={{ gridColumn: f.col===2 ? '1/-1' : 'auto' }}>
                  <div style={{ fontSize:11, color:'var(--text3)', marginBottom:5, fontWeight:700, letterSpacing:'0.05em' }}>{f.label.toUpperCase()}</div>
                  <input type={f.type} value={form[f.key]||''} onChange={e=>setForm({...form,[f.key]:e.target.value})}
                    style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text)', fontSize:14, boxSizing:'border-box' }}/>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:10, marginTop:22, justifyContent:'flex-end' }}>
              <button onClick={()=>setShowForm(false)} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:9, padding:'10px 20px', fontSize:14, cursor:'pointer', color:'var(--text)' }}>Cancel</button>
              <button onClick={save} disabled={saving||!form.name} style={{ background:'var(--green)', color:'white', border:'none', borderRadius:9, padding:'10px 24px', fontSize:14, cursor:'pointer', fontWeight:600, opacity:saving||!form.name?0.6:1 }}>
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Store'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'var(--surface)', borderRadius:16, padding:28, width:'100%', maxWidth:380, textAlign:'center', boxShadow:'0 8px 40px rgba(0,0,0,.3)' }}>
            <div style={{ fontSize:48, marginBottom:12 }}>⚠️</div>
            <h3 style={{ margin:'0 0 8px', fontSize:18 }}>Delete Store?</h3>
            <p style={{ color:'var(--text3)', fontSize:14, margin:'0 0 8px' }}><b>{confirmDel.name}</b></p>
            <p style={{ color:'#E24B4A', fontSize:12, margin:'0 0 20px' }}>This will also delete all work orders for this store!</p>
            <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
              <button onClick={()=>setConfirmDel(null)} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:9, padding:'10px 24px', fontSize:14, cursor:'pointer', color:'var(--text)' }}>Cancel</button>
              <button onClick={()=>deleteStore(confirmDel)} disabled={saving} style={{ background:'#E24B4A', color:'white', border:'none', borderRadius:9, padding:'10px 24px', fontSize:14, cursor:'pointer', fontWeight:600, opacity:saving?0.6:1 }}>
                {saving?'Deleting…':'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({ children }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:20, padding:'4px 12px', fontSize:12, color:'var(--text2)' }}>{children}</span>
  )
}
function Empty({ children }) {
  return <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--text3)', fontSize:14 }}>{children}</div>
}
function Spec({ label, value }) {
  return (
    <div>
      <div style={{ fontSize:10.5, fontWeight:700, color:'var(--text3)', letterSpacing:'0.05em', textTransform:'uppercase', marginBottom:3 }}>{label}</div>
      <div style={{ fontSize:13.5, color: value ? 'var(--text)' : 'var(--text3)' }}>{value || '—'}</div>
    </div>
  )
}
function StatCard({ label, value, accent }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px' }}>
      <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', letterSpacing:'0.04em', textTransform:'uppercase' }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:700, color:accent, marginTop:4 }}>{value}</div>
    </div>
  )
}
