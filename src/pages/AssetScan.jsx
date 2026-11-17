import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const hasErr = (e) => e && Object.keys(e).length
const STATUS_LABEL = { open:'Open', travelling:'On the way', arrived:'Arrived', in_progress:'In progress', on_hold:'On hold', completed:'Completed', closed:'Closed' }

// Landing page for a scanned asset QR label
export default function AssetScan() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [asset, setAsset]   = useState(null)
  const [wos, setWos]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')
  const [photoUrl, setPhotoUrl] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      // /a/<uuid> from the QR code, or /a/FX-00012 from the barcode
      const byCode = /^FX-\d+$/i.test(id)
      const a = await supabase.from('assets').select('*, stores(id,name,phone,manager_name)')
        .eq(byCode ? 'asset_code' : 'id', byCode ? id.toUpperCase() : id).maybeSingle()
      const w = a.data
        ? await supabase.from('work_orders').select('id,title,priority,status,created_at,closed_at,cost,parts_cost,vendor_name')
            .eq('asset_id', a.data.id).order('created_at', { ascending:false }).limit(20)
        : { data: [] }
      if (!alive) return
      if (hasErr(a.error) || !a.data) setError('This QR code does not match any asset you can access.')
      setAsset(a.data || null); setWos(w.data || []); setLoading(false)
    })()
    return () => { alive = false }
  }, [id])

  const photoPath = asset?.photo_path || null
  useEffect(() => {
    if (!photoPath) { setPhotoUrl(null); return }
    let alive = true
    supabase.storage.from('attachments').createSignedUrl(photoPath, 600)
      .then(({ data }) => { if (alive) setPhotoUrl(data?.signedUrl || null) })
    return () => { alive = false }
  }, [photoPath])

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'var(--text3)' }}>Loading asset…</div>
  if (error) return <div style={{ padding:40, textAlign:'center', color:'var(--red)' }}>{error}</div>

  const openWOs  = wos.filter(w => !['completed','closed'].includes(w.status))
  const totalCost = wos.reduce((s, w) => s + Number(w.cost || 0) + Number(w.parts_cost || 0), 0)
  const canReport = profile?.role && profile.role !== 'vendor'
  const card = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }

  return (
    <div style={{ maxWidth:640, margin:'0 auto', color:'var(--text)' }}>
      <div style={{ ...card, marginBottom:12 }}>
        <div style={{ fontSize:11, fontWeight:700, color:'var(--green)', letterSpacing:'.05em' }}>📱 SCANNED ASSET</div>
        {photoUrl && <img src={photoUrl} alt={asset.name} style={{ width:'100%', maxHeight:280, objectFit:'cover', borderRadius:10, margin:'10px 0 6px', display:'block' }}/>}
        <h2 style={{ margin:'4px 0 2px', fontSize:20 }}>{asset.name}</h2>
        <div style={{ fontSize:13, color:'var(--text2)' }}>{asset.stores?.name}{asset.location ? ` · ${asset.location}` : ''}</div>
        <div style={{ display:'flex', gap:14, flexWrap:'wrap', marginTop:10, fontSize:12, color:'var(--text3)' }}>
          {asset.category && <span>{asset.category}{asset.subcategory ? ` / ${asset.subcategory}` : ''}</span>}
          {asset.brand && <span>Brand: {asset.brand}</span>}
          {asset.model && <span>Model: {asset.model}</span>}
          {asset.serial_number && <span>S/N: {asset.serial_number}</span>}
          <span style={{ textTransform:'capitalize' }}>Status: {asset.status || 'operational'}</span>
        </div>
      </div>

      {canReport && (
        <button onClick={() => navigate(`/work-orders?new=1&asset_id=${asset.id}&store_id=${asset.store_id}`)}
          style={{ width:'100%', padding:'14px', background:'var(--red)', color:'white', border:'none', borderRadius:12, fontSize:16, fontWeight:700, cursor:'pointer', marginBottom:12 }}>
          ⚠️ Report a fault on this machine
        </button>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:12 }}>
        {[['Open jobs', openWOs.length], ['Repairs', wos.length], ['Repair cost', `AED ${totalCost.toLocaleString()}`]].map(([l, v]) => (
          <div key={l} style={{ ...card, padding:12 }}>
            <div style={{ fontSize:11, color:'var(--text3)' }}>{l}</div>
            <div style={{ fontSize:18, fontWeight:700, marginTop:2 }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={card}>
        <div style={{ fontWeight:700, marginBottom:10 }}>Service history</div>
        {wos.length === 0 ? <div style={{ color:'var(--text3)', fontSize:13 }}>No work orders for this asset yet.</div> : wos.map(w => (
          <Link key={w.id} to={`/work-orders/${w.id}`} style={{ display:'flex', justifyContent:'space-between', gap:10, padding:'9px 0', borderTop:'1px solid var(--border)', textDecoration:'none', color:'var(--text)', fontSize:13 }}>
            <span><b>{w.priority}</b> · {w.title}</span>
            <span style={{ color:'var(--text3)', whiteSpace:'nowrap' }}>{STATUS_LABEL[w.status] || w.status} · {new Date(w.created_at).toLocaleDateString('en-GB')}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
