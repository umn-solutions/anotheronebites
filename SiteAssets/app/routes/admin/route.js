import {
  defineRoute, ViewSwitcher, View, Container, Text, Card, LinkButton, Button, SiteApi, SystemError, CurrentUser, Toast
} from '../../libs/nofbiz/nofbiz.base.js'
import { exportSiteDataToExcel } from '../../utils/export-excel.js'
import { LIST_DEFINITIONS, LIST_SCOPES } from '../../utils/constants.js'
import { getPlatformMemberOptions } from '../../utils/members.js'
import { createDefinitionsTab } from './utils/definitions-tab.js'
import { createTeamTab } from './utils/team-tab.js'
import { createScopesTab } from './utils/scopes-tab.js'

export default defineRoute(async (config) => {
  config.setRouteTitle('Admin Area')

  if (new CurrentUser().accessLevel !== 'ADMIN') {
    throw new SystemError('AccessDenied', 'Admin access required', { breaksFlow: true })
  }

  const CATEGORY_MAP = [
    ['ProjectTypes', 'Project Types'],
    ['TechProjects', 'Tech Projects'],
    ['TechPhases', 'Tech Phases'],
    ['ProjectStatuses', 'Project Statuses'],
    ['BusinessLines', 'Business Lines'],
    ['TargetTypes', 'Target Types'],
    ['TargetValueTypes', 'Target Value Types'],
  ]

  const siteApi = new SiteApi()
  const listApi = siteApi.list(LIST_DEFINITIONS)
  const scopesListApi = siteApi.list(LIST_SCOPES)
  const [initialItems, pmGroupMembers, scopeItems, memberOptions] = await Promise.all([
    listApi.getItems(),
    siteApi.getGroupUsers('ProjectManagers'),
    scopesListApi.getItems(),
    getPlatformMemberOptions(siteApi),
  ])

  const { tabGroup: definitionsTabGroup } = createDefinitionsTab({
    listApi,
    initialItems,
    categoryMap: CATEGORY_MAP,
  })

  const teamView = await createTeamTab({ siteApi, pmGroupMembers })
  const scopesView = createScopesTab({ listApi: scopesListApi, scopeItems, memberOptions })

  // ------------------------------------------------------------------
  // Sidebar Navigation
  // ------------------------------------------------------------------

  const NAV_ITEMS = [
    { key: 'definitions', label: 'Definitions' },
    { key: 'team', label: 'Capacity Tracker' },
    { key: 'scopes', label: 'Scopes' },
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
      ['scopes', scopesView],
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

  const exportBtn = new Button('Export to Excel', {
    variant: 'primary',
    class: 'app-btn-primary',
    onClickHandler: async () => {
      exportBtn.isLoading = true
      const loading = Toast.loading('Exporting site data...')
      try {
        await exportSiteDataToExcel(siteApi)
        loading.success('Export ready')
      } catch (err) {
        console.error('[Admin export] failed', err)
        loading.error('Export failed')
      } finally {
        exportBtn.isLoading = false
      }
    },
  })

  const pageHeader = new Card([
    new Container([
      new Text('Admin Area', { type: 'h2' }),
      new Container([
        new LinkButton('Back to Home', '/', { variant: 'secondary' }),
        exportBtn,
      ], { class: 'app-detail-header-actions' }),
    ], { class: 'app-detail-header' }),
  ], { class: 'app-detail-header-card' })

  return [pageHeader, layoutContainer]
})
