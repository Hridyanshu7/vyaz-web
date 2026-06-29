import { create } from 'zustand'

export const useSignupModal = create((set) => ({
  open: false,
  context: null,
  show: (context = null) => set({ open: true, context }),
  hide: () => set({ open: false, context: null }),
}))
