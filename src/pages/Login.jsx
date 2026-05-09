import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const MAX_ATTEMPTS = 10
const LOCKOUT_MINUTES = 10
const STORAGE_KEY = 'fixnar_reset_attempts'

function getAttemptData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : { count: 0, lockedAt: null }
  } catch { return { count: 0, lockedAt: null } }
}
function saveAttemptData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail]               = useState('')
  const [password, setPassword]         = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [mode, setMode]                 = useState('login')
  const [resetEmail, setResetEmail]     = useState('')
  const [resetSent, setResetSent]       = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_ATTEMPTS)
  const [lockoutRemaining, setLockoutRemaining] = useState(0)

  useEffect(() => {
    checkLockout()
    const interval = setInterval(checkLockout, 10000)
    return () => clearInterval(interval)
  }, [])

  function checkLockout() {
    const data = getAttemptData()
    if (data.lockedAt) {
      const elapsed = (Date.now() - data.lockedAt) / 1000 / 60
      if (elapsed >= LOCKOUT_MINUTES) {
        saveAttemptData({ count: 0, lockedAt: null })
        setLockoutRemaining(0)
        setAttemptsLeft(MAX_ATTEMPTS)
      } else {
        setLockoutRemaining(Math.ceil(LOCKOUT_MINUTES - elapsed))
        setAttemptsLeft(0)
      }
    } else {
      setAttemptsLeft(MAX_ATTEMPTS - data.count)
      setLockoutRemaining(0)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await signIn(email, password)
    if (error) setError('Invalid email or password. Please try again.')
    setLoading(false)
  }

  async function handleForgotPassword(e) {
    e.preventDefault()
    setError('')
    const data = getAttemptData()
    if (data.lockedAt) {
      const elapsed = (Date.now() - data.lockedAt) / 1000 / 60
      if (elapsed < LOCKOUT_MINUTES) {
        setError(`Too many attempts. Wait ${Math.ceil(LOCKOUT_MINUTES - elapsed)} minute(s).`)
        return
      } else {
        saveAttemptData({ count: 0, lockedAt: null })
      }
    }
    if (data.count >= MAX_ATTEMPTS) {
      saveAttemptData({ count: data.count, lockedAt: Date.now() })
      setLockoutRemaining(LOCKOUT_MINUTES)
      setAttemptsLeft(0)
      setError(`Too many attempts. Please wait ${LOCKOUT_MINUTES} minutes.`)
      return
    }
    if (!resetEmail) { setError('Please enter your email address'); return }
    setResetLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      const newCount = data.count + 1
      saveAttemptData(newCount >= MAX_ATTEMPTS
        ? { count: newCount, lockedAt: Date.now() }
        : { count: newCount, lockedAt: null })
      setAttemptsLeft(MAX_ATTEMPTS - newCount)
      setError(error.message)
      setResetLoading(false)
      return
    }
    const newCount = data.count + 1
    saveAttemptData({ count: newCount, lockedAt: null })
    setAttemptsLeft(MAX_ATTEMPTS - newCount)
    setResetSent(true)
    setResetLoading(false)
  }

  const s = {
    wrap:  { minHeight:'100vh', background:'#0d1117', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans', sans-serif" },
    box:   { background:'#161b22', border:'1px solid #30363d', borderRadius:16, padding:32 },
    err:   { background:'#2d1b1b', border:'1px solid #f85149', borderRadius:8, padding:'10px 14px', marginBottom:16, color:'#f85149', fontSize:13, lineHeight:1.5 },
    ok:    { background:'#1d2f26', border:'1px solid #1D9E75', borderRadius:8, padding:'14px 16px', marginBottom:16, color:'#1D9E75', fontSize:13, lineHeight:1.6 },
    warn:  { background:'#2d2208', border:'1px solid #EF9F27', borderRadius:8, padding:'10px 14px', marginBottom:16, color:'#EF9F27', fontSize:13 },
    label: { display:'block', color:'#8b949e', fontSize:13, marginBottom:6 },
    inp:   { width:'100%', background:'#0d1117', border:'1px solid #30363d', borderRadius:8, padding:'10px 14px', color:'#e6edf3', fontSize:14, outline:'none', boxSizing:'border-box' },
    btn:   { width:'100%', color:'white', border:'none', borderRadius:8, padding:'12px', fontSize:15, fontWeight:500, transition:'background 0.2s' },
    link:  { background:'none', border:'none', color:'#1D9E75', fontSize:13, cursor:'pointer', padding:0, textDecoration:'underline' },
  }

  const EyeIcon = ({ show }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {show ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
          <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </>
      )}
    </svg>
  )

  return (
    <div style={s.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet"/>
      <div style={{ width:'100%', maxWidth:400, padding:'0 24px' }}>

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
                Enter your registered email and we'll send you a reset link.
              </p>
              {error && <div style={s.err}>{error}</div>}
              {lockoutRemaining > 0 && (
                <div style={s.warn}>🔒 Locked for {lockoutRemaining} more minute{lockoutRemaining > 1 ? 's' : ''}.</div>
              )}
              {resetSent ? (
                <>
                  <div style={s.ok}>
                    ✅ Reset link sent to <strong>{resetEmail}</strong><br/><br/>
                    Check your inbox and click the link. It expires in 1 hour.
                  </div>
                  {attemptsLeft < MAX_ATTEMPTS && attemptsLeft > 0 && (
                    <div style={{ color:'#6b7280', fontSize:12, marginBottom:16, textAlign:'center' }}>
                      {attemptsLeft} reset attempt{attemptsLeft !== 1 ? 's' : ''} remaining
                    </div>
                  )}
                  <button onClick={() => { setMode('login'); setResetSent(false); setError('') }}
                    style={{ ...s.btn, background:'#1D9E75', cursor:'pointer' }}>
                    Back to sign in
                  </button>
                </>
              ) : (
                <form onSubmit={handleForgotPassword}>
                  <div style={{ marginBottom:20 }}>
                    <label style={s.label}>Email address</label>
                    <input type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                      required disabled={lockoutRemaining > 0}
                      style={{ ...s.inp, opacity: lockoutRemaining > 0 ? 0.5 : 1 }}
                      placeholder="you@company.com"/>
                  </div>
                  {attemptsLeft < MAX_ATTEMPTS && attemptsLeft > 0 && (
                    <div style={{ color:'#EF9F27', fontSize:12, marginBottom:12 }}>
                      ⚠ {attemptsLeft} attempt{attemptsLeft !== 1 ? 's' : ''} remaining before 10-minute lockout
                    </div>
                  )}
                  <button type="submit" disabled={resetLoading || lockoutRemaining > 0}
                    style={{ ...s.btn, background: resetLoading || lockoutRemaining > 0 ? '#155740':'#1D9E75', cursor: resetLoading || lockoutRemaining > 0 ? 'not-allowed':'pointer', marginBottom:16 }}>
                    {resetLoading ? 'Sending...' : lockoutRemaining > 0 ? `Locked — wait ${lockoutRemaining} min` : 'Send reset link'}
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
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    required style={s.inp} placeholder="you@company.com"/>
                </div>

                <div style={{ marginBottom:24 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                    <label style={{ ...s.label, marginBottom:0 }}>Password</label>
                    <button type="button" onClick={() => { setMode('forgot'); setResetEmail(email); setError('') }} style={s.link}>
                      Forgot password?
                    </button>
                  </div>
                  {/* Password input with show/hide toggle */}
                  <div style={{ position:'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      style={{ ...s.inp, paddingRight:44 }}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{
                        position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
                        background:'none', border:'none', cursor:'pointer',
                        color:'#6b7280', display:'flex', alignItems:'center', padding:0
                      }}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <EyeIcon show={showPassword}/>
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  style={{ ...s.btn, background: loading ? '#155740':'#1D9E75', cursor: loading ? 'not-allowed':'pointer' }}>
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
