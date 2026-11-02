import {
  defineRoute, TabGroup, View, Container, Text, Button, Toast, SiteApi, Router, SystemError, CurrentUser
} from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_PROJECTS, LIST_PROJECT_UPDATES, LIST_PROGRAMS, LIST_ALLOCATIONS, LIST_PROJECT_ACCESS, isProjectClosed } from '../../../utils/constants.js'
import { createDeleteAction, splitUuids } from '../../../utils/delete-entity.js'
import { loadDefinitions } from '../../../utils/definitions.js'
import { loadScopes, getScopeOptions, getP4PMemberOptions } from '../../../utils/scopes.js'
import { createUpdatesTab } from '../utils/updates-tab.js'
import { createReviewTab } from '../utils/review-tab.js'
import { createOverviewTab } from '../utils/overview-tab.js'
import { createEditTab } from '../utils/edit-tab.js'
import { createAccessTab } from '../utils/access-tab.js'
import { createCapacityTab } from '../utils/capacity-tab.js'
import { statusClass } from '../../../utils/project-card.js'
import { resolveEffectiveRole, filterProjectsByAccess, fetchAllDelegations, deriveUserScopes, canPerformAction, canDeleteProject } from '../../../utils/access-control.js'
import { createUmbrellaPicker, seedUmbrellaCurrent } from '../../../utils/umbrella-picker.js'
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

  let [projects, updates, programs, defs, scopeItems, delegations, allocations, allProjectsList] = await Promise.all([
    siteApi.list(LIST_PROJECTS).getItemByUUID(uuid),
    siteApi.list(LIST_PROJECT_UPDATES).getItems({ ProjectUUID: uuid }),
    siteApi.list(LIST_PROGRAMS).getItems(),
    loadDefinitions(siteApi),
    loadScopes(siteApi),
    fetchAllDelegations(siteApi),
    siteApi.list(LIST_ALLOCATIONS).getItems({ ProjectUUID: uuid }),
    siteApi.list(LIST_PROJECTS).getItems(),
  ])
  const userScopes = deriveUserScopes(scopeItems, new CurrentUser().get('email'))

  // PM Members picker options come from the P4P scope Members (allocation pool).
  const pmMemberOptions = getP4PMemberOptions(scopeItems)

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

  const canEdit = canPerformAction(effectiveRole, 'edit')
  const isClosed = isProjectClosed(project)

  const accessibleProjects = filterProjectsByAccess(allProjectsList, user.get('email'), user.accessLevel, delegations, userScopes)

  // Build the async umbrella picker context (no pre-fetch of all programs/projects needed)
  const umbrellaCtx = {
    siteApi,
    userEmail: user.get('email'),
    siteAccessLevel: user.accessLevel,
    delegations,
    userScopes,
    excludeUuid: uuid,
  }

  // Resolve the current parent option for pre-population on the edit tab.
  // Named function so createEditTab can call it after a Save — project is mutated
  // in-place by the save handler, so the result always reflects current saved state.
  function resolveUmbrellaOption(proj) {
    if (!proj.LinkedPrograms) return null
    const parentProg = programs.find(p => p.UUID === proj.LinkedPrograms)
    if (parentProg) return { label: '[Program] ' + parentProg.Title, value: parentProg.UUID }
    const parentProj = allProjectsList.find(p => p.UUID === proj.LinkedPrograms)
    if (parentProj) return { label: '[Project] ' + parentProj.Title, value: parentProj.UUID }
    // Stored UUID not visible — fall back to the plain text name if available
    if (proj.UmbrellaProgram) return { label: proj.UmbrellaProgram, value: proj.LinkedPrograms }
    return null
  }
  const umbrellaCurrent = resolveUmbrellaOption(project)

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

  const { view: updatesTab, dialog: newUpdateDialog, closeDialog, reopenDialog } = createUpdatesTab({
    project, updates, siteApi, uuid, effectiveRole,
    userEmail: user.get('email'),
    siteAccessLevel: user.accessLevel,
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

  if (canDeleteProject(project, user.get('email'), user.accessLevel)) {
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
    project, umbrellaCtx, umbrellaCurrent, projectTypes, techProjects, techPhases, projectStatuses,
    businessLines, targetTypes, targetValueTypes, effectiveRole, siteApi, pmMemberOptions,
    allocations, pmScopeOptions, deleteButton: deleteTriggerBtn,
    createUmbrellaPicker, seedUmbrellaCurrent, resolveUmbrellaOption,
    subCategoryMap: defs.subCategoryMap,
    isClosed,
    onProjectSaved: (fresh) => {
      // Refresh sidebar, header title, status badge, and Overview tab from saved data.
      // project is mutated in-place by the save handler before this callback fires,
      // so fresh and project are already in sync here.
      sidebar.children = buildSidebarChildren(fresh)
      headerTitleText.children = [fresh.Title]
      config.setRouteTitle(fresh.Title)
      statusPill.class = `app-status-badge ${statusClass(fresh.Status)}`
      statusPill.children = [fresh.Status || '']
      refreshOverview(fresh)
    },
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

  const capacityTab = createCapacityTab({ project, siteApi, uuid, allocations, effectiveRole })

  // ------------------------------------------------------------------
  // Overview (1c)
  // ------------------------------------------------------------------

  const { view: overviewTab, refresh: refreshOverview } = createOverviewTab({ project, updates })

  // ------------------------------------------------------------------
  // Project Review (unlocked when closed)
  // ------------------------------------------------------------------

  const reviewTab = createReviewTab({ project, siteApi, uuid, effectiveRole })

  // ------------------------------------------------------------------
  // TabGroup — fires tree render on umbrella tab activation
  // ------------------------------------------------------------------

  const tabGroup = new TabGroup(
    [
      { key: 'overview', label: 'Overview', view: overviewTab },
      { key: 'log', label: 'Project Log', view: updatesTab },
      { key: 'edit', label: 'Edit', view: editTab, disabled: !canEdit },
      { key: 'review', label: 'Project Review', view: reviewTab, disabled: !isClosed },
      { key: 'umbrella', label: 'Umbrella View', view: umbrellaTab },
      { key: 'access', label: 'Access', view: accessTab },
      { key: 'capacity', label: 'Capacity', view: capacityTab, disabled: !canEdit }
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
  // then 2x2 meta grid (Business line, Category, Sub category, Tech, GDPR)
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

  // Shared builder for sidebar content -- called on load and after save so the
  // sidebar reflects saved values without a page reload (DRY, no duplicate markup).
  function buildSidebarChildren(proj) {
    const rows = []
    const pmName = resolveDisplayName(proj.ProjectManager)
    if (pmName) rows.push(personRow(pmName, 'Project manager', true))
    const sponsorName = resolveDisplayName(proj.Sponsor)
    if (sponsorName) rows.push(personRow(sponsorName, 'Sponsor', false))
    const stakeholders = Array.isArray(proj.Stakeholders) ? proj.Stakeholders : []
    stakeholders.forEach(s => {
      const name = resolveDisplayName(s)
      if (name) rows.push(personRow(name, 'Stakeholder', false))
    })

    const peopleSection = new Container([
      new Text('People', { type: 'span', class: 'app-overline app-sidebar-field__label' }),
      new Container(
        rows.length > 0 ? rows : [new Text('No people assigned.', { type: 'p', class: 'app-sidebar-field__value app-sidebar-field__value--empty' })],
        { class: 'app-people-list' }
      )
    ], { class: 'app-sidebar-field' })

    const techLine = (proj.ProjectType === 'Tech' && (proj.TechProject || proj.TechPhase))
      ? [proj.TechProject, proj.TechPhase].filter(Boolean).join(' / ')
      : null

    const metaGrid = new Container([
      new Container([
        new Text('Business line', { type: 'span', class: 'app-overline' }),
        new Text(proj.BusinessLine || '—', { type: 'span', class: 'app-meta-grid__value' })
      ], { class: 'app-meta-grid__cell' }),
      new Container([
        new Text('Category', { type: 'span', class: 'app-overline' }),
        new Text(proj.ProjectType || '—', { type: 'span', class: 'app-meta-grid__value' })
      ], { class: 'app-meta-grid__cell' }),
      new Container([
        new Text('Sub category', { type: 'span', class: 'app-overline' }),
        new Text(proj.SubCategory || '—', { type: 'span', class: 'app-meta-grid__value' })
      ], { class: 'app-meta-grid__cell' }),
      new Container([
        new Text('Tech project', { type: 'span', class: 'app-overline' }),
        new Text(techLine || '—', { type: 'span', class: 'app-meta-grid__value' })
      ], { class: 'app-meta-grid__cell' }),
      new Container([
        new Text('GDPR', { type: 'span', class: 'app-overline' }),
        new Text(proj.GDPRClassification || '—', { type: 'span', class: 'app-meta-grid__value' })
      ], { class: 'app-meta-grid__cell' })
    ], { class: 'app-meta-grid' })

    return [
      sidebarField('Context', proj.Context),
      sidebarDivider(),
      sidebarField('Objectives', proj.Objectives),
      sidebarDivider(),
      peopleSection,
      sidebarDivider(),
      metaGrid,
    ]
  }

  const sidebar = new Container(buildSidebarChildren(project), { class: 'app-project-sidebar' })

  // ------------------------------------------------------------------
  // Detail body grid (280px sidebar + tab content)
  // ------------------------------------------------------------------

  const detailBody = new Container([sidebar, tabGroup], { class: 'app-project-detail-body' })

  // ------------------------------------------------------------------
  // Record header (app-record-header pattern)
  // title row + status pill + UUID meta + TabGroup tab row
  // ------------------------------------------------------------------

  // ------------------------------------------------------------------
  // Export button — visible to all roles (reader and above)
  // Lazy-loads export-excel.js only on click to avoid loading the parser
  // on every detail page visit.
  // ------------------------------------------------------------------

  const exportBtn = new Button('Export to Excel', {
    variant: 'secondary',
    onClickHandler: async () => {
      exportBtn.isLoading = true
      const loading = Toast.loading('Preparing export...')
      try {
        const [{ exportProjectToExcel }, freshUpdates] = await Promise.all([
          import('../../../utils/export-excel.js'),
          siteApi.list(LIST_PROJECT_UPDATES).getItems({ ProjectUUID: uuid }),
        ])
        await exportProjectToExcel(project, freshUpdates)
        loading.success('Export downloaded')
      } catch (err) {
        console.error('[ExportProject] export failed', err)
        loading.error('Export failed')
      } finally {
        if (exportBtn.isAlive) exportBtn.isLoading = false
      }
    }
  })

  const headerTitleText = new Text(project.Title, { type: 'h1', class: 'app-record-header__title' })

  const recordHeader = new Container([
    new Container([
      headerTitleText,
      statusPill,
      project.Validated === 'true'
        ? new Text('Validated', { type: 'span', class: 'app-status-badge app-validated-badge' })
        : null,
      new Text('', { type: 'span', class: 'app-record-header__spacer' }),
      exportBtn,
    ].filter(Boolean), { class: 'app-record-header__title-row' }),
  ], { class: 'app-record-header' })

  return [recordHeader, detailBody, newUpdateDialog, ...(closeDialog ? [closeDialog] : []), ...(reopenDialog ? [reopenDialog] : []), ...(deleteDialog ? [deleteDialog] : [])]
})
