import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { BRAND } from '../lib/brand'

// Service report (A4) in the classic contractor layout: boxed header table, subject + work done,
// photo strip, parts table, "For <company>" block, signatures, contact footer.
// "Download PDF" saves a real PDF file; "Print" opens the print window.
const d2 = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''
const dt = (d) => d ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
const RESULT = { ok: 'OK', issue: 'Issue found', na: 'N/A', done: 'Done' }

export default function WorkOrderReport() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [d, setD] = useState(null)
  const [busy, setBusy] = useState(false)
  const sheet = useRef(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const isVendor = profile?.role === 'vendor'
      const w = await supabase.from('work_orders').select('*,stores(*),assets(name,brand,model,serial_number,location)').eq('id', id).maybeSingle()
      if (!w.data) { if (alive) setD({ wo: null }); return }
      const wo = w.data
      const [u, c, p, h, t, ppm] = await Promise.all([
        supabase.from('wo_updates').select('photos,created_at').eq('work_order_id', id).order('created_at'),
        supabase.from('wo_checklist_items').select('*').eq('work_order_id', id).order('position'),
        isVendor ? Promise.resolve({ data: [] }) :
          supabase.from('stock_movements').select('qty_change,parts(name,unit,part_no)').eq('work_order_id', id).eq('kind', 'use'),
        supabase.rpc('report_header', { p_store: wo.store_id }),
        wo.assigned_to ? supabase.from('profiles').select('full_name,phone').eq('id', wo.assigned_to).maybeSingle() : Promise.resolve({ data: null }),
        wo.ppm_task_id ? supabase.from('ppm_tasks').select('next_due').eq('id', wo.ppm_task_id).maybeSingle() : Promise.resolve({ data: null }),
      ])
      const head = h.data || {}
      let logo = BRAND.banner || BRAND.logo || null
      if (head.logo_path) {
        const s = await supabase.storage.from('attachments').createSignedUrl(head.logo_path, 3600)
        if (s.data?.signedUrl) logo = s.data.signedUrl
      }
      if (alive) setD({ wo, updates: u.data || [], checklist: c.data || [], parts: p.data || [], head, tech: t.data, nextDue: ppm.data?.next_due, logo })
    })()
    return () => { alive = false }
  }, [id, profile?.role])

  useEffect(() => {
    if (d?.wo) document.title = `Service report ${d.wo.report_no || ''} – ${d.wo.stores?.name || ''}`
  }, [d])

  async function downloadPdf() {
    if (!sheet.current) return
    setBusy(true)
    try {
      const html2pdf = (await import('html2pdf.js')).default
      await html2pdf().set({
        margin: 0,
        filename: `Service report ${d.wo.report_no || ''} - ${d.wo.stores?.name || ''}.pdf`.replace(/[\\/:*?"<>|]/g, '-'),
        image: { type: 'jpeg', quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['.rp-avoid'] },
      }).from(sheet.current).save()
    } finally { setBusy(false) }
  }

  if (!d) return <div style={{ padding: 40, textAlign: 'center', color: '#777' }}>Preparing report…</div>
  if (!d.wo) return <div style={{ padding: 40, textAlign: 'center', color: '#E24B4A' }}>Work order not found.</div>

  const { wo, updates, checklist, parts, head, tech, nextDue, logo } = d
  const C = BRAND.color || '#1D9E75'
  const company = head.company_name || BRAND.name || 'Fixnar'
  const photos = (Array.isArray(wo.photos) ? wo.photos : []).concat(updates.flatMap(u => Array.isArray(u.photos) ? u.photos : []))
    .filter(p => typeof p === 'string' && (p.startsWith('data:image') || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(p))).slice(0, 8)
  const jobType = wo.wo_type === 'ppm' ? 'Preventive maintenance (PPM)' : (wo.category ? `Breakdown / repair — ${wo.category}` : 'Breakdown / repair')
  const done = wo.completed_at || wo.closed_at
  const signed = !!wo.signature_url
  const engineer = tech?.full_name || (wo.vendor_name ? '—' : '—')
  const customer = head.client_name || wo.stores?.name || '—'
  const asset = wo.assets ? [wo.assets.name, [wo.assets.brand, wo.assets.model].filter(Boolean).join(' '), wo.assets.serial_number && `S/N ${wo.assets.serial_number}`].filter(Boolean).join(' · ') : null
  const partRows = parts.length ? parts.map(m => ({ name: [m.parts?.name, m.parts?.part_no && `(${m.parts.part_no})`].filter(Boolean).join(' '), qty: `${Math.abs(m.qty_change)} ${m.parts?.unit || ''}`.trim() })) : [{ name: '', qty: '' }]
  const address = [head.address, head.emirate].filter(Boolean).join(', ')

  const T = { width: '100%', borderCollapse: 'collapse', fontSize: 15 }
  const td = { border: '1px solid #222', padding: '3px 8px', verticalAlign: 'top' }
  const label = { ...td, width: 200, whiteSpace: 'nowrap' }
  const serif = "'Times New Roman', Times, Georgia, serif"

  return (
    <div style={{ background: '#e9ecef', minHeight: '100vh', padding: '16px 0' }}>
      <style>{`@media print { .no-print { display:none !important } body { background:#fff !important } .rp-sheet { box-shadow:none !important; margin:0 !important } @page { size:A4; margin:0 } }
        .rp-sheet * { box-sizing:border-box }`}</style>
      <div className="no-print" style={{ maxWidth: 794, margin: '0 auto 12px', display: 'flex', gap: 8, padding: '0 12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={() => navigate(-1)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>← Back</button>
        <button onClick={downloadPdf} disabled={busy} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C, color: '#fff', fontWeight: 600, cursor: 'pointer' }}>{busy ? 'Creating PDF…' : '⬇ Download PDF'}</button>
        <button onClick={() => window.print()} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}>🖨 Print</button>
        {!signed && <span style={{ fontSize: 12, color: '#a15c00' }}>Not signed by the store manager yet.</span>}
      </div>

      <div ref={sheet} className="rp-sheet" translate="no" dir="ltr"
        style={{ width: 794, minHeight: 1120, margin: '0 auto', background: '#fff', color: '#111', position: 'relative', overflow: 'hidden',
          boxShadow: '0 2px 12px rgba(0,0,0,.15)', fontFamily: serif, display: 'flex', flexDirection: 'column', padding: '24px 44px 0' }}>

        {/* corner accents */}
        {/* (border triangles — they render in the downloaded PDF too) */}
        <div aria-hidden style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderTop: '190px solid #4a4f55', borderLeft: '300px solid transparent' }}/>
        <div aria-hidden style={{ position: 'absolute', top: 0, right: 0, width: 0, height: 0, borderTop: `240px solid ${C}`, borderLeft: '190px solid transparent' }}/>
        <div aria-hidden style={{ position: 'absolute', bottom: 0, left: 0, width: 0, height: 0, borderBottom: `105px solid ${C}`, borderRight: '100px solid transparent' }}/>
        <div aria-hidden style={{ position: 'absolute', bottom: 0, left: 0, width: 0, height: 0, borderBottom: '68px solid #4a4f55', borderRight: '85px solid transparent' }}/>
        {/* watermark */}
        {logo && <img src={logo} alt="" crossOrigin="anonymous" style={{ position: 'absolute', top: '36%', left: '50%', transform: 'translate(-50%,-50%)', width: 420, opacity: .06, pointerEvents: 'none' }}/>}

        {/* logo */}
        <div style={{ position: 'relative', height: 84, display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          {logo
            ? <img src={logo} alt="" crossOrigin="anonymous" style={{ maxHeight: 92, maxWidth: 360, objectFit: 'contain' }}/>
            : <div><div style={{ fontFamily: 'Arial, sans-serif', fontSize: 38, fontWeight: 900, letterSpacing: '.02em', color: '#222' }}>{company.toUpperCase()}</div>
                {head.legal_name && head.legal_name !== company && <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 13, letterSpacing: '.35em', color: '#333' }}>{head.legal_name.toUpperCase()}</div>}</div>}
        </div>

        <div style={{ position: 'relative' }}>
          {/* header table */}
          <table style={{ ...T, borderBottom: '4px solid #111' }}><tbody>
            <tr>
              <td style={{ ...td, width: 90, fontSize: 18 }}>No.</td>
              <td style={{ ...td, width: 115, color: '#c00', fontSize: 15 }}>{wo.report_no || ''}</td>
              <td style={{ ...td, textAlign: 'center', fontSize: 34, verticalAlign: 'middle' }}>Service report</td>
              <td style={{ ...td, width: 62, fontSize: 18, lineHeight: 1.25 }}>Date{nextDue ? <><br/>To</> : null}</td>
              <td style={{ ...td, width: 162, fontSize: 18, lineHeight: 1.25 }}>{d2(done || wo.created_at)}{nextDue ? <><br/>{d2(nextDue)}</> : null}</td>
            </tr>
          </tbody></table>
          <table style={{ ...T, fontSize: 18 }}><tbody>
            <tr><td style={{ ...td, borderTop: 'none' }} colSpan={1}>Job Type</td><td style={{ ...td, borderTop: 'none', width: 224 }}>{wo.wo_type === 'ppm' ? 'Service (PPM)' : 'Repair'}</td></tr>
          </tbody></table>
          <table style={{ ...T, fontSize: 17 }}><tbody>
            <tr><td style={{ ...label, borderTop: 'none' }}>Customer name :</td><td style={{ ...td, borderTop: 'none', fontFamily: 'Arial, sans-serif', fontWeight: 700, fontSize: 15 }}>{customer}</td></tr>
            <tr><td style={label}>Location:</td><td style={{ ...td, fontFamily: 'Arial, sans-serif', fontSize: 15 }}>{[wo.stores?.name, wo.stores?.address].filter(Boolean).join(' — ')}</td></tr>
            {asset && <tr><td style={label}>Equipment:</td><td style={{ ...td, fontFamily: 'Arial, sans-serif', fontSize: 15 }}>{asset}{wo.assets?.location ? ` — ${wo.assets.location}` : ''}</td></tr>}
            <tr><td style={label}>Engineer:</td><td style={td}>{engineer.toUpperCase()}{wo.vendor_name ? <span style={{ fontSize: 14 }}> ({wo.vendor_name})</span> : null}</td></tr>
          </tbody></table>

          {/* body */}
          <div style={{ border: '1px solid #222', borderTop: 'none', padding: '5px 10px 8px', fontSize: 15, lineHeight: 1.45 }}>
            <div><b>Subject: {wo.title}</b></div>
            <div style={{ fontSize: 13.5, color: '#333' }}>{jobType} · Priority {wo.priority}</div>
            {wo.description && <div style={{ marginTop: 4 }}><b>Reported problem:</b> <span style={{ whiteSpace: 'pre-wrap' }}>{wo.description}</span></div>}
            {wo.work_update && <div style={{ marginTop: 4 }}><b>Work carried out:</b><div style={{ whiteSpace: 'pre-wrap' }}>{wo.work_update}</div></div>}
            {checklist.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <div>The following checks were carried out:</div>
                <ol style={{ margin: '2px 0 0', paddingLeft: 40 }}>
                  {checklist.map(c => (
                    <li key={c.id}><b>{c.label}:</b> {c.is_done ? (RESULT[c.result] || 'Checked') : 'Not checked'}{c.note ? ` — ${c.note}` : ''}</li>
                  ))}
                </ol>
              </div>
            )}
            <div style={{ marginTop: 4 }}><b>Conclusion:</b></div>
            <div>
              {done ? `Job completed on ${dt(done)}.` : `Job status: ${String(wo.status || '').replace('_', ' ')}.`}
              {wo.hold_reason && !done ? ` On hold: ${wo.hold_reason}.` : ''}
              {signed ? ` Work accepted and signed by the store manager${wo.signed_by ? ` (${wo.signed_by})` : ''}${wo.signed_at ? ` on ${dt(wo.signed_at)}` : ''}.` : ''}
            </div>
          </div>

          {/* photos */}
          {photos.length > 0 && (
            <div className="rp-avoid" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(4, photos.length)}, 1fr)`, gap: 6, padding: '6px 0', borderLeft: '1px solid #222', borderRight: '1px solid #222' }}>
              {photos.map((p, i) => <img key={i} src={p} alt="" style={{ width: '100%', height: photos.length > 4 ? 125 : 165, objectFit: 'cover' }}/>)}
            </div>
          )}

          {/* parts */}
          <table className="rp-avoid" style={{ ...T, fontSize: 18 }}><tbody>
            <tr>
              <td style={{ ...td, width: 50, fontWeight: 700 }}>S.<br/>N</td>
              <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>Parts required / Used</td>
              <td style={{ ...td, width: 160, textAlign: 'center', fontWeight: 700 }}>Quantity</td>
            </tr>
            {partRows.map((r, i) => (
              <tr key={i}><td style={td}>{i + 1}.</td><td style={{ ...td, fontSize: 16 }}>{r.name}</td><td style={{ ...td, fontSize: 16, textAlign: 'center' }}>{r.qty}</td></tr>
            ))}
          </tbody></table>

          {/* for company */}
          <table className="rp-avoid" style={{ ...T, fontSize: 18 }}><tbody>
            <tr><td style={{ ...td, borderTop: 'none', textAlign: 'center' }} colSpan={2}>For <b>{company.toUpperCase()}</b></td></tr>
            <tr><td style={{ ...td, width: 165 }}>Name</td><td style={td}>{tech?.full_name ? `Eng. ${tech.full_name}` : (wo.vendor_name || '')}</td></tr>
            <tr><td style={td}>Contact no.</td><td style={td}>{tech?.phone || head.phone || ''}</td></tr>
          </tbody></table>

          {/* signatures */}
          <div className="rp-avoid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 10, fontSize: 16, paddingLeft: 0 }}>
            <div>
              <div>Signature</div>
              <div style={{ height: 66, borderBottom: '1px dotted #888', marginTop: 4 }}/>
              <div style={{ fontSize: 13, color: '#444', marginTop: 3 }}>Technician / for {company}</div>
            </div>
            <div>
              <div>Store manager — accepted by</div>
              <div style={{ height: 66, borderBottom: '1px dotted #888', marginTop: 4, display: 'flex', alignItems: 'flex-end' }}>
                {signed && <img src={wo.signature_url} alt="Signature" style={{ maxHeight: 64, maxWidth: '100%' }}/>}
              </div>
              <div style={{ fontSize: 13, color: '#444', marginTop: 3 }}>{wo.signed_by || 'Name:'}{wo.signed_at ? ` · ${dt(wo.signed_at)}` : ''}</div>
            </div>
          </div>
        </div>

        {/* footer */}
        <div style={{ marginTop: 'auto', position: 'relative', padding: '12px 0 14px 110px', fontFamily: 'Arial, sans-serif', fontSize: 14, color: '#222', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 18, flexWrap: 'wrap' }}>
            {head.phone && <span><Dot c={C}>☎</Dot> {head.phone}</span>}
            {address && <span><Dot c={C}>⌖</Dot> {address}</span>}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 18, flexWrap: 'wrap', marginTop: 4 }}>
            {head.email && <span><Dot c={C}>@</Dot> {head.email}</span>}
            {head.website && <span><Dot c={C}>◍</Dot> {head.website}</span>}
            {head.trn && <span>TRN {head.trn}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function Dot({ c, children }) {
  return <span style={{ display: 'inline-flex', width: 18, height: 18, borderRadius: 9, background: c, color: '#fff', fontSize: 11, alignItems: 'center', justifyContent: 'center', verticalAlign: 'middle' }}>{children}</span>
}
