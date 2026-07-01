import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAdminStore = create(
  persist(
    (set) => ({
      // ── Pending DB changes ──
      userChanges: {},
      setUserChange: (userId, patch) =>
        set((s) => ({ userChanges: { ...s.userChanges, [userId]: { ...(s.userChanges[userId] || {}), ...patch } } })),
      clearUserChanges: () => set({ userChanges: {} }),

      bookChanges: {},
      setBookChange: (bookId, patch) =>
        set((s) => ({ bookChanges: { ...s.bookChanges, [bookId]: { ...(s.bookChanges[bookId] || {}), ...patch } } })),
      clearBookChanges: () => set({ bookChanges: {} }),

      // ── Chapter operation states ──
      opStatus: {},   // { [bookId]: 'generating' | 'parsing' | 'splitting' | 'syncing' | 'done' | 'kb-done:N' | 'split-done:N' | 'error:...' }
      opProgress: {}, // { [bookId]: { value: 0-100 | null, label: string } }
      setOpStatus: (bookId, val) =>
        set((s) => ({ opStatus: { ...s.opStatus, [bookId]: val } })),
      setOpProgress: (bookId, value, label) =>
        set((s) => ({ opProgress: { ...s.opProgress, [bookId]: { value, label } } })),
      clearOpProgress: (bookId) =>
        set((s) => { const n = { ...s.opProgress }; delete n[bookId]; return { opProgress: n } }),

      // ── Admin search inputs ──
      adminSearch: {}, // { [tabId]: string }
      setAdminSearch: (tabId, val) =>
        set((s) => ({ adminSearch: { ...s.adminSearch, [tabId]: val } })),

      // ── Per-book tag inputs ──
      newTag: {}, // { [bookId]: string }
      setNewTag: (bookId, val) =>
        set((s) => ({ newTag: { ...s.newTag, [bookId]: val } })),

      // ── Voice session transcript ──
      voiceTranscripts: {}, // { [sessionId]: [{ role, text, id }] }
      appendVoiceMessage: (sessionId, msg) =>
        set((s) => ({
          voiceTranscripts: {
            ...s.voiceTranscripts,
            [sessionId]: [...(s.voiceTranscripts[sessionId] || []), msg],
          },
        })),
      clearVoiceTranscript: (sessionId) =>
        set((s) => { const n = { ...s.voiceTranscripts }; delete n[sessionId]; return { voiceTranscripts: n } }),
    }),
    { name: 'vyaz-admin-pending' }
  )
)
