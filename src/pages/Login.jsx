import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [mode, setMode]           = useState('login') // 'login' | 'forgot'
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await signIn(email, password)
    if (error) setError(error.message)
    setLoading(false)
  }

  async function handleForgotPassword(e) {
    e.preventDefault()
    if (!email) { setError('Please enter your email address first'); return }
    setResetLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) { setError(error.message); setResetLoading(false); return }
    setResetSent(true)
    setResetLoading(false)
  }

  const s = {
    wrap:  { minHeight:'100vh', background:'#0d1117', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans', sans-serif" },
    card:  { width:'100%', maxWidth:400, padding:'0 24px' },
    box:   { background:'#161b22', border:'1px solid #30363d', borderRadius:16, padding:32 },
    err:   { background:'#2d1b1b', border:'1px solid #f85149', borderRadius:8, padding:'10px 14px', marginBottom:16, color:'#f85149', fontSize:13 },
    ok:    { background:'#1d2f26', border:'1px solid #1D9E75', borderRadius:8, padding:'14px 16px', marginBottom:16, color:'#1D9E75', fontSize:13, lineHeight:1.6 },
    label: { display:'block', color:'#8b949e', fontSize:13, marginBottom:6 },
    inp:   { width:'100%', background:'#0d1117', border:'1px solid #30363d', borderRadius:8, padding:'10px 14px', color:'#e6edf3', fontSize:14, outline:'none', boxSizing:'border-box' },
    btn:   { width:'100%', color:'white', border:'none', borderRadius:8, padding:'12px', fontSize:15, fontWeight:500, transition:'background 0.2s' },
    link:  { background:'none', border:'none', color:'#1D9E75', fontSize:13, cursor:'pointer', padding:0, textDecoration:'underline' },
  }

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>
      <div style={s.card}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:56, height:56, background:'#1D9E75', borderRadius:16, marginBottom:16 }}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M4 14h8M16 14h8M14 4v8M14 16v8" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="14" cy="14" r="3" fill="white"/>
            </svg>
          </div>
          <h1 style={{ color:'#ffffff', fontSize:28, fontWeight:600, margin:0, letterSpacing:'-0.5px' }}>Fixnar</h1>
          <p style={{ color:'#6b7280', fontSize:14, margin:'6px 0 0' }}>Maintenance Management System</p>
        </div>

        <div style={s.box}>

          {/* ── FORGOT PASSWORD ── */}
          {mode === 'forgot' && (
            <>
              <h2 style={{ color:'#e6edf3', fontSize:18, fontWeight:500, margin:'0 0 8px' }}>Reset your password</h2>
              <p style={{ color:'#6b7280', fontSize:13, margin:'0 0 24px', lineHeight:1.6 }}>
                Enter your registered email and we'll send you a reset link instantly.
              </p>

              {error && <div style={s.err}>{error}</div>}

              {resetSent ? (
                <>
                  <div style={s.ok}>
                    ✅ Reset link sent to <strong>{email}</strong><br/><br/>
                    Check your inbox and click the link to create a new password. The link expires in 1 hour.
                  </div>
                  <button
                    onClick={() => { setMode('login'); setResetSent(false); setError('') }}
                    style={{ ...s.btn, background:'#1D9E75', cursor:'pointer' }}
                  >
                    Back to sign in
                  </button>
                </>
              ) : (
                <form onSubmit={handleForgotPassword}>
                  <div style={{ marginBottom:20 }}>
                    <label style={s.label}>Email address</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      style={s.inp}
                      placeholder="you@company.com"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    style={{ ...s.btn, background: resetLoading ? '#155740' : '#1D9E75', cursor: resetLoading ? 'not-allowed' : 'pointer', marginBottom:16 }}
                  >
                    {resetLoading ? 'Sending...' : 'Send reset link'}
                  </button>
                  <div style={{ textAlign:'center' }}>
                    <button type="button" onClick={() => { setMode('login'); setError('') }} style={s.link}>
                      ← Back to sign in
                    </button>
                  </div>
                </form>
              )}
            </>
          )}

          {/* ── LOGIN ── */}
          {mode === 'login' && (
            <>
              <h2 style={{ color:'#e6edf3', fontSize:18, fontWeight:500, margin:'0 0 24px' }}>Sign in to your account</h2>

              {error && <div style={s.err}>{error}</div>}

              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom:16 }}>
                  <label style={s.label}>Email address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    style={s.inp}
                    placeholder="you@company.com"
                  />
                </div>

                <div style={{ marginBottom:24 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                    <label style={{ ...s.label, marginBottom:0 }}>Password</label>
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError('') }}
                      style={s.link}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    style={s.inp}
                    placeholder="••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  style={{ ...s.btn, background: loading ? '#155740' : '#1D9E75', cursor: loading ? 'not-allowed' : 'pointer' }}
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
              </form>
            </>
          )}
        </div>

        <p style={{ textAlign:'center', color:'#6b7280', fontSize:12, marginTop:24 }}>
          Fixnar v1.0 · Facility Management Platform
        </p>
      </div>
    </div>
  )
}
