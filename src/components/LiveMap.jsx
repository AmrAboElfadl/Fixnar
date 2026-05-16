import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// ── All 18 branch locations ──────────────────────────────────────────────────
const BRANCHES = [
  { id:'b1',  name:'Al Barsha',        lat:25.1003, lng:55.1734 },
  { id:'b2',  name:'Al Raha Mall',     lat:24.4686, lng:54.6041 },
  { id:'b3',  name:'DFC',              lat:25.2327, lng:55.3267 },
  { id:'b4',  name:'Discovery Garden', lat:25.0480, lng:55.1500 },
  { id:'b5',  name:'Dubai Mall',       lat:25.1972, lng:55.2796 },
  { id:'b6',  name:'Kite Beach',       lat:25.1878, lng:55.2485 },
  { id:'b7',  name:'Mirdif',           lat:25.2217, lng:55.4072 },
  { id:'b8',  name:'Motor City',       lat:25.0700, lng:55.2500 },
  { id:'b9',  name:'WTC',              lat:25.2285, lng:55.2867 },
  { id:'b10', name:'Derawandi AUH',    lat:24.4241, lng:54.4699 },
  { id:'b11', name:'Al Wasl',          lat:25.1973, lng:55.2522 },
  { id:'b12', name:'Reem Mall',        lat:24.5477, lng:54.3818 },
  { id:'b13', name:'Shmkha',           lat:24.4695, lng:54.3277 },
  { id:'b14', name:'Jimi Mall',        lat:24.2154, lng:55.7554 },
  { id:'b15', name:'JV Dubai Mall',    lat:25.1960, lng:55.2790 },
  { id:'b16', name:'JV Jumeirah',      lat:25.2099, lng:55.2476 },
  { id:'b17', name:'JV Abu Dhabi',     lat:24.4052, lng:54.5014 },
  { id:'b18', name:'Adnoc Truck',      lat:24.4500, lng:54.3700 },
]

// ── Map projection helpers ───────────────────────────────────────────────────
// UAE bounding box
const MAP = { minLat:23.8, maxLat:25.7, minLng:51.5, maxLng:56.5 }

function toXY(lat, lng, W, H) {
  const x = ((lng - MAP.minLng) / (MAP.maxLng - MAP.minLng)) * W
  const y = H - ((lat - MAP.minLat) / (MAP.maxLat - MAP.minLat)) * H
  return { x, y }
}

