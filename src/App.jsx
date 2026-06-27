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
import { Onboarding } from './pages/Onboarding'
import { Login } from './pages/Login'
import { Signup } from './pages/Signup'
import { AddBook } from './pages/AddBook'
import { useAuthStore } from './stores/authStore'

export default function App() {
  const initialize = useAuthStore((s) => s.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/books" element={<BookBrowse />} />
          <Route path="/books/:id" element={<BookDetail />} />
          <Route path="/narrators/:id" element={<NarratorProfile />} />
          <Route path="/book/:bookId/narrator/:narratorId/schedule" element={<Schedule />} />
          <Route path="/booking/:id" element={<Dashboard />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/review/:bookingId" element={<PostSession />} />
          <Route path="/onboarding" element={<Onboarding />} />
          <Route path="/add-book" element={<AddBook />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
