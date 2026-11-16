import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, fetchAllRows } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { compressImage } from '../lib/files'
import { assetAi, SPEC_FIELDS, ASSET_CATEGORIES } from '../lib/assetAi'
import QRLabels from '../components/QRLabels'

const hasErr = (e) => e && Object.keys(e).length
const AED = (n) => n == null || n === '' ? '—' : `AED ${Math.round(Number(n)).toLocaleString('en-US')}`
const STATUSES = ['operational', 'maintenance', 'inactive', 'retired']
const INP = { background:'var(--input-bg)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, width:'100%', boxSizing:'border-box' }
const LBL = { fontSize:11, fontWeight:600, color:'var(--text3)', marginBottom:5, display:'block' }
const BTN = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 14px', fontSize:13, cursor:'pointer', color:'var(--text)' }
const PRIMARY = { ...BTN, background:'var(--green)', color:'white', border:'none', fontWeight:600 }
const CARD = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }
const EMPTY = {
  name:'', category:'Kitchen Equipment', subcategory:'', store_id:'', location:'', brand:'', model:'', serial_number:'',
  purchase_date:'', status:'operational', notes:'', specs:{}, specs_source:null, ai_identified:null,
  market_price_low:'', market_price_mid:'', market_price_high:'', market_sources:null,
}

async function signedPhoto(path) {
  if (!path) return null
  const { data } = await supabase.storage.from('attachments').createSignedUrl(path, 600)
  return data?.signedUrl || null
}

