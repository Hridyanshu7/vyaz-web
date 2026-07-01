import { create } from 'zustand'

// Persists admin pending changes across page navigation within the same session.
// Cleared on explicit Save or on page reload.
export const useAdminStore = create((set, get) => ({
  // Users tab
  userChanges: {},   // { [userId]: { role?, is_admin?, is_active? } }
  setUserChange: (userId, patch) =>
    set((s) => ({ userChanges: { ...s.userChanges, [userId]: { ...(s.userChanges[userId] || {}), ...patch } } })),
  clearUserChanges: () => set({ userChanges: {} }),

  // Books catalog tab
  bookChanges: {},   // { [bookId]: { genres?, is_published? } }
  setBookChange: (bookId, patch) =>
    set((s) => ({ bookChanges: { ...s.bookChanges, [bookId]: { ...(s.bookChanges[bookId] || {}), ...patch } } })),
  clearBookChanges: () => set({ bookChanges: {} }),
}))
