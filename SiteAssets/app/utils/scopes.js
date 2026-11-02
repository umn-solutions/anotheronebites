import { LIST_SCOPES, P4P_SCOPE_TITLE } from './constants.js'

/**
 * Load all active scopes from the Scopes list.
 * Each returned item includes Id, Title, Members (UserIdentity[]), IsActive, and odata.etag.
 * ListApi auto-parses Members from JSON to array on read.
 * @param {object} siteApi - SiteApi instance
 * @returns {Promise<object[]>} Active scope items
 */
export async function loadScopes(siteApi) {
  const items = await siteApi.list(LIST_SCOPES).getItems()
  return items.filter(s => s.IsActive === true || s.IsActive === 'true')
}

/**
 * Derive a string[] of scope names for use as ComboBox dataset.
 * @param {object[]} scopeItems - Items returned by loadScopes()
 * @returns {string[]}
 */
export function getScopeOptions(scopeItems) {
  return scopeItems.map(s => s.Title)
}

/**
 * Return the raw UserIdentity members of the P4P scope.
 * Returns an empty array if the P4P scope row is missing or has no members.
 * @param {object[]} scopeItems - Items returned by loadScopes()
 * @returns {Array<{ email: string, displayName: string }>}
 */
export function getP4PMembers(scopeItems) {
  const p4p = (scopeItems || []).find(s => s.Title === P4P_SCOPE_TITLE)
  if (!p4p) return []
  return Array.isArray(p4p.Members) ? p4p.Members.filter(m => m && m.email && m.displayName) : []
}

/**
 * Return ComboBox-compatible options for the P4P scope members.
 * Shape: `{ label: displayName, value: { email, displayName } }`
 * @param {object[]} scopeItems - Items returned by loadScopes()
 * @returns {Array<{ label: string, value: { email: string, displayName: string } }>}
 */
export function getP4PMemberOptions(scopeItems) {
  return getP4PMembers(scopeItems).map(m => ({ label: m.displayName, value: { email: m.email, displayName: m.displayName } }))
}

/**
 * Check if the given user is a member of the P4P scope.
 * Email comparison is case-insensitive.
 * @param {object[]} scopeItems - Items returned by loadScopes()
 * @param {string} userEmail
 * @returns {boolean}
 */
export function isP4PMember(scopeItems, userEmail) {
  const email = (userEmail || '').toLowerCase()
  return getP4PMembers(scopeItems).some(m => m.email.toLowerCase() === email)
}

/**
 * Return the default PMScope ComboBox option for the given user.
 *
 * Priority:
 * 1. If the user is a member of the P4P scope, return P4P regardless of its list Id.
 * 2. Otherwise, return the user's earliest scope by ascending list Id.
 * 3. Return null when the user is not a member of any active scope.
 *
 * Email comparison is case-insensitive. Callers should pass the output of
 * loadScopes() so only active scope rows are considered.
 *
 * @param {object[]} scopeItems - Items returned by loadScopes() (active scopes only)
 * @param {string} userEmail
 * @returns {{ label: string, value: string }|null}
 */
export function getDefaultUserScope(scopeItems, userEmail) {
  // P4P always takes priority regardless of its list Id
  if (isP4PMember(scopeItems, userEmail)) {
    return { label: P4P_SCOPE_TITLE, value: P4P_SCOPE_TITLE }
  }
  // Fall back to the user's earliest scope by list Id
  const email = (userEmail || '').toLowerCase()
  const sorted = [...(scopeItems || [])].sort((a, b) => (a.Id || 0) - (b.Id || 0))
  const match = sorted.find(scope => {
    const members = Array.isArray(scope.Members) ? scope.Members : []
    return members.some(m => m && (m.email || '').toLowerCase() === email)
  })
  return match ? { label: match.Title, value: match.Title } : null
}