// ── Add / edit asset (module level so inputs keep focus) ─────────────────────
function AssetForm({ initial, stores, canPrice, onClose, onSaved }) {
  const [f, setF]           = useState(initial)
  const [photo, setPhoto]   = useState(null)          // new photo (data URL)
  const [photoUrl, setPhotoUrl] = useState(null)      // existing photo
  const [busy, setBusy]     = useState('')            // 'identify' | 'specs' | 'price' | 'save'
  const [msg, setMsg]       = useState(null)
  const [aiNote, setAiNote] = useState(initial.ai_identified ? aiSummary(initial.ai_identified) : '')
  const [priceInfo, setPriceInfo] = useState(initial.market_sources || null)
  const camRef = useRef(null); const fileRef = useRef(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const setSpec = (k, v) => setF(p => ({ ...p, specs: { ...(p.specs || {}), [k]: v }, specs_source: 'manual' }))
  const flash = (text, type = 'error') => setMsg({ text, type })

  useEffect(() => { if (initial.photo_path) signedPhoto(initial.photo_path).then(setPhotoUrl) }, [initial.photo_path])

  function aiSummary(r) {
    return `AI: ${r.name || '?'}${r.brand ? ' · ' + r.brand : ''}${r.model ? ' ' + r.model : ''} (${r.confidence || 'unknown'} confidence)${r.description ? ' — ' + r.description : ''}`
  }

  async function onPhoto(e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    try {
      const img = await compressImage(file, 1280, 0.75)
      setPhoto(img); setMsg(null)
      setBusy('identify')
      const { data } = await assetAi('identify', { image: img })
      setF(p => ({
        ...p,
        name: p.name || data.name || '',
        category: ASSET_CATEGORIES.includes(data.category) ? (p.name ? p.category : data.category) : p.category,
        subcategory: p.subcategory || data.subcategory || '',
        brand: p.brand || data.brand || '',
        model: p.model || data.model || '',
        serial_number: p.serial_number || data.serial_number || '',
        ai_identified: data,
      }))
      setAiNote(aiSummary(data))
    } catch (err) {
      flash(`Photo saved, but AI identification failed: ${err.message}`)
    } finally { setBusy('') }
  }

  async function getSpecs() {
    if (!f.name && !f.model) return flash('Enter the asset name or model first')
    setBusy('specs'); setMsg(null)
    try {
      const { data, searched } = await assetAi('specs', { name:f.name, brand:f.brand, model:f.model, category:f.category })
      const specs = {}
      SPEC_FIELDS.forEach(([k]) => { if (data[k] != null && data[k] !== '') specs[k] = data[k] })
      if (Array.isArray(data.other) && data.other.length) specs.other = data.other.join('\n')
      specs.spec_match = data.spec_match || null
      specs.notes = [data.notes, searched ? null : 'from AI knowledge (no live search)'].filter(Boolean).join(' · ') || null
      setF(p => ({ ...p, specs: { ...(p.specs || {}), ...specs }, specs_source:'ai' }))
      flash(`✅ Technical details filled (${data.spec_match || 'estimate'}). Check them against the nameplate.`, 'ok')
    } catch (err) { flash(err.message) } finally { setBusy('') }
  }

  async function getPrice() {
    if (!f.name && !f.model) return flash('Enter the asset name or model first')
    setBusy('price'); setMsg(null)
    try {
      const { data, searched, sources } = await assetAi('price', { name:f.name, brand:f.brand, model:f.model, category:f.category })
      setF(p => ({ ...p, market_price_low: data.low ?? '', market_price_mid: data.mid ?? '', market_price_high: data.high ?? '' }))
      const info = { basis: data.basis, notes: data.notes, searched, listings: (data.listings || []).slice(0, 6), sources: sources || [] }
      setPriceInfo(info)
      if (!data.low && !data.mid) flash('No reliable price found — enter it manually.')
      else flash(`✅ Market price found (${data.basis || 'estimate'}).`, 'ok')
    } catch (err) { flash(err.message) } finally { setBusy('') }
  }

  const low = Number(f.market_price_low) || null, mid = Number(f.market_price_mid) || null
  const value = low && mid ? (low + mid) / 2 : (mid || low || null)

  async function save() {
    if (!f.name.trim() || !f.store_id) return flash('Asset name and store are required')
    setBusy('save'); setMsg(null)
    try {
      const row = {
        name: f.name.trim(), category: f.category || null, subcategory: f.subcategory || null, store_id: f.store_id,
        location: f.location || null, brand: f.brand || null, model: f.model || null, serial_number: f.serial_number || null,
        purchase_date: f.purchase_date || null, status: f.status || 'operational', notes: f.notes || null,
        specs: f.specs || {}, specs_source: f.specs_source, ai_identified: f.ai_identified,
      }
      if (canPrice) {
        Object.assign(row, {
          market_price_low: f.market_price_low === '' ? null : Number(f.market_price_low),
          market_price_mid: f.market_price_mid === '' ? null : Number(f.market_price_mid),
          market_price_high: f.market_price_high === '' ? null : Number(f.market_price_high),
          market_sources: priceInfo, market_checked_at: priceInfo ? new Date().toISOString() : (initial.market_checked_at || null),
        })
      }
      let id = f.id
      if (id) {
        const { error } = await supabase.from('assets').update(row).eq('id', id)
        if (hasErr(error)) throw new Error(error.message)
      } else {
        const { data, error } = await supabase.from('assets').insert(row).select('id').single()
        if (hasErr(error)) throw new Error(error.message)
        id = data.id
      }
      if (photo) {
        const blob = await (await fetch(photo)).blob()
        const path = `asset/${id}/${Date.now()}.jpg`
        const up = await supabase.storage.from('attachments').upload(path, blob, { contentType:'image/jpeg' })
        if (hasErr(up.error)) throw new Error('Saved, but the photo upload failed: ' + up.error.message)
        const u = await supabase.from('assets').update({ photo_path: path }).eq('id', id)
        if (hasErr(u.error)) throw new Error(u.error.message)
      }
      const { data: saved } = await supabase.from('assets').select('*, stores(name)').eq('id', id).maybeSingle()
      onSaved(saved)
    } catch (err) { flash(err.message) } finally { setBusy('') }
  }

  const section = (n, title, children, extra) => (
    <div style={{ ...CARD, padding:16, marginBottom:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:10, marginBottom:12, flexWrap:'wrap' }}>
        <div style={{ fontWeight:700 }}><span style={{ display:'inline-flex', width:22, height:22, borderRadius:'50%', background:'var(--green)', color:'white', fontSize:12, alignItems:'center', justifyContent:'center', marginRight:8 }}>{n}</span>{title}</div>
        {extra}
      </div>
      {children}
    </div>
  )

  return (
    <div onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:1000, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'24px 12px', overflowY:'auto' }}>
      <div style={{ background:'var(--bg)', borderRadius:16, padding:18, width:'100%', maxWidth:760, border:'1px solid var(--border)', color:'var(--text)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
          <h3 style={{ margin:0 }}>{f.id ? `Edit asset ${initial.asset_code || ''}` : 'Add asset'}</h3>
          <button onClick={onClose} disabled={!!busy} style={BTN}>✕</button>
        </div>

        {section(1, 'Photo — AI identifies the machine',
          <div style={{ display:'flex', gap:14, alignItems:'center', flexWrap:'wrap' }}>
            <div style={{ width:150, height:150, borderRadius:10, background:'var(--bg3)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0 }}>
              {photo || photoUrl ? <img src={photo || photoUrl} alt="asset" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : <span style={{ fontSize:40 }}>📷</span>}
            </div>
            <div style={{ flex:1, minWidth:200, display:'grid', gap:8 }}>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <button onClick={() => camRef.current?.click()} disabled={!!busy} style={PRIMARY}>📷 Take photo</button>
                <button onClick={() => fileRef.current?.click()} disabled={!!busy} style={BTN}>🖼 Upload photo</button>
                <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} style={{ display:'none' }}/>
                <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} style={{ display:'none' }}/>
              </div>
              {busy === 'identify' && <div style={{ fontSize:13, color:'var(--blue)' }}>🔎 Identifying the equipment…</div>}
              {aiNote && <div style={{ fontSize:12, color:'var(--text2)', background:'var(--blue-bg)', borderRadius:8, padding:'6px 10px' }}>{aiNote}</div>}
              <div style={{ fontSize:11, color:'var(--text3)' }}>Tip: include the nameplate/sticker in the photo so brand, model and serial can be read.</div>
            </div>
          </div>
        )}

        {section(2, 'Asset details',
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))', gap:10 }}>
            <div style={{ gridColumn:'1 / -1' }}><label style={LBL}>ASSET NAME *</label><input value={f.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Double-basket gas fryer" style={INP}/></div>
            <div><label style={LBL}>STORE *</label>
              <select value={f.store_id} onChange={e => set('store_id', e.target.value)} style={INP} disabled={!canPrice && !!f.id}>
                <option value="">Select store…</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select></div>
            <div><label style={LBL}>LOCATION IN STORE</label><input value={f.location || ''} onChange={e => set('location', e.target.value)} placeholder="Kitchen hot line, back store…" style={INP}/></div>
            <div><label style={LBL}>CATEGORY</label>
              <select value={f.category || ''} onChange={e => set('category', e.target.value)} style={INP}>
                {[...new Set([...ASSET_CATEGORIES, f.category].filter(Boolean))].map(c => <option key={c}>{c}</option>)}
              </select></div>
            <div><label style={LBL}>TYPE</label><input value={f.subcategory || ''} onChange={e => set('subcategory', e.target.value)} placeholder="Fryer, chiller, split AC…" style={INP}/></div>
            <div><label style={LBL}>BRAND</label><input value={f.brand || ''} onChange={e => set('brand', e.target.value)} style={INP}/></div>
            <div><label style={LBL}>MODEL</label><input value={f.model || ''} onChange={e => set('model', e.target.value)} style={INP}/></div>
            <div><label style={LBL}>SERIAL NO. (if available)</label><input value={f.serial_number || ''} onChange={e => set('serial_number', e.target.value)} style={INP}/></div>
            <div><label style={LBL}>PURCHASE DATE</label><input type="date" value={f.purchase_date || ''} onChange={e => set('purchase_date', e.target.value)} style={INP}/></div>
            <div><label style={LBL}>STATUS</label>
              <select value={f.status || 'operational'} onChange={e => set('status', e.target.value)} style={INP} disabled={!canPrice}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select></div>
            <div style={{ gridColumn:'1 / -1' }}><label style={LBL}>NOTES</label><input value={f.notes || ''} onChange={e => set('notes', e.target.value)} style={INP}/></div>
          </div>
        )}

        {section(3, 'Technical details',
          <>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(170px, 1fr))', gap:10 }}>
              {SPEC_FIELDS.map(([k, l]) => (
                <div key={k}><label style={LBL}>{l.toUpperCase()}</label><input value={f.specs?.[k] ?? ''} onChange={e => setSpec(k, e.target.value)} style={INP}/></div>
              ))}
              <div style={{ gridColumn:'1 / -1' }}><label style={LBL}>OTHER SPECS (one per line)</label>
                <textarea rows={3} value={f.specs?.other ?? ''} onChange={e => setSpec('other', e.target.value)} style={{ ...INP, resize:'vertical' }}/></div>
            </div>
            {(f.specs?.spec_match || f.specs?.notes) && <div style={{ fontSize:12, color:'var(--text3)', marginTop:8 }}>{[f.specs.spec_match && `Match: ${f.specs.spec_match}`, f.specs.notes].filter(Boolean).join(' · ')}</div>}
          </>,
          <button onClick={getSpecs} disabled={!!busy} style={{ ...BTN, borderColor:'var(--blue)', color:'var(--blue)' }}>{busy === 'specs' ? 'Looking up…' : '✨ Get from brand & model'}</button>
        )}

        {canPrice && section(4, 'Current market price (new, UAE)',
          <>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(150px, 1fr))', gap:10 }}>
              <div><label style={LBL}>LOWEST (AED)</label><input type="number" min="0" value={f.market_price_low} onChange={e => set('market_price_low', e.target.value)} style={INP}/></div>
              <div><label style={LBL}>MEDIUM (AED)</label><input type="number" min="0" value={f.market_price_mid} onChange={e => set('market_price_mid', e.target.value)} style={INP}/></div>
              <div><label style={LBL}>HIGHEST (AED)</label><input type="number" min="0" value={f.market_price_high} onChange={e => set('market_price_high', e.target.value)} style={INP}/></div>
              <div style={{ background:'var(--green-bg)', borderRadius:8, padding:'6px 10px' }}>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--green)' }}>MARKET VALUE (avg low + medium)</div>
                <div style={{ fontSize:18, fontWeight:800, color:'var(--green)' }}>{AED(value)}</div>
              </div>
            </div>
            {priceInfo && (
              <div style={{ fontSize:12, color:'var(--text2)', marginTop:10 }}>
                <div>{[priceInfo.basis, priceInfo.notes, priceInfo.searched === false ? 'no live search — AI estimate' : null].filter(Boolean).join(' · ')}</div>
                {(priceInfo.listings || []).map((l, i) => (
                  <div key={i}>• {l.seller || 'Listing'}: {AED(l.price_aed)} {l.url && <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color:'var(--blue)' }}>link</a>}</div>
                ))}
              </div>
            )}
          </>,
          <button onClick={getPrice} disabled={!!busy} style={{ ...BTN, borderColor:'var(--blue)', color:'var(--blue)' }}>{busy === 'price' ? 'Searching prices…' : '💰 Check market price'}</button>
        )}

        {msg && <div style={{ padding:'10px 12px', borderRadius:10, marginBottom:10, fontSize:13, background: msg.type === 'ok' ? 'var(--green-bg)' : 'var(--red-bg)', color: msg.type === 'ok' ? 'var(--green)' : 'var(--red)' }}>{msg.text}</div>}
        <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
          <button onClick={onClose} disabled={!!busy} style={BTN}>Cancel</button>
          <button onClick={save} disabled={!!busy} style={{ ...PRIMARY, opacity: busy ? 0.6 : 1 }}>{busy === 'save' ? 'Saving…' : f.id ? 'Save changes' : 'Save & create barcode'}</button>
        </div>
      </div>
    </div>
  )
}

