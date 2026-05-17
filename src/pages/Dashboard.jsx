import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend
} from 'recharts'

const P_COLORS = { P1:'#E24B4A', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }
const SLA_HOURS = { P1:4, P2:8, P3:12, P4:168 }

function slaBreached(wo) {
  if (!wo.created_at) return false
  if (['closed','completed'].includes(wo.status)) return false
  const hours = (Date.now() - new Date(wo.created_at)) / 3600000
  return hours > (SLA_HOURS[wo.priority] || 24)
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────
function Modal({ title, subtitle, onClose, children }) {
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position:'fixed', inset:0, background:'rgba(0,0,0,0.55)',
        zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:20,
      }}
    >
      <div style={{
        background:'var(--surface)', borderRadius:16, width:'100%', maxWidth:780,
        maxHeight:'90vh', overflow:'hidden', display:'flex', flexDirection:'column',
        boxShadow:'0 8px 40px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{ padding:'20px 24px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexShrink:0 }}>
          <div>
            <h2 style={{ margin:0, fontSize:18, fontWeight:700, color:'var(--text)' }}>{title}</h2>
            {subtitle && <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--text3)' }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:'var(--text3)', lineHeight:1, padding:4 }}>×</button>
        </div>
        {/* Body */}
        <div style={{ overflowY:'auto', padding:'20px 24px', flex:1 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, bg, border, onClick, icon, sub }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: bg || 'var(--surface)',
        border: `1px solid ${border || 'var(--border)'}`,
        borderRadius:14, padding:'20px 22px',
        cursor:'pointer', transition:'transform 0.15s, box-shadow 0.15s',
        position:'relative', overflow:'hidden',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.1)' }}
      onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none' }}
    >
      <div style={{ fontSize:11, color: color || 'var(--text3)', fontWeight:700, letterSpacing:'0.06em', marginBottom:6, textTransform:'uppercase' }}>
        {icon} {label}
      </div>
      <div style={{ fontSize:32, fontWeight:700, color: color || 'var(--text)' }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>{sub}</div>}
      <div style={{ position:'absolute', bottom:10, right:12, fontSize:11, color: color || 'var(--text3)', opacity:0.7 }}>
        Click to explore →
      </div>
    </div>
  )
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', fontSize:12 }}>
      <div style={{ fontWeight:600, marginBottom:6, color:'var(--text)' }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color, marginBottom:2 }}>{p.name}: <b>{p.value}</b></div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()

  const [wos,     setWos]     = useState([])
  const [stores,  setStores]  = useState([])
  const [assets,  setAssets]  = useState(0)
  const [ppmDue,  setPpmDue]  = useState(0)
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(null)  // 'total'|'open'|'progress'|'assets'|'ppm'|'closed'
  const [woFilter,setWoFilter]= useState('all') // filter inside modals

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const safe = p => p.catch(() => ({ data:[], count:0 }))
    const [woRes, storeRes, assetRes, ppmRes] = await Promise.all([
      safe(supabase.from('work_orders').select('*,stores(name)').order('created_at', { ascending:false })),
      safe(supabase.from('stores').select('id,name')),
      safe(supabase.from('assets').select('id,name,category,status,store_id', { count:'exact' })),
      safe(supabase.from('ppm_tasks').select('id,title,due_date,status,store_id,stores(name)').lte('due_date', new Date(Date.now()+7*86400000).toISOString()).neq('status','done')),
    ])
    setWos(woRes.data || [])
    setStores(storeRes.data || [])
    setAssets(assetRes.count || 0)
    setPpmDue((ppmRes.data || []).length)
    setLoading(false)
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  const open       = wos.filter(w => ['open','travelling','arrived'].includes(w.status))
  const inProgress = wos.filter(w => w.status === 'in_progress')
  const closedToday= wos.filter(w => w.status === 'closed' && new Date(w.updated_at).toDateString() === new Date().toDateString())
  const allClosed  = wos.filter(w => w.status === 'closed')
  const breached   = wos.filter(slaBreached)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  // ── Chart data builders ────────────────────────────────────────────────────
  function byPriority(list) {
    return ['P1','P2','P3','P4'].map(p => ({ priority:p, count: list.filter(w=>w.priority===p).length, color:P_COLORS[p] }))
  }

  function byStore(list, top=8) {
    const map = {}
    list.forEach(w => { const n = w.stores?.name?.split('-').pop().trim() || 'Unknown'; map[n]=(map[n]||0)+1 })
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,top).map(([store,count])=>({ store, count }))
  }

  function byStatus(list) {
    const map = {}
    list.forEach(w => { map[w.status]=(map[w.status]||0)+1 })
    return Object.entries(map).map(([status,count])=>({ status, count }))
  }

  function byCategory(list) {
    const map = {}
    list.forEach(w => { const c=w.category||'Other'; map[c]=(map[c]||0)+1 })
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([cat,count])=>({ cat, count }))
  }

  function last7days(list) {
    return Array.from({length:7},(_,i)=>{
      const d = new Date(); d.setDate(d.getDate()-6+i)
      const label = d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})
      const day   = d.toDateString()
      return {
        label,
        created: list.filter(w=>new Date(w.created_at).toDateString()===day).length,
        closed:  list.filter(w=>w.status==='closed'&&new Date(w.updated_at).toDateString()===day).length,
      }
    })
  }

  function avgResolution(list) {
    const closed = list.filter(w=>w.status==='closed'&&w.created_at&&w.updated_at)
    if (!closed.length) return 'N/A'
    const avgH = closed.reduce((s,w)=>(s+(new Date(w.updated_at)-new Date(w.created_at))/3600000),0)/closed.length
    return avgH < 24 ? avgH.toFixed(1)+'h' : (avgH/24).toFixed(1)+'d'
  }

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--text3)' }}>
      Loading dashboard…
    </div>
  )

  return (
    <div style={{ color:'var(--text)' }}>
      {/* Greeting */}
      <div style={{ marginBottom:28 }}>
        <h2 style={{ margin:0, fontSize:24, fontWeight:700 }}>{greeting}, {profile?.full_name?.split(' ')[0]} 👋</h2>
        <p style={{ margin:'6px 0 0', color:'var(--text3)', fontSize:14 }}>Here's what's happening with your facilities today</p>
      </div>

      {/* Stat cards grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:14, marginBottom:28 }}>
        <StatCard label="Total Work Orders" value={wos.length} icon="📋"
          onClick={()=>setModal('total')}
          sub={`Avg resolution: ${avgResolution(wos)}`}/>
        <StatCard label="Open" value={open.length} icon="🔓"
          color="#E65100" bg="#FFF3E0" border="#EF9F2766"
          onClick={()=>setModal('open')}
          sub={`${breached.filter(w=>open.includes(w)).length} SLA breached`}/>
        <StatCard label="In Progress" value={inProgress.length} icon="⚙️"
          color="#1565C0" bg="#E3F2FD" border="#378ADD66"
          onClick={()=>setModal('progress')}
          sub="Currently being worked on"/>
        <StatCard label="Assets" value={assets} icon="🔧"
          color="#1B5E20" bg="#E8F5E9" border="#1D9E7566"
          onClick={()=>setModal('assets')}
          sub="Registered equipment"/>
        <StatCard label="PPM Due (7 days)" value={ppmDue} icon="📅"
          color="#BF360C" bg="#FBE9E7" border="#E24B4A66"
          onClick={()=>setModal('ppm')}
          sub="Scheduled maintenance"/>
        <StatCard label="Closed Today" value={closedToday.length} icon="✅"
          color="#4A148C" bg="#F3E5F5" border="#9C27B066"
          onClick={()=>setModal('closed')}
          sub={`${allClosed.length} closed total`}/>
      </div>

      {/* Quick actions */}
      <div style={{ display:'flex', gap:10, marginBottom:28, flexWrap:'wrap' }}>
        <button onClick={()=>navigate('/work-orders')}
          style={{ background:'var(--green)', color:'white', border:'none', borderRadius:10, padding:'10px 20px', fontSize:14, cursor:'pointer', fontWeight:600 }}>
          + New Work Order
        </button>
        <button onClick={()=>navigate('/ppm')}
          style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 20px', fontSize:14, cursor:'pointer', color:'var(--text)', fontWeight:500 }}>
          + Schedule PPM
        </button>
        <button onClick={()=>navigate('/schedule')}
          style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 20px', fontSize:14, cursor:'pointer', color:'var(--text)', fontWeight:500 }}>
          🗺️ Dispatch Board
        </button>
        <button onClick={()=>navigate('/analytics')}
          style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 20px', fontSize:14, cursor:'pointer', color:'var(--text)', fontWeight:500 }}>
          📊 Analytics
        </button>
      </div>

      {/* Recent work orders table */}
      <div style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border)', overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:600 }}>Recent Work Orders</h3>
          <button onClick={()=>navigate('/work-orders')} style={{ background:'none', border:'none', color:'var(--green)', fontSize:13, cursor:'pointer', fontWeight:600 }}>View all →</button>
        </div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'var(--bg)' }}>
                {['Priority','Title','Store','Status','SLA'].map(h => (
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', color:'var(--text3)', fontWeight:600, fontSize:11, letterSpacing:'0.05em', borderBottom:'1px solid var(--border)' }}>{h.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wos.slice(0,10).map((wo,i) => {
                const breach = slaBreached(wo)
                const STATUS_CFG = {
                  open:{bg:'#FFF3E0',text:'#E65100'}, travelling:{bg:'#E3F2FD',text:'#1565C0'},
                  arrived:{bg:'#E8EAF6',text:'#283593'}, in_progress:{bg:'#E8F5E9',text:'#1B5E20'},
                  on_hold:{bg:'#FBE9E7',text:'#BF360C'}, completed:{bg:'#F3E5F5',text:'#4A148C'},
                  closed:{bg:'#ECEFF1',text:'#455A64'},
                }
                const sc = STATUS_CFG[wo.status] || { bg:'var(--surface)', text:'var(--text)' }
                return (
                  <tr key={wo.id} onClick={()=>navigate(`/work-orders/${wo.id}`)}
                    style={{ borderBottom:'1px solid var(--border)', cursor:'pointer', transition:'background 0.1s' }}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                  >
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ background:P_COLORS[wo.priority]+'22', color:P_COLORS[wo.priority], border:`1px solid ${P_COLORS[wo.priority]}`, borderRadius:20, padding:'2px 10px', fontSize:11, fontWeight:700 }}>{wo.priority}</span>
                    </td>
                    <td style={{ padding:'12px 16px', color:'var(--text)', fontWeight:500, maxWidth:280, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{wo.title}</td>
                    <td style={{ padding:'12px 16px', color:'var(--text2)', fontSize:12 }}>{wo.stores?.name?.split('-').pop().trim() || '—'}</td>
                    <td style={{ padding:'12px 16px' }}>
                      <span style={{ background:sc.bg, color:sc.text, borderRadius:20, padding:'3px 10px', fontSize:11, fontWeight:600 }}>{wo.status?.replace('_',' ')}</span>
                    </td>
                    <td style={{ padding:'12px 16px' }}>
                      {breach
                        ? <span style={{ background:'#E24B4A', color:'white', borderRadius:8, padding:'3px 10px', fontSize:11, fontWeight:600 }}>⚠ SLA Breached</span>
                        : <span style={{ background:'#E8F5E9', color:'#1B5E20', borderRadius:8, padding:'3px 10px', fontSize:11 }}>✓ On track</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MODALS ── */}

      {/* TOTAL WORK ORDERS */}
      {modal === 'total' && (
        <Modal title="All Work Orders" subtitle={`${wos.length} total · Click any row to open`} onClose={()=>setModal(null)}>
          {/* Filter */}
          <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
            {['all','open','in_progress','completed','closed','on_hold'].map(f=>(
              <button key={f} onClick={()=>setWoFilter(f)} style={{
                padding:'5px 14px', borderRadius:20, border:'1px solid var(--border)', cursor:'pointer', fontSize:12,
                background: woFilter===f?'var(--green)':'var(--surface)',
                color: woFilter===f?'white':'var(--text)', fontWeight: woFilter===f?600:400,
              }}>{f==='all'?`All (${wos.length})`:f.replace('_',' ') + ` (${wos.filter(w=>w.status===f).length})`}</button>
            ))}
          </div>

          {/* By priority bar chart */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:10 }}>By priority</div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={byPriority(wos.filter(w=>woFilter==='all'||w.status===woFilter))} margin={{top:0,right:0,left:-20,bottom:0}}>
                <XAxis dataKey="priority" tick={{fontSize:12,fill:'var(--text3)'}}/>
                <YAxis tick={{fontSize:11,fill:'var(--text3)'}}/>
                <Tooltip content={<ChartTip/>}/>
                <Bar dataKey="count" name="Work Orders" radius={[6,6,0,0]}>
                  {byPriority(wos).map((e,i)=><Cell key={i} fill={e.color}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* By store */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:10 }}>By branch (top 8)</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byStore(wos.filter(w=>woFilter==='all'||w.status===woFilter))} layout="vertical" margin={{top:0,right:10,left:0,bottom:0}}>
                <XAxis type="number" tick={{fontSize:11,fill:'var(--text3)'}}/>
                <YAxis type="category" dataKey="store" tick={{fontSize:11,fill:'var(--text3)'}} width={100}/>
                <Tooltip content={<ChartTip/>}/>
                <Bar dataKey="count" name="WOs" fill="#378ADD" radius={[0,6,6,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* 7-day trend */}
          <div>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:10 }}>Last 7 days</div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={last7days(wos)} margin={{top:0,right:10,left:-20,bottom:0}}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)"/>
                <XAxis dataKey="label" tick={{fontSize:10,fill:'var(--text3)'}}/>
                <YAxis tick={{fontSize:11,fill:'var(--text3)'}}/>
                <Tooltip content={<ChartTip/>}/>
                <Legend wrapperStyle={{fontSize:11}}/>
                <Line type="monotone" dataKey="created" name="Created" stroke="#378ADD" strokeWidth={2} dot={{r:4}}/>
                <Line type="monotone" dataKey="closed" name="Closed" stroke="#1D9E75" strokeWidth={2} dot={{r:4}}/>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Modal>
      )}

      {/* OPEN WORK ORDERS */}
      {modal === 'open' && (
        <Modal title="Open Work Orders" subtitle={`${open.length} active · ${breached.filter(w=>open.includes(w)).length} SLA breached`} onClose={()=>setModal(null)}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
            {['P1','P2','P3','P4'].map(p=>{
              const pWos = open.filter(w=>w.priority===p)
              const pb   = pWos.filter(slaBreached).length
              return (
                <div key={p} style={{ padding:'14px 16px', background:P_COLORS[p]+'18', border:`1px solid ${P_COLORS[p]}44`, borderRadius:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontWeight:700, color:P_COLORS[p], fontSize:15 }}>{p}</span>
                    <span style={{ fontSize:22, fontWeight:700, color:P_COLORS[p] }}>{pWos.length}</span>
                  </div>
                  <div style={{ fontSize:11, color:P_COLORS[p], marginTop:4, opacity:0.8 }}>
                    SLA: {SLA_HOURS[p]}h · {pb > 0 ? `⚠ ${pb} breached` : '✓ On track'}
                  </div>
                </div>
              )
            })}
          </div>

          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:10 }}>Open by branch</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byStore(open)} layout="vertical" margin={{top:0,right:10,left:0,bottom:0}}>
                <XAxis type="number" tick={{fontSize:11,fill:'var(--text3)'}} allowDecimals={false}/>
                <YAxis type="category" dataKey="store" tick={{fontSize:11,fill:'var(--text3)'}} width={100}/>
                <Tooltip content={<ChartTip/>}/>
                <Bar dataKey="count" name="Open WOs" fill="#EF9F27" radius={[0,6,6,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* List */}
          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:10 }}>Open work orders</div>
          <div style={{ display:'grid', gap:6 }}>
            {open.map(wo=>{
              const b = slaBreached(wo)
              const hrs = ((Date.now()-new Date(wo.created_at))/3600000).toFixed(1)
              return (
                <div key={wo.id} onClick={()=>{setModal(null);navigate(`/work-orders/${wo.id}`)}}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--bg)', borderRadius:9, border:'1px solid var(--border)', cursor:'pointer' }}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--surface)'}
                  onMouseLeave={e=>e.currentTarget.style.background='var(--bg)'}
                >
                  <span style={{ background:P_COLORS[wo.priority]+'22', color:P_COLORS[wo.priority], border:`1px solid ${P_COLORS[wo.priority]}`, borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:700, flexShrink:0 }}>{wo.priority}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:500, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{wo.title}</div>
                    <div style={{ fontSize:11, color:'var(--text3)' }}>{wo.stores?.name?.split('-').pop().trim()} · {hrs}h ago</div>
                  </div>
                  {b && <span style={{ background:'#E24B4A', color:'white', borderRadius:7, padding:'2px 9px', fontSize:11, fontWeight:600, flexShrink:0 }}>Breached</span>}
                </div>
              )
            })}
          </div>
        </Modal>
      )}

      {/* IN PROGRESS */}
      {modal === 'progress' && (
        <Modal title="In Progress" subtitle={`${inProgress.length} work orders currently being worked on`} onClose={()=>setModal(null)}>
          <div style={{ marginBottom:20 }}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={byPriority(inProgress)} margin={{top:0,right:0,left:-20,bottom:0}}>
                <XAxis dataKey="priority" tick={{fontSize:12,fill:'var(--text3)'}}/>
                <YAxis tick={{fontSize:11,fill:'var(--text3)'}} allowDecimals={false}/>
                <Tooltip content={<ChartTip/>}/>
                <Bar dataKey="count" name="In Progress" radius={[6,6,0,0]}>
                  {byPriority(inProgress).map((e,i)=><Cell key={i} fill={e.color}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {inProgress.length === 0
            ? <div style={{ textAlign:'center', color:'var(--text3)', padding:40 }}>No work orders in progress</div>
            : inProgress.map(wo=>(
              <div key={wo.id} onClick={()=>{setModal(null);navigate(`/work-orders/${wo.id}`)}}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', background:'#E3F2FD', border:'1px solid #378ADD44', borderRadius:10, marginBottom:8, cursor:'pointer' }}>
                <span style={{ background:P_COLORS[wo.priority]+'22', color:P_COLORS[wo.priority], border:`1px solid ${P_COLORS[wo.priority]}`, borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:700 }}>{wo.priority}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:500, fontSize:13 }}>{wo.title}</div>
                  <div style={{ fontSize:11, color:'#1565C0' }}>{wo.stores?.name?.split('-').pop().trim()}</div>
                </div>
                <span style={{ fontSize:11, color:'#1565C0' }}>Open →</span>
              </div>
            ))
          }
        </Modal>
      )}

      {/* ASSETS */}
      {modal === 'assets' && (
        <AssetModal onClose={()=>setModal(null)} navigate={navigate}/>
      )}

      {/* PPM */}
      {modal === 'ppm' && (
        <PpmModal onClose={()=>setModal(null)} navigate={navigate}/>
      )}

      {/* CLOSED */}
      {modal === 'closed' && (
        <Modal title="Closed Work Orders" subtitle={`${allClosed.length} total closed · ${closedToday.length} today`} onClose={()=>setModal(null)}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:20 }}>
            {[['Today', closedToday.length,'#1D9E75'],['This week', allClosed.filter(w=>new Date(w.updated_at)>new Date(Date.now()-7*86400000)).length,'#378ADD'],['Total',allClosed.length,'#7F77DD']].map(([l,v,c])=>(
              <div key={l} style={{ textAlign:'center', padding:14, background:c+'18', border:`1px solid ${c}44`, borderRadius:12 }}>
                <div style={{ fontSize:26, fontWeight:700, color:c }}>{v}</div>
                <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:10 }}>Closed by priority</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={byPriority(allClosed)} margin={{top:0,right:0,left:-20,bottom:0}}>
                <XAxis dataKey="priority" tick={{fontSize:12,fill:'var(--text3)'}}/>
                <YAxis tick={{fontSize:11,fill:'var(--text3)'}} allowDecimals={false}/>
                <Tooltip content={<ChartTip/>}/>
                <Bar dataKey="count" name="Closed" radius={[6,6,0,0]}>
                  {byPriority(allClosed).map((e,i)=><Cell key={i} fill={e.color}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:10 }}>Recently closed</div>
          {allClosed.slice(0,8).map(wo=>(
            <div key={wo.id} onClick={()=>{setModal(null);navigate(`/work-orders/${wo.id}`)}}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--bg)', borderRadius:9, border:'1px solid var(--border)', marginBottom:6, cursor:'pointer' }}>
              <span style={{ background:P_COLORS[wo.priority]+'22', color:P_COLORS[wo.priority], border:`1px solid ${P_COLORS[wo.priority]}`, borderRadius:20, padding:'2px 9px', fontSize:11, fontWeight:700 }}>{wo.priority}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:500, fontSize:13 }}>{wo.title}</div>
                <div style={{ fontSize:11, color:'var(--text3)' }}>{wo.stores?.name?.split('-').pop().trim()} · {new Date(wo.updated_at).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </Modal>
      )}
    </div>
  )
}

