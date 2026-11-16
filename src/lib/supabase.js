import { createClient } from '@supabase/supabase-js'

import { CURRENT } from './workspaces'

// The database of the workspace this tab is using (Fixnar, Wahat Al Hayah, …)
const SUPABASE_URL = CURRENT.url
const SUPABASE_ANON_KEY = CURRENT.key

// Never let a request hang forever (bad signal, sleeping laptop): abort after a time limit
// so buttons like "Saving…" / "Removing…" always come back with an error instead.
function fetchWithTimeout(input, init = {}) {
  const url = typeof input === 'string' ? input : input?.url || ''
  const ms = url.includes('/storage/v1/') ? 120000 : 30000
  if (init.signal) return fetch(input, init)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  return fetch(input, { ...init, signal: ctrl.signal })
    .catch(err => {
      if (err?.name === 'AbortError') throw new Error('The server took too long to answer. Check your connection and try again.')
      throw err
    })
    .finally(() => clearTimeout(timer))
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { fetch: fetchWithTimeout },
})

// Supabase returns at most 1000 rows per request. This keeps fetching pages
// until everything is loaded. Pass a function that builds a fresh query.
export async function fetchAllRows(makeQuery, pageSize = 1000) {
  let from = 0
  const rows = []
  for (let i = 0; i < 50; i++) {
    const { data, error } = await makeQuery().range(from, from + pageSize - 1)
    if (error && Object.keys(error).length) return { data: rows, error }
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return { data: rows, error: null }
}
