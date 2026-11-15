import { useEffect, useRef } from 'react'
import { supabase } from './supabase'

// Re-runs `onChange` (debounced) whenever rows in `table` change anywhere in the system,
// so every open screen shows the same status / time / technician without a manual refresh.
// Optional `filter` uses Supabase syntax, e.g. 'id=eq.<uuid>'.
export function useLive(table, onChange, filter) {
  const cb = useRef(onChange)
  cb.current = onChange

  useEffect(() => {
    let timer = null
    const fire = () => { clearTimeout(timer); timer = setTimeout(() => cb.current && cb.current(), 700) }
    const opts = { event: '*', schema: 'public', table }
    if (filter) opts.filter = filter
    const channel = supabase.channel(`live-${table}-${filter || 'all'}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', opts, fire)
      .subscribe()
    return () => { clearTimeout(timer); supabase.removeChannel(channel) }
  }, [table, filter])
}
