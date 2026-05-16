import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// ─── Auto-start GPS tracking when a technician opens a work order ───────────
export function useAutoTracking(workOrderId) {
  const { profile } = useAuth()
  const watchRef    = useRef(null)
  const intervalRef = useRef(null)
  const [tracking,  setTracking]  = useState(false)
  const [gpsError,  setGpsError]  = useState(null)

  useEffect(() => {
    if (!profile || profile.role !== 'technician' || !workOrderId) return
    startTracking(workOrderId)
    return () => stopTracking()
  }, [workOrderId, profile?.id])

  function startTracking(woId) {
    if (!navigator.geolocation) { setGpsError('GPS not supported on this device'); return }
    setTracking(true); setGpsError(null)

    const push = pos => {
      supabase.from('technician_locations').upsert({
        technician_id: profile.id,
        latitude:      pos.coords.latitude,
        longitude:     pos.coords.longitude,
        accuracy:      pos.coords.accuracy,
        heading:       pos.coords.heading,
        speed:         pos.coords.speed,
        work_order_id: woId,
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'technician_id' }).catch(() => {})
    }

    watchRef.current    = navigator.geolocation.watchPosition(push, () => {}, { enableHighAccuracy: true })
    intervalRef.current = setInterval(
      () => navigator.geolocation.getCurrentPosition(push, () => {}, { enableHighAccuracy: true }),
      60000
    )
  }

  function stopTracking() {
    if (watchRef.current)    navigator.geolocation.clearWatch(watchRef.current)
    if (intervalRef.current) clearInterval(intervalRef.current)
    watchRef.current = null; intervalRef.current = null
    setTracking(false)
  }

  return { tracking, gpsError, stopTracking }
}

