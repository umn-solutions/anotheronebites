/**
 * App Header — global persistent chrome (64px, sticky top).
 *
 * Renders into a dedicated <div id="app-header-mount"> prepended to #root
 * before the Router outlet. Re-renders on every NavigationEvent via the
 * listener registered in index.js.
 *
 * Public API:
 *   initAppHeader()    — call once in index.js before new Router(). Mounts
 *                         the header element and registers the nav listener.
 *   updateAppHeader(to, query) — called by the NavigationEvent listener to
 *                         rebuild header content for the new route.
 *
 * Header variants:
 *   Home ("/")         — logo + right: "Admin Area" (secondary) + "Create..." (primary)
 *   Detail screens     — logo + breadcrumb (Home / Section / Record) + right: "Back to Home"
 *
 * The breadcrumb "section" and "crumb" labels are derived from the route path:
 *   "projects/detail"  -> Section: "Projects", Crumb: from query param 'title' or UUID
 *   "programs/detail"  -> Section: "Programs"
 *   "proposals/detail" -> Section: "Proposals"
 *   "projects/new"     -> Section: "Projects", Crumb: "New project"
 *   "programs/new"     -> Section: "Programs", Crumb: "New program"
 *   "proposals/new"    -> Section: "Proposals", Crumb: "New proposal"
 *   "admin"            -> Section: "Admin", Crumb: "Admin Area"
 *
 * Title for detail routes: config.setRouteTitle() updates document.title, which
 * the header reads after the NavigationEvent fires (route is fully rendered by
 * then). Strip the page-title suffix (e.g. " | Management Platform") to get the
 * record name for the last breadcrumb crumb.
 *
 * Lifecycle: the NavigationEvent listener is registered once in index.js and
 * never removed (app lifetime). The header inner DOM is replaced on every nav
 * via a simple innerHTML swap — the header mount element is not a SPARC component
 * and does not participate in the Router outlet's component tree, avoiding any
 * lifecycle collision.
 */

import {
  Router,
  CurrentUser,
} from '../libs/nofbiz/nofbiz.base.js'
import { APP_NAME } from './constants.js'

const MOUNT_ID = 'app-header-mount'

// ------------------------------------------------------------------
// Helpers: derive breadcrumb from route path
// ------------------------------------------------------------------

const SECTION_LABELS = {
  'projects': 'Projects',
  'programs': 'Programs',
  'proposals': 'Proposals',
  'admin': 'Admin',
}

// null = dynamic crumb read from document.title after route renders
const CRUMB_LABELS = {
  'projects/new': 'New project',
  'projects/detail': null,
  'programs/new': 'New program',
  'programs/detail': null,
  'proposals/new': 'New proposal',
  'proposals/detail': null,
  'admin': 'Admin Area',
}

function parseRoute(to) {
  // to is e.g. "/", "projects/detail", "projects/new", "admin"
  const path = to === '/' ? '' : to
  const parts = path.split('/')
  const group = parts[0] || ''       // "projects" | "programs" | "proposals" | "admin" | ""
  const segment = parts[1] || ''     // "detail" | "new" | ""
  const routeKey = segment ? `${group}/${segment}` : group

  return { group, segment, routeKey, isHome: to === '/' }
}

function getSection(group) {
  return SECTION_LABELS[group] || (group ? group.charAt(0).toUpperCase() + group.slice(1) : '')
}

function getCrumb(routeKey) {
  if (routeKey in CRUMB_LABELS) {
    return CRUMB_LABELS[routeKey]   // null means "read the record name from #root"
  }
  return null
}

// The record name for a detail-route breadcrumb crumb, read from the rendered
// record header inside the Router outlet. Returns null before the route paints.
function getDetailCrumbFromDom() {
  const el = document.querySelector('#root .app-record-header__title')
  const text = el && el.textContent ? el.textContent.trim() : ''
  return text || null
}

// ------------------------------------------------------------------
// HTML builder (no SPARC components — plain DOM)
// The header element is recreated on every nav; no listeners to clean up.
// ------------------------------------------------------------------

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function logoHTML() {
  const alt = escapeHtml(APP_NAME)
  return `<img class="app-header__logo" src="../SiteAssets/media/logo.png" alt="${alt}">`
}

function breadcrumbHTML(section, crumb) {
  const sectionEsc = escapeHtml(section)
  const crumbEsc = escapeHtml(crumb)
  const hasSection = Boolean(section)
  const hasCrumb = Boolean(crumb) && crumb !== section

  if (!hasSection) {
    // Should not happen but guard gracefully
    return `<span class="app-header__breadcrumb-current">Home</span>`
  }

  if (!hasCrumb) {
    return `
      <div class="app-header__breadcrumb">
        <a class="app-header__breadcrumb-link" data-nav-home>Home</a>
        <span class="app-header__breadcrumb-sep">/</span>
        <span class="app-header__breadcrumb-current">${sectionEsc}</span>
      </div>
    `
  }

  return `
    <div class="app-header__breadcrumb">
      <a class="app-header__breadcrumb-link" data-nav-home>Home</a>
      <span class="app-header__breadcrumb-sep">/</span>
      <span>${sectionEsc}</span>
      <span class="app-header__breadcrumb-sep">/</span>
      <span class="app-header__breadcrumb-current">${crumbEsc}</span>
    </div>
  `
}

