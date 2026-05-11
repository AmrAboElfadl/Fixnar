import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const P_COLORS = { P1:'#E24B4A', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }
const HOURS = Array.from({length:9}, (_,i) => i + 9) // 9am to 5pm

const STATUS_COLORS = {
  open:        { bg:'#FFF3E0', text:'#E65100', border:'#EF9F27' },
  travelling:  { bg:'#E3F2FD', text:'#1565C0', border:'#378ADD' },
  arrived:     { bg:'#E8EAF6', text:'#283593', border:'#7F77DD' },
  in_progress: { bg:'#E8F5E9', text:'#1B5E20', border:'#1D9E75' },
  on_hold:     { bg:'#FBE9E7', text:'#BF360C', border:'#E24B4A' },
  completed:   { bg:'#F3E5F5', text:'#4A148C', border:'#7F77DD' },
  closed:      { bg:'#ECEFF1', text:'#455A64', border:'#90A4AE' },
}

export default function Schedule() {
  const { profile, isAdmin, isTechnician } = useAuth()
  const navigate = useNavigate()
  const [wos, setWos]         = useState([])
  const [techs, setTechs]     = useState([])
  const [stores, setStores]   = useState([])
  const [loading, setLoading] = useState(true)
  const [view, setView]       = useState('board') // 'board' | 'map'
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [techLocations, setTechLocations] = useState({})
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)

  useEffect(() => { fetchAll() }, [selectedDate])

  useEffect(() => {
    if (view === 'map') initMap()
  }, [view, techLocations, stores])

  async function fetchAll() {
    setLoading(true)
    const dateStr = selectedDate.toISOString().split('T')[0]
    const [woRes, techRes, storeRes, locRes] = await Promise.all([
      supabase.from('work_orders')
        .select('*,stores(name,latitude,longitude),assets(name),profiles(full_name)')
        .not('status', 'in', '("closed")')
        .order('created_at'),
      supabase.from('profiles').select('id,full_name,phone').eq('role','technician'),
      supabase.from('stores').select('id,name,latitude,longitude,manager_name,phone'),
      supabase.from('technician_locations').select('*').gte('updated_at', new Date(Date.now() - 30*60*1000).toISOString()),
    ])
    setWos(woRes.data || [])
    setTechs(techRes.data || [])
    setStores(storeRes.data || [])
    // Build location map
    const locs = {}
    ;(locRes.data || []).forEach(l => { locs[l.technician_id] = l })
    setTechLocations(locs)
    setLoading(false)
  }

  function initMap() {
    if (!mapRef.current) return
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
      mapInstanceRef.current = null
    }

    // Use Leaflet via CDN
    if (!window.L) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
      const script = document.createElement('script')
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      script.onload = () => renderMap()
      document.head.appendChild(script)
    } else {
      renderMap()
    }
  }

  function renderMap() {
    if (!mapRef.current || !window.L) return
    const L = window.L
    const map = L.map(mapRef.current).setView([25.2048, 55.2708], 10)
    mapInstanceRef.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map)

    // Store markers
    stores.forEach(s => {
      if (!s.latitude || !s.longitude) return
      const hasWO = wos.some(w => w.store_id === s.id && !['closed'].includes(w.status))
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:${hasWO ? '#E24B4A' : '#1D9E75'};color:white;border-radius:8px;padding:4px 8px;font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.2)">🏪 ${s.name.replace('JJ Chicken - ','').replace('JJ ','')}</div>`,
        iconAnchor: [0, 0],
      })
      L.marker([s.latitude, s.longitude], { icon })
        .addTo(map)
        .bindPopup(`<b>${s.name}</b><br>Manager: ${s.manager_name || '—'}<br>Phone: ${s.phone || '—'}<br>Active WOs: ${wos.filter(w=>w.store_id===s.id).length}`)
    })

    // Technician markers
    techs.forEach(tech => {
      const loc = techLocations[tech.id]
      if (!loc) return
      const techWOs = wos.filter(w => w.assigned_to === tech.id)
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:#7F77DD;color:white;border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid white">${tech.full_name.split(' ').map(w=>w[0]).join('').slice(0,2)}</div>`,
        iconAnchor: [20, 20],
      })
      L.marker([loc.latitude, loc.longitude], { icon })
        .addTo(map)
        .bindPopup(`<b>🔧 ${tech.full_name}</b><br>Active jobs: ${techWOs.length}<br>Last update: ${new Date(loc.updated_at).toLocaleTimeString()}`)
    })

    setTimeout(() => map.invalidateSize(), 100)
  }

  // Group WOs by technician
  const woByTech = {}
  wos.forEach(wo => {
    const key = wo.assigned_to || 'unassigned'
    if (!woByTech[key]) woByTech[key] = []
    woByTech[key].push(wo)
  })

  // Week days
  const weekDays = Array.from({length:7}, (_,i) => {
    const d = new Date()
    d.setDate(d.getDate() - d.getDay() + i)
    return d
  })

  const today = new Date().toDateString()

  const inp = { background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, outline:'none', cursor:'pointer' }

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ color:'var(--text)', fontSize:22, fontWeight:600, margin:0 }}>
            {isAdmin ? 'Dispatch Board' : 'My Schedule'}
          </h1>
          <p style={{ color:'var(--text3)', fontSize:13, margin:'4px 0 0' }}>
            {wos.length} active work orders · {techs.length} technicians
          </p>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          {/* View toggle */}
          <div style={{ display:'flex', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:3 }}>
            {['board','map'].map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ background: view===v ? 'var(--green)' : 'transparent', color: view===v ? 'white' : 'var(--text2)', border:'none', borderRadius:6, padding:'6px 16px', fontSize:13, fontWeight:500, cursor:'pointer', transition:'all 0.15s' }}>
                {v === 'board' ? '📋 Board' : '🗺️ Live Map'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── BOARD VIEW ── */}
      {view === 'board' && (
        <div style={{ display:'flex', gap:16, overflowX:'auto' }}>

          {/* Left: Date column */}
          <div style={{ minWidth:120, flexShrink:0 }}>
            <div style={{ height:48 }}/>
            {weekDays.map((d,i) => (
              <div key={i}
                onClick={() => setSelectedDate(d)}
                style={{
                  height:60, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                  background: d.toDateString()===selectedDate.toDateString() ? 'var(--green)' : d.toDateString()===today ? 'var(--green-bg)' : 'var(--card-bg)',
                  border:`1px solid ${d.toDateString()===selectedDate.toDateString() ? 'var(--green)' : 'var(--border)'}`,
                  borderRadius:10, marginBottom:4, cursor:'pointer', transition:'all 0.15s',
                }}>
                <div style={{ fontSize:11, color: d.toDateString()===selectedDate.toDateString() ? 'rgba(255,255,255,0.8)' : 'var(--text3)', fontWeight:500 }}>
                  {d.toLocaleDateString('en',{weekday:'short'})}
                </div>
                <div style={{ fontSize:20, fontWeight:600, color: d.toDateString()===selectedDate.toDateString() ? 'white' : 'var(--text)' }}>
                  {d.getDate()}
                </div>
                <div style={{ fontSize:10, color: d.toDateString()===selectedDate.toDateString() ? 'rgba(255,255,255,0.7)' : 'var(--text3)' }}>
                  {d.toLocaleDateString('en',{month:'short'})}
                </div>
              </div>
            ))}
          </div>

          {/* Right: Technician columns */}
          <div style={{ flex:1, overflowX:'auto' }}>
            {/* Time header */}
            <div style={{ display:'flex', borderBottom:`1px solid var(--border)`, paddingBottom:8, marginBottom:8 }}>
              {[...techs, {id:'unassigned', full_name:'Unassigned'}].map(tech => (
                <div key={tech.id} style={{ minWidth:200, flex:1, textAlign:'center', padding:'0 8px' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                    <div style={{ width:32, height:32, borderRadius:'50%', background: tech.id==='unassigned' ? 'var(--text3)' : '#7F77DD', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600 }}>
                      {tech.id==='unassigned' ? '?' : tech.full_name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                    </div>
                    <div style={{ textAlign:'left' }}>
                      <div style={{ color:'var(--text)', fontSize:13, fontWeight:500 }}>{tech.full_name}</div>
                      <div style={{ color: techLocations[tech.id] ? '#1D9E75' : 'var(--text3)', fontSize:11 }}>
                        {techLocations[tech.id] ? '🟢 Online' : '⚫ Offline'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* WO cards per technician */}
            <div style={{ display:'flex', gap:8 }}>
              {[...techs, {id:'unassigned', full_name:'Unassigned'}].map(tech => {
                const techWOs = (woByTech[tech.id] || [])
                return (
                  <div key={tech.id} style={{ minWidth:200, flex:1, display:'flex', flexDirection:'column', gap:8 }}>
                    {techWOs.length === 0 ? (
                      <div style={{ background:'var(--bg3)', border:`1px dashed var(--border)`, borderRadius:10, padding:20, textAlign:'center', color:'var(--text3)', fontSize:12 }}>
                        No work orders
                      </div>
                    ) : techWOs.map(wo => {
                      const sc = STATUS_COLORS[wo.status] || STATUS_COLORS.open
                      return (
                        <div key={wo.id}
                          onClick={() => navigate(`/work-orders/${wo.id}`)}
                          style={{ background: sc.bg, border:`1px solid ${sc.border}`, borderRadius:10, padding:12, cursor:'pointer', transition:'transform 0.1s', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}
                          onMouseEnter={e => e.currentTarget.style.transform='translateY(-1px)'}
                          onMouseLeave={e => e.currentTarget.style.transform='none'}
                        >
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                            <span style={{ background: P_COLORS[wo.priority]+'22', color: P_COLORS[wo.priority], fontSize:10, padding:'2px 6px', borderRadius:5, fontWeight:700 }}>{wo.priority}</span>
                            <span style={{ background: sc.bg, color: sc.text, fontSize:10, padding:'2px 6px', borderRadius:5, fontWeight:500, border:`1px solid ${sc.border}` }}>
                              {wo.status.replace('_',' ')}
                            </span>
                          </div>
                          <div style={{ color: sc.text, fontSize:12, fontWeight:500, marginBottom:4, lineHeight:1.3 }}>
                            {wo.title}
                          </div>
                          <div style={{ color: sc.text, fontSize:11, opacity:0.8 }}>
                            📍 {wo.stores?.name || '—'}
                          </div>
                          {wo.created_at && (
                            <div style={{ color: sc.text, fontSize:10, opacity:0.6, marginTop:4 }}>
                              🕐 {new Date(wo.created_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
                            </div>
                          )}
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

      {/* ── MAP VIEW ── */}
      {view === 'map' && (
        <div>
          {/* Legend */}
          <div style={{ display:'flex', gap:16, marginBottom:12, flexWrap:'wrap' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text2)' }}>
              <div style={{ width:12, height:12, borderRadius:'50%', background:'#7F77DD' }}/> Technician
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text2)' }}>
              <div style={{ width:12, height:12, borderRadius:3, background:'#E24B4A' }}/> Store with open WO
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text2)' }}>
              <div style={{ width:12, height:12, borderRadius:3, background:'#1D9E75' }}/> Store — no issues
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'var(--text2)' }}>
              🟢 Online = location shared in last 30 min
            </div>
          </div>

          {/* Technician status bar */}
          <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' }}>
            {techs.map(tech => {
              const loc = techLocations[tech.id]
              const techWOs = wos.filter(w => w.assigned_to === tech.id)
              return (
                <div key={tech.id} style={{ background:'var(--card-bg)', border:`1px solid ${loc ? 'var(--green)' : 'var(--border)'}`, borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', gap:10, minWidth:180 }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background:'#7F77DD', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:600, flexShrink:0 }}>
                    {tech.full_name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                  </div>
                  <div>
                    <div style={{ color:'var(--text)', fontSize:13, fontWeight:500 }}>{tech.full_name}</div>
                    <div style={{ color: loc ? '#1D9E75' : 'var(--text3)', fontSize:11 }}>
                      {loc ? `🟢 Online · ${techWOs.length} jobs` : '⚫ Location not shared'}
                    </div>
                  </div>
                </div>
              )
            })}
            {techs.length === 0 && <div style={{ color:'var(--text3)', fontSize:13 }}>No technicians added yet</div>}
          </div>

          {/* Map */}
          <div ref={mapRef} style={{ height:520, borderRadius:12, border:'1px solid var(--border)', overflow:'hidden', background:'#e5e3df' }}/>
          <p style={{ color:'var(--text3)', fontSize:12, marginTop:8 }}>
            Technician locations update automatically when they share their location from the app. Click any marker for details.
          </p>
        </div>
      )}
    </div>
  )
}
