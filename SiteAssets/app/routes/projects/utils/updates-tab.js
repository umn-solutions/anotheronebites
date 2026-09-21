import {
  View, Container, Text, TextInput, DateInput, Button, FormField,
  Dialog, Toast, generateUUIDv4, CurrentUser, ComboBox
} from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_PROJECTS, LIST_PROJECT_UPDATES } from '../../../utils/constants.js'
import { createLabeledField, createFormRow } from '../../../utils/form-helpers.js'
import { canPerformAction } from '../../../utils/access-control.js'
import { styleAfterRender } from '../../../utils/dynamic-style.js'

// Tag options for project updates. Stored as a plain string on the update record.
// All existing updates without a Tag field default to 'Update' on display.
const UPDATE_TAGS = ['Update', 'Milestone', 'Risk', 'Decision']

// Marker colour ramp by entry age index (newest = index 0 gets primary green)
const MARKER_RAMP = ['#00965E', '#39A87B', '#6ABB97', '#8BC8AA', '#8BC8AA']

// Tag-to-CSS-class mapping — pastel pill colours defined in route.css
const TAG_CLASS = {
  Milestone: 'app-timeline-tag--milestone',
  Risk:      'app-timeline-tag--risk',
  Decision:  'app-timeline-tag--decision',
  Update:    'app-timeline-tag--update',
}

function markerColor(index) {
  return MARKER_RAMP[Math.min(index, MARKER_RAMP.length - 1)]
}

