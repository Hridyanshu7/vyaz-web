import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAdminStore = create(
  persist(
    (set) => ({
      userChanges: {},
      setUserChange: (userId, patch) =>
        set((s) => ({ userChanges: { ...s.userChanges, [userId]: { ...(s.userChanges[userId] || {}), ...patch } } })),
      clearUserChanges: () => set({ userChanges: {} }),

      bookChanges: {},
      setBookChange: (bookId, patch) =>
        set((s) => ({ bookChanges: { ...s.bookChanges, [bookId]: { ...(s.bookChanges[bookId] || {}), ...patch } } })),
      clearBookChanges: () => set({ bookChanges: {} }),
    }),
    { name: 'vyaz-admin-pending' }
  )
)
