import {
  defineRoute, TabGroup, View, Container, Text, SiteApi, Router, SystemError, CurrentUser
} from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_PROJECTS, LIST_PROJECT_UPDATES, LIST_PROGRAMS, LIST_ALLOCATIONS, LIST_PROJECT_ACCESS } from '../../../utils/constants.js'
import { createDeleteAction, splitUuids } from '../../../utils/delete-entity.js'
import { loadDefinitions } from '../../../utils/definitions.js'
import { loadScopes, getScopeOptions } from '../../../utils/scopes.js'
import { createUpdatesTab } from '../utils/updates-tab.js'
import { createOverviewTab } from '../utils/overview-tab.js'
import { createEditTab } from '../utils/edit-tab.js'
import { createAccessTab } from '../utils/access-tab.js'
import { createCapacityTab } from '../utils/capacity-tab.js'
import { statusClass } from '../../../utils/project-card.js'
import { resolveEffectiveRole, filterProjectsByAccess, fetchAllDelegations, fetchUserScopes, canPerformAction } from '../../../utils/access-control.js'
import { buildUmbrellaOptions } from '../../../utils/umbrella.js'
import { buildTreeData, renderTreeViz } from '../../../utils/tree-viz.js'

export default defineRoute(async (config) => {
  /**
   * Returns two-letter initials for a display name or email.
   * @param {string} name
   * @returns {string}
   */
  function initials(name) {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
  }

  const siteApi = new SiteApi()
  const uuid = Router.queryParams.get('uuid')

  if (!uuid) {
    throw new SystemError('MissingUUID', 'No project UUID provided in query params')
  }

  let [projects, updates, programs, defs, scopeItems, delegations, allocations, pmGroupMembers, userScopes, allProjectsList] = await Promise.all([
    siteApi.list(LIST_PROJECTS).getItemByUUID(uuid),
    siteApi.list(LIST_PROJECT_UPDATES).getItems({ ProjectUUID: uuid }),
    siteApi.list(LIST_PROGRAMS).getItems(),
    loadDefinitions(siteApi),
    loadScopes(siteApi),
    fetchAllDelegations(siteApi),
    siteApi.list(LIST_ALLOCATIONS).getItems({ ProjectUUID: uuid }),
    siteApi.getGroupUsers('ProjectManagers'),
    fetchUserScopes(siteApi, new CurrentUser().get('email')),
    siteApi.list(LIST_PROJECTS).getItems(),
  ])

  const pmMemberOptions = pmGroupMembers.map(m => ({
    label: m.Title,
    value: { email: m.Email, displayName: m.Title },
  }))

  const project = projects[0]
  if (!project) {
    throw new SystemError('ProjectNotFound', `No project found for UUID: ${uuid}`)
  }

  const user = new CurrentUser()
  const projectDelegations = delegations.filter(d => d.ProjectUUID === uuid)
  const effectiveRole = resolveEffectiveRole(project, user.get('email'), user.accessLevel, projectDelegations, userScopes)

  if (!effectiveRole) {
    throw new SystemError('AccessDenied', 'You do not have access to this project', { breaksFlow: true })
  }

  const accessibleProjects = filterProjectsByAccess(allProjectsList, user.get('email'), user.accessLevel, delegations, userScopes)
  const umbrellaOptions = await buildUmbrellaOptions(siteApi, user, { excludeUuid: uuid })

  config.setRouteTitle(project.Title)

  const projectTypes = defs.get('ProjectTypes')
  const techProjects = defs.get('TechProjects')
  const techPhases = defs.get('TechPhases')
  const projectStatuses = defs.get('ProjectStatuses')
  const businessLines = defs.get('BusinessLines')
  const targetTypes = defs.get('TargetTypes')
  const targetValueTypes = defs.get('TargetValueTypes')
  const pmScopeOptions = getScopeOptions(scopeItems)

  // ------------------------------------------------------------------
  // Project Log (3a)
  // ------------------------------------------------------------------

  // Record-header status pill (reactively updated on close via onStatusChange)
  const statusPill = new Text(project.Status || '', {
    type: 'span',
    class: `app-status-badge ${statusClass(project.Status)}`
  })

  const { view: updatesTab, dialog: newUpdateDialog, closeDialog } = createUpdatesTab({
    project, updates, siteApi, uuid, effectiveRole,
    onStatusChange: (s) => {
      statusPill.class = `app-status-badge ${statusClass(s)}`
      statusPill.children = [s]
    }
  })

  // ------------------------------------------------------------------
  // Edit tab + Delete action (3b)
  // ------------------------------------------------------------------

  let deleteDialog = null
  let deleteTriggerBtn = null

  if (effectiveRole === 'owner') {
    const childUpdates = updates
    const childAccess = projectDelegations
    const childAllocs = allocations
    const referringProjects = allProjectsList.filter(p =>
      p.UUID !== project.UUID && (
        splitUuids(p.LinkedPrograms).includes(project.UUID) ||
        p.UmbrellaProgram === project.Title
      )
    )
    const referringPrograms = programs.filter(p =>
      splitUuids(p.LinkedPrograms).includes(project.UUID) ||
      p.UmbrellaProgram === project.Title
    )

    const totalLinked = referringProjects.length + referringPrograms.length
    const warningText = `${childUpdates.length} update(s), ${childAccess.length} delegation(s), ${childAllocs.length} allocation(s) will be permanently deleted, and ${totalLinked} linked item(s) unlinked. This cannot be undone.`

    const { triggerButton, dialog } = createDeleteAction({
      triggerLabel: 'Delete Project',
      dialogTitle: `Delete "${project.Title}"`,
      message: `Delete "${project.Title}"? This project and all its data will be permanently removed.`,
      warning: warningText,
      confirmLabel: 'Delete project',
      loadingText: 'Deleting project...',
      successText: 'Project deleted',
      errorText: 'Failed to delete project',
      navigateTo: '/',
      onConfirm: async () => {
        await Promise.all([
          ...childUpdates.map(u => siteApi.list(LIST_PROJECT_UPDATES).deleteItem(u.Id, u['odata.etag'])),
          ...childAccess.map(a => siteApi.list(LIST_PROJECT_ACCESS).deleteItem(a.Id, a['odata.etag'])),
          ...childAllocs.map(a => siteApi.list(LIST_ALLOCATIONS).deleteItem(a.Id, a['odata.etag'])),
          ...referringProjects.map(p => siteApi.list(LIST_PROJECTS).updateItem(p.Id, {
            LinkedPrograms: splitUuids(p.LinkedPrograms).filter(id => id !== project.UUID).join(';'),
            UmbrellaProgram: p.UmbrellaProgram === project.Title ? '' : p.UmbrellaProgram
          }, p['odata.etag'])),
          ...referringPrograms.map(p => siteApi.list(LIST_PROGRAMS).updateItem(p.Id, {
            LinkedPrograms: splitUuids(p.LinkedPrograms).filter(id => id !== project.UUID).join(';'),
            UmbrellaProgram: p.UmbrellaProgram === project.Title ? '' : p.UmbrellaProgram
          }, p['odata.etag'])),
        ])
        await siteApi.list(LIST_PROJECTS).deleteItem(project.Id, project['odata.etag'])
      }
    })

    deleteDialog = dialog
    deleteTriggerBtn = triggerButton
  }

  const editTab = createEditTab({
    project, umbrellaOptions, projectTypes, techProjects, techPhases, projectStatuses,
    businessLines, targetTypes, targetValueTypes, effectiveRole, siteApi, pmMemberOptions,
    allocations, pmScopeOptions, deleteButton: deleteTriggerBtn
  })

  // ------------------------------------------------------------------
  // Umbrella View (3c)
  // ------------------------------------------------------------------

  const taggedPrograms = programs.map(p => ({ ...p, _type: 'program' }))
  const taggedProjects = accessibleProjects.map(p => ({ ...p, _type: 'project' }))
  const allNodes = [...taggedPrograms, ...taggedProjects]
  const currentNodeTagged = { ...project, _type: 'project' }

  const treeMountId = 'tree-mount-' + uuid
  const treeMountContainer = new Container([], { class: 'app-tree-mount', id: treeMountId })
  let treeCleanup = null

  // Legend (Program = wash chip, Project = white chip)
  const treeLegend = new Container([
    new Container([
      new Text('', { type: 'span', class: 'app-tree-legend__dot app-tree-legend__dot--program' }),
      new Text('Program', { type: 'span', class: 'app-tree-legend__label' })
    ], { class: 'app-tree-legend__item' }),
    new Container([
      new Text('', { type: 'span', class: 'app-tree-legend__dot app-tree-legend__dot--project' }),
      new Text('Project', { type: 'span', class: 'app-tree-legend__label' })
    ], { class: 'app-tree-legend__item' })
  ], { class: 'app-tree-legend' })

  const umbrellaTab = new View([
    new Container([
      new Container([
        new Container([
          new Text('Umbrella structure', { type: 'h3', class: 'app-section-card__heading' }),
          treeLegend
        ], { class: 'app-section-card__heading-row app-section-card__heading-row--spaced' }),
        new Text('Click a node to navigate to it. This project is highlighted.', {
          type: 'p',
          class: 'app-tree-hint'
        }),
        treeMountContainer
      ], { class: 'app-section-card app-umbrella-panel' })
    ])
  ])

  // ------------------------------------------------------------------
  // Access (3d)
  // ------------------------------------------------------------------

  const accessTab = createAccessTab({ project, siteApi, uuid, effectiveRole, delegations: projectDelegations })

  // ------------------------------------------------------------------
  // Capacity (3e)
  // ------------------------------------------------------------------

  const capacityTab = createCapacityTab({ project, siteApi, uuid, allocations })

  // ------------------------------------------------------------------
  // Overview (1c)
  // ------------------------------------------------------------------

  const overviewTab = createOverviewTab({ project, updates })

  // ------------------------------------------------------------------
  // TabGroup — fires tree render on umbrella tab activation
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
  // Left sidebar (1c): plain card, 280px
  // Context, Objectives, People list (PM + Sponsor + Stakeholders),
  // then 2x2 meta grid (Business line, Project type, Tech, GDPR)
  // ------------------------------------------------------------------

  function sidebarDivider() {
    return new Text('', { type: 'hr', class: 'app-sidebar-divider' })
  }

  function sidebarField(label, value) {
    const isEmpty = !value
    return new Container([
      new Text(label, { type: 'span', class: 'app-overline app-sidebar-field__label' }),
      new Text(isEmpty ? '' : value, {
        type: 'p',
        class: isEmpty ? 'app-sidebar-field__value app-sidebar-field__value--empty' : 'app-sidebar-field__value'
      })
    ], { class: 'app-sidebar-field' })
  }

  // Build a person row: 28px avatar + name / role
  function personRow(displayName, role, isPm) {
    const avatarClass = isPm ? 'app-avatar app-avatar--wash' : 'app-avatar app-avatar--neutral'
    return new Container([
      new Container([
        new Text(initials(displayName), { type: 'span', class: 'app-avatar__initials' })
      ], { class: avatarClass }),
      new Container([
        new Text(displayName, { type: 'span', class: 'app-people-row__name' }),
        new Text(role, { type: 'span', class: 'app-people-row__role' })
      ], { class: 'app-people-row__text' })
    ], { class: 'app-people-row' })
  }

  // Collect people for the People list
  function resolveDisplayName(raw) {
    if (!raw) return null
    if (typeof raw === 'object' && raw !== null) {
      return raw.displayName || raw.email || null
    }
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw)
        if (parsed && parsed.displayName) return parsed.displayName
      } catch (err) { console.warn('[ProjectDetail] resolveDisplayName: value not JSON, using raw string', err) }
      return raw
    }
    return null
  }

  const peopleRows = []

  const pmName = resolveDisplayName(project.ProjectManager)
  if (pmName) peopleRows.push(personRow(pmName, 'Project manager', true))

  const sponsorName = resolveDisplayName(project.Sponsor)
  if (sponsorName) peopleRows.push(personRow(sponsorName, 'Sponsor', false))

  // Stakeholders: array of UserIdentity
  const stakeholders = Array.isArray(project.Stakeholders) ? project.Stakeholders : []
  stakeholders.forEach(s => {
    const name = resolveDisplayName(s)
    if (name) peopleRows.push(personRow(name, 'Stakeholder', false))
  })

  const peopleSection = new Container([
    new Text('People', { type: 'span', class: 'app-overline app-sidebar-field__label' }),
    new Container(
      peopleRows.length > 0 ? peopleRows : [new Text('No people assigned.', { type: 'p', class: 'app-sidebar-field__value app-sidebar-field__value--empty' })],
      { class: 'app-people-list' }
    )
  ], { class: 'app-sidebar-field' })

  // 2x2 meta grid
  const projectTypeDisplay = (() => {
    const base = project.ProjectType || ''
    if (base !== 'Tech') return base
    const parts = [project.TechProject, project.TechPhase].filter(Boolean)
    return parts.length ? `${base} / ${parts.join(' / ')}` : base
  })()

  const techLine = (project.ProjectType === 'Tech' && (project.TechProject || project.TechPhase))
    ? [project.TechProject, project.TechPhase].filter(Boolean).join(' / ')
    : null

  const metaGrid = new Container([
    new Container([
      new Text('Business line', { type: 'span', class: 'app-overline' }),
      new Text(project.BusinessLine || '—', { type: 'span', class: 'app-meta-grid__value' })
    ], { class: 'app-meta-grid__cell' }),
    new Container([
      new Text('Project type', { type: 'span', class: 'app-overline' }),
      new Text(project.ProjectType || '—', { type: 'span', class: 'app-meta-grid__value' })
    ], { class: 'app-meta-grid__cell' }),
    new Container([
      new Text('Tech project', { type: 'span', class: 'app-overline' }),
      new Text(techLine || '—', { type: 'span', class: 'app-meta-grid__value' })
    ], { class: 'app-meta-grid__cell' }),
    new Container([
      new Text('GDPR', { type: 'span', class: 'app-overline' }),
      new Text(project.GDPRClassification || '—', { type: 'span', class: 'app-meta-grid__value' })
    ], { class: 'app-meta-grid__cell' })
  ], { class: 'app-meta-grid' })

  const sidebar = new Container([
    sidebarField('Context', project.Context),
    sidebarDivider(),
    sidebarField('Objectives', project.Objectives),
    sidebarDivider(),
    peopleSection,
    sidebarDivider(),
    metaGrid
  ], { class: 'app-project-sidebar' })

  // ------------------------------------------------------------------
  // Detail body grid (280px sidebar + tab content)
  // ------------------------------------------------------------------

  const detailBody = new Container([sidebar, tabGroup], { class: 'app-project-detail-body' })

  // ------------------------------------------------------------------
  // Record header (app-record-header pattern)
  // title row + status pill + UUID meta + TabGroup tab row
  // ------------------------------------------------------------------

  const recordHeader = new Container([
    new Container([
      new Text(project.Title, { type: 'h1', class: 'app-record-header__title' }),
      statusPill,
      project.Validated === 'true'
        ? new Text('Validated', { type: 'span', class: 'app-status-badge app-validated-badge' })
        : null
    ].filter(Boolean), { class: 'app-record-header__title-row' }),
    new Text(project.UUID || '', { type: 'span', class: 'app-record-header__meta' })
  ], { class: 'app-record-header' })

  return [recordHeader, detailBody, newUpdateDialog, ...(closeDialog ? [closeDialog] : []), ...(deleteDialog ? [deleteDialog] : [])]
})