export function createUpdatesTab({ project, updates: initialUpdates, siteApi, uuid, effectiveRole, onStatusChange }) {
  let updates = initialUpdates

  // Sort direction
  let sortDirection = 'desc'

  // Filter state
  const updateSearchField = new FormField({ value: '' })
  const dateFromField = new FormField({ value: '' })
  const dateToField = new FormField({ value: '' })

  let searchDebounceTimer = null
  updateSearchField.subscribe(() => {
    clearTimeout(searchDebounceTimer)
    searchDebounceTimer = setTimeout(() => refreshTimeline(), 300)
  })
  dateFromField.subscribe(() => refreshTimeline())
  dateToField.subscribe(() => refreshTimeline())

  // -------------------------------------------------------------------
  // Timeline builder
  // -------------------------------------------------------------------

  function buildUpdateTimeline(updatesList, direction) {
    if (updatesList.length === 0) {
      return [
        new Container([
          new Container([
            new Container([], { class: 'app-empty-state__icon' }),
            new Text('No updates match the current filters.', { type: 'p', class: 'app-empty-state__heading' }),
            new Text('Try adjusting the search or date range.', { type: 'p', class: 'app-empty-state__desc' })
          ], { class: 'app-empty-state' })
        ])
      ]
    }

    const sorted = [...updatesList].sort((a, b) => {
      const diff = new Date(a.UpdateDate) - new Date(b.UpdateDate)
      return direction === 'asc' ? diff : -diff
    })

    return sorted.map((u, idx) => {
      const tag = u.Tag || 'Update'
      const tagClass = TAG_CLASS[tag] || TAG_CLASS.Update
      const color = markerColor(idx)

      // Author display name (never email per data-conventions)
      const submittedBy = typeof u.SubmittedBy === 'object' && u.SubmittedBy !== null
        ? (u.SubmittedBy.displayName || u.SubmittedBy.email || '')
        : String(u.SubmittedBy || '')

      const metaLine = new Container([
        new Text(u.UpdateDate || '', { type: 'span', class: 'app-timeline-meta__date' }),
        new Text(tag, { type: 'span', class: `app-timeline-tag ${tagClass}` }),
        submittedBy ? new Text(`· ${submittedBy}`, { type: 'span', class: 'app-timeline-meta__author' }) : null
      ].filter(Boolean), { class: 'app-timeline-meta' })

      const bodyLines = [
        u.Achievements ? new Text(u.Achievements, { type: 'p', class: 'app-timeline-body' }) : null,
        u.Roadblocks ? new Text(`Roadblocks: ${u.Roadblocks}`, { type: 'p', class: 'app-timeline-body app-timeline-body--roadblock' }) : null,
        u.NextSteps ? new Text(`Next steps: ${u.NextSteps}`, { type: 'p', class: 'app-timeline-body app-timeline-body--nextsteps' }) : null,
      ].filter(Boolean)

      const rightCol = new Container([
        metaLine,
        ...bodyLines
      ], { class: 'app-timeline-entry__right' })

      return new Container([
        styleAfterRender(new Container([], { class: 'app-timeline-entry__left' }), { '--marker-color': color }),
        rightCol
      ], { class: 'app-timeline-entry' })
    })
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
    const totalShown = filtered.length
    const totalAll = updates.length
    headingMetaText.children = [`${totalShown} of ${totalAll} shown`]
    updatesContainer.children = buildUpdateTimeline(filtered, sortDirection)
  }

  // -------------------------------------------------------------------
  // Updates card content
  // -------------------------------------------------------------------

  const headingMetaText = new Text(`${updates.length} of ${updates.length} shown`, {
    type: 'span',
    class: 'app-section-card__meta'
  })

  const updatesContainer = new Container(
    buildUpdateTimeline(updates, sortDirection),
    { class: 'app-timeline-list' }
  )

  // -------------------------------------------------------------------
  // New Update dialog
  // -------------------------------------------------------------------

  const updateTitleField = new FormField({ value: '' })
  const achievementsField = new FormField({ value: '' })
  const roadblocksField = new FormField({ value: '' })
  const updateEndDateField = new FormField({ value: project.ExpectedEndDate || '' })
  const nextStepsField = new FormField({ value: '' })
  const updateTagField = new FormField({ value: 'Update' })

  const submitUpdateBtn = new Button('Post update', {
    variant: 'primary',
    class: 'app-btn-primary',
    onClickHandler: async () => {
      if (!updateTitleField.value?.trim()) {
        Toast.error('Title is required')
        return
      }
      submitUpdateBtn.isLoading = true
      const loading = Toast.loading('Posting update...')
      try {
        const updateUuid = generateUUIDv4()
        const currentUser = new CurrentUser()
        const tagVal = typeof updateTagField.value === 'object'
          ? (updateTagField.value.value || 'Update')
          : (updateTagField.value || 'Update')
        await siteApi.list(LIST_PROJECT_UPDATES).createItem({
          Title: updateTitleField.value,
          UUID: updateUuid,
          ProjectUUID: uuid,
          Tag: tagVal,
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
        loading.success('Update posted')
        newUpdateDialog.close()
        updates = await siteApi.list(LIST_PROJECT_UPDATES).getItems({ ProjectUUID: uuid })
        refreshTimeline()
      } catch (err) {
        console.error('[UpdatesTab] post update:', err)
        loading.error('Failed to post update')
      } finally {
        if (submitUpdateBtn.isAlive) submitUpdateBtn.isLoading = false
      }
    }
  })

  const cancelUpdateBtn = new Button('Cancel', {
    variant: 'secondary',
    class: 'app-btn-secondary',
    onClickHandler: () => newUpdateDialog.close()
  })

  const newUpdateDialog = new Dialog({
    closeOnFocusLoss: false,
    class: 'app-modal-shell app-modal-shell--create',
    title: 'New update',
    onCloseHandler: () => {
      updateTitleField.value = ''
      achievementsField.value = ''
      roadblocksField.value = ''
      nextStepsField.value = ''
      updateEndDateField.value = project.ExpectedEndDate || ''
      updateTagField.value = 'Update'
    },
    content: [
      createLabeledField('Title', new TextInput(updateTitleField, { placeholder: 'What happened?' })),
      createLabeledField('Achievements', new TextInput(achievementsField, { placeholder: 'What was achieved?' })),
      createLabeledField('Roadblocks', new TextInput(roadblocksField, { placeholder: 'What is blocking?' })),
      createLabeledField('Next steps', new TextInput(nextStepsField, { placeholder: 'What comes next?' })),
      createFormRow([
        createLabeledField('Tag', new ComboBox(updateTagField, UPDATE_TAGS, { allowFiltering: false })),
        createLabeledField('Date', new DateInput(updateEndDateField, { format: 'yyyy-mm-dd' }))
      ]),
      new Container([cancelUpdateBtn, submitUpdateBtn], { class: 'app-modal-actions' })
    ]
  })

  // -------------------------------------------------------------------
  // Close Project dialog
  // -------------------------------------------------------------------

  const canAddUpdate = canPerformAction(effectiveRole, 'addUpdate')
  const canClose = canPerformAction(effectiveRole, 'close')

  let closeDialog = null
  let closeProjectBtn = null

  if (canClose) {
    const closeDateField = new FormField({ value: new Date().toISOString().split('T')[0] })

    const confirmCloseBtn = new Button('Close project', {
      variant: 'danger',
      class: 'app-btn-danger-solid',
      onClickHandler: async () => {
        const closeDate = closeDateField.value
        if (!closeDate) {
          Toast.error('Close date is required')
          return
        }
        confirmCloseBtn.isLoading = true
        const loading = Toast.loading('Closing project...')
        try {
          const updatedItems = await siteApi.list(LIST_PROJECTS).updateItem(
            project.Id,
            { Status: 'Completed', CloseDate: closeDate },
            project['odata.etag']
          )
          if (updatedItems && updatedItems[0] && updatedItems[0]['odata.etag']) {
            project['odata.etag'] = updatedItems[0]['odata.etag']
          } else {
            const refreshed = await siteApi.list(LIST_PROJECTS).getItemByUUID(uuid)
            if (refreshed && refreshed[0]) {
              project['odata.etag'] = refreshed[0]['odata.etag']
            }
          }
          project.Status = 'Completed'
          project.CloseDate = closeDate
          onStatusChange && onStatusChange('Completed')
          loading.success('Project closed')
          closeDialog.close()
          closeProjectBtn.isDisabled = true
          closeProjectBtn.children = [new Text('Project Closed')]
        } catch (err) {
          console.error('[UpdatesTab] close project:', err)
          loading.error('Failed to close project')
        } finally {
          if (confirmCloseBtn.isAlive) confirmCloseBtn.isLoading = false
        }
      }
    })

    const cancelCloseBtn = new Button('Cancel', {
      variant: 'secondary',
      class: 'app-btn-secondary',
      onClickHandler: () => closeDialog.close()
    })

    closeDialog = new Dialog({
      closeOnFocusLoss: false,
      class: 'app-modal-shell app-modal-shell--danger',
      title: `Close "${project.Title}"`,
      content: [
        new Text(
          `Closing this project marks it as Completed and records the close date. The status can be changed back at any time from the Edit tab.`,
          { type: 'p' }
        ),
        createLabeledField('Close Date', new Container([
          new DateInput(closeDateField, { format: 'yyyy-mm-dd' })
        ], { class: 'app-close-date-field' })),
        new Container([cancelCloseBtn, confirmCloseBtn], { class: 'app-modal-actions' })
      ]
    })

    const isAlreadyClosed = project.Status === 'Completed'
    closeProjectBtn = isAlreadyClosed
      ? new Button('Project Closed', { variant: 'secondary', class: 'app-btn-danger-outline', isDisabled: true })
      : new Button('Close project', {
          variant: 'secondary',
          class: 'app-btn-danger-outline',
          onClickHandler: () => closeDialog.open()
        })
  }

  // -------------------------------------------------------------------
  // New Update button
  // -------------------------------------------------------------------

  const newUpdateBtn = canAddUpdate
    ? new Button('New update', {
        variant: 'primary',
        class: 'app-btn-primary',
        onClickHandler: () => newUpdateDialog.open()
      })
    : null

  // -------------------------------------------------------------------
  // Sort toggle
  // -------------------------------------------------------------------

  const sortBtn = new Button('Newest first', {
    variant: 'secondary',
    class: 'app-btn-secondary app-sort-toggle',
    onClickHandler: () => {
      sortDirection = sortDirection === 'desc' ? 'asc' : 'desc'
      sortBtn.children = [new Text(sortDirection === 'desc' ? 'Newest first' : 'Oldest first')]
      refreshTimeline()
    }
  })

  // -------------------------------------------------------------------
  // Filter toolbar (plain card — no left accent)
  // -------------------------------------------------------------------

  const toolbarRight = [sortBtn]
  if (newUpdateBtn) toolbarRight.push(newUpdateBtn)
  if (closeProjectBtn) toolbarRight.push(closeProjectBtn)

  const toolbar = new Container([
    new Container([
      createLabeledField('Search', new TextInput(updateSearchField, { placeholder: 'Search updates...' }))
    ], { class: 'app-updates-toolbar__search' }),
    createLabeledField('From', new DateInput(dateFromField, { format: 'yyyy-mm-dd' })),
    createLabeledField('To', new DateInput(dateToField, { format: 'yyyy-mm-dd' })),
    new Container([], { class: 'app-updates-toolbar__divider' }),
    new Container(toolbarRight, { class: 'app-updates-toolbar__actions' })
  ], { class: 'app-updates-toolbar' })

  // -------------------------------------------------------------------
  // Updates card (heading + count + timeline)
  // -------------------------------------------------------------------

  const updatesCard = new Container([
    new Container([
      new Text('Updates', { type: 'h3', class: 'app-section-card__heading' }),
      headingMetaText
    ], { class: 'app-section-card__heading-row app-updates-card__heading' }),
    updatesContainer
  ], { class: 'app-section-card app-updates-card' })

  const updatesTab = new View([
    toolbar,
    updatesCard
  ], { class: 'app-updates-tab' })

  return { view: updatesTab, dialog: newUpdateDialog, closeDialog }
}
