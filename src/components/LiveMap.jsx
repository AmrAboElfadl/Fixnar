import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const BRANCHES = [
  // JJ Chicken — official locations from jjchicken.com
  { id:'b1',  name:'JJ — Al Barsha',        lat:25.1122, lng:55.1986 },
  { id:'b2',  name:'JJ — Al Raha Mall',     lat:24.4194, lng:54.6254 },
  { id:'b3',  name:'JJ — DFC / WTC',        lat:25.2258, lng:55.2867 },
  { id:'b4',  name:'JJ — Discovery Garden', lat:25.0346, lng:55.1502 },
  { id:'b5',  name:'JJ — Dubai Mall',       lat:25.1977, lng:55.2796 },
  { id:'b6',  name:'JJ — Kite Beach',       lat:25.1990, lng:55.2311 },
  { id:'b7',  name:'JJ — Mirdif CC',        lat:25.2291, lng:55.4139 },
  { id:'b8',  name:'JJ — Motor City',       lat:25.0514, lng:55.2405 },
  { id:'b9',  name:'JJ — Festival City',    lat:25.2311, lng:55.3519 },
  { id:'b10', name:'JJ — Reem Mall AUH',   lat:24.5013, lng:54.6077 },
  { id:'b11', name:'JJ — AUH Corniche',    lat:24.4930, lng:54.3564 },
  // JJ Derawandi / Solidare / JV — approximate from known areas
  { id:'b12', name:'JJ Derawandi — Al Wasl', lat:25.1862, lng:55.2445 },
  { id:'b13', name:'JJ Derawandi — AUH',     lat:24.4539, lng:54.3773 },
  { id:'b14', name:'Solidare — Jimi Mall',   lat:24.2219, lng:55.7306 },
  { id:'b15', name:'JJ — Shmkha AUH',        lat:24.3185, lng:54.5219 },
  { id:'b16', name:'JV — Dubai Mall',         lat:25.1972, lng:55.2800 },
  { id:'b17', name:'JV — Jumeirah',           lat:25.2042, lng:55.2500 },
  { id:'b18', name:'Derawandi Truck Adnoc',   lat:24.4333, lng:54.3947 },
]

// ── Tile math ────────────────────────────────────────────────────────────────
function latLngToTile(lat, lng, zoom) {
  const n = Math.pow(2, zoom)
  const x = Math.floor((lng + 180) / 360 * n)
  const latRad = lat * Math.PI / 180
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n)
  return { x, y }
}

function latLngToPixel(lat, lng, centerLat, centerLng, zoom, W, H) {
  const scale = Math.pow(2, zoom)
  const worldSize = 256 * scale

  const toMercX = lng => (lng + 180) / 360 * worldSize
  const toMercY = lat => {
    const r = lat * Math.PI / 180
    return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * worldSize
  }

  const cx = toMercX(centerLng), cy = toMercY(centerLat)
  const px = toMercX(lng),       py = toMercY(lat)

  return { x: W/2 + (px - cx), y: H/2 + (py - cy) }
}