// ── Main component ───────────────────────────────────────────────────────────
export default function LiveMap() {
  const { profile, isAdmin } = useAuth()

  const [wos,        setWos]        = useState([])
  const [techs,      setTechs]      = useState([])
  const [techLocs,   setTechLocs]   = useState({})
  const [tracking,   setTracking]   = useState(false)
  const [gpsError,   setGpsError]   = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [tooltip,    setTooltip]    = useState(null)  // {x,y,text}
  const [zoom,       setZoom]       = useState({ cx:25.05, cy:55.0, scale:1 })

  const svgRef    = useRef(null)
  const watchRef  = useRef(null)
  const timerRef  = useRef(null)
  const refreshRef= useRef(null)

  const W = 800, H = 500

  useEffect(() => {
    loadData()
    refreshRef.current = setInterval(loadTechLocs, 30000)
    return () => { clearInterval(refreshRef.current); stopTracking() }
  }, [])

  async function loadData() {
    const safe = p => p.catch(() => ({ data:[] }))
    const [woRes, techRes] = await Promise.all([
      safe(supabase.from('work_orders').select('id,store_id,assigned_to,status,title,priority').neq('status','closed')),
      safe(supabase.from('profiles').select('id,full_name,phone').eq('role','technician')),
    ])
    setWos(woRes.data || [])
    setTechs(techRes.data || [])
    await loadTechLocs()
  }

  async function loadTechLocs() {
    try {
      const res = await supabase.from('technician_locations').select('*')
      const locs = {}
      ;(res.data || []).forEach(l => { locs[l.technician_id] = l })
      setTechLocs(locs)
      setLastUpdate(new Date())
    } catch {}
  }

  // GPS tracking
  function startTracking() {
    if (!navigator.geolocation) { setGpsError('GPS not supported on this device'); return }
    setTracking(true); setGpsError(null)
    const push = pos => supabase.from('technician_locations').upsert({
      technician_id: profile.id,
      latitude:   pos.coords.latitude,
      longitude:  pos.coords.longitude,
      accuracy:   pos.coords.accuracy,
      updated_at: new Date().toISOString(),
    }, { onConflict:'technician_id' }).catch(() => {})
    navigator.geolocation.getCurrentPosition(push, ()=>{}, { enableHighAccuracy:true })
    watchRef.current = navigator.geolocation.watchPosition(push, e => setGpsError(e.message), { enableHighAccuracy:true })
    timerRef.current = setInterval(() => navigator.geolocation.getCurrentPosition(push, ()=>{}, { enableHighAccuracy:true }), 60000)
  }

  function stopTracking() {
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
    watchRef.current = null; timerRef.current = null
    setTracking(false)
  }

  // Zoom into a point
  function zoomTo(lat, lng, scale=4) {
    setZoom({ cx:lat, cy:lng, scale })
  }
  function resetZoom() { setZoom({ cx:25.05, cy:55.0, scale:1 }) }

  // SVG viewBox based on zoom
  function getViewBox() {
    const latSpan = (MAP.maxLat - MAP.minLat) / zoom.scale
    const lngSpan = (MAP.maxLng - MAP.minLng) / zoom.scale
    const minLat  = zoom.cx - latSpan/2
    const minLng  = zoom.cy - lngSpan/2

    // Convert to SVG coords
    const x1 = ((minLng - MAP.minLng) / (MAP.maxLng - MAP.minLng)) * W
    const y1 = H - ((minLat + latSpan - MAP.minLat) / (MAP.maxLat - MAP.minLat)) * H
    const vW  = (lngSpan / (MAP.maxLng - MAP.minLng)) * W
    const vH  = (latSpan / (MAP.maxLat - MAP.minLat)) * H
    return `${x1} ${y1} ${vW} ${vH}`
  }

  // Derived
  const woByTech = {}
  wos.forEach(wo => {
    if (!woByTech[wo.assigned_to]) woByTech[wo.assigned_to] = []
    woByTech[wo.assigned_to].push(wo)
  })
  const activeTechs = techs.filter(t => techLocs[t.id])

  // Marker size scaled by zoom
  const ms = Math.max(4, 8 / zoom.scale)  // marker size
  const ts = Math.max(6, 10 / zoom.scale) // text size

  return (
    <div style={{color:'var(--text)'}}>

      {/* ── Top bar ── */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10,marginBottom:12}}>
        <div style={{display:'flex',gap:18,alignItems:'center',flexWrap:'wrap'}}>
          <span style={{fontSize:13,color:'var(--text3)'}}>🏪 <b style={{color:'var(--text)'}}>{BRANCHES.length}</b> branches</span>
          <span style={{fontSize:13,color:'var(--text3)'}}>👷 <b style={{color:'var(--text)'}}>{activeTechs.length}</b>/{techs.length} online</span>
          <span style={{fontSize:13,color:'var(--text3)'}}>🔧 <b style={{color:'var(--text)'}}>{wos.length}</b> open jobs</span>
          {lastUpdate && <span style={{fontSize:11,color:'var(--text3)'}}>· {lastUpdate.toLocaleTimeString()}</span>}
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          {zoom.scale > 1 && (
            <button onClick={resetZoom} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 12px',fontSize:12,cursor:'pointer',color:'var(--text)'}}>
              ← Back to UAE
            </button>
          )}
          <button onClick={loadData} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 12px',fontSize:12,cursor:'pointer',color:'var(--text)'}}>↻ Refresh</button>
          {!isAdmin && (
            <button onClick={tracking ? stopTracking : startTracking} style={{
              background:tracking?'#E24B4A':'#1D9E75',color:'#fff',
              border:'none',borderRadius:8,padding:'6px 14px',fontSize:12,cursor:'pointer',fontWeight:600,
            }}>
              {tracking ? '⏹ Stop Sharing' : '📍 Share My Location'}
            </button>
          )}
        </div>
      </div>

      {gpsError && <div style={{background:'#FBE9E7',color:'#BF360C',borderRadius:8,padding:'8px 12px',marginBottom:10,fontSize:12}}>⚠️ {gpsError}</div>}

      {/* ── Legend ── */}
      <div style={{display:'flex',gap:16,marginBottom:10,flexWrap:'wrap'}}>
        <span style={{fontSize:12,color:'var(--text3)',display:'flex',alignItems:'center',gap:5}}>
          <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#1D9E75"/></svg> Branch — all clear
        </span>
        <span style={{fontSize:12,color:'var(--text3)',display:'flex',alignItems:'center',gap:5}}>
          <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#E24B4A"/></svg> Branch — open work orders
        </span>
        <span style={{fontSize:12,color:'var(--text3)',display:'flex',alignItems:'center',gap:5}}>
          <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#7F77DD"/></svg> Technician (live)
        </span>
        <span style={{fontSize:12,color:'var(--text3)',display:'flex',alignItems:'center',gap:5}}>
          <svg width="14" height="14"><circle cx="7" cy="7" r="6" fill="#9e9e9e"/></svg> Technician (offline)
        </span>
      </div>

      {/* ── SVG Map ── */}
      <div style={{position:'relative',borderRadius:12,overflow:'hidden',border:'1px solid var(--border)',background:'#e8f4f8'}}>
        <svg
          ref={svgRef}
          width="100%"
          viewBox={getViewBox()}
          style={{display:'block',cursor:'default'}}
          onMouseLeave={() => setTooltip(null)}
        >
          {/* UAE landmass background */}
          <rect x="0" y="0" width={W} height={H} fill="#e8f4f8"/>

          {/* Simple UAE coastline approximation as decorative fill */}
          <rect x="0" y="0" width={W} height={H} fill="#d4e8c2" opacity="0.3"/>

          {/* Grid lines */}
          {[52, 53, 54, 55, 56].map(lng => {
            const {x} = toXY(MAP.minLat, lng, W, H)
            return <line key={lng} x1={x} y1={0} x2={x} y2={H} stroke="#ccc" strokeWidth="0.5" strokeDasharray="4,4"/>
          })}
          {[24, 24.5, 25, 25.5].map(lat => {
            const {y} = toXY(lat, MAP.minLng, W, H)
            return <line key={lat} x1={0} y1={y} x2={W} y2={y} stroke="#ccc" strokeWidth="0.5" strokeDasharray="4,4"/>
          })}

          {/* City labels */}
          {[
            {name:'Dubai',    lat:25.2048, lng:55.2708},
            {name:'Abu Dhabi',lat:24.4539, lng:54.3773},
            {name:'Sharjah',  lat:25.3463, lng:55.4209},
            {name:'Al Ain',   lat:24.2075, lng:55.7447},
          ].map(city => {
            const {x,y} = toXY(city.lat, city.lng, W, H)
            return (
              <text key={city.name} x={x} y={y} fontSize={ts*1.4} fill="#999" textAnchor="middle" fontFamily="system-ui" opacity="0.7">
                {city.name}
              </text>
            )
          })}

          {/* ── Branch markers ── */}
          {BRANCHES.map(b => {
            const {x, y} = toXY(b.lat, b.lng, W, H)
            const branchWOs = wos.filter(w => {
              // Match branch by name fragment
              return false // WO matching requires store IDs — show all green for now
            })
            const hasWO = false
            const color = hasWO ? '#E24B4A' : '#1D9E75'
            return (
              <g key={b.id}
                style={{cursor:'pointer'}}
                onClick={() => zoomTo(b.lat, b.lng, 5)}
                onMouseEnter={e => setTooltip({ x: e.clientX, y: e.clientY, text: b.name })}
                onMouseLeave={() => setTooltip(null)}
              >
                {/* Outer ring */}
                <circle cx={x} cy={y} r={ms * 1.8} fill={color} opacity="0.2"/>
                {/* Main dot */}
                <circle cx={x} cy={y} r={ms} fill={color} stroke="#fff" strokeWidth={ms*0.3}/>
                {/* Label */}
                <text x={x} y={y - ms - 2} fontSize={ts} fill="#333" textAnchor="middle" fontFamily="system-ui" fontWeight="600"
                  style={{pointerEvents:'none', textShadow:'0 1px 2px white'}}>
                  {b.name}
                </text>
              </g>
            )
          })}

          {/* ── Technician markers ── */}
          {techs.map(tech => {
            const loc = techLocs[tech.id]
            if (!loc?.latitude || !loc?.longitude) return null
            const lat = parseFloat(loc.latitude)
            const lng = parseFloat(loc.longitude)
            // Only show if within UAE bounds
            if (lat < MAP.minLat || lat > MAP.maxLat || lng < MAP.minLng || lng > MAP.maxLng) return null
            const {x, y} = toXY(lat, lng, W, H)
            const age    = (Date.now() - new Date(loc.updated_at)) / 60000
            const recent = age < 10
            const color  = recent ? '#7F77DD' : '#9e9e9e'
            const init   = tech.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
            const myWOs  = woByTech[tech.id] || []
            return (
              <g key={tech.id}
                style={{cursor:'pointer'}}
                onClick={() => zoomTo(lat, lng, 6)}
                onMouseEnter={e => setTooltip({ x:e.clientX, y:e.clientY, text:`${tech.full_name}${myWOs.length ? ` · ${myWOs.length} job${myWOs.length>1?'s':''}` : ''} · ${age<1?'just now':`${Math.floor(age)}m ago`}` })}
                onMouseLeave={() => setTooltip(null)}
              >
                {/* Pulse ring for recent */}
                {recent && <circle cx={x} cy={y} r={ms*2.5} fill={color} opacity="0.15"/>}
                {/* Circle */}
                <circle cx={x} cy={y} r={ms*1.4} fill={color} stroke="#fff" strokeWidth={ms*0.25}/>
                {/* Initials */}
                <text x={x} y={y+ts*0.35} fontSize={ts*0.9} fill="#fff" textAnchor="middle" fontFamily="system-ui" fontWeight="700"
                  style={{pointerEvents:'none'}}>
                  {init}
                </text>
                {/* WO badge */}
                {myWOs.length > 0 && (
                  <g>
                    <circle cx={x+ms*1.2} cy={y-ms*1.2} r={ms*0.8} fill="#E24B4A" stroke="#fff" strokeWidth="1"/>
                    <text x={x+ms*1.2} y={y-ms*1.2+ts*0.3} fontSize={ts*0.8} fill="#fff" textAnchor="middle" fontFamily="system-ui" fontWeight="700"
                      style={{pointerEvents:'none'}}>
                      {myWOs.length}
                    </text>
                  </g>
                )}
                {/* Name label */}
                <text x={x} y={y+ms*1.8+ts} fontSize={ts} fill={color} textAnchor="middle" fontFamily="system-ui" fontWeight="600"
                  style={{pointerEvents:'none'}}>
                  {tech.full_name.split(' ')[0]}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Zoom hint */}
        <div style={{position:'absolute',bottom:10,right:12,fontSize:11,color:'#888',background:'rgba(255,255,255,0.8)',borderRadius:6,padding:'3px 8px'}}>
          Click any pin to zoom in
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position:'fixed', left:tooltip.x+12, top:tooltip.y-10, zIndex:9999,
          background:'rgba(0,0,0,0.85)', color:'#fff', borderRadius:8,
          padding:'6px 10px', fontSize:12, pointerEvents:'none', maxWidth:200,
          boxShadow:'0 2px 8px rgba(0,0,0,0.3)',
        }}>
          {tooltip.text}
        </div>
      )}

      {/* ── Technician status cards ── */}
      {techs.length > 0 && (
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:14}}>
          {techs.map(tech => {
            const loc    = techLocs[tech.id]
            const age    = loc ? (Date.now() - new Date(loc.updated_at)) / 60000 : null
            const recent = age !== null && age < 10
            const woCnt  = (woByTech[tech.id] || []).length
            return (
              <div key={tech.id}
                onClick={() => { if (loc) zoomTo(parseFloat(loc.latitude), parseFloat(loc.longitude), 6) }}
                style={{
                  display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
                  background:'var(--surface)', border:`1.5px solid ${recent?'#7F77DD':'var(--border)'}`,
                  borderRadius:10, cursor:loc?'pointer':'default', minWidth:140,
                }}
              >
                <div style={{width:32,height:32,borderRadius:'50%',background:recent?'#7F77DD':'#9e9e9e',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0}}>
                  {tech.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{tech.full_name.split(' ')[0]}</div>
                  <div style={{fontSize:11,color:recent?'#7F77DD':'var(--text3)'}}>
                    {recent
                      ? `🟢 ${age < 1 ? 'just now' : `${Math.floor(age)}m ago`}${woCnt ? ` · ${woCnt} job${woCnt>1?'s':''}` : ''}`
                      : loc
                        ? `⚫ ${Math.floor(age)}m ago`
                        : '⚫ not sharing'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p style={{color:'var(--text3)',fontSize:11,marginTop:10}}>
        Click any dot to zoom in · Auto-refreshes every 30s · Technicians must tap "Share My Location" on their device
      </p>
    </div>
  )
}
