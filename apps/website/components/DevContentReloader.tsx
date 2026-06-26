'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function DevContentReloader() {
  const router = useRouter()

  useEffect(() => {
    const es = new EventSource('/api/dev/content-reload')
    es.onmessage = (e) => {
      if (e.data === 'reload') router.refresh()
    }
    return () => es.close()
  }, [router])

  return null
}
