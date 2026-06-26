const STORAGE_KEY = 'sparc_route_context'

export function setRouteContext(data) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function consumeRouteContext() {
  const raw = sessionStorage.getItem(STORAGE_KEY)
  sessionStorage.removeItem(STORAGE_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
