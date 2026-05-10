import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import SLABadge from '../components/SLABadge'
import { useSearchParams } from 'react-router-dom'

// Work Order Category Structure
// Category → Subcategory → Faults → Suggested Priority

const CATEGORIES = {
  'HVAC': {
    icon: '❄️',
    subcategories: {
      'Air Conditioning': {
        faults: [
          { name: 'Not Cooling',         priority: 'P2' },
          { name: 'Water Leaking',        priority: 'P2' },
          { name: 'Strange Noise',        priority: 'P3' },
          { name: 'Unit Not Starting',    priority: 'P1' },
          { name: 'Filter Clogged',       priority: 'P3' },
          { name: 'Remote Not Working',   priority: 'P4' },
        ]
      },
      'Exhaust System': {
        faults: [
          { name: 'Fan Not Working',      priority: 'P1' },
          { name: 'Excessive Noise',      priority: 'P2' },
          { name: 'Weak Airflow',         priority: 'P2' },
          { name: 'Motor Fault',          priority: 'P1' },
          { name: 'Belt Broken',          priority: 'P2' },
        ]
      },
      'Ventilation': {
        faults: [
          { name: 'Duct Blocked',         priority: 'P2' },
          { name: 'Damper Stuck',         priority: 'P3' },
          { name: 'Grille Damaged',       priority: 'P4' },
        ]
      }
    }
  },
  'Plumbing': {
    icon: '🔧',
    subcategories: {
      'Drainage': {
        faults: [
          { name: 'Drain Blocked',        priority: 'P1' },
          { name: 'Slow Drainage',        priority: 'P2' },
          { name: 'Bad Odor',             priority: 'P2' },
          { name: 'Grease Trap Full',     priority: 'P1' },
          { name: 'Overflow',             priority: 'P1' },
        ]
      },
      'Water Supply': {
        faults: [
          { name: 'No Water',             priority: 'P1' },
          { name: 'Low Pressure',         priority: 'P2' },
          { name: 'Pipe Leaking',         priority: 'P1' },
          { name: 'Tap Dripping',         priority: 'P4' },
        ]
      },
      'Grease Trap': {
        faults: [
          { name: 'Needs Cleaning',       priority: 'P2' },
          { name: 'Overflow',             priority: 'P1' },
          { name: 'Bad Odor',             priority: 'P2' },
        ]
      }
    }
  },
  'Electrical': {
    icon: '⚡',
    subcategories: {
      'Lighting': {
        faults: [
          { name: 'Light Not Working',    priority: 'P3' },
          { name: 'Flickering',           priority: 'P3' },
          { name: 'Bulb Replacement',     priority: 'P4' },
          { name: 'Emergency Light Fault',priority: 'P1' },
        ]
      },
      'Power': {
        faults: [
          { name: 'No Power',             priority: 'P1' },
          { name: 'Tripping Breaker',     priority: 'P1' },
          { name: 'Socket Not Working',   priority: 'P3' },
          { name: 'Voltage Fluctuation',  priority: 'P2' },
        ]
      },
      'Generator': {
        faults: [
          { name: 'Not Starting',         priority: 'P1' },
          { name: 'Low Fuel',             priority: 'P2' },
          { name: 'Overheating',          priority: 'P1' },
          { name: 'Service Due',          priority: 'P3' },
        ]
      }
    }
  },
  'Kitchen Equipment': {
    icon: '🍳',
    subcategories: {
      'Cooking Equipment': {
        faults: [
          { name: 'Not Heating',          priority: 'P1' },
          { name: 'Gas Leak',             priority: 'P1' },
          { name: 'Temperature Issue',    priority: 'P2' },
          { name: 'Ignition Fault',       priority: 'P2' },
        ]
      },
      'Refrigeration': {
        faults: [
          { name: 'Not Cooling',          priority: 'P1' },
          { name: 'Temperature High',     priority: 'P1' },
          { name: 'Door Seal Broken',     priority: 'P3' },
          { name: 'Ice Build Up',         priority: 'P2' },
          { name: 'Compressor Noise',     priority: 'P2' },
        ]
      },
      'Dishwasher': {
        faults: [
          { name: 'Not Starting',         priority: 'P2' },
          { name: 'Not Draining',         priority: 'P2' },
          { name: 'Water Leaking',        priority: 'P1' },
          { name: 'Poor Cleaning',        priority: 'P3' },
        ]
      }
    }
  },
  'Fire & Safety': {
    icon: '🔥',
    subcategories: {
      'Fire Suppression': {
        faults: [
          { name: 'System Fault',         priority: 'P1' },
          { name: 'Nozzle Blocked',       priority: 'P1' },
          { name: 'Pressure Low',         priority: 'P1' },
          { name: 'Service Due',          priority: 'P2' },
        ]
      },
      'Fire Alarm': {
        faults: [
          { name: 'False Alarm',          priority: 'P2' },
          { name: 'Detector Fault',       priority: 'P1' },
          { name: 'Panel Error',          priority: 'P1' },
          { name: 'Battery Low',          priority: 'P2' },
        ]
      },
      'Emergency Exit': {
        faults: [
          { name: 'Door Blocked',         priority: 'P1' },
          { name: 'Sign Not Lit',         priority: 'P2' },
          { name: 'Lock Fault',           priority: 'P1' },
        ]
      }
    }
  },
  'Civil & Structure': {
    icon: '🏗️',
    subcategories: {
      'Flooring': {
        faults: [
          { name: 'Tile Broken',          priority: 'P3' },
          { name: 'Floor Slippery',       priority: 'P2' },
          { name: 'Water Seepage',        priority: 'P2' },
        ]
      },
      'Walls & Ceiling': {
        faults: [
          { name: 'Paint Peeling',        priority: 'P4' },
          { name: 'Crack in Wall',        priority: 'P3' },
          { name: 'Ceiling Damaged',      priority: 'P2' },
          { name: 'Water Stain',          priority: 'P3' },
        ]
      },
      'Doors & Windows': {
        faults: [
          { name: 'Door Not Closing',     priority: 'P3' },
          { name: 'Lock Broken',          priority: 'P2' },
          { name: 'Glass Cracked',        priority: 'P3' },
          { name: 'Hinge Broken',         priority: 'P3' },
        ]
      }
    }
  },
  'Pest Control': {
    icon: '🐛',
    subcategories: {
      'Infestation': {
        faults: [
          { name: 'Cockroach Sighting',   priority: 'P1' },
          { name: 'Rodent Activity',      priority: 'P1' },
          { name: 'Fly Infestation',      priority: 'P2' },
          { name: 'Ant Infestation',      priority: 'P3' },
        ]
      },
      'Preventive': {
        faults: [
          { name: 'Scheduled Treatment',  priority: 'P3' },
          { name: 'Bait Station Check',   priority: 'P4' },
        ]
      }
    }
  },
  'LPG & Gas': {
    icon: '⛽',
    subcategories: {
      'Gas System': {
        faults: [
          { name: 'Gas Leak',             priority: 'P1' },
          { name: 'Low Pressure',         priority: 'P1' },
          { name: 'Valve Fault',          priority: 'P1' },
          { name: 'Meter Issue',          priority: 'P2' },
          { name: 'Service Due',          priority: 'P3' },
        ]
      }
    }
  }
}

