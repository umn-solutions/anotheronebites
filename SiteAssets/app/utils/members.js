/**
 * Platform member options utility.
 *
 * Builds a merged, deduplicated list of ComboBox-compatible options from the
 * Users and Admins SharePoint groups. Used by the scope member picker so only
 * people who are already platform members can be added to a scope.
 */

/**
 * Fetch Users + Admins group members, merge and deduplicate by email (case-insensitive),
 * and return as ComboBox option objects `{ label, value: { email, displayName } }`.
 *
 * Fails soft: if either group fetch throws, logs a warning and uses an empty list
 * for that group so the other group's members still appear.
 *
 * @param {object} siteApi - SiteApi instance
 * @returns {Promise<Array<{ label: string, value: { email: string, displayName: string } }>>}
 */
export async function getPlatformMemberOptions(siteApi) {
  const [usersGroupMembers, adminsGroupMembers] = await Promise.all([
    siteApi.getGroupUsers('Users').catch(err => { console.warn('[getPlatformMemberOptions] Failed to fetch Users group', err); return [] }),
    siteApi.getGroupUsers('Admins').catch(err => { console.warn('[getPlatformMemberOptions] Failed to fetch Admins group', err); return [] }),
  ])

  const seen = new Set()
  return [...usersGroupMembers, ...adminsGroupMembers]
    .filter(m => {
      if (!m.Email) return false
      const key = m.Email.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map(m => ({ label: m.Title, value: { email: m.Email, displayName: m.Title } }))
}
