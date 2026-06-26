import {
  View, Container, Text, TextInput, DateInput, Card, Button, FormField,
  Dialog, Toast, generateUUIDv4, CurrentUser
} from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_PROJECTS, LIST_PROJECT_UPDATES } from '../../../utils/constants.js'
import { createLabeledField, createFormRow } from '../../../utils/form-helpers.js'
import { canPerformAction } from '../../../utils/access-control.js'

export function createUpdatesTab({ project, updates: initialUpdates, siteApi, uuid, effectiveRole }) {
  let updates = initialUpdates

  // Debounce utility
  let updateDebounceTimer = null
  function debounce(fn, ms) {
    return function () {
      clearTimeout(updateDebounceTimer)
      updateDebounceTimer = setTimeout(fn, ms)
    }
  }

  // Sort direction (plain variable -- no reactivity needed)
  let sortDirection = 'desc'

  // Filter state
  const updateSearchField = new FormField({ value: '' })
  updateSearchField.subscribe(debounce(() => refreshTimeline(), 300))
  const dateFromField = new FormField({ value: '' })
  dateFromField.subscribe(() => refreshTimeline())
  const dateToField = new FormField({ value: '' })
  dateToField.subscribe(() => refreshTimeline())

  function buildUpdateTimeline(updatesList, direction) {
    if (updatesList.length === 0) {
      return [new Text('No updates match the current filters.', { type: 'p', class: 'app-empty-state' })]
    }
    const sorted = [...updatesList].sort((a, b) => {
      const diff = new Date(a.UpdateDate) - new Date(b.UpdateDate)
      return direction === 'asc' ? diff : -diff
    })
    return sorted.map(u => new Container([
      new Text(u.UpdateDate, { type: 'p', class: 'app-timeline-date' }),
      new Card([
        new Text(u.Title, { type: 'h3' }),
        ...(u.Achievements ? [new Text('Achievements: ' + u.Achievements, { type: 'p' })] : []),
        ...(u.Roadblocks ? [new Text('Roadblocks: ' + u.Roadblocks, { type: 'p' })] : []),
        ...(u.NextSteps ? [new Text('Next Steps: ' + u.NextSteps, { type: 'p' })] : [])
      ])
    ], { class: 'app-timeline-item' }))
  }

  function getFilteredUpdates(updatesList) {
    let filtered = updatesList

    const query = updateSearchField.value.trim().toLowerCase()
    if (query) {
      filtered = filtered.filter(u => {
        const haystack = [u.Title, u.Achievements, u.Roadblocks, u.NextSteps]
          .map(s => (s || '').toLowerCase())
          .join(' ')
        return haystack.includes(query)
      })
    }

    const from = dateFromField.value
    if (from) {
      filtered = filtered.filter(u => u.UpdateDate >= from)
    }

    const to = dateToField.value
    if (to) {
      filtered = filtered.filter(u => u.UpdateDate <= to)
    }

    return filtered
  }

  function refreshTimeline() {
    const filtered = getFilteredUpdates(updates)
    updatesContainer.children = buildUpdateTimeline(filtered, sortDirection)
  }

  const updatesContainer = new Container(
    buildUpdateTimeline(updates, sortDirection),
    { class: 'app-update-timeline' }
  )

  // Search input
  const searchInput = new TextInput(updateSearchField, { placeholder: 'Search updates...' })
  searchInput.setEventHandler('input', (e) => {
    updateSearchField.value = e.target.value
  })

  // Date filter inputs
  const dateFromInput = new DateInput(dateFromField, { format: 'yyyy-mm-dd' })
  const dateToInput = new DateInput(dateToField, { format: 'yyyy-mm-dd' })

  // Sort toggle button
  const sortBtn = new Button('Newest First', {
    variant: 'secondary',
    onClickHandler: () => {
      sortDirection = sortDirection === 'desc' ? 'asc' : 'desc'
      sortBtn.children = [new Text(sortDirection === 'desc' ? 'Newest First' : 'Oldest First')]
      refreshTimeline()
    }
  })

  // New Update dialog fields
  const updateTitleField = new FormField({ value: '' })
  const achievementsField = new FormField({ value: '' })
  const roadblocksField = new FormField({ value: '' })
  const updateEndDateField = new FormField({ value: project.ExpectedEndDate || '' })
  const nextStepsField = new FormField({ value: '' })

  const newUpdateDialog = new Dialog({
    closeOnFocusLoss: true,
    class: 'app-update-dialog',
    title: 'New Project Update',
    onCloseHandler: () => {
      updateTitleField.value = ''
      achievementsField.value = ''
      roadblocksField.value = ''
      nextStepsField.value = ''
      updateEndDateField.value = project.ExpectedEndDate || ''
    },
    content: [
      createFormRow([
        createLabeledField('Title', new TextInput(updateTitleField)),
        createLabeledField('Expected End Date', new DateInput(updateEndDateField, { format: 'yyyy-mm-dd' })),
      ]),
      createFormRow([
        createLabeledField('Achievements', new TextInput(achievementsField)),
        createLabeledField('Roadblocks', new TextInput(roadblocksField)),
      ]),
      createLabeledField('Next Steps', new TextInput(nextStepsField), false),
      new Button('Submit Update', {
        variant: 'primary',
        onClickHandler: async () => {
          const updateUuid = generateUUIDv4()
          const currentUser = new CurrentUser()
          try {
            await siteApi.list(LIST_PROJECT_UPDATES).createItem({
              Title: updateTitleField.value,
              UUID: updateUuid,
              ProjectUUID: uuid,
              Achievements: achievementsField.value,
              Roadblocks: roadblocksField.value,
              ExpectedEndDate: updateEndDateField.value,
              NextSteps: nextStepsField.value,
              UpdateDate: new Date().toISOString().split('T')[0],
              SubmittedBy: { email: currentUser.get('email'), displayName: currentUser.get('displayName') },
              SubmittedByEmail: currentUser.get('email')
            })
            const newEndDate = updateEndDateField.value
            if (newEndDate && newEndDate !== project.ExpectedEndDate) {
              await siteApi.list(LIST_PROJECTS).updateItem(project.Id, { ExpectedEndDate: newEndDate }, project['odata.etag'])
              project.ExpectedEndDate = newEndDate
            }
            Toast.success('Update added')
            newUpdateDialog.close()
            updates = await siteApi.list(LIST_PROJECT_UPDATES).getItems({ ProjectUUID: uuid })
            refreshTimeline()
          } catch {
            Toast.error('Failed to add update')
          }
        }
      })
    ]
  })

  const canAddUpdate = canPerformAction(effectiveRole, 'addUpdate')

  const newUpdateBtn = canAddUpdate
    ? new Button('New Update', {
        variant: 'primary',
        onClickHandler: () => newUpdateDialog.open()
      })
    : null

  // Toolbar: search, date filters, sort toggle, conditionally new update button
  const toolbarActions = [sortBtn]
  if (newUpdateBtn) toolbarActions.push(newUpdateBtn)

  const updatesToolbar = new Container([
    createLabeledField('Search', searchInput),
    createLabeledField('From', dateFromInput),
    createLabeledField('To', dateToInput),
    new Container(toolbarActions, { class: 'app-updates-toolbar-actions' })
  ], { class: 'app-updates-toolbar' })

  const updatesTab = new View([
    updatesToolbar,
    updatesContainer
  ], { class: 'app-updates-tab' })

  return { view: updatesTab, dialog: newUpdateDialog }
}
