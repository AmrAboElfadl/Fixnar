import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

// ── Only accessible to developer email ──────────────────────────────────────
const DEV_EMAIL = 'amrmorsy93@gmail.com'

const TABS = [
  { id:'stores',   label:'🏪 Stores',       icon:'🏪' },
  { id:'users',    label:'👥 Users',         icon:'👥' },
  { id:'wos',      label:'🔧 Work Orders',   icon:'🔧' },
  { id:'sql',      label:'⚡ SQL Runner',    icon:'⚡' },
  { id:'settings', label:'⚙️ Site Settings', icon:'⚙️' },
]

const INPUT = (props) => (
  <input {...props} style={{
    width:'100%', padding:'8px 10px', borderRadius:7,
    border:'1px solid var(--border)', background:'var(--bg)',
    color:'var(--text)', fontSize:13, boxSizing:'border-box',
    ...props.style,
  }}/>
)

const BTN = ({ children, onClick, color='var(--green)', disabled, style={} }) => (
  <button onClick={onClick} disabled={disabled} style={{
    background: disabled ? 'var(--border)' : color,
    color:'white', border:'none', borderRadius:8,
    padding:'8px 16px', fontSize:13, cursor: disabled ? 'not-allowed' : 'pointer',
    fontWeight:600, opacity: disabled ? 0.6 : 1, ...style,
  }}>{children}</button>
)

