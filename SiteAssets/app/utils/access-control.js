import { LIST_PROJECT_ACCESS } from './constants.js'
import { loadScopes } from './scopes.js'

// Permission matrix: which effective roles can perform which actions
const PERMISSION_MAP = {
  owner:        { view: true, edit: true, addUpdate: true, close: true, delegate: true, changeAccessLevel: true },
  manager:      { view: true, edit: true, addUpdate: true, close: true, delegate: true, changeAccessLevel: true },
  contributing: { view: true, edit: true, addUpdate: true, close: false, delegate: false, changeAccessLevel: false },
  reader:       { view: true, edit: false, addUpdate: false, close: false, delegate: false, changeAccessLevel: false },
}

/**
 * Resolve the effective role a user has on a project.
 *
 * Priority order:
 * 1. ADMIN group -> 'owner'
 * 2. Confidential + not ADMIN -> null (blocked)
 * 3. PMMembers or SubmittedBy -> 'owner'
 * 4. PROJECT_MANAGER group -> 'manager'
 * 5. Contributing delegation -> 'contributing'
 * 6. Read delegation -> 'reader'
 * 7. Scope membership (project PMScope in userScopes) -> 'reader' (additive, not on Confidential)
 * 8. Internal + no prior match -> null
 * 9. NoRestriction -> 'reader'
 *
 * @param {object} project - Project record with AccessLevel, PMMembersEmail, SubmittedByEmail
 * @param {string} userEmail - Current user's email
 * @param {string} siteAccessLevel - User's group label ('ADMIN', 'PROJECT_MANAGER', 'COLLABORATOR')
 * @param {object[]} delegations - ProjectAccess records for this project (filtered by ProjectUUID)
 * @param {Set<string>} [userScopes] - PMScope values the user belongs to (additive grant only)
 * @returns {'owner'|'manager'|'contributing'|'reader'|null}
 */
export function resolveEffectiveRole(project, userEmail, siteAccessLevel, delegations, userScopes = new Set()) {
  // 1. Admin always gets owner
  if (siteAccessLevel === 'ADMIN') return 'owner'

  // 2. Confidential blocks non-admins
  if (project.AccessLevel === 'Confidential') return null

  // 3. PMMembers or SubmittedBy -> owner
  const email = userEmail.toLowerCase()
  const pmMemberEmails = (project.PMMembersEmail || '').split(';').map(s => s.trim().toLowerCase()).filter(Boolean)
  if (
    pmMemberEmails.includes(email) ||
    (project.SubmittedByEmail && project.SubmittedByEmail.toLowerCase() === email)
  ) {
    return 'owner'
  }

  // 4. PROJECT_MANAGER group -> manager
  if (siteAccessLevel === 'PROJECT_MANAGER') return 'manager'

  // 5-6. Check delegations for this user on this project
  const userDelegations = delegations.filter(
    d => d.UserEmail && d.UserEmail.toLowerCase() === email
  )

  if (userDelegations.some(d => d.AccessType === 'Contributing')) return 'contributing'
  if (userDelegations.some(d => d.AccessType === 'Read')) return 'reader'

  // 7. Scope-based grant: project PMScope membership adds reader access
  // Confidential already returned null at step 2 -- scope does not override it
  if (project.PMScope && userScopes.has(project.PMScope)) return 'reader'

  // 8. Internal with no match -> null
  if (project.AccessLevel === 'Internal') return null

  // 9. NoRestriction -> reader
  if (project.AccessLevel === 'NoRestriction') return 'reader'

  return null
}

/**
 * Check if an effective role can perform a specific action.
 * @param {'owner'|'manager'|'contributing'|'reader'|null} effectiveRole
 * @param {string} action - Key from PROJECT_ACTIONS
 * @returns {boolean}
 */
export function canPerformAction(effectiveRole, action) {
  if (!effectiveRole) return false
  const perms = PERMISSION_MAP[effectiveRole]
  return perms ? !!perms[action] : false
}

/**
 * Filter projects by user access. Returns only projects the user can view.
 * @param {object[]} projects - All project records
 * @param {string} userEmail - Current user's email
 * @param {string} siteAccessLevel - User's group label
 * @param {object[]} allDelegations - All ProjectAccess records
 * @param {Set<string>} [userScopes] - PMScope values the user belongs to (additive grant)
 * @returns {object[]}
 */
export function filterProjectsByAccess(projects, userEmail, siteAccessLevel, allDelegations, userScopes = new Set()) {
  return projects.filter(project => {
    const projectDelegations = allDelegations.filter(
      d => d.ProjectUUID === project.UUID
    )
    const role = resolveEffectiveRole(project, userEmail, siteAccessLevel, projectDelegations, userScopes)
    return role !== null
  })
}

/**
 * Filter proposals by user access.
 * Proposals are Internal: visible to ADMIN, PROJECT_MANAGER, and SubmittedBy only.
 * @param {object[]} proposals
 * @param {string} userEmail
 * @param {string} siteAccessLevel
 * @returns {object[]}
 */
export function filterProposalsByAccess(proposals, userEmail, siteAccessLevel) {
  if (siteAccessLevel === 'ADMIN' || siteAccessLevel === 'PROJECT_MANAGER') return proposals
  const email = userEmail.toLowerCase()
  return proposals.filter(p =>
    p.SubmittedByEmail && p.SubmittedByEmail.toLowerCase() === email
  )
}

/**
 * Fetch delegation records for a specific user from the ProjectAccess list.
 * @param {object} siteApi - SiteApi instance
 * @param {string} userEmail - User email to query
 * @returns {Promise<object[]>}
 */
export async function fetchUserDelegations(siteApi, userEmail) {
  const listApi = siteApi.list(LIST_PROJECT_ACCESS)
  try {
    const items = await listApi.getItems({ UserEmail: userEmail })
    return items
  } catch {
    return []
  }
}

/**
 * Fetch all delegation records (for admin/filtering scenarios).
 * @param {object} siteApi - SiteApi instance
 * @returns {Promise<object[]>}
 */
export async function fetchAllDelegations(siteApi) {
  const listApi = siteApi.list(LIST_PROJECT_ACCESS)
  try {
    const items = await listApi.getItems()
    return items
  } catch {
    return []
  }
}

/**
 * Fetch the set of PMScope names that include the given user as a member.
 * Reads the Scopes list, checks each active scope's Members array for the
 * user's email (case-insensitive). Returns an empty Set on any error
 * (fail-open -- grants nothing on failure).
 * @param {object} siteApi - SiteApi instance
 * @param {string} userEmail - Email of the current user
 * @returns {Promise<Set<string>>}
 */
export async function fetchUserScopes(siteApi, userEmail) {
  try {
    const activeScopes = await loadScopes(siteApi)
    const email = (userEmail || '').toLowerCase()
    const scopeNames = new Set()

    for (const scope of activeScopes) {
      const members = Array.isArray(scope.Members) ? scope.Members : []
      const isMember = members.some(m => {
        if (!m || typeof m !== 'object') return false
        return (m.email || '').toLowerCase() === email
      })
      if (isMember) {
        scopeNames.add(scope.Title)
      }
    }

    return scopeNames
  } catch {
    return new Set()
  }
}
