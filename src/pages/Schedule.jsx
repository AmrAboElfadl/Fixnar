import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useNavigate } from 'react-router-dom'

const P_COLORS  = { P1:'#E24B4A', P2:'#EF9F27', P3:'#378ADD', P4:'#1D9E75' }
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
  open:        { label:'🚗 Start Trip',      next:'travelling' },
  travelling:  { label:'📍 Mark Arrived',    next:'arrived' },
  arrived:     { label:'🔧 Start Work',      next:'in_progress' },
  in_progress: { label:'✅ Mark Complete',   next:'completed' },
  on_hold:     { label:'↩ Reopen',           next:'in_progress' },
  completed:   { label:'🔒 Close',           next:'closed' },
}

export default function Schedule() {
  const { profile, isAdmin, isTechnician } = useAuth()
  const navigate = useNavigate()
  const mapRef   = useRef(null)
  const mapInst  = useRef(null)

  const [wos,          setWos]          = useState([])
  const [techs,        setTechs]        = useState([])
  const [stores,       setStores]       = useState([])
  const [techLocs,     setTechLocs]     = useState({})
  const [loading,      setLoading]      = useState(true)
  const [view,         setView]         = useState('board')
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [activeWO,     setActiveWO]     = useState(null) // WO popup
  const [saving,       setSaving]       = useState(false)
  const [holdReason,   setHoldReason]   = useState('')
  const [showHold,     setShowHold]     = useState(false)

  useEffect(() => { fetchAll() }, [selectedDate])
  useEffect(() => { if (view === 'map') initMap() }, [view, techLocs, stores, wos])

  async function fetchAll() {
    setLoading(true)
    const [woRes, techRes, storeRes, locRes] = await Promise.all([
      supabase.from('work_orders').select('*,stores(name,latitude,longitude),assets(name)').neq('status','closed').order('priority'),
      supabase.from('profiles').select('id,full_name,phone').eq('role','technician'),
      supabase.from('stores').select('id,name,latitude,longitude,manager_name,phone'),
      supabase.from('technician_locations').select('*').gte('updated_at', new Date(Date.now()-30*60*1000).toISOString()).catch(()=>({data:[]})),
    ])
    setWos(woRes.data || [])
    setTechs(techRes.data || [])
    setStores(storeRes.data || [])
    const locs = {}
    ;((locRes.data)||[]).forEach(l => { locs[l.technician_id] = l })
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
    await supabase.from('wo_updates').insert({ work_order_id: wo.id, user_id: profile.id, type:'status_change', content:`Status → ${nextStatus}` }).catch(()=>{})
    setActiveWO(prev => prev ? {...prev, status: nextStatus} : null)
    fetchAll()
    setSaving(false)
  }

  async function submitHold(wo) {
    if (!holdReason.trim()) return
    setSaving(true)
    await supabase.from('work_orders').update({ status:'on_hold', hold_reason: holdReason, updated_at: new Date().toISOString() }).eq('id', wo.id)
    await supabase.from('wo_updates').insert({ work_order_id: wo.id, user_id: profile.id, type:'status_change', content:`On hold: ${holdReason}` }).catch(()=>{})
    setShowHold(false); setHoldReason('')
    setActiveWO(prev => prev ? {...prev, status:'on_hold'} : null)
    fetchAll(); setSaving(false)
  }

  async function reassign(woId, techId) {
    await supabase.from('work_orders').update({ assigned_to: techId || null }).eq('id', woId)
    fetchAll()
    if (activeWO?.id === woId) setActiveWO(prev => ({...prev, assigned_to: techId || null}))
  }

  async function reschedule(woId, field, value) {
    await supabase.from('work_orders').update({ [field]: value }).eq('id', woId)
    fetchAll()
  }

  // Map init
  function initMap() {
    if (!mapRef.current) return
    if (mapInst.current) { mapInst.current.remove(); mapInst.current = null }
    if (!window.L) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
      const script = document.createElement('script')
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      script.onload = renderMap; document.head.appendChild(script)
    } else { renderMap() }
  }
  function renderMap() {
    if (!mapRef.current || !window.L) return
    const L = window.L
    const map = L.map(mapRef.current).setView([25.2048, 55.2708], 10)
    mapInst.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'© OpenStreetMap' }).addTo(map)
    stores.forEach(s => {
      if (!s.latitude || !s.longitude) return
      const hasWO = wos.some(w => w.store_id === s.id)
      const icon = L.divIcon({ className:'', html:`<div style="background:${hasWO?'#E24B4A':'#1D9E75'};color:white;border-radius:8px;padding:3px 8px;font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.2)">🏪 ${s.name.split(' - ').pop()}</div>`, iconAnchor:[0,0] })
      L.marker([s.latitude, s.longitude], { icon }).addTo(map).bindPopup(`<b>${s.name}</b><br>${s.manager_name||''}<br>${s.phone||''}`)
    })
    techs.forEach(t => {
      const loc = techLocs[t.id]; if (!loc) return
      const icon = L.divIcon({ className:'', html:`<div style="background:#7F77DD;color:white;border-radius:50%;width:38px;height:38px;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid white">${t.full_name.split(' ').map(w=>w[0]).join('').slice(0,2)}</div>`, iconAnchor:[19,19] })
      L.marker([loc.latitude, loc.longitude], { icon }).addTo(map).bindPopup(`<b>🔧 ${t.full_name}</b><br>Updated: ${new Date(loc.updated_at).toLocaleTimeString()}`)
    })
    setTimeout(() => map.invalidateSize(), 100)
  }

  // Group by technician
  const woByTech = {}
  wos.forEach(wo => {
    const key = wo.assigned_to || 'unassigned'
    if (!woByTech[key]) woByTech[key] = []
    woByTech[key].push(wo)
  })

  const weekDays = Array.from({length:7}, (_,i) => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay() + i); return d
  })

  const inp = { background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px', color:'var(--text)', fontSize:12, outline:'none', width:'100%', boxSizing:'border-box' }

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif" }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ color:'var(--text)', fontSize:22, fontWeight:600, margin:0 }}>Dispatch Board</h1>
          <p style={{ color:'var(--text3)', fontSize:13, margin:'4px 0 0' }}>{wos.length} active · {techs.length} technicians</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <div style={{ display:'flex', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:3 }}>
            {['board','map'].map(v => (
              <button key={v} onClick={() => setView(v)}
                style={{ background: view===v ? '#1D9E75' : 'transparent', color: view===v ? 'white' : 'var(--text2)', border:'none', borderRadius:6, padding:'6px 16px', fontSize:13, fontWeight:500, cursor:'pointer' }}>
                {v==='board' ? '📋 Board' : '🗺️ Live Map'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── BOARD VIEW ── */}
      {view === 'board' && (
        <div style={{ display:'flex', gap:12, overflowX:'auto' }}>

          {/* Date sidebar */}
          <div style={{ minWidth:100, flexShrink:0 }}>
            <div style={{ height:72, marginBottom:8 }}/>
            {weekDays.map((d,i) => (
              <div key={i} onClick={() => setSelectedDate(d)}
                style={{ height:64, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', borderRadius:10, marginBottom:6, cursor:'pointer', border:`1px solid ${d.toDateString()===selectedDate.toDateString() ? '#1D9E75' : 'var(--border)'}`, background: d.toDateString()===selectedDate.toDateString() ? '#1D9E75' : 'var(--card-bg)', transition:'all 0.15s' }}>
                <div style={{ fontSize:11, color: d.toDateString()===selectedDate.toDateString() ? 'rgba(255,255,255,0.8)' : 'var(--text3)', fontWeight:500 }}>{d.toLocaleDateString('en',{weekday:'short'})}</div>
                <div style={{ fontSize:22, fontWeight:600, color: d.toDateString()===selectedDate.toDateString() ? 'white' : 'var(--text)' }}>{d.getDate()}</div>
                <div style={{ fontSize:10, color: d.toDateString()===selectedDate.toDateString() ? 'rgba(255,255,255,0.7)' : 'var(--text3)' }}>{d.toLocaleDateString('en',{month:'short'})}</div>
              </div>
            ))}
          </div>

          {/* Tech columns */}
          <div style={{ flex:1, overflowX:'auto', minWidth:0 }}>
            <div style={{ display:'flex', gap:10, minWidth: (techs.length + 1) * 220 }}>
              {[...techs, {id:'unassigned', full_name:'Unassigned'}].map(tech => {
                const techWOs = woByTech[tech.id] || []
                const isOnline = !!techLocs[tech.id]
                return (
                  <div key={tech.id} style={{ flex:1, minWidth:200 }}>
                    {/* Tech header */}
                    <div style={{ background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 12px', marginBottom:8, display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:34, height:34, borderRadius:'50%', background: tech.id==='unassigned' ? 'var(--text3)' : '#7F77DD', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600, flexShrink:0 }}>
                        {tech.id==='unassigned' ? '?' : tech.full_name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                      </div>
                      <div>
                        <div style={{ color:'var(--text)', fontSize:13, fontWeight:500 }}>{tech.full_name}</div>
                        <div style={{ fontSize:11, color: isOnline ? '#1D9E75' : 'var(--text3)' }}>
                          {isOnline ? '🟢 Online' : '⚫ Offline'} · {techWOs.length} job{techWOs.length!==1?'s':''}
                        </div>
                      </div>
                    </div>

                    {/* WO cards */}
                    {techWOs.length === 0 ? (
                      <div style={{ background:'var(--bg3)', border:'1px dashed var(--border)', borderRadius:10, padding:24, textAlign:'center', color:'var(--text3)', fontSize:12 }}>No work orders</div>
                    ) : techWOs.map(wo => {
                      const sc = STATUS_CFG[wo.status] || STATUS_CFG.open
                      const nx = NEXT_STATUS[wo.status]
                      return (
                        <div key={wo.id}
                          onClick={() => setActiveWO(wo)}
                          style={{ background: sc.bg, border:`1.5px solid ${sc.border}`, borderRadius:10, padding:12, marginBottom:8, cursor:'pointer', transition:'transform 0.1s, box-shadow 0.1s', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}
                          onMouseEnter={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)' }}
                          onMouseLeave={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.06)' }}
                        >
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                            <span style={{ background: P_COLORS[wo.priority]+'22', color: P_COLORS[wo.priority], fontSize:10, padding:'2px 7px', borderRadius:5, fontWeight:700 }}>{wo.priority}</span>
                            <span style={{ color: sc.text, fontSize:10, fontWeight:500 }}>{sc.label}</span>
                          </div>
                          <div style={{ color: sc.text, fontSize:12, fontWeight:500, marginBottom:4, lineHeight:1.4 }}>{wo.title}</div>
                          <div style={{ color: sc.text, fontSize:11, opacity:0.8 }}>📍 {wo.stores?.name || '—'}</div>
                          {wo.duration_hours && <div style={{ color: sc.text, fontSize:10, opacity:0.6, marginTop:3 }}>⏱ {wo.duration_hours}h estimated</div>}
                          {nx && (
                            <button
                              onClick={e => { e.stopPropagation(); quickStatus(wo, nx.next) }}
                              style={{ marginTop:8, width:'100%', background: sc.border, color:'white', border:'none', borderRadius:7, padding:'5px', fontSize:11, fontWeight:500, cursor:'pointer' }}>
                              {nx.label}
                            </button>
                          )}
                          {wo.status === 'in_progress' && (
                            <button
                              onClick={e => { e.stopPropagation(); setActiveWO(wo); setShowHold(true) }}
                              style={{ marginTop:4, width:'100%', background:'transparent', color: sc.text, border:`1px solid ${sc.border}`, borderRadius:7, padding:'4px', fontSize:11, cursor:'pointer' }}>
                              ⏸ Put on Hold
                            </button>
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
          <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
            {techs.map(t => (
              <div key={t.id} style={{ background:'var(--card-bg)', border:`1px solid ${techLocs[t.id] ? '#1D9E75' : 'var(--border)'}`, borderRadius:10, padding:'8px 14px', display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:30, height:30, borderRadius:'50%', background:'#7F77DD', color:'white', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:600 }}>
                  {t.full_name.split(' ').map(w=>w[0]).join('').slice(0,2)}
                </div>
                <div>
                  <div style={{ color:'var(--text)', fontSize:12, fontWeight:500 }}>{t.full_name}</div>
                  <div style={{ color: techLocs[t.id] ? '#1D9E75' : 'var(--text3)', fontSize:11 }}>
                    {techLocs[t.id] ? '🟢 Online' : '⚫ Offline'} · {(woByTech[t.id]||[]).length} jobs
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div ref={mapRef} style={{ height:500, borderRadius:12, border:'1px solid var(--border)', overflow:'hidden', background:'#e5e3df' }}/>
        </div>
      )}

      {/* ── WO DETAIL POPUP ── */}
      {activeWO && (
        <>
          <div onClick={() => { setActiveWO(null); setShowHold(false); setHoldReason('') }}
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:500, backdropFilter:'blur(3px)' }}/>
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'min(560px, 95vw)', maxHeight:'90vh', overflowY:'auto', background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:16, zIndex:600, padding:24, boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>

            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', gap:8, marginBottom:6 }}>
                  <span style={{ background: P_COLORS[activeWO.priority]+'22', color: P_COLORS[activeWO.priority], fontSize:11, padding:'2px 10px', borderRadius:6, fontWeight:700 }}>{activeWO.priority}</span>
                  <span style={{ background: STATUS_CFG[activeWO.status]?.bg, color: STATUS_CFG[activeWO.status]?.text, fontSize:11, padding:'2px 10px', borderRadius:6, fontWeight:500 }}>{STATUS_CFG[activeWO.status]?.label}</span>
                </div>
                <h3 style={{ color:'var(--text)', fontSize:16, fontWeight:600, margin:0 }}>{activeWO.title}</h3>
                <p style={{ color:'var(--text3)', fontSize:13, margin:'4px 0 0' }}>📍 {activeWO.stores?.name}</p>
              </div>
              <button onClick={() => { setActiveWO(null); setShowHold(false); setHoldReason('') }}
                style={{ background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, width:32, height:32, cursor:'pointer', color:'var(--text2)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
            </div>

            {/* Quick actions */}
            {!showHold && (
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
                {NEXT_STATUS[activeWO.status] && (
                  <button onClick={() => quickStatus(activeWO, NEXT_STATUS[activeWO.status].next)} disabled={saving}
                    style={{ background:'#1D9E75', color:'white', border:'none', borderRadius:8, padding:'9px 16px', fontSize:13, fontWeight:500, cursor:'pointer', flex:1 }}>
                    {saving ? '...' : NEXT_STATUS[activeWO.status].label}
                  </button>
                )}
                {activeWO.status === 'in_progress' && (
                  <button onClick={() => setShowHold(true)}
                    style={{ background:'var(--amber-bg)', color:'var(--amber)', border:'1px solid var(--amber)', borderRadius:8, padding:'9px 16px', fontSize:13, cursor:'pointer' }}>
                    ⏸ Hold
                  </button>
                )}
                <button onClick={() => navigate(`/work-orders/${activeWO.id}`)}
                  style={{ background:'var(--blue-bg)', color:'var(--blue)', border:'1px solid var(--blue)', borderRadius:8, padding:'9px 16px', fontSize:13, cursor:'pointer' }}>
                  Open Full Detail →
                </button>
              </div>
            )}

            {/* Hold form */}
            {showHold && (
              <div style={{ background:'var(--amber-bg)', border:'1px solid var(--amber)', borderRadius:10, padding:14, marginBottom:16 }}>
                <div style={{ color:'var(--amber)', fontSize:13, fontWeight:500, marginBottom:8 }}>⏸ Reason for hold</div>
                <textarea value={holdReason} onChange={e => setHoldReason(e.target.value)}
                  style={{ ...inp, height:70, resize:'none', marginBottom:8 }} placeholder="e.g. Waiting for spare part..."/>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => submitHold(activeWO)} disabled={saving || !holdReason.trim()}
                    style={{ background:'var(--amber)', color:'white', border:'none', borderRadius:7, padding:'7px 16px', fontSize:12, cursor:'pointer' }}>
                    {saving ? '...' : 'Confirm Hold'}
                  </button>
                  <button onClick={() => { setShowHold(false); setHoldReason('') }}
                    style={{ background:'transparent', color:'var(--text2)', border:'1px solid var(--border)', borderRadius:7, padding:'7px 12px', fontSize:12, cursor:'pointer' }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Reassign & Reschedule */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
              <div>
                <label style={{ color:'var(--text3)', fontSize:11, display:'block', marginBottom:4 }}>Reassign Technician</label>
                <select value={activeWO.assigned_to || ''} onChange={e => reassign(activeWO.id, e.target.value)}
                  style={{ ...inp }}>
                  <option value="">Unassigned</option>
                  {techs.map(t => <option key={t.id} value={t.id}>{t.full_name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color:'var(--text3)', fontSize:11, display:'block', marginBottom:4 }}>Scheduled Date</label>
                <input type="date" style={{ ...inp }} value={activeWO.scheduled_date || ''} onChange={e => reschedule(activeWO.id, 'scheduled_date', e.target.value)}/>
              </div>
              <div>
                <label style={{ color:'var(--text3)', fontSize:11, display:'block', marginBottom:4 }}>Duration</label>
                <select style={{ ...inp }} value={activeWO.duration_hours || 1} onChange={e => reschedule(activeWO.id, 'duration_hours', parseFloat(e.target.value))}>
                  {[0.5,1,1.5,2,3,4,8].map(h => <option key={h} value={h}>{h < 1 ? '30 min' : `${h}h`}</option>)}
                </select>
              </div>
              <div>
                <label style={{ color:'var(--text3)', fontSize:11, display:'block', marginBottom:4 }}>Priority</label>
                <select style={{ ...inp }} value={activeWO.priority} onChange={e => reschedule(activeWO.id, 'priority', e.target.value)}>
                  {['P1','P2','P3','P4'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {/* Store info */}
            {activeWO.stores && (
              <div style={{ background:'var(--bg3)', borderRadius:10, padding:12, fontSize:12, color:'var(--text2)' }}>
                <div style={{ fontWeight:500, color:'var(--text)', marginBottom:4 }}>Store Details</div>
                {activeWO.stores.manager_name && <div>👤 {activeWO.stores.manager_name}</div>}
                {activeWO.stores.phone && <a href={`tel:${activeWO.stores.phone}`} style={{ color:'var(--blue)', textDecoration:'none' }}>📞 {activeWO.stores.phone}</a>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
