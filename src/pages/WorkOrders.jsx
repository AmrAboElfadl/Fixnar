import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import SLABadge from '../components/SLABadge'
import { useSearchParams, useNavigate } from 'react-router-dom'

const STATUSES = ['open','travelling','arrived','in_progress','on_hold','completed','closed']
const P_COLORS = { P1:'#E24B4A', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }
const STATUS_LABELS = {
  open:'Open', travelling:'On the Way', arrived:'Arrived',
  in_progress:'In Progress', on_hold:'On Hold', completed:'Completed', closed:'Closed'
}
const PRIORITY_COLORS = {
  P1:{ bg:'#fdeaea', text:'#E24B4A' },
  P2:{ bg:'#FFF3E0', text:'#EF9F27' },
  P3:{ bg:'#E3F2FD', text:'#378ADD' },
  P4:{ bg:'#E8F5E9', text:'#1D9E75' },
}

// ── CATEGORIES (embedded) ──
const CATEGORIES = {
  'HVAC': { icon:'❄️', subcategories: {
    'Air Conditioning': { faults:[{name:'Not Cooling',priority:'P2'},{name:'Water Leaking',priority:'P2'},{name:'Strange Noise',priority:'P3'},{name:'Unit Not Starting',priority:'P1'},{name:'Filter Clogged',priority:'P3'},{name:'Remote Not Working',priority:'P4'}]},
    'Exhaust System':   { faults:[{name:'Fan Not Working',priority:'P1'},{name:'Excessive Noise',priority:'P2'},{name:'Weak Airflow',priority:'P2'},{name:'Motor Fault',priority:'P1'},{name:'Belt Broken',priority:'P2'}]},
    'Ventilation':      { faults:[{name:'Duct Blocked',priority:'P2'},{name:'Damper Stuck',priority:'P3'},{name:'Grille Damaged',priority:'P4'}]},
  }},
  'Plumbing': { icon:'🔧', subcategories: {
    'Drainage':     { faults:[{name:'Drain Blocked',priority:'P1'},{name:'Slow Drainage',priority:'P2'},{name:'Bad Odor',priority:'P2'},{name:'Grease Trap Full',priority:'P1'},{name:'Overflow',priority:'P1'}]},
    'Water Supply': { faults:[{name:'No Water',priority:'P1'},{name:'Low Pressure',priority:'P2'},{name:'Pipe Leaking',priority:'P1'},{name:'Tap Dripping',priority:'P4'}]},
    'Grease Trap':  { faults:[{name:'Needs Cleaning',priority:'P2'},{name:'Overflow',priority:'P1'},{name:'Bad Odor',priority:'P2'}]},
  }},
  'Electrical': { icon:'⚡', subcategories: {
    'Lighting':   { faults:[{name:'Light Not Working',priority:'P3'},{name:'Flickering',priority:'P3'},{name:'Bulb Replacement',priority:'P4'},{name:'Emergency Light Fault',priority:'P1'}]},
    'Power':      { faults:[{name:'No Power',priority:'P1'},{name:'Tripping Breaker',priority:'P1'},{name:'Socket Not Working',priority:'P3'},{name:'Voltage Fluctuation',priority:'P2'}]},
    'Generator':  { faults:[{name:'Not Starting',priority:'P1'},{name:'Low Fuel',priority:'P2'},{name:'Overheating',priority:'P1'},{name:'Service Due',priority:'P3'}]},
  }},
  'Kitchen Equipment': { icon:'🍳', subcategories: {
    'Cooking Equipment': { faults:[{name:'Not Heating',priority:'P1'},{name:'Gas Leak',priority:'P1'},{name:'Temperature Issue',priority:'P2'},{name:'Ignition Fault',priority:'P2'}]},
    'Refrigeration':     { faults:[{name:'Not Cooling',priority:'P1'},{name:'Temperature High',priority:'P1'},{name:'Door Seal Broken',priority:'P3'},{name:'Ice Build Up',priority:'P2'},{name:'Compressor Noise',priority:'P2'}]},
    'Dishwasher':        { faults:[{name:'Not Starting',priority:'P2'},{name:'Not Draining',priority:'P2'},{name:'Water Leaking',priority:'P1'},{name:'Poor Cleaning',priority:'P3'}]},
  }},
  'Fire & Safety': { icon:'🔥', subcategories: {
    'Fire Suppression': { faults:[{name:'System Fault',priority:'P1'},{name:'Nozzle Blocked',priority:'P1'},{name:'Pressure Low',priority:'P1'},{name:'Service Due',priority:'P2'}]},
    'Fire Alarm':       { faults:[{name:'False Alarm',priority:'P2'},{name:'Detector Fault',priority:'P1'},{name:'Panel Error',priority:'P1'},{name:'Battery Low',priority:'P2'}]},
    'Emergency Exit':   { faults:[{name:'Door Blocked',priority:'P1'},{name:'Sign Not Lit',priority:'P2'},{name:'Lock Fault',priority:'P1'}]},
  }},
  'Civil & Structure': { icon:'🏗️', subcategories: {
    'Flooring':        { faults:[{name:'Tile Broken',priority:'P3'},{name:'Floor Slippery',priority:'P2'},{name:'Water Seepage',priority:'P2'}]},
    'Walls & Ceiling': { faults:[{name:'Paint Peeling',priority:'P4'},{name:'Crack in Wall',priority:'P3'},{name:'Ceiling Damaged',priority:'P2'},{name:'Water Stain',priority:'P3'}]},
    'Doors & Windows': { faults:[{name:'Door Not Closing',priority:'P3'},{name:'Lock Broken',priority:'P2'},{name:'Glass Cracked',priority:'P3'},{name:'Hinge Broken',priority:'P3'}]},
  }},
  'Pest Control': { icon:'🐛', subcategories: {
    'Infestation': { faults:[{name:'Cockroach Sighting',priority:'P1'},{name:'Rodent Activity',priority:'P1'},{name:'Fly Infestation',priority:'P2'},{name:'Ant Infestation',priority:'P3'}]},
    'Preventive':  { faults:[{name:'Scheduled Treatment',priority:'P3'},{name:'Bait Station Check',priority:'P4'}]},
  }},
  'LPG & Gas': { icon:'⛽', subcategories: {
    'Gas System': { faults:[{name:'Gas Leak',priority:'P1'},{name:'Low Pressure',priority:'P1'},{name:'Valve Fault',priority:'P1'},{name:'Meter Issue',priority:'P2'},{name:'Service Due',priority:'P3'}]},
  }},
}

