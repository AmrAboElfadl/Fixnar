import { createContext, useContext, useEffect, useState } from 'react'
import { WORKSPACES, sessionKey } from '../lib/workspaces'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileError, setProfileError] = useState(null)

  useEffect(() => {
    let done = false

    // FAILSAFE: never let "Loading Fixnar..." hang forever.
    // If anything stalls (network, getSession never resolves), force-resolve at 8s.
    const failsafe = setTimeout(() => {
      if (!done) {
        console.warn('Auth init timed out — forcing loading=false')
        setLoading(false)
      }
    }, 8000)

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error && Object.keys(error).length) {
          console.error('getSession error:', error)
        }
        const session = data?.session ?? null
        setUser(session?.user ?? null)
        if (session?.user) {
          fetchProfile(session.user.id)
        } else {
          done = true
          clearTimeout(failsafe)
          setLoading(false)
        }
      })
      .catch((e) => {
        console.error('getSession threw:', e)
        done = true
        clearTimeout(failsafe)
        setLoading(false)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        // Token refreshes don't change the profile — skip the extra request.
        // Supabase advises not to call the client inside this callback, so defer it.
        if (event !== 'TOKEN_REFRESHED' && event !== 'INITIAL_SESSION') {
          setTimeout(() => fetchProfile(session.user.id), 0)
        }
      } else {
        setProfile(null)
        done = true
        clearTimeout(failsafe)
        setLoading(false)
      }
    })

    async function fetchProfile(userId) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, role, store_id, phone, vendor_id')
          .eq('id', userId)
          .single()

        // Supabase returns {data:null, error:{}} on silent failures —
        // check the error as an object, not via try/catch alone.
        if (error && Object.keys(error).length) {
          // Never grant a role on failure — show the "no access" screen instead.
          console.error('Profile fetch error:', error)
          setProfile(null)
          setProfileError(error.message || 'Could not load your profile')
        } else if (data) {
          setProfile(data)
          setProfileError(null)
        } else {
          setProfile(null)
          setProfileError('Your account has no Fixnar profile yet. Ask the admin to give you access.')
        }
      } catch (e) {
        console.error('Profile error (threw):', e)
        setProfile(null)
        setProfileError('Could not load your profile. Check your connection and refresh.')
      } finally {
        done = true
        clearTimeout(failsafe)
        setLoading(false)
      }
    }

    return () => {
      clearTimeout(failsafe)
      subscription.unsubscribe()
    }
  }, [])

  async function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  // Signing out leaves every workspace (Fixnar, Wahat, …) on this device
  async function signOut() {
    setProfile(null)
    setProfileError(null)
    const r = await supabase.auth.signOut()
    WORKSPACES.forEach(ws => { try { localStorage.removeItem(sessionKey(ws)) } catch { /* ignore */ } })
    return r
  }

  const isAdmin      = profile?.role === 'admin'
  const isTechnician = profile?.role === 'technician'
  const isOperations = profile?.role === 'operations'

  return (
    <AuthContext.Provider value={{ user, profile, profileError, loading, signIn, signOut, isAdmin, isTechnician, isOperations }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