// ── Asset detail drawer ──────────────────────────────────────────────────────
function AssetDetail({ asset, stats, canEdit, canPrice, onClose, onEdit, onPrint }) {
  const navigate = useNavigate()
  const [photoUrl, setPhotoUrl] = useState(null)
  const [jobs, setJobs] = useState([])
  useEffect(() => {
    signedPhoto(asset.photo_path).then(setPhotoUrl)
    supabase.from('work_orders').select('id,title,priority,status,created_at,cost,parts_cost,wo_type,vendor_name')
      .eq('asset_id', asset.id).order('created_at', { ascending:false }).limit(30).then(({ data }) => setJobs(data || []))
  }, [asset.id, asset.photo_path])
  const s = stats || { breakdowns:0, open_jobs:0, repair_cost:0, ppm_jobs:0 }
  const ratio = asset.market_value ? Math.round((Number(s.repair_cost) / Number(asset.market_value)) * 100) : null
  const age = asset.purchase_date ? ((Date.now() - new Date(asset.purchase_date)) / (365.25 * 86400000)) : null
  const specs = asset.specs || {}
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:900, display:'flex', justifyContent:'flex-end' }}>
      <div style={{ width:'min(560px, 100vw)', height:'100%', overflowY:'auto', background:'var(--bg)', borderLeft:'1px solid var(--border)', padding:18, color:'var(--text)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'flex-start' }}>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--green)', fontFamily:'monospace' }}>{asset.asset_code}</div>
            <h3 style={{ margin:'2px 0' }}>{asset.name}</h3>
            <div style={{ fontSize:13, color:'var(--text2)' }}>{asset.stores?.name}{asset.location ? ` · ${asset.location}` : ''}</div>
          </div>
          <button onClick={onClose} style={BTN}>✕</button>
        </div>
        {photoUrl && <img src={photoUrl} alt={asset.name} style={{ width:'100%', maxHeight:260, objectFit:'cover', borderRadius:12, marginTop:12 }}/>}

        <div style={{ display:'flex', gap:8, flexWrap:'wrap', margin:'12px 0' }}>
          <button onClick={() => onPrint([asset])} style={PRIMARY}>🏷 Print barcode label</button>
          {canEdit && <button onClick={() => onEdit(asset)} style={BTN}>✏️ Edit / add photo</button>}
          <button onClick={() => navigate(`/work-orders?new=1&asset_id=${asset.id}&store_id=${asset.store_id}`)} style={{ ...BTN, color:'var(--red)', borderColor:'var(--red)' }}>⚠️ Report fault</button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:8 }}>
          {[['Breakdowns', s.breakdowns, s.breakdowns >= 5 ? 'var(--red)' : 'var(--text)'],
            ['Total repair cost', AED(s.repair_cost), 'var(--text)'],
            ['Open jobs', s.open_jobs, s.open_jobs ? 'var(--amber)' : 'var(--text)'],
            ['Market value', canPrice || true ? AED(asset.market_value) : '—', 'var(--green)']].map(([l, v, c]) => (
            <div key={l} style={{ ...CARD, padding:'10px 12px' }}>
              <div style={{ fontSize:11, color:'var(--text3)' }}>{l}</div>
              <div style={{ fontSize:18, fontWeight:700, color:c }}>{v}</div>
            </div>
          ))}
        </div>
        {ratio != null && (
          <div style={{ marginTop:8, padding:'8px 12px', borderRadius:10, fontSize:13, background: ratio >= 50 ? 'var(--red-bg)' : 'var(--bg3)', color: ratio >= 50 ? 'var(--red)' : 'var(--text2)' }}>
            Repairs so far = <b>{ratio}%</b> of the machine's market value{ratio >= 50 ? ' — consider replacing instead of repairing.' : '.'}
          </div>
        )}

        <div style={{ ...CARD, padding:14, marginTop:12 }}>
          <div style={{ fontWeight:700, marginBottom:8 }}>Details</div>
          {[['Category', [asset.category, asset.subcategory].filter(Boolean).join(' / ')], ['Brand', asset.brand], ['Model', asset.model],
            ['Serial no.', asset.serial_number], ['Purchase date', asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString('en-GB') + (age != null ? ` (${age.toFixed(1)} years)` : '') : null],
            ['Status', asset.status]].map(([l, v]) => (
            <div key={l} style={{ display:'flex', justifyContent:'space-between', gap:10, fontSize:13, padding:'4px 0', borderTop:'1px solid var(--border)' }}>
              <span style={{ color:'var(--text3)' }}>{l}</span><span style={{ textAlign:'right' }}>{v || '—'}</span>
            </div>
          ))}
        </div>

        <div style={{ ...CARD, padding:14, marginTop:12 }}>
          <div style={{ fontWeight:700, marginBottom:8 }}>Technical details {asset.specs_source === 'ai' && <span style={{ fontSize:11, fontWeight:400, color:'var(--text3)' }}>· AI looked up{specs.spec_match ? ` (${specs.spec_match})` : ''}</span>}</div>
          {SPEC_FIELDS.filter(([k]) => specs[k]).length === 0 && !specs.other ? <div style={{ fontSize:13, color:'var(--text3)' }}>Not added yet{canEdit ? ' — Edit → “Get from brand & model”.' : '.'}</div> : (
            <>
              {SPEC_FIELDS.filter(([k]) => specs[k]).map(([k, l]) => (
                <div key={k} style={{ display:'flex', justifyContent:'space-between', gap:10, fontSize:13, padding:'4px 0', borderTop:'1px solid var(--border)' }}>
                  <span style={{ color:'var(--text3)' }}>{l}</span><span>{String(specs[k])}</span>
                </div>
              ))}
              {specs.other && <div style={{ fontSize:12, color:'var(--text2)', whiteSpace:'pre-wrap', marginTop:6 }}>{specs.other}</div>}
            </>
          )}
        </div>

        {(asset.market_price_low || asset.market_price_mid) && (
          <div style={{ ...CARD, padding:14, marginTop:12, fontSize:13 }}>
            <div style={{ fontWeight:700, marginBottom:6 }}>Market price (new, UAE)</div>
            Lowest {AED(asset.market_price_low)} · Medium {AED(asset.market_price_mid)} · Highest {AED(asset.market_price_high)}
            {asset.market_checked_at && <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>Checked {new Date(asset.market_checked_at).toLocaleDateString('en-GB')}</div>}
          </div>
        )}

        <div style={{ ...CARD, padding:14, marginTop:12 }}>
          <div style={{ fontWeight:700, marginBottom:6 }}>Service history ({jobs.length})</div>
          {jobs.length === 0 && <div style={{ fontSize:13, color:'var(--text3)' }}>No work orders on this asset yet.</div>}
          {jobs.map(j => (
            <div key={j.id} onClick={() => navigate(`/work-orders/${j.id}`)} style={{ display:'flex', justifyContent:'space-between', gap:10, fontSize:13, padding:'7px 0', borderTop:'1px solid var(--border)', cursor:'pointer' }}>
              <span>{j.wo_type === 'ppm' ? '🗓 ' : '⚠️ '}<b>{j.priority}</b> {j.title}</span>
              <span style={{ color:'var(--text3)', whiteSpace:'nowrap' }}>{new Date(j.created_at).toLocaleDateString('en-GB')} · {AED(Number(j.cost || 0) + Number(j.parts_cost || 0))}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function AssetRegister() {
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const canPrice = profile?.role === 'admin' || profile?.role === 'operations'
  const canEdit  = canPrice || profile?.role === 'technician'
  const [assets, setAssets] = useState([])
  const [stats, setStats]   = useState({})
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [store, setStore]   = useState(params.get('store') || 'all')
  const [cat, setCat]       = useState('all')
  const [sort, setSort]     = useState('code')
  const [scan, setScan]     = useState('')
  const [scanMsg, setScanMsg] = useState('')
  const [selected, setSelected] = useState(new Set())
  const [form, setForm]     = useState(null)
  const [detail, setDetail] = useState(null)
  const [labels, setLabels] = useState(null)
  const [limit, setLimit]   = useState(100)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [a, s, st] = await Promise.all([
      fetchAllRows(() => supabase.from('assets').select('*, stores(name)').order('asset_code')),
      fetchAllRows(() => supabase.from('asset_stats').select('*').order('asset_id')),
      supabase.from('stores').select('id,name').order('name'),
    ])
    const sm = {}; (s.data || []).forEach(r => { sm[r.asset_id] = r })
    setAssets(a.data || []); setStats(sm); setStores(st.data || []); setLoading(false)
    const open = params.get('asset')
    if (open) { const x = (a.data || []).find(r => r.id === open || r.asset_code === open); if (x) setDetail(x) }
  }

  // Handheld barcode scanners type the code and press Enter
  function doScan(e) {
    e.preventDefault()
    const code = scan.trim().toUpperCase()
    if (!code) return
    const a = assets.find(x => (x.asset_code || '').toUpperCase() === code || (x.serial_number || '').toUpperCase() === code)
    if (a) { setDetail(a); setScan(''); setScanMsg('') } else setScanMsg(`No asset with code ${code}`)
  }

  const cats = useMemo(() => [...new Set(assets.map(a => a.category).filter(Boolean))].sort(), [assets])
  const rows = useMemo(() => {
    const q = search.toLowerCase()
    const list = assets.filter(a =>
      (store === 'all' || a.store_id === store) && (cat === 'all' || a.category === cat) &&
      (!q || `${a.asset_code} ${a.name} ${a.brand || ''} ${a.model || ''} ${a.serial_number || ''} ${a.stores?.name || ''}`.toLowerCase().includes(q)))
    const st = id => stats[id] || {}
    if (sort === 'breakdowns') list.sort((a, b) => (st(b.id).breakdowns || 0) - (st(a.id).breakdowns || 0))
    else if (sort === 'cost') list.sort((a, b) => Number(st(b.id).repair_cost || 0) - Number(st(a.id).repair_cost || 0))
    else if (sort === 'value') list.sort((a, b) => Number(b.market_value || 0) - Number(a.market_value || 0))
    else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name))
    return list
  }, [assets, stats, search, store, cat, sort])

  const totals = useMemo(() => rows.reduce((t, a) => {
    const s = stats[a.id] || {}
    t.value += Number(a.market_value || 0); t.cost += Number(s.repair_cost || 0); t.bd += Number(s.breakdowns || 0)
    if (!a.photo_path) t.noPhoto++
    return t
  }, { value:0, cost:0, bd:0, noPhoto:0 }), [rows, stats])

  function toggle(id) { setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  return (
    <div style={{ color:'var(--text)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, flexWrap:'wrap', marginBottom:16 }}>
        <div>
          <h2 style={{ margin:0, fontSize:22, fontWeight:700 }}>Asset Register</h2>
          <p style={{ margin:'4px 0 0', fontSize:13, color:'var(--text3)' }}>Every machine with its barcode, photo, technical details, breakdowns, repair cost and market value.</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {selected.size > 0 && <button onClick={() => setLabels(assets.filter(a => selected.has(a.id)))} style={BTN}>🏷 Print {selected.size} label{selected.size > 1 ? 's' : ''}</button>}
          {canPrice && <button onClick={() => setForm({ ...EMPTY, store_id: store !== 'all' ? store : '' })} style={PRIMARY}>+ Add asset</button>}
        </div>
      </div>

      <form onSubmit={doScan} style={{ ...CARD, padding:12, display:'flex', gap:8, alignItems:'center', marginBottom:12, flexWrap:'wrap' }}>
        <span style={{ fontSize:20 }}>▥</span>
        <input value={scan} onChange={e => setScan(e.target.value)} placeholder="Scan barcode or type asset code (FX-00012)…" style={{ ...INP, flex:1, minWidth:200 }}/>
        <button type="submit" style={BTN}>Find</button>
        {scanMsg && <span style={{ fontSize:12, color:'var(--red)' }}>{scanMsg}</span>}
      </form>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px, 1fr))', gap:10, marginBottom:12 }}>
        {[['Assets', rows.length.toLocaleString(), 'var(--text)'], ['Market value', AED(totals.value), 'var(--green)'],
          ['Repair cost to date', AED(totals.cost), 'var(--amber)'], ['Breakdowns', totals.bd, 'var(--red)'], ['Without photo', totals.noPhoto, 'var(--text3)']].map(([l, v, c]) => (
          <div key={l} style={{ ...CARD, padding:'12px 14px' }}>
            <div style={{ fontSize:11, color:'var(--text3)' }}>{l}</div>
            <div style={{ fontSize:20, fontWeight:700, color:c }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
        <input value={search} onChange={e => { setSearch(e.target.value); setLimit(100) }} placeholder="Search name, brand, model, serial…" style={{ ...INP, maxWidth:260 }}/>
        <select value={store} onChange={e => { setStore(e.target.value); setLimit(100); if (e.target.value === 'all') params.delete('store'); else params.set('store', e.target.value); setParams(params) }} style={{ ...INP, width:'auto' }}>
          <option value="all">All stores</option>{stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={cat} onChange={e => { setCat(e.target.value); setLimit(100) }} style={{ ...INP, width:'auto' }}>
          <option value="all">All categories</option>{cats.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)} style={{ ...INP, width:'auto' }}>
          <option value="code">Sort: code</option><option value="name">Sort: name</option>
          <option value="breakdowns">Sort: most breakdowns</option><option value="cost">Sort: highest repair cost</option><option value="value">Sort: highest value</option>
        </select>
        {rows.length > 0 && <button onClick={() => setSelected(new Set(rows.slice(0, 300).map(r => r.id)))} style={BTN}>Select shown{rows.length > 300 ? ' (first 300)' : ''}</button>}
        {selected.size > 0 && <button onClick={() => setSelected(new Set())} style={BTN}>Clear selection</button>}
      </div>

      {loading ? <div style={{ padding:40, textAlign:'center', color:'var(--text3)' }}>Loading assets…</div> : (
        <div style={{ ...CARD, overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead><tr style={{ borderBottom:'1px solid var(--border)', color:'var(--text3)', fontSize:11, textAlign:'left' }}>
              {['', 'Code', 'Asset', 'Store', 'Brand / model', 'Breakdowns', 'Repair cost', 'Market value', ''].map((h, i) => <th key={i} style={{ padding:'10px 10px', fontWeight:600, whiteSpace:'nowrap' }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {rows.slice(0, limit).map(a => {
                const s = stats[a.id] || {}
                return (
                  <tr key={a.id} onClick={() => setDetail(a)} style={{ borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
                    <td style={{ padding:'8px 10px' }} onClick={e => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} style={{ accentColor:'var(--green)' }}/>
                    </td>
                    <td style={{ padding:'8px 10px', fontFamily:'monospace', fontWeight:700, color:'var(--green)', whiteSpace:'nowrap' }}>{a.asset_code}</td>
                    <td style={{ padding:'8px 10px' }}>
                      <div style={{ fontWeight:600 }}>{a.photo_path ? '📷 ' : ''}{a.name}</div>
                      <div style={{ fontSize:11, color:'var(--text3)' }}>{[a.category, a.subcategory].filter(Boolean).join(' / ')}</div>
                    </td>
                    <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>{a.stores?.name || '—'}</td>
                    <td style={{ padding:'8px 10px' }}>{[a.brand, a.model].filter(Boolean).join(' ') || <span style={{ color:'var(--text3)' }}>—</span>}</td>
                    <td style={{ padding:'8px 10px', fontWeight:700, color: (s.breakdowns || 0) >= 5 ? 'var(--red)' : 'var(--text)' }}>{s.breakdowns || 0}</td>
                    <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>{AED(s.repair_cost || 0)}</td>
                    <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }}>{AED(a.market_value)}</td>
                    <td style={{ padding:'8px 10px', whiteSpace:'nowrap' }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => setLabels([a])} title="Print barcode label" style={{ ...BTN, padding:'4px 8px', fontSize:12 }}>🏷</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rows.length > limit && (
            <div style={{ padding:12, textAlign:'center' }}>
              <button onClick={() => setLimit(l => l + 200)} style={BTN}>Show more ({rows.length - limit} left)</button>
            </div>
          )}
          {rows.length === 0 && <div style={{ padding:30, textAlign:'center', color:'var(--text3)' }}>No assets match.</div>}
        </div>
      )}

      {form && (
        <AssetForm initial={form} stores={stores} canPrice={canPrice}
          onClose={() => setForm(null)}
          onSaved={saved => {
            setForm(null); load()
            if (saved) { setDetail(saved); setLabels([saved]) }
          }}/>
      )}
      {detail && !form && (
        <AssetDetail asset={detail} stats={stats[detail.id]} canEdit={canEdit} canPrice={canPrice}
          onClose={() => { setDetail(null); params.delete('asset'); setParams(params) }}
          onEdit={a => setForm({ ...EMPTY, ...a, purchase_date: a.purchase_date || '', specs: a.specs || {},
            market_price_low: a.market_price_low ?? '', market_price_mid: a.market_price_mid ?? '', market_price_high: a.market_price_high ?? '' })}
          onPrint={setLabels}/>
      )}
      {labels && <QRLabels assets={labels} onClose={() => setLabels(null)}/>}
    </div>
  )
}
