import {
  defineRoute, ViewSwitcher, View, Container, Text, Card, LinkButton, Button, SiteApi, StyleResource, SystemError
} from '../../libs/nofbiz/nofbiz.base.js'
import { LIST_DEFINITIONS, APP_PERMISSIONS } from '../../utils/constants.js'
import { getAppRoles } from '../../utils/app-state.js'
import { createDefinitionsTab } from './utils/definitions-tab.js'
import { createTeamTab } from './utils/team-tab.js'

export default defineRoute(async (config) => {
  config.setRouteTitle('Admin Area')

  const roles = getAppRoles()
  if (!roles.canAccess('adminArea', APP_PERMISSIONS)) {
    throw new SystemError('AccessDenied', 'Admin access required', { breaksFlow: true })
  }

  const routeStyles = new StyleResource('./route.css')

  const CATEGORY_MAP = [
    ['ProjectTypes', 'Project Types'],
    ['TechProjects', 'Tech Projects'],
    ['TechPhases', 'Tech Phases'],
    ['ProjectStatuses', 'Project Statuses'],
    ['BusinessLines', 'Business Lines'],
    ['TargetTypes', 'Target Types'],
    ['TargetValueTypes', 'Target Value Types'],
    ['PMScope', 'PM Scope'],
  ]

  const siteApi = new SiteApi()
  const listApi = siteApi.list(LIST_DEFINITIONS)
  const [initialItems, pmGroupMembers] = await Promise.all([
    listApi.getItems(),
    siteApi.getGroupUsers('ProjectManagers'),
  ])

  const { tabGroup: definitionsTabGroup } = createDefinitionsTab({
    listApi,
    initialItems,
    categoryMap: CATEGORY_MAP,
  })

  const teamView = await createTeamTab({ siteApi, pmGroupMembers })

  // ------------------------------------------------------------------
  // Sidebar Navigation
  // ------------------------------------------------------------------

  const NAV_ITEMS = [
    { key: 'definitions', label: 'Definitions' },
    { key: 'team', label: 'Capacity Tracker' },
  ]

  const navContainers = new Map()

  function setActiveNav(activeKey) {
    for (const [key, container] of navContainers) {
      if (key === activeKey) {
        container.instance?.addClass('app-admin-nav-item--active')
      } else {
        container.instance?.removeClass('app-admin-nav-item--active')
      }
    }
  }

  const navItems = NAV_ITEMS.map(({ key, label }) => {
    const btn = new Button(label, { variant: 'ghost', class: 'app-admin-nav-btn' })
    btn.setEventHandler('click', () => adminSwitcher.setView(key))
    const item = new Container([btn], { class: 'app-admin-nav-item' })
    navContainers.set(key, item)
    return item
  })

  const sidebar = new Container(navItems, { class: 'app-dashboard-sidebar' })

  // ------------------------------------------------------------------
  // ViewSwitcher
  // ------------------------------------------------------------------

  const switcherTarget = new Container([], { id: 'admin-switcher-target' })

  const adminSwitcher = new ViewSwitcher(
    [
      ['definitions', new View([definitionsTabGroup])],
      ['team', teamView],
    ],
    {
      containerSelector: '#admin-switcher-target',
      onRefreshHandler: (activeViewName) => setActiveNav(activeViewName),
    }
  )

  const contentArea = new Container([switcherTarget, adminSwitcher], { class: 'app-admin-content' })

  // ------------------------------------------------------------------
  // Layout
  // ------------------------------------------------------------------

  const layoutContainer = new Container([sidebar, contentArea], { class: 'app-dashboard-layout' })

  const pageHeader = new Card([
    new Container([
      new Text('Admin Area', { type: 'h2' }),
      new LinkButton('Back to Home', '/', { variant: 'secondary' }),
    ], { class: 'app-detail-header' }),
  ], { class: 'app-detail-header-card' })

  return [pageHeader, layoutContainer]
})
