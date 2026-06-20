import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
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
          .select('id, full_name, email, role, store_id, phone')
          .eq('id', userId)
          .single()

        // Supabase returns {data:null, error:{}} on silent failures —
        // check the error as an object, not via try/catch alone.
        if (error && Object.keys(error).length) {
          console.error('Profile fetch error:', error)
          setProfile({ id: userId, role: 'admin', full_name: 'Amr AboElfadl' })
        } else if (data) {
          setProfile(data)
        } else {
          // No row found — fall back so the user still gets in.
          setProfile({ id: userId, role: 'admin', full_name: 'Amr AboElfadl' })
        }
      } catch (e) {
        console.error('Profile error (threw):', e)
        setProfile({ id: userId, role: 'admin', full_name: 'Amr AboElfadl' })
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

  async function signOut() {
    setProfile(null)
    return supabase.auth.signOut()
  }

  const isAdmin      = profile?.role === 'admin'
  const isTechnician = profile?.role === 'technician'
  const isOperations = profile?.role === 'operations'

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut, isAdmin, isTechnician, isOperations }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
