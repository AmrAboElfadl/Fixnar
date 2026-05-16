import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const DEV_EMAIL = 'amrmorsy93@gmail.com'
const DEV_PIN   = '1234'

// ── Shared UI helpers ─────────────────────────────────────────────────────────
const Btn = ({ children, onClick, color='var(--green)', disabled, small, style={} }) => (
  <button onClick={onClick} disabled={disabled} style={{
    background: disabled ? '#ccc' : color, color:'white', border:'none',
    borderRadius: small?7:9, padding: small?'5px 12px':'9px 18px',
    fontSize: small?12:13, cursor: disabled?'not-allowed':'pointer',
    fontWeight:600, opacity:disabled?0.6:1, transition:'opacity 0.15s', ...style,
  }}>{children}</button>
)

const Field = ({ label, children }) => (
  <div style={{marginBottom:14}}>
    <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',letterSpacing:'0.06em',marginBottom:5}}>{label}</div>
    {children}
  </div>
)

const Input = (props) => (
  <input {...props} style={{
    width:'100%', padding:'9px 11px', borderRadius:8,
    border:'1px solid var(--border)', background:'var(--bg)',
    color:'var(--text)', fontSize:13, boxSizing:'border-box', ...props.style,
  }}/>
)

const Select = ({ value, onChange, options, style={} }) => (
  <select value={value} onChange={onChange} style={{
    width:'100%', padding:'9px 11px', borderRadius:8,
    border:'1px solid var(--border)', background:'var(--bg)',
    color:'var(--text)', fontSize:13, cursor:'pointer', ...style,
  }}>
    {options.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
  </select>
)

// ─────────────────────────────────────────────────────────────────────────────
// TAB: STORES
// ─────────────────────────────────────────────────────────────────────────────
function StoresTab() {
  const [stores,  setStores]  = useState([])
  const [editing, setEditing] = useState(null)
  const [saving,  setSaving]  = useState(false)
  const [search,  setSearch]  = useState('')
  const [msg,     setMsg]     = useState('')

  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('stores').select('*').order('name')
    setStores(data || [])
  }
  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 3000) }

  async function save() {
    setSaving(true)
    const { error } = editing.id
      ? await supabase.from('stores').update(editing).eq('id', editing.id)
      : await supabase.from('stores').insert(editing)
    error ? flash('❌ ' + error.message) : flash('✅ Saved')
    setEditing(null); load(); setSaving(false)
  }

  async function del(id, name) {
    if (!confirm(`Delete "${name}"?`)) return
    await supabase.from('stores').delete().eq('id', id)
    flash('✅ Deleted'); load()
  }

  const FIELDS = [
    ['name','Store Name *'], ['address','Address'], ['city','City'],
    ['manager_name','Manager Name'], ['phone','Phone'],
    ['latitude','Latitude'], ['longitude','Longitude'],
    ['opening_hours','Opening Hours'], ['notes','Notes'],
  ]

  const filtered = stores.filter(s => s.name?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div>
      <div style={{display:'flex',gap:10,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
        <Input placeholder="Search stores…" value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:260}}/>
        <Btn onClick={() => setEditing({name:'',address:'',city:'',manager_name:'',phone:'',latitude:'',longitude:''})}>+ Add Store</Btn>
        {msg && <span style={{fontSize:13,color:msg.startsWith('✅')?'#1D9E75':'#E24B4A'}}>{msg}</span>}
      </div>

      {editing && (
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:20,marginBottom:16}}>
          <h3 style={{margin:'0 0 16px',fontSize:15}}>{editing.id?'Edit Store':'New Store'}</h3>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
            {FIELDS.map(([k,l]) => (
              <div key={k}>
                <div style={{fontSize:11,color:'var(--text3)',marginBottom:5,fontWeight:600}}>{l}</div>
                <Input value={editing[k]||''} onChange={e=>setEditing({...editing,[k]:e.target.value})}/>
              </div>
            ))}
          </div>
          <div style={{display:'flex',gap:8,marginTop:16}}>
            <Btn onClick={save} disabled={saving||!editing.name}>{saving?'Saving…':'Save Store'}</Btn>
            <Btn onClick={()=>setEditing(null)} color='#666'>Cancel</Btn>
          </div>
        </div>
      )}

      <div style={{display:'grid',gap:6}}>
        {filtered.map(s => (
          <div key={s.id} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 16px',background:'var(--surface)',borderRadius:10,border:'1px solid var(--border)'}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:13}}>{s.name}</div>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>
                {[s.city, s.manager_name && `👤 ${s.manager_name}`, s.phone && `📞 ${s.phone}`, s.latitude && `📍 ${parseFloat(s.latitude).toFixed(4)}, ${parseFloat(s.longitude).toFixed(4)}`].filter(Boolean).join(' · ')}
              </div>
            </div>
            <Btn small onClick={()=>setEditing({...s})} color='#378ADD'>Edit</Btn>
            <Btn small onClick={()=>del(s.id,s.name)} color='#E24B4A'>Delete</Btn>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: USERS
// ─────────────────────────────────────────────────────────────────────────────
function UsersTab() {
  const [users,  setUsers]  = useState([])
  const [stores, setStores] = useState([])
  const [editing,setEditing]= useState(null)
  const [saving, setSaving] = useState(false)
  const [msg,    setMsg]    = useState('')
  const [newUser,setNewUser] = useState({ email:'', name:'', role:'technician', password:'Fixnar2024!' })
  const [showNew,setShowNew] = useState(false)
  const [sqlBox, setSqlBox]  = useState('')

  const ROLES = ['admin','technician','operations','viewer']
  const RC    = { admin:'#E24B4A', technician:'#7F77DD', operations:'#EF9F27', viewer:'#9e9e9e' }

  useEffect(() => { load() }, [])
  async function load() {
    const [u, s] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('stores').select('id,name').order('name'),
    ])
    setUsers(u.data||[]); setStores(s.data||[])
  }
  function flash(m) { setMsg(m); setTimeout(()=>setMsg(''),4000) }

  async function saveEdit() {
    setSaving(true)
    const { error } = await supabase.from('profiles').update({
      full_name:editing.full_name, role:editing.role,
      phone:editing.phone, store_id:editing.store_id||null,
    }).eq('id',editing.id)
    error ? flash('❌ '+error.message) : flash('✅ User updated')
    setEditing(null); load(); setSaving(false)
  }

  async function del(u) {
    if (!confirm(`Delete ${u.full_name}?`)) return
    await supabase.from('profiles').delete().eq('id',u.id)
    flash('✅ Removed'); load()
  }

  function buildSQL() {
    const sql = `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, created_at, updated_at, role, aud)\nVALUES (gen_random_uuid(), '${newUser.email}', crypt('${newUser.password}', gen_salt('bf')), now(), '{"full_name":"${newUser.name}"}', now(), now(), 'authenticated', 'authenticated');\n\nUPDATE profiles SET role='${newUser.role}', full_name='${newUser.name}' WHERE email='${newUser.email}';`
    setSqlBox(sql)
  }

  return (
    <div>
      <div style={{display:'flex',gap:10,marginBottom:16,alignItems:'center'}}>
        <div style={{fontWeight:600,fontSize:14}}>{users.length} users</div>
        <Btn onClick={()=>setShowNew(true)}>+ New User</Btn>
        {msg && <span style={{fontSize:13,color:msg.startsWith('✅')?'#1D9E75':'#E24B4A'}}>{msg}</span>}
      </div>

      {showNew && (
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:20,marginBottom:16}}>
          <h3 style={{margin:'0 0 14px',fontSize:15}}>Create New User</h3>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
            {[['Full Name','name'],['Email','email'],['Temp Password','password']].map(([l,k])=>(
              <div key={k}>
                <div style={{fontSize:11,color:'var(--text3)',marginBottom:5,fontWeight:600}}>{l.toUpperCase()}</div>
                <Input value={newUser[k]} onChange={e=>setNewUser({...newUser,[k]:e.target.value})}/>
              </div>
            ))}
            <div>
              <div style={{fontSize:11,color:'var(--text3)',marginBottom:5,fontWeight:600}}>ROLE</div>
              <Select value={newUser.role} onChange={e=>setNewUser({...newUser,role:e.target.value})} options={ROLES.map(r=>[r,r])}/>
            </div>
          </div>
          <div style={{display:'flex',gap:8}}>
            <Btn onClick={buildSQL}>Generate SQL</Btn>
            <Btn onClick={()=>setShowNew(false)} color='#666'>Cancel</Btn>
          </div>
          {sqlBox && (
            <div style={{marginTop:14}}>
              <div style={{background:'#1a1a2e',borderRadius:8,padding:14}}>
                <pre style={{color:'#a8d8a8',fontSize:12,margin:0,whiteSpace:'pre-wrap',fontFamily:'monospace'}}>{sqlBox}</pre>
              </div>
              <div style={{display:'flex',gap:8,marginTop:8}}>
                <Btn small onClick={()=>{navigator.clipboard.writeText(sqlBox);flash('✅ Copied!')}}>📋 Copy SQL</Btn>
                <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer"
                  style={{background:'#1D9E75',color:'white',borderRadius:7,padding:'5px 12px',fontSize:12,textDecoration:'none',fontWeight:600}}>
                  Open Supabase ↗
                </a>
              </div>
              <div style={{fontSize:11,color:'var(--text3)',marginTop:6}}>Copy SQL → paste in Supabase SQL Editor → Run</div>
            </div>
          )}
        </div>
      )}

      {editing && (
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:20,marginBottom:16}}>
          <h3 style={{margin:'0 0 14px',fontSize:15}}>Edit: {editing.email}</h3>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
            {[['Full Name','full_name'],['Phone','phone']].map(([l,k])=>(
              <div key={k}>
                <div style={{fontSize:11,color:'var(--text3)',marginBottom:5,fontWeight:600}}>{l.toUpperCase()}</div>
                <Input value={editing[k]||''} onChange={e=>setEditing({...editing,[k]:e.target.value})}/>
              </div>
            ))}
            <div>
              <div style={{fontSize:11,color:'var(--text3)',marginBottom:5,fontWeight:600}}>ROLE</div>
              <Select value={editing.role||'viewer'} onChange={e=>setEditing({...editing,role:e.target.value})} options={ROLES.map(r=>[r,r])}/>
            </div>
            <div>
              <div style={{fontSize:11,color:'var(--text3)',marginBottom:5,fontWeight:600}}>STORE</div>
              <Select value={editing.store_id||''} onChange={e=>setEditing({...editing,store_id:e.target.value})}
                options={[['','All stores'],...stores.map(s=>[s.id,s.name])]}/>
            </div>
          </div>
          <div style={{display:'flex',gap:8,marginTop:14}}>
            <Btn onClick={saveEdit} disabled={saving}>{saving?'Saving…':'Save'}</Btn>
            <Btn onClick={()=>setEditing(null)} color='#666'>Cancel</Btn>
          </div>
        </div>
      )}

      <div style={{display:'grid',gap:6}}>
        {users.map(u=>(
          <div key={u.id} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 16px',background:'var(--surface)',borderRadius:10,border:'1px solid var(--border)'}}>
            <div style={{width:36,height:36,borderRadius:'50%',background:RC[u.role]||'#ccc',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,flexShrink:0}}>
              {(u.full_name||u.email||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:13}}>{u.full_name||'—'}</div>
              <div style={{fontSize:11,color:'var(--text3)'}}>{u.email}{u.phone&&` · 📞 ${u.phone}`}</div>
            </div>
            <span style={{background:RC[u.role]+'22',color:RC[u.role],border:`1px solid ${RC[u.role]}`,borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:600,flexShrink:0}}>{u.role}</span>
            <Btn small onClick={()=>setEditing({...u})} color='#378ADD'>Edit</Btn>
            <Btn small onClick={()=>del(u)} color='#E24B4A'>Delete</Btn>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: WORK ORDERS
// ─────────────────────────────────────────────────────────────────────────────
function WorkOrdersTab() {
  const [wos,    setWos]    = useState([])
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [msg,    setMsg]    = useState('')

  useEffect(() => { load() }, [])
  async function load() {
    const { data } = await supabase.from('work_orders')
      .select('*,stores(name),profiles(full_name)').order('created_at',{ascending:false}).limit(300)
    setWos(data||[])
  }
  function flash(m) { setMsg(m); setTimeout(()=>setMsg(''),3000) }

  async function del(id) {
    if (!confirm('Delete this work order?')) return
    await supabase.from('work_orders').delete().eq('id',id)
    flash('✅ Deleted'); load()
  }
  async function clearAll() {
    if (!confirm('Delete ALL work orders? Cannot be undone!')) return
    if (!confirm('FINAL WARNING: Delete everything?')) return
    await supabase.from('work_orders').delete().neq('id','00000000-0000-0000-0000-000000000000')
    flash('✅ All cleared'); load()
  }
  async function updateStatus(id, status) {
    await supabase.from('work_orders').update({status,updated_at:new Date().toISOString()}).eq('id',id)
    load()
  }

  const SC = { open:'#EF9F27', in_progress:'#1D9E75', completed:'#7F77DD', closed:'#9e9e9e', on_hold:'#E24B4A', travelling:'#378ADD', arrived:'#283593' }
  const PC = { P1:'#E24B4A', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }
  const STATUSES = ['open','travelling','arrived','in_progress','on_hold','completed','closed']

  const filtered = wos.filter(w =>
    (filter==='all'||w.status===filter) &&
    (w.title?.toLowerCase().includes(search.toLowerCase()) || w.stores?.name?.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap',alignItems:'center'}}>
        <Input placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)} style={{maxWidth:200}}/>
        <select value={filter} onChange={e=>setFilter(e.target.value)}
          style={{padding:'8px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:13}}>
          <option value="all">All ({wos.length})</option>
          {STATUSES.map(s=><option key={s} value={s}>{s} ({wos.filter(w=>w.status===s).length})</option>)}
        </select>
        <Btn small onClick={load} color='#378ADD'>↻ Refresh</Btn>
        <Btn small onClick={clearAll} color='#E24B4A'>🗑️ Clear All</Btn>
        {msg && <span style={{fontSize:12,color:msg.startsWith('✅')?'#1D9E75':'#E24B4A'}}>{msg}</span>}
      </div>

      <div style={{display:'grid',gap:5}}>
        {filtered.map(wo=>(
          <div key={wo.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',background:'var(--surface)',borderRadius:10,border:'1px solid var(--border)'}}>
            <span style={{width:8,height:8,borderRadius:'50%',background:PC[wo.priority]||'#ccc',flexShrink:0,display:'inline-block'}}/>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:600,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{wo.title||'Untitled'}</div>
              <div style={{fontSize:11,color:'var(--text3)'}}>{wo.stores?.name} · {wo.profiles?.full_name||'Unassigned'} · {new Date(wo.created_at).toLocaleDateString()}</div>
            </div>
            <select value={wo.status} onChange={e=>updateStatus(wo.id,e.target.value)}
              style={{padding:'4px 8px',borderRadius:7,border:`1px solid ${SC[wo.status]||'#ccc'}`,background:SC[wo.status]+'22',color:SC[wo.status]||'#999',fontSize:11,fontWeight:600,cursor:'pointer'}}>
              {STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
            <Btn small onClick={()=>del(wo.id)} color='#E24B4A'>Delete</Btn>
          </div>
        ))}
        {filtered.length===0 && <div style={{color:'var(--text3)',fontSize:13,padding:20,textAlign:'center'}}>No work orders found</div>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: DATABASE (SQL Runner)
// ─────────────────────────────────────────────────────────────────────────────
function DatabaseTab() {
  const [sql,     setSql]     = useState('SELECT * FROM stores LIMIT 10;')
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState('')
  const [running, setRunning] = useState(false)

  const PRESETS = [
    { label:'All Stores',      sql:'SELECT id, name, latitude, longitude, manager_name, phone FROM stores ORDER BY name;' },
    { label:'All Users',       sql:'SELECT id, full_name, email, role, phone FROM profiles ORDER BY role, full_name;' },
    { label:'Open WOs',        sql:"SELECT wo.id, wo.title, wo.status, wo.priority, s.name as store, p.full_name as tech FROM work_orders wo LEFT JOIN stores s ON s.id=wo.store_id LEFT JOIN profiles p ON p.id=wo.assigned_to WHERE wo.status != 'closed' ORDER BY wo.created_at DESC LIMIT 50;" },
    { label:'Tech Locations',  sql:'SELECT p.full_name, tl.latitude, tl.longitude, tl.updated_at FROM technician_locations tl JOIN profiles p ON p.id=tl.technician_id ORDER BY tl.updated_at DESC;' },
    { label:'WO Stats',        sql:"SELECT status, priority, count(*) FROM work_orders GROUP BY status, priority ORDER BY status, priority;" },
    { label:'PPM Tasks',       sql:"SELECT pt.title, pt.frequency, pt.next_due, s.name as store FROM ppm_tasks pt LEFT JOIN stores s ON s.id=pt.store_id ORDER BY pt.next_due;" },
    { label:'All Tables',      sql:"SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;" },
  ]

  async function runQuery() {
    setRunning(true); setError(''); setResult(null)
    // Parse the table from query to use supabase client
    const match = sql.match(/FROM\s+(\w+)/i)
    if (!match) { setError('Could not parse table name from query'); setRunning(false); return }
    const table = match[1]
    const limitMatch = sql.match(/LIMIT\s+(\d+)/i)
    const limit = limitMatch ? parseInt(limitMatch[1]) : 100

    try {
      let q = supabase.from(table).select('*').limit(limit)

      // Parse simple WHERE clauses
      const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*'([^']+)'/i)
      if (whereMatch) q = q.eq(whereMatch[1], whereMatch[2])

      const notMatch = sql.match(/WHERE\s+(\w+)\s+!=\s*'([^']+)'/i)
      if (notMatch) q = q.neq(notMatch[1], notMatch[2])

      // ORDER BY
      const orderMatch = sql.match(/ORDER BY\s+(\w+)(?:\s+(ASC|DESC))?/i)
      if (orderMatch) q = q.order(orderMatch[1], { ascending: orderMatch[2]?.toUpperCase() !== 'DESC' })

      const { data, error: e } = await q
      if (e) setError(e.message)
      else setResult(data || [])
    } catch(err) {
      setError(err.message)
    }
    setRunning(false)
  }

  const cols = result?.length > 0 ? Object.keys(result[0]) : []

  return (
    <div>
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:10}}>
        {PRESETS.map(p=>(
          <button key={p.label} onClick={()=>setSql(p.sql)}
            style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:7,padding:'5px 10px',fontSize:11,cursor:'pointer',color:'var(--text)',fontWeight:500}}>
            {p.label}
          </button>
        ))}
      </div>

      <textarea value={sql} onChange={e=>setSql(e.target.value)} rows={5}
        style={{width:'100%',padding:12,borderRadius:9,border:'1px solid var(--border)',background:'#0d1117',color:'#79c0ff',fontFamily:'monospace',fontSize:13,resize:'vertical',boxSizing:'border-box',lineHeight:1.6}}/>

      <div style={{display:'flex',gap:8,marginTop:10,marginBottom:14,alignItems:'center'}}>
        <Btn onClick={runQuery} disabled={running}>{running?'Running…':'▶ Run Query'}</Btn>
        <span style={{fontSize:11,color:'var(--text3)'}}>Simple SELECT queries via Supabase client · For complex SQL use the dashboard</span>
        <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer"
          style={{marginLeft:'auto',background:'#1D9E75',color:'white',borderRadius:8,padding:'7px 14px',fontSize:12,textDecoration:'none',fontWeight:600}}>
          Full SQL Editor ↗
        </a>
      </div>

      {error && <div style={{background:'#FBE9E7',color:'#BF360C',borderRadius:8,padding:12,fontSize:12,marginBottom:12}}>{error}</div>}

      {result && (
        result.length > 0 ? (
          <div style={{overflowX:'auto',borderRadius:10,border:'1px solid var(--border)'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
              <thead>
                <tr style={{background:'var(--surface)'}}>
                  {cols.map(c=><th key={c} style={{padding:'8px 12px',textAlign:'left',borderBottom:'1px solid var(--border)',fontWeight:600,color:'var(--text3)',whiteSpace:'nowrap'}}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {result.map((row,i)=>(
                  <tr key={i} style={{borderBottom:'1px solid var(--border)',background:i%2?'var(--surface)':'transparent'}}>
                    {cols.map(c=>(
                      <td key={c} style={{padding:'7px 12px',color:'var(--text)',maxWidth:240,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={String(row[c]??'')}>
                        {String(row[c]??'—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{padding:'6px 12px',fontSize:11,color:'var(--text3)'}}>{result.length} rows returned</div>
          </div>
        ) : <div style={{color:'var(--text3)',fontSize:13}}>Query returned 0 rows.</div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB: SETTINGS & STATS
// ─────────────────────────────────────────────────────────────────────────────
function SettingsTab() {
  const [stats,   setStats]   = useState({})
  const [loading, setLoading] = useState(true)
  const [msg,     setMsg]     = useState('')

  useEffect(() => { loadStats() }, [])
  function flash(m) { setMsg(m); setTimeout(()=>setMsg(''),3000) }

  async function loadStats() {
    const safe = p => p.catch(()=>({count:0}))
    const [s,u,w,p,t,a] = await Promise.all([
      safe(supabase.from('stores').select('*',{count:'exact',head:true})),
      safe(supabase.from('profiles').select('*',{count:'exact',head:true})),
      safe(supabase.from('work_orders').select('*',{count:'exact',head:true})),
      safe(supabase.from('ppm_tasks').select('*',{count:'exact',head:true})),
      safe(supabase.from('technician_locations').select('*',{count:'exact',head:true})),
      safe(supabase.from('assets').select('*',{count:'exact',head:true})),
    ])
    setStats({stores:s.count,users:u.count,wos:w.count,ppm:p.count,locs:t.count,assets:a.count})
    setLoading(false)
  }

  const STAT_ITEMS = [
    ['Stores',        'stores',  '#1D9E75'],
    ['Users',         'users',   '#7F77DD'],
    ['Work Orders',   'wos',     '#EF9F27'],
    ['PPM Tasks',     'ppm',     '#378ADD'],
    ['Assets',        'assets',  '#9e9e9e'],
    ['GPS Pings',     'locs',    '#E24B4A'],
  ]

  return (
    <div>
      {msg && <div style={{padding:'10px 14px',borderRadius:8,marginBottom:14,fontSize:13,background:'#E8F5E9',color:'#1B5E20',border:'1px solid #1D9E75'}}>{msg}</div>}

      <h3 style={{margin:'0 0 14px',fontSize:15}}>📊 Database Overview</h3>
      {loading ? <div style={{color:'var(--text3)'}}>Loading…</div> : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:10,marginBottom:28}}>
          {STAT_ITEMS.map(([label,key,color])=>(
            <div key={key} style={{background:'var(--surface)',borderRadius:12,padding:'16px 18px',border:`1px solid ${color}33`}}>
              <div style={{fontSize:30,fontWeight:700,color}}>{stats[key]??'—'}</div>
              <div style={{fontSize:12,color:'var(--text3)',marginTop:4}}>{label}</div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{margin:'0 0 14px',fontSize:15}}>🔗 Quick Links</h3>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:28}}>
        {[
          ['🟢 Supabase Dashboard', 'https://supabase.com/dashboard',        '#1D9E75'],
          ['⚫ GitHub Repository',   'https://github.com/AmrAboElfadl/Fixnar','#24292e'],
          ['🔺 Vercel Dashboard',   'https://vercel.com/dashboard',           '#000'],
          ['🌐 Live Site',           'https://fixnar.vercel.app',              '#7F77DD'],
        ].map(([label,url,bg])=>(
          <a key={label} href={url} target="_blank" rel="noreferrer"
            style={{background:bg,color:'white',borderRadius:10,padding:'14px 16px',textDecoration:'none',fontWeight:600,fontSize:13,display:'block'}}>
            {label} ↗
          </a>
        ))}
      </div>

      <h3 style={{margin:'0 0 14px',fontSize:15,color:'#E24B4A'}}>⚠️ Danger Zone</h3>
      <div style={{background:'var(--surface)',border:'1px solid #E24B4A44',borderRadius:12,padding:16}}>
        <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          <Btn color='#E24B4A' onClick={async()=>{
            if(!confirm('Clear ALL GPS location data?')) return
            await supabase.from('technician_locations').delete().neq('id','00000000-0000-0000-0000-000000000000')
            flash('✅ GPS data cleared'); loadStats()
          }}>Clear GPS Pings</Btn>
          <Btn color='#E24B4A' onClick={async()=>{
            if(!confirm('Clear ALL completed/closed work orders?')) return
            await supabase.from('work_orders').delete().in('status',['completed','closed'])
            flash('✅ Archived WOs cleared'); loadStats()
          }}>Clear Archived WOs</Btn>
          <Btn color='#E24B4A' onClick={async()=>{
            if(!confirm('Reset ALL store coordinates? They will need to be re-entered.')) return
            await supabase.from('stores').update({latitude:null,longitude:null}).neq('id','00000000-0000-0000-0000-000000000000')
            flash('✅ Coordinates reset')
          }}>Reset Store Coords</Btn>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DevPanel
// ─────────────────────────────────────────────────────────────────────────────
const TABS = [
  { id:'stores',   label:'🏪 Stores' },
  { id:'users',    label:'👥 Users' },
  { id:'wos',      label:'🔧 Work Orders' },
  { id:'database', label:'⚡ Database' },
  { id:'settings', label:'⚙️ Settings' },
]

export default function DevPanel() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const [tab,      setTab]      = useState('stores')
  const [unlocked, setUnlocked] = useState(false)
  const [pin,      setPin]      = useState('')
  const [pinError, setPinError] = useState(false)

  if (!profile || profile.email !== DEV_EMAIL) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}>
        <div style={{textAlign:'center',color:'var(--text3)'}}>
          <div style={{fontSize:48,marginBottom:12}}>🚫</div>
          <div style={{fontSize:16,fontWeight:600}}>Access Denied</div>
        </div>
      </div>
    )
  }

  if (!unlocked) {
    return (
      <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'70vh'}}>
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:20,padding:36,textAlign:'center',width:320,boxShadow:'0 8px 32px rgba(0,0,0,.2)'}}>
          <div style={{fontSize:48,marginBottom:8}}>🔐</div>
          <div style={{fontWeight:700,fontSize:20,marginBottom:4}}>Developer Panel</div>
          <div style={{color:'var(--text3)',fontSize:13,marginBottom:24}}>Enter your PIN to continue</div>
          <input
            type="password" placeholder="PIN" value={pin}
            onChange={e=>{ setPin(e.target.value); setPinError(false) }}
            onKeyDown={e=>{
              if(e.key==='Enter') {
                if(pin===DEV_PIN) setUnlocked(true)
                else { setPinError(true); setPin('') }
              }
            }}
            style={{width:'100%',padding:'12px',borderRadius:10,border:`2px solid ${pinError?'#E24B4A':'var(--border)'}`,background:'var(--bg)',color:'var(--text)',fontSize:20,textAlign:'center',letterSpacing:8,marginBottom:14,boxSizing:'border-box'}}
            autoFocus
          />
          {pinError && <div style={{color:'#E24B4A',fontSize:12,marginBottom:10}}>Incorrect PIN — try again</div>}
          <Btn onClick={()=>{ if(pin===DEV_PIN) setUnlocked(true); else { setPinError(true); setPin('') } }}
            style={{width:'100%',padding:'12px'}} disabled={!pin}>
            Unlock Panel
          </Btn>
        </div>
      </div>
    )
  }

  return (
    <div style={{color:'var(--text)'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24,flexWrap:'wrap',gap:12}}>
        <div>
          <h1 style={{margin:0,fontSize:24,fontWeight:700}}>
            <span style={{background:'linear-gradient(135deg,#7F77DD,#1D9E75)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
              ⚡ Developer Panel
            </span>
          </h1>
          <p style={{margin:'4px 0 0',color:'var(--text3)',fontSize:13}}>
            Full control · {profile.email} · {new Date().toLocaleString()}
          </p>
        </div>
        <div style={{display:'flex',gap:8}}>
          <Btn onClick={()=>setUnlocked(false)} color='#666' small>🔒 Lock</Btn>
          <Btn onClick={()=>navigate('/')} color='var(--green)' small>← Back to App</Btn>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:2,borderBottom:'2px solid var(--border)',marginBottom:24}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{
            padding:'10px 20px',border:'none',cursor:'pointer',fontSize:13,fontWeight:600,
            background:'transparent',
            color:tab===t.id?'var(--green)':'var(--text3)',
            borderBottom:tab===t.id?'2px solid var(--green)':'2px solid transparent',
            marginBottom:-2, transition:'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{minHeight:500}}>
        {tab==='stores'   && <StoresTab/>}
        {tab==='users'    && <UsersTab/>}
        {tab==='wos'      && <WorkOrdersTab/>}
        {tab==='database' && <DatabaseTab/>}
        {tab==='settings' && <SettingsTab/>}
      </div>
    </div>
  )
}
