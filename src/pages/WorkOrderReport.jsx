import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const STATUS = { open:'Open', travelling:'On the way', arrived:'Arrived', in_progress:'In progress', on_hold:'On hold', completed:'Completed', closed:'Closed' }
const fmt = (d) => d ? new Date(d).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'
const AED = (n) => `AED ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })}`
const mins = (a, b) => (a && b) ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000)) : null
const dur = (m) => m == null ? '—' : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`

// Printable one-page job report. "Save as PDF" in the print dialog creates the PDF.
export default function WorkOrderReport() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [d, setD] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const isVendor = profile?.role === 'vendor'
      const [w, u, c, q, p] = await Promise.all([
        supabase.from('work_orders').select('*,stores(*),assets(name,brand,model,serial_number)').eq('id', id).maybeSingle(),
        supabase.from('wo_updates').select('*,profiles(full_name)').eq('work_order_id', id).order('created_at'),
        supabase.from('wo_checklist_items').select('*').eq('work_order_id', id).order('position'),
        supabase.from('vendor_quotes').select('*').eq('work_order_id', id).order('created_at'),
        isVendor ? Promise.resolve({ data:[] }) :
          supabase.from('stock_movements').select('qty_change,unit_cost,parts(name,unit)').eq('work_order_id', id).eq('kind', 'use'),
      ])
      let tech = null
      if (w.data?.assigned_to) {
        const t = await supabase.from('profiles').select('full_name,phone').eq('id', w.data.assigned_to).maybeSingle()
        tech = t.data
      }
      if (alive) setD({ wo: w.data, updates: u.data || [], checklist: c.data || [], quotes: q.data || [], parts: p.data || [], tech })
    })()
    return () => { alive = false }
  }, [id, profile?.role])

  if (!d) return <div style={{ padding:40, textAlign:'center', color:'#777' }}>Preparing report…</div>
  if (!d.wo) return <div style={{ padding:40, textAlign:'center', color:'#E24B4A' }}>Work order not found.</div>

  const { wo, updates, checklist, quotes, parts, tech } = d
  const photos = updates.flatMap(u => Array.isArray(u.photos) ? u.photos : []).concat(Array.isArray(wo.photos) ? wo.photos : []).slice(0, 8)
  const partsTotal = parts.reduce((a, m) => a + Math.abs(m.qty_change) * Number(m.unit_cost || 0), 0)
  const approved = quotes.filter(q => ['approved', 'paid'].includes(q.status))
  const slaMet = wo.sla_due_at ? (new Date(wo.completed_at || wo.closed_at || Date.now()) <= new Date(wo.sla_due_at)) : null
  const showMoney = profile?.role !== 'technician'

  const box = { border:'1px solid #e3e3e3', borderRadius:8, padding:'10px 12px', breakInside:'avoid' }
  const h = { fontSize:11, fontWeight:700, color:'#1D9E75', letterSpacing:'.06em', margin:'0 0 6px' }
  const row = { display:'flex', justifyContent:'space-between', gap:10, fontSize:12, padding:'3px 0' }

  return (
    <div style={{ background:'#eee', minHeight:'100vh', padding:'16px 0' }}>
      <style>{`@media print { .no-print { display:none !important } body { background:#fff } .sheet { box-shadow:none !important; margin:0 !important; width:auto !important } @page { size:A4; margin:12mm } }`}</style>
      <div className="no-print" style={{ maxWidth:794, margin:'0 auto 12px', display:'flex', gap:8, padding:'0 12px' }}>
        <button onClick={() => navigate(-1)} style={{ padding:'8px 14px', borderRadius:8, border:'1px solid #ccc', background:'#fff', cursor:'pointer' }}>← Back</button>
        <button onClick={() => window.print()} style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'#1D9E75', color:'#fff', fontWeight:600, cursor:'pointer' }}>🖨 Print / Save as PDF</button>
        <span style={{ fontSize:12, color:'#666', alignSelf:'center' }}>In the print window choose “Save as PDF”.</span>
      </div>

      <div className="sheet" style={{ width:794, maxWidth:'100%', margin:'0 auto', background:'#fff', color:'#111', padding:28, boxShadow:'0 2px 12px rgba(0,0,0,.12)', fontFamily:"'DM Sans', Arial, sans-serif" }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', borderBottom:'2px solid #1D9E75', paddingBottom:12, marginBottom:14 }}>
          <div>
            <div style={{ fontSize:20, fontWeight:800, color:'#1D9E75' }}>Fixnar</div>
            <div style={{ fontSize:11, color:'#666' }}>Maintenance job report</div>
          </div>
          <div style={{ textAlign:'right', fontSize:12 }}>
            <div style={{ fontWeight:700, fontSize:14 }}>WO #{id.slice(0, 8).toUpperCase()}</div>
            <div>Status: <b>{STATUS[wo.status] || wo.status}</b></div>
            <div style={{ color:'#666' }}>Printed {fmt(new Date())}</div>
          </div>
        </div>

        <div style={{ fontSize:17, fontWeight:700, marginBottom:4 }}>{wo.title}</div>
        <div style={{ fontSize:12, color:'#444', marginBottom:14 }}>
          {wo.priority} · {wo.category || '—'}{wo.wo_type === 'ppm' ? ' · Planned maintenance (PPM)' : ''}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
          <div style={box}>
            <div style={h}>LOCATION</div>
            <div style={{ fontSize:13, fontWeight:600 }}>{wo.stores?.name || '—'}</div>
            <div style={{ fontSize:12, color:'#555' }}>{wo.stores?.address}</div>
            <div style={{ fontSize:12, color:'#555' }}>{[wo.stores?.manager_name, wo.stores?.phone].filter(Boolean).join(' · ')}</div>
            {wo.assets && <div style={{ fontSize:12, marginTop:6 }}>Asset: <b>{wo.assets.name}</b>{[wo.assets.brand, wo.assets.model, wo.assets.serial_number && 'S/N ' + wo.assets.serial_number].filter(Boolean).length ? ' — ' + [wo.assets.brand, wo.assets.model, wo.assets.serial_number && 'S/N ' + wo.assets.serial_number].filter(Boolean).join(' · ') : ''}</div>}
          </div>
          <div style={box}>
            <div style={h}>TIMELINE</div>
            <div style={row}><span>Reported</span><b>{fmt(wo.created_at)}</b></div>
            <div style={row}><span>Arrived on site</span><span>{fmt(wo.arrived_at)}</span></div>
            <div style={row}><span>Completed</span><span>{fmt(wo.completed_at)}</span></div>
            <div style={row}><span>Response time</span><span>{dur(mins(wo.created_at, wo.arrived_at || wo.work_started_at))}</span></div>
            <div style={row}><span>SLA</span><b style={{ color: slaMet == null ? '#111' : slaMet ? '#1D9E75' : '#E24B4A' }}>{slaMet == null ? '—' : slaMet ? 'Met' : 'Breached'}</b></div>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
          <div style={box}>
            <div style={h}>DONE BY</div>
            <div style={{ fontSize:12 }}>Technician: <b>{tech?.full_name || '—'}</b></div>
            <div style={{ fontSize:12 }}>Vendor: <b>{wo.vendor_name || 'In-house'}</b></div>
          </div>
          <div style={box}>
            <div style={h}>PROBLEM</div>
            <div style={{ fontSize:12, whiteSpace:'pre-wrap' }}>{wo.description || '—'}</div>
          </div>
        </div>

        <div style={{ ...box, marginBottom:10 }}>
          <div style={h}>WORK DONE</div>
          <div style={{ fontSize:12, whiteSpace:'pre-wrap' }}>{wo.work_update || '—'}</div>
          {wo.hold_reason && <div style={{ fontSize:12, color:'#a66', marginTop:4 }}>Hold reason: {wo.hold_reason}</div>}
        </div>

        {checklist.length > 0 && (
          <div style={{ ...box, marginBottom:10 }}>
            <div style={h}>CHECKLIST ({checklist.filter(c => c.is_done).length}/{checklist.length})</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2px 16px' }}>
              {checklist.map(c => (
                <div key={c.id} style={{ fontSize:12, display:'flex', gap:6 }}>
                  <span style={{ width:14 }}>{c.is_done ? '☑' : '☐'}</span>
                  <span style={{ flex:1 }}>{c.label}</span>
                  {c.result && <b style={{ color: c.result === 'issue' ? '#E24B4A' : '#555' }}>{c.result.toUpperCase()}</b>}
                </div>
              ))}
            </div>
          </div>
        )}

        {showMoney && (parts.length > 0 || approved.length > 0 || wo.cost != null) && (
          <div style={{ ...box, marginBottom:10 }}>
            <div style={h}>COST</div>
            {parts.map((m, i) => <div key={i} style={row}><span>{Math.abs(m.qty_change)} {m.parts?.unit} × {m.parts?.name}</span><span>{AED(Math.abs(m.qty_change) * Number(m.unit_cost || 0))}</span></div>)}
            {approved.map(q => <div key={q.id} style={row}><span>Vendor {q.kind}{q.description ? ` — ${q.description}` : ''}</span><span>{AED(q.amount)}</span></div>)}
            {approved.length === 0 && wo.cost != null && <div style={row}><span>Job cost</span><span>{AED(wo.cost)}</span></div>}
            <div style={{ ...row, borderTop:'1px solid #ddd', marginTop:4, paddingTop:6, fontWeight:700 }}><span>Total</span><span>{AED(Number(wo.cost || 0) + partsTotal)}</span></div>
          </div>
        )}

        {photos.length > 0 && (
          <div style={{ ...box, marginBottom:10 }}>
            <div style={h}>PHOTOS</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:6 }}>
              {photos.map((p, i) => <img key={i} src={p} alt="" style={{ width:'100%', height:110, objectFit:'cover', borderRadius:4 }}/>)}
            </div>
          </div>
        )}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div style={box}>
            <div style={h}>STORE MANAGER SIGN-OFF</div>
            {wo.signature_url ? <img src={wo.signature_url} alt="Signature" style={{ height:70, maxWidth:'100%' }}/> : <div style={{ height:70, borderBottom:'1px solid #999' }}/>}
            <div style={{ fontSize:12, marginTop:4 }}>{wo.signed_by || 'Name: ____________________'}</div>
            <div style={{ fontSize:11, color:'#666' }}>{wo.signed_at ? fmt(wo.signed_at) : 'Date: ____________'}</div>
          </div>
          <div style={box}>
            <div style={h}>ACTIVITY</div>
            {updates.slice(-6).map(u => (
              <div key={u.id} style={{ fontSize:11, color:'#444', padding:'1px 0' }}>{fmt(u.created_at)} — {u.content}</div>
            ))}
            {updates.length === 0 && <div style={{ fontSize:11, color:'#777' }}>—</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
