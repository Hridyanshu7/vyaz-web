import { useEffect, useRef } from 'react'
import { track } from '../lib/analytics'

const THRESHOLDS = [25, 50, 75, 100]

// Fires 'page_scroll_depth' once per threshold crossed, reset on each mount (i.e. per page visit).
export function useScrollDepth(pageName) {
  const firedRef = useRef(new Set())

  useEffect(() => {
    firedRef.current = new Set()

    const handleScroll = () => {
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      if (docHeight <= 0) return
      const pct = Math.round((window.scrollY / docHeight) * 100)
      for (const threshold of THRESHOLDS) {
        if (pct >= threshold && !firedRef.current.has(threshold)) {
          firedRef.current.add(threshold)
          track('page_scroll_depth', { page: pageName, depth_pct: threshold })
        }
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [pageName])
}
