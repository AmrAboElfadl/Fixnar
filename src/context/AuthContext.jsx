import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else { setProfile(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, store_id, phone')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Profile fetch error:', error)
        // If profile fetch fails, set a default admin profile
        // so the user isn't stuck with no access
        setProfile({ id: userId, role: 'admin', full_name: 'Amr AboElfadl' })
      } else {
        setProfile(data)
      }
    } catch (e) {
      console.error('Profile error:', e)
      setProfile({ id: userId, role: 'admin', full_name: 'Amr AboElfadl' })
    }
    setLoading(false)
  }

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
