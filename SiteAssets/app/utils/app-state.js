import { CurrentUser, SiteApi } from '../libs/nofbiz/nofbiz.base.js'
import { GROUP_HIERARCHY } from './constants.js'

let _siteApi = null

export async function initAppState() {
  await new CurrentUser().initialize(GROUP_HIERARCHY)
  _siteApi = new SiteApi()
  return { siteApi: _siteApi }
}

export function getAppSiteApi() {
  return _siteApi
}
