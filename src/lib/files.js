import { supabase } from './supabase'

// Shrink phone photos before saving (a 4 MB camera photo becomes ~150 KB).
export function compressImage(file, maxSize = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      // videos / other files: keep as-is (small clips only)
      const r = new FileReader()
      r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file)
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', quality))
    }
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e) }
    img.src = url
  })
}

// Upload a document (quote / invoice PDF or image) to private storage.
export async function uploadWoFile(workOrderId, file) {
  if (file.size > 10 * 1024 * 1024) throw new Error('File is larger than 10 MB')
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  const path = `wo/${workOrderId}/${Date.now()}-${safe}`
  const { error } = await supabase.storage.from('attachments').upload(path, file, { upsert:false, contentType: file.type || undefined })
  if (error && Object.keys(error).length) throw new Error(error.message || 'Upload failed')
  return { path, name: file.name }
}

export async function openWoFile(path) {
  const { data, error } = await supabase.storage.from('attachments').createSignedUrl(path, 300)
  if (error && Object.keys(error).length) throw new Error(error.message || 'Could not open file')
  window.open(data.signedUrl, '_blank', 'noopener')
}

// data:image/...;base64,... → Blob, without fetch() (blocked by the Content-Security-Policy connect-src)
export function dataUrlToBlob(dataUrl) {
  const [head, b64] = String(dataUrl).split(',')
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream'
  const bin = head.includes(';base64') ? atob(b64) : decodeURIComponent(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}
