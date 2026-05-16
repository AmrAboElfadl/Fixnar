import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const P_COLORS = { P1:'#E24B4A', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }
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
  open:        { label:'🚗 Start Trip',  next:'travelling' },
  travelling:  { label:'📍 Arrived',     next:'arrived' },
  arrived:     { label:'🔧 Start Work',  next:'in_progress' },
  in_progress: { label:'✅ Complete',    next:'completed' },
  on_hold:     { label:'↩ Reopen',       next:'in_progress' },
  completed:   { label:'🔒 Close',       next:'closed' },
}

const DAY_START = 9
const DAY_END   = 18
const DAY_MINS  = (DAY_END - DAY_START) * 60
const HOURS     = Array.from({length: DAY_END - DAY_START + 1}, (_,i) => DAY_START + i)

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
    return { ...wo, _startMin: startMin, _endMin: endMin,
      _startTime: `${pad(sh)}:${pad(sm)}`, _endTime: `${pad(eh)}:${pad(em)}` }
  })
}

export default function Schedule() {
  const { profile, isAdmin } = useAuth()
  const navigate = useNavigate()

  // DOM refs
  const mapRef      = useRef(null)
  const mapInst     = useRef(null)
  const gpsWatch    = useRef(null)
  const gpsInterval = useRef(null)

  // (data refs removed — initMap now fetches directly from Supabase)

  // State (drives UI re-renders)
  const [wos,         setWos]         = useState([])
  const [techs,       setTechs]       = useState([])
  const [stores,      setStores]      = useState([])
  const [assignments, setAssignments] = useState([])
  const [techLocs,    setTechLocs]    = useState({})
  const [loading,     setLoading]     = useState(true)
  const [view,        setView]        = useState('timeline')
  const [activeWO,    setActiveWO]    = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [holdReason,  setHoldReason]  = useState('')
  const [showHold,    setShowHold]    = useState(false)
  const [isTracking,  setIsTracking]  = useState(false)
  const [gpsError,    setGpsError]    = useState(null)
  const [showAssign,  setShowAssign]  = useState(false)
  const [assignStore, setAssignStore] = useState('')
  const [assignTech,  setAssignTech]  = useState('')
  const [selectedDate,setSelectedDate]= useState(new Date())
  const [dragging,    setDragging]    = useState(null)
  const [dragOver,    setDragOver]    = useState(null)

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchLocs, 60000)
    return () => { clearInterval(iv); stopTracking() }
  }, [])

  // initMap fetches its own data — only trigger when switching TO map view
  useEffect(() => {
    if (view === 'map') initMap()
  }, [view])
  useEffect(() => { techLocsRef.current = techLocs }, [techLocs])

  async function fetchAll() {
    setLoading(true)
    try {
      const safe = (promise) => promise.catch(() => ({ data: [] }))

      const [woRes, techRes, storeRes, asnRes] = await Promise.all([
        safe(supabase.from('work_orders')
          .select('*,stores(name,latitude,longitude,manager_name,phone)')
          .neq('status','closed').order('priority')),
        safe(supabase.from('profiles').select('id,full_name,phone').eq('role','technician')),
        safe(supabase.from('stores').select('id,name,latitude,longitude,manager_name,phone')),
        safe(supabase.from('store_technician_assignments').select('*')),
      ])

      const newStores = storeRes.data || []
      const newWos    = woRes.data    || []
      const newTechs  = techRes.data  || []
      const newAsn    = asnRes.data   || []

      // Update refs immediately (before setState batching)
      storesRef.current = newStores
      wosRef.current    = newWos
      techsRef.current  = newTechs

      setStores(newStores)
      setWos(newWos)
      setTechs(newTechs)
      setAssignments(newAsn)

      await fetchLocs()
    } catch(err) {
      console.error('Dispatch board load error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function fetchLocs() {
    try {
      const res = await supabase.from('technician_locations').select('*')
        .gte('updated_at', new Date(Date.now() - 120 * 60000).toISOString())
      const locs = {}
      ;((res && res.data) || []).forEach(l => { locs[l.technician_id] = l })
      techLocsRef.current = locs
      setTechLocs(locs)
    } catch { /* table may not exist yet */ }
  }

  // ── GPS ──
  function startTracking() {
    if (!navigator.geolocation) { setGpsError('GPS not supported'); return }
    setIsTracking(true); setGpsError(null)
    const pushLoc = (pos) => {
      supabase.from('technician_locations').upsert({
        technician_id: profile.id,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'technician_id' }).catch(() => {})
    }
    gpsWatch.current = navigator.geolocation.watchPosition(pushLoc, () => {}, { enableHighAccuracy:true })
    gpsInterval.current = setInterval(
      () => navigator.geolocation.getCurrentPosition(pushLoc, () => {}, { enableHighAccuracy:true }),
      60000
    )
  }
  function stopTracking() {
    if (gpsWatch.current) navigator.geolocation.clearWatch(gpsWatch.current)
    if (gpsInterval.current) clearInterval(gpsInterval.current)
    setIsTracking(false)
  }

  // ── Status update ──
  async function quickStatus(wo, nextStatus) {
    if (nextStatus === 'on_hold') { setShowHold(true); return }
    setSaving(true)
    const now = new Date().toISOString()
    const patch = { status: nextStatus, updated_at: now }
    if (nextStatus === 'travelling')  patch.trip_started_at  = now
    if (nextStatus === 'arrived')     patch.arrived_at       = now
    if (nextStatus === 'in_progress') patch.work_started_at  = now
    if (nextStatus === 'completed')   patch.completed_at     = now
    if (nextStatus === 'closed')      patch.closed_at        = now
    await supabase.from('work_orders').update(patch).eq('id', wo.id)
    await supabase.from('wo_updates').insert({
      work_order_id: wo.id, user_id: profile.id,
      type:'status_change', content:`Status → ${nextStatus}`
    }).catch(() => {})
    setActiveWO(null)
    fetchAll()
    setSaving(false)
  }

  async function submitHold() {
    if (!activeWO || !holdReason.trim()) return
    setSaving(true)
    await supabase.from('work_orders').update({ status:'on_hold', hold_reason:holdReason, updated_at:new Date().toISOString() }).eq('id', activeWO.id)
    await supabase.from('wo_updates').insert({ work_order_id:activeWO.id, user_id:profile.id, type:'status_change', content:`On Hold: ${holdReason}` }).catch(()=>{})
    setShowHold(false); setHoldReason(''); setActiveWO(null)
    fetchAll(); setSaving(false)
  }

  async function saveAssignment() {
    if (!assignStore || !assignTech) return
    await supabase.from('store_technician_assignments')
      .upsert({ store_id:assignStore, technician_id:assignTech }, { onConflict:'store_id,technician_id' })
    setShowAssign(false); setAssignStore(''); setAssignTech('')
    fetchAll()
  }

  // ── Drag & drop ──
  function onDragStart(wo, techId) { setDragging({ wo, techId }) }
  async function onDrop(targetTechId, newTime) {
    if (!dragging) return
    await supabase.from('work_orders').update({
      assigned_to: targetTechId === 'unassigned' ? null : targetTechId,
      scheduled_time: newTime,
    }).eq('id', dragging.wo.id)
    setDragging(null); setDragOver(null)
    fetchAll()
  }

  // Group WOs by technician
  const woByTech = {}
  wos.forEach(wo => {
    const key = wo.assigned_to || 'unassigned'
    if (!woByTech[key]) woByTech[key] = []
    woByTech[key].push(wo)
  })
  Object.keys(woByTech).forEach(key => { woByTech[key] = autoSchedule(woByTech[key]) })

  // ── MAP — fetches its own data fresh every time, zero stale-closure risk ──
  async function initMap() {
    if (!mapRef.current) return
    if (mapInst.current) { mapInst.current.remove(); mapInst.current = null }

    // Load Leaflet CSS+JS if not already present
    if (!window.L) {
      await new Promise(resolve => {
        if (!document.querySelector('link[href*="leaflet"]')) {
          const link = document.createElement('link')
          link.rel = 'stylesheet'
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
          document.head.appendChild(link)
        }
        const script = document.createElement('script')
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
        script.onload = resolve
        document.head.appendChild(script)
      })
    }
    if (!mapRef.current) return // unmounted while loading

    // Fetch fresh data directly from Supabase — never stale
    const [storeRes, woRes, techRes, locRes] = await Promise.all([
      supabase.from('stores').select('id,name,latitude,longitude,manager_name,phone'),
      supabase.from('work_orders').select('id,store_id,assigned_to,status,priority').neq('status','closed'),
      supabase.from('profiles').select('id,full_name').eq('role','technician'),
      supabase.from('technician_locations').select('*')
        .gte('updated_at', new Date(Date.now() - 120*60000).toISOString()).catch(() => ({ data:[] })),
    ])

    const _stores   = storeRes.data || []
    const _wos      = woRes.data    || []
    const _techs    = techRes.data  || []
    const _techLocs = {}
    ;((locRes && locRes.data) || []).forEach(l => { _techLocs[l.technician_id] = l })

    const _woByTech = {}
    _wos.forEach(wo => {
      const k = wo.assigned_to || 'unassigned'
      if (!_woByTech[k]) _woByTech[k] = []
      _woByTech[k].push(wo)
    })

    if (!mapRef.current) return
    renderMap(_stores, _wos, _techs, _techLocs, _woByTech)
  }

  function renderMap(_stores, _wos, _techs, _techLocs, _woByTech) {
    if (!mapRef.current || !window.L) return
    const L = window.L

    // Find bounds from store coordinates
    const validStores = _stores.filter(s => s.latitude && s.longitude)
    const center = validStores.length > 0
      ? [
          validStores.reduce((s, x) => s + parseFloat(x.latitude), 0) / validStores.length,
          validStores.reduce((s, x) => s + parseFloat(x.longitude), 0) / validStores.length,
        ]
      : [25.2048, 55.2708]

    const map = L.map(mapRef.current).setView(center, 10)
    mapInst.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map)

    // ── Store markers ──
    const bounds = []
    validStores.forEach(s => {
      const lat = parseFloat(s.latitude)
      const lng = parseFloat(s.longitude)
      bounds.push([lat, lng])
      const hasWO = _wos.some(w => w.store_id === s.id)
      const shortName = s.name.includes('-') ? s.name.split('-').pop().trim() : s.name
      const icon = L.divIcon({
        className: '',
        html: `<div style="
          background:${hasWO ? '#E24B4A' : '#1D9E75'};
          color:white;border-radius:8px;padding:4px 9px;
          font-size:11px;font-weight:600;white-space:nowrap;
          box-shadow:0 2px 6px rgba(0,0,0,.3);
          border:2px solid white;
        ">🏪 ${shortName}</div>`,
        iconAnchor: [0, 0],
      })
      L.marker([lat, lng], { icon }).addTo(map)
        .bindPopup(`<b>${s.name}</b>${s.manager_name ? `<br>👤 ${s.manager_name}` : ''}${s.phone ? `<br>📞 ${s.phone}` : ''}`)
    })

    // ── Technician markers ──
    _techs.forEach(t => {
      const loc = _techLocs[t.id]
      if (!loc) return
      const lat = parseFloat(loc.latitude)
      const lng = parseFloat(loc.longitude)
      bounds.push([lat, lng])
      const age = (Date.now() - new Date(loc.updated_at)) / 60000
      const isRecent = age < 5
      const initials = t.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
      const woCount  = (_woByTech[t.id] || []).length
      const icon = L.divIcon({
        className: '',
        html: `<div style="position:relative;display:inline-block">
          <div style="
            background:${isRecent ? '#7F77DD' : '#9e9e9e'};
            color:white;border-radius:50%;width:44px;height:44px;
            display:flex;align-items:center;justify-content:center;
            font-weight:700;font-size:14px;
            box-shadow:0 2px 8px rgba(0,0,0,.35);
            border:3px solid ${isRecent ? 'white' : '#ccc'};
          ">${initials}</div>
          ${woCount > 0 ? `<div style="
            position:absolute;top:-4px;right:-4px;
            background:#E24B4A;color:white;border-radius:50%;
            width:18px;height:18px;display:flex;align-items:center;
            justify-content:center;font-size:10px;font-weight:700;
          ">${woCount}</div>` : ''}
          <div style="
            position:absolute;bottom:-22px;left:50%;transform:translateX(-50%);
            background:${isRecent?'#7F77DD':'#9e9e9e'};color:white;
            border-radius:4px;padding:1px 6px;font-size:10px;white-space:nowrap;
          ">${t.full_name.split(' ')[0]}</div>
        </div>`,
        iconAnchor: [22, 22],
      })
      L.marker([lat, lng], { icon }).addTo(map)
        .bindPopup(`<b>${t.full_name}</b><br>🟢 Live · ${woCount} job${woCount !== 1 ? 's' : ''}`)
    })

    // Fit map to show all markers
    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40] })
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 13)
    }
  }

  // ─────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'60vh', color:'var(--text3)' }}>
      Loading dispatch board…
    </div>
  )

  const todayStr = new Date().toDateString()

  return (
    <div style={{ color:'var(--text)' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ margin:0, fontSize:22, fontWeight:700 }}>Dispatch Board</h2>
          <p style={{ margin:'4px 0 0', color:'var(--text3)', fontSize:13 }}>
            {Object.values(techLocs).length} active · {techs.length} technicians ·{' '}
            {new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })}
          </p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {isAdmin && (
            <button onClick={() => setShowAssign(true)} style={{
              background:'var(--green)', color:'white', border:'none',
              borderRadius:8, padding:'8px 14px', fontSize:13, cursor:'pointer', fontWeight:600,
            }}>⚙️ Tech Coverage</button>
          )}
          <button onClick={fetchAll} style={{
            background:'var(--surface)', border:'1px solid var(--border)',
            borderRadius:8, padding:'8px 14px', fontSize:13, cursor:'pointer', color:'var(--text)',
          }}>↻ Refresh</button>
          {['timeline','map'].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              background: view===v ? 'var(--green)' : 'var(--surface)',
              color: view===v ? 'white' : 'var(--text)',
              border:`1px solid ${view===v ? 'var(--green)' : 'var(--border)'}`,
              borderRadius:8, padding:'8px 14px', fontSize:13, cursor:'pointer', fontWeight:600,
              textTransform:'capitalize',
            }}>{v === 'timeline' ? '📋 Timeline' : '🗺️ Live Map'}</button>
          ))}
        </div>
      </div>

      {/* GPS tracker (technician only) */}
      {!isAdmin && (
        <div style={{
          background: isTracking ? '#E8F5E9' : 'var(--surface)',
          border:`1px solid ${isTracking ? '#1D9E75' : 'var(--border)'}`,
          borderRadius:10, padding:'10px 16px', marginBottom:16,
          display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:8,
        }}>
          <div>
            <span style={{ fontWeight:600, color: isTracking ? '#1D9E75' : 'var(--text)', fontSize:13 }}>
              {isTracking ? '🟢 Sharing location' : '⚫ Location sharing off'}
            </span>
            {gpsError && <span style={{ color:'#E24B4A', fontSize:12, marginLeft:8 }}>{gpsError}</span>}
          </div>
          <button onClick={isTracking ? stopTracking : startTracking} style={{
            background: isTracking ? '#E24B4A' : '#1D9E75',
            color:'white', border:'none', borderRadius:7, padding:'7px 14px', fontSize:13, cursor:'pointer', fontWeight:600,
          }}>{isTracking ? '⏹ Stop Sharing' : '▶ Share My Location'}</button>
        </div>
      )}

      {/* ── TIMELINE VIEW ── */}
      {view === 'timeline' && (
        <div style={{ overflowX:'auto' }}>
          <div style={{ minWidth:900 }}>
            {/* Hour axis */}
            <div style={{ display:'flex', marginLeft:160, marginBottom:4 }}>
              {HOURS.map(h => (
                <div key={h} style={{ flex:1, textAlign:'left', fontSize:11, color:'var(--text3)', paddingLeft:4 }}>
                  {h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h-12}pm`}
                </div>
              ))}
            </div>

            {/* Technician rows */}
            {[...techs, { id:'unassigned', full_name:'Unassigned' }].map(tech => {
              const myWOs = woByTech[tech.id] || []
              const loc   = techLocs[tech.id]
              const isOnline = loc && (Date.now() - new Date(loc.updated_at)) < 5 * 60000

              return (
                <div key={tech.id}
                  onDragOver={e => { e.preventDefault(); setDragOver(tech.id) }}
                  onDrop={e => {
                    e.preventDefault()
                    const hour = Math.floor((e.nativeEvent.offsetX / e.currentTarget.clientWidth) * (DAY_END - DAY_START)) + DAY_START
                    onDrop(tech.id, `${String(hour).padStart(2,'0')}:00`)
                  }}
                  style={{
                    display:'flex', alignItems:'stretch', marginBottom:6,
                    background: dragOver === tech.id ? 'rgba(29,158,117,0.05)' : 'transparent',
                    borderRadius:8, border: dragOver === tech.id ? '1px dashed var(--green)' : '1px solid transparent',
                  }}
                >
                  {/* Tech label */}
                  <div style={{ width:155, flexShrink:0, display:'flex', alignItems:'center', gap:8, paddingRight:8 }}>
                    <div style={{
                      width:32, height:32, borderRadius:'50%', flexShrink:0,
                      background: tech.id === 'unassigned' ? 'var(--border)' : '#7F77DD',
                      color:'white', display:'flex', alignItems:'center', justifyContent:'center',
                      fontSize:12, fontWeight:700,
                    }}>
                      {tech.id === 'unassigned' ? '?' : tech.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>
                        {tech.full_name.split(' ')[0]}
                      </div>
                      <div style={{ fontSize:10, color: isOnline ? '#1D9E75' : 'var(--text3)' }}>
                        {tech.id === 'unassigned' ? '' : isOnline ? '🟢 online' : '⚫ offline'}
                      </div>
                    </div>
                  </div>

                  {/* Timeline bar */}
                  <div style={{ flex:1, position:'relative', height:52, background:'var(--surface)', borderRadius:8, border:'1px solid var(--border)', overflow:'visible' }}>
                    {/* Hour grid lines */}
                    {HOURS.slice(0,-1).map((_, i) => (
                      <div key={i} style={{
                        position:'absolute', top:0, bottom:0,
                        left:`${(i / (HOURS.length-1)) * 100}%`,
                        borderLeft:'1px dashed var(--border)', pointerEvents:'none',
                      }}/>
                    ))}

                    {/* WO blocks */}
                    {myWOs.map(wo => {
                      const cfg = STATUS_CFG[wo.status] || STATUS_CFG.open
                      const left  = `${(wo._startMin / DAY_MINS) * 100}%`
                      const width = `${Math.max(2, ((wo._endMin - wo._startMin) / DAY_MINS) * 100)}%`
                      return (
                        <div key={wo.id}
                          draggable
                          onDragStart={() => onDragStart(wo, tech.id)}
                          onClick={() => setActiveWO(wo)}
                          style={{
                            position:'absolute', top:4, height:'calc(100% - 8px)',
                            left, width, minWidth:60,
                            background:cfg.bg, border:`1.5px solid ${cfg.border}`,
                            borderRadius:6, cursor:'pointer', overflow:'hidden',
                            display:'flex', alignItems:'center', padding:'0 6px',
                            boxSizing:'border-box', zIndex:2,
                            boxShadow:'0 1px 4px rgba(0,0,0,.1)',
                            transition:'transform 0.1s',
                          }}
                          onMouseEnter={e => e.currentTarget.style.transform='scale(1.02)'}
                          onMouseLeave={e => e.currentTarget.style.transform='scale(1)'}
                        >
                          <div style={{ minWidth:0 }}>
                            <div style={{ fontSize:10, fontWeight:700, color:cfg.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                              <span style={{
                                display:'inline-block', width:8, height:8, borderRadius:'50%',
                                background:P_COLORS[wo.priority]||'#999', marginRight:4,
                              }}/>
                              {wo.stores?.name?.split('-').pop().trim() || 'Store'}
                            </div>
                            <div style={{ fontSize:9, color:cfg.text, opacity:0.8, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                              {wo._startTime}–{wo._endTime}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          <p style={{ color:'var(--text3)', fontSize:11, marginTop:12 }}>
            💡 Drag work orders between technicians to reassign · Click a card to update status
          </p>
        </div>
      )}

      {/* ── MAP VIEW ── */}
      {view === 'map' && (
        <div>
          {/* Technician status pills */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:14 }}>
            {techs.map(tech => {
              const loc = techLocs[tech.id]
              const isOnline = loc && (Date.now() - new Date(loc.updated_at)) < 5 * 60000
              const woCount  = (woByTech[tech.id] || []).length
              return (
                <div key={tech.id} style={{
                  border:`1.5px solid ${isOnline ? 'var(--green)' : 'var(--border)'}`,
                  borderRadius:10, padding:'8px 12px',
                  display:'flex', alignItems:'center', gap:8, minWidth:160,
                  background:'var(--surface)',
                }}>
                  <div style={{
                    width:34, height:34, borderRadius:'50%', background:'#7F77DD',
                    color:'white', display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:12, fontWeight:700, flexShrink:0,
                  }}>
                    {tech.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ color:'var(--text)', fontSize:13, fontWeight:500 }}>{tech.full_name}</div>
                    <div style={{ color: isOnline ? '#1D9E75' : 'var(--text3)', fontSize:11 }}>
                      {isOnline ? `🟢 Online · ${woCount} job${woCount!==1?'s':''}` : '⚫ Location not shared'}
                    </div>
                  </div>
                </div>
              )
            })}
            {techs.length === 0 && (
              <div style={{ color:'var(--text3)', fontSize:13 }}>No technicians added yet</div>
            )}
          </div>

          {/* Map container */}
          <div ref={mapRef} style={{
            height:520, borderRadius:12,
            border:'1px solid var(--border)', overflow:'hidden',
            background:'#e5e3df',
          }}/>
          <p style={{ color:'var(--text3)', fontSize:12, marginTop:8 }}>
            🟢 Green = online (updated &lt;5min) &nbsp;·&nbsp;
            🔴 Red stores = have open work orders &nbsp;·&nbsp;
            Number badge = active jobs &nbsp;·&nbsp;
            Updates every 60s
          </p>
        </div>
      )}

      {/* ── WO Detail popup ── */}
      {activeWO && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => { if (e.target === e.currentTarget) setActiveWO(null) }}>
          <div style={{ background:'var(--surface)', borderRadius:14, padding:24, width:'100%', maxWidth:440, boxShadow:'0 8px 32px rgba(0,0,0,.25)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
              <div>
                <h3 style={{ margin:0, fontSize:17, fontWeight:700 }}>{activeWO.title || 'Work Order'}</h3>
                <div style={{ color:'var(--text3)', fontSize:13, marginTop:4 }}>{activeWO.stores?.name}</div>
              </div>
              <button onClick={() => setActiveWO(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--text3)', lineHeight:1 }}>×</button>
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
              <span style={{ background:P_COLORS[activeWO.priority]+'22', color:P_COLORS[activeWO.priority], borderRadius:6, padding:'2px 10px', fontSize:12, fontWeight:700, border:`1px solid ${P_COLORS[activeWO.priority]}` }}>
                {activeWO.priority}
              </span>
              {(() => { const c = STATUS_CFG[activeWO.status] || STATUS_CFG.open
                return <span style={{ background:c.bg, color:c.text, border:`1px solid ${c.border}`, borderRadius:6, padding:'2px 10px', fontSize:12, fontWeight:600 }}>{c.label}</span>
              })()}
            </div>
            {activeWO.description && (
              <p style={{ fontSize:13, color:'var(--text2)', margin:'0 0 16px', lineHeight:1.5 }}>{activeWO.description}</p>
            )}
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', flexWrap:'wrap' }}>
              <button onClick={() => navigate(`/work-orders/${activeWO.id}`)} style={{
                background:'var(--surface)', border:'1px solid var(--border)',
                borderRadius:8, padding:'8px 14px', fontSize:13, cursor:'pointer', color:'var(--text)',
              }}>📄 Full Details</button>
              {NEXT_STATUS[activeWO.status] && (
                <button
                  disabled={saving}
                  onClick={() => quickStatus(activeWO, NEXT_STATUS[activeWO.status].next)}
                  style={{
                    background:'var(--green)', color:'white', border:'none',
                    borderRadius:8, padding:'8px 16px', fontSize:13, cursor:'pointer', fontWeight:600,
                    opacity: saving ? 0.6 : 1,
                  }}>
                  {saving ? 'Saving…' : NEXT_STATUS[activeWO.status].label}
                </button>
              )}
              <button onClick={() => { setShowHold(true) }} style={{
                background:'#FBE9E7', color:'#BF360C', border:'1px solid #E24B4A',
                borderRadius:8, padding:'8px 14px', fontSize:13, cursor:'pointer', fontWeight:600,
              }}>⏸ Hold</button>
            </div>
          </div>
        </div>
      )}

      {/* Hold reason modal */}
      {showHold && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1010, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'var(--surface)', borderRadius:14, padding:24, width:'100%', maxWidth:360 }}>
            <h3 style={{ margin:'0 0 12px', fontSize:16 }}>Reason for Hold</h3>
            <textarea value={holdReason} onChange={e => setHoldReason(e.target.value)}
              placeholder="Describe why this is on hold…"
              style={{ width:'100%', minHeight:80, borderRadius:8, border:'1px solid var(--border)', padding:10, fontSize:13, background:'var(--bg)', color:'var(--text)', resize:'vertical', boxSizing:'border-box' }}/>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:12 }}>
              <button onClick={() => setShowHold(false)} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 14px', fontSize:13, cursor:'pointer', color:'var(--text)' }}>Cancel</button>
              <button onClick={submitHold} disabled={saving || !holdReason.trim()} style={{ background:'#E24B4A', color:'white', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, cursor:'pointer', fontWeight:600, opacity: saving?0.6:1 }}>
                {saving ? 'Saving…' : 'Confirm Hold'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tech coverage assignment modal */}
      {showAssign && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1010, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ background:'var(--surface)', borderRadius:14, padding:24, width:'100%', maxWidth:400 }}>
            <h3 style={{ margin:'0 0 16px', fontSize:16 }}>Assign Technician to Store</h3>
            <select value={assignStore} onChange={e => setAssignStore(e.target.value)}
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--border)', marginBottom:10, fontSize:13, background:'var(--bg)', color:'var(--text)' }}>
              <option value=''>Select store…</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select value={assignTech} onChange={e => setAssignTech(e.target.value)}
              style={{ width:'100%', padding:'10px 12px', borderRadius:8, border:'1px solid var(--border)', marginBottom:16, fontSize:13, background:'var(--bg)', color:'var(--text)' }}>
              <option value=''>Select technician…</option>
              {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
              <button onClick={() => setShowAssign(false)} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 14px', fontSize:13, cursor:'pointer', color:'var(--text)' }}>Cancel</button>
              <button onClick={saveAssignment} disabled={!assignStore||!assignTech} style={{ background:'var(--green)', color:'white', border:'none', borderRadius:8, padding:'8px 16px', fontSize:13, cursor:'pointer', fontWeight:600, opacity:(!assignStore||!assignTech)?0.5:1 }}>Save Assignment</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
