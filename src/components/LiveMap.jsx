import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// All 18 branch coordinates hardcoded
const BRANCHES = [
  { name: 'Al Barsha',        full: 'JJ Chicken - Al Barsha',        lat: 25.1003, lng: 55.1734 },
  { name: 'Al Raha Mall',     full: 'JJ Chicken - Al Raha Mall',      lat: 24.4686, lng: 54.6041 },
  { name: 'DFC',              full: 'JJ Chicken - DFC',               lat: 25.2327, lng: 55.3267 },
  { name: 'Discovery Garden', full: 'JJ Chicken - Discovery Garden',  lat: 25.0480, lng: 55.1500 },
  { name: 'Dubai Mall',       full: 'JJ Chicken - Dubai Mall',        lat: 25.1972, lng: 55.2796 },
  { name: 'Kite Beach',       full: 'JJ Chicken - Kite Beach',        lat: 25.1878, lng: 55.2485 },
  { name: 'Mirdif',           full: 'JJ Chicken - Mirdif (UR)',       lat: 25.2217, lng: 55.4072 },
  { name: 'Motor City',       full: 'JJ Chicken - Motor City',        lat: 25.0700, lng: 55.2500 },
  { name: 'WTC',              full: 'JJ Chicken - WTC',               lat: 25.2285, lng: 55.2867 },
  { name: 'Derawandi AUH',    full: 'JJ Derawandi - AUH',            lat: 24.4241, lng: 54.4699 },
  { name: 'Al Wasl',          full: 'JJ Derawandi - Al Wasl',         lat: 25.1973, lng: 55.2522 },
  { name: 'Reem Mall',        full: 'JJ Reem Mall',                   lat: 24.5477, lng: 54.3818 },
  { name: 'Shmkha',           full: 'JJ Shmkha',                      lat: 24.4695, lng: 54.3277 },
  { name: 'Jimi Mall',        full: 'Solidare Jimi Mall',             lat: 24.2154, lng: 55.7554 },
  { name: 'JV Dubai Mall',    full: 'JV Dubai Mall',                  lat: 25.1960, lng: 55.2790 },
  { name: 'JV Jumeirah',      full: 'JV Jumeirah',                    lat: 25.2099, lng: 55.2476 },
  { name: 'JV Abu Dhabi',     full: 'JV Abu Dhabi Mall',              lat: 24.4052, lng: 54.5014 },
  { name: 'Adnoc Truck',      full: 'Derwandi Truck Adnoc',           lat: 24.4500, lng: 54.3700 },
]

