import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// Store coordinates hardcoded as fallback in case Supabase lat/lng is empty
const STORE_COORDS = {
  'JJ Chicken - Al Barsha':       [25.1003, 55.1734],
  'JJ Chicken - Al Raha Mall':    [24.4686, 54.6041],
  'JJ Chicken - DFC':             [25.2327, 55.3267],
  'JJ Chicken - Discovery Garden':[25.0480, 55.1500],
  'JJ Chicken - Dubai Mall':      [25.1972, 55.2796],
  'JJ Chicken - Kite Beach':      [25.1878, 55.2485],
  'JJ Chicken - Mirdif (UR)':     [25.2217, 55.4072],
  'JJ Chicken - Motor City':      [25.0700, 55.2500],
  'JJ Chicken - WTC':             [25.2285, 55.2867],
  'JJ Derawandi - AUH':           [24.4241, 54.4699],
  'JJ Derawandi - Al Wasl':       [25.1973, 55.2522],
  'JJ Reem Mall':                 [24.5477, 54.3818],
  'JJ Shmkha':                    [24.4695, 54.3277],
  'Solidare Jimi Mall':           [24.2154, 55.7554],
  'JV Dubai Mall':                [25.1972, 55.2796],
  'JV Jumeirah':                  [25.2099, 55.2476],
  'JV Abu Dhabi Mall':            [24.4052, 54.5014],
  'Derwandi Truck Adnoc':         [24.4500, 54.3700],
}

