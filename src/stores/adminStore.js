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
      // `ts` (epoch ms) is stamped once, at first creation, on every turn — never
      // overwritten on later streaming updates — so voice_sessions.data.turns carries a
      // real per-turn timestamp (baseline: the row's own started_at) without needing a
      // separate relative-offset field.
      voiceTranscripts: {}, // { [sessionId]: [{ role, text, id, ts }] }
      appendVoiceMessage: (sessionId, msg) =>
        set((s) => ({
          voiceTranscripts: {
            ...s.voiceTranscripts,
            [sessionId]: [...(s.voiceTranscripts[sessionId] || []), { ...msg, ts: msg.ts ?? Date.now() }],
          },
        })),
      // Update message with matching id in place, or append if new (for streaming bubbles)
      upsertVoiceMessage: (sessionId, msg) =>
        set((s) => {
          const existing = s.voiceTranscripts[sessionId] || []
          const idx = existing.findIndex((m) => m.id === msg.id)
          const next = idx >= 0
            ? existing.map((m, i) => (i === idx ? { ...m, ...msg } : m)) // msg has no ts → m.ts survives
            : [...existing, { ...msg, ts: Date.now() }]
          return { voiceTranscripts: { ...s.voiceTranscripts, [sessionId]: next } }
        }),
      clearVoiceTranscript: (sessionId) =>
        set((s) => { const n = { ...s.voiceTranscripts }; delete n[sessionId]; return { voiceTranscripts: n } }),
    }),
    { name: 'vyaz-admin-pending' }
  )
)
