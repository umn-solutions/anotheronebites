import {
  defineRoute, TabGroup, View, Container, Text, LinkButton, Card, SiteApi, Router, SystemError, CurrentUser
} from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_PROJECTS, LIST_PROJECT_UPDATES, LIST_PROGRAMS, LIST_ALLOCATIONS } from '../../../utils/constants.js'
import { loadDefinitions } from '../../../utils/definitions.js'
import { createUpdatesTab } from '../utils/updates-tab.js'
import { createOverviewTab } from '../utils/overview-tab.js'
import { createEditTab } from '../utils/edit-tab.js'
import { createAccessTab } from '../utils/access-tab.js'
import { createCapacityTab } from '../utils/capacity-tab.js'
import { statusClass } from '../../../utils/project-card.js'
import { resolveEffectiveRole, filterProjectsByAccess, fetchAllDelegations, canPerformAction } from '../../../utils/access-control.js'
import { buildTreeData, renderTreeViz } from '../../../utils/tree-viz.js'

export default defineRoute(async (config) => {
  const siteApi = new SiteApi()
  const uuid = Router.queryParams.get('uuid')

  if (!uuid) {
    throw new SystemError('MissingUUID', 'No project UUID provided in query params')
  }

  // Fetch project, updates, programs, definitions, and delegations in parallel
  let [projects, updates, programs, defs, delegations, allocations, pmGroupMembers] = await Promise.all([
    siteApi.list(LIST_PROJECTS).getItemByUUID(uuid),
    siteApi.list(LIST_PROJECT_UPDATES).getItems({ ProjectUUID: uuid }),
    siteApi.list(LIST_PROGRAMS).getItems(),
    loadDefinitions(siteApi),
    fetchAllDelegations(siteApi),
    siteApi.list(LIST_ALLOCATIONS).getItems({ ProjectUUID: uuid }),
    siteApi.getGroupUsers('ProjectManagers'),
  ])

  const pmMemberOptions = pmGroupMembers.map(m => ({
    label: m.Title,
    value: { email: m.Email, displayName: m.Title },
  }))

  const project = projects[0]
  if (!project) {
    throw new SystemError('ProjectNotFound', `No project found for UUID: ${uuid}`)
  }

  // Resolve effective role and gate access
  const user = new CurrentUser()
  const projectDelegations = delegations.filter(d => d.ProjectUUID === uuid)
  const effectiveRole = resolveEffectiveRole(project, user.get('email'), user.accessLevel, projectDelegations)

  if (!effectiveRole) {
    throw new SystemError('AccessDenied', 'You do not have access to this project', { breaksFlow: true })
  }

  // Build umbrella options from programs and accessible projects only
  const allProjectsList = await siteApi.list(LIST_PROJECTS).getItems()
  const accessibleProjects = filterProjectsByAccess(allProjectsList, user.get('email'), user.accessLevel, delegations)
  const umbrellaOptions = [
    ...programs.map(p => ({ label: '[Program] ' + p.Title, value: p.UUID })),
    ...accessibleProjects.map(p => ({ label: '[Project] ' + p.Title, value: p.UUID }))
  ]

  // Dynamic page title from project name
  config.setRouteTitle(project.Title)

  // Dynamic definitions with hardcoded fallbacks
  const projectTypes = defs.get('ProjectTypes')
  const techProjects = defs.get('TechProjects')
  const techPhases = defs.get('TechPhases')
  const projectStatuses = defs.get('ProjectStatuses')
  const businessLines = defs.get('BusinessLines')
  const targetTypes = defs.get('TargetTypes')
  const targetValueTypes = defs.get('TargetValueTypes')
  const pmScopeOptions = defs.get('PMScope') || []

  // ------------------------------------------------------------------
  // Project Log
  // ------------------------------------------------------------------

  const { view: updatesTab, dialog: newUpdateDialog } = createUpdatesTab({ project, updates, siteApi, uuid, effectiveRole })

  // ------------------------------------------------------------------
  // Tab 5: Edit (locked preview)
  // ------------------------------------------------------------------

  const editTab = createEditTab({ project, umbrellaOptions, projectTypes, techProjects, techPhases, projectStatuses, businessLines, targetTypes, targetValueTypes, effectiveRole, siteApi, pmMemberOptions, allocations, pmScopeOptions })

  // ------------------------------------------------------------------
  // Tab 6: Umbrella View (D3 tree visualization)
  // ------------------------------------------------------------------

  // Tag all nodes with _type for the tree builder
  const taggedPrograms = programs.map(p => ({ ...p, _type: 'program' }))
  const taggedProjects = accessibleProjects.map(p => ({ ...p, _type: 'project' }))
  const allNodes = [...taggedPrograms, ...taggedProjects]
  const currentNodeTagged = { ...project, _type: 'project' }

  const treeMountId = 'tree-mount-' + uuid
  const treeMountContainer = new Container([], { class: 'app-tree-mount', id: treeMountId })
  let treeCleanup = null

  const umbrellaTab = new View([
    new Container([
      new Text('Umbrella Structure', { type: 'h3', class: 'app-section-heading' }),
      new Text('Click a node to navigate to it.', { type: 'p', class: 'app-tree-hint' }),
      treeMountContainer
    ], { class: 'app-umbrella-panel' })
  ])

  // ------------------------------------------------------------------
  // Tab 7: Access
  // ------------------------------------------------------------------

  const accessTab = createAccessTab({ project, siteApi, uuid, effectiveRole, delegations: projectDelegations })

  // ------------------------------------------------------------------
  // Capacity Tab
  // ------------------------------------------------------------------

  const capacityTab = createCapacityTab({ project, siteApi, uuid, allocations })

  // ------------------------------------------------------------------
  // Tab 1: Overview (KPIs + read-only fields)
  // ------------------------------------------------------------------

  const overviewTab = createOverviewTab({ project, updates })

  // ------------------------------------------------------------------
  // TabGroup
  // ------------------------------------------------------------------

  const tabGroup = new TabGroup(
    [
      { key: 'overview', label: 'Overview', view: overviewTab },
      { key: 'log', label: 'Project Log', view: updatesTab },
      { key: 'edit', label: 'Edit', view: editTab },
      { key: 'umbrella', label: 'Umbrella View', view: umbrellaTab },
      { key: 'access', label: 'Access', view: accessTab },
      { key: 'capacity', label: 'Capacity', view: capacityTab }
    ],
    {
      onTabChangeHandler: (tab) => {
        if (tab.key === 'umbrella') {
          setTimeout(() => {
            if (treeCleanup) { treeCleanup(); treeCleanup = null }
            const el = document.getElementById(treeMountId)
            if (el) {
              const treeData = buildTreeData(currentNodeTagged, allNodes)
              treeCleanup = renderTreeViz(el, treeData, (node) => {
                if (node.isCurrent) return
                if (node.type === 'program') {
                  Router.navigateTo('programs/detail', { query: { uuid: node.id } })
                } else {
                  Router.navigateTo('projects/detail', { query: { uuid: node.id } })
                }
              })
            }
          }, 0)
        } else if (treeCleanup) {
          treeCleanup()
          treeCleanup = null
        }
      }
    }
  )

  // ------------------------------------------------------------------
  // Sidebar (read-only metadata)
  // ------------------------------------------------------------------

  function metadataRow(label, value) {
    return new Container([
      new Text(label, { type: 'span', class: 'app-detail-label' }),
      new Text(value || '--', {
        type: 'span',
        class: value ? 'app-detail-value' : 'app-detail-value app-detail-value--empty'
      })
    ], { class: 'app-detail-row' })
  }

  const projectTypeDisplay = (() => {
    const base = project.ProjectType || ''
    if (base !== 'Tech') return base
    const parts = [base, project.TechProject, project.TechPhase].filter(Boolean)
    return parts.join(' / ')
  })()

  function personBadgeRow(label, raw) {
    const people = Array.isArray(raw)
      ? raw.map(p => p.displayName || p.email || String(p))
      : typeof raw === 'object' && raw !== null
        ? [raw.displayName || raw.email || String(raw)]
        : (String(raw || '')).split(';').map(s => s.trim()).filter(Boolean)
    const badges = people.length
      ? people.map(name => new Text(name, { type: 'span', class: 'app-multi-person-item' }))
      : [new Text('--', { type: 'span', class: 'app-detail-value app-detail-value--empty' })]
    return new Container([
      new Text(label, { type: 'span', class: 'app-detail-label' }),
      new Container(badges, { class: 'app-sidebar-badge-list' })
    ], { class: 'app-detail-row' })
  }

  const sidebarRows = [
    metadataRow('Context', project.Context),
    metadataRow('Objectives', project.Objectives),
    personBadgeRow('Sponsor', project.Sponsor),
    metadataRow('Business Line', project.BusinessLine),
    personBadgeRow('Stakeholders', project.Stakeholders),
    new Text('', { type: 'hr', class: 'app-sidebar-divider' }),
    personBadgeRow('Project Manager', project.ProjectManager),
    metadataRow('Project Type', projectTypeDisplay),
    project.ProjectType === 'Tech'
      ? metadataRow('Tech Project', [project.TechProject, project.TechPhase].filter(Boolean).join(' / '))
      : null,
    metadataRow('GDPR', project.GDPRClassification),
  ].filter(Boolean)

  const sidebar = new Container(sidebarRows, { class: 'app-dashboard-sidebar' })

  const layoutContainer = new Container([sidebar, tabGroup], { class: 'app-dashboard-layout' })

  // ------------------------------------------------------------------
  // Page Header
  // ------------------------------------------------------------------

  const pageHeader = new Card([
    new Container([
      new Text(project.Title, { type: 'h2' }),
      new Text(project.Status || '', { type: 'span', class: statusClass(project.Status) }),
      project.Validated === 'true'
        ? new Text('Validated', { type: 'span', class: 'app-status-badge app-validated-badge' })
        : null
    ], { class: 'app-detail-title' }),
    new LinkButton('Back to Home', '/', { variant: 'secondary' })
  ], { class: 'app-detail-header app-detail-header-card' })

  return [pageHeader, layoutContainer, newUpdateDialog]
})
