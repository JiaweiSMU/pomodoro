// Page switching with the browser's own history. This is the only code that
// reads or changes the URL to pick a page; to move to react-router later,
// replace this file and the page switch in App.jsx.
import { useSyncExternalStore } from 'react'

const listeners = new Set()

function subscribe(listener) {
  listeners.add(listener)
  window.addEventListener('popstate', listener) // Back and Forward
  return () => {
    listeners.delete(listener)
    window.removeEventListener('popstate', listener)
  }
}

export const usePath = () => useSyncExternalStore(subscribe, () => window.location.pathname)

export function navigate(path) {
  if (path === window.location.pathname) return
  window.history.pushState(null, '', path)
  listeners.forEach((listener) => listener())
}

// An <a> that switches page without reloading. Ctrl/Cmd/Shift-click and
// middle-click are left to the browser, so "open in new tab" still works.
export function Link({ to, onClick, ...rest }) {
  return (
    <a
      href={to}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        navigate(to)
      }}
      {...rest}
    />
  )
}
