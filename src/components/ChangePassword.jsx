import { useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'

// Lets any signed-in user replace a temporary password with their own.
export default function ChangePassword({ onClose }) {
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null)
  const INP = { background: 'var(--input-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 14, width: '100%', boxSizing: 'border-box' }
  async function save(e) {
    e.preventDefault()
    if (pw.length < 8) return setMsg({ text: 'Use at least 8 characters.' })
    if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return setMsg({ text: 'Use letters and at least one number.' })
    if (pw !== pw2) return setMsg({ text: 'The two passwords do not match.' })
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error && Object.keys(error).length) return setMsg({ text: error.message || 'Could not change the password.' })
    setMsg({ type: 'ok', text: '✅ Password changed. Use the new one next time you sign in.' }); setPw(''); setPw2('')
  }
  return createPortal(
    <div onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <form onSubmit={save} style={{ background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, width: '100%', maxWidth: 380 }}>
        <h3 style={{ margin: '0 0 12px' }}>Change password</h3>
        <label style={{ fontSize: 12, color: 'var(--text3)' }}>New password</label>
        <input type={show ? 'text' : 'password'} value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" style={{ ...INP, margin: '4px 0 10px' }}/>
        <label style={{ fontSize: 12, color: 'var(--text3)' }}>Repeat new password</label>
        <input type={show ? 'text' : 'password'} value={pw2} onChange={e => setPw2(e.target.value)} autoComplete="new-password" style={{ ...INP, margin: '4px 0 8px' }}/>
        <label style={{ fontSize: 12, display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)}/> Show</label>
        {msg && <div style={{ padding: '8px 10px', borderRadius: 8, fontSize: 13, marginBottom: 10, background: msg.type === 'ok' ? 'var(--green-bg)' : 'var(--red-bg)', color: msg.type === 'ok' ? 'var(--green)' : 'var(--red)' }}>{msg.text}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" onClick={onClose} disabled={busy} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', color: 'var(--text)', cursor: 'pointer' }}>Close</button>
          <button type="submit" disabled={busy} style={{ background: 'var(--green)', color: 'white', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 600, cursor: 'pointer' }}>{busy ? 'Saving…' : 'Save password'}</button>
        </div>
      </form>
    </div>, document.body)
}
