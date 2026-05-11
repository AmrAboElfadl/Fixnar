import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const P_COLORS = { P1:'#E24B4A', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }
// SLA hours per priority (working hours 9am-6pm)
const SLA_HOURS = { P1:4, P2:8, P3:12, P4:63 } // P4 = 7 days * 9hrs

const STATUS_CFG = {
  open:        { bg:'#FFF3E0', text:'#E65100', border:'#EF9F27',  label:'Open' },
  travelling:  { bg:'#E3F2FD', text:'#1565C0', border:'#378ADD',  label:'On the Way' },
  arrived:     { bg:'#E8EAF6', text:'#283593', border:'#7F77DD',  label:'Arrived' },
  in_progress: { bg:'#E8F5E9', text:'#1B5E20', border:'#1D9E75',  label:'In Progress' },
  on_hold:     { bg:'#FBE9E7', text:'#BF360C', border:'#E24B4A',  label:'On Hold' },
  completed:   { bg:'#F3E5F5', text:'#4A148C', border:'#9C27B0',  label:'Completed' },
  closed:      { bg:'#ECEFF1', text:'#455A64', border:'#90A4AE',  label:'Closed' },
}

const NEXT_STATUS = {
  open:       { label:'🚗 Start Trip',    next:'travelling' },
  travelling: { label:'📍 Arrived',       next:'arrived' },
  arrived:    { label:'🔧 Start Work',    next:'in_progress' },
  in_progress:{ label:'✅ Complete',      next:'completed' },
  on_hold:    { label:'↩ Reopen',         next:'in_progress' },
  completed:  { label:'🔒 Close',         next:'closed' },
}

// Auto-schedule: sort WOs by priority, assign start times from 9am
function autoSchedule(wos, date) {
  const sorted = [...wos].sort((a,b) => {
    const order = {P1:0,P2:1,P3:2,P4:3}
    return (order[a.priority]||3) - (order[b.priority]||3)
  })
  let cursor = 9 * 60 // 9:00am in minutes
  const END = 18 * 60 // 6:00pm
  return sorted.map(wo => {
    const dur = (wo.duration_hours || 1) * 60
    const startMin = cursor
    const endMin = Math.min(cursor + dur, END)
    cursor = endMin
    const pad = n => String(n).padStart(2,'0')
    const startTime = `${pad(Math.floor(startMin/60))}:${pad(startMin%60)}`
    const endTime   = `${pad(Math.floor(endMin/60))}:${pad(endMin%60)}`
    return { ...wo, _startMin: startMin, _endMin: endMin, _startTime: startTime, _endTime: endTime }
  })
}