// ── Assets modal (separate component to load data) ────────────────────────────
function AssetModal({ onClose, navigate }) {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(()=>{
    supabase.from('assets').select('*,stores(name)').order('name').then(({data})=>{ setAssets(data||[]); setLoading(false) })
  },[])

  const cats = [...new Set(assets.map(a=>a.category||'Other'))]
  const shown = filter==='all' ? assets : assets.filter(a=>(a.category||'Other')===filter)

  const catData = cats.map(c=>({ cat:c, count:assets.filter(a=>(a.category||'Other')===c).length }))
  const COLORS = ['#378ADD','#1D9E75','#EF9F27','#E24B4A','#7F77DD','#E85D8A']

  return (
    <Modal title="Assets" subtitle={`${assets.length} registered assets`} onClose={onClose}>
      {loading ? <div style={{textAlign:'center',color:'var(--text3)',padding:40}}>Loading…</div> : <>
        <div style={{ marginBottom:20 }}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={catData} dataKey="count" nameKey="cat" cx="50%" cy="50%" outerRadius={80} label={({cat,count})=>`${cat} (${count})`} labelLine={false}>
                {catData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
              </Pie>
              <Tooltip content={<ChartTip/>}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:14 }}>
          {['all',...cats].map(c=>(
            <button key={c} onClick={()=>setFilter(c)} style={{ padding:'4px 12px', borderRadius:20, border:'1px solid var(--border)', cursor:'pointer', fontSize:12, background:filter===c?'var(--green)':'var(--surface)', color:filter===c?'white':'var(--text)' }}>
              {c==='all'?'All':c} ({c==='all'?assets.length:assets.filter(a=>(a.category||'Other')===c).length})
            </button>
          ))}
        </div>
        <div style={{ display:'grid', gap:5 }}>
          {shown.slice(0,20).map(a=>(
            <div key={a.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px', background:'var(--bg)', borderRadius:9, border:'1px solid var(--border)' }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:500, fontSize:13 }}>{a.name}</div>
                <div style={{ fontSize:11, color:'var(--text3)' }}>{a.category||'—'} · {a.stores?.name?.split('-').pop().trim()||'—'}</div>
              </div>
              <span style={{ fontSize:11, background:a.status==='active'?'#E8F5E9':a.status==='faulty'?'#FBE9E7':'var(--surface)', color:a.status==='active'?'#1B5E20':a.status==='faulty'?'#BF360C':'var(--text3)', borderRadius:20, padding:'2px 10px' }}>{a.status||'active'}</span>
            </div>
          ))}
          {shown.length > 20 && <div style={{ textAlign:'center', color:'var(--text3)', fontSize:12, padding:10 }}>+{shown.length-20} more assets</div>}
        </div>
      </>}
    </Modal>
  )
}