// ── Tile canvas renderer ─────────────────────────────────────────────────────
function TileCanvas({ centerLat, centerLng, zoom, width, height }) {
  const canvasRef = useRef(null)
  const tilesRef  = useRef({})

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, width, height)

    const tileSize = 256
    const scale    = Math.pow(2, zoom)
    const worldSize= tileSize * scale

    const toMercX = lng => (lng + 180) / 360 * worldSize
    const toMercY = lat => {
      const r = lat * Math.PI / 180
      return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * worldSize
    }

    const cx = toMercX(centerLng)
    const cy = toMercY(centerLat)

    // Range of tiles needed
    const startX = Math.floor((cx - width/2) / tileSize)
    const startY = Math.floor((cy - height/2) / tileSize)
    const endX   = Math.ceil( (cx + width/2) / tileSize)
    const endY   = Math.ceil( (cy + height/2) / tileSize)

    const subdomain = ['a','b','c']

    for (let tx = startX; tx <= endX; tx++) {
      for (let ty = startY; ty <= endY; ty++) {
        const tileX = ((tx % scale) + scale) % scale
        const tileY = ((ty % scale) + scale) % scale
        const key   = `${zoom}-${tileX}-${tileY}`
        const drawX = Math.round(tx * tileSize - (cx - width/2))
        const drawY = Math.round(ty * tileSize - (cy - height/2))
        const sub   = subdomain[(tileX + tileY) % 3]
        const url   = `https://${sub}.tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`

        const draw = img => ctx.drawImage(img, drawX, drawY, tileSize, tileSize)

        if (tilesRef.current[key]) {
          draw(tilesRef.current[key])
        } else {
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => {
            tilesRef.current[key] = img
            ctx.drawImage(img, drawX, drawY, tileSize, tileSize)
          }
          img.src = url
        }
      }
    }
  }, [centerLat, centerLng, zoom, width, height])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ position:'absolute', top:0, left:0 }}
    />
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LiveMap() {
  const { profile, isAdmin } = useAuth()

  const containerRef = useRef(null)
  const [mapW, setMapW] = useState(900)
  const W = mapW, H = 520

  useEffect(() => {
    function updateWidth() {
      if (containerRef.current) setMapW(containerRef.current.offsetWidth)
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  const [wos,        setWos]        = useState([])
  const [techs,      setTechs]      = useState([])
  const [techLocs,   setTechLocs]   = useState({})
  const [tracking,   setTracking]   = useState(false)
  const [gpsError,   setGpsError]   = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [tooltip,    setTooltip]    = useState(null)
  const [zoom,       setZoom]       = useState(9)
  const [center,     setCenter]     = useState({ lat:25.05, lng:55.25 })
  const [dragging,   setDragging]   = useState(false)
  const [dragStart,  setDragStart]  = useState(null)

  const watchRef   = useRef(null)
  const timerRef   = useRef(null)
  const refreshRef = useRef(null)

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

  function startTracking() {
    if (!navigator.geolocation) { setGpsError('GPS not supported'); return }
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

  function toXY(lat, lng) {
    return latLngToPixel(lat, lng, center.lat, center.lng, zoom, W, H)
  }

  function zoomTo(lat, lng, z=11) {
    setCenter({ lat, lng })
    setZoom(z)
  }

  // Drag to pan
  function onMouseDown(e) {
    setDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY, lat: center.lat, lng: center.lng })
  }

  function onMouseMove(e) {
    if (!dragging || !dragStart) return
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    const scale = Math.pow(2, zoom) * 256
    const dLng  = -dx / scale * 360
    const dLat  =  dy / scale * 180 / Math.PI
    setCenter({ lat: dragStart.lat + dLat, lng: dragStart.lng + dLng })
  }

  function onMouseUp() { setDragging(false); setDragStart(null) }

  function onWheel(e) {
    e.preventDefault()
    setZoom(z => Math.max(6, Math.min(16, z + (e.deltaY < 0 ? 1 : -1))))
  }

  // Derived
  const woByTech = {}
  wos.forEach(wo => {
    if (!woByTech[wo.assigned_to]) woByTech[wo.assigned_to] = []
    woByTech[wo.assigned_to].push(wo)
  })
  const activeTechs = techs.filter(t => techLocs[t.id])
  const markerR = Math.max(8, Math.min(14, zoom - 2))

  return (
    <div style={{color:'var(--text)'}}>

      {/* Top bar */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10,marginBottom:12}}>
        <div style={{display:'flex',gap:18,alignItems:'center',flexWrap:'wrap'}}>
          <span style={{fontSize:13,color:'var(--text3)'}}>🏪 <b style={{color:'var(--text)'}}>{BRANCHES.length}</b> branches</span>
          <span style={{fontSize:13,color:'var(--text3)'}}>👷 <b style={{color:'var(--text)'}}>{activeTechs.length}</b>/{techs.length} online</span>
          <span style={{fontSize:13,color:'var(--text3)'}}>🔧 <b style={{color:'var(--text)'}}>{wos.length}</b> open jobs</span>
          {lastUpdate && <span style={{fontSize:11,color:'var(--text3)'}}>· {lastUpdate.toLocaleTimeString()}</span>}
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button onClick={() => { setCenter({lat:25.18,lng:55.28}); setZoom(12) }}
            style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 10px',fontSize:12,cursor:'pointer',color:'var(--text)'}}>Dubai</button>
          <button onClick={() => { setCenter({lat:24.48,lng:54.37}); setZoom(12) }}
            style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 10px',fontSize:12,cursor:'pointer',color:'var(--text)'}}>Abu Dhabi</button>
          <button onClick={() => { setCenter({lat:25.05,lng:55.25}); setZoom(9) }}
            style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 10px',fontSize:12,cursor:'pointer',color:'var(--text)'}}>🇦🇪 All UAE</button>
          <button onClick={loadData}
            style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 10px',fontSize:12,cursor:'pointer',color:'var(--text)'}}>↻</button>
          {!isAdmin && (
            <button onClick={tracking ? stopTracking : startTracking} style={{
              background:tracking?'#E24B4A':'#1D9E75',color:'#fff',
              border:'none',borderRadius:8,padding:'6px 14px',fontSize:12,cursor:'pointer',fontWeight:600,
            }}>
              {tracking ? '⏹ Stop' : '📍 Share Location'}
            </button>
          )}
        </div>
      </div>

      {gpsError && <div style={{background:'#FBE9E7',color:'#BF360C',borderRadius:8,padding:'8px 12px',marginBottom:10,fontSize:12}}>⚠️ {gpsError}</div>}

      {/* Map container */}
      <div
        ref={containerRef}
        style={{
          position:'relative', width:'100%', height:H,
          borderRadius:12, overflow:'hidden',
          border:'1px solid var(--border)',
          cursor: dragging ? 'grabbing' : 'grab',
          userSelect:'none',
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        {/* OSM tile layer */}
        <TileCanvas centerLat={center.lat} centerLng={center.lng} zoom={zoom} width={W} height={H}/>

        {/* SVG marker overlay */}
        <svg
          width="100%" height="100%"
          style={{position:'absolute',top:0,left:0,pointerEvents:'none'}}
          viewBox={`0 0 ${W} ${H}`}
        >
          {/* Branch markers */}
          {BRANCHES.map(b => {
            const {x, y} = toXY(b.lat, b.lng)
            if (x < -50 || x > W+50 || y < -50 || y > H+50) return null
            const hasWO = false
            const color = hasWO ? '#E24B4A' : '#1D9E75'
            return (
              <g key={b.id} style={{pointerEvents:'all',cursor:'pointer'}}
                onClick={e => { e.stopPropagation(); zoomTo(b.lat, b.lng, Math.max(zoom, 13)) }}
                onMouseEnter={e => setTooltip({x:e.clientX, y:e.clientY, text:`🏪 ${b.name}`})}
                onMouseLeave={() => setTooltip(null)}
              >
                <circle cx={x} cy={y} r={markerR+4} fill={color} opacity="0.2"/>
                <circle cx={x} cy={y} r={markerR} fill={color} stroke="#fff" strokeWidth="2.5"/>
                <text x={x} y={y+1} textAnchor="middle" dominantBaseline="middle"
                  fontSize={markerR*0.9} fill="#fff" fontWeight="700" fontFamily="system-ui"
                  style={{pointerEvents:'none'}}>🏪</text>
                {zoom >= 10 && (
                  <text x={x} y={y - markerR - 5} textAnchor="middle"
                    fontSize="11" fill="#fff" fontWeight="700" fontFamily="system-ui"
                    style={{pointerEvents:'none',filter:'drop-shadow(0 1px 2px rgba(0,0,0,0.6))'}}>
                    {b.name}
                  </text>
                )}
              </g>
            )
          })}

          {/* Technician markers */}
          {techs.map(tech => {
            const loc = techLocs[tech.id]
            if (!loc?.latitude || !loc?.longitude) return null
            const lat = parseFloat(loc.latitude)
            const lng = parseFloat(loc.longitude)
            const {x, y} = toXY(lat, lng)
            if (x < -50 || x > W+50 || y < -50 || y > H+50) return null
            const age    = (Date.now() - new Date(loc.updated_at)) / 60000
            const recent = age < 10
            const color  = recent ? '#7F77DD' : '#9e9e9e'
            const init   = tech.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
            const myWOs  = woByTech[tech.id] || []
            return (
              <g key={tech.id} style={{pointerEvents:'all',cursor:'pointer'}}
                onClick={e => { e.stopPropagation(); zoomTo(lat, lng, Math.max(zoom, 14)) }}
                onMouseEnter={e => setTooltip({x:e.clientX, y:e.clientY,
                  text:`${tech.full_name} · ${recent?`${Math.floor(age)}m ago`:'offline'}${myWOs.length?` · ${myWOs.length} job${myWOs.length>1?'s':''}`:''}`})}
                onMouseLeave={() => setTooltip(null)}
              >
                {recent && <circle cx={x} cy={y} r={markerR+8} fill={color} opacity="0.15"/>}
                <circle cx={x} cy={y} r={markerR+2} fill={color} stroke="#fff" strokeWidth="2.5"/>
                <text x={x} y={y+1} textAnchor="middle" dominantBaseline="middle"
                  fontSize={markerR*0.85} fill="#fff" fontWeight="700" fontFamily="system-ui"
                  style={{pointerEvents:'none'}}>{init}</text>
                {myWOs.length > 0 && (
                  <g>
                    <circle cx={x+markerR} cy={y-markerR} r={7} fill="#E24B4A" stroke="#fff" strokeWidth="1.5"/>
                    <text x={x+markerR} y={y-markerR+1} textAnchor="middle" dominantBaseline="middle"
                      fontSize="8" fill="#fff" fontWeight="700" style={{pointerEvents:'none'}}>{myWOs.length}</text>
                  </g>
                )}
                {zoom >= 11 && (
                  <text x={x} y={y+markerR+14} textAnchor="middle"
                    fontSize="11" fill={color} fontWeight="700" fontFamily="system-ui"
                    style={{pointerEvents:'none',filter:'drop-shadow(0 1px 2px rgba(255,255,255,0.8))'}}>
                    {tech.full_name.split(' ')[0]}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {/* Zoom controls */}
        <div style={{position:'absolute',bottom:16,right:16,display:'flex',flexDirection:'column',gap:4,zIndex:10}}>
          <button onClick={() => setZoom(z => Math.min(16, z+1))}
            style={{width:32,height:32,borderRadius:8,background:'#fff',border:'1px solid #ccc',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 6px rgba(0,0,0,.2)'}}>+</button>
          <button onClick={() => setZoom(z => Math.max(6, z-1))}
            style={{width:32,height:32,borderRadius:8,background:'#fff',border:'1px solid #ccc',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',boxShadow:'0 2px 6px rgba(0,0,0,.2)'}}>−</button>
        </div>

        {/* Attribution */}
        <div style={{position:'absolute',bottom:6,left:10,fontSize:10,color:'#666',background:'rgba(255,255,255,0.7)',borderRadius:4,padding:'1px 5px'}}>
          © OpenStreetMap contributors
        </div>

        {/* Zoom level indicator */}
        <div style={{position:'absolute',top:10,right:10,fontSize:11,color:'#555',background:'rgba(255,255,255,0.85)',borderRadius:6,padding:'3px 8px',boxShadow:'0 1px 4px rgba(0,0,0,.15)'}}>
          Zoom {zoom} · Scroll or +/− to zoom · Drag to pan
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{
          position:'fixed',left:tooltip.x+12,top:tooltip.y-10,zIndex:9999,
          background:'rgba(0,0,0,0.85)',color:'#fff',borderRadius:8,
          padding:'6px 10px',fontSize:12,pointerEvents:'none',
          boxShadow:'0 2px 8px rgba(0,0,0,0.3)',maxWidth:220,
        }}>
          {tooltip.text}
        </div>
      )}

      {/* Technician cards */}
      {techs.length > 0 && (
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:12}}>
          {techs.map(tech => {
            const loc    = techLocs[tech.id]
            const age    = loc ? (Date.now() - new Date(loc.updated_at)) / 60000 : null
            const recent = age !== null && age < 10
            const woCnt  = (woByTech[tech.id] || []).length
            return (
              <div key={tech.id}
                onClick={() => { if (loc) zoomTo(parseFloat(loc.latitude), parseFloat(loc.longitude), 14) }}
                style={{display:'flex',alignItems:'center',gap:8,padding:'8px 12px',background:'var(--surface)',border:`1.5px solid ${recent?'#7F77DD':'var(--border)'}`,borderRadius:10,cursor:loc?'pointer':'default',minWidth:140}}
              >
                <div style={{width:32,height:32,borderRadius:'50%',background:recent?'#7F77DD':'#9e9e9e',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,flexShrink:0}}>
                  {tech.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div>
                  <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{tech.full_name.split(' ')[0]}</div>
                  <div style={{fontSize:11,color:recent?'#7F77DD':'var(--text3)'}}>
                    {recent ? `🟢 ${age<1?'just now':`${Math.floor(age)}m ago`}${woCnt?` · ${woCnt} job${woCnt>1?'s':''}`:''}`
                      : loc ? `⚫ ${Math.floor(age)}m ago` : '⚫ not sharing'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p style={{color:'var(--text3)',fontSize:11,marginTop:10}}>
        🏪 Branch pins · 🟣 Technician live location · Click any pin to zoom · Scroll to zoom · Drag to pan · Auto-refreshes every 30s
      </p>
    </div>
  )
}
