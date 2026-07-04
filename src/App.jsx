import { useEffect, Component } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/layout/Layout'
import { Home } from './pages/Home'
import { BookBrowse } from './pages/BookBrowse'
import { BookDetail } from './pages/BookDetail'
import { NarratorProfile } from './pages/NarratorProfile'
import { Dashboard } from './pages/Dashboard'
import { PostSession } from './pages/PostSession'
import { AddBook } from './pages/AddBook'
import { Profile } from './pages/Profile'
import { Availability } from './pages/Availability'
import { Login } from './pages/Login'
import { Onboarding } from './pages/Onboarding'
import { useAuthStore } from './stores/authStore'
import { useBookStore } from './stores/bookStore'

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="max-w-lg mx-auto px-4 py-16 text-center">
          <p className="text-lg font-bold mb-2">Something went wrong</p>
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg font-mono break-all">{this.state.error.message}</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-foreground text-white rounded-lg text-sm cursor-pointer">
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  const initAuth = useAuthStore((s) => s.initialize)
  const initBooks = useBookStore((s) => s.initialize)

  useEffect(() => {
    initAuth()
    initBooks()
  }, [initAuth, initBooks])

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/books" element={<BookBrowse />} />
            <Route path="/books/:id" element={<BookDetail />} />
            <Route path="/narrators/:id" element={<NarratorProfile />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/review/:bookingId" element={<PostSession />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/availability" element={<Availability />} />
            <Route path="/add-book" element={<AddBook />} />
            <Route path="/login" element={<Login />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
