import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'

// Printable asset labels: Code 128 barcode (asset code, works with any handheld scanner)
// + QR code (phone camera opens the asset page in Fixnar).
export function assetUrl(id) {
  return `${window.location.origin}/a/${id}`
}

function barcodeDataUrl(text) {
  try {
    const c = document.createElement('canvas')
    JsBarcode(c, text, { format:'CODE128', width:2, height:46, displayValue:true, fontSize:14, margin:4, font:'monospace' })
    return c.toDataURL('image/png')
  } catch { return '' }
}

function Label({ asset, storeName }) {
  const [qr, setQr] = useState('')
  const code = asset.asset_code || asset.id.slice(0, 8).toUpperCase()
  const bar = barcodeDataUrl(code)
  useEffect(() => {
    QRCode.toDataURL(assetUrl(asset.id), { margin:1, width:200, errorCorrectionLevel:'M' })
      .then(setQr).catch(() => setQr(''))
  }, [asset.id])
  return (
    <div className="qr-label" style={{ border:'1px dashed #bbb', borderRadius:8, padding:'8px 10px', background:'#fff', color:'#111', breakInside:'avoid', display:'flex', gap:8, alignItems:'center' }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:9, fontWeight:700, color:'#1D9E75', letterSpacing:'.05em' }}>FIXNAR ASSET · SCAN TO REPORT A FAULT</div>
        <div style={{ fontSize:12, fontWeight:700, marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{asset.name}</div>
        <div style={{ fontSize:10, color:'#555', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
          {storeName || asset.stores?.name || ''}{asset.brand ? ` · ${asset.brand}` : ''}{asset.model ? ` ${asset.model}` : ''}
        </div>
        {bar && <img src={bar} alt={code} style={{ width:'100%', maxWidth:220, height:62, objectFit:'contain', marginTop:2 }}/>}
      </div>
      {qr ? <img src={qr} alt="QR" style={{ width:78, height:78, flexShrink:0 }}/> : <div style={{ width:78, height:78 }}/>}
    </div>
  )
}

export default function QRLabels({ assets, storeName, onClose }) {
  return createPortal(
    <div className="qr-print-root" onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div className="qr-sheet" style={{ background:'var(--surface)', borderRadius:14, width:'100%', maxWidth:860, maxHeight:'92vh', display:'flex', flexDirection:'column', border:'1px solid var(--border)' }}>
        <div className="qr-noprint" style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px', borderBottom:'1px solid var(--border)', color:'var(--text)', gap:10, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontWeight:700 }}>Asset labels — {assets.length} asset{assets.length === 1 ? '' : 's'}</div>
            <div style={{ fontSize:12, color:'var(--text3)' }}>Print on sticker paper (3 per row on A4) and stick on each machine. Barcode = handheld scanner, QR = phone camera.</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => window.print()} style={{ background:'var(--green)', color:'white', border:'none', borderRadius:8, padding:'8px 16px', fontWeight:600, cursor:'pointer' }}>🖨 Print</button>
            <button onClick={onClose} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 14px', cursor:'pointer', color:'var(--text)' }}>Close</button>
          </div>
        </div>
        <div className="qr-grid" style={{ overflowY:'auto', padding:16, display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(250px, 1fr))', gap:10 }}>
          {assets.map(a => <Label key={a.id} asset={a} storeName={storeName}/>)}
        </div>
      </div>
    </div>,
    document.body
  )
}
