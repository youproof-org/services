'use client'

import { useEffect, useRef } from 'react'

// Publishes the sticky header's current height as the `--header-height` CSS
// custom property on <html>, kept in sync via ResizeObserver. Used by the
// homepage hero to fill exactly the viewport below the (in-flow) header
// (`min-height: calc(100vh - var(--header-height))`) without pulling the header
// out of flow (which would break every other page's layout).
export default function HeaderHeightProbe() {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const header = ref.current?.closest('header')
    if (!header) return
    const apply = () =>
      document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(header)
    return () => ro.disconnect()
  }, [])

  return <span ref={ref} aria-hidden="true" style={{ display: 'none' }} />
}