export default function LiveMap({ height = 520 }) {
  const { profile, isAdmin } = useAuth()
  const mapRef     = useRef(null)
  const mapInst    = useRef(null)
  const storeMarkers  = useRef({})
  const techMarkers   = useRef({})
  const watchRef   = useRef(null)
  const timerRef   = useRef(null)
  const refreshRef = useRef(null)

  const [ready,      setReady]      = useState(false)   // Leaflet loaded
  const [stores,     setStores]     = useState([])
  const [techs,      setTechs]      = useState([])
  const [wos,        setWos]        = useState([])
  const [techLocs,   setTechLocs]   = useState({})
  const [tracking,   setTracking]   = useState(false)
  const [gpsError,   setGpsError]   = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [loading,    setLoading]    = useState(true)

  // ── Step 1: Load Leaflet into <head> once ──────────────────────────────────
  useEffect(() => {
    if (window.L) { setReady(true); return }

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => setReady(true)
    script.onerror = () => console.error('Leaflet failed to load')
    document.head.appendChild(script)

    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current)
      stopTracking()
    }
  }, [])

  // ── Step 2: Fetch data ─────────────────────────────────────────────────────
  useEffect(() => {
    loadData()
    refreshRef.current = setInterval(loadTechLocs, 30000)
    return () => clearInterval(refreshRef.current)
  }, [])

  // ── Step 3: Build map once BOTH ready AND stores loaded AND div mounted ────
  useEffect(() => {
    if (ready && stores.length > 0 && mapRef.current && !mapInst.current) {
      // Extra tick to ensure the div is painted
      requestAnimationFrame(() => {
        requestAnimationFrame(() => buildMap())
      })
    }
  }, [ready, stores])

  // ── Step 4: Update tech markers whenever locations change ──────────────────
  useEffect(() => {
    if (mapInst.current && window.L) updateTechMarkers()
  }, [techLocs, techs, wos])

  // ── Data loading ───────────────────────────────────────────────────────────
  async function loadData() {
    setLoading(true)
    const safe = p => p.catch(() => ({ data: [] }))
    const [storeRes, techRes, woRes] = await Promise.all([
      safe(supabase.from('stores').select('id,name,latitude,longitude,manager_name,phone')),
      safe(supabase.from('profiles').select('id,full_name,phone').eq('role','technician')),
      safe(supabase.from('work_orders').select('id,store_id,assigned_to,status,title,priority').neq('status','closed')),
    ])

    // Merge Supabase coords with hardcoded fallbacks
    const enriched = (storeRes.data || []).map(s => {
      const fallback = STORE_COORDS[s.name]
      return {
        ...s,
        latitude:  s.latitude  || (fallback ? fallback[0] : null),
        longitude: s.longitude || (fallback ? fallback[1] : null),
      }
    })

    setStores(enriched)
    setTechs(techRes.data  || [])
    setWos(woRes.data      || [])
    await loadTechLocs()
    setLoading(false)
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

  // ── Build map ──────────────────────────────────────────────────────────────
  function buildMap() {
    if (!mapRef.current || !window.L || mapInst.current) return
    const L = window.L

    const validStores = stores.filter(s => s.latitude && s.longitude)
    if (validStores.length === 0) return

    const avgLat = validStores.reduce((a,s) => a + parseFloat(s.latitude),  0) / validStores.length
    const avgLng = validStores.reduce((a,s) => a + parseFloat(s.longitude), 0) / validStores.length

    const map = L.map(mapRef.current, { zoomControl: true })
    map.setView([avgLat, avgLng], 10)
    mapInst.current = map

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)

    const bounds = []
    validStores.forEach(s => {
      const lat = parseFloat(s.latitude)
      const lng = parseFloat(s.longitude)
      bounds.push([lat, lng])

      const woCount   = wos.filter(w => w.store_id === s.id).length
      const shortName = s.name.includes('-') ? s.name.split('-').pop().trim() : s.name
      const color     = woCount > 0 ? '#E24B4A' : '#1D9E75'

      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${color};color:#fff;border-radius:8px;padding:4px 10px;font-size:11px;font-weight:700;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.35);border:2px solid #fff;font-family:system-ui">🏪 ${shortName}${woCount > 0 ? ` <span style="opacity:.85">(${woCount})</span>` : ''}</div>`,
        iconAnchor: [0, 0],
      })

      const m = L.marker([lat, lng], { icon }).addTo(map)
      m.bindPopup(`
        <div style="font-family:system-ui;min-width:170px">
          <b>${s.name}</b><br/>
          ${s.manager_name ? `👤 ${s.manager_name}<br/>` : ''}
          ${s.phone ? `📞 ${s.phone}<br/>` : ''}
          ${woCount > 0
            ? `<span style="color:#E24B4A;font-weight:600">🔴 ${woCount} open work order${woCount > 1 ? 's' : ''}</span>`
            : `<span style="color:#1D9E75">✅ All clear</span>`}
        </div>
      `)
      storeMarkers.current[s.id] = m
    })

    if (bounds.length > 1) map.fitBounds(bounds, { padding: [50, 50] })
    map.invalidateSize()

    // Draw tech markers now too (data may already be loaded)
    updateTechMarkers()
  }

  // ── Tech markers ───────────────────────────────────────────────────────────
  function updateTechMarkers() {
    if (!window.L || !mapInst.current) return
    const L = window.L

    Object.values(techMarkers.current).forEach(m => m.remove())
    techMarkers.current = {}

    const woByTech = {}
    wos.forEach(wo => {
      if (!woByTech[wo.assigned_to]) woByTech[wo.assigned_to] = []
      woByTech[wo.assigned_to].push(wo)
    })

    techs.forEach(tech => {
      const loc = techLocs[tech.id]
      if (!loc?.latitude || !loc?.longitude) return

      const lat    = parseFloat(loc.latitude)
      const lng    = parseFloat(loc.longitude)
      const age    = (Date.now() - new Date(loc.updated_at)) / 60000
      const recent = age < 10
      const myWOs  = woByTech[tech.id] || []
      const init   = tech.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

      const icon = L.divIcon({
        className: '',
        html: `
          <div style="position:relative;display:inline-block;font-family:system-ui">
            <div style="background:${recent?'#7F77DD':'#9e9e9e'};color:#fff;border-radius:50%;width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;box-shadow:0 3px 10px rgba(0,0,0,.4);border:3px solid ${recent?'#fff':'#ccc'}">${init}</div>
            ${myWOs.length ? `<div style="position:absolute;top:-4px;right:-4px;background:#E24B4A;color:#fff;border-radius:50%;width:18px;height:18px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;border:1px solid #fff">${myWOs.length}</div>` : ''}
            <div style="position:absolute;bottom:-20px;left:50%;transform:translateX(-50%);background:${recent?'#7F77DD':'#9e9e9e'};color:#fff;border-radius:4px;padding:1px 6px;font-size:10px;white-space:nowrap">${tech.full_name.split(' ')[0]}</div>
          </div>`,
        iconAnchor: [21, 21],
      })

      const ageStr = age < 1 ? 'just now' : age < 60 ? `${Math.floor(age)}m ago` : `${Math.floor(age/60)}h ago`
      const m = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(mapInst.current)
      m.bindPopup(`
        <div style="font-family:system-ui;min-width:160px">
          <b>${tech.full_name}</b><br/>
          <span style="color:${recent?'#1D9E75':'#999'}">${recent ? '🟢 Active' : '⚫ Inactive'} · ${ageStr}</span><br/>
          ${tech.phone ? `📞 ${tech.phone}<br/>` : ''}
          ${myWOs.length ? myWOs.map(w => `🔧 <span style="font-size:11px">${w.title || 'Work Order'}</span>`).join('<br/>') : '<span style="font-size:11px;color:#999">No active jobs</span>'}
        </div>
      `)
      techMarkers.current[tech.id] = m
    })
  }

  // ── GPS Tracking ───────────────────────────────────────────────────────────
  function startTracking() {
    if (!navigator.geolocation) { setGpsError('GPS not supported'); return }
    setTracking(true); setGpsError(null)

    const push = pos => supabase.from('technician_locations').upsert({
      technician_id: profile.id,
      latitude:   pos.coords.latitude,
      longitude:  pos.coords.longitude,
      accuracy:   pos.coords.accuracy,
      heading:    pos.coords.heading,
      speed:      pos.coords.speed,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'technician_id' }).catch(() => {})

    navigator.geolocation.getCurrentPosition(push, () => {}, { enableHighAccuracy: true })
    watchRef.current  = navigator.geolocation.watchPosition(push, e => setGpsError(e.message), { enableHighAccuracy: true })
    timerRef.current  = setInterval(
      () => navigator.geolocation.getCurrentPosition(push, () => {}, { enableHighAccuracy: true }), 60000)
  }

  function stopTracking() {
    if (watchRef.current)  navigator.geolocation.clearWatch(watchRef.current)
    if (timerRef.current)  clearInterval(timerRef.current)
    watchRef.current = null; timerRef.current = null
    setTracking(false)
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const activeTechs   = techs.filter(t => techLocs[t.id])
  const validStores   = stores.filter(s => s.latitude && s.longitude)
  const woByTech      = {}
  wos.forEach(wo => {
    if (!woByTech[wo.assigned_to]) woByTech[wo.assigned_to] = []
    woByTech[wo.assigned_to].push(wo)
  })

  return (
    <div>
      {/* Status bar */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10,marginBottom:12}}>
        <div style={{display:'flex',gap:20,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontSize:13,color:'var(--text3)'}}>🏪 <b style={{color:'var(--text)'}}>{validStores.length}</b> branches</span>
          <span style={{fontSize:13,color:'var(--text3)'}}>👷 <b style={{color:'var(--text)'}}>{activeTechs.length}</b> / {techs.length} online</span>
          <span style={{fontSize:13,color:'var(--text3)'}}>🔧 <b style={{color:'var(--text)'}}>{wos.length}</b> open jobs</span>
          {lastUpdate && <span style={{fontSize:11,color:'var(--text3)'}}>Updated {lastUpdate.toLocaleTimeString()}</span>}
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={loadData} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 12px',fontSize:12,cursor:'pointer',color:'var(--text)'}}>↻ Refresh</button>
          {!isAdmin && (
            <button onClick={tracking ? stopTracking : startTracking} style={{background:tracking?'#E24B4A':'#1D9E75',color:'#fff',border:'none',borderRadius:8,padding:'6px 14px',fontSize:12,cursor:'pointer',fontWeight:600}}>
              {tracking ? '⏹ Stop Sharing' : '📍 Share My Location'}
            </button>
          )}
        </div>
      </div>

      {gpsError && <div style={{background:'#FBE9E7',color:'#BF360C',borderRadius:8,padding:'8px 12px',marginBottom:10,fontSize:12}}>⚠️ {gpsError}</div>}

      {/* Technician pills */}
      {techs.length > 0 && (
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
          {techs.map(tech => {
            const loc    = techLocs[tech.id]
            const age    = loc ? (Date.now() - new Date(loc.updated_at)) / 60000 : null
            const recent = age !== null && age < 10
            const woCnt  = (woByTech[tech.id] || []).length
            return (
              <div key={tech.id}
                onClick={() => {
                  if (loc && mapInst.current) {
                    mapInst.current.setView([parseFloat(loc.latitude), parseFloat(loc.longitude)], 15)
                    techMarkers.current[tech.id]?.openPopup()
                  }
                }}
                style={{display:'flex',alignItems:'center',gap:8,padding:'6px 12px',background:'var(--surface)',border:`1.5px solid ${recent?'#7F77DD':'var(--border)'}`,borderRadius:20,cursor:loc?'pointer':'default'}}
              >
                <div style={{width:26,height:26,borderRadius:'50%',background:recent?'#7F77DD':'var(--border)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:700}}>
                  {tech.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:'var(--text)',lineHeight:1.2}}>{tech.full_name.split(' ')[0]}</div>
                  <div style={{fontSize:10,color:recent?'#7F77DD':'var(--text3)'}}>
                    {recent ? `🟢 ${age < 1 ? 'just now' : `${Math.floor(age)}m ago`}${woCnt ? ` · ${woCnt} job${woCnt>1?'s':''}` : ''}` : loc ? `⚫ ${Math.floor(age)}m ago` : '⚫ not sharing'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Map */}
      <div
        ref={mapRef}
        style={{
          height,
          borderRadius:12,
          border:'1px solid var(--border)',
          overflow:'hidden',
          background:'#f0f0f0',
          position:'relative',
        }}
      >
        {/* Show spinner until map tiles render */}
        {(!mapInst.current || loading) && (
          <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,color:'#888',fontSize:13,pointerEvents:'none',zIndex:0}}>
            <div style={{width:32,height:32,border:'3px solid #ddd',borderTopColor:'#1D9E75',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
            {loading ? 'Loading branches…' : 'Rendering map…'}
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
      </div>

      <p style={{color:'var(--text3)',fontSize:11,marginTop:8}}>
        🟢 Green = all clear · 🔴 Red = open work orders · 🟣 Purple = technician (click to zoom) · Auto-updates every 30s
      </p>
    </div>
  )
}
