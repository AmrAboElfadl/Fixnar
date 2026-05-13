import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const P_COLORS = { P1:'#E24B4A', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }
const STATUS_CFG = {
  open:        { bg:'#FFF3E0', text:'#E65100', border:'#EF9F27', label:'Open' },
  travelling:  { bg:'#E3F2FD', text:'#1565C0', border:'#378ADD', label:'On the Way' },
  arrived:     { bg:'#E8EAF6', text:'#283593', border:'#7F77DD', label:'Arrived' },
  in_progress: { bg:'#E8F5E9', text:'#1B5E20', border:'#1D9E75', label:'In Progress' },
  on_hold:     { bg:'#FBE9E7', text:'#BF360C', border:'#E24B4A', label:'On Hold' },
  completed:   { bg:'#F3E5F5', text:'#4A148C', border:'#9C27B0', label:'Completed' },
  closed:      { bg:'#ECEFF1', text:'#455A64', border:'#90A4AE', label:'Closed' },
}
const NEXT_STATUS = {
  open:        { label:'🚗 Start Trip',  next:'travelling' },
  travelling:  { label:'📍 Arrived',     next:'arrived' },
  arrived:     { label:'🔧 Start Work',  next:'in_progress' },
  in_progress: { label:'✅ Complete',    next:'completed' },
  on_hold:     { label:'↩ Reopen',       next:'in_progress' },
  completed:   { label:'🔒 Close',       next:'closed' },
}

// Timeline constants
const DAY_START = 9   // 9am
const DAY_END   = 18  // 6pm
const DAY_MINS  = (DAY_END - DAY_START) * 60 // 540 min
const HOURS     = Array.from({length: DAY_END - DAY_START + 1}, (_,i) => DAY_START + i)

function minsFromStart(timeStr) {
  if (!timeStr) return 0
  const [h, m] = timeStr.split(':').map(Number)
  return Math.max(0, Math.min(DAY_MINS, (h - DAY_START) * 60 + (m || 0)))
}

function autoSchedule(wos) {
  const order = { P1:0, P2:1, P3:2, P4:3 }
  const sorted = [...wos].sort((a,b) => (order[a.priority]||3) - (order[b.priority]||3))
  let cursor = 0
  return sorted.map(wo => {
    const dur = (wo.duration_hours || 1) * 60
    const startMin = cursor
    const endMin = Math.min(cursor + dur, DAY_MINS)
    cursor = endMin
    const pad = n => String(n).padStart(2,'0')
    const sh = Math.floor(startMin / 60) + DAY_START
    const sm = startMin % 60
    const eh = Math.floor(endMin / 60) + DAY_START
    const em = endMin % 60
    return {
      ...wo,
      _startMin: startMin,
      _endMin:   endMin,
      _startTime: `${pad(sh)}:${pad(sm)}`,
      _endTime:   `${pad(eh)}:${pad(em)}`,
    }
  })
}

