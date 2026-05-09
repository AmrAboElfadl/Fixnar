import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const { signIn } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await signIn(email, password)
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', background:'#0d1117', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans', sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>

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

        {/* Card */}
        <div style={{ background:'#161b22', border:'1px solid #30363d', borderRadius:16, padding:32 }}>
          <h2 style={{ color:'#e6edf3', fontSize:18, fontWeight:500, margin:'0 0 24px' }}>Sign in to your account</h2>

          {error && (
            <div style={{ background:'#2d1b1b', border:'1px solid #f85149', borderRadius:8, padding:'10px 14px', marginBottom:16, color:'#f85149', fontSize:13 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', color:'#8b949e', fontSize:13, marginBottom:6 }}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                style={{ width:'100%', background:'#0d1117', border:'1px solid #30363d', borderRadius:8, padding:'10px 14px', color:'#e6edf3', fontSize:14, outline:'none', boxSizing:'border-box' }}
                placeholder="you@company.com"
              />
            </div>
            <div style={{ marginBottom:24 }}>
              <label style={{ display:'block', color:'#8b949e', fontSize:13, marginBottom:6 }}>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{ width:'100%', background:'#0d1117', border:'1px solid #30363d', borderRadius:8, padding:'10px 14px', color:'#e6edf3', fontSize:14, outline:'none', boxSizing:'border-box' }}
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              style={{ width:'100%', background: loading ? '#155740' : '#1D9E75', color:'white', border:'none', borderRadius:8, padding:'12px', fontSize:15, fontWeight:500, cursor: loading ? 'not-allowed' : 'pointer', transition:'background 0.2s' }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>

        <p style={{ textAlign:'center', color:'#6b7280', fontSize:12, marginTop:24 }}>
          Fixnar v1.0 · Facility Management Platform
        </p>
      </div>
    </div>
  )
}
