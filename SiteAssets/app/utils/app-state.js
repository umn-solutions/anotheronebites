import { CurrentUser, RoleManager, SiteApi } from '../libs/nofbiz/nofbiz.base.js'
import { GROUP_HIERARCHY, LIST_USER_ROLES } from './constants.js'

let _roles = null
let _siteApi = null

export async function initAppState() {
  await new CurrentUser().initialize(GROUP_HIERARCHY)
  _roles = new RoleManager()
  await _roles.load(LIST_USER_ROLES)
  _siteApi = new SiteApi()
  return { roles: _roles, siteApi: _siteApi }
}

export function getAppRoles() {
  return _roles
}

export function getAppSiteApi() {
  return _siteApi
}