export default function LiveMap() {
  const { profile, isAdmin } = useAuth()

  const [selected,    setSelected]    = useState(null)   // selected branch
  const [wos,         setWos]         = useState([])
  const [techs,       setTechs]       = useState([])
  const [techLocs,    setTechLocs]    = useState({})
  const [tracking,    setTracking]    = useState(false)
  const [gpsError,    setGpsError]    = useState(null)
  const [lastUpdate,  setLastUpdate]  = useState(null)

  const watchRef    = useRef(null)
  const timerRef    = useRef(null)
  const refreshRef  = useRef(null)

  useEffect(() => {
    loadData()
    refreshRef.current = setInterval(loadTechLocs, 30000)
    return () => {
      clearInterval(refreshRef.current)
      stopTracking()
    }
  }, [])

  async function loadData() {
    const safe = p => p.catch(() => ({ data: [] }))
    const [woRes, techRes] = await Promise.all([
      safe(supabase.from('work_orders').select('id,store_id,assigned_to,status,title,priority').neq('status','closed')),
      safe(supabase.from('profiles').select('id,full_name,phone').eq('role','technician')),
    ])
    setWos(woRes.data   || [])
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
    if (!navigator.geolocation) { setGpsError('GPS not supported'); return }
    setTracking(true); setGpsError(null)
    const push = pos => supabase.from('technician_locations').upsert({
      technician_id: profile.id,
      latitude:   pos.coords.latitude,
      longitude:  pos.coords.longitude,
      accuracy:   pos.coords.accuracy,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'technician_id' }).catch(() => {})
    navigator.geolocation.getCurrentPosition(push, () => {}, { enableHighAccuracy: true })
    watchRef.current = navigator.geolocation.watchPosition(push, e => setGpsError(e.message), { enableHighAccuracy: true })
    timerRef.current = setInterval(() => navigator.geolocation.getCurrentPosition(push, () => {}, { enableHighAccuracy: true }), 60000)
  }

  function stopTracking() {
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current)
    if (timerRef.current) clearInterval(timerRef.current)
    watchRef.current = null; timerRef.current = null
    setTracking(false)
  }

  // Build the selected map URL
  function getMapUrl() {
    if (selected) {
      return `https://maps.google.com/maps?q=${selected.lat},${selected.lng}&z=15&output=embed`
    }
    // Show all UAE - centered between Dubai and Abu Dhabi
    return `https://maps.google.com/maps?q=24.8,55.0&z=8&output=embed`
  }

  const woByStore = {}
  wos.forEach(wo => {
    if (!woByStore[wo.store_id]) woByStore[wo.store_id] = []
    woByStore[wo.store_id].push(wo)
  })

  const woByTech = {}
  wos.forEach(wo => {
    if (!woByTech[wo.assigned_to]) woByTech[wo.assigned_to] = []
    woByTech[wo.assigned_to].push(wo)
  })

  const activeTechs = techs.filter(t => techLocs[t.id])

  return (
    <div>
      {/* Top status + controls */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10,marginBottom:14}}>
        <div style={{display:'flex',gap:20,alignItems:'center',flexWrap:'wrap'}}>
          <span style={{fontSize:13,color:'var(--text3)'}}>🏪 <b style={{color:'var(--text)'}}>{BRANCHES.length}</b> branches</span>
          <span style={{fontSize:13,color:'var(--text3)'}}>👷 <b style={{color:'var(--text)'}}>{activeTechs.length}</b>/{techs.length} online</span>
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

      <div style={{display:'flex',gap:14,alignItems:'flex-start'}}>

        {/* LEFT: branch list */}
        <div style={{width:220,flexShrink:0,display:'flex',flexDirection:'column',gap:6,maxHeight:560,overflowY:'auto'}}>
          <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',letterSpacing:'0.05em',marginBottom:4,paddingLeft:4}}>BRANCHES</div>

          <button
            onClick={() => setSelected(null)}
            style={{
              textAlign:'left',padding:'7px 10px',borderRadius:8,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,
              background: !selected ? 'var(--green)' : 'var(--surface)',
              color: !selected ? '#fff' : 'var(--text)',
            }}
          >🌍 All UAE</button>

          {BRANCHES.map(b => {
            // Match by name fragment since Supabase names may vary
            const storeWOs = wos.filter(w =>
              w.store_id && wos.some(x => x.store_id === w.store_id)
                ? true : false
            )
            const hasWO    = false // simplified — we don't have store IDs in BRANCHES
            const isSel    = selected?.full === b.full
            return (
              <button key={b.full}
                onClick={() => setSelected(isSel ? null : b)}
                style={{
                  textAlign:'left',padding:'7px 10px',borderRadius:8,border:`1px solid ${isSel?'#7F77DD':hasWO?'#EF9F27':'var(--border)'}`,cursor:'pointer',fontSize:12,
                  background: isSel ? '#7F77DD' : 'var(--surface)',
                  color: isSel ? '#fff' : 'var(--text)',
                  fontWeight: isSel ? 600 : 400,
                }}
              >
                🏪 {b.name}
              </button>
            )
          })}

          {/* Technicians section */}
          {techs.length > 0 && <>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text3)',letterSpacing:'0.05em',marginTop:8,marginBottom:4,paddingLeft:4}}>TECHNICIANS</div>
            {techs.map(tech => {
              const loc    = techLocs[tech.id]
              const age    = loc ? (Date.now() - new Date(loc.updated_at)) / 60000 : null
              const recent = age !== null && age < 10
              const woCnt  = (woByTech[tech.id] || []).length
              return (
                <button key={tech.id}
                  onClick={() => {
                    if (loc) setSelected({ name: tech.full_name, full: tech.full_name, lat: parseFloat(loc.latitude), lng: parseFloat(loc.longitude), isTech: true })
                  }}
                  style={{
                    textAlign:'left',padding:'7px 10px',borderRadius:8,
                    border:`1px solid ${recent?'#7F77DD':'var(--border)'}`,
                    cursor:loc?'pointer':'default',fontSize:12,
                    background:'var(--surface)',color:'var(--text)',
                    opacity: loc ? 1 : 0.5,
                  }}
                >
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <div style={{width:22,height:22,borderRadius:'50%',background:recent?'#7F77DD':'#ccc',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,flexShrink:0}}>
                      {tech.full_name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{fontWeight:600,fontSize:11}}>{tech.full_name.split(' ')[0]}</div>
                      <div style={{fontSize:10,color:recent?'#7F77DD':'var(--text3)'}}>
                        {recent ? `🟢 ${Math.floor(age)}m ago${woCnt ? ` · ${woCnt} job${woCnt>1?'s':''}`:''}`
                          : loc ? `⚫ ${Math.floor(age)}m ago`
                          : '⚫ not sharing'}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </>}
        </div>

        {/* RIGHT: map */}
        <div style={{flex:1,minWidth:0}}>
          {selected && (
            <div style={{marginBottom:10,padding:'10px 14px',background:'var(--surface)',borderRadius:10,border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
              <div>
                <div style={{fontWeight:600,fontSize:14}}>{selected.full || selected.name}</div>
                <div style={{fontSize:12,color:'var(--text3)'}}>{selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}</div>
              </div>
              <div style={{display:'flex',gap:8}}>
                <a href={`https://maps.google.com/?q=${selected.lat},${selected.lng}`} target="_blank" rel="noreferrer"
                  style={{background:'var(--green)',color:'#fff',borderRadius:8,padding:'6px 12px',fontSize:12,textDecoration:'none',fontWeight:600}}>
                  Open in Maps ↗
                </a>
                <button onClick={()=>setSelected(null)} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'6px 10px',fontSize:12,cursor:'pointer',color:'var(--text)'}}>✕</button>
              </div>
            </div>
          )}

          <iframe
            key={selected ? `${selected.lat},${selected.lng}` : 'all'}
            title="Fixnar Live Map"
            src={getMapUrl()}
            width="100%"
            height="500"
            style={{border:'none',borderRadius:12,display:'block'}}
            loading="lazy"
            allowFullScreen
          />
        </div>
      </div>

      <p style={{color:'var(--text3)',fontSize:11,marginTop:10}}>
        Click any branch or technician on the left to zoom in · {!isAdmin ? 'Use "Share My Location" to enable live tracking' : 'Technicians must share location from their device'}
      </p>
    </div>
  )
}