function getCity(storeName) {
  if (!storeName) return ''
  const name = storeName.toLowerCase()
  if (name.includes('abu dhabi') || name.includes('auh') || name.includes('raha') || name.includes('reem') || name.includes('shmkha') || name.includes('adnoc')) return 'Abu Dhabi'
  if (name.includes('al ain') || name.includes('jimi') || name.includes('hili')) return 'Al Ain'
  return 'Dubai'
}

function getSLADeadline(priority, createdAt) {
  const SLA_HOURS = { P1:4, P2:8, P3:12, P4:63 }
  const hours = SLA_HOURS[priority] || 8
  const WORK_START = 9, WORK_END = 18
  let cursor = new Date(createdAt)
  let remaining = hours * 60
  while (remaining > 0) {
    const h = cursor.getHours()
    if (h < WORK_START) { cursor.setHours(WORK_START,0,0,0) }
    else if (h >= WORK_END) { cursor.setDate(cursor.getDate()+1); cursor.setHours(WORK_START,0,0,0) }
    const dayEnd = new Date(cursor); dayEnd.setHours(WORK_END,0,0,0)
    const minLeft = Math.min(remaining, (dayEnd - cursor) / 60000)
    cursor = new Date(cursor.getTime() + minLeft * 60000)
    remaining -= minLeft
  }
  return cursor
}

function getTimeToExpire(priority, createdAt, status) {
  if (['closed','completed'].includes(status)) return 'Completed'
  const deadline = getSLADeadline(priority, createdAt)
  const now = new Date()
  const diff = deadline - now
  if (diff <= 0) return 'BREACHED'
  const hrs = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  if (hrs >= 24) return Math.floor(hrs/24) + ' day(s) left'
  return hrs + 'h ' + mins + 'm left'
}

