import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Documents & files for one store: photos, PDFs, drawings, licences, contracts — any file type.
// Files go to the private "attachments" bucket under store/<store_id>/…; links are signed (10 min).
export const DOC_CATEGORIES = ['Photos', 'Trade licence', 'Civil Defence', 'Tenancy / lease', 'AMC contract', 'Drawings / layouts',
  'Certificates', 'Invoices & quotes', 'Warranty', 'Reports', 'Other']
const MAX_MB = 50
const hasErr = (e) => e && Object.keys(e).length
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10)
const daysTo = (d) => Math.round((new Date(d + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000)
const fmtSize = (b) => !b ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`
const fmtDate = (d) => d ? new Date(d.length === 10 ? d + 'T00:00:00' : d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : ''
const isImage = (m, n) => (m || '').startsWith('image/') || /\.(jpe?g|png|gif|webp|heic)$/i.test(n || '')
const icon = (m, n) => isImage(m, n) ? '🖼' : /pdf/i.test(m || n) ? '📕' : /sheet|excel|csv|xls/i.test(m || n) ? '📗' : /word|doc/i.test(m || n) ? '📘' : /dwg|dxf|cad/i.test(n || '') ? '📐' : /zip|rar|7z/i.test(n || '') ? '🗜' : /video|mp4|mov/i.test(m || n) ? '🎬' : '📄'

const INP = { background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 13, width: '100%', boxSizing: 'border-box' }
const BTN = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer', color: 'var(--text)' }
const PRIMARY = { ...BTN, background: 'var(--green)', color: 'white', border: 'none', fontWeight: 600 }

function ExpiryBadge({ date }) {
  if (!date) return null
  const n = daysTo(date)
  const [bg, fg, txt] = n < 0 ? ['var(--red-bg)', 'var(--red)', `Expired ${fmtDate(date)}`]
    : n <= 30 ? ['var(--amber-bg)', 'var(--amber)', `Expires in ${n} day${n === 1 ? '' : 's'}`]
    : ['var(--bg3)', 'var(--text3)', `Valid till ${fmtDate(date)}`]
  return <span style={{ fontSize: 11, fontWeight: 600, background: bg, color: fg, borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>{txt}</span>
}

function DocRow({ d, canManage, onOpen, onDelete, onSave }) {
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState({ title: d.title, category: d.category, expiry_date: d.expiry_date || '', notes: d.notes || '' })
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderTop: '1px solid var(--border)' }}>
      <div onClick={() => onOpen(d)} style={{ width: 52, height: 52, borderRadius: 8, background: 'var(--bg3)', flexShrink: 0, cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
        {d.thumb ? <img src={d.thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/> : icon(d.mime_type, d.file_name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {!edit ? (
          <>
            <div onClick={() => onOpen(d)} style={{ fontWeight: 600, fontSize: 13, cursor: 'pointer', wordBreak: 'break-word' }}>{d.title}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              {d.category} · {fmtSize(d.size_bytes)} · {fmtDate(d.created_at)}{d.profiles?.full_name ? ` · ${d.profiles.full_name}` : ''}
            </div>
            {d.notes && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{d.notes}</div>}
            <div style={{ marginTop: 4 }}><ExpiryBadge date={d.expiry_date}/></div>
          </>
        ) : (
          <div style={{ display: 'grid', gap: 6 }}>
            <input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} style={INP}/>
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={f.category} onChange={e => setF({ ...f, category: e.target.value })} style={INP}>{DOC_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
              <input type="date" value={f.expiry_date} onChange={e => setF({ ...f, expiry_date: e.target.value })} style={INP} title="Expiry date (optional)"/>
            </div>
            <input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="Notes" style={INP}/>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={async () => { if (await onSave(d, f)) setEdit(false) }} style={PRIMARY}>Save</button>
              <button onClick={() => setEdit(false)} style={BTN}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      {!edit && (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button onClick={() => onOpen(d)} title="Open" style={{ ...BTN, padding: '5px 8px' }}>↗</button>
          <button onClick={() => onOpen(d, true)} title="Download" style={{ ...BTN, padding: '5px 8px' }}>⬇</button>
          {canManage && <button onClick={() => setEdit(true)} title="Edit" style={{ ...BTN, padding: '5px 8px' }}>✏️</button>}
          {canManage && <button onClick={() => onDelete(d)} title="Delete" style={{ ...BTN, padding: '5px 8px', color: 'var(--red)' }}>✕</button>}
        </div>
      )}
    </div>
  )
}

export default function StoreDocuments({ store, canManage, onCount }) {
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState('all')
  const [upCat, setUpCat] = useState('Photos')
  const [upExpiry, setUpExpiry] = useState('')
  const [upNotes, setUpNotes] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState(null)
  const fileRef = useRef(null); const camRef = useRef(null)

  useEffect(() => { load() }, [store.id])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('store_documents').select('*, profiles(full_name)').eq('store_id', store.id).order('created_at', { ascending: false })
    if (hasErr(error)) { setMsg({ text: error.message }); setLoading(false); return }
    const rows = data || []
    // thumbnails for photos (signed, short-lived)
    const imgs = rows.filter(r => isImage(r.mime_type, r.file_name))
    if (imgs.length) {
      const { data: signed } = await supabase.storage.from('attachments').createSignedUrls(imgs.map(r => r.file_path), 600)
      ;(signed || []).forEach((s, i) => { if (s?.signedUrl) imgs[i].thumb = s.signedUrl })
    }
    setDocs(rows); setLoading(false); onCount?.(rows.length)
  }

  async function upload(e) {
    const files = [...(e.target.files || [])]; e.target.value = ''
    if (!files.length) return
    const tooBig = files.filter(f => f.size > MAX_MB * 1024 * 1024)
    if (tooBig.length) return setMsg({ text: `Too big (max ${MAX_MB} MB per file): ${tooBig.map(f => f.name).join(', ')}` })
    setMsg(null)
    let ok = 0
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      setBusy(`Uploading ${i + 1} of ${files.length}: ${f.name}`)
      const safe = f.name.replace(/[^\w.\- ]/g, '_').slice(-80)
      const path = `store/${store.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${safe}`
      const up = await supabase.storage.from('attachments').upload(path, f, { contentType: f.type || 'application/octet-stream', upsert: false })
      if (hasErr(up.error)) { setMsg({ text: `${f.name}: ${up.error.message}` }); continue }
      const { error } = await supabase.from('store_documents').insert({
        store_id: store.id, title: f.name.replace(/\.[^.]+$/, ''), category: isImage(f.type, f.name) && upCat === 'Other' ? 'Photos' : upCat,
        file_path: path, file_name: f.name, mime_type: f.type || null, size_bytes: f.size,
        expiry_date: upExpiry || null, notes: upNotes || null,
      })
      if (hasErr(error)) { await supabase.storage.from('attachments').remove([path]); setMsg({ text: `${f.name}: ${error.message}` }); continue }
      ok++
    }
    setBusy('')
    if (ok) { setMsg({ type: 'ok', text: `✅ ${ok} file${ok > 1 ? 's' : ''} uploaded.` }); setUpNotes(''); setUpExpiry('') }
    load()
  }

  async function open(d, download) {
    const { data, error } = await supabase.storage.from('attachments').createSignedUrl(d.file_path, 600, download ? { download: d.file_name } : undefined)
    if (hasErr(error) || !data?.signedUrl) return setMsg({ text: 'Could not open the file: ' + (error?.message || 'no link') })
    window.open(data.signedUrl, '_blank', 'noopener')
  }
  async function remove(d) {
    if (!window.confirm(`Delete "${d.title}"? This cannot be undone.`)) return
    const { error } = await supabase.from('store_documents').delete().eq('id', d.id)
    if (hasErr(error)) return setMsg({ text: error.message })
    await supabase.storage.from('attachments').remove([d.file_path])
    load()
  }
  async function save(d, f) {
    if (!f.title.trim()) { setMsg({ text: 'Title is required' }); return false }
    const { error } = await supabase.from('store_documents').update({ title: f.title.trim(), category: f.category, expiry_date: f.expiry_date || null, notes: f.notes || null }).eq('id', d.id)
    if (hasErr(error)) { setMsg({ text: error.message }); return false }
    load(); return true
  }

  const shown = docs.filter(d => cat === 'all' || (cat === 'expiring' ? d.expiry_date && daysTo(d.expiry_date) <= 30 : d.category === cat))
  const expiring = docs.filter(d => d.expiry_date && daysTo(d.expiry_date) <= 30).length
  const cats = [...new Set(docs.map(d => d.category))]

  return (
    <div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 12, marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Upload files (photos, PDF, Word, Excel, drawings — any type, up to {MAX_MB} MB each)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <select value={upCat} onChange={e => setUpCat(e.target.value)} style={INP} aria-label="Category">{DOC_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
          <input type="date" value={upExpiry} onChange={e => setUpExpiry(e.target.value)} style={INP} title="Expiry date (optional — licences, certificates, contracts)" aria-label="Expiry date"/>
          <input value={upNotes} onChange={e => setUpNotes(e.target.value)} placeholder="Note (optional)" style={{ ...INP, gridColumn: '1 / -1' }}/>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => fileRef.current?.click()} disabled={!!busy} style={PRIMARY}>📎 Choose files</button>
          <button onClick={() => camRef.current?.click()} disabled={!!busy} style={BTN}>📷 Take photo</button>
          <input ref={fileRef} type="file" multiple onChange={upload} style={{ display: 'none' }} data-testid="doc-files"/>
          <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={upload} style={{ display: 'none' }}/>
          {busy && <span style={{ fontSize: 12, color: 'var(--blue)' }}>{busy}</span>}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Expiry date is optional. Documents expiring within 30 days are flagged.</div>
      </div>

      {msg && <div style={{ padding: '8px 12px', borderRadius: 10, marginBottom: 10, fontSize: 13, background: msg.type === 'ok' ? 'var(--green-bg)' : 'var(--red-bg)', color: msg.type === 'ok' ? 'var(--green)' : 'var(--red)' }}>{msg.text}</div>}

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
        {[['all', `All (${docs.length})`], ...(expiring ? [['expiring', `⚠️ Expiring / expired (${expiring})`]] : []), ...cats.map(c => [c, `${c} (${docs.filter(d => d.category === c).length})`])].map(([k, l]) => (
          <button key={k} onClick={() => setCat(k)} style={{ ...BTN, padding: '4px 10px', fontSize: 12, ...(cat === k ? { background: 'var(--green)', color: 'white', borderColor: 'var(--green)' } : {}) }}>{l}</button>
        ))}
      </div>
      {loading ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Loading…</div>
        : shown.length === 0 ? <div style={{ padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>No documents yet. Upload the trade licence, Civil Defence certificate, drawings, photos…</div>
        : shown.map(d => <DocRow key={d.id} d={d} canManage={canManage} onOpen={open} onDelete={remove} onSave={save}/>)}
    </div>
  )
}
