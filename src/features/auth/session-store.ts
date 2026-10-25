/**
 * Sesi petugas (zustand). Profil (role, active) dibaca dari tabel profiles lewat RLS:
 * pengguna hanya bisa membaca profilnya sendiri. Tanpa profil aktif = tanpa akses.
 */
import { create } from 'zustand'
import { getSupabase } from '@/lib/supabase'
import { authErrorMessage } from './auth-errors'

export type Role = 'officer' | 'admin'

export interface OfficerProfile {
  id: string
  full_name: string
  role: Role
  active: boolean
}

type Status = 'idle' | 'loading' | 'signed-out' | 'signed-in'

interface SessionState {
  status: Status
  email: string | null
  profile: OfficerProfile | null
  error: string | null
  init: () => Promise<void>
  signIn: (email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>
}

let subscribed = false

async function loadProfile(userId: string): Promise<OfficerProfile | null> {
  const sb = await getSupabase()
  const { data, error } = await sb
    .from('profiles')
    .select('id, full_name, role, active')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as OfficerProfile | null) ?? null
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'idle',
  email: null,
  profile: null,
  error: null,

  init: async () => {
    if (get().status !== 'idle') return
    set({ status: 'loading', error: null })
    try {
      const sb = await getSupabase()
      if (!subscribed) {
        subscribed = true
        sb.auth.onAuthStateChange((event) => {
          if (event === 'SIGNED_OUT') set({ status: 'signed-out', email: null, profile: null })
        })
      }
      const { data } = await sb.auth.getSession()
      const user = data.session?.user
      if (!user) {
        set({ status: 'signed-out' })
        return
      }
      set({ status: 'signed-in', email: user.email ?? null, profile: await loadProfile(user.id) })
    } catch (err) {
      set({ status: 'signed-out', error: authErrorMessage(err) })
    }
  },

  signIn: async (email, password) => {
    set({ error: null })
    try {
      const sb = await getSupabase()
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
      const profile = await loadProfile(data.user.id)
      set({ status: 'signed-in', email: data.user.email ?? null, profile })
      return true
    } catch (err) {
      set({ error: authErrorMessage(err) })
      return false
    }
  },

  signOut: async () => {
    try {
      const sb = await getSupabase()
      await sb.auth.signOut()
    } finally {
      set({ status: 'signed-out', email: null, profile: null })
    }
  },
}))
