import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const P_COLORS = { P1:'#E24B4A', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }
const SLA_HOURS = { P1:4, P2:8, P3:12, P4:168 }

function slaBreached(wo) {
  if (!wo.created_at) return false
  if (['closed','completed'].includes(wo.status)) return false
  const hours = (Date.now() - new Date(wo.created_at)) / 3600000
  return hours > (SLA_HOURS[wo.priority] || 24)
}

const STATUS_CFG = {
  open:        { bg:'#FFF3E0', text:'#E65100' },
  travelling:  { bg:'#E3F2FD', text:'#1565C0' },
  arrived:     { bg:'#E8EAF6', text:'#283593' },
  in_progress: { bg:'#E8F5E9', text:'#1B5E20' },
  on_hold:     { bg:'#FBE9E7', text:'#BF360C' },
  completed:   { bg:'#F3E5F5', text:'#4A148C' },
  closed:      { bg:'#ECEFF1', text:'#455A64' },
}

// ── CSS Bar chart (no dependency) ────────────────────────────────────────────
function CSSBarChart({ data, dataKey, labelKey, color='#378ADD', maxH=160 }) {
  if (!data?.length) return <div style={{color:'var(--text3)',fontSize:13,textAlign:'center',padding:20}}>No data</div>
  const max = Math.max(...data.map(d=>d[dataKey]), 1)
  return (
    <div style={{display:'flex',alignItems:'flex-end',gap:8,height:maxH,padding:'0 4px'}}>
      {data.map((d,i) => {
        const h = Math.max(4, (d[dataKey]/max)*maxH*0.85)
        const c = Array.isArray(color) ? color[i] : color
        return (
          <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4,height:'100%',justifyContent:'flex-end'}}>
            <div style={{fontSize:11,fontWeight:600,color:c}}>{d[dataKey]||''}</div>
            <div title={`${d[labelKey]}: ${d[dataKey]}`} style={{
              width:'100%',height:h,background:c,borderRadius:'6px 6px 0 0',
              minWidth:20,transition:'height 0.3s',cursor:'default',
            }}/>
            <div style={{fontSize:10,color:'var(--text3)',textAlign:'center',lineHeight:1.2,maxWidth:60,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={d[labelKey]}>
              {d[labelKey]}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Horizontal bar ────────────────────────────────────────────────────────────
function HBar({ label, value, max, color='#378ADD', total }) {
  const pct = max > 0 ? (value/max)*100 : 0
  const pctOfTotal = total > 0 ? ((value/total)*100).toFixed(0) : 0
  return (
    <div style={{marginBottom:10}}>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,fontSize:12}}>
        <span style={{color:'var(--text)',fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:200}} title={label}>{label}</span>
        <span style={{color:'var(--text3)',flexShrink:0,marginLeft:8}}>{value} <span style={{color:'var(--text3)',fontSize:10}}>({pctOfTotal}%)</span></span>
      </div>
      <div style={{height:8,background:'var(--border)',borderRadius:4,overflow:'hidden'}}>
        <div style={{height:'100%',width:`${pct}%`,background:color,borderRadius:4,transition:'width 0.4s'}}/>
      </div>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const esc = e => { if (e.key==='Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [])

  return (
    <div onClick={e=>{if(e.target===e.currentTarget)onClose()}} style={{
      position:'fixed',inset:0,background:'rgba(0,0,0,0.55)',
      zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:20,
    }}>
      <div style={{
        background:'var(--surface)',borderRadius:16,width:'100%',maxWidth:800,
        maxHeight:'90vh',overflow:'hidden',display:'flex',flexDirection:'column',
        boxShadow:'0 8px 40px rgba(0,0,0,0.3)',
      }}>
        <div style={{padding:'20px 24px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'flex-start',flexShrink:0}}>
          <div>
            <h2 style={{margin:0,fontSize:18,fontWeight:700,color:'var(--text)'}}>{title}</h2>
            {subtitle && <p style={{margin:'4px 0 0',fontSize:13,color:'var(--text3)'}}>{subtitle}</p>}
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:24,cursor:'pointer',color:'var(--text3)',lineHeight:1,padding:'0 4px'}}>×</button>
        </div>
        <div style={{overflowY:'auto',padding:'20px 24px',flex:1}}>{children}</div>
      </div>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, color, bg, border, onClick, icon, sub }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div onClick={onClick}
      onMouseEnter={()=>setHovered(true)}
      onMouseLeave={()=>setHovered(false)}
      style={{
        background: bg||'var(--surface)',
        border:`1px solid ${border||'var(--border)'}`,
        borderRadius:14,padding:'20px 22px',cursor:'pointer',
        transform: hovered ? 'translateY(-3px)' : 'none',
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.12)' : 'none',
        transition:'transform 0.15s,box-shadow 0.15s',
        position:'relative',
      }}
    >
      <div style={{fontSize:11,color:color||'var(--text3)',fontWeight:700,letterSpacing:'0.06em',marginBottom:8}}>
        {icon} {label}
      </div>
      <div style={{fontSize:34,fontWeight:700,color:color||'var(--text)',marginBottom:4}}>{value}</div>
      {sub && <div style={{fontSize:12,color:'var(--text3)'}}>{sub}</div>}
      <div style={{position:'absolute',bottom:10,right:14,fontSize:11,color:color||'var(--text3)',opacity:hovered?1:0.5,transition:'opacity 0.15s'}}>
        View details →
      </div>
    </div>
  )
}

// ── WO list item ──────────────────────────────────────────────────────────────
function WOItem({ wo, onClick, showBreached=true }) {
  const breach = slaBreached(wo)
  const hrs    = ((Date.now()-new Date(wo.created_at))/3600000).toFixed(1)
  const sc     = STATUS_CFG[wo.status] || { bg:'var(--surface)', text:'var(--text3)' }
  return (
    <div onClick={onClick} style={{
      display:'flex',alignItems:'center',gap:10,padding:'11px 14px',
      background:'var(--bg)',borderRadius:9,border:'1px solid var(--border)',
      marginBottom:6,cursor:'pointer',
    }}
      onMouseEnter={e=>e.currentTarget.style.background='var(--surface)'}
      onMouseLeave={e=>e.currentTarget.style.background='var(--bg)'}
    >
      <span style={{background:P_COLORS[wo.priority]+'22',color:P_COLORS[wo.priority],border:`1px solid ${P_COLORS[wo.priority]}`,borderRadius:20,padding:'2px 9px',fontSize:11,fontWeight:700,flexShrink:0}}>{wo.priority}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:500,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{wo.title}</div>
        <div style={{fontSize:11,color:'var(--text3)',marginTop:2}}>
          {wo.stores?.name?.split('-').pop().trim()||'—'} · {hrs}h ago
        </div>
      </div>
      <span style={{background:sc.bg,color:sc.text,borderRadius:20,padding:'3px 10px',fontSize:11,fontWeight:600,flexShrink:0}}>{wo.status?.replace('_',' ')}</span>
      {showBreached && breach && (
        <span style={{background:'#E24B4A',color:'white',borderRadius:7,padding:'2px 9px',fontSize:11,fontWeight:600,flexShrink:0}}>Breached</span>
      )}
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { profile } = useAuth()
  const navigate    = useNavigate()

  const [wos,     setWos]     = useState([])
  const [assets,  setAssets]  = useState([])
  const [ppmTasks,setPpmTasks]= useState([])
  const [loading, setLoading] = useState(true)
  const [modal,   setModal]   = useState(null)
  const [woFilter,setWoFilter]= useState('all')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      // Fetch each query individually so one failure doesn't block others
      const woRes = await supabase.from('work_orders').select('*,stores(name)').order('created_at',{ascending:false})
      setWos(woRes.data || [])

      const assetRes = await supabase.from('assets').select('id,name,category,status,store_id,stores(name)')
      setAssets(assetRes.data || [])

      const ppmRes = await supabase.from('ppm_tasks').select('id,title,due_date,status,store_id,stores(name)').order('due_date')
      setPpmTasks(ppmRes.data || [])

    } catch(e) {
      // partial data already set above
    } finally {
      setLoading(false)
    }
  }

  // Derived
  const open        = wos.filter(w=>['open','travelling','arrived'].includes(w.status))
  const inProgress  = wos.filter(w=>w.status==='in_progress')
  const allClosed   = wos.filter(w=>w.status==='closed')
  const closedToday = allClosed.filter(w=>new Date(w.updated_at).toDateString()===new Date().toDateString())
  const breached    = wos.filter(slaBreached)
  const ppmDue      = ppmTasks.filter(t=>t.status!=='done'&&new Date(t.due_date)<=new Date(Date.now()+7*86400000))
  const ppmOverdue  = ppmTasks.filter(t=>t.status!=='done'&&new Date(t.due_date)<new Date())

  // Chart helpers
  function groupBy(list, keyFn, label='label') {
    const map = {}
    list.forEach(x=>{ const k=keyFn(x)||'Other'; map[k]=(map[k]||0)+1 })
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([k,v])=>({[label]:k,count:v}))
  }

  const priorityData = ['P1','P2','P3','P4'].map(p=>({
    label:p, count: wos.filter(w=>w.priority===p).length, color:P_COLORS[p]
  }))

  const filteredWos = woFilter==='all' ? wos : wos.filter(w=>w.status===woFilter)
  const storeData   = groupBy(filteredWos, w=>w.stores?.name?.split('-').pop().trim(), 'label').slice(0,8)

  const statusData = ['open','in_progress','on_hold','completed','closed'].map(s=>({
    label:s.replace('_',' '), count:wos.filter(w=>w.status===s).length
  }))

  const catData  = groupBy(assets, a=>a.category||'Other', 'label')
  const assetMax = Math.max(...catData.map(d=>d.count),1)

  const avgRes = () => {
    const cl = allClosed.filter(w=>w.created_at&&w.updated_at)
    if (!cl.length) return 'N/A'
    const avgH = cl.reduce((s,w)=>(s+(new Date(w.updated_at)-new Date(w.created_at))/3600000),0)/cl.length
    return avgH < 24 ? avgH.toFixed(1)+'h' : (avgH/24).toFixed(1)+'d'
  }

  const hour = new Date().getHours()
  const greeting = hour<12?'Good morning':hour<17?'Good afternoon':'Good evening'

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh',color:'var(--text3)',fontSize:14}}>
      Loading dashboard…
    </div>
  )

  return (
    <div style={{color:'var(--text)'}}>

      {/* Header */}
      <div style={{marginBottom:28}}>
        <h2 style={{margin:0,fontSize:24,fontWeight:700}}>{greeting}, {profile?.full_name?.split(' ')[0]} 👋</h2>
        <p style={{margin:'6px 0 0',color:'var(--text3)',fontSize:14}}>Here's what's happening with your facilities today</p>
      </div>

      {/* Stat cards */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:14,marginBottom:28}}>
        <StatCard label="Total Work Orders" value={wos.length} icon="📋"
          sub={`Avg resolution: ${avgRes()}`}
          onClick={()=>setModal('total')}/>
        <StatCard label="Open" value={open.length} icon="🔓"
          color="#E65100" bg="#FFF3E0" border="#EF9F2766"
          sub={`${breached.filter(w=>['open','travelling','arrived'].includes(w.status)).length} SLA breached`}
          onClick={()=>setModal('open')}/>
        <StatCard label="In Progress" value={inProgress.length} icon="⚙️"
          color="#1565C0" bg="#E3F2FD" border="#378ADD66"
          sub="Currently being worked"
          onClick={()=>setModal('progress')}/>
        <StatCard label="Assets" value={assets.length} icon="🔧"
          color="#1B5E20" bg="#E8F5E9" border="#1D9E7566"
          sub={`${catData.length} categories`}
          onClick={()=>setModal('assets')}/>
        <StatCard label="PPM Due (7 days)" value={ppmDue.length} icon="📅"
          color="#BF360C" bg="#FBE9E7" border="#E24B4A66"
          sub={ppmOverdue.length>0?`⚠️ ${ppmOverdue.length} overdue`:'All on schedule'}
          onClick={()=>setModal('ppm')}/>
        <StatCard label="Closed Today" value={closedToday.length} icon="✅"
          color="#4A148C" bg="#F3E5F5" border="#9C27B066"
          sub={`${allClosed.length} total closed`}
          onClick={()=>setModal('closed')}/>
      </div>

      {/* Quick actions */}
      <div style={{display:'flex',gap:10,marginBottom:28,flexWrap:'wrap'}}>
        <button onClick={()=>navigate('/work-orders')} style={{background:'var(--green)',color:'white',border:'none',borderRadius:10,padding:'10px 22px',fontSize:14,cursor:'pointer',fontWeight:600}}>+ New Work Order</button>
        <button onClick={()=>navigate('/ppm')} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 20px',fontSize:14,cursor:'pointer',color:'var(--text)'}}>+ Schedule PPM</button>
        <button onClick={()=>navigate('/schedule')} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 20px',fontSize:14,cursor:'pointer',color:'var(--text)'}}>🗺️ Dispatch Board</button>
        <button onClick={()=>navigate('/analytics')} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 20px',fontSize:14,cursor:'pointer',color:'var(--text)'}}>📊 Full Analytics</button>
      </div>

      {/* Recent WOs table */}
      <div style={{background:'var(--surface)',borderRadius:14,border:'1px solid var(--border)',overflow:'hidden'}}>
        <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <h3 style={{margin:0,fontSize:16,fontWeight:600}}>Recent Work Orders</h3>
          <button onClick={()=>navigate('/work-orders')} style={{background:'none',border:'none',color:'var(--green)',fontSize:13,cursor:'pointer',fontWeight:600}}>View all →</button>
        </div>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{background:'var(--bg)'}}>
                {['Priority','Title','Store','Status','SLA'].map(h=>(
                  <th key={h} style={{padding:'10px 16px',textAlign:'left',color:'var(--text3)',fontWeight:600,fontSize:11,letterSpacing:'0.05em',borderBottom:'1px solid var(--border)'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {wos.slice(0,10).map(wo => {
                const breach = slaBreached(wo)
                const sc = STATUS_CFG[wo.status]||{bg:'var(--surface)',text:'var(--text3)'}
                return (
                  <tr key={wo.id} onClick={()=>navigate(`/work-orders/${wo.id}`)} style={{borderBottom:'1px solid var(--border)',cursor:'pointer'}}
                    onMouseEnter={e=>e.currentTarget.style.background='var(--bg)'}
                    onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                  >
                    <td style={{padding:'12px 16px'}}><span style={{background:P_COLORS[wo.priority]+'22',color:P_COLORS[wo.priority],border:`1px solid ${P_COLORS[wo.priority]}`,borderRadius:20,padding:'2px 10px',fontSize:11,fontWeight:700}}>{wo.priority}</span></td>
                    <td style={{padding:'12px 16px',color:'var(--text)',fontWeight:500,maxWidth:280,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{wo.title}</td>
                    <td style={{padding:'12px 16px',color:'var(--text2)',fontSize:12}}>{wo.stores?.name?.split('-').pop().trim()||'—'}</td>
                    <td style={{padding:'12px 16px'}}><span style={{background:sc.bg,color:sc.text,borderRadius:20,padding:'3px 10px',fontSize:11,fontWeight:600}}>{wo.status?.replace('_',' ')}</span></td>
                    <td style={{padding:'12px 16px'}}>
                      {breach
                        ? <span style={{background:'#E24B4A',color:'white',borderRadius:8,padding:'3px 10px',fontSize:11,fontWeight:600}}>⚠ Breached</span>
                        : <span style={{background:'#E8F5E9',color:'#1B5E20',borderRadius:8,padding:'3px 10px',fontSize:11}}>✓ On track</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ MODALS ═══ */}

      {/* TOTAL */}
      {modal==='total' && (
        <Modal title="All Work Orders" subtitle={`${wos.length} total · Avg resolution: ${avgRes()}`} onClose={()=>setModal(null)}>
          {/* Filter tabs */}
          <div style={{display:'flex',gap:6,marginBottom:20,flexWrap:'wrap'}}>
            {['all','open','in_progress','on_hold','completed','closed'].map(f=>(
              <button key={f} onClick={()=>setWoFilter(f)} style={{
                padding:'5px 14px',borderRadius:20,border:'1px solid var(--border)',cursor:'pointer',fontSize:12,
                background:woFilter===f?'var(--green)':'var(--surface)',
                color:woFilter===f?'white':'var(--text)',fontWeight:woFilter===f?600:400,
              }}>
                {f==='all'?`All (${wos.length})`:`${f.replace('_',' ')} (${wos.filter(w=>w.status===f).length})`}
              </button>
            ))}
          </div>
          {/* By priority */}
          <div style={{marginBottom:24}}>
            <div style={{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:12}}>By priority</div>
            <CSSBarChart data={byPriorityFiltered(filteredWos)} dataKey="count" labelKey="label" color={['#E24B4A','#EF9F27','#378ADD','#1D9E75']}/>
          </div>
          {/* By status */}
          <div style={{marginBottom:24}}>
            <div style={{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:12}}>By status</div>
            {statusData.map(s=>(
              <HBar key={s.label} label={s.label} value={s.count} max={Math.max(...statusData.map(x=>x.count),1)} total={wos.length} color="#7F77DD"/>
            ))}
          </div>
          {/* By store */}
          <div style={{marginBottom:20}}>
            <div style={{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:12}}>By branch (top 8)</div>
            {storeData.map((s,i)=>(
              <HBar key={i} label={s.label} value={s.count} max={Math.max(...storeData.map(x=>x.count),1)} total={filteredWos.length} color="#378ADD"/>
            ))}
          </div>
          {/* List */}
          <div style={{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:10}}>Work orders</div>
          {filteredWos.slice(0,15).map(wo=>(
            <WOItem key={wo.id} wo={wo} onClick={()=>{setModal(null);navigate(`/work-orders/${wo.id}`)}}/>
          ))}
          {filteredWos.length>15&&<div style={{textAlign:'center',color:'var(--text3)',fontSize:12,padding:10}}>+{filteredWos.length-15} more · <span style={{cursor:'pointer',color:'var(--green)'}} onClick={()=>navigate('/work-orders')}>View all →</span></div>}
        </Modal>
      )}

      {/* OPEN */}
      {modal==='open' && (
        <Modal title="Open Work Orders" subtitle={`${open.length} active · ${breached.filter(w=>open.includes(w)).length} SLA breached`} onClose={()=>setModal(null)}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:24}}>
            {['P1','P2','P3','P4'].map(p=>{
              const pWos=open.filter(w=>w.priority===p)
              const pb=pWos.filter(slaBreached).length
              return (
                <div key={p} style={{padding:'16px',background:P_COLORS[p]+'18',border:`1px solid ${P_COLORS[p]}44`,borderRadius:12}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                    <span style={{fontWeight:700,color:P_COLORS[p],fontSize:16}}>{p}</span>
                    <span style={{fontSize:26,fontWeight:700,color:P_COLORS[p]}}>{pWos.length}</span>
                  </div>
                  <div style={{fontSize:12,color:P_COLORS[p],opacity:0.85}}>SLA: {SLA_HOURS[p]}h limit</div>
                  <div style={{fontSize:12,color:pb>0?'#E24B4A':P_COLORS[p],marginTop:4,fontWeight:pb>0?600:400}}>
                    {pb>0?`⚠ ${pb} breached`:'✓ All on track'}
                  </div>
                </div>
              )
            })}
          </div>
          <div style={{marginBottom:20}}>
            <div style={{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:12}}>Open by branch</div>
            {groupBy(open,w=>w.stores?.name?.split('-').pop().trim(),'label').slice(0,8).map((s,i)=>(
              <HBar key={i} label={s.label} value={s.count} max={Math.max(...groupBy(open,w=>w.stores?.name?.split('-').pop().trim(),'label').map(x=>x.count),1)} total={open.length} color="#EF9F27"/>
            ))}
          </div>
          <div style={{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:10}}>Open work orders</div>
          {open.map(wo=>(
            <WOItem key={wo.id} wo={wo} onClick={()=>{setModal(null);navigate(`/work-orders/${wo.id}`)}}/>
          ))}
          {open.length===0&&<div style={{textAlign:'center',color:'var(--text3)',padding:30}}>No open work orders 🎉</div>}
        </Modal>
      )}

      {/* IN PROGRESS */}
      {modal==='progress' && (
        <Modal title="In Progress" subtitle={`${inProgress.length} work orders currently being worked on`} onClose={()=>setModal(null)}>
          <div style={{marginBottom:20}}>
            <CSSBarChart data={byPriorityFiltered(inProgress)} dataKey="count" labelKey="label" color={['#E24B4A','#EF9F27','#378ADD','#1D9E75']} maxH={140}/>
          </div>
          {inProgress.length===0
            ?<div style={{textAlign:'center',color:'var(--text3)',padding:40}}>No work orders in progress right now</div>
            :inProgress.map(wo=>(
              <div key={wo.id} onClick={()=>{setModal(null);navigate(`/work-orders/${wo.id}`)}}
                style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px',background:'#E3F2FD',border:'1px solid #378ADD44',borderRadius:10,marginBottom:8,cursor:'pointer'}}>
                <span style={{background:P_COLORS[wo.priority]+'22',color:P_COLORS[wo.priority],border:`1px solid ${P_COLORS[wo.priority]}`,borderRadius:20,padding:'2px 9px',fontSize:11,fontWeight:700}}>{wo.priority}</span>
                <div style={{flex:1}}>
                  <div style={{fontWeight:500,fontSize:13}}>{wo.title}</div>
                  <div style={{fontSize:11,color:'#1565C0'}}>{wo.stores?.name?.split('-').pop().trim()}</div>
                </div>
                <span style={{fontSize:12,color:'#1565C0',fontWeight:500}}>Open →</span>
              </div>
            ))
          }
        </Modal>
      )}

      {/* ASSETS */}
      {modal==='assets' && (
        <Modal title="Assets" subtitle={`${assets.length} registered assets across ${catData.length} categories`} onClose={()=>setModal(null)}>
          <div style={{marginBottom:20}}>
            <div style={{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:12}}>By category</div>
            <CSSBarChart data={catData} dataKey="count" labelKey="label" color="#1D9E75"/>
          </div>
          <div style={{marginBottom:20}}>
            <div style={{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:12}}>Breakdown</div>
            {catData.map((c,i)=>(
              <HBar key={i} label={c.label} value={c.count} max={Math.max(...catData.map(x=>x.count),1)} total={assets.length} color="#1D9E75"/>
            ))}
          </div>
          <div style={{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:10}}>Asset status</div>
          {['active','inactive','faulty','under_maintenance'].map(s=>{
            const cnt=assets.filter(a=>a.status===s).length
            return cnt>0?(
              <HBar key={s} label={s.replace('_',' ')} value={cnt} max={assets.length} total={assets.length} color={s==='active'?'#1D9E75':s==='faulty'?'#E24B4A':'#EF9F27'}/>
            ):null
          })}
          <div style={{marginTop:20,fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:10}}>Assets by branch (top 8)</div>
          {groupBy(assets,a=>a.stores?.name?.split('-').pop().trim()||'Unknown','label').slice(0,8).map((s,i)=>(
            <HBar key={i} label={s.label} value={s.count} max={Math.max(...groupBy(assets,a=>a.stores?.name?.split('-').pop().trim()||'Unknown','label').map(x=>x.count),1)} total={assets.length} color="#7F77DD"/>
          ))}
        </Modal>
      )}

      {/* PPM */}
      {modal==='ppm' && (
        <Modal title="PPM Schedule" subtitle={`${ppmTasks.length} total tasks · ${ppmDue.length} due this week`} onClose={()=>setModal(null)}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:24}}>
            {[['Due this week',ppmDue.length,'#EF9F27'],['Overdue',ppmOverdue.length,'#E24B4A'],['Completed',ppmTasks.filter(t=>t.status==='done').length,'#1D9E75']].map(([l,v,c])=>(
              <div key={l} style={{textAlign:'center',padding:16,background:c+'18',border:`1px solid ${c}44`,borderRadius:12}}>
                <div style={{fontSize:28,fontWeight:700,color:c}}>{v}</div>
                <div style={{fontSize:12,color:'var(--text3)',marginTop:4}}>{l}</div>
              </div>
            ))}
          </div>
          {ppmDue.length===0
            ?<div style={{textAlign:'center',color:'var(--text3)',padding:30}}>No PPM tasks due this week ✓</div>
            :<>
              <div style={{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:10}}>Due soon</div>
              {ppmDue.map(t=>{
                const over=new Date(t.due_date)<new Date()
                return (
                  <div key={t.id} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px',background:over?'#FBE9E7':'var(--bg)',border:`1px solid ${over?'#E24B4A44':'var(--border)'}`,borderRadius:9,marginBottom:6}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:500,fontSize:13}}>{t.title}</div>
                      <div style={{fontSize:11,color:'var(--text3)'}}>{t.stores?.name?.split('-').pop().trim()||'—'} · Due: {new Date(t.due_date).toLocaleDateString()}</div>
                    </div>
                    {over&&<span style={{background:'#E24B4A',color:'white',borderRadius:7,padding:'2px 9px',fontSize:11,fontWeight:600}}>Overdue</span>}
                  </div>
                )
              })}
            </>
          }
        </Modal>
      )}

      {/* CLOSED */}
      {modal==='closed' && (
        <Modal title="Closed Work Orders" subtitle={`${allClosed.length} total · ${closedToday.length} today`} onClose={()=>setModal(null)}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginBottom:24}}>
            {[
              ['Today',closedToday.length,'#1D9E75'],
              ['This week',allClosed.filter(w=>new Date(w.updated_at)>new Date(Date.now()-7*86400000)).length,'#378ADD'],
              ['All time',allClosed.length,'#7F77DD'],
            ].map(([l,v,c])=>(
              <div key={l} style={{textAlign:'center',padding:16,background:c+'18',border:`1px solid ${c}44`,borderRadius:12}}>
                <div style={{fontSize:28,fontWeight:700,color:c}}>{v}</div>
                <div style={{fontSize:12,color:'var(--text3)',marginTop:4}}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{marginBottom:24}}>
            <div style={{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:12}}>Closed by priority</div>
            <CSSBarChart data={byPriorityFiltered(allClosed)} dataKey="count" labelKey="label" color={['#E24B4A','#EF9F27','#378ADD','#1D9E75']}/>
          </div>
          <div style={{marginBottom:20}}>
            <div style={{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:12}}>Closed by branch</div>
            {groupBy(allClosed,w=>w.stores?.name?.split('-').pop().trim(),'label').slice(0,8).map((s,i)=>(
              <HBar key={i} label={s.label} value={s.count} max={Math.max(...groupBy(allClosed,w=>w.stores?.name?.split('-').pop().trim(),'label').map(x=>x.count),1)} total={allClosed.length} color="#1D9E75"/>
            ))}
          </div>
          <div style={{fontSize:13,fontWeight:600,color:'var(--text)',marginBottom:10}}>Recently closed</div>
          {allClosed.slice(0,10).map(wo=>(
            <WOItem key={wo.id} wo={wo} showBreached={false} onClick={()=>{setModal(null);navigate(`/work-orders/${wo.id}`)}}/>
          ))}
          {allClosed.length===0&&<div style={{textAlign:'center',color:'var(--text3)',padding:30}}>No closed work orders yet</div>}
        </Modal>
      )}
    </div>
  )
}

function byPriorityFiltered(list) {
  return ['P1','P2','P3','P4'].map(p=>({ label:p, count:list.filter(w=>w.priority===p).length }))
}
