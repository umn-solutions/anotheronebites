import { LIST_PROJECT_ACCESS } from './constants.js'
import { loadScopes } from './scopes.js'

// Permission matrix: which effective roles can perform which actions
const PERMISSION_MAP = {
  owner:        { view: true, edit: true, addUpdate: true, close: true, delegate: true, changeAccessLevel: true },
  contributing: { view: true, edit: true, addUpdate: true, close: false, delegate: false, changeAccessLevel: false },
  reader:       { view: true, edit: false, addUpdate: false, close: false, delegate: false, changeAccessLevel: false },
}

/**
 * Resolve the effective role a user has on a project.
 *
 * Priority order (evaluated in strict sequence):
 * 1. ADMIN group -> 'owner'
 * 2. Direct member: PMMembersEmail includes user OR SubmittedByEmail === user
 *    OR ProjectManagerEmail === user (the designated PM owns the project) -> 'owner'
 * 3. Delegation on this project: Contributing -> 'contributing'; Read -> 'reader'
 *    (checked BEFORE AccessLevel blocks so delegation overrides Confidential/Internal)
 * 4. Confidential -> null
 * 5. Internal -> null
 * 6. NoRestriction: has PMScope -> scope member ? 'reader' : null; no PMScope -> 'reader'
 * 7. else -> null
 *
 * @param {object} project - Project record with AccessLevel, PMMembersEmail, SubmittedByEmail
 * @param {string} userEmail - Current user's email
 * @param {'ADMIN'|'USER'|null} siteAccessLevel - User's group label
 * @param {object[]} delegations - ProjectAccess records for this project (filtered by ProjectUUID)
 * @param {Set<string>} [userScopes] - PMScope values the user belongs to
 * @returns {'owner'|'contributing'|'reader'|null}
 */
export function resolveEffectiveRole(project, userEmail, siteAccessLevel, delegations, userScopes = new Set()) {
  // 1. Admin always gets owner
  if (siteAccessLevel === 'ADMIN') return 'owner'

  // 2. Direct member: PMMembers, SubmittedBy, or the designated Project Manager -> owner
  const email = userEmail.toLowerCase()
  const pmMemberEmails = (project.PMMembersEmail || '').split(';').map(s => s.trim().toLowerCase()).filter(Boolean)
  const projectManagerEmail = (project.ProjectManagerEmail || '').trim().toLowerCase()
  if (
    pmMemberEmails.includes(email) ||
    (project.SubmittedByEmail && project.SubmittedByEmail.toLowerCase() === email) ||
    (projectManagerEmail && projectManagerEmail === email)
  ) {
    return 'owner'
  }

  // 3. Delegations (evaluated before AccessLevel blocks — delegation overrides Confidential/Internal)
  const userDelegations = delegations.filter(
    d => d.UserEmail && d.UserEmail.toLowerCase() === email
  )
  if (userDelegations.some(d => d.AccessType === 'Contributing')) return 'contributing'
  if (userDelegations.some(d => d.AccessType === 'Read')) return 'reader'

  // 4. Confidential blocks all remaining non-delegates
  if (project.AccessLevel === 'Confidential') return null

  // 5. Internal blocks all remaining non-delegates
  if (project.AccessLevel === 'Internal') return null

  // 6. NoRestriction: scope gates visibility when the project has a PMScope tag
  if (project.AccessLevel === 'NoRestriction') {
    const projectHasScope = !!(project.PMScope && String(project.PMScope).trim())
    if (projectHasScope) {
      return userScopes.has(project.PMScope) ? 'reader' : null
    }
    return 'reader'
  }

  return null
}

/**
 * Check if an effective role can perform a specific action.
 * @param {'owner'|'contributing'|'reader'|null} effectiveRole
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
 * Shared predicate for proposals and programs (scope-only access model).
 * ADMIN sees all. For non-admins, each item is kept when:
 *   - `publicWhenUnscoped = true`  AND the item has no PMScope set  -> public (everyone)
 *   - `publicWhenUnscoped = false` AND the item has no PMScope set  -> creator + ADMIN only
 *   - Item has a PMScope set -> kept if the user belongs to that scope OR is the creator
 *
 * Programs use `publicWhenUnscoped = true` (untagged programs are visible to all).
 * Proposals use `publicWhenUnscoped = false` (untagged proposals are creator+ADMIN only).
 *
 * @param {object[]} items
 * @param {string} userEmail
 * @param {'ADMIN'|'USER'|null} siteAccessLevel
 * @param {Set<string>} [userScopes]
 * @param {boolean} [publicWhenUnscoped] - true for programs, false for proposals
 * @returns {object[]}
 */
export function filterByScopeOrCreator(items, userEmail, siteAccessLevel, userScopes = new Set(), publicWhenUnscoped = false) {
  if (siteAccessLevel === 'ADMIN') return items
  const email = userEmail.toLowerCase()
  return items.filter(item => {
    const hasScope = !!(item.PMScope && String(item.PMScope).trim())
    const isCreator = !!(item.SubmittedByEmail && item.SubmittedByEmail.toLowerCase() === email)
    if (!hasScope) return publicWhenUnscoped || isCreator
    return userScopes.has(item.PMScope) || isCreator
  })
}

/**
 * Single-item visibility check (DRY helper for detail routes).
 * Returns true if the item would survive `filterByScopeOrCreator` for this user.
 *
 * Use `publicWhenUnscoped = true` for programs, `false` for proposals.
 *
 * @param {object} item
 * @param {string} userEmail
 * @param {'ADMIN'|'USER'|null} siteAccessLevel
 * @param {Set<string>} [userScopes]
 * @param {boolean} [publicWhenUnscoped]
 * @returns {boolean}
 */
export function isScopeOrCreatorVisible(item, userEmail, siteAccessLevel, userScopes = new Set(), publicWhenUnscoped = false) {
  return filterByScopeOrCreator([item], userEmail, siteAccessLevel, userScopes, publicWhenUnscoped).length === 1
}

/**
 * Filter proposals by user access (publicWhenUnscoped = false).
 * Proposals without a PMScope are visible to the creator and ADMIN only.
 *
 * @param {object[]} proposals
 * @param {string} userEmail
 * @param {'ADMIN'|'USER'|null} siteAccessLevel
 * @param {Set<string>} [userScopes]
 * @returns {object[]}
 */
export function filterProposalsByAccess(proposals, userEmail, siteAccessLevel, userScopes = new Set()) {
  return filterByScopeOrCreator(proposals, userEmail, siteAccessLevel, userScopes, false)
}

/**
 * Filter programs by user access (publicWhenUnscoped = true).
 * Programs without a PMScope are visible to all users.
 *
 * @param {object[]} programs
 * @param {string} userEmail
 * @param {'ADMIN'|'USER'|null} siteAccessLevel
 * @param {Set<string>} [userScopes]
 * @returns {object[]}
 */
export function filterProgramsByAccess(programs, userEmail, siteAccessLevel, userScopes = new Set()) {
  return filterByScopeOrCreator(programs, userEmail, siteAccessLevel, userScopes, true)
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
  } catch (err) {
    console.error('[fetchUserDelegations] failed', err)
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
  } catch (err) {
    console.error('[fetchAllDelegations] failed', err)
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
  } catch (err) {
    console.error('[fetchUserScopes] failed', err)
    return new Set()
  }
}