const PRIORITY_COLORS = {
  P1: { bg:'#2d1b1b', text:'#f85149', label:'P1 — Critical (4h SLA)' },
  P2: { bg:'#2d2208', text:'#EF9F27', label:'P2 — High (8h SLA)' },
  P3: { bg:'#1a2b3c', text:'#378ADD', label:'P3 — Medium (12h SLA)' },
  P4: { bg:'#1d2f26', text:'#1D9E75', label:'P4 — Low (7 days SLA)' },
}




const STATUSES = ['open','in_progress','on_hold','closed']

const EMPTY = {
  category: '', subcategory: '', fault: '',
  asset_id: '', store_id: '', assigned_to: '',
  priority: '', description: '', status: 'open'
}

export default function WorkOrders() {
  const { profile, isAdmin } = useAuth()
  const [searchParams] = useSearchParams()
  const [wos, setWos]       = useState([])
  const [stores, setStores] = useState([])
  const [assets, setAssets] = useState([])
  const [filteredAssets, setFilteredAssets] = useState([])
  const [techs, setTechs]   = useState([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(!!searchParams.get('new'))
  const [form, setForm]         = useState(EMPTY)
  const [saving, setSaving]     = useState(false)
  const [filterStatus, setFilterStatus]     = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => { fetchAll() }, [])

  useEffect(() => {
    if (!form.store_id) { setFilteredAssets([]); return }

    let storeAssets = assets.filter(a => a.store_id === form.store_id)

    if (form.subcategory) {
      const keywordMap = {
        'Air Conditioning':  ['ac', 'air con'],
        'Exhaust System':    ['hood', 'exhaust', 'mist'],
        'Ventilation':       ['hood', 'exhaust', 'vent'],
        'Drainage':          ['sink', 'drain', 'grease'],
        'Water Supply':      ['heater', 'water', 'sink'],
        'Grease Trap':       ['grease', 'sink'],
        'Lighting':          ['light'],
        'Power':             ['electrical', 'power'],
        'Generator':         ['generator'],
        'Cooking Equipment': ['fryer', 'grill', 'shawarma', 'microwave', 'toaster', 'holding', 'coffee', 'grinder', 'mod bar', 'bbq'],
        'Refrigeration':     ['chiller', 'freezer', 'display cabinet'],
        'Dishwasher':        ['dish', 'sink'],
        'Fire Suppression':  ['fire', 'suppression', 'hood'],
        'Fire Alarm':        ['alarm', 'detector'],
        'Emergency Exit':    ['door', 'exit'],
        'Flooring':          ['floor'],
        'Walls & Ceiling':   ['wall', 'ceiling'],
        'Doors & Windows':   ['door', 'glass', 'window'],
        'Infestation':       ['insect', 'killer'],
        'Preventive':        ['insect', 'killer'],
        'Gas System':        ['lpg', 'gas', 'shawarma'],
      }
      const keywords = keywordMap[form.subcategory] || []
      if (keywords.length > 0) {
        const filtered = storeAssets.filter(a =>
          keywords.some(kw => a.name.toLowerCase().includes(kw.toLowerCase()))
        )
        if (filtered.length > 0) storeAssets = filtered
      }
    }

    setFilteredAssets(storeAssets)
  }, [form.store_id, form.subcategory, assets])

  async function fetchAll() {
    setLoading(true)
    const [woRes, storeRes, assetRes, techRes] = await Promise.all([
      supabase.from('work_orders').select('*,stores(name),assets(name),profiles(full_name)').order('created_at', { ascending:false }),
      supabase.from('stores').select('id,name').order('name'),
      supabase.from('assets').select('id,name,store_id').order('name'),
      supabase.from('profiles').select('id,full_name').eq('role','technician'),
    ])
    setWos(woRes.data || [])
    setStores(storeRes.data || [])
    setAssets(assetRes.data || [])
    setTechs(techRes.data || [])
    setLoading(false)
  }

  function handleCategoryChange(cat) {
    setForm({ ...form, category: cat, subcategory: '', fault: '', priority: '' })
  }

  function handleSubcategoryChange(sub) {
    setForm({ ...form, subcategory: sub, fault: '', priority: '' })
  }

  function handleFaultChange(faultName) {
    const sub = CATEGORIES[form.category]?.subcategories[form.subcategory]
    const fault = sub?.faults.find(f => f.name === faultName)
    setForm({ ...form, fault: faultName, priority: fault?.priority || '' })
  }

  async function handleSave() {
    if (!form.category || !form.fault || !form.priority) return
    setSaving(true)
    const title = `${form.category} — ${form.subcategory} — ${form.fault}`
    const payload = {
      title,
      description: form.description,
      priority: form.priority,
      status: 'open',
      store_id: form.store_id || null,
      asset_id: form.asset_id || null,
      assigned_to: form.assigned_to || null,
      created_by: profile.id,
    }
    const { error } = await supabase.from('work_orders').insert(payload)
    if (!error) { setShowForm(false); setForm(EMPTY); fetchAll() }
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
    return true
  })

  const subcategories = form.category ? Object.keys(CATEGORIES[form.category]?.subcategories || {}) : []
  const faults = form.subcategory ? CATEGORIES[form.category]?.subcategories[form.subcategory]?.faults || [] : []
  const suggestedPriority = form.fault ? faults.find(f => f.name === form.fault)?.priority : null
  const canSave = form.category && form.subcategory && form.fault && form.priority && form.store_id

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
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search work orders..." style={{ ...inp, width:220 }}/>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...sel, width:140 }}>
          <option value="all">All status</option>
          {STATUSES.map(s => <option key={s} value={s}>{s.replace('_',' ')}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ ...sel, width:130 }}>
          <option value="all">All priority</option>
          {['P1','P2','P3','P4'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* NEW WORK ORDER FORM */}
      {showForm && (
        <div style={{ background:'#161b22', border:'1px solid #1D9E75', borderRadius:12, padding:24, marginBottom:20 }}>
          <h3 style={{ color:'#e6edf3', fontSize:15, fontWeight:500, margin:'0 0 20px' }}>Create New Work Order</h3>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:16 }}>
            {/* Step 1 — Category */}
            <div>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>
                1. Category *
              </label>
              <select style={sel} value={form.category} onChange={e => handleCategoryChange(e.target.value)}>
                <option value="">Select category</option>
                {Object.entries(CATEGORIES).map(([cat, val]) => (
                  <option key={cat} value={cat}>{val.icon} {cat}</option>
                ))}
              </select>
            </div>

            {/* Step 2 — Subcategory */}
            <div>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>
                2. Subcategory *
              </label>
              <select style={{ ...sel, opacity: !form.category ? 0.5 : 1 }} value={form.subcategory} onChange={e => handleSubcategoryChange(e.target.value)} disabled={!form.category}>
                <option value="">Select subcategory</option>
                {subcategories.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Step 3 — Fault */}
            <div>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>
                3. Fault *
              </label>
              <select style={{ ...sel, opacity: !form.subcategory ? 0.5 : 1 }} value={form.fault} onChange={e => handleFaultChange(e.target.value)} disabled={!form.subcategory}>
                <option value="">Select fault</option>
                {faults.map(f => <option key={f.name} value={f.name}>{f.name}</option>)}
              </select>
            </div>
          </div>

          {/* Priority — auto suggested */}
          {form.fault && (
            <div style={{ background:'#0d1117', border:'1px solid #30363d', borderRadius:8, padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
              <span style={{ color:'#8b949e', fontSize:13 }}>Suggested Priority:</span>
              <div style={{ display:'flex', gap:8 }}>
                {['P1','P2','P3','P4'].map(p => (
                  <button key={p} onClick={() => setForm({...form, priority: p})}
                    style={{
                      background: form.priority === p ? PRIORITY_COLORS[p].bg : 'transparent',
                      color: form.priority === p ? PRIORITY_COLORS[p].text : '#6b7280',
                      border: `1px solid ${form.priority === p ? PRIORITY_COLORS[p].text : '#30363d'}`,
                      borderRadius:6, padding:'4px 12px', fontSize:12, fontWeight:600, cursor:'pointer',
                      outline: suggestedPriority === p && form.priority !== p ? `2px dashed ${PRIORITY_COLORS[p].text}` : 'none'
                    }}>
                    {p} {suggestedPriority === p ? '⭐' : ''}
                  </button>
                ))}
              </div>
              {suggestedPriority && (
                <span style={{ color:'#6b7280', fontSize:12 }}>
                  ⭐ = auto-suggested based on fault type
                </span>
              )}
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:16 }}>
            {/* Store */}
            <div>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Store / Location *</label>
              <select style={sel} value={form.store_id} onChange={e => setForm({...form, store_id:e.target.value, asset_id:''})}>
                <option value="">Select store</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* Asset */}
            <div>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Asset</label>
              <select style={{ ...sel, opacity: !form.store_id ? 0.5 : 1 }} value={form.asset_id} onChange={e => setForm({...form, asset_id:e.target.value})} disabled={!form.store_id}>
                <option value="">Select asset</option>
                {filteredAssets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            {/* Technician */}
            {isAdmin && (
              <div>
                <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Assign Technician</label>
                <select style={sel} value={form.assigned_to} onChange={e => setForm({...form, assigned_to:e.target.value})}>
                  <option value="">Unassigned</option>
                  {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
            )}

            {/* Description */}
            <div style={{ gridColumn: isAdmin ? '2' : '1/-1' }}>
              <label style={{ color:'#8b949e', fontSize:12, display:'block', marginBottom:5 }}>Additional Notes</label>
              <textarea style={{ ...inp, height:72, resize:'vertical' }} value={form.description} onChange={e => setForm({...form, description:e.target.value})} placeholder="Any additional details..."/>
            </div>
          </div>

          {/* Preview title */}
          {form.fault && (
            <div style={{ background:'#1a2b3c', border:'1px solid #1f3a56', borderRadius:8, padding:'10px 14px', marginBottom:16 }}>
              <span style={{ color:'#6b7280', fontSize:12 }}>Work order title: </span>
              <span style={{ color:'#378ADD', fontSize:13, fontWeight:500 }}>
                {form.category} — {form.subcategory} — {form.fault}
              </span>
            </div>
          )}

          <div style={{ display:'flex', gap:10 }}>
            <button onClick={handleSave} disabled={saving || !canSave}
              style={{ background: saving||!canSave ? '#155740':'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'10px 20px', fontSize:13, fontWeight:500, cursor: saving||!canSave?'not-allowed':'pointer' }}>
              {saving ? 'Creating...' : 'Create Work Order'}
            </button>
            <button onClick={() => { setShowForm(false); setForm(EMPTY) }}
              style={{ background:'transparent', color:'#8b949e', border:'1px solid #30363d', borderRadius:8, padding:'10px 16px', fontSize:13, cursor:'pointer' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* TABLE */}
      <div style={{ background:'#161b22', border:'1px solid #21262d', borderRadius:12, overflow:'hidden' }}>
        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#6b7280' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'#6b7280' }}>No work orders found</div>
        ) : (
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid #21262d' }}>
                {['#','Priority','Title','Store','Assigned','Status','SLA'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', color:'#6b7280', fontSize:12, fontWeight:500, textAlign:'left', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((wo, i) => (
                <tr key={wo.id} onClick={() => navigate(`/work-orders/${wo.id}`)} style={{ borderBottom:'1px solid #21262d', cursor:'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background='#1c2128'}
                  onMouseLeave={e => e.currentTarget.style.background='transparent'}
                >
                  <td style={{ padding:'12px 14px', color:'#6b7280', fontSize:12 }}>#{String(i+1).padStart(4,'0')}</td>
                  <td style={{ padding:'12px 14px' }}>
                    <span style={{ background: PRIORITY_COLORS[wo.priority]?.bg, color: PRIORITY_COLORS[wo.priority]?.text, fontSize:11, padding:'3px 10px', borderRadius:6, fontWeight:600 }}>{wo.priority}</span>
                  </td>
                  <td style={{ padding:'12px 14px', color:'#e6edf3', fontSize:13, maxWidth:260 }}>
                    <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{wo.title}</div>
                  </td>
                  <td style={{ padding:'12px 14px', color:'#8b949e', fontSize:12, whiteSpace:'nowrap' }}>{wo.stores?.name || '—'}</td>
                  <td style={{ padding:'12px 14px', color:'#8b949e', fontSize:12, whiteSpace:'nowrap' }}>{wo.profiles?.full_name || 'Unassigned'}</td>
                  <td style={{ padding:'12px 14px' }}>
                    <select value={wo.status} onChange={e => { e.stopPropagation(); updateStatus(wo.id, e.target.value) }} onClick={e => e.stopPropagation()}
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