export default function Schedule() {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()
  const mapRef   = useRef(null)
  const mapInst  = useRef(null)
  const gpsWatch = useRef(null)
  const gpsInterval = useRef(null)

  const [wos,          setWos]          = useState([])
  const [techs,        setTechs]        = useState([])
  const [stores,       setStores]       = useState([])
  const [assignments,  setAssignments]  = useState([]) // store_technician_assignments
  const [techLocs,     setTechLocs]     = useState({})
  const [loading,      setLoading]      = useState(true)
  const [view,         setView]         = useState('timeline')
  const [activeWO,     setActiveWO]     = useState(null)
  const [saving,       setSaving]       = useState(false)
  const [holdReason,   setHoldReason]   = useState('')
  const [showHold,     setShowHold]     = useState(false)
  const [dragging,     setDragging]     = useState(null) // { wo, techId, startMin }
  const [dragOver,     setDragOver]     = useState(null) // techId being hovered
  const [isTracking,   setIsTracking]   = useState(false)
  const [gpsError,     setGpsError]     = useState(null)
  const [showAssign,   setShowAssign]   = useState(false)
  const [assignStore,  setAssignStore]  = useState('')
  const [assignTech,   setAssignTech]   = useState('')

  useEffect(() => {
    fetchAll()
    // Auto-refresh every 60s
    const interval = setInterval(fetchLocs, 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (view === 'map') initMap()
  }, [view, techLocs, stores, wos])

  // Cleanup GPS on unmount
  useEffect(() => () => stopTracking(), [])

  async function fetchAll() {
    setLoading(true)
    const [woRes, techRes, storeRes, asnRes] = await Promise.all([
      supabase.from('work_orders').select('*,stores(name,latitude,longitude,manager_name,phone)').neq('status','closed').order('priority'),
      supabase.from('profiles').select('id,full_name,phone').eq('role','technician'),
      supabase.from('stores').select('id,name,latitude,longitude,manager_name,phone'),
      supabase.from('store_technician_assignments').select('*').catch(() => ({ data:[] })),
    ])
    setWos(woRes.data || [])
    setTechs(techRes.data || [])
    setStores(storeRes.data || [])
    setAssignments(asnRes.data || [])
    await fetchLocs()
    setLoading(false)
  }

  async function fetchLocs() {
    try {
      const res = await supabase.from('technician_locations').select('*')
        .gte('updated_at', new Date(Date.now() - 120 * 60000).toISOString()) // last 2 hours
      const locs = {}
      ;(res.data || []).forEach(l => { locs[l.technician_id] = l })
      setTechLocs(locs)
    } catch {}
  }

  // ── GPS TRACKING ──
  function startTracking() {
    if (!navigator.geolocation) { setGpsError('GPS not supported'); return }
    setIsTracking(true); setGpsError(null)

    // Get immediately
    navigator.geolocation.getCurrentPosition(pos => sendLocation(pos), err => setGpsError(err.message), { enableHighAccuracy:true })

    // Then every 60 seconds
    gpsInterval.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(pos => sendLocation(pos), err => setGpsError(err.message), { enableHighAccuracy:true })
    }, 60000)

    // Also watch for movement
    gpsWatch.current = navigator.geolocation.watchPosition(pos => sendLocation(pos), null, { enableHighAccuracy:true, maximumAge:30000 })
  }

  function stopTracking() {
    setIsTracking(false)
    if (gpsWatch.current) navigator.geolocation.clearWatch(gpsWatch.current)
    if (gpsInterval.current) clearInterval(gpsInterval.current)
    gpsWatch.current = null; gpsInterval.current = null
  }

  async function sendLocation(pos) {
    const { latitude, longitude, accuracy, heading, speed } = pos.coords
    // Find active WO for this technician
    const activeWo = wos.find(w => w.assigned_to === profile?.id && ['travelling','arrived','in_progress'].includes(w.status))
    await supabase.from('technician_locations').upsert({
      technician_id: profile?.id,
      latitude, longitude, accuracy,
      heading: heading || null,
      speed: speed || null,
      work_order_id: activeWo?.id || null,
      updated_at: new Date().toISOString(),
    }, { onConflict:'technician_id' })
    fetchLocs()
  }

  // ── AUTO-ASSIGN ──
  async function autoAssignWO(wo) {
    // Find technician assigned to this store
    const asnList = assignments.filter(a => a.store_id === wo.store_id)
    if (asnList.length === 0) return null
    // Pick least-loaded tech
    const techWoCounts = {}
    wos.forEach(w => { if (w.assigned_to) techWoCounts[w.assigned_to] = (techWoCounts[w.assigned_to]||0)+1 })
    const sorted = asnList.sort((a,b) => (techWoCounts[a.technician_id]||0) - (techWoCounts[b.technician_id]||0))
    return sorted[0]?.technician_id || null
  }

  async function saveAssignment() {
    if (!assignStore || !assignTech) return
    await supabase.from('store_technician_assignments').upsert({ store_id:assignStore, technician_id:assignTech }, { onConflict:'store_id,technician_id' })
    setAssignStore(''); setAssignTech(''); setShowAssign(false)
    fetchAll()
  }

  async function removeAssignment(id) {
    await supabase.from('store_technician_assignments').delete().eq('id', id)
    fetchAll()
  }

  // ── STATUS CHANGE ──
  async function quickStatus(wo, nextStatus) {
    if (nextStatus === 'on_hold') { setShowHold(true); return }
    setSaving(true)
    const now = new Date().toISOString()
    const patch = { status:nextStatus, updated_at:now }
    if (nextStatus==='travelling')  patch.trip_started_at = now
    if (nextStatus==='arrived')     patch.arrived_at = now
    if (nextStatus==='in_progress') patch.work_started_at = now
    if (nextStatus==='completed')   patch.completed_at = now
    if (nextStatus==='closed')      patch.closed_at = now
    await supabase.from('work_orders').update(patch).eq('id', wo.id)
    try { await supabase.from('wo_updates').insert({ work_order_id:wo.id, user_id:profile.id, type:'status_change', content:`Status → ${nextStatus}` }) } catch{}
    if (activeWO?.id === wo.id) setActiveWO(p => ({...p, status:nextStatus}))
    fetchAll(); setSaving(false)
  }

  async function submitHold(wo) {
    if (!holdReason.trim()) return; setSaving(true)
    await supabase.from('work_orders').update({ status:'on_hold', hold_reason:holdReason, updated_at:new Date().toISOString() }).eq('id', wo.id)
    try { await supabase.from('wo_updates').insert({ work_order_id:wo.id, user_id:profile.id, type:'status_change', content:`On hold: ${holdReason}` }) } catch{}
    setShowHold(false); setHoldReason('')
    if (activeWO?.id === wo.id) setActiveWO(p => ({...p, status:'on_hold'}))
    fetchAll(); setSaving(false)
  }

  async function updateWO(woId, patch) {
    await supabase.from('work_orders').update(patch).eq('id', woId)
    if (activeWO?.id === woId) setActiveWO(p => ({...p, ...patch}))
    fetchAll()
  }

  // ── TIMELINE DRAG ──
  function onTimelineDragStart(wo, techId) {
    setDragging({ wo, techId })
  }

  function onTimelineDrop(e, targetTechId, clickMinute) {
    e.preventDefault()
    if (!dragging) return
    const dur = (dragging.wo.duration_hours || 1) * 60
    const newStart = Math.max(0, Math.min(DAY_MINS - dur, clickMinute))
    const sh = Math.floor(newStart/60) + DAY_START
    const sm = newStart % 60
    const pad = n => String(n).padStart(2,'0')
    const newTime = `${pad(sh)}:${pad(sm)}`
    updateWO(dragging.wo.id, {
      assigned_to: targetTechId === 'unassigned' ? null : targetTechId,
      scheduled_time: newTime,
    })
    setDragging(null); setDragOver(null)
  }

  // Group & schedule WOs
  const woByTech = {}
  wos.forEach(wo => {
    const key = wo.assigned_to || 'unassigned'
    if (!woByTech[key]) woByTech[key] = []
    woByTech[key].push(wo)
  })
  Object.keys(woByTech).forEach(key => {
    woByTech[key] = autoSchedule(woByTech[key])
  })

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
    const map = L.map(mapRef.current).setView([25.2048,55.2708],11)
    mapInst.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap'}).addTo(map)

    // Store markers
    stores.forEach(s => {
      if (!s.latitude||!s.longitude) return
      const hasWO = wos.some(w=>w.store_id===s.id)
      const icon = L.divIcon({className:'',html:`<div style="background:${hasWO?'#E24B4A':'#1D9E75'};color:white;border-radius:8px;padding:3px 8px;font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,.25)">🏪 ${s.name.split('-').pop().trim()}</div>`,iconAnchor:[0,0]})
      L.marker([s.latitude,s.longitude],{icon}).addTo(map).bindPopup(`<b>${s.name}</b><br>${s.manager_name||''}<br>${s.phone||''}`)
    })

    // Technician markers with heading arrow
    techs.forEach(t => {
      const loc = techLocs[t.id]; if(!loc) return
      const age = (Date.now() - new Date(loc.updated_at)) / 60000 // minutes old
      const isRecent = age < 5
      const initials = t.full_name.split(' ').map(w=>w[0]).join('').slice(0,2)
      const woCount = (woByTech[t.id]||[]).length
      const icon = L.divIcon({className:'',html:`
        <div style="position:relative">
          <div style="background:${isRecent?'#7F77DD':'#9e9e9e'};color:white;border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px;box-shadow:0 2px 8px rgba(0,0,0,.3);border:3px solid ${isRecent?'white':'#ddd'}">
            ${initials}
          </div>
          ${woCount>0?`<div style="position:absolute;top:-4px;right:-4px;background:#E24B4A;color:white;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700">${woCount}</div>`:''}
          <div style="background:${isRecent?'#1D9E75':'#9e9e9e'};color:white;font-size:9px;padding:1px 5px;border-radius:4px;margin-top:2px;text-align:center;white-space:nowrap">${isRecent?`${Math.round(age)}m ago`:'offline'}</div>
        </div>`,iconAnchor:[22,22]})
      const marker = L.marker([loc.latitude,loc.longitude],{icon}).addTo(map)
      const activeWoForTech = wos.find(w=>w.assigned_to===t.id&&['travelling','arrived','in_progress'].includes(w.status))
      marker.bindPopup(`<b>🔧 ${t.full_name}</b><br>Updated: ${new Date(loc.updated_at).toLocaleTimeString()}<br>${activeWoForTech?`Working on: ${activeWoForTech.title}`:'No active job'}<br>Jobs today: ${woCount}`)
      if (activeWoForTech) marker.openPopup()
    })
    setTimeout(()=>map.invalidateSize(),100)
  }

  const inp = { background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:8, padding:'7px 10px', color:'var(--text)', fontSize:12, outline:'none', width:'100%', boxSizing:'border-box' }
  const techAndUnassigned = [...techs, {id:'unassigned', full_name:'Unassigned'}]

  return (
    <div style={{fontFamily:"'DM Sans', sans-serif"}}>

      {/* ── HEADER ── */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <div>
          <h1 style={{color:'var(--text)',fontSize:22,fontWeight:600,margin:0}}>Dispatch Board</h1>
          <p style={{color:'var(--text3)',fontSize:13,margin:'4px 0 0'}}>{wos.length} active · {techs.length} technicians · {new Date().toLocaleDateString('en',{weekday:'long',month:'long',day:'numeric'})}</p>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
          {/* GPS tracking button */}
          {!isAdmin && (
            <button onClick={isTracking ? stopTracking : startTracking}
              style={{display:'flex',alignItems:'center',gap:6,background:isTracking?'var(--green-bg)':'var(--bg3)',color:isTracking?'var(--green)':'var(--text2)',border:`1px solid ${isTracking?'var(--green)':'var(--border)'}`,borderRadius:8,padding:'7px 14px',fontSize:12,fontWeight:500,cursor:'pointer'}}>
              {isTracking ? '📡 Sharing location' : '📍 Share my location'}
            </button>
          )}
          {gpsError && <span style={{color:'#E24B4A',fontSize:11}}>{gpsError}</span>}

          {/* Store assignment */}
          {isAdmin && (
            <button onClick={()=>setShowAssign(s=>!s)}
              style={{background:'var(--blue-bg)',color:'var(--blue)',border:'1px solid var(--blue)',borderRadius:8,padding:'7px 14px',fontSize:12,fontWeight:500,cursor:'pointer'}}>
              ⚙️ Tech Coverage
            </button>
          )}

          <button onClick={fetchAll} style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,padding:'7px 14px',fontSize:12,cursor:'pointer',color:'var(--text2)'}}>↻ Refresh</button>

          <div style={{display:'flex',background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,padding:3}}>
            {['timeline','map'].map(v=>(
              <button key={v} onClick={()=>setView(v)}
                style={{background:view===v?'#1D9E75':'transparent',color:view===v?'white':'var(--text2)',border:'none',borderRadius:6,padding:'6px 14px',fontSize:12,fontWeight:500,cursor:'pointer'}}>
                {v==='timeline'?'⏱ Timeline':'🗺️ Live Map'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── TECH COVERAGE PANEL ── */}
      {showAssign && isAdmin && (
        <div style={{background:'var(--card-bg)',border:'1px solid var(--blue)',borderRadius:12,padding:20,marginBottom:16}}>
          <h3 style={{color:'var(--text)',fontSize:14,fontWeight:600,margin:'0 0 14px'}}>⚙️ Technician Store Coverage</h3>
          <p style={{color:'var(--text3)',fontSize:12,margin:'0 0 12px'}}>
            Assign technicians to stores so work orders are auto-assigned when created.
          </p>
          <div style={{display:'flex',gap:10,marginBottom:14,flexWrap:'wrap'}}>
            <select value={assignStore} onChange={e=>setAssignStore(e.target.value)} style={{...inp,width:220}}>
              <option value="">Select store</option>
              {stores.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={assignTech} onChange={e=>setAssignTech(e.target.value)} style={{...inp,width:180}}>
              <option value="">Select technician</option>
              {techs.map(t=><option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
            <button onClick={saveAssignment} disabled={!assignStore||!assignTech}
              style={{background:!assignStore||!assignTech?'#ccc':'#1D9E75',color:'white',border:'none',borderRadius:8,padding:'7px 16px',fontSize:12,cursor:'pointer'}}>
              + Add Coverage
            </button>
          </div>
          {/* Current assignments */}
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {assignments.map(a => {
              const store = stores.find(s=>s.id===a.store_id)
              const tech  = techs.find(t=>t.id===a.technician_id)
              if (!store||!tech) return null
              return (
                <div key={a.id} style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,padding:'5px 10px',display:'flex',alignItems:'center',gap:8,fontSize:12}}>
                  <span style={{color:'var(--text2)'}}>{store.name.split('-').pop().trim()}</span>
                  <span style={{color:'var(--text3)'}}>→</span>
                  <span style={{color:'var(--green)',fontWeight:500}}>{tech.full_name}</span>
                  <button onClick={()=>removeAssignment(a.id)} style={{background:'transparent',border:'none',color:'#E24B4A',cursor:'pointer',fontSize:14,padding:0}}>✕</button>
                </div>
              )
            })}
            {assignments.length===0&&<span style={{color:'var(--text3)',fontSize:12}}>No assignments yet</span>}
          </div>
        </div>
      )}

      {/* ── TIMELINE VIEW ── */}
      {view==='timeline' && (
        <div style={{overflowX:'auto'}}>
          {/* Hour labels */}
          <div style={{display:'flex',marginLeft:170,marginBottom:6}}>
            {HOURS.map(h=>(
              <div key={h} style={{flex:1,textAlign:'left',color:h===new Date().getHours()?'var(--green)':'var(--text3)',fontSize:11,fontWeight:h===new Date().getHours()?600:400}}>
                {h<12?`${h}am`:h===12?'12pm':`${h-12}pm`}
              </div>
            ))}
          </div>

          {/* Tech rows */}
          {techAndUnassigned.map(tech=>{
            const techWOs = woByTech[tech.id] || []
            const isOnline = !!techLocs[tech.id]
            const loc = techLocs[tech.id]
            const isDragTarget = dragOver === tech.id

            return (
              <div key={tech.id} style={{display:'flex',alignItems:'stretch',marginBottom:8}}
                onDragOver={e=>{e.preventDefault();setDragOver(tech.id)}}
                onDragLeave={()=>setDragOver(null)}
                onDrop={e=>{
                  const rect = e.currentTarget.querySelector('.timeline-bar').getBoundingClientRect()
                  const pct = (e.clientX - rect.left) / rect.width
                  const clickMin = Math.round(pct * DAY_MINS / 30) * 30
                  onTimelineDrop(e, tech.id, clickMin)
                }}>

                {/* Tech info */}
                <div style={{width:170,flexShrink:0,paddingRight:12,display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:32,height:32,borderRadius:'50%',background:tech.id==='unassigned'?'#999':'#7F77DD',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:600,flexShrink:0}}>
                    {tech.id==='unassigned'?'?':tech.full_name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                  </div>
                  <div style={{minWidth:0}}>
                    <div style={{color:'var(--text)',fontSize:12,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{tech.full_name}</div>
                    <div style={{fontSize:10,color:isOnline?'#1D9E75':'var(--text3)'}}>
                      {isOnline ? `🟢 ${Math.round((Date.now()-new Date(loc.updated_at))/60000)}m ago` : '⚫ Offline'}
                      {techWOs.length>0&&` · ${techWOs.length} job${techWOs.length>1?'s':''}`}
                    </div>
                  </div>
                </div>

                {/* Timeline bar */}
                <div className="timeline-bar" style={{flex:1,position:'relative',height:56,background:isDragTarget?'var(--green-bg)':'var(--bg3)',borderRadius:10,overflow:'hidden',border:`1px solid ${isDragTarget?'var(--green)':'var(--border)'}`,transition:'all 0.15s',cursor:'default'}}>
                  {/* Hour grid lines */}
                  {HOURS.slice(1).map(h=>(
                    <div key={h} style={{position:'absolute',left:`${((h-DAY_START)/( DAY_END-DAY_START))*100}%`,top:0,bottom:0,width:1,background:'var(--border)',opacity:0.5}}/>
                  ))}

                  {/* Current time indicator */}
                  {(() => {
                    const now = new Date()
                    const nowMin = (now.getHours()-DAY_START)*60+now.getMinutes()
                    if (nowMin>=0&&nowMin<=DAY_MINS) return (
                      <div style={{position:'absolute',left:`${(nowMin/DAY_MINS)*100}%`,top:0,bottom:0,width:2,background:'#E24B4A',zIndex:10,opacity:0.8}}>
                        <div style={{position:'absolute',top:-2,left:-3,width:8,height:8,borderRadius:'50%',background:'#E24B4A'}}/>
                      </div>
                    )
                    return null
                  })()}

                  {/* WO blocks */}
                  {techWOs.map(wo=>{
                    const sc = STATUS_CFG[wo.status]||STATUS_CFG.open
                    const leftPct = (wo._startMin/DAY_MINS)*100
                    const widthPct = ((wo._endMin-wo._startMin)/DAY_MINS)*100
                    return (
                      <div key={wo.id}
                        draggable
                        onDragStart={()=>onTimelineDragStart(wo, tech.id)}
                        onDragEnd={()=>{setDragging(null);setDragOver(null)}}
                        onClick={()=>setActiveWO(wo)}
                        style={{
                          position:'absolute',
                          left:`${leftPct}%`,
                          width:`${widthPct}%`,
                          top:4,bottom:4,
                          background:sc.bg,
                          border:`1.5px solid ${sc.border}`,
                          borderRadius:7,
                          padding:'2px 6px',
                          cursor:'grab',
                          overflow:'hidden',
                          boxSizing:'border-box',
                          zIndex:5,
                          transition:'transform 0.1s',
                          display:'flex',
                          flexDirection:'column',
                          justifyContent:'center',
                        }}
                        onMouseEnter={e=>e.currentTarget.style.transform='scaleY(1.04)'}
                        onMouseLeave={e=>e.currentTarget.style.transform='none'}>
                        <div style={{color:sc.text,fontSize:10,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                          <span style={{background:P_COLORS[wo.priority]+'33',padding:'0 3px',borderRadius:3,marginRight:3,fontSize:9}}>{wo.priority}</span>
                          {wo.title?.split('—').pop().trim()}
                        </div>
                        <div style={{color:sc.text,fontSize:9,opacity:0.7}}>{wo._startTime}–{wo._endTime}</div>
                      </div>
                    )
                  })}

                  {techWOs.length===0&&(
                    <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text3)',fontSize:11}}>
                      {isDragTarget?'📥 Drop to assign here':tech.id==='unassigned'?'Unassigned WOs will appear here':'No work orders — available all day'}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {/* Drag tip */}
          <div style={{color:'var(--text3)',fontSize:11,marginTop:8,textAlign:'center'}}>
            💡 Drag any work order block to reschedule or reassign to another technician · Red line = current time
          </div>
        </div>
      )}

      {/* ── MAP VIEW ── */}
      {view==='map' && (
        <div>
          {/* Technician status strip */}
          <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}>
            {techs.map(t=>{
              const loc = techLocs[t.id]
              const age = loc ? Math.round((Date.now()-new Date(loc.updated_at))/60000) : null
              const activeJob = wos.find(w=>w.assigned_to===t.id&&['travelling','arrived','in_progress'].includes(w.status))
              return (
                <div key={t.id} style={{background:'var(--card-bg)',border:`1px solid ${loc&&age<5?'#1D9E75':'var(--border)'}`,borderRadius:10,padding:'10px 14px',display:'flex',alignItems:'center',gap:10,minWidth:200}}>
                  <div style={{width:36,height:36,borderRadius:'50%',background:'#7F77DD',color:'white',display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:600,flexShrink:0,position:'relative'}}>
                    {t.full_name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                    {loc&&age<5&&<div style={{position:'absolute',bottom:0,right:0,width:10,height:10,borderRadius:'50%',background:'#1D9E75',border:'2px solid var(--card-bg)'}}/>}
                  </div>
                  <div>
                    <div style={{color:'var(--text)',fontSize:13,fontWeight:500}}>{t.full_name}</div>
                    <div style={{color:loc&&age<5?'#1D9E75':'var(--text3)',fontSize:11}}>
                      {loc&&age<5?`🟢 ${age}m ago`:'⚫ Not sharing'} · {(woByTech[t.id]||[]).length} jobs
                    </div>
                    {activeJob&&<div style={{color:'var(--blue)',fontSize:10,marginTop:2}}>🔧 {activeJob.stores?.name?.split('-').pop().trim()}</div>}
                  </div>
                </div>
              )
            })}
          </div>
          <div ref={mapRef} style={{height:500,borderRadius:12,border:'1px solid var(--border)',overflow:'hidden',background:'#e5e3df'}}/>
          <div style={{color:'var(--text3)',fontSize:11,marginTop:8}}>
            🟢 Green = online (updated &lt;5min) · 🔴 Red stores = have open work orders · Number badge = active jobs · Updates every 60s
          </div>
        </div>
      )}

      {/* ── WO POPUP ── */}
      {activeWO && (
        <>
          <div onClick={()=>{setActiveWO(null);setShowHold(false);setHoldReason('')}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',zIndex:500,backdropFilter:'blur(3px)'}}/>
          <div style={{position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',width:'min(560px,95vw)',maxHeight:'90vh',overflowY:'auto',background:'var(--card-bg)',border:'1px solid var(--border)',borderRadius:16,zIndex:600,padding:24,boxShadow:'0 20px 60px rgba(0,0,0,.2)'}}>

            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
              <div>
                <div style={{display:'flex',gap:8,marginBottom:6}}>
                  <span style={{background:P_COLORS[activeWO.priority]+'22',color:P_COLORS[activeWO.priority],fontSize:11,padding:'2px 10px',borderRadius:6,fontWeight:700}}>{activeWO.priority}</span>
                  <span style={{background:STATUS_CFG[activeWO.status]?.bg,color:STATUS_CFG[activeWO.status]?.text,fontSize:11,padding:'2px 10px',borderRadius:6}}>{STATUS_CFG[activeWO.status]?.label}</span>
                </div>
                <h3 style={{color:'var(--text)',fontSize:15,fontWeight:600,margin:'0 0 3px'}}>{activeWO.title}</h3>
                <p style={{color:'var(--text3)',fontSize:13,margin:0}}>📍 {activeWO.stores?.name}</p>
                {activeWO._startTime && <p style={{color:'var(--green)',fontSize:12,margin:'4px 0 0'}}>🕐 Scheduled: {activeWO._startTime} – {activeWO._endTime} ({activeWO.duration_hours||1}h)</p>}
              </div>
              <button onClick={()=>{setActiveWO(null);setShowHold(false);setHoldReason('')}}
                style={{background:'var(--bg3)',border:'1px solid var(--border)',borderRadius:8,width:32,height:32,cursor:'pointer',color:'var(--text2)',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>✕</button>
            </div>

            {!showHold && (
              <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}>
                {NEXT_STATUS[activeWO.status] && (
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

            {showHold && (
              <div style={{background:'var(--amber-bg)',border:'1px solid var(--amber)',borderRadius:10,padding:14,marginBottom:14}}>
                <div style={{color:'var(--amber)',fontSize:13,fontWeight:500,marginBottom:8}}>⏸ Reason for hold</div>
                <textarea value={holdReason} onChange={e=>setHoldReason(e.target.value)}
                  style={{...inp,height:64,resize:'none',marginBottom:8}} placeholder="e.g. Waiting for spare part..."/>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>submitHold(activeWO)} disabled={saving||!holdReason.trim()} style={{background:'var(--amber)',color:'white',border:'none',borderRadius:7,padding:'7px 16px',fontSize:12,cursor:'pointer'}}>{saving?'...':'Confirm Hold'}</button>
                  <button onClick={()=>{setShowHold(false);setHoldReason('')}} style={{background:'transparent',color:'var(--text2)',border:'1px solid var(--border)',borderRadius:7,padding:'7px 12px',fontSize:12,cursor:'pointer'}}>Cancel</button>
                </div>
              </div>
            )}

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
              <div>
                <label style={{color:'var(--text3)',fontSize:11,display:'block',marginBottom:4}}>Reassign Technician</label>
                <select value={activeWO.assigned_to||''} onChange={e=>updateWO(activeWO.id,{assigned_to:e.target.value||null})} style={inp}>
                  <option value="">Unassigned</option>
                  {techs.map(t=><option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
              <div>
                <label style={{color:'var(--text3)',fontSize:11,display:'block',marginBottom:4}}>Duration</label>
                <select value={activeWO.duration_hours||1} onChange={e=>updateWO(activeWO.id,{duration_hours:parseFloat(e.target.value)})} style={inp}>
                  {[0.5,1,1.5,2,3,4,8].map(h=><option key={h} value={h}>{h<1?'30 min':`${h}h`}</option>)}
                </select>
              </div>
              <div>
                <label style={{color:'var(--text3)',fontSize:11,display:'block',marginBottom:4}}>Priority</label>
                <select value={activeWO.priority} onChange={e=>updateWO(activeWO.id,{priority:e.target.value})} style={inp}>
                  {['P1','P2','P3','P4'].map(p=><option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label style={{color:'var(--text3)',fontSize:11,display:'block',marginBottom:4}}>Start time (manual)</label>
                <input type="time" style={{...inp,cursor:'pointer'}} value={activeWO.scheduled_time||activeWO._startTime||''} onChange={e=>updateWO(activeWO.id,{scheduled_time:e.target.value})}/>
              </div>
            </div>

            {activeWO.stores && (
              <div style={{background:'var(--bg3)',borderRadius:10,padding:12,fontSize:12,color:'var(--text2)'}}>
                <div style={{fontWeight:500,color:'var(--text)',marginBottom:4}}>📞 Store Contact</div>
                {activeWO.stores.manager_name&&<div>👤 {activeWO.stores.manager_name}</div>}
                {activeWO.stores.phone&&<a href={`tel:${activeWO.stores.phone}`} style={{color:'var(--blue)',textDecoration:'none'}}>📞 {activeWO.stores.phone}</a>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
