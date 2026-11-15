import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const hasErr = (e) => e && Object.keys(e).length

function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function browserAlert(n) {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return
    if (Notification.permission !== 'granted' || document.visibilityState === 'visible') return
    const opts = { body: n.body || '', tag: n.id, icon: '/icon-192.png', badge: '/icon-192.png', data: { link: n.link || '/' } }
    // Android Chrome only allows notifications through the service worker
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.ready.then(reg => reg.showNotification(n.title, opts)).catch(() => {})
    } else {
      const note = new Notification(n.title, opts)
      note.onclick = () => { window.focus(); if (n.link) window.location.href = n.link }
    }
  } catch { /* some browsers block notifications */ }
}

export default function NotificationBell() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [open, setOpen]   = useState(false)
  const [perm, setPerm]   = useState(() => (typeof window !== 'undefined' && 'Notification' in window) ? Notification.permission : 'unsupported')
  const seen = useRef(new Set())

  const unread = items.filter(n => !n.read_at).length

  useEffect(() => {
    if (!profile?.id) return
    let alive = true

    async function load() {
      const { data, error } = await supabase.from('notifications').select('*')
        .eq('user_id', profile.id).order('created_at', { ascending:false }).limit(40)
      if (!alive || hasErr(error)) return
      ;(data || []).forEach(n => seen.current.add(n.id))
      setItems(data || [])
    }
    load()

    // Realtime push; polling every 60s as a fallback if the socket drops
    const channel = supabase.channel(`notif-${profile.id}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'notifications', filter:`user_id=eq.${profile.id}` },
        payload => {
          const n = payload.new
          if (seen.current.has(n.id)) return
          seen.current.add(n.id)
          setItems(prev => [n, ...prev].slice(0, 40))
          browserAlert(n)
        })
      .subscribe()
    const poll = setInterval(load, 60000)

    return () => { alive = false; clearInterval(poll); supabase.removeChannel(channel) }
  }, [profile?.id])

  // Unread count in the browser tab title
  useEffect(() => {
    const base = 'Fixnar'
    document.title = unread > 0 ? `(${unread}) ${base}` : base
  }, [unread])

  async function markAllRead() {
    const ids = items.filter(n => !n.read_at).map(n => n.id)
    if (!ids.length) return
    const now = new Date().toISOString()
    setItems(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }))
    await supabase.from('notifications').update({ read_at: now }).in('id', ids)
  }

  async function openItem(n) {
    setOpen(false)
    if (!n.read_at) {
      const now = new Date().toISOString()
      setItems(prev => prev.map(x => x.id === n.id ? { ...x, read_at: now } : x))
      await supabase.from('notifications').update({ read_at: now }).eq('id', n.id)
    }
    if (n.link) navigate(n.link)
  }

  async function enableBrowserAlerts() {
    if (!('Notification' in window)) return
    const p = await Notification.requestPermission()
    setPerm(p)
  }

  const typeColor = { sla_breach:'var(--red)', new_wo:'var(--blue)', assigned:'var(--purple)', status:'var(--green)', ppm:'var(--amber)', quote:'var(--amber)' }

  return (
    <div style={{ position:'relative' }}>
      <button onClick={() => setOpen(o => !o)} title="Notifications"
        style={{ position:'relative', background:'var(--bg3)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 11px', cursor:'pointer', color:'var(--text2)', fontSize:15, lineHeight:1 }}>
        🔔
        {unread > 0 && (
          <span style={{ position:'absolute', top:-6, right:-6, minWidth:18, height:18, borderRadius:9, background:'var(--red)', color:'white', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position:'fixed', inset:0, zIndex:350 }}/>
          <div style={{ position:'absolute', top:'calc(100% + 8px)', right:0, width:'min(360px, calc(100vw - 24px))', maxHeight:'70vh', display:'flex', flexDirection:'column', background:'var(--card-bg)', border:'1px solid var(--border)', borderRadius:12, boxShadow:'0 8px 24px rgba(0,0,0,0.15)', zIndex:400 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
              <span style={{ fontWeight:700, fontSize:14, color:'var(--text)' }}>Notifications</span>
              <button onClick={markAllRead} disabled={!unread} style={{ background:'none', border:'none', color: unread ? 'var(--green)' : 'var(--text3)', fontSize:12, cursor: unread ? 'pointer' : 'default' }}>Mark all read</button>
            </div>
            {perm === 'default' && (
              <button onClick={enableBrowserAlerts} style={{ margin:'8px 12px 0', background:'var(--green-bg)', color:'var(--green)', border:'1px solid var(--green)', borderRadius:8, padding:'7px', fontSize:12, cursor:'pointer' }}>
                🔔 Turn on pop-up alerts on this device
              </button>
            )}
            <div style={{ overflowY:'auto', flex:1 }}>
              {items.length === 0 ? (
                <div style={{ padding:24, textAlign:'center', color:'var(--text3)', fontSize:13 }}>You're all caught up.</div>
              ) : items.map(n => (
                <button key={n.id} onClick={() => openItem(n)}
                  style={{ display:'block', width:'100%', textAlign:'left', background: n.read_at ? 'transparent' : 'var(--hover-bg)', border:'none', borderBottom:'1px solid var(--border)', borderLeft:`3px solid ${n.read_at ? 'transparent' : (typeColor[n.type] || 'var(--blue)')}`, padding:'10px 12px', cursor:'pointer' }}>
                  <div style={{ fontSize:13, fontWeight: n.read_at ? 400 : 600, color:'var(--text)' }}>{n.title}</div>
                  {n.body && <div style={{ fontSize:12, color:'var(--text2)', marginTop:2 }}>{n.body}</div>}
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:3 }}>{timeAgo(n.created_at)}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
