import { LIST_PROJECTS, LIST_PROGRAMS } from './constants.js'
import {
  filterProjectsByAccess,
  filterProgramsByAccess,
  fetchAllDelegations,
  fetchUserScopes,
} from './access-control.js'

/**
 * Build the umbrella ancestor options list for a form picker.
 *
 * Fetches programs and projects, applies scope-based access filtering,
 * and returns a combined options array (programs first, then projects).
 *
 * The "None -- top level" sentinel is NOT included; callers that need it
 * should prepend it themselves.
 *
 * @param {object} siteApi - SiteApi instance
 * @param {object} user - CurrentUser instance (must be initialized)
 * @param {{ excludeUuid?: string }} [opts]
 * @returns {Promise<Array<{ label: string, value: string }>>}
 */
export async function buildUmbrellaOptions(siteApi, user, { excludeUuid } = {}) {
  try {
    const userEmail = user.get('email')
    const siteAccessLevel = user.accessLevel

    const [allPrograms, allProjects, delegations, userScopes] = await Promise.all([
      siteApi.list(LIST_PROGRAMS).getItems(),
      siteApi.list(LIST_PROJECTS).getItems(),
      fetchAllDelegations(siteApi),
      fetchUserScopes(siteApi, userEmail),
    ])

    const visiblePrograms = filterProgramsByAccess(allPrograms, userEmail, siteAccessLevel, userScopes)
    const visibleProjects = filterProjectsByAccess(allProjects, userEmail, siteAccessLevel, delegations, userScopes)

    const programOptions = visiblePrograms
      .filter(p => !excludeUuid || p.UUID !== excludeUuid)
      .map(p => ({ label: '[Program] ' + p.Title, value: p.UUID }))

    const projectOptions = visibleProjects
      .filter(p => !excludeUuid || p.UUID !== excludeUuid)
      .map(p => ({ label: '[Project] ' + p.Title, value: p.UUID }))

    return [...programOptions, ...projectOptions]
  } catch (err) {
    console.error('[buildUmbrellaOptions] failed to build umbrella options', err)
    return []
  }
}