// ── PPM modal ─────────────────────────────────────────────────────────────────
function PpmModal({ onClose, navigate }) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(()=>{
    supabase.from('ppm_tasks').select('*,stores(name)').order('due_date').then(({data})=>{ setTasks(data||[]); setLoading(false) })
  },[])

  const due7  = tasks.filter(t=>t.status!=='done'&&new Date(t.due_date)<=new Date(Date.now()+7*86400000))
  const overdue= tasks.filter(t=>t.status!=='done'&&new Date(t.due_date)<new Date())
  const done   = tasks.filter(t=>t.status==='done')

  return (
    <Modal title="PPM Schedule" subtitle={`${tasks.length} total · ${due7.length} due this week`} onClose={onClose}>
      {loading ? <div style={{textAlign:'center',color:'var(--text3)',padding:40}}>Loading…</div> : <>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:20 }}>
          {[['Due this week',due7.length,'#EF9F27'],['Overdue',overdue.length,'#E24B4A'],['Completed',done.length,'#1D9E75']].map(([l,v,c])=>(
            <div key={l} style={{ textAlign:'center', padding:14, background:c+'18', border:`1px solid ${c}44`, borderRadius:12 }}>
              <div style={{ fontSize:26, fontWeight:700, color:c }}>{v}</div>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize:13, fontWeight:600, marginBottom:10, color:'var(--text)' }}>Due soon</div>
        {due7.length===0 ? <div style={{color:'var(--text3)',fontSize:13,textAlign:'center',padding:20}}>No PPM tasks due this week</div>
          : due7.map(t=>{
            const isOver = new Date(t.due_date)<new Date()
            return (
              <div key={t.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:isOver?'#FBE9E7':'var(--bg)', borderRadius:9, border:`1px solid ${isOver?'#E24B4A44':'var(--border)'}`, marginBottom:6 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:500, fontSize:13 }}>{t.title}</div>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>{t.stores?.name?.split('-').pop().trim()||'—'} · Due: {new Date(t.due_date).toLocaleDateString()}</div>
                </div>
                {isOver && <span style={{ background:'#E24B4A', color:'white', borderRadius:7, padding:'2px 9px', fontSize:11, fontWeight:600 }}>Overdue</span>}
              </div>
            )
          })
        }
      </>}
    </Modal>
  )
}
