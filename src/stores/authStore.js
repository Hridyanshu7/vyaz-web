import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  otpSent: false,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      set({ user: session.user })
      await get().fetchProfile(session.user.id)
    }
    set({ loading: false })

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        set({ user: session.user })
        await get().fetchProfile(session.user.id)
      } else {
        set({ user: null, profile: null })
      }
    })
  },

  fetchProfile: async (userId) => {
    const { user } = get()
    let { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (!data) {
      const { data: created } = await supabase
        .from('profiles')
        .upsert({ id: userId })
        .select()
        .single()
      data = created
    }

    const meta = user?.user_metadata
    if (meta && data) {
      const updates = {}
      if (!data.name && (meta.full_name || meta.name)) updates.name = meta.full_name || meta.name
      if (!data.email && meta.email) updates.email = meta.email
      if (!data.avatar_url && (meta.avatar_url || meta.picture)) updates.avatar_url = meta.avatar_url || meta.picture
      if (Object.keys(updates).length > 0) {
        const { data: updated } = await supabase
          .from('profiles')
          .update(updates)
          .eq('id', userId)
          .select()
          .single()
        if (updated) data = updated
      }
    }

    set({ profile: data })
    return data
  },

  sendOtp: async (phone) => {
    const { error } = await supabase.auth.signInWithOtp({ phone })
    if (error) throw error
    set({ otpSent: true })
  },

  verifyOtp: async (phone, token) => {
    const { data, error } = await supabase.auth.verifyOtp({
      phone,
      token,
      type: 'sms',
    })
    if (error) throw error
    set({ otpSent: false })
    return data
  },

  signInWithGoogle: async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    })
    if (error) throw error
    return data
  },

  signInWithLinkedIn: async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'linkedin_oidc',
      options: { redirectTo: window.location.href },
    })
    if (error) throw error
    return data
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null, otpSent: false })
  },

  updateProfile: async (updates) => {
    const { user } = get()
    if (!user) throw new Error('Not authenticated')

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()

    if (error) throw error
    set({ profile: data })
    return data
  },

  isOnboarded: () => {
    return get().profile?.onboarding_complete === true
  },
}))
