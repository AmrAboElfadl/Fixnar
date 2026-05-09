import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useNavigate } from 'react-router-dom'

export default function ResetPassword() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [validSession, setValidSession] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setValidSession(true)
      else setError('This reset link is invalid or has expired.')
    })
  }, [])

  async function handleReset(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(error.message); setLoading(false); return }
    setSuccess(true)
    setLoading(false)
    setTimeout(() => navigate('/login'), 3000)
  }

  const s = {
    wrap: { minHeight:'100vh', background:'#0d1117', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans', sans-serif" },
    box: { background:'#161b22', border:'1px solid #30363d', borderRadius:16, padding:32 },
    err: { background:'#2d1b1b', border:'1px solid #f85149', borderRadius:8, padding:'12px 16px', marginBottom:16, color:'#f85149', fontSize:13 },
    ok: { background:'#1d2f26', border:'1px solid #1D9E75', borderRadius:8, padding:'16px', marginBottom:16, color:'#1D9E75', fontSize:13, lineHeight:1.6, textAlign:'center' },
    label: { display:'block', color:'#8b949e', fontSize:13, marginBottom:6 },
    inp: { width:'100%', background:'#0d1117', border:'1px solid #30363d', borderRadius:8, padding:'10px 14px', color:'#e6edf3', fontSize:14, outline:'none', boxSizing:'border-box' },
    btn: { width:'100%', color:'white', border:'none', borderRadius:8, padding:'12px', fontSize:15, fontWeight:500, cursor:'pointer' },
  }

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>
      <div style={{ width:'100%', maxWidth:400, padding:'0 24px' }}>
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:56, height:56, background:'#1D9E75', borderRadius:16, marginBottom:16 }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M4 14h8M16 14h8M14 4v8M14 16v8" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="14" cy="14" r="3" fill="white"/>
            </svg>
          </div>
          <h1 style={{ color:'#ffffff', fontSize:28, fontWeight:600, margin:0 }}>Fixnar</h1>
          <p style={{ color:'#6b7280', fontSize:14, margin:'6px 0 0' }}>Maintenance Management System</p>
        </div>

        <div style={s.box}>
          <h2 style={{ color:'#e6edf3', fontSize:18, fontWeight:500, margin:'0 0 8px' }}>Set new password</h2>
          <p style={{ color:'#6b7280', fontSize:13, margin:'0 0 24px', lineHeight:1.6 }}>Choose a strong password for your account.</p>

          {error && <div style={s.err}>{error}</div>}

          {success ? (
            <div style={s.ok}>
              ✅ Password updated successfully!<br/><br/>
              Redirecting to login in 3 seconds...
            </div>
          ) : validSession ? (
            <form onSubmit={handleReset}>
              <div style={{ marginBottom:16 }}>
                <label style={s.label}>New password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={s.inp} placeholder="Min. 8 characters"/>
              </div>
              <div style={{ marginBottom:24 }}>
                <label style={s.label}>Confirm new password</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required style={{ ...s.inp, border: confirm && confirm !== password ? '1px solid #f85149' : '1px solid #30363d' }} placeholder="Repeat your password"/>
              </div>
              <button type="submit" disabled={loading || !password || !confirm} style={{ ...s.btn, background: loading || !password || !confirm ? '#155740' : '#1D9E75', cursor: loading || !password || !confirm ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Updating...' : 'Set new password'}
              </button>
            </form>
          ) : !error ? (
            <div style={{ textAlign:'center', color:'#6b7280', padding:'20px 0' }}>Verifying reset link...</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
