import { create } from 'zustand'

export const useSignupModal = create((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
}))
