import { Loader } from '../libs/nofbiz/nofbiz.base.js'

// Singleton full-viewport loader covering the cold-load window (the stretch
// between first paint and the first route becoming visible).
//
// Two hard constraints from SPARC's Router, both verified in the browser:
//   1. The Router calls `$('#root').html('')` on every navigation, so a loader
//      placed in #root is wiped mid-load. We mount it in a dedicated sibling
//      node (#app-route-loader-mount), un-hidden by a CSS rule the same way
//      #app-header-mount is.
//   2. route.css loads asynchronously ~1s AFTER the route DOM renders, so the
//      route markup exists while still unstyled/collapsed (offsetHeight 0 ->
//      looks blank). We therefore hide only once #root holds laid-out content
//      (a direct child with offsetHeight > 0), not merely when navigation fires.
const MOUNT_ID = 'app-route-loader-mount'
const SAFETY_MS = 12000
const POLL_MS = 80

let loader = null
let watchTimer = null
let safetyTimer = null

function ensureMount() {
  let mount = document.getElementById(MOUNT_ID)
  if (!mount) {
    mount = document.createElement('div')
    mount.id = MOUNT_ID
    // Sibling of #root (inside the .nofbiz-reset wrapper) so Router cleanups,
    // which only clear #root, never remove it.
    const host = document.querySelector('.nofbiz-reset') || document.body
    host.appendChild(mount)
  }
  return mount
}

function getLoader() {
  ensureMount()
  if (!loader) {
    // Dedicated class (not app-fullpage-loader): the nofbiz Loader base is only a
    // transparent blur overlay, which is invisible over a blank boot page.
    // app-route-loader adds a solid surface + a visible spinner.
    loader = new Loader(undefined, { class: 'app-route-loader', containerSelector: '#' + MOUNT_ID })
  }
  return loader
}

function clearTimers() {
  if (watchTimer) { clearInterval(watchTimer); watchTimer = null }
  if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null }
}

/**
 * Show the overlay and keep it up until the route has rendered AND been styled
 * (a direct child of #root has layout height), or the safety cap elapses.
 */
export function showRouteLoader() {
  try {
    getLoader().enable()
    clearTimers()
    watchTimer = setInterval(() => {
      try {
        // Hide once the actual route section is rendered AND styled (offsetHeight
        // > 0, i.e. route.css applied). Target `.nofbiz__route` specifically so
        // the background <img> that index.js appends to #root does not count as
        // "content" and hide the loader before the route is up.
        const section = document.querySelector('#root .nofbiz__route')
        if (section && section.offsetHeight > 0) hideRouteLoader()
      } catch (err) {
        console.warn('[route-loader] watch tick failed', err)
      }
    }, POLL_MS)
    safetyTimer = setTimeout(() => {
      console.warn('[route-loader] safety timeout reached - hiding loader to avoid a stuck overlay')
      hideRouteLoader()
    }, SAFETY_MS)
  } catch (err) {
    console.error('[route-loader] failed to show loader', err)
  }
}

export function hideRouteLoader() {
  try {
    clearTimers()
    if (loader) loader.disable()
  } catch (err) {
    console.error('[route-loader] failed to hide loader', err)
  }
}
