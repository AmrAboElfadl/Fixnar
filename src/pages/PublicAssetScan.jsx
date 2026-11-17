import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { BRAND } from '../lib/brand'

const hasErr = (e) => e && Object.keys(e).length
const STATUS_LABEL = { open:'Open', travelling:'On the way', arrived:'Arrived', in_progress:'In progress', on_hold:'On hold', completed:'Completed', closed:'Closed' }
const SPEC_LABEL = { capacity:'Capacity', power_kw:'Power (kW)', current_a:'Current (A)', voltage_v:'Voltage (V)', phase:'Phase',
  frequency_hz:'Frequency (Hz)', refrigerant:'Refrigerant', fuel:'Fuel', dimensions_mm:'Dimensions (mm)', weight_kg:'Weight (kg)', other:'Other' }
const SPEC_HIDE = new Set(['notes', 'spec_match'])
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB') : '—'
const REFRESH_MS = 60000

// Page shown to anyone who scans an asset QR without being signed in (or without access to the asset register).
// Data comes live from public_asset_scan() (fx17): a safe subset, no costs or contacts.
export default function PublicAssetScan({ id, signedIn }) {
  const navigate = useNavigate()
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  const [asset, setAsset] = useState(null)
  const [loading, setLoading] = useState(isUuid)
  const [error, setError] = useState(isUuid ? '' : 'Sign in to look up an asset by its code.')

  useEffect(() => {
    if (!isUuid) return
    let alive = true
    const load = async () => {
      const { data, error: e } = await supabase.rpc('public_asset_scan', { p_id: id })
      if (!alive) return
      if (hasErr(e)) setError('Could not load this asset. Check your connection and try again.')
      else if (!data) setError('This QR code does not match any asset.')
      else { setAsset(data); setError('') }
      setLoading(false)
    }
    load()
    // keep the page current while it is open
    const t = setInterval(load, REFRESH_MS)
    const onShow = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onShow)
    return () => { alive = false; clearInterval(t); document.removeEventListener('visibilitychange', onShow) }
  }, [id, isUuid])

  const signIn = () => navigate('/login', { state: { from: `/a/${id}` } })
  const card = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }
  const wrap = (body) => (
    <div style={{ minHeight:'100vh', background:'var(--bg)', color:'var(--text)', padding:'20px 14px', fontFamily:"'DM Sans', sans-serif" }}>
      <div style={{ maxWidth:640, margin:'0 auto' }}>
        <div style={{ fontWeight:700, color:'var(--green)', marginBottom:14 }}>{BRAND.name}</div>
        {body}
      </div>
    </div>
  )

  if (loading) return wrap(<div style={{ padding:40, textAlign:'center', color:'var(--text3)' }}>Loading asset…</div>)
  if (error) return wrap(
    <div style={{ ...card, textAlign:'center' }}>
      <div style={{ color:'var(--red)', marginBottom:14 }}>{error}</div>
      {!signedIn && <button onClick={signIn} style={btn('var(--green)')}>Sign in</button>}
    </div>
  )

  const specs = Object.entries(asset.specs || {}).filter(([k, v]) => !SPEC_HIDE.has(k) && v !== null && v !== '')
  const history = asset.history || []

  return wrap(<>
    <div style={{ ...card, marginBottom:12 }}>
      <div style={{ fontSize:11, fontWeight:700, color:'var(--green)', letterSpacing:'.05em' }}>📱 SCANNED ASSET · {asset.asset_code}</div>
      <h2 style={{ margin:'4px 0 2px', fontSize:20 }}>{asset.name}</h2>
      <div style={{ fontSize:13, color:'var(--text2)' }}>{asset.store_name}{asset.location ? ` · ${asset.location.trim()}` : ''}</div>
      <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginTop:10, fontSize:12, color:'var(--text3)' }}>
        {asset.category && <span>{asset.category}{asset.subcategory ? ` / ${asset.subcategory}` : ''}</span>}
        {asset.brand && <span>Brand: {asset.brand}</span>}
        {asset.model && <span>Model: {asset.model}</span>}
        {asset.serial_number && <span>S/N: {asset.serial_number}</span>}
        {asset.purchase_date && <span>Bought: {fmtDate(asset.purchase_date)}</span>}
        <span style={{ textTransform:'capitalize' }}>Status: {asset.status}</span>
      </div>
    </div>

    <button onClick={signedIn ? () => navigate('/') : signIn}
      style={{ ...btn('var(--red)'), width:'100%', padding:14, fontSize:16, marginBottom:12 }}>
      ⚠️ {signedIn ? 'Back to ' + BRAND.name : 'Sign in to report a fault'}
    </button>

    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:10, marginBottom:12 }}>
      {[['Open jobs', asset.open_jobs], ['Breakdowns', asset.breakdowns], ['Last service', fmtDate(asset.last_service)], ['Next PPM', fmtDate(asset.next_ppm)]].map(([l, v]) => (
        <div key={l} style={{ ...card, padding:12 }}>
          <div style={{ fontSize:11, color:'var(--text3)' }}>{l}</div>
          <div style={{ fontSize:17, fontWeight:700, marginTop:2 }}>{v}</div>
        </div>
      ))}
    </div>

    {specs.length > 0 && (
      <div style={{ ...card, marginBottom:12 }}>
        <div style={{ fontWeight:700, marginBottom:8 }}>Technical specs</div>
        {specs.map(([k, v]) => (
          <div key={k} style={{ display:'flex', justifyContent:'space-between', gap:10, padding:'6px 0', borderTop:'1px solid var(--border)', fontSize:13 }}>
            <span style={{ color:'var(--text3)' }}>{SPEC_LABEL[k] || k.replace(/_/g, ' ')}</span>
            <span style={{ textAlign:'right', whiteSpace:'pre-line' }}>{String(v)}</span>
          </div>
        ))}
      </div>
    )}

    <div style={card}>
      <div style={{ fontWeight:700, marginBottom:10 }}>Service history</div>
      {history.length === 0 ? <div style={{ color:'var(--text3)', fontSize:13 }}>No work orders for this asset yet.</div> : history.map((w, i) => (
        <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:10, padding:'9px 0', borderTop:'1px solid var(--border)', fontSize:13 }}>
          <span><b>{w.wo_type === 'ppm' ? 'PPM' : w.priority}</b> · {w.title}</span>
          <span style={{ color:'var(--text3)', whiteSpace:'nowrap' }}>{STATUS_LABEL[w.status] || w.status} · {fmtDate(w.done_at || w.created_at)}</span>
        </div>
      ))}
    </div>

    <div style={{ fontSize:11, color:'var(--text3)', textAlign:'center', marginTop:12 }}>
      Live data · asset record last changed {asset.updated_at ? new Date(asset.updated_at).toLocaleString('en-GB') : '—'}
    </div>
  </>)
}

function btn(bg) {
  return { background:bg, color:'white', border:'none', borderRadius:12, padding:'10px 22px', fontSize:14, fontWeight:700, cursor:'pointer' }
}
