import {
  defineRoute, TabGroup, View, Container, Text, TextInput, TextArea, ComboBox,
  Button, FormField, Card, SiteApi, Router, Toast, PeoplePicker, SystemError, Loader, LinkButton,
  CurrentUser
} from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_PROGRAMS, LIST_PROJECTS } from '../../../utils/constants.js'
import { fetchAllDelegations, filterProjectsByAccess } from '../../../utils/access-control.js'
import { createLabeledField, createFormSection, createMultiPersonPicker, userIdentityToOption, optionToUserIdentity, comboValue } from '../../../utils/form-helpers.js'
import { buildTreeData, renderTreeViz } from '../../../utils/tree-viz.js'
import { loadDefinitions } from '../../../utils/definitions.js'

export default defineRoute(async (config) => {
  const siteApi = new SiteApi()
  const uuid = Router.queryParams.get('uuid')

  if (!uuid) {
    throw new SystemError('MissingUUID', 'No program UUID provided in query params')
  }

  const [allPrograms, allProjects, delegations, defs] = await Promise.all([
    siteApi.list(LIST_PROGRAMS).getItems(),
    siteApi.list(LIST_PROJECTS).getItems(),
    fetchAllDelegations(siteApi),
    loadDefinitions(siteApi),
  ])
  const pmScopeOptions = defs.get('PMScope') || []

  const user = new CurrentUser()
  const accessibleProjects = filterProjectsByAccess(allProjects, user.get('email'), user.accessLevel, delegations)

  const program = allPrograms.find(p => p.UUID === uuid)
  if (!program) {
    throw new SystemError('ProgramNotFound', `No program found for UUID: ${uuid}`)
  }

  config.setRouteTitle(program.Title)

  // Build umbrella options (exclude current program to avoid self-reference)
  const umbrellaOptions = allPrograms
    .filter(p => p.UUID !== uuid)
    .map(p => ({ label: p.Title, value: p.UUID }))

  // ----------------------------------------------------------------
  // Tab 1: Overview (read-only)
  // ----------------------------------------------------------------

  function readOnlyRow(label, value) {
    return new Container([
      new Text(label, { type: 'span', class: 'app-detail-label' }),
      new Text(value || '--', {
        type: 'span',
        class: value ? 'app-detail-value' : 'app-detail-value app-detail-value--empty'
      })
    ], { class: 'app-detail-row' })
  }

  const sponsorDisplay = program.ProgramSponsor?.displayName || program.ProgramSponsor?.email || '--'
  const stakeholderDisplay = (() => {
    const raw = program.Stakeholders || []
    const arr = Array.isArray(raw) ? raw : []
    return arr.map(u => u.displayName || u.email).join(', ') || '--'
  })()

  const parentProgram = program.LinkedPrograms
    ? allPrograms.find(p => p.UUID === program.LinkedPrograms)
    : null

  const overviewTab = new View([
    createFormSection('Program Details', [
      readOnlyRow('Context', program.Context),
      readOnlyRow('Sponsor', sponsorDisplay),
      readOnlyRow('Stakeholders', stakeholderDisplay),
      readOnlyRow('Parent Program', parentProgram?.Title || '--'),
    ])
  ])

  // ----------------------------------------------------------------
  // Tab 2: Umbrella View (D3 tree visualization)
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
  // Tab 3: Edit
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
          ProgramSponsor: optionToUserIdentity(sponsorEditField.value),
          Stakeholders: stakeholdersEditField.value,
          UmbrellaProgram: umbrellaEditField.value?.label || '',
          LinkedPrograms: umbrellaEditField.value?.value || '',
          PMScope: comboValue(pmScopeEditField.value),
        }, program['odata.etag'])
        loading.success('Program saved')
      } catch {
        loading.error('Failed to save program')
      } finally {
        saveEditBtn.isLoading = false
      }
    }
  })

  const editTab = new View([
    createFormSection('Program Details', [
      createLabeledField('Program Name', new TextInput(programNameField), true),
      createLabeledField('Context', new TextArea(contextEditField)),
      createLabeledField('Parent Program', new ComboBox(umbrellaEditField, umbrellaOptions, { allowFiltering: true, placeholder: 'Select parent program' })),
      createLabeledField('Program Sponsor', new PeoplePicker(sponsorEditField, { placeholder: 'Select sponsor' })),
      createMultiPersonPicker('Stakeholders', stakeholdersEditField),
      createLabeledField('PM Scope', new ComboBox(pmScopeEditField, pmScopeOptions, { allowFiltering: false, placeholder: 'Select PM Scope' })),
    ]),
    saveEditBtn
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
  // Page Header
  // ----------------------------------------------------------------

  const pageHeader = new Card([
    new Container([
      new Text(program.Title, { type: 'h2' }),
      new Text('Program', { type: 'span', class: 'app-card-type-label' }),
    ], { class: 'app-detail-title' }),
    new LinkButton('Back to Home', '/', { variant: 'secondary' })
  ], { class: 'app-detail-header app-detail-header-card' })

  return [pageHeader, tabGroup]
})
