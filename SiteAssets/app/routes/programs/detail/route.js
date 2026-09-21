import {
  defineRoute, TabGroup, View, Container, Text, TextInput, TextArea, ComboBox,
  Button, FormField, Card, SiteApi, Router, Toast, PeoplePicker, SystemError, LinkButton,
  CurrentUser
} from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_PROGRAMS, LIST_PROJECTS } from '../../../utils/constants.js'
import { createDeleteAction, splitUuids } from '../../../utils/delete-entity.js'
import { fetchAllDelegations, filterProjectsByAccess, fetchUserScopes, isScopeOrCreatorVisible } from '../../../utils/access-control.js'
import { buildUmbrellaOptions } from '../../../utils/umbrella.js'
import { createLabeledField, createFormSection, createMultiPersonPicker, userIdentityToOption, optionToUserIdentity, comboValue } from '../../../utils/form-helpers.js'
import { buildTreeData, renderTreeViz } from '../../../utils/tree-viz.js'
import { styleAfterRender } from '../../../utils/dynamic-style.js'
import { loadDefinitions } from '../../../utils/definitions.js'
import { loadScopes, getScopeOptions } from '../../../utils/scopes.js'

export default defineRoute(async (config) => {
  const siteApi = new SiteApi()
  const uuid = Router.queryParams.get('uuid')

  if (!uuid) {
    throw new SystemError('MissingUUID', 'No program UUID provided in query params')
  }

  const [allPrograms, allProjects, delegations, defs, scopeItems, userScopes] = await Promise.all([
    siteApi.list(LIST_PROGRAMS).getItems(),
    siteApi.list(LIST_PROJECTS).getItems(),
    fetchAllDelegations(siteApi),
    loadDefinitions(siteApi),
    loadScopes(siteApi),
    fetchUserScopes(siteApi, new CurrentUser().get('email')),
  ])
  const pmScopeOptions = getScopeOptions(scopeItems)

  const user = new CurrentUser()
  const accessibleProjects = filterProjectsByAccess(allProjects, user.get('email'), user.accessLevel, delegations, userScopes)

  const program = allPrograms.find(p => p.UUID === uuid)
  if (!program) {
    throw new SystemError('ProgramNotFound', `No program found for UUID: ${uuid}`)
  }

  // Access gate: ADMIN sees all; untagged programs are public; scoped programs require scope membership or creator
  if (!isScopeOrCreatorVisible(program, user.get('email'), user.accessLevel, userScopes, true)) {
    throw new SystemError('AccessDenied', 'You do not have access to this program', { breaksFlow: true })
  }

  config.setRouteTitle(program.Title)

  // Build umbrella options (scope-filtered; exclude current program to avoid self-reference)
  const builtUmbrellaOptions = await buildUmbrellaOptions(siteApi, user, { excludeUuid: uuid })
  // Prepend the "None" sentinel so the user can clear the parent
  const umbrellaOptions = [
    { label: 'None — top level', value: '' },
    ...builtUmbrellaOptions,
  ]

  // ----------------------------------------------------------------
  // Derived data for Overview tab
  // ----------------------------------------------------------------

  function initials(name) {
    if (!name) return '?'
    return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
  }

  const parentProgram = program.LinkedPrograms
    ? allPrograms.find(p => p.UUID === program.LinkedPrograms)
    : null

  const sponsorIdentity = program.ProgramSponsor || null
  const sponsorName = sponsorIdentity?.displayName || sponsorIdentity?.email || null

  const stakeholders = (() => {
    const raw = program.Stakeholders || []
    return Array.isArray(raw) ? raw : []
  })()

  // Direct children: sub-programs + projects linked to this program
  const childPrograms = allPrograms.filter(p =>
    p.UUID !== uuid && (
      p.LinkedPrograms === uuid ||
      (p.LinkedPrograms && p.LinkedPrograms.split(';').map(s => s.trim()).includes(uuid))
    )
  )
  const childProjects = allProjects.filter(p => {
    const linked = (p.LinkedPrograms || '').split(';').map(s => s.trim()).filter(Boolean)
    return linked.includes(uuid)
  })

  // Status mix counts for portfolio mix bar
  const statusCounts = {}
  for (const proj of childProjects) {
    const s = proj.Status || 'Unknown'
    statusCounts[s] = (statusCounts[s] || 0) + 1
  }

  const totalChildren = childPrograms.length + childProjects.length

  // Portfolio mix bar segments (4 steps of the green ramp)
  // Sub-programs use slot 0 (#00965E), projects map by status health
  // Named constants so the same values can be referenced by both the bar segments and legend dots.
  const RAMP = ['#00965E', '#39A87B', '#8BC8AA', '#E6F4EE']

  const mixSegments = (() => {
    const colors = RAMP
    const items = []
    if (childPrograms.length > 0) {
      items.push({ label: `${childPrograms.length} Program${childPrograms.length > 1 ? 's' : ''}`, count: childPrograms.length, color: colors[0] })
    }
    const healthy = (statusCounts['In Progress'] || 0) + (statusCounts['Completed'] || 0)
    const atRisk = statusCounts['Delayed'] || 0
    const blocked = (statusCounts['On Hold'] || 0) + (statusCounts['Stopped'] || 0)
    const pipeline = statusCounts['Pipeline'] || 0
    if (healthy > 0) items.push({ label: `${healthy} Active`, count: healthy, color: colors[1] })
    if (atRisk > 0) items.push({ label: `${atRisk} Delayed`, count: atRisk, color: colors[2] })
    if (blocked > 0) items.push({ label: `${blocked} Blocked`, count: blocked, color: colors[3] })
    if (pipeline > 0) items.push({ label: `${pipeline} Pipeline`, count: pipeline, color: '#ede9fe' })
    // If nothing, show a single wash segment
    if (items.length === 0) items.push({ label: '0', count: 1, color: '#E6F4EE' })
    return items
  })()

  const totalForBar = mixSegments.reduce((a, b) => a + b.count, 0)

  // ----------------------------------------------------------------
  // Tab 1: Overview
  // ----------------------------------------------------------------

  // Sponsor cell
  const sponsorCell = new Container([
    new Text('Sponsor', { type: 'span', class: 'app-prog-meta-cell__label' }),
    new Container(
      [
        new Text(initials(sponsorName || ''), { type: 'span', class: 'app-prog-avatar' }),
        new Text(sponsorName || '—', { type: 'span', class: sponsorName ? '' : 'app-prog-meta-cell__value--none' }),
      ],
      { class: 'app-prog-meta-cell__value' }
    )
  ], { class: 'app-prog-meta-cell' })

  // Parent program cell
  const parentLabel = parentProgram ? parentProgram.Title : null
  const parentCell = new Container([
    new Text('Umbrella Project', { type: 'span', class: 'app-prog-meta-cell__label' }),
    new Text(parentLabel || 'None — top level', {
      type: 'span',
      class: parentLabel ? 'app-prog-meta-cell__value' : 'app-prog-meta-cell__value app-prog-meta-cell__value--none'
    })
  ], { class: 'app-prog-meta-cell' })

  // PM scope cell
  const pmScopeCell = new Container([
    new Text('PM Scope', { type: 'span', class: 'app-prog-meta-cell__label' }),
    new Text(program.PMScope || '—', {
      type: 'span',
      class: program.PMScope ? 'app-prog-meta-cell__value' : 'app-prog-meta-cell__value app-prog-meta-cell__value--none'
    })
  ], { class: 'app-prog-meta-cell' })

  const metaRow = new Container([sponsorCell, parentCell, pmScopeCell], { class: 'app-prog-meta-row' })

  // Stakeholder tokens
  const stakeholderList = new Container(
    stakeholders.length > 0
      ? stakeholders.map(u =>
          new Text(u.displayName || u.email || '', { type: 'span', class: 'app-prog-stakeholder-token' })
        )
      : [new Text('—', { type: 'span', class: 'app-prog-meta-cell__value--none' })],
    { class: 'app-prog-stakeholder-list' }
  )

  const stakeholderBlock = new Container([
    new Text('Stakeholders', { type: 'span', class: 'app-prog-meta-cell__label' }),
    stakeholderList
  ], { class: 'app-prog-meta-cell' })

  // Program details section (left-accent app-form-section)
  const programDetailsCard = new Container([
    // Heading row
    new Container([
      new Text('Program details', { type: 'h2' }),
    ], { class: '' }),
    // Context
    new Text(program.Context || '—', { type: 'p', class: 'app-prog-context' }),
    // Meta row: sponsor | parent | pmScope
    metaRow,
    // Stakeholders row
    stakeholderBlock,
  ], { class: 'app-form-section' })

  // ---- Direct children table ----

  // Umbrella view link in heading
  const umbrellaLink = new Button('Open umbrella view →', {
    variant: 'text',
    class: 'app-section-card__heading-link',
    onClickHandler: () => {
      // Switch to umbrella tab by navigating TabGroup — we'll keep a ref
      tabGroup.setTab('umbrella')
    }
  })

  const childrenHeadingRow = new Container([
    new Text('Direct children', { type: 'span', class: 'app-section-card__heading' }),
    umbrellaLink
  ], { class: 'app-section-card__heading' })

  // Table header
  const tableHeader = new Container([
    new Text('Kind', { type: 'span', class: 'app-table-col-header' }),
    new Text('Name', { type: 'span', class: 'app-table-col-header' }),
    new Text('Status', { type: 'span', class: 'app-table-col-header' }),
    new Text('Start date', { type: 'span', class: 'app-table-col-header' }),
  ], { class: 'app-table-header' })

  // Build kind-tagged cells: we use Container approach since Text can't
  // produce a kind tag alongside the row. Use a helper that sets .children.
  function makeChildRowFull(item, kind) {
    const kindTag = new Text(kind === 'program' ? 'PROGRAM' : 'PROJECT', {
      type: 'span',
      class: `app-kind-tag app-kind-tag--${kind}`
    })
    const kindCell = new Container([kindTag], { class: 'app-table-cell' })

    const nameCell = new Text(item.Title || '', { type: 'span', class: 'app-table-cell' })

    const statusText = kind === 'program' ? 'Program' : (item.Status || '—')
    const statusCls = kind === 'project'
      ? `app-status-badge app-status--${(item.Status || '').toLowerCase().replace(/\s+/g, '-')}`
      : ''
    const statusCell = new Text(statusText, { type: 'span', class: `app-table-cell ${statusCls}` })

    const dateCell = new Text(item.StartDate || '—', { type: 'span', class: 'app-table-cell app-children-date' })

    const row = new Container([kindCell, nameCell, statusCell, dateCell], { class: 'app-table-row' })
    if (kind === 'project' && item.UUID) {
      row.setEventHandler('click', () => Router.navigateTo('projects/detail', { query: { uuid: item.UUID } }))
    } else if (kind === 'program' && item.UUID) {
      row.setEventHandler('click', () => Router.navigateTo('programs/detail', { query: { uuid: item.UUID } }))
    }
    return row
  }

  const allChildRows = [
    ...childPrograms.map(p => makeChildRowFull(p, 'program')),
    ...childProjects.map(p => makeChildRowFull(p, 'project')),
  ]

  const childrenTableBody = new Container(
    allChildRows.length > 0 ? allChildRows : [new Text('No direct children found.', { type: 'p', class: 'app-children-empty' })],
    { class: 'app-children-table' }
  )

  const directChildrenCard = new Container([
    childrenHeadingRow,
    tableHeader,
    childrenTableBody
  ], { class: 'app-section-card' })

  // ---- Right rail ----

  // Portfolio mix bar — SPARC has no style prop, so apply width/colour after render
  const mixBarSegs = mixSegments.map(seg => {
    const pct = totalForBar > 0 ? (seg.count / totalForBar) * 100 : 0
    return styleAfterRender(
      new Container([], { class: 'app-mix-bar__seg' }),
      { width: `${pct}%`, background: seg.color }
    )
  })
  const mixBar = new Container(mixBarSegs, { class: 'app-mix-bar' })

  // Legend items (2x2 grid) — dot colour applied after render
  const legendItems = mixSegments.slice(0, 4).map(seg => {
    const dot = styleAfterRender(
      new Container([], { class: 'app-mix-legend-dot' }),
      { background: seg.color }
    )
    return new Container([
      dot,
      new Text(seg.label, { type: 'span' })
    ], { class: 'app-mix-legend-item' })
  })
  const mixLegend = new Container(legendItems, { class: 'app-mix-legend' })

  const portfolioMixCard = new Container([
    new Text('Portfolio mix', { type: 'span', class: 'app-section-card__heading' }),
    mixBar,
    mixLegend,
  ], { class: 'app-section-card' })

  // Totals card
  const totalsCard = new Container([
    new Text('Totals', { type: 'span', class: 'app-section-card__heading' }),
    new Container([
      new Container([
        new Text('Programs', { type: 'span', class: 'app-prog-total-label' }),
        new Text(String(childPrograms.length), { type: 'span', class: 'app-prog-total-value' })
      ], { class: 'app-prog-total-row' }),
      new Container([
        new Text('Projects', { type: 'span', class: 'app-prog-total-label' }),
        new Text(String(childProjects.length), { type: 'span', class: 'app-prog-total-value' })
      ], { class: 'app-prog-total-row' }),
      new Container([
        new Text('Allocated FTE', { type: 'span', class: 'app-prog-total-label' }),
        new Text('—', { type: 'span', class: 'app-prog-total-value app-prog-total-value--fte' })
      ], { class: 'app-prog-total-row' }),
    ], { class: 'app-prog-totals' })
  ], { class: 'app-section-card' })

  // Program dates flat wash panel
  const startStr = program.StartDate || null
  const endStr = program.ExpectedEndDate || null
  const dateRange = startStr || endStr
    ? `${startStr || '?'} – ${endStr || 'open'}`
    : '—'
  const datesPanelCard = new Container([
    new Text('Program dates', { type: 'span', class: 'app-prog-dates-panel__label' }),
    new Text(dateRange, { type: 'span', class: 'app-prog-dates-panel__range' }),
    new Text('Projects inherit the end date unless they set their own.', { type: 'span', class: 'app-prog-dates-panel__note' }),
  ], { class: 'app-prog-dates-panel' })

  // ---- Overview layout ----
  const overviewLeft = new Container([
    programDetailsCard,
    directChildrenCard,
  ], { class: 'app-prog-detail-main' })

  const overviewRail = new Container([
    portfolioMixCard,
    totalsCard,
    datesPanelCard,
  ], { class: 'app-prog-detail-rail' })

  const overviewBody = new Container([overviewLeft, overviewRail], { class: 'app-prog-detail-body' })

  const overviewTab = new View([overviewBody])

  // ----------------------------------------------------------------
  // Tab 2: Umbrella View (D3 tree visualization) — unchanged
  // ----------------------------------------------------------------

  const taggedPrograms = allPrograms.map(p => ({ ...p, _type: 'program' }))
  const taggedProjects = accessibleProjects.map(p => ({ ...p, _type: 'project' }))
  const allNodes = [...taggedPrograms, ...taggedProjects]
  const currentNodeTagged = { ...program, _type: 'program' }

  const treeMountId = 'tree-mount-prog-' + uuid
  const treeMountContainer = new Container([], { class: 'app-tree-mount', id: treeMountId })
  let treeCleanup = null

  const umbrellaTab = new View([
    new Container([
      new Text('Umbrella Structure', { type: 'h3', class: 'app-section-heading' }),
      new Text('Click a node to navigate to it.', { type: 'p', class: 'app-tree-hint' }),
      treeMountContainer
    ], { class: 'app-umbrella-panel' })
  ])

  // ----------------------------------------------------------------
  // Tab 3: Edit — unchanged
  // ----------------------------------------------------------------

  const programNameField = new FormField({ value: program.Title || '' })
  const contextEditField = new FormField({ value: program.Context || '' })
  const sponsorEditField = new FormField({ value: userIdentityToOption(program.ProgramSponsor) || '' })
  const stakeholdersEditField = new FormField({ value: program.Stakeholders || [] })
  const matchingUmbrella = umbrellaOptions.find(o => o.value === program.LinkedPrograms) || null
  const umbrellaEditField = new FormField({ value: matchingUmbrella || '' })
  const pmScopeEditField = new FormField({ value: program.PMScope || '' })

  const saveEditBtn = new Button('Save Changes', {
    variant: 'primary',
    class: 'app-btn-primary',
    onClickHandler: async () => {
      if (!programNameField.value) {
        programNameField.focusOnInput()
        Toast.error('Program name is required', { duration: 4000, autoClose: true })
        return
      }

      saveEditBtn.isLoading = true
      const loading = Toast.loading('Saving...')
      try {
        await siteApi.list(LIST_PROGRAMS).updateItem(program.Id, {
          Title: programNameField.value,
          Context: contextEditField.value,
          ProgramSponsor: optionToUserIdentity(sponsorEditField.value) || '',
          Stakeholders: stakeholdersEditField.value,
          UmbrellaProgram: (umbrellaEditField.value?.label || '').replace(/^\[(?:Program|Project)\]\s*/, ''),
          LinkedPrograms: umbrellaEditField.value?.value || '',
          PMScope: comboValue(pmScopeEditField.value),
        }, program['odata.etag'])
        const [fresh] = await siteApi.list(LIST_PROGRAMS).getItemByUUID(program.UUID)
        if (fresh && fresh['odata.etag']) program['odata.etag'] = fresh['odata.etag']
        loading.success('Program saved')
      } catch (err) {
        console.error('[ProgramDetail] save program:', err)
        loading.error('Failed to save program')
      } finally {
        saveEditBtn.isLoading = false
      }
    }
  })

  let deleteDialog = null
  let deleteTriggerBtn = null

  if (user.accessLevel === 'ADMIN') {
    const linkedProjects = allProjects.filter(p =>
      splitUuids(p.LinkedPrograms).includes(program.UUID) || p.UmbrellaProgram === program.Title
    )
    const subPrograms = allPrograms.filter(p =>
      p.UUID !== program.UUID && p.LinkedPrograms === program.UUID
    )

    const linkedCount = linkedProjects.length
    const subCount = subPrograms.length
    const linkWarning = (linkedCount === 0 && subCount === 0)
      ? 'This program has no linked items.'
      : `${linkedCount} linked project(s) and ${subCount} sub-program(s) will be unlinked (their program link cleared) but will NOT be deleted.`

    const { triggerButton, dialog } = createDeleteAction({
      triggerLabel: 'Delete Program',
      dialogTitle: 'Delete Program',
      message: `Delete "${program.Title}"?`,
      warning: linkWarning,
      confirmLabel: 'Delete Program',
      loadingText: 'Deleting program...',
      successText: 'Program deleted',
      errorText: 'Failed to delete program',
      navigateTo: '/',
      onConfirm: async () => {
        const projectUpdates = linkedProjects.map(proj => {
          const remainingUuids = splitUuids(proj.LinkedPrograms)
            .filter(id => id !== program.UUID)
            .join(';')
          return siteApi.list(LIST_PROJECTS).updateItem(proj.Id, {
            LinkedPrograms: remainingUuids,
            UmbrellaProgram: proj.UmbrellaProgram === program.Title ? '' : proj.UmbrellaProgram
          }, proj['odata.etag'])
        })
        const subProgramUpdates = subPrograms.map(subProg =>
          siteApi.list(LIST_PROGRAMS).updateItem(subProg.Id, {
            LinkedPrograms: '',
            UmbrellaProgram: subProg.UmbrellaProgram === program.Title ? '' : subProg.UmbrellaProgram
          }, subProg['odata.etag'])
        )
        await Promise.all([...projectUpdates, ...subProgramUpdates])
        await siteApi.list(LIST_PROGRAMS).deleteItem(program.Id, program['odata.etag'])
      }
    })

    deleteDialog = dialog
    deleteTriggerBtn = triggerButton
  }

  const editTab = new View([
    createFormSection('Program Details', [
      createLabeledField('Program Name', new TextInput(programNameField), true),
      createLabeledField('Context', new TextArea(contextEditField)),
      createLabeledField('Umbrella Project', new ComboBox(umbrellaEditField, umbrellaOptions, { allowFiltering: true, placeholder: 'Select umbrella project' })),
      createLabeledField('Program Sponsor', new PeoplePicker(sponsorEditField, { placeholder: 'Select sponsor' })),
      createMultiPersonPicker('Stakeholders', stakeholdersEditField),
      createLabeledField('PM Scope', new ComboBox(pmScopeEditField, pmScopeOptions, { allowFiltering: false, placeholder: 'Select PM Scope' })),
    ]),
    new Container([
      saveEditBtn,
      ...(deleteTriggerBtn ? [deleteTriggerBtn] : [])
    ], { class: 'app-action-buttons' })
  ])

  // ----------------------------------------------------------------
  // TabGroup
  // ----------------------------------------------------------------

  const tabGroup = new TabGroup(
    [
      { key: 'overview', label: 'Overview', view: overviewTab },
      { key: 'umbrella', label: 'Umbrella View', view: umbrellaTab },
      { key: 'edit', label: 'Edit', view: editTab },
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

  // ----------------------------------------------------------------
  // Record Header (BNPP spec: title, PROGRAM tag, meta, tabs)
  // ----------------------------------------------------------------

  const programTag = new Text('Program', { type: 'span', class: 'app-prog-type-tag' })

  const metaStr = `${parentProgram ? 'Sub-program' : 'Top level'} · ${childPrograms.length} program${childPrograms.length !== 1 ? 's' : ''} · ${childProjects.length} project${childProjects.length !== 1 ? 's' : ''}`

  const recordHeader = new Container([
    new Container([
      new Container([
        new Text(program.Title, { type: 'h1', class: 'app-record-header__title' }),
        programTag,
      ], { class: 'app-record-header__title-row' }),
      new Text(metaStr, { type: 'span', class: 'app-record-header__meta' }),
      tabGroup,
    ], { class: 'app-record-header' }),
  ], { class: '' })

  return [recordHeader, ...(deleteDialog ? [deleteDialog] : [])]
})
