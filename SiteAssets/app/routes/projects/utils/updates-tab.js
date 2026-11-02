import {
  View, Container, Text, TextInput, TextArea, DateInput, Button, FormField,
  Dialog, Toast, generateUUIDv4, CurrentUser, ComboBox, Router
} from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_PROJECTS, LIST_PROJECT_UPDATES, isProjectClosed, PROJECT_STATUS_COMPLETED } from '../../../utils/constants.js'
import { createLabeledField, validatedField } from '../../../utils/form-helpers.js'
import { canPerformAction, canCloseProject } from '../../../utils/access-control.js'
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


export function createUpdatesTab({ project, updates: initialUpdates, siteApi, uuid, effectiveRole, userEmail, siteAccessLevel, onStatusChange }) {
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

      const rightCol = new Container([
        u.Title ? new Text(u.Title, { type: 'h4', class: 'app-timeline-title' }) : null,
        metaLine,
        u.Description ? new Text(u.Description, { type: 'p', class: 'app-timeline-desc' }) : null,
        u.ExpectedEndDate ? new Container([
          new Text('Est. end date', { type: 'span', class: 'app-timeline-section__label' }),
          new Text(u.ExpectedEndDate, { type: 'span', class: 'app-timeline-end-date' })
        ], { class: 'app-timeline-end' }) : null,
      ].filter(Boolean), { class: 'app-timeline-entry__right' })

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
        const haystack = [u.Title, u.Description]
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

  const updateTitleField = new FormField({ value: '', validatorCallback: v => typeof v === 'string' && v.trim().length > 0 })
  const descriptionField = new FormField({ value: '', validatorCallback: v => typeof v === 'string' && v.trim().length > 0 })
  const updateEndDateField = new FormField({ value: project.ExpectedEndDate || '', validatorCallback: v => !v || !project.StartDate || v >= project.StartDate })
  const updateTagField = new FormField({ value: 'Update' })

  // Error summary box shown at the top of the dialog when submit fails.
  // Hidden automatically via CSS :empty when it has no children.
  const errorSummary = new Container([], { class: 'app-form-error-summary' })

  const titleVF = validatedField('Title', new TextInput(updateTitleField, { placeholder: 'Short headline' }), true)
  const descVF  = validatedField('Description', new TextArea(descriptionField, { placeholder: 'Describe what changed...', rows: 5 }), true)
  const tagVF   = validatedField('Tag', new ComboBox(updateTagField, UPDATE_TAGS, { allowFiltering: false }))
  const eedVF   = validatedField('Project estimated end date', new DateInput(updateEndDateField, { format: 'yyyy-mm-dd' }))

  function clearUpdateErrors() {
    errorSummary.children = []
    titleVF.setError(null); descVF.setError(null); eedVF.setError(null)
  }

  const cancelUpdateBtn = new Button('Cancel', {
    variant: 'secondary',
    class: 'app-btn-secondary',
    onClickHandler: () => newUpdateDialog.close()
  })

  const submitUpdateBtn = new Button('Post update', {
    variant: 'primary',
    class: 'app-btn-primary',
    onClickHandler: async () => {
      const errs = []
      if (!updateTitleField.value?.trim()) { titleVF.setError('Required.'); errs.push('Title is required') } else titleVF.setError(null)
      if (!descriptionField.value?.trim()) { descVF.setError('Required.'); errs.push('a description is required') } else descVF.setError(null)
      const eed = updateEndDateField.value
      if (eed && project.StartDate && eed < project.StartDate) {
        eedVF.setError(`Must be on or after ${project.StartDate}.`)
        errs.push('the end date cannot be before the project start date')
      } else eedVF.setError(null)

      if (errs.length) {
        errorSummary.children = [
          new Text(`${errs.length} field${errs.length > 1 ? 's' : ''} need attention`, { type: 'p', class: 'app-form-error-summary__title' }),
          new Text(errs.join(' · '), { type: 'p', class: 'app-form-error-summary__detail' })
        ]
        return
      }

      submitUpdateBtn.isLoading = true
      const loading = Toast.loading('Posting update...')
      try {
        // Guard: re-fetch the project to ensure it has not been closed by another
        // user while this dialog was open. Refuse to post on a closed project.
        const freshCheck = await siteApi.list(LIST_PROJECTS).getItemByUUID(uuid)
        if (freshCheck && freshCheck[0] && isProjectClosed(freshCheck[0])) {
          loading.error('This project has been closed. Reload the page to see the latest state.')
          return
        }

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
          Description: descriptionField.value,
          ExpectedEndDate: updateEndDateField.value,
          UpdateDate: new Date().toISOString().split('T')[0],
          SubmittedBy: { email: currentUser.get('email'), displayName: currentUser.get('displayName') },
          SubmittedByEmail: currentUser.get('email')
        })
        const newEndDate = updateEndDateField.value
        if (newEndDate && newEndDate !== project.ExpectedEndDate) {
          await siteApi.list(LIST_PROJECTS).updateItem(project.Id, { ExpectedEndDate: newEndDate }, project['odata.etag'])
          project.ExpectedEndDate = newEndDate
          // Refresh etag so a subsequent Close/Reopen on the same page does not 412
          const [freshAfterEndDate] = await siteApi.list(LIST_PROJECTS).getItemByUUID(uuid)
          if (freshAfterEndDate?.['odata.etag']) project['odata.etag'] = freshAfterEndDate['odata.etag']
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

  const newUpdateDialog = new Dialog({
    closeOnFocusLoss: false,
    class: 'app-modal-shell app-modal-shell--create',
    title: 'New update',
    onCloseHandler: () => {
      updateTitleField.value = ''
      descriptionField.value = ''
      updateEndDateField.value = project.ExpectedEndDate || ''
      updateTagField.value = 'Update'
      clearUpdateErrors()
    },
    content: [
      errorSummary,
      titleVF.node,
      descVF.node,
      new Container([ tagVF.node, eedVF.node ], { class: 'app-update-fieldrow' }),
      new Container([cancelUpdateBtn, submitUpdateBtn], { class: 'app-modal-actions' })
    ]
  })

  // -------------------------------------------------------------------
  // Close Project dialog (open projects) and Reopen dialog (closed projects)
  // -------------------------------------------------------------------

  const canAddUpdate = canPerformAction(effectiveRole, 'addUpdate')
  const isClosed = isProjectClosed(project)
  const canClose = canCloseProject(project, userEmail, siteAccessLevel)
  const canReopen = siteAccessLevel === 'ADMIN'

  let closeDialog = null
  let closeProjectBtn = null

  if (!isClosed && canClose) {
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
          await siteApi.list(LIST_PROJECTS).updateItem(
            project.Id,
            { Status: PROJECT_STATUS_COMPLETED, CloseDate: closeDate },
            project['odata.etag']
          )
          loading.success('Project closed')
          closeDialog.close()
          // Re-run the route: reconstructs tabs with correct disabled/enabled states
          Router.navigateTo('projects/detail', { query: { uuid } })
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
          `Closing this project marks it as Completed and records the close date. The Edit tab will become read-only and the Project Review tab will unlock. Closure can be reversed by an admin via the Reopen action.`,
          { type: 'p' }
        ),
        createLabeledField('Close Date', new Container([
          new DateInput(closeDateField, { format: 'yyyy-mm-dd' })
        ], { class: 'app-close-date-field' })),
        new Container([cancelCloseBtn, confirmCloseBtn], { class: 'app-modal-actions' })
      ]
    })

    closeProjectBtn = new Button('Close project', {
      variant: 'secondary',
      class: 'app-btn-danger-outline',
      onClickHandler: () => closeDialog.open()
    })
  }

  // -------------------------------------------------------------------
  // Reopen dialog (ADMIN only, closed projects)
  // -------------------------------------------------------------------

  let reopenDialog = null
  let reopenProjectBtn = null

  if (isClosed && canReopen) {
    const confirmReopenBtn = new Button('Reopen project', {
      variant: 'primary',
      class: 'app-btn-primary',
      onClickHandler: async () => {
        confirmReopenBtn.isLoading = true
        const loading = Toast.loading('Reopening project...')
        try {
          await siteApi.list(LIST_PROJECTS).updateItem(
            project.Id,
            { Status: 'In Progress', CloseDate: '' },
            project['odata.etag']
          )
          loading.success('Project reopened')
          reopenDialog.close()
          // Re-run the route: reconstructs tabs with correct disabled/enabled states
          Router.navigateTo('projects/detail', { query: { uuid } })
        } catch (err) {
          console.error('[UpdatesTab] reopen project:', err)
          loading.error('Failed to reopen project')
        } finally {
          if (confirmReopenBtn.isAlive) confirmReopenBtn.isLoading = false
        }
      }
    })

    const cancelReopenBtn = new Button('Cancel', {
      variant: 'secondary',
      class: 'app-btn-secondary',
      onClickHandler: () => reopenDialog.close()
    })

    reopenDialog = new Dialog({
      closeOnFocusLoss: false,
      class: 'app-modal-shell',
      title: `Reopen "${project.Title}"`,
      content: [
        new Text(
          `Reopening the project will set the status back to "In Progress" and clear the close date. Review data (NPS Score, Comments) is preserved. The Edit tab will become editable again and the Project Review tab will be locked.`,
          { type: 'p' }
        ),
        new Container([cancelReopenBtn, confirmReopenBtn], { class: 'app-modal-actions' })
      ]
    })

    reopenProjectBtn = new Button('Reopen project', {
      variant: 'secondary',
      class: 'app-btn-secondary',
      onClickHandler: () => reopenDialog.open()
    })
  }

  // -------------------------------------------------------------------
  // New Update button (hidden when project is closed)
  // -------------------------------------------------------------------

  const newUpdateBtn = canAddUpdate && !isClosed
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
  if (reopenProjectBtn) toolbarRight.push(reopenProjectBtn)

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

  return { view: updatesTab, dialog: newUpdateDialog, closeDialog, reopenDialog }
}