function rightActionsHTML(isHome, user) {
  const isAdmin = user && user.accessLevel === 'ADMIN'

  if (isHome) {
    const adminBtn = isAdmin
      ? `<button class="app-header__btn app-btn-secondary nofbiz__button" data-nav="admin">Admin Area</button>`
      : ''
    return `
      ${adminBtn}
      <div class="app-header__create">
        <button class="app-header__btn app-btn-primary nofbiz__button" data-nav-create aria-haspopup="true" aria-expanded="false">Create&hellip;</button>
        <div class="app-header__create-menu" role="menu">
          <button class="app-header__create-item" data-nav="projects/new" role="menuitem">New project</button>
          <button class="app-header__create-item" data-nav="programs/new" role="menuitem">New program</button>
          <button class="app-header__create-item" data-nav="proposals/new" role="menuitem">New proposal</button>
        </div>
      </div>
    `
  }

  return `
    <button class="app-header__btn app-btn-secondary nofbiz__button" data-nav-home>Back to Home</button>
  `
}

function buildHeaderHTML(to) {
  const { group, routeKey, isHome } = parseRoute(to)
  const section = isHome ? '' : getSection(group)

  // Crumb: static routes use CRUMB_LABELS. Detail routes (null in the map) read
  // the record name straight from the rendered record header in #root — the
  // reliable source (document.title is not updated for these routes). When the
  // header renders before the async route paints, this is null and we show just
  // the section; the #root observer in initAppHeader re-renders once the title
  // lands.
  let crumb = null
  if (!isHome) {
    const staticCrumb = getCrumb(routeKey)
    crumb = staticCrumb === null ? getDetailCrumbFromDom() : staticCrumb
  }

  let user = null
  try {
    user = new CurrentUser()
  } catch (_) { /* CurrentUser may not be initialized yet on first load */ }

  const leftHTML = isHome
    ? logoHTML()
    : `${logoHTML()}${breadcrumbHTML(section, crumb)}`

  const rightHTML = rightActionsHTML(isHome, user)

  return `
    <header class="app-header" role="banner">
      <div class="app-header__left">
        ${leftHTML}
      </div>
      <div class="app-header__right">
        ${rightHTML}
      </div>
    </header>
  `
}

// ------------------------------------------------------------------
// Event wiring (click delegation on the mount node)
// ------------------------------------------------------------------

let _mountEl = null

function closeCreateMenu() {
  const wrap = _mountEl && _mountEl.querySelector('.app-header__create.is-open')
  if (!wrap) return
  wrap.classList.remove('is-open')
  const btn = wrap.querySelector('[data-nav-create]')
  if (btn) btn.setAttribute('aria-expanded', 'false')
}

function attachClickHandlers(mountEl) {
  mountEl.addEventListener('click', (e) => {
    // "Create…" button — toggle the dropdown menu
    const createBtn = e.target.closest('[data-nav-create]')
    if (createBtn) {
      e.preventDefault()
      const wrap = createBtn.closest('.app-header__create')
      if (wrap) {
        const open = wrap.classList.toggle('is-open')
        createBtn.setAttribute('aria-expanded', open ? 'true' : 'false')
      }
      return
    }

    // "Back to Home" and breadcrumb Home links
    if (e.target.closest('[data-nav-home]')) {
      e.preventDefault()
      Router.navigateTo('/')
      return
    }

    // data-nav buttons (Admin Area + the three Create menu items)
    const navEl = e.target.closest('[data-nav]')
    if (navEl) {
      e.preventDefault()
      closeCreateMenu()
      Router.navigateTo(navEl.dataset.nav)
      return
    }
  })

  // Close the Create menu on any click outside the header's create widget.
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.app-header__create')) closeCreateMenu()
  })
}

// ------------------------------------------------------------------
// Public API
// ------------------------------------------------------------------

/**
 * Mounts the header element above the Router outlet and registers the
 * NavigationEvent listener. Call once in index.js before new Router().
 */
export function initAppHeader() {
  // pageReset() has already run (called with await before us in index.js),
  // so document.body contains #root. We prepend the header mount before it
  // so the header sits above the Router outlet in the natural document flow.
  const rootEl = document.getElementById('root')

  let mountEl = document.getElementById(MOUNT_ID)
  if (!mountEl) {
    mountEl = document.createElement('div')
    mountEl.id = MOUNT_ID
    if (rootEl) {
      document.body.insertBefore(mountEl, rootEl)
    } else {
      // Fallback: prepend to body if #root is somehow absent
      document.body.prepend(mountEl)
    }
  }
  _mountEl = mountEl

  attachClickHandlers(mountEl)

  // Detail routes render asynchronously (after their data resolves), so the
  // record header title appears in #root AFTER the NavigationEvent that drives
  // updateAppHeader. Observe #root and re-render the header once the record name
  // lands (or clears), so the breadcrumb's last crumb reflects the real record.
  // Guarded on crumb change to avoid re-rendering on every unrelated mutation;
  // the header mount lives outside #root, so this never self-triggers.
  if (rootEl && typeof MutationObserver !== 'undefined') {
    let lastCrumb = null
    new MutationObserver(() => {
      const crumb = getDetailCrumbFromDom()
      if (crumb !== lastCrumb) {
        lastCrumb = crumb
        if (_mountEl) _mountEl.innerHTML = buildHeaderHTML(Router.location)
      }
    }).observe(rootEl, { childList: true, subtree: true, characterData: true })
  }

  // Render immediately for the initial route (Router has not yet run)
  updateAppHeader('/')
}

/**
 * Re-renders the header for the current route.
 * Called by the NavigationEvent listener in index.js after every navigation.
 *
 * @param {string} to - The route path navigated to (e.g. "projects/detail", "/")
 */
export function updateAppHeader(to) {
  if (!_mountEl) return
  _mountEl.innerHTML = buildHeaderHTML(to || Router.location)
}
