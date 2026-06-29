import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { Home } from './pages/Home'
import { BookBrowse } from './pages/BookBrowse'
import { BookDetail } from './pages/BookDetail'
import { NarratorProfile } from './pages/NarratorProfile'
import { Schedule } from './pages/Schedule'
import { Dashboard } from './pages/Dashboard'
import { PostSession } from './pages/PostSession'
import { AddBook } from './pages/AddBook'
import { Profile } from './pages/Profile'
import { useAuthStore } from './stores/authStore'
import { useBookStore } from './stores/bookStore'

export default function App() {
  const initAuth = useAuthStore((s) => s.initialize)
  const initBooks = useBookStore((s) => s.initialize)

  useEffect(() => {
    initAuth()
    initBooks()
  }, [initAuth, initBooks])

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/books" element={<BookBrowse />} />
          <Route path="/books/:id" element={<BookDetail />} />
          <Route path="/narrators/:id" element={<NarratorProfile />} />
          <Route path="/book/:bookId/narrator/:narratorId/schedule" element={<Schedule />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/review/:bookingId" element={<PostSession />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/add-book" element={<AddBook />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