// ── Stores Tab ───────────────────────────────────────────────────────────────
function StoresTab() {
  const [stores, setStores] = useState([])
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const { data } = await supabase.from('stores').select('*').order('name')
    setStores(data || [])
  }

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('stores').upsert(editing)
    if (error) setMsg('❌ ' + error.message)
    else { setMsg('✅ Saved'); setEditing(null); load() }
    setSaving(false)
    setTimeout(() => setMsg(''), 3000)
  }

  async function del(id) {
    if (!window.confirm('Delete this store?')) return
    await supabase.from('stores').delete().eq('id', id)
    load()
  }

  const filtered = stores.filter(s => s.name?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <div style={{display:'flex',gap:10,marginBottom:14,alignItems:'center'}}>
        <INPUT placeholder="Search stores…" value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:280}}/>
        <BTN onClick={() => setEditing({ name:'', address:'', latitude:'', longitude:'', manager_name:'', phone:'' })}>+ Add Store</BTN>
        {msg && <span style={{fontSize:13,color:msg.startsWith('✅')?'#1D9E75':'#E24B4A'}}>{msg}</span>}
      </div>

      {editing && (
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:20,marginBottom:16}}>
          <h3 style={{margin:'0 0 14px',fontSize:15}}>{editing.id ? 'Edit Store' : 'New Store'}</h3>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {[['name','Name *'],['address','Address'],['manager_name','Manager'],['phone','Phone'],['latitude','Latitude'],['longitude','Longitude']].map(([k,l]) => (
              <div key={k}>
                <div style={{fontSize:11,color:'var(--text3)',marginBottom:4}}>{l}</div>
                <INPUT value={editing[k]||''} onChange={e=>setEditing({...editing,[k]:e.target.value})}/>
              </div>
            ))}
          </div>
          <div style={{display:'flex',gap:8,marginTop:14}}>
            <BTN onClick={save} disabled={saving||!editing.name}>{saving?'Saving…':'Save'}</BTN>
            <BTN onClick={()=>setEditing(null)} color='#666'>Cancel</BTN>
          </div>
        </div>
      )}

      <div style={{display:'grid',gap:6}}>
        {filtered.map(s => (
          <div key={s.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'var(--surface)',borderRadius:10,border:'1px solid var(--border)'}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:13}}>{s.name}</div>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>
                {s.manager_name && `👤 ${s.manager_name} · `}
                {s.phone && `📞 ${s.phone} · `}
                {s.latitude ? `📍 ${parseFloat(s.latitude).toFixed(4)}, ${parseFloat(s.longitude).toFixed(4)}` : '⚠️ No coordinates'}
              </div>
            </div>
            <div style={{display:'flex',gap:6,flexShrink:0}}>
              <BTN onClick={()=>setEditing({...s})} color='#378ADD' style={{padding:'5px 12px',fontSize:12}}>Edit</BTN>
              <BTN onClick={()=>del(s.id)} color='#E24B4A' style={{padding:'5px 12px',fontSize:12}}>Delete</BTN>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Users Tab ────────────────────────────────────────────────────────────────
function UsersTab() {
  const [users, setUsers] = useState([])
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('profiles').select('*').order('full_name')
    setUsers(data || [])
  }

  async function save() {
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      full_name: editing.full_name,
      role:      editing.role,
      phone:     editing.phone,
    }).eq('id', editing.id)
    if (error) setMsg('❌ ' + error.message)
    else { setMsg('✅ Saved'); setEditing(null); load() }
    setSaving(false)
    setTimeout(() => setMsg(''), 3000)
  }

  const ROLES = ['admin','technician','operations','viewer']
  const ROLE_COLORS = { admin:'#E24B4A', technician:'#7F77DD', operations:'#EF9F27', viewer:'#9e9e9e' }

  return (
    <div>
      <div style={{display:'flex',gap:10,marginBottom:14,alignItems:'center'}}>
        <div style={{fontWeight:600,fontSize:14}}>{users.length} users</div>
        {msg && <span style={{fontSize:13,color:msg.startsWith('✅')?'#1D9E75':'#E24B4A'}}>{msg}</span>}
      </div>

      {editing && (
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:20,marginBottom:16}}>
          <h3 style={{margin:'0 0 14px',fontSize:15}}>Edit User: {editing.email}</h3>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
            <div>
              <div style={{fontSize:11,color:'var(--text3)',marginBottom:4}}>Full Name</div>
              <INPUT value={editing.full_name||''} onChange={e=>setEditing({...editing,full_name:e.target.value})}/>
            </div>
            <div>
              <div style={{fontSize:11,color:'var(--text3)',marginBottom:4}}>Phone</div>
              <INPUT value={editing.phone||''} onChange={e=>setEditing({...editing,phone:e.target.value})}/>
            </div>
            <div>
              <div style={{fontSize:11,color:'var(--text3)',marginBottom:4}}>Role</div>
              <select value={editing.role||''} onChange={e=>setEditing({...editing,role:e.target.value})}
                style={{width:'100%',padding:'8px 10px',borderRadius:7,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:13}}>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:'flex',gap:8,marginTop:14}}>
            <BTN onClick={save} disabled={saving}>{saving?'Saving…':'Save'}</BTN>
            <BTN onClick={()=>setEditing(null)} color='#666'>Cancel</BTN>
          </div>
        </div>
      )}

      <div style={{display:'grid',gap:6}}>
        {users.map(u => (
          <div key={u.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'var(--surface)',borderRadius:10,border:'1px solid var(--border)'}}>
            <div style={{width:36,height:36,borderRadius:'50%',background:ROLE_COLORS[u.role]||'#ccc',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0}}>
              {(u.full_name||u.email||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:13}}>{u.full_name||'—'}</div>
              <div style={{fontSize:11,color:'var(--text3)'}}>{u.email} · {u.phone||'no phone'}</div>
            </div>
            <span style={{background:ROLE_COLORS[u.role]+'22',color:ROLE_COLORS[u.role],border:`1px solid ${ROLE_COLORS[u.role]}`,borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:600,flexShrink:0}}>
              {u.role}
            </span>
            <BTN onClick={()=>setEditing({...u})} color='#378ADD' style={{padding:'5px 12px',fontSize:12,flexShrink:0}}>Edit</BTN>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Work Orders Tab ──────────────────────────────────────────────────────────
function WorkOrdersTab() {
  const [wos, setWos] = useState([])
  const [filter, setFilter] = useState('all')
  const [msg, setMsg] = useState('')

  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('work_orders')
      .select('*,stores(name),profiles(full_name)')
      .order('created_at', { ascending:false })
      .limit(200)
    setWos(data || [])
  }

  async function del(id) {
    if (!window.confirm('Delete this work order permanently?')) return
    await supabase.from('work_orders').delete().eq('id', id)
    setMsg('✅ Deleted'); load()
    setTimeout(() => setMsg(''), 3000)
  }

  async function clearAll() {
    if (!window.confirm('Delete ALL work orders? This cannot be undone!')) return
    if (!window.confirm('Are you absolutely sure? All data will be lost.')) return
    await supabase.from('work_orders').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    setMsg('✅ All cleared'); load()
  }

  const STATUS_COLOR = { open:'#EF9F27', in_progress:'#1D9E75', completed:'#7F77DD', closed:'#9e9e9e', on_hold:'#E24B4A', travelling:'#378ADD', arrived:'#283593' }
  const filtered = filter === 'all' ? wos : wos.filter(w => w.status === filter)

  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:14,alignItems:'center',flexWrap:'wrap'}}>
        <select value={filter} onChange={e=>setFilter(e.target.value)}
          style={{padding:'7px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:13}}>
          <option value="all">All ({wos.length})</option>
          {['open','travelling','arrived','in_progress','on_hold','completed','closed'].map(s =>
            <option key={s} value={s}>{s} ({wos.filter(w=>w.status===s).length})</option>
          )}
        </select>
        <BTN onClick={load} color='#378ADD' style={{padding:'7px 12px'}}>↻ Refresh</BTN>
        <BTN onClick={clearAll} color='#E24B4A' style={{padding:'7px 12px'}}>🗑️ Clear All</BTN>
        {msg && <span style={{fontSize:13,color:'#1D9E75'}}>{msg}</span>}
      </div>
      <div style={{display:'grid',gap:6}}>
        {filtered.map(wo => (
          <div key={wo.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',background:'var(--surface)',borderRadius:10,border:'1px solid var(--border)'}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:13}}>{wo.title||'Untitled'}</div>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>
                {wo.stores?.name||'No store'} · {wo.profiles?.full_name||'Unassigned'} · {new Date(wo.created_at).toLocaleDateString()}
              </div>
            </div>
            <span style={{background:STATUS_COLOR[wo.status]+'22',color:STATUS_COLOR[wo.status]||'#999',border:`1px solid ${STATUS_COLOR[wo.status]||'#ccc'}`,borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:600,flexShrink:0}}>
              {wo.status}
            </span>
            <BTN onClick={()=>del(wo.id)} color='#E24B4A' style={{padding:'4px 10px',fontSize:11,flexShrink:0}}>Delete</BTN>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── SQL Runner Tab ───────────────────────────────────────────────────────────
function SQLTab() {
  const [sql, setSql] = useState('SELECT * FROM stores LIMIT 10;')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [running, setRunning] = useState(false)

  const PRESETS = [
    { label:'All Stores',    sql:'SELECT id, name, latitude, longitude, manager_name FROM stores ORDER BY name;' },
    { label:'All Users',     sql:'SELECT id, full_name, email, role, phone FROM profiles ORDER BY role;' },
    { label:'Open WOs',      sql:"SELECT wo.id, wo.title, wo.status, wo.priority, s.name as store FROM work_orders wo LEFT JOIN stores s ON s.id=wo.store_id WHERE wo.status != 'closed' ORDER BY wo.created_at DESC LIMIT 50;" },
    { label:'Tech Locations',sql:'SELECT p.full_name, tl.latitude, tl.longitude, tl.updated_at FROM technician_locations tl JOIN profiles p ON p.id=tl.technician_id ORDER BY tl.updated_at DESC;' },
    { label:'Count by status',sql:"SELECT status, count(*) FROM work_orders GROUP BY status ORDER BY count DESC;" },
  ]

  async function run() {
    setRunning(true); setError(''); setResult(null)
    try {
      const { data, error: e } = await supabase.rpc('exec_sql', { query: sql }).catch(() => ({ error: { message: 'exec_sql RPC not available' } }))
      if (e) {
        // fallback: try as a select via from
        setError('⚠️ Direct SQL requires exec_sql RPC. Use Supabase dashboard for custom SQL. Error: ' + e.message)
      } else {
        setResult(data)
      }
    } catch(err) {
      setError(err.message)
    }
    setRunning(false)
  }

  const cols = result && result.length > 0 ? Object.keys(result[0]) : []

  return (
    <div>
      <div style={{marginBottom:10,display:'flex',gap:6,flexWrap:'wrap'}}>
        {PRESETS.map(p => (
          <button key={p.label} onClick={()=>setSql(p.sql)} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:7,padding:'5px 10px',fontSize:11,cursor:'pointer',color:'var(--text)'}}>
            {p.label}
          </button>
        ))}
      </div>
      <textarea value={sql} onChange={e=>setSql(e.target.value)} rows={5}
        style={{width:'100%',padding:12,borderRadius:8,border:'1px solid var(--border)',background:'#1a1a2e',color:'#a8d8a8',fontFamily:'monospace',fontSize:13,resize:'vertical',boxSizing:'border-box'}}/>
      <div style={{display:'flex',gap:8,marginTop:8,marginBottom:12}}>
        <BTN onClick={run} disabled={running}>{running?'Running…':'▶ Run Query'}</BTN>
        <span style={{fontSize:11,color:'var(--text3)',alignSelf:'center'}}>Note: SELECT queries only via Supabase client</span>
      </div>
      {error && <div style={{background:'#FBE9E7',color:'#BF360C',borderRadius:8,padding:12,fontSize:12,marginBottom:10}}>{error}</div>}
      {result && result.length > 0 && (
        <div style={{overflowX:'auto',borderRadius:8,border:'1px solid var(--border)'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr style={{background:'var(--surface)'}}>
                {cols.map(c => <th key={c} style={{padding:'8px 12px',textAlign:'left',borderBottom:'1px solid var(--border)',fontWeight:600,color:'var(--text3)'}}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {result.map((row, i) => (
                <tr key={i} style={{borderBottom:'1px solid var(--border)',background:i%2?'var(--surface)':'transparent'}}>
                  {cols.map(c => <td key={c} style={{padding:'7px 12px',color:'var(--text)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{String(row[c]??'—')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{padding:'6px 12px',fontSize:11,color:'var(--text3)'}}>{result.length} rows</div>
        </div>
      )}
      {result && result.length === 0 && <div style={{color:'var(--text3)',fontSize:13}}>Query returned 0 rows.</div>}

      <div style={{marginTop:20,padding:16,background:'var(--surface)',borderRadius:10,border:'1px solid var(--border)'}}>
        <div style={{fontWeight:600,marginBottom:8}}>📋 Quick Actions</div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer"
            style={{background:'#1D9E75',color:'white',borderRadius:8,padding:'7px 14px',fontSize:12,textDecoration:'none',fontWeight:600}}>
            Open Supabase Dashboard ↗
          </a>
          <a href="https://github.com/AmrAboElfadl/Fixnar" target="_blank" rel="noreferrer"
            style={{background:'#333',color:'white',borderRadius:8,padding:'7px 14px',fontSize:12,textDecoration:'none',fontWeight:600}}>
            Open GitHub Repo ↗
          </a>
          <a href="https://vercel.com/dashboard" target="_blank" rel="noreferrer"
            style={{background:'#000',color:'white',borderRadius:8,padding:'7px 14px',fontSize:12,textDecoration:'none',fontWeight:600}}>
            Open Vercel ↗
          </a>
        </div>
      </div>
    </div>
  )
}

// ── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab() {
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const safe = p => p.catch(() => ({ count:0 }))
      const [s,u,w,p,t] = await Promise.all([
        safe(supabase.from('stores').select('*', {count:'exact',head:true})),
        safe(supabase.from('profiles').select('*', {count:'exact',head:true})),
        safe(supabase.from('work_orders').select('*', {count:'exact',head:true})),
        safe(supabase.from('ppm_tasks').select('*', {count:'exact',head:true})),
        safe(supabase.from('technician_locations').select('*', {count:'exact',head:true})),
      ])
      setStats({ stores:s.count, users:u.count, wos:w.count, ppm:p.count, techLocs:t.count })
      setLoading(false)
    }
    load()
  }, [])

  const items = [
    { label:'Stores',             value:stats.stores,   color:'#1D9E75' },
    { label:'Users',              value:stats.users,    color:'#7F77DD' },
    { label:'Work Orders (total)',value:stats.wos,      color:'#EF9F27' },
    { label:'PPM Tasks',          value:stats.ppm,      color:'#378ADD' },
    { label:'Tech Location Pings',value:stats.techLocs, color:'#E24B4A' },
  ]

  return (
    <div>
      <h3 style={{margin:'0 0 16px',fontSize:15}}>📊 Database Stats</h3>
      {loading ? <div style={{color:'var(--text3)'}}>Loading…</div> : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:12,marginBottom:24}}>
          {items.map(i => (
            <div key={i.label} style={{background:'var(--surface)',borderRadius:12,padding:16,border:`1px solid ${i.color}33`}}>
              <div style={{fontSize:28,fontWeight:700,color:i.color}}>{i.value ?? '—'}</div>
              <div style={{fontSize:12,color:'var(--text3)',marginTop:4}}>{i.label}</div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{margin:'0 0 12px',fontSize:15}}>🔗 Quick Links</h3>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        {[
          { label:'Supabase Dashboard', url:'https://supabase.com/dashboard', bg:'#1D9E75' },
          { label:'GitHub Repository',  url:'https://github.com/AmrAboElfadl/Fixnar', bg:'#333' },
          { label:'Vercel Dashboard',   url:'https://vercel.com/dashboard', bg:'#000' },
          { label:'Live Site',          url:'https://fixnar.vercel.app', bg:'#7F77DD' },
        ].map(l => (
          <a key={l.label} href={l.url} target="_blank" rel="noreferrer" style={{
            background:l.bg, color:'white', borderRadius:10, padding:'14px 16px',
            textDecoration:'none', fontWeight:600, fontSize:13, display:'block',
          }}>
            {l.label} ↗
          </a>
        ))}
      </div>

      <div style={{marginTop:20,padding:16,background:'var(--surface)',borderRadius:10,border:'1px solid #E24B4A44'}}>
        <div style={{fontWeight:600,color:'#E24B4A',marginBottom:8}}>⚠️ Danger Zone</div>
        <div style={{fontSize:12,color:'var(--text3)',marginBottom:12}}>These actions cannot be undone. Use with extreme caution.</div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <BTN color='#E24B4A' onClick={async () => {
            if (!window.confirm('Clear ALL technician location data?')) return
            await supabase.from('technician_locations').delete().neq('id','00000000-0000-0000-0000-000000000000')
            alert('Done')
          }}>Clear Tech Locations</BTN>
        </div>
      </div>
    </div>
  )
}

// ── Main DevPanel ─────────────────────────────────────────────────────────────
export default function DevPanel() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const [tab,       setTab]       = useState('stores')
  const [unlocked,  setUnlocked]  = useState(false)
  const [pin,       setPin]       = useState('')
  const DEV_PIN = '1234'  // Change this to your preferred PIN

  // Gate: must be dev email AND enter PIN
  if (!profile || profile.email !== DEV_EMAIL) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}>
        <div style={{textAlign:'center',color:'var(--text3)'}}>
          <div style={{fontSize:48,marginBottom:12}}>🚫</div>
          <div style={{fontSize:16,fontWeight:600}}>Access Denied</div>
          <div style={{fontSize:13,marginTop:8}}>Developer panel is restricted.</div>
        </div>
      </div>
    )
  }

  if (!unlocked) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}>
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:16,padding:32,textAlign:'center',width:300}}>
          <div style={{fontSize:40,marginBottom:12}}>🔐</div>
          <div style={{fontWeight:700,fontSize:18,marginBottom:4}}>Developer Panel</div>
          <div style={{color:'var(--text3)',fontSize:13,marginBottom:20}}>Enter your developer PIN to continue</div>
          <input
            type="password" placeholder="PIN"
            value={pin} onChange={e=>setPin(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter' && pin===DEV_PIN) setUnlocked(true) }}
            style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:16,textAlign:'center',letterSpacing:8,marginBottom:12,boxSizing:'border-box'}}
          />
          <BTN onClick={()=>{ if(pin===DEV_PIN) setUnlocked(true) }} style={{width:'100%'}} disabled={pin!==DEV_PIN}>
            Unlock Panel
          </BTN>
          {pin.length > 0 && pin !== DEV_PIN && <div style={{color:'#E24B4A',fontSize:12,marginTop:8}}>Incorrect PIN</div>}
        </div>
      </div>
    )
  }

  return (
    <div style={{color:'var(--text)'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{margin:0,fontSize:22,fontWeight:700,display:'flex',alignItems:'center',gap:10}}>
            <span style={{background:'linear-gradient(135deg,#7F77DD,#1D9E75)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>⚡ Developer Panel</span>
          </h1>
          <p style={{margin:'4px 0 0',color:'var(--text3)',fontSize:13}}>Full access · {profile.email}</p>
        </div>
        <div style={{display:'flex',gap:8}}>
          <BTN onClick={()=>setUnlocked(false)} color='#666' style={{padding:'7px 14px',fontSize:12}}>🔒 Lock</BTN>
          <BTN onClick={()=>navigate('/')} color='var(--green)' style={{padding:'7px 14px',fontSize:12}}>← Back to App</BTN>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:4,marginBottom:20,borderBottom:'1px solid var(--border)',paddingBottom:0}}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:'10px 18px',border:'none',cursor:'pointer',fontSize:13,fontWeight:600,
            background:'transparent',
            color: tab===t.id ? 'var(--green)' : 'var(--text3)',
            borderBottom: tab===t.id ? '2px solid var(--green)' : '2px solid transparent',
            marginBottom:-1,
          }}>{t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{minHeight:400}}>
        {tab==='stores'   && <StoresTab/>}
        {tab==='users'    && <UsersTab/>}
        {tab==='wos'      && <WorkOrdersTab/>}
        {tab==='sql'      && <SQLTab/>}
        {tab==='settings' && <SettingsTab/>}
      </div>
    </div>
  )
}
