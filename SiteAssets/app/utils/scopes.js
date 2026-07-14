import { LIST_SCOPES } from './constants.js'

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