export default function Schedule() {
  const { profile, isAdmin, isTechnician } = useAuth()
  const navigate = useNavigate()
  const mapRef  = useRef(null)
  const mapInst = useRef(null)
  const dragWO  = useRef(null)

  const [wos,          setWos]          = useState([])
  const [techs,        setTechs]        = useState([])
  const [stores,       setStores]       = useState([])
  const [techLocs,     setTechLocs]     = useState({})
  const [loading,      setLoading]      = useState(true)
  const [view,         setView]         = useState('board')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [activeWO,     setActiveWO]     = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [holdReason,   setHoldReason]   = useState('')
  const [showHold,     setShowHold]     = useState(false)
  const [dragOver,     setDragOver]     = useState(null)

  useEffect(() => { fetchAll() }, [selectedDate])
  useEffect(() => { if (view==='map') initMap() }, [view, techLocs, stores, wos])

  async function fetchAll() {
    setLoading(true)
    const [woRes, techRes, storeRes] = await Promise.all([
      supabase.from('work_orders').select('*,stores(name,latitude,longitude,manager_name,phone),assets(name)').neq('status','closed').order('priority'),
      supabase.from('profiles').select('id,full_name,phone').eq('role','technician'),
      supabase.from('stores').select('id,name,latitude,longitude,manager_name,phone'),
    ])
    // Try tech locations
    let locs = {}
    try {
      const locRes = await supabase.from('technician_locations').select('*').gte('updated_at', new Date(Date.now()-30*60*1000).toISOString())
      ;(locRes.data||[]).forEach(l => { locs[l.technician_id] = l })
    } catch(e) {}
    setWos(woRes.data || [])
    setTechs(techRes.data || [])
    setStores(storeRes.data || [])
    setTechLocs(locs)
    setLoading(false)
  }

  async function quickStatus(wo, nextStatus) {
    if (nextStatus === 'on_hold') { setShowHold(true); return }
    setSaving(true)
    const now = new Date().toISOString()
    const patch = { status: nextStatus, updated_at: now }
    if (nextStatus === 'travelling')  patch.trip_started_at = now
    if (nextStatus === 'arrived')     patch.arrived_at = now
    if (nextStatus === 'in_progress') patch.work_started_at = now
    if (nextStatus === 'completed')   patch.completed_at = now
    if (nextStatus === 'closed')      patch.closed_at = now
    await supabase.from('work_orders').update(patch).eq('id', wo.id)
    try { await supabase.from('wo_updates').insert({ work_order_id:wo.id, user_id:profile.id, type:'status_change', content:`Status → ${nextStatus}` }) } catch(e) {}
    if (activeWO?.id === wo.id) setActiveWO(p => ({...p, status:nextStatus}))
    fetchAll(); setSaving(false)
  }

  async function submitHold(wo) {
    if (!holdReason.trim()) return
    setSaving(true)
    await supabase.from('work_orders').update({ status:'on_hold', hold_reason:holdReason, updated_at:new Date().toISOString() }).eq('id', wo.id)
    try { await supabase.from('wo_updates').insert({ work_order_id:wo.id, user_id:profile.id, type:'status_change', content:`On hold: ${holdReason}` }) } catch(e) {}
    setShowHold(false); setHoldReason('')
    if (activeWO?.id === wo.id) setActiveWO(p => ({...p, status:'on_hold'}))
    fetchAll(); setSaving(false)
  }

  async function updateWO(woId, patch) {
    await supabase.from('work_orders').update(patch).eq('id', woId)
    if (activeWO?.id === woId) setActiveWO(p => ({...p, ...patch}))
    fetchAll()
  }

  // Drag & drop reassign
  function onDragStart(wo) { dragWO.current = wo }
  function onDragOver(e, techId) { e.preventDefault(); setDragOver(techId) }
  function onDragLeave() { setDragOver(null) }
  async function onDrop(e, techId) {
    e.preventDefault(); setDragOver(null)
    if (!dragWO.current) return
    await updateWO(dragWO.current.id, { assigned_to: techId === 'unassigned' ? null : techId })
    dragWO.current = null
  }

  // Map
  function initMap() {
    if (!mapRef.current) return
    if (mapInst.current) { mapInst.current.remove(); mapInst.current = null }
    if (!window.L) {
      const link = document.createElement('link'); link.rel='stylesheet'; link.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; document.head.appendChild(link)
      const script = document.createElement('script'); script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; script.onload=renderMap; document.head.appendChild(script)
    } else renderMap()
  }
  function renderMap() {
    if (!mapRef.current || !window.L) return
    const L = window.L
    const map = L.map(mapRef.current).setView([25.2048,55.2708],10)
    mapInst.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map)
    stores.forEach(s => {
      if (!s.latitude||!s.longitude) return
      const hasWO = wos.some(w=>w.store_id===s.id)
      const icon = L.divIcon({className:'',html:`<div style="background:${hasWO?'#E24B4A':'#1D9E75'};color:white;border-radius:8px;padding:3px 8px;font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.2)">🏪 ${s.name.split('-').pop().trim()}</div>`,iconAnchor:[0,0]})
      L.marker([s.latitude,s.longitude],{icon}).addTo(map).bindPopup(`<b>${s.name}</b><br>${s.manager_name||''} ${s.phone||''}`)
    })
    techs.forEach(t => {
      const loc = techLocs[t.id]; if(!loc) return
      const icon = L.divIcon({className:'',html:`<div style="background:#7F77DD;color:white;border-radius:50%;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.3);border:2px solid white">${t.full_name.split(' ').map(w=>w[0]).join('').slice(0,2)}</div>`,iconAnchor:[19,19]})
      L.marker([loc.latitude,loc.longitude],{icon}).addTo(map).bindPopup(`<b>🔧 ${t.full_name}</b>`)
    })
    setTimeout(()=>map.invalidateSize(),100)
  }

  // Group WOs by tech and auto-schedule
  const woByTech = {}
  wos.forEach(wo => {
    const key = wo.assigned_to || 'unassigned'
    if (!woByTech[key]) woByTech[key] = []
    woByTech[key].push(wo)
  })
  // Apply auto-scheduling per technician
  Object.keys(woByTech).forEach(key => {
    woByTech[key] = autoSchedule(woByTech[key], selectedDate)
  })

  const weekDays = Array.from({length:7},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()-d.getDay()+i); return d })
  const inp = { background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px', color:'var(--text)', fontSize:12, outline:'none', width:'100%', boxSizing:'border-box' }

  // Timeline hours labels
  const HOURS_LABELS = ['9am','10am','11am','12pm','1pm','2pm','3pm','4pm','5pm','6pm']

  return (
    <div style={{fontFamily:"'DM Sans', sans-serif"}}>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <div>
          <h1 style={{color:'var(--text)',fontSize:22,fontWeight:600,margin:0}}>Dispatch Board</h1>
          <p style={{color:'var(--text3)',fontSize:13,margin:'4px 0 0'}}>{wos.length} active · {techs.length} technicians · {selectedDate.toLocaleDateString('en',{weekday:'long',month:'long',day:'numeric'})}</p>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button onClick={fetchAll} style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 14px',fontSize:12,cursor:'pointer',color:'var(--text2)'}}>↻ Refresh</button>
          <div style={{display:'flex',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,padding:3}}>
            {['board','timeline','map'].map(v=>(
              <button key={v} onClick={()=>setView(v)}
                style={{background:view===v?'#1D9E75':'transparent',color:view===v?'white':'var(--text2)',border:'none',borderRadius:6,padding:'6px 14px',fontSize:12,fontWeight:500,cursor:'pointer'}}>
                {v==='board'?'📋 Board':v==='timeline'?'⏱ Timeline':'🗺️ Map'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── BOARD VIEW ── */}
      {view==='board' && (
        <div style={{display:'flex',gap:12,overflowX:'auto'}}>
          {/* Date sidebar */}
          <div style={{minWidth:90,flexShrink:0}}>
            <div style={{height:76,marginBottom:8}}/>
            {weekDays.map((d,i)=>(
              <div key={i} onClick={()=>setSelectedDate(d)}
                style={{height:60,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',borderRadius:10,marginBottom:6,cursor:'pointer',border:`1px solid ${d.toDateString()===selectedDate.toDateString()?'#1D9E75':'var(--border)'}`,background:d.toDateString()===selectedDate.toDateString()?'#1D9E75':'var(--card-bg)',transition:'all 0.15s'}}>
                <div style={{fontSize:10,color:d.toDateString()===selectedDate.toDateString()?'rgba(255,255,255,0.8)':'var(--text3)',fontWeight:500}}>{d.toLocaleDateString('en',{weekday:'short'})}</div>
                <div style={{fontSize:20,fontWeight:600,color:d.toDateString()===selectedDate.toDateString()?'white':'var(--text)'}}>{d.getDate()}</div>
                <div style={{fontSize:10,color:d.toDateString()===selectedDate.toDateString()?'rgba(255,255,255,0.7)':'var(--text3)'}}>{d.toLocaleDateString('en',{month:'short'})}</div>
              </div>
            ))}
          </div>

          {/* Tech columns with drag & drop */}
          <div style={{flex:1,overflowX:'auto'}}>
            <div style={{display:'flex',gap:10,minWidth:(techs.length+1)*220}}>
              {[...techs,{id:'unassigned',full_name:'Unassigned'}].map(tech=>{
                const techWOs = woByTech[tech.id] || []
                const isOnline = !!techLocs[tech.id]
                const isDragTarget = dragOver===tech.id
                return (
                  <div key={tech.id} style={{flex:1,minWidth:200}}
                    onDragOver={e=>onDragOver(e,tech.id)}
                    onDragLeave={onDragLeave}
                    onDrop={e=>onDrop(e,tech.id)}>
                    {/* Tech header */}
                    <div style={{background:isDragTarget?'var(--green-bg)':'var(--card-bg)',border:`1px solid ${isDragTarget?'#1D9E75':'var(--border)'}`,borderRadius:10,padding:'10px 12px',marginBottom:8,display:'flex',alignItems:'center',gap:8,transition:'all 0.15s'}}>
                      <div style={{width:34,height:34,borderRadius:'50%',background:tech.id==='unassigned'?'#999':'#7F77DD',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:600,flexShrink:0}}>
                        {tech.id==='unassigned'?'?':tech.full_name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:'var(--text)',fontSize:13,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{tech.full_name}</div>
                        <div style={{fontSize:11,color:isOnline?'#1D9E75':'var(--text3)'}}>
                          {isOnline?'🟢 Online':'⚫ Offline'} · {techWOs.length} job{techWOs.length!==1?'s':''}
                        </div>
                      </div>
                      {isDragTarget && <div style={{fontSize:11,color:'#1D9E75',fontWeight:500}}>Drop here</div>}
                    </div>

                    {/* WO cards */}
                    {techWOs.length===0?(
                      <div style={{background:'var(--bg3)',border:'1px dashed var(--border)',borderRadius:10,padding:24,textAlign:'center',color:'var(--text3)',fontSize:12,minHeight:80,display:'flex',alignItems:'center',justifyContent:'center'}}>
                        {isDragTarget?'📥 Drop to assign':'No work orders'}
                      </div>
                    ):techWOs.map(wo=>{
                      const sc = STATUS_CFG[wo.status]||STATUS_CFG.open
                      const nx = NEXT_STATUS[wo.status]
                      return (
                        <div key={wo.id}
                          draggable
                          onDragStart={()=>onDragStart(wo)}
                          onClick={()=>setActiveWO(wo)}
                          style={{background:sc.bg,border:`1.5px solid ${sc.border}`,borderRadius:10,padding:12,marginBottom:8,cursor:'grab',transition:'transform 0.1s,box-shadow 0.1s',boxShadow:'0 1px 4px rgba(0,0,0,.06)',userSelect:'none'}}
                          onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,.1)'}}
                          onMouseLeave={e=>{e.currentTarget.style.transform='none';e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,.06)'}}>
                          <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                            <span style={{background:P_COLORS[wo.priority]+'22',color:P_COLORS[wo.priority],fontSize:10,padding:'2px 7px',borderRadius:5,fontWeight:700}}>{wo.priority}</span>
                            <span style={{color:sc.text,fontSize:10,fontWeight:500}}>{sc.label}</span>
                          </div>
                          <div style={{color:sc.text,fontSize:12,fontWeight:500,marginBottom:3,lineHeight:1.4}}>{wo.title}</div>
                          <div style={{color:sc.text,fontSize:11,opacity:0.8,marginBottom:3}}>📍 {wo.stores?.name?.split('-').pop().trim()||'—'}</div>
                          <div style={{color:sc.text,fontSize:10,opacity:0.7}}>
                            🕐 {wo._startTime} – {wo._endTime} ({wo.duration_hours||1}h)
                          </div>
                          {nx && (
                            <button onClick={e=>{e.stopPropagation();quickStatus(wo,nx.next)}}
                              style={{marginTop:8,width:'100%',background:sc.border,color:'white',border:'none',borderRadius:7,padding:'5px',fontSize:11,fontWeight:500,cursor:'pointer'}}>
                              {nx.label}
                            </button>
                          )}
                          {wo.status==='in_progress'&&(
                            <button onClick={e=>{e.stopPropagation();setActiveWO(wo);setShowHold(true)}}
                              style={{marginTop:4,width:'100%',background:'transparent',color:sc.text,border:`1px solid ${sc.border}`,borderRadius:7,padding:'4px',fontSize:11,cursor:'pointer'}}>
                              ⏸ Hold
                            </button>
                          )}
                          <div style={{marginTop:6,color:sc.text,fontSize:10,opacity:0.5}}>⠿ Drag to reassign</div>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── TIMELINE VIEW ── */}
      {view==='timeline'&&(
        <div style={{overflowX:'auto'}}>
          {/* Hour labels */}
          <div style={{display:'flex',marginLeft:160,marginBottom:4}}>
            {HOURS_LABELS.map(h=>(
              <div key={h} style={{flex:1,textAlign:'left',color:'var(--text3)',fontSize:11,fontWeight:500}}>{h}</div>
            ))}
          </div>
          {/* Tech rows */}
          {[...techs,{id:'unassigned',full_name:'Unassigned'}].map(tech=>{
            const techWOs = woByTech[tech.id]||[]
            const dayMin = 9*60
            const totalMin = 9*60 // 9am-6pm = 9hrs = 540min
            return (
              <div key={tech.id} style={{display:'flex',alignItems:'center',marginBottom:8,minHeight:52}}>
                {/* Tech name */}
                <div style={{width:160,flexShrink:0,paddingRight:10}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{width:28,height:28,borderRadius:'50%',background:tech.id==='unassigned'?'#999':'#7F77DD',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,flexShrink:0}}>
                      {tech.id==='unassigned'?'?':tech.full_name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                    </div>
                    <div style={{color:'var(--text)',fontSize:12,fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tech.full_name}</div>
                  </div>
                </div>
                {/* Timeline bar */}
                <div style={{flex:1,position:'relative',height:44,background:'var(--bg3)',borderRadius:8,overflow:'hidden',border:'1px solid var(--border)'}}>
                  {/* Hour grid */}
                  {[1,2,3,4,5,6,7,8].map(h=>(
                    <div key={h} style={{position:'absolute',left:`${(h/9)*100}%`,top:0,bottom:0,width:1,background:'var(--border)',opacity:0.5}}/>
                  ))}
                  {/* WO blocks */}
                  {techWOs.map(wo=>{
                    const left = ((wo._startMin - dayMin) / totalMin) * 100
                    const width = ((wo._endMin - wo._startMin) / totalMin) * 100
                    const sc = STATUS_CFG[wo.status]||STATUS_CFG.open
                    return (
                      <div key={wo.id}
                        onClick={()=>setActiveWO(wo)}
                        style={{position:'absolute',left:`${left}%`,width:`${width}%`,top:4,bottom:4,background:sc.bg,border:`1.5px solid ${sc.border}`,borderRadius:6,padding:'2px 6px',cursor:'pointer',overflow:'hidden',transition:'transform 0.1s'}}
                        onMouseEnter={e=>e.currentTarget.style.transform='scaleY(1.05)'}
                        onMouseLeave={e=>e.currentTarget.style.transform='none'}>
                        <div style={{color:sc.text,fontSize:10,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                          <span style={{background:P_COLORS[wo.priority]+'33',padding:'0 3px',borderRadius:3,marginRight:3,fontSize:9}}>{wo.priority}</span>
                          {wo.title.split('—').pop().trim()}
                        </div>
                        <div style={{color:sc.text,fontSize:9,opacity:0.7}}>{wo._startTime}–{wo._endTime}</div>
                      </div>
                    )
                  })}
                  {techWOs.length===0&&(
                    <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text3)',fontSize:11}}>Available</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── MAP VIEW ── */}
      {view==='map'&&(
        <div>
          <div style={{display:'flex',gap:8,marginBottom:10,flexWrap:'wrap'}}>
            {techs.map(t=>(
              <div key={t.id} style={{background:'var(--card-bg)',border:`1px solid ${techLocs[t.id]?'#1D9E75':'var(--border)'}`,borderRadius:10,padding:'8px 14px',display:'flex',alignItems:'center',gap:8}}>
                <div style={{width:30,height:30,borderRadius:'50%',background:'#7F77DD',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:600}}>
                  {t.full_name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                </div>
                <div>
                  <div style={{color:'var(--text)',fontSize:12,fontWeight:500}}>{t.full_name}</div>
                  <div style={{color:techLocs[t.id]?'#1D9E75':'var(--text3)',fontSize:11}}>{techLocs[t.id]?'🟢 Online':'⚫ Offline'} · {(woByTech[t.id]||[]).length} jobs</div>
                </div>
              </div>
            ))}
          </div>
          <div ref={mapRef} style={{height:500,borderRadius:12,border:'1px solid var(--border)',overflow:'hidden',background:'#e5e3df'}}/>
        </div>
      )}

      {/* ── WO POPUP ── */}
      {activeWO&&(
        <>
          <div onClick={()=>{setActiveWO(null);setShowHold(false);setHoldReason('')}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:500,backdropFilter:'blur(3px)'}}/>
          <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'min(580px,95vw)',maxHeight:'90vh',overflowY:'auto',background:'var(--card-bg)',border:'1px solid var(--border)',borderRadius:16,zIndex:600,padding:24,boxShadow:'0 20px 60px rgba(0,0,0,.2)'}}>
            {/* WO Header */}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
              <div style={{flex:1}}>
                <div style={{display:'flex',gap:8,marginBottom:6}}>
                  <span style={{background:P_COLORS[activeWO.priority]+'22',color:P_COLORS[activeWO.priority],fontSize:11,padding:'2px 10px',borderRadius:6,fontWeight:700}}>{activeWO.priority}</span>
                  <span style={{background:STATUS_CFG[activeWO.status]?.bg,color:STATUS_CFG[activeWO.status]?.text,fontSize:11,padding:'2px 10px',borderRadius:6,fontWeight:500}}>{STATUS_CFG[activeWO.status]?.label}</span>
                </div>
                <h3 style={{color:'var(--text)',fontSize:15,fontWeight:600,margin:'0 0 4px'}}>{activeWO.title}</h3>
                <p style={{color:'var(--text3)',fontSize:13,margin:0}}>📍 {activeWO.stores?.name}</p>
              </div>
              <button onClick={()=>{setActiveWO(null);setShowHold(false);setHoldReason('')}} style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,width:32,height:32,cursor:'pointer',color:'var(--text2)',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>✕</button>
            </div>

            {/* Auto-schedule info */}
            <div style={{background:'var(--green-bg)',border:'1px solid var(--green)',borderRadius:8,padding:'8px 12px',marginBottom:14,fontSize:12,color:'var(--green)'}}>
              🕐 Auto-scheduled: <strong>{activeWO._startTime} – {activeWO._endTime}</strong> · {activeWO.duration_hours||1}h estimated · Priority {activeWO.priority}
            </div>

            {/* Status actions */}
            {!showHold&&(
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:16}}>
                {NEXT_STATUS[activeWO.status]&&(
                  <button onClick={()=>quickStatus(activeWO,NEXT_STATUS[activeWO.status].next)} disabled={saving}
                    style={{background:'#1D9E75',color:'white',border:'none',borderRadius:8,padding:'9px 16px',fontSize:13,fontWeight:500,cursor:'pointer',flex:1}}>
                    {saving?'...':NEXT_STATUS[activeWO.status].label}
                  </button>
                )}
                {activeWO.status==='in_progress'&&(
                  <button onClick={()=>setShowHold(true)} style={{background:'var(--amber-bg)',color:'var(--amber)',border:'1px solid var(--amber)',borderRadius:8,padding:'9px 14px',fontSize:13,cursor:'pointer'}}>⏸ Hold</button>
                )}
                <button onClick={()=>navigate(`/work-orders/${activeWO.id}`)} style={{background:'var(--blue-bg)',color:'var(--blue)',border:'1px solid var(--blue)',borderRadius:8,padding:'9px 14px',fontSize:13,cursor:'pointer'}}>Full Detail →</button>
              </div>
            )}

            {/* Hold form */}
            {showHold&&(
              <div style={{background:'var(--amber-bg)',border:'1px solid var(--amber)',borderRadius:10,padding:14,marginBottom:14}}>
                <div style={{color:'var(--amber)',fontSize:13,fontWeight:500,marginBottom:8}}>⏸ Reason for hold</div>
                <textarea value={holdReason} onChange={e=>setHoldReason(e.target.value)} style={{...inp,height:64,resize:'none',marginBottom:8}} placeholder="e.g. Waiting for spare part..."/>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>submitHold(activeWO)} disabled={saving||!holdReason.trim()} style={{background:'var(--amber)',color:'white',border:'none',borderRadius:7,padding:'7px 16px',fontSize:12,cursor:'pointer'}}>{saving?'...':'Confirm Hold'}</button>
                  <button onClick={()=>{setShowHold(false);setHoldReason('')}} style={{background:'transparent',color:'var(--text2)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 12px',fontSize:12,cursor:'pointer'}}>Cancel</button>
                </div>
              </div>
            )}

            {/* Reschedule controls */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
              <div>
                <label style={{color:'var(--text3)',fontSize:11,display:'block',marginBottom:4}}>Reassign Technician</label>
                <select value={activeWO.assigned_to||''} onChange={e=>updateWO(activeWO.id,{assigned_to:e.target.value||null})} style={inp}>
                  <option value="">Unassigned</option>
                  {techs.map(t=><option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
              <div>
                <label style={{color:'var(--text3)',fontSize:11,display:'block',marginBottom:4}}>Duration (adjust time)</label>
                <select value={activeWO.duration_hours||1} onChange={e=>updateWO(activeWO.id,{duration_hours:parseFloat(e.target.value)})} style={inp}>
                  {[0.5,1,1.5,2,3,4,8].map(h=><option key={h} value={h}>{h<1?'30 min':`${h}h`}</option>)}
                </select>
              </div>
              <div>
                <label style={{color:'var(--text3)',fontSize:11,display:'block',marginBottom:4}}>Priority (affects schedule order)</label>
                <select value={activeWO.priority} onChange={e=>updateWO(activeWO.id,{priority:e.target.value})} style={inp}>
                  {['P1','P2','P3','P4'].map(p=><option key={p} value={p}>{p} — {p==='P1'?'Critical 4h':p==='P2'?'High 8h':p==='P3'?'Medium 12h':'Low 7d'}</option>)}
                </select>
              </div>
              <div>
                <label style={{color:'var(--text3)',fontSize:11,display:'block',marginBottom:4}}>Scheduled Date</label>
                <input type="date" style={{...inp,cursor:'pointer'}} value={activeWO.scheduled_date||''} onChange={e=>updateWO(activeWO.id,{scheduled_date:e.target.value})}/>
              </div>
            </div>

            {/* Store info */}
            {activeWO.stores&&(
              <div style={{background:'var(--bg3)',borderRadius:10,padding:12,fontSize:12,color:'var(--text2)'}}>
                <div style={{fontWeight:500,color:'var(--text)',marginBottom:4}}>📞 Store Contact</div>
                {activeWO.stores.manager_name&&<div>👤 {activeWO.stores.manager_name}</div>}
                {activeWO.stores.phone&&<a href={`tel:${activeWO.stores.phone}`} style={{color:'var(--blue)',textDecoration:'none',display:'block'}}>📞 {activeWO.stores.phone}</a>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
