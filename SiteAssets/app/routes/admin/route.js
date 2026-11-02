import {
  defineRoute, ViewSwitcher, View, Container, Text, Card, LinkButton, Button, SiteApi, SystemError, CurrentUser, Toast
} from '../../libs/nofbiz/nofbiz.base.js'
import { exportSiteDataToExcel } from '../../utils/export-excel.js'
import { LIST_DEFINITIONS, LIST_SCOPES, P4P_SCOPE_TITLE } from '../../utils/constants.js'
import { getPlatformMemberOptions } from '../../utils/members.js'
import { getP4PMembers } from '../../utils/scopes.js'
import { createDefinitionsTab } from './utils/definitions-tab.js'
import { createTeamTab } from './utils/team-tab.js'
import { createScopesTab } from './utils/scopes-tab.js'

export default defineRoute(async (config) => {
  config.setRouteTitle('Admin Area')

  if (new CurrentUser().accessLevel !== 'ADMIN') {
    throw new SystemError('AccessDenied', 'Admin access required', { breaksFlow: true })
  }

  const CATEGORY_MAP = [
    ['ProjectTypes', 'Categories'],
    ['SubCategories', 'Sub Categories'],
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
  const [initialItems, scopeItems, memberOptions] = await Promise.all([
    listApi.getItems(),
    scopesListApi.getItems(),
    getPlatformMemberOptions(siteApi),
  ])

  // ------------------------------------------------------------------
  // Ensure P4P scope exists (idempotent). P4P is the allocation pool
  // and must always be active. Admins have write access so this is safe here.
  // ------------------------------------------------------------------

  const p4pRow = scopeItems.find(s => s.Title === P4P_SCOPE_TITLE)
  if (!p4pRow) {
    try {
      await scopesListApi.createItem({ Title: P4P_SCOPE_TITLE, IsActive: 'true', Members: [] })
    } catch (err) {
      console.error('[Admin] Failed to create P4P scope', err)
      Toast.error('Could not create the P4P scope. Please reload.')
    }
  } else if (p4pRow.IsActive === false || p4pRow.IsActive === 'false') {
    try {
      await scopesListApi.updateItem(p4pRow.Id, { IsActive: 'true' }, p4pRow['odata.etag'])
    } catch (err) {
      console.error('[Admin] Failed to re-enable P4P scope', err)
      Toast.error('Could not re-enable the P4P scope. Please reload.')
    }
  }

  // p4pMembers: UserIdentity[] from the P4P scope (allocation pool)
  const p4pMembers = getP4PMembers(scopeItems)

  const { tabGroup: definitionsTabGroup } = createDefinitionsTab({
    listApi,
    initialItems,
    categoryMap: CATEGORY_MAP,
  })

  const teamView = await createTeamTab({ siteApi, p4pMembers })
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
