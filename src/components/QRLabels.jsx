import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'

// Printable QR labels. Scanning a label opens /a/<assetId> in Fixnar,
// which shows the asset's history and a "Report a fault" button.
export function assetUrl(id) {
  return `${window.location.origin}/a/${id}`
}

function Label({ asset, storeName }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    QRCode.toDataURL(assetUrl(asset.id), { margin:1, width:240, errorCorrectionLevel:'M' })
      .then(setSrc).catch(() => setSrc(''))
  }, [asset.id])
  return (
    <div className="qr-label" style={{ border:'1px dashed #bbb', borderRadius:8, padding:10, display:'flex', gap:10, alignItems:'center', background:'#fff', color:'#111', breakInside:'avoid' }}>
      {src ? <img src={src} alt="QR" style={{ width:96, height:96 }}/> : <div style={{ width:96, height:96 }}/>}
      <div style={{ minWidth:0 }}>
        <div style={{ fontSize:10, fontWeight:700, color:'#1D9E75', letterSpacing:'.05em' }}>FIXNAR · SCAN TO REPORT</div>
        <div style={{ fontSize:13, fontWeight:700, marginTop:3, overflow:'hidden', textOverflow:'ellipsis' }}>{asset.name}</div>
        {storeName && <div style={{ fontSize:11, color:'#555', marginTop:2 }}>{storeName}</div>}
        {asset.serial_number && <div style={{ fontSize:10, color:'#777', marginTop:2 }}>S/N {asset.serial_number}</div>}
        <div style={{ fontSize:9, color:'#999', marginTop:2 }}>ID {asset.id.slice(0, 8).toUpperCase()}</div>
      </div>
    </div>
  )
}

export default function QRLabels({ assets, storeName, onClose }) {
  return createPortal(
    <div className="qr-print-root" onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div className="qr-sheet" style={{ background:'var(--surface)', borderRadius:14, width:'100%', maxWidth:820, maxHeight:'92vh', display:'flex', flexDirection:'column', border:'1px solid var(--border)' }}>
        <div className="qr-noprint" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px', borderBottom:'1px solid var(--border)', color:'var(--text)' }}>
          <div>
            <div style={{ fontWeight:700 }}>QR labels — {assets.length} asset{assets.length === 1 ? '' : 's'}</div>
            <div style={{ fontSize:12, color:'var(--text3)' }}>Print on sticker paper and stick on each machine. Staff scan with the phone camera.</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => window.print()} style={{ background:'var(--green)', color:'white', border:'none', borderRadius:8, padding:'8px 16px', fontWeight:600, cursor:'pointer' }}>🖨 Print</button>
            <button onClick={onClose} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 14px', cursor:'pointer', color:'var(--text)' }}>Close</button>
          </div>
        </div>
        <div className="qr-grid" style={{ overflowY:'auto', padding:16, display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:10 }}>
          {assets.map(a => <Label key={a.id} asset={a} storeName={storeName}/>)}
        </div>
      </div>
    </div>,
    document.body
  )
}