// ─── Main LiveMap component ──────────────────────────────────────────────────
export default function LiveMap({ height = 520 }) {
  const { profile, isAdmin } = useAuth()
  const mapRef    = useRef(null)
  const mapInst   = useRef(null)
  const markersRef = useRef({})   // store markers
  const techMarkersRef = useRef({}) // tech markers

  const watchRef    = useRef(null)
  const intervalRef = useRef(null)
  const refreshRef  = useRef(null)

  const [stores,    setStores]    = useState([])
  const [techs,     setTechs]     = useState([])
  const [wos,       setWos]       = useState([])
  const [techLocs,  setTechLocs]  = useState({})
  const [tracking,  setTracking]  = useState(false)
  const [gpsError,  setGpsError]  = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [lastUpdate,setLastUpdate]= useState(null)

  // ── Load data once on mount ──────────────────
  useEffect(() => {
    loadData()
    // Refresh tech locations every 30s
    refreshRef.current = setInterval(loadTechLocs, 30000)
    return () => {
      clearInterval(refreshRef.current)
      stopTracking()
      if (mapInst.current) { mapInst.current.remove(); mapInst.current = null }
    }
  }, [])

  // ── Build map once stores load ───────────────
  useEffect(() => {
    if (stores.length > 0 && mapRef.current && !mapInst.current) {
      buildMap()
    }
  }, [stores])

  // ── Update tech markers whenever locs change ─
  useEffect(() => {
    if (mapInst.current) updateTechMarkers()
  }, [techLocs, techs, wos])

  async function loadData() {
    setLoading(true)
    const safe = p => p.catch(() => ({ data: [] }))
    const [storeRes, techRes, woRes] = await Promise.all([
      safe(supabase.from('stores').select('id,name,latitude,longitude,manager_name,phone')),
      safe(supabase.from('profiles').select('id,full_name,phone,role').eq('role','technician')),
      safe(supabase.from('work_orders').select('id,store_id,assigned_to,status,title,priority').neq('status','closed')),
    ])
    setStores(storeRes.data || [])
    setTechs(techRes.data   || [])
    setWos(woRes.data       || [])
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

  // ── Build the Leaflet map ────────────────────
  function buildMap() {
    if (!mapRef.current || !window.L) return

    const L = window.L
    const validStores = (stores || []).filter(s => s.latitude && s.longitude)

    // Calculate center from stores
    const center = validStores.length > 0
      ? [
          validStores.reduce((a, s) => a + parseFloat(s.latitude),  0) / validStores.length,
          validStores.reduce((a, s) => a + parseFloat(s.longitude), 0) / validStores.length,
        ]
      : [25.2048, 55.2708]

    const map = L.map(mapRef.current, { zoomControl: true, attributionControl: true })
    map.setView(center, 11)
    mapInst.current = map

    // OSM tiles
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)

    // Store markers
    const bounds = []
    validStores.forEach(s => {
      const lat = parseFloat(s.latitude)
      const lng = parseFloat(s.longitude)
      bounds.push([lat, lng])

      const woCount = (wos || []).filter(w => w.store_id === s.id).length
      const shortName = s.name.includes('-') ? s.name.split('-').pop().trim() : s.name

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          background:${woCount > 0 ? '#E24B4A' : '#1D9E75'};
          color:white;
          border-radius:8px;
          padding:4px 10px;
          font-size:11px;
          font-weight:700;
          white-space:nowrap;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
          border:2px solid white;
          font-family:system-ui,sans-serif;
        ">🏪 ${shortName}${woCount > 0 ? ` (${woCount})` : ''}</div>`,
        iconAnchor: [0, 0],
      })

      const marker = L.marker([lat, lng], { icon }).addTo(map)
      marker.bindPopup(`
        <div style="font-family:system-ui,sans-serif;min-width:160px">
          <b style="font-size:13px">${s.name}</b><br/>
          ${s.manager_name ? `<span style="color:#666;font-size:12px">👤 ${s.manager_name}</span><br/>` : ''}
          ${s.phone ? `<span style="color:#666;font-size:12px">📞 ${s.phone}</span><br/>` : ''}
          ${woCount > 0 ? `<span style="color:#E24B4A;font-size:12px;font-weight:600">🔴 ${woCount} open work order${woCount !== 1 ? 's' : ''}</span>` : '<span style="color:#1D9E75;font-size:12px">✅ All clear</span>'}
        </div>
      `)
      markersRef.current[s.id] = marker
    })

    if (bounds.length > 1) map.fitBounds(bounds, { padding: [40, 40] })
  }

  // ── Update tech markers (called on techLocs change) ─
  function updateTechMarkers() {
    const L = window.L
    if (!L || !mapInst.current) return

    // Remove old tech markers
    Object.values(techMarkersRef.current).forEach(m => m.remove())
    techMarkersRef.current = {}

    const woByTech = {}
    ;(wos || []).forEach(wo => {
      if (!woByTech[wo.assigned_to]) woByTech[wo.assigned_to] = []
      woByTech[wo.assigned_to].push(wo)
    })

    ;(techs || []).forEach(tech => {
      const loc = techLocs[tech.id]
      if (!loc || !loc.latitude || !loc.longitude) return

      const lat    = parseFloat(loc.latitude)
      const lng    = parseFloat(loc.longitude)
      const age    = (Date.now() - new Date(loc.updated_at)) / 60000
      const recent = age < 10
      const myWOs  = woByTech[tech.id] || []
      const initials = tech.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

      const icon = L.divIcon({
        className: '',
        html: `<div style="position:relative;display:inline-block;font-family:system-ui,sans-serif">
          <div style="
            background:${recent ? '#7F77DD' : '#9e9e9e'};
            color:white;
            border-radius:50%;
            width:42px;height:42px;
            display:flex;align-items:center;justify-content:center;
            font-weight:700;font-size:14px;
            box-shadow:0 3px 10px rgba(0,0,0,0.4);
            border:3px solid ${recent ? 'white' : '#ccc'};
          ">${initials}</div>
          ${myWOs.length > 0 ? `<div style="
            position:absolute;top:-4px;right:-4px;
            background:#E24B4A;color:white;border-radius:50%;
            width:18px;height:18px;
            display:flex;align-items:center;justify-content:center;
            font-size:10px;font-weight:700;border:1px solid white;
          ">${myWOs.length}</div>` : ''}
          <div style="
            position:absolute;bottom:-20px;left:50%;
            transform:translateX(-50%);
            background:${recent ? '#7F77DD' : '#9e9e9e'};
            color:white;border-radius:4px;
            padding:1px 6px;font-size:10px;white-space:nowrap;
          ">${tech.full_name.split(' ')[0]}</div>
        </div>`,
        iconAnchor: [21, 21],
      })

      const ageText = age < 1 ? 'just now' : age < 60 ? `${Math.floor(age)}m ago` : `${Math.floor(age/60)}h ago`
      const marker = L.marker([lat, lng], { icon, zIndexOffset: 1000 }).addTo(mapInst.current)
      marker.bindPopup(`
        <div style="font-family:system-ui,sans-serif;min-width:160px">
          <b style="font-size:13px">${tech.full_name}</b><br/>
          <span style="color:${recent?'#1D9E75':'#999'};font-size:12px">${recent ? '🟢 Active' : '⚫ Inactive'} · ${ageText}</span><br/>
          ${tech.phone ? `<span style="color:#666;font-size:12px">📞 ${tech.phone}</span><br/>` : ''}
          ${myWOs.length > 0 ? myWOs.map(w => `<span style="font-size:11px;color:#666">🔧 ${w.title || 'Work Order'}</span>`).join('<br/>') : '<span style="font-size:12px;color:#999">No active jobs</span>'}
        </div>
      `)
      techMarkersRef.current[tech.id] = marker
    })
  }

  // ── GPS Tracking (technician) ────────────────
  function startTracking() {
    if (!navigator.geolocation) { setGpsError('GPS not supported'); return }
    setTracking(true); setGpsError(null)

    const push = pos => {
      supabase.from('technician_locations').upsert({
        technician_id: profile.id,
        latitude:   pos.coords.latitude,
        longitude:  pos.coords.longitude,
        accuracy:   pos.coords.accuracy,
        heading:    pos.coords.heading,
        speed:      pos.coords.speed,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'technician_id' }).catch(() => {})
    }

    navigator.geolocation.getCurrentPosition(push, () => {}, { enableHighAccuracy: true })
    watchRef.current    = navigator.geolocation.watchPosition(push, e => setGpsError(e.message), { enableHighAccuracy: true })
    intervalRef.current = setInterval(
      () => navigator.geolocation.getCurrentPosition(push, () => {}, { enableHighAccuracy: true }),
      60000
    )
  }

  function stopTracking() {
    if (watchRef.current)    navigator.geolocation.clearWatch(watchRef.current)
    if (intervalRef.current) clearInterval(intervalRef.current)
    watchRef.current = null; intervalRef.current = null
    setTracking(false)
  }

  const activeTechs = techs.filter(t => techLocs[t.id])
  const woByTech = {}
  ;(wos || []).forEach(wo => {
    if (!woByTech[wo.assigned_to]) woByTech[wo.assigned_to] = []
    woByTech[wo.assigned_to].push(wo)
  })

  return (
    <div>
      {/* ── Status bar ── */}
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        flexWrap:'wrap', gap:10, marginBottom:12,
      }}>
        <div style={{ display:'flex', gap:16, flexWrap:'wrap', alignItems:'center' }}>
          <span style={{ fontSize:13, color:'var(--text3)' }}>
            🏪 <b style={{color:'var(--text)'}}>{stores.filter(s=>s.latitude).length}</b> branches
          </span>
          <span style={{ fontSize:13, color:'var(--text3)' }}>
            👷 <b style={{color:'var(--text)'}}>{activeTechs.length}</b> / {techs.length} techs online
          </span>
          <span style={{ fontSize:13, color:'var(--text3)' }}>
            🔧 <b style={{color:'var(--text)'}}>{wos.length}</b> open jobs
          </span>
          {lastUpdate && (
            <span style={{ fontSize:11, color:'var(--text3)' }}>
              Updated {lastUpdate.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={loadData} style={{
            background:'var(--surface)', border:'1px solid var(--border)',
            borderRadius:8, padding:'6px 12px', fontSize:12, cursor:'pointer', color:'var(--text)',
          }}>↻ Refresh</button>
          {!isAdmin && (
            <button onClick={tracking ? stopTracking : startTracking} style={{
              background: tracking ? '#E24B4A' : '#1D9E75',
              color:'white', border:'none', borderRadius:8,
              padding:'6px 14px', fontSize:12, cursor:'pointer', fontWeight:600,
            }}>
              {tracking ? '⏹ Stop Sharing' : '📍 Share My Location'}
            </button>
          )}
        </div>
      </div>

      {gpsError && (
        <div style={{ background:'#FBE9E7', color:'#BF360C', borderRadius:8, padding:'8px 12px', marginBottom:10, fontSize:12 }}>
          ⚠️ GPS error: {gpsError}
        </div>
      )}

      {/* ── Technician pills ── */}
      {techs.length > 0 && (
        <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
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
                    techMarkersRef.current[tech.id]?.openPopup()
                  }
                }}
                style={{
                  display:'flex', alignItems:'center', gap:8,
                  padding:'6px 12px',
                  background:'var(--surface)',
                  border:`1.5px solid ${recent ? '#7F77DD' : 'var(--border)'}`,
                  borderRadius:20, cursor: loc ? 'pointer' : 'default',
                  transition:'all 0.15s',
                }}
                title={loc ? 'Click to zoom to technician' : 'Location not shared'}
              >
                <div style={{
                  width:26, height:26, borderRadius:'50%',
                  background: recent ? '#7F77DD' : 'var(--border)',
                  color:'white', display:'flex', alignItems:'center',
                  justifyContent:'center', fontSize:10, fontWeight:700,
                }}>
                  {tech.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text)', lineHeight:1.2 }}>
                    {tech.full_name.split(' ')[0]}
                  </div>
                  <div style={{ fontSize:10, color: recent ? '#7F77DD' : 'var(--text3)' }}>
                    {recent
                      ? `🟢 ${age < 1 ? 'just now' : `${Math.floor(age)}m ago`}${woCnt > 0 ? ` · ${woCnt} job${woCnt>1?'s':''}` : ''}`
                      : loc ? `⚫ ${Math.floor(age)}m ago` : '⚫ not sharing'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Map container ── */}
      {loading ? (
        <div style={{
          height, borderRadius:12, border:'1px solid var(--border)',
          display:'flex', alignItems:'center', justifyContent:'center',
          color:'var(--text3)', fontSize:13, background:'var(--surface)',
        }}>
          Loading map…
        </div>
      ) : (
        <div
          ref={mapRef}
          style={{
            height,
            borderRadius:12,
            border:'1px solid var(--border)',
            overflow:'hidden',
          }}
        />
      )}

      <p style={{ color:'var(--text3)', fontSize:11, marginTop:8 }}>
        🏪 Green = all clear · 🔴 Red = open work orders &nbsp;·&nbsp;
        🟣 Purple circle = technician (click to zoom) &nbsp;·&nbsp;
        Updates every 30s
      </p>
    </div>
  )
}