function parseTitleParts(title) {
  if (!title) return { category:'', subcategory:'', fault:'' }
  const parts = title.split(' - ').join('—').split('—').map(p => p.trim())
  return {
    category:    parts[0] || '',
    subcategory: parts[1] || '',
    fault:       parts[2] || '',
  }
}

function exportToExcel(data) {
  const headers = [
    'WO No.',
    'Brand',
    'Store Name',
    'Priority',
    'Work Order Status',
    'Category',
    'Sub Category',
    'Fault',
    'SLA (hours)',
    'City',
    'Work Description',
    'Assigned To',
    'Time to Expire',
    'Created Date',
  ]

  const SLA_MAP = { P1:'4 hours', P2:'8 hours', P3:'12 hours', P4:'7 days' }
  const BRAND_MAP = {
    'JJ Chicken': 'JJ Chicken',
    'JJ Derawandi': 'JJ Derawandi',
    'JV ': 'Juan Valdez',
    'Solidare': 'Solidare',
    'Derwandi': 'JJ Derawandi',
  }

  function getBrand(storeName) {
    if (!storeName) return ''
    for (const [key, val] of Object.entries(BRAND_MAP)) {
      if (storeName.includes(key)) return val
    }
    return storeName.split(' ')[0]
  }

  const rows = data.map((wo, i) => {
    const parts = parseTitleParts(wo.title)
    const storeName = wo.stores?.name || ''
    return [
      String(i + 1).padStart(4, '0'),
      getBrand(storeName),
      storeName,
      wo.priority || '',
      (wo.status || '').replace(/_/g,' ').replace(/\w/g, c => c.toUpperCase()),
      parts.category,
      parts.subcategory,
      parts.fault,
      SLA_MAP[wo.priority] || '',
      getCity(storeName),
      wo.description || parts.fault,
      wo.tech_name || 'Unassigned',
      getTimeToExpire(wo.priority, wo.created_at, wo.status),
      wo.created_at ? new Date(wo.created_at).toLocaleDateString('en-GB') : '',
    ]
  })

  // Build CSV with BOM for Excel UTF-8
  const csvContent = '\uFEFF' + [headers, ...rows]
    .map(row => row.map(cell => {
      const clean = String(cell)
        .replace(/—/g, '-')  // em dash to hyphen
        .replace(/–/g, '-')  // en dash
        .replace(/â€"/g, '-')     // corrupted dash
        .replace(/[^ -]/g, c => c) // keep unicode but clean
      return '"' + clean.replace(/"/g, '""') + '"'
    }).join(','))
    .join('\r\n')

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', 'Fixnar_WorkOrders_' + new Date().toISOString().split('T')[0] + '.csv')
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

const EMPTY = {
  category:'', subcategory:'', fault:'',
  asset_id:'', store_id:'', assigned_to:'',
  priority:'', description:'', status:'open',
  scheduled_date:'', duration_hours:1
}

export default function WorkOrders() {
  const { profile, isAdmin, isTechnician } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [wos,      setWos]      = useState([])
  const [stores,   setStores]   = useState([])
  const [assets,   setAssets]   = useState([])
  const [filteredAssets, setFilteredAssets] = useState([])
  const [techs,    setTechs]    = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(!!searchParams.get('new'))
  const [form,     setForm]     = useState(EMPTY)
  const [saving,   setSaving]   = useState(false)

  // Filters
  const [search,          setSearch]          = useState('')
  const [filterStatus,    setFilterStatus]    = useState('all')
  const [filterPriority,  setFilterPriority]  = useState('all')
  const [filterTech,      setFilterTech]      = useState('all')
  const [filterStore,     setFilterStore]     = useState('all')
  const [filterDateFrom,  setFilterDateFrom]  = useState('')
  const [filterDateTo,    setFilterDateTo]    = useState('')
  const [showFilters,     setShowFilters]     = useState(false)

  useEffect(() => {
    fetchAll()
    const assetId = searchParams.get('asset_id')
    const storeId = searchParams.get('store_id')
    if (assetId || storeId) {
      setForm(f => ({...f, asset_id: assetId||'', store_id: storeId||''}))
      setShowForm(true)
    }
  }, [])

  useEffect(() => {
    if (!form.store_id) { setFilteredAssets([]); return }
    let storeAssets = assets.filter(a => a.store_id === form.store_id)
    if (form.subcategory) {
      const keywordMap = {
        'Air Conditioning':['ac','air con'],'Exhaust System':['hood','exhaust','mist'],
        'Drainage':['sink','drain','grease'],'Water Supply':['heater','water','sink'],
        'Grease Trap':['grease','sink'],'Lighting':['light'],'Power':['electrical','power'],
        'Generator':['generator'],'Cooking Equipment':['fryer','grill','shawarma','microwave','toaster','holding','coffee','grinder','mod bar','bbq','oven','salamander','alto'],
        'Refrigeration':['chiller','freezer','fridge','counter','salad','display'],
        'Dishwasher':['dish','sink','wash'],'Fire Suppression':['fire','suppression','hood'],
        'Fire Alarm':['alarm','detector'],'Emergency Exit':['door','exit'],
        'Flooring':['floor'],'Walls & Ceiling':['wall','ceiling'],
        'Doors & Windows':['door','glass','window'],'Infestation':['insect','killer'],
        'Preventive':['insect','killer'],'Gas System':['lpg','gas','shawarma'],
      }
      const keywords = keywordMap[form.subcategory] || []
      if (keywords.length > 0) {
        const filtered = storeAssets.filter(a => keywords.some(kw => a.name.toLowerCase().includes(kw)))
        if (filtered.length > 0) storeAssets = filtered
      }
    }
    setFilteredAssets(storeAssets)
  }, [form.store_id, form.subcategory, assets])

  async function fetchAll() {
    setLoading(true)
    const [woRes, storeRes, assetRes, techRes] = await Promise.all([
      supabase.from('work_orders').select('*,stores(name),assets(name)').order('created_at', { ascending:false }),
      supabase.from('stores').select('id,name').order('name'),
      supabase.from('assets').select('id,name,store_id').order('name'),
      supabase.from('profiles').select('id,full_name').eq('role','technician'),
    ])
    // Fetch tech names for each WO
    const wosData = woRes.data || []
    const techMap = {}
    ;(techRes.data||[]).forEach(t => { techMap[t.id] = t.full_name })
    const wosWithTech = wosData.map(wo => ({
      ...wo, tech_name: wo.assigned_to ? (techMap[wo.assigned_to] || 'Unknown') : null
    }))
    setWos(wosWithTech)
    setStores(storeRes.data || [])
    setAssets(assetRes.data || [])
    setTechs(techRes.data || [])
    setLoading(false)
  }

  function handleCategoryChange(cat) { setForm({...form, category:cat, subcategory:'', fault:'', priority:''}) }
  function handleSubcategoryChange(sub) { setForm({...form, subcategory:sub, fault:'', priority:''}) }
  function handleFaultChange(faultName) {
    const sub = CATEGORIES[form.category]?.subcategories[form.subcategory]
    const fault = sub?.faults.find(f => f.name === faultName)
    setForm({...form, fault:faultName, priority: fault?.priority || ''})
  }

  async function handleSave() {
    if (!form.category || !form.fault || !form.priority || !form.store_id) return
    setSaving(true)
    const title = `${form.category} — ${form.subcategory} — ${form.fault}`
    const { data, error } = await supabase.from('work_orders').insert({
      title, description: form.description||null, priority: form.priority,
      status: 'open', store_id: form.store_id, asset_id: form.asset_id||null,
      assigned_to: form.assigned_to||null, created_by: profile.id,
      scheduled_date: form.scheduled_date||null, duration_hours: form.duration_hours||1,
    }).select().single()
    if (!error && data) { setShowForm(false); setForm(EMPTY); fetchAll(); navigate('/schedule') }
    else alert('Error: ' + (error?.message || 'Unknown'))
    setSaving(false)
  }

  async function updateStatus(id, status, e) {
    if (e) e.stopPropagation()
    await supabase.from('work_orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    fetchAll()
  }

  // ── FILTER ──
  const filtered = wos.filter(w => {
    if (search && !w.title?.toLowerCase().includes(search.toLowerCase()) && !w.stores?.name?.toLowerCase().includes(search.toLowerCase())) return false
    if (filterStatus !== 'all' && w.status !== filterStatus) return false
    if (filterPriority !== 'all' && w.priority !== filterPriority) return false
    if (filterTech !== 'all') {
      if (filterTech === 'unassigned' && w.assigned_to) return false
      if (filterTech !== 'unassigned' && w.assigned_to !== filterTech) return false
    }
    if (filterStore !== 'all' && w.store_id !== filterStore) return false
    if (filterDateFrom) {
      const created = new Date(w.created_at)
      if (created < new Date(filterDateFrom)) return false
    }
    if (filterDateTo) {
      const created = new Date(w.created_at)
      const to = new Date(filterDateTo); to.setHours(23,59,59)
      if (created > to) return false
    }
    return true
  })

  // Summary counts
  const counts = {
    total:      wos.length,
    open:       wos.filter(w=>w.status==='open').length,
    inProgress: wos.filter(w=>w.status==='in_progress').length,
    onHold:     wos.filter(w=>w.status==='on_hold').length,
    completed:  wos.filter(w=>['completed','closed'].includes(w.status)).length,
    assigned:   wos.filter(w=>w.assigned_to).length,
    breached:   wos.filter(w=>!['closed','completed'].includes(w.status)).length,
  }

  const activeFilters = [filterStatus,filterPriority,filterTech,filterStore,filterDateFrom,filterDateTo].filter(f=>f&&f!=='all').length

  const subcategories = form.category ? Object.keys(CATEGORIES[form.category]?.subcategories || {}) : []
  const faults = form.subcategory ? CATEGORIES[form.category]?.subcategories[form.subcategory]?.faults || [] : []
  const suggestedPriority = form.fault ? faults.find(f => f.name === form.fault)?.priority : null
  const canSave = form.category && form.subcategory && form.fault && form.priority && form.store_id

  const inp = { background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, width:'100%', boxSizing:'border-box', outline:'none' }
  const sel = { ...inp, cursor:'pointer' }

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>

      {/* ── HEADER ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
        <div>
          <h1 style={{ color:'var(--text)', fontSize:22, fontWeight:600, margin:0 }}>Work Orders</h1>
          <p style={{ color:'var(--text3)', fontSize:13, margin:'4px 0 0' }}>
            {filtered.length} of {wos.length} shown {activeFilters > 0 && `· ${activeFilters} filter${activeFilters>1?'s':''} active`}
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => exportToExcel(filtered)}
            style={{ background:'var(--green-bg)', color:'var(--green)', border:'1px solid var(--green)', borderRadius:8, padding:'9px 16px', fontSize:13, fontWeight:500, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
            📥 Export Excel
          </button>
          <button onClick={() => setShowForm(true)}
            style={{ background:'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'9px 18px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
            + New Work Order
          </button>
        </div>
      </div>

      {/* ── SUMMARY CARDS ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:8, marginBottom:20 }}>
        {[
          { label:'Total',       value: counts.total,      color:'var(--text)',  bg:'var(--card-bg)',  filter:'all',         filterKey:'status' },
          { label:'Open',        value: counts.open,       color:'var(--amber)', bg:'var(--amber-bg)', filter:'open',        filterKey:'status' },
          { label:'In Progress', value: counts.inProgress, color:'var(--blue)',  bg:'var(--blue-bg)',  filter:'in_progress', filterKey:'status' },
          { label:'On Hold',     value: counts.onHold,     color:'#E24B4A',      bg:'#fdeaea',         filter:'on_hold',     filterKey:'status' },
          { label:'Completed',   value: counts.completed,  color:'var(--green)', bg:'var(--green-bg)', filter:'completed',   filterKey:'status' },
          { label:'Assigned',    value: counts.assigned,   color:'#7F77DD',      bg:'#f3f0ff',         filter:null,          filterKey:null },
          { label:'Unassigned',  value: wos.length - counts.assigned, color:'var(--text3)', bg:'var(--bg3)', filter:'unassigned', filterKey:'tech' },
        ].map(c => (
          <div key={c.label}
            onClick={() => {
              if (!c.filterKey) return
              if (c.filterKey === 'status') setFilterStatus(f => f === c.filter ? 'all' : c.filter)
              if (c.filterKey === 'tech') setFilterTech(f => f === c.filter ? 'all' : c.filter)
            }}
            style={{ background: c.bg, border:`1px solid ${c.color}33`, borderRadius:10, padding:'12px 10px', cursor: c.filterKey ? 'pointer' : 'default', transition:'transform 0.1s', textAlign:'center' }}
            onMouseEnter={e => { if(c.filterKey) e.currentTarget.style.transform='translateY(-2px)' }}
            onMouseLeave={e => e.currentTarget.style.transform='none'}>
            <div style={{ color: c.color, fontSize:22, fontWeight:700 }}>{c.value}</div>
            <div style={{ color: c.color, fontSize:11, fontWeight:500, opacity:0.8 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* ── FILTER BAR ── */}
      <div style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:12, padding:16, marginBottom:16 }}>
        <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Search by title or store..."
            style={{ ...inp, width:220 }}/>

          <button onClick={() => setShowFilters(f => !f)}
            style={{ background: activeFilters > 0 ? 'var(--green-bg)' : 'var(--bg3)', color: activeFilters > 0 ? 'var(--green)' : 'var(--text2)', border:`1px solid ${activeFilters > 0 ? 'var(--green)' : 'var(--border)'}`, borderRadius:8, padding:'8px 14px', fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
            ⚙️ Filters {activeFilters > 0 && <span style={{ background:'var(--green)', color:'white', borderRadius:10, padding:'1px 6px', fontSize:11 }}>{activeFilters}</span>}
          </button>

          {activeFilters > 0 && (
            <button onClick={() => { setFilterStatus('all'); setFilterPriority('all'); setFilterTech('all'); setFilterStore('all'); setFilterDateFrom(''); setFilterDateTo('') }}
              style={{ background:'transparent', color:'#E24B4A', border:'1px solid #E24B4A', borderRadius:8, padding:'8px 12px', fontSize:12, cursor:'pointer' }}>
              ✕ Clear all
            </button>
          )}

          <div style={{ marginLeft:'auto', color:'var(--text3)', fontSize:12 }}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(180px,1fr))', gap:10, marginTop:14, paddingTop:14, borderTop:'1px solid var(--border)' }}>
            <div>
              <label style={{ color:'var(--text3)', fontSize:11, display:'block', marginBottom:4 }}>Status</label>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={sel}>
                <option value="all">All statuses</option>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color:'var(--text3)', fontSize:11, display:'block', marginBottom:4 }}>Priority</label>
              <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={sel}>
                <option value="all">All priorities</option>
                <option value="P1">P1 — Critical</option>
                <option value="P2">P2 — High</option>
                <option value="P3">P3 — Medium</option>
                <option value="P4">P4 — Low</option>
              </select>
            </div>
            <div>
              <label style={{ color:'var(--text3)', fontSize:11, display:'block', marginBottom:4 }}>Technician</label>
              <select value={filterTech} onChange={e => setFilterTech(e.target.value)} style={sel}>
                <option value="all">All technicians</option>
                <option value="unassigned">Unassigned</option>
                {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color:'var(--text3)', fontSize:11, display:'block', marginBottom:4 }}>Store</label>
              <select value={filterStore} onChange={e => setFilterStore(e.target.value)} style={sel}>
                <option value="all">All stores</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color:'var(--text3)', fontSize:11, display:'block', marginBottom:4 }}>From Date</label>
              <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} style={{ ...inp, cursor:'pointer' }}/>
            </div>
            <div>
              <label style={{ color:'var(--text3)', fontSize:11, display:'block', marginBottom:4 }}>To Date</label>
              <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} style={{ ...inp, cursor:'pointer' }}/>
            </div>
          </div>
        )}
      </div>

      {/* ── NEW WO FORM ── */}
      {showForm && (
        <div style={{ background:'var(--card-bg)', border:'1px solid #1D9E75', borderRadius:12, padding:24, marginBottom:20, boxShadow:'0 2px 12px rgba(29,158,117,0.1)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <h3 style={{ color:'var(--text)', fontSize:15, fontWeight:600, margin:0 }}>Create New Work Order</h3>
            <button onClick={() => { setShowForm(false); setForm(EMPTY) }} style={{ background:'transparent', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:20 }}>✕</button>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16 }}>
            <div>
              <label style={{ color:'var(--text3)', fontSize:12, display:'block', marginBottom:5 }}>1. Category *</label>
              <select style={sel} value={form.category} onChange={e => handleCategoryChange(e.target.value)}>
                <option value="">Select category</option>
                {Object.entries(CATEGORIES).map(([cat,val]) => <option key={cat} value={cat}>{val.icon} {cat}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color:'var(--text3)', fontSize:12, display:'block', marginBottom:5 }}>2. Subcategory *</label>
              <select style={{ ...sel, opacity:!form.category?0.5:1 }} value={form.subcategory} onChange={e => handleSubcategoryChange(e.target.value)} disabled={!form.category}>
                <option value="">Select subcategory</option>
                {subcategories.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color:'var(--text3)', fontSize:12, display:'block', marginBottom:5 }}>3. Fault *</label>
              <select style={{ ...sel, opacity:!form.subcategory?0.5:1 }} value={form.fault} onChange={e => handleFaultChange(e.target.value)} disabled={!form.subcategory}>
                <option value="">Select fault</option>
                {faults.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
              </select>
            </div>
          </div>

          {form.fault && (
            <div style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', marginBottom:14, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
              <span style={{ color:'var(--text3)', fontSize:12 }}>Priority:</span>
              {['P1','P2','P3','P4'].map(p => (
                <button key={p} onClick={() => setForm({...form, priority:p})}
                  style={{ background: form.priority===p ? PRIORITY_COLORS[p].bg : 'transparent', color: form.priority===p ? PRIORITY_COLORS[p].text : 'var(--text3)', border:`1px solid ${form.priority===p ? PRIORITY_COLORS[p].text : 'var(--border)'}`, borderRadius:6, padding:'4px 14px', fontSize:12, fontWeight:600, cursor:'pointer', outline: suggestedPriority===p&&form.priority!==p ? `2px dashed ${PRIORITY_COLORS[p].text}` : 'none' }}>
                  {p} {suggestedPriority===p?'⭐':''}
                </button>
              ))}
              <span style={{ color:'var(--text3)', fontSize:11 }}>⭐ auto-suggested</span>
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
            <div>
              <label style={{ color:'var(--text3)', fontSize:12, display:'block', marginBottom:5 }}>Store *</label>
              <select style={sel} value={form.store_id} onChange={e => setForm({...form, store_id:e.target.value, asset_id:''})}>
                <option value="">Select store</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color:'var(--text3)', fontSize:12, display:'block', marginBottom:5 }}>Asset</label>
              <select style={{ ...sel, opacity:!form.store_id?0.5:1 }} value={form.asset_id} onChange={e => setForm({...form, asset_id:e.target.value})} disabled={!form.store_id}>
                <option value="">Select asset</option>
                {filteredAssets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color:'var(--text3)', fontSize:12, display:'block', marginBottom:5 }}>Assign Technician</label>
              <select style={sel} value={form.assigned_to} onChange={e => setForm({...form, assigned_to:e.target.value})}>
                <option value="">Unassigned</option>
                {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ color:'var(--text3)', fontSize:12, display:'block', marginBottom:5 }}>Duration</label>
              <select style={sel} value={form.duration_hours} onChange={e => setForm({...form, duration_hours:parseFloat(e.target.value)})}>
                {[0.5,1,1.5,2,3,4,8].map(h => <option key={h} value={h}>{h<1?'30 min':`${h}h`}</option>)}
              </select>
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={{ color:'var(--text3)', fontSize:12, display:'block', marginBottom:5 }}>Notes</label>
              <input style={inp} value={form.description} onChange={e => setForm({...form, description:e.target.value})} placeholder="Additional details..."/>
            </div>
          </div>

          {form.fault && (
            <div style={{ background:'var(--blue-bg)', border:'1px solid var(--blue)', borderRadius:8, padding:'8px 14px', marginBottom:14, fontSize:12, color:'var(--blue)' }}>
              Title: <strong>{form.category} — {form.subcategory} — {form.fault}</strong>
            </div>
          )}

          <div style={{ display:'flex', gap:10 }}>
            <button onClick={handleSave} disabled={saving||!canSave}
              style={{ background:saving||!canSave?'#ccc':'#1D9E75', color:saving||!canSave?'#999':'white', border:'none', borderRadius:8, padding:'10px 20px', fontSize:13, fontWeight:500, cursor:saving||!canSave?'not-allowed':'pointer' }}>
              {saving ? 'Creating...' : '✓ Create & Go to Dispatch Board'}
            </button>
            <button onClick={() => { setShowForm(false); setForm(EMPTY) }}
              style={{ background:'transparent', color:'var(--text2)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 16px', fontSize:13, cursor:'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── TABLE ── */}
      <div style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:48, textAlign:'center', color:'var(--text3)' }}>Loading work orders...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:48, textAlign:'center', color:'var(--text3)' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
            No work orders match your filters
          </div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid var(--border)', background:'var(--bg3)' }}>
                {['#','Priority','Title','Store','Assigned To','Status','Created','SLA'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', color:'var(--text3)', fontSize:12, fontWeight:500, textAlign:'left', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((wo, i) => (
                <tr key={wo.id}
                  onClick={() => navigate(`/work-orders/${wo.id}`)}
                  style={{ borderBottom:'1px solid var(--border)', cursor:'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background='var(--hover-bg)'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                  <td style={{ padding:'11px 14px', color:'var(--text3)', fontSize:12 }}>#{String(i+1).padStart(4,'0')}</td>
                  <td style={{ padding:'11px 14px' }}>
                    <span style={{ background:PRIORITY_COLORS[wo.priority]?.bg, color:PRIORITY_COLORS[wo.priority]?.text, fontSize:11, padding:'3px 9px', borderRadius:6, fontWeight:700 }}>{wo.priority}</span>
                  </td>
                  <td style={{ padding:'11px 14px', color:'var(--text)', fontSize:13, maxWidth:280 }}>
                    <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{wo.title}</div>
                    {wo.assets?.name && <div style={{ color:'var(--text3)', fontSize:11, marginTop:2 }}>🔧 {wo.assets.name}</div>}
                  </td>
                  <td style={{ padding:'11px 14px', color:'var(--text2)', fontSize:12, whiteSpace:'nowrap' }}>{wo.stores?.name || '—'}</td>
                  <td style={{ padding:'11px 14px', fontSize:12 }}>
                    {wo.tech_name ? (
                      <span style={{ background:'#f3f0ff', color:'#7F77DD', padding:'2px 8px', borderRadius:6, fontSize:11, fontWeight:500 }}>{wo.tech_name}</span>
                    ) : (
                      <span style={{ color:'var(--text3)', fontSize:11 }}>Unassigned</span>
                    )}
                  </td>
                  <td style={{ padding:'11px 14px' }}>
                    <select value={wo.status}
                      onChange={e => updateStatus(wo.id, e.target.value, e)}
                      onClick={e => e.stopPropagation()}
                      style={{ background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:6, padding:'4px 8px', color:'var(--text)', fontSize:12, cursor:'pointer' }}>
                      {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                    </select>
                  </td>
                  <td style={{ padding:'11px 14px', color:'var(--text3)', fontSize:11, whiteSpace:'nowrap' }}>
                    {new Date(wo.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding:'11px 14px', minWidth:150 }}>
                    <SLABadge priority={wo.priority} createdAt={wo.created_at} status={wo.status}/>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer count */}
      {filtered.length > 0 && (
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:12, color:'var(--text3)', fontSize:12 }}>
          <span>Showing {filtered.length} of {wos.length} work orders</span>
          <button onClick={() => exportToExcel(filtered)}
            style={{ background:'transparent', color:'var(--green)', border:'none', fontSize:12, cursor:'pointer', textDecoration:'underline' }}>
            📥 Export {filtered.length} rows to Excel
          </button>
        </div>
      )}
    </div>
  )
}
