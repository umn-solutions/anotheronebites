import {
  defineRoute, Container, Text, TextInput, TextArea, ComboBox, Button,
  FormField, SiteApi, Router, Toast, SystemError, PeoplePicker, CurrentUser
} from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_PROPOSALS } from '../../../utils/constants.js'
import { createDeleteAction } from '../../../utils/delete-entity.js'
import { createLabeledField, createFormSection, createFormRow, userIdentityToOption, optionToUserIdentity, comboValue } from '../../../utils/form-helpers.js'
import { loadDefinitions } from '../../../utils/definitions.js'
import { loadScopes, getScopeOptions } from '../../../utils/scopes.js'
import { statusClass } from '../../../utils/project-card.js'
import { setRouteContext } from '../../../utils/route-context.js'
import { fetchUserScopes, isScopeOrCreatorVisible } from '../../../utils/access-control.js'

export default defineRoute(async (config) => {
  const siteApi = new SiteApi()
  const uuid = Router.queryParams.get('uuid')

  if (!uuid) {
    throw new SystemError('MissingUUID', 'No proposal UUID provided in query params')
  }

  let proposals
  try {
    proposals = await siteApi.list(LIST_PROPOSALS).getItemByUUID(uuid)
  } catch (err) {
    console.error('[ProposalDetail] Failed to fetch proposal', err)
    throw new SystemError('ProposalFetchError', 'Failed to load proposal', { breaksFlow: true })
  }

  const proposal = proposals[0]
  if (!proposal) {
    throw new SystemError('ProposalNotFound', `No proposal found for UUID: ${uuid}`)
  }

  // Access gate: ADMIN sees all; untagged proposals are creator+ADMIN only; scoped proposals require scope membership or creator
  const user = new CurrentUser()
  const accessLevel = user.accessLevel
  const userEmail = user.get('email').toLowerCase()

  let userScopes = new Set()
  try {
    userScopes = await fetchUserScopes(siteApi, userEmail)
  } catch (err) {
    console.error('[ProposalDetail] Failed to fetch user scopes', err)
  }

  if (!isScopeOrCreatorVisible(proposal, userEmail, accessLevel, userScopes, false)) {
    throw new SystemError('AccessDenied', 'You do not have access to this proposal', { breaksFlow: true })
  }

  const isSubmitter = !!(proposal.SubmittedByEmail && proposal.SubmittedByEmail.toLowerCase() === userEmail)

  config.setRouteTitle(proposal.Title)

  const canValidate = accessLevel === 'ADMIN'
  const canDelete = accessLevel === 'ADMIN' || isSubmitter

  let currentEtag = proposal['odata.etag']

  // ----------------------------------------------------------------
  // Delete action (all paths)
  // ----------------------------------------------------------------

  let deleteDialog = null
  let deleteTriggerBtn = null

  if (canDelete) {
    const { triggerButton, dialog } = createDeleteAction({
      triggerLabel: 'Delete proposal',
      dialogTitle: 'Delete Proposal',
      message: `Delete "${proposal.Title}"?`,
      warning: 'This proposal will be permanently deleted. This cannot be undone.',
      confirmLabel: 'Delete Proposal',
      loadingText: 'Deleting proposal...',
      successText: 'Proposal deleted',
      errorText: 'Failed to delete proposal',
      navigateTo: '/',
      onConfirm: async () => {
        await siteApi.list(LIST_PROPOSALS).deleteItem(proposal.Id, currentEtag)
      }
    })
    deleteDialog = dialog
    deleteTriggerBtn = triggerButton
  }

  // ----------------------------------------------------------------
  // Record header helpers
  // ----------------------------------------------------------------

  function initials(name) {
    if (!name) return '?'
    return name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
  }

  const submitterName = proposal.SubmittedBy?.displayName || proposal.SubmittedBy?.email || ''
  const raisedDate = proposal.Created
    ? new Date(proposal.Created).toISOString().split('T')[0]
    : (proposal.StartDate || '')

  // "Last updated N minutes ago" — derived from Modified if available, else Created
  function lastSavedLabel() {
    const raw = proposal.Modified || proposal.Created
    if (!raw) return 'Last updated: unknown'
    const diff = Math.round((Date.now() - new Date(raw).getTime()) / 60000)
    if (diff < 1) return 'Last updated just now'
    if (diff < 60) return `Last updated ${diff} minute${diff !== 1 ? 's' : ''} ago`
    const hrs = Math.round(diff / 60)
    return `Last updated ${hrs} hour${hrs !== 1 ? 's' : ''} ago`
  }

  // ----------------------------------------------------------------
  // Editable view (for submitter OR if canValidate — we show the full
  // editable form to both submitters and PM/ADMIN so Validate button
  // is always available on the same form).
  // ----------------------------------------------------------------

  const [defs, scopeItems] = await Promise.all([
    loadDefinitions(siteApi),
    loadScopes(siteApi),
  ])
  const projectTypes = defs.get('ProjectTypes')
  const businessLines = defs.get('BusinessLines')
  const pmScopeOptions = getScopeOptions(scopeItems)

  // ---- FormFields ----
  const contextField = new FormField({ value: proposal.Context || '' })
  const projectTypeField = new FormField({ value: proposal.ProjectType || '' })
  const businessLineField = new FormField({ value: proposal.BusinessLine || '' })
  const sponsorField = new FormField({ value: userIdentityToOption(proposal.Sponsor) || '' })
  const pmScopeField = new FormField({ value: proposal.PMScope || '' })

  // Status as selectable pills — three options per spec
  const STATUS_OPTIONS = ['Pipeline', 'Under review', 'On Hold']
  const statusField = new FormField({ value: proposal.Status || 'Pipeline' })

  // ---- Required field definitions ----
  // title (read-only on detail), context, projectType, sponsor
  const REQUIRED_FIELDS = [
    { key: 'title', label: 'Title', getValue: () => proposal.Title },
    { key: 'context', label: 'Context', getValue: () => contextField.value },
    { key: 'projectType', label: 'Project type', getValue: () => comboValue(projectTypeField.value) },
    { key: 'sponsor', label: 'Sponsor', getValue: () => comboValue(sponsorField.value?.value?.email || sponsorField.value?.email || '') },
  ]

  function getReadinessState() {
    const met = REQUIRED_FIELDS.filter(f => !!f.getValue())
    const unmet = REQUIRED_FIELDS.filter(f => !f.getValue())
    return { met, unmet, count: met.length, total: REQUIRED_FIELDS.length }
  }

  // ---- Status pill group ----
  function statusPillClass(option, current) {
    const key = option.toLowerCase().replace(/\s+/g, '-')
    if (comboValue(current) === option) {
      const map = {
        'pipeline': 'app-status-pill app-status-pill--selected-pipeline',
        'under-review': 'app-status-pill app-status-pill--selected-under-review',
        'on-hold': 'app-status-pill app-status-pill--selected-on-hold',
      }
      return map[key] || 'app-status-pill'
    }
    return 'app-status-pill'
  }

  const pillsContainer = new Container([], { class: 'app-status-pill-group__pills' })

  function renderStatusPills() {
    const currentVal = comboValue(statusField.value)
    pillsContainer.children = STATUS_OPTIONS.map(opt => new Button(opt, {
      class: statusPillClass(opt, currentVal),
      onClickHandler: () => { statusField.value = opt }
    }))
  }

  statusField.subscribe(() => renderStatusPills())
  renderStatusPills()

  const statusPillGroup = new Container([
    new Text('Status', { type: 'span', class: 'app-status-pill-group__label' }),
    pillsContainer,
  ], { class: 'app-status-pill-group' })

  // ---- Validate button (primary, disabled until required filled) ----
  const tooltipText = new Text('', { type: 'span', class: 'app-validate-tooltip' })

  const validateBtn = canValidate ? new Button('Validate as project', {
    variant: 'primary',
    class: 'app-btn-primary',
    onClickHandler: async () => {
      const { unmet } = getReadinessState()
      if (unmet.length > 0) return
      validateBtn.isLoading = true
      const loading = Toast.loading('Validating proposal...')
      try {
        await siteApi.list(LIST_PROPOSALS).deleteItem(proposal.Id, currentEtag)
        setRouteContext({
          source: 'proposal',
          title: proposal.Title,
          context: proposal.Context,
          projectType: proposal.ProjectType,
          businessLine: proposal.BusinessLine,
          sponsor: proposal.Sponsor,
          status: proposal.Status,
        })
        loading.success('Proposal validated')
        Router.navigateTo('projects/new')
      } catch (err) {
        console.error('[ProposalDetail] validate proposal:', err)
        loading.error('Failed to validate proposal')
      } finally {
        validateBtn.isLoading = false
      }
    }
  }) : null

  // Tooltip wrapper for the validate button
  const tooltipContainer = new Container([
    tooltipText,
    ...(validateBtn ? [validateBtn] : [])
  ], { class: 'app-validate-btn-wrapper' })

  // ---- Save button ----
  const saveBtn = new Button('Save', {
    variant: 'secondary',
    class: 'app-btn-secondary',
    onClickHandler: async () => {
      saveBtn.isLoading = true
      const loading = Toast.loading('Saving proposal...')
      try {
        await siteApi.list(LIST_PROPOSALS).updateItem(proposal.Id, {
          Context: contextField.value,
          ProjectType: comboValue(projectTypeField.value),
          BusinessLine: comboValue(businessLineField.value),
          Sponsor: optionToUserIdentity(sponsorField.value) || '',
          Status: comboValue(statusField.value),
          PMScope: comboValue(pmScopeField.value),
        }, currentEtag)
        const refreshed = await siteApi.list(LIST_PROPOSALS).getItemByUUID(uuid)
        if (refreshed[0]) currentEtag = refreshed[0]['odata.etag']
        loading.success('Proposal updated')
      } catch (err) {
        console.error('[ProposalDetail] save proposal:', err)
        loading.error('Failed to save proposal')
      } finally {
        saveBtn.isLoading = false
      }
    }
  })

  // ---- Readiness rail ----
  const countNumText = new Text('0', { type: 'span', class: 'app-readiness-count__num' })

  const readinessCount = new Container([
    countNumText,
    new Text('of ' + REQUIRED_FIELDS.length, { type: 'span', class: 'app-readiness-count__num' }),
    new Text('required fields', { type: 'span', class: 'app-readiness-count__label' }),
  ], { class: 'app-readiness-count' })

  const initialPct = (() => {
    const { count, total } = getReadinessState()
    return total > 0 ? (count / total) * 100 : 0
  })()

  const readinessBarFill = new Container([], {
    class: 'app-readiness-bar__fill',
    style: `width:${initialPct}%`
  })
  const readinessBar = new Container([readinessBarFill], { class: 'app-readiness-bar' })

  const readinessList = new Container([], { class: 'app-readiness-list' })

  function updateReadiness() {
    const { met, unmet, count, total } = getReadinessState()
    const pct = total > 0 ? (count / total) * 100 : 0

    // Update count display via Text ref (no .instance access)
    countNumText.children = [String(count)]

    // Update bar fill width (post-render, data-driven — acceptable use of .instance.css)
    readinessBarFill.instance?.css({ width: `${pct}%` })

    // Update checklist
    readinessList.children = [
      ...met.map(f => new Container([
        new Container([], { class: 'app-readiness-disc app-readiness-disc--met' }),
        new Text(f.label, { type: 'span', class: 'app-readiness-item__label' }),
      ], { class: 'app-readiness-item' })),
      ...unmet.map(f => new Container([
        new Container([], { class: 'app-readiness-disc app-readiness-disc--unmet' }),
        new Text(f.label, { type: 'span', class: 'app-readiness-item__label app-readiness-item__label--unmet' }),
      ], { class: 'app-readiness-item' })),
    ]

    // Update validate button disabled state
    if (validateBtn) {
      const isDisabled = unmet.length > 0
      tooltipContainer.instance?.attr('data-disabled', isDisabled ? 'true' : 'false')
      const missing = unmet.map(f => f.label).join(', ')
      // Update tooltip text via Text ref (no .instance.find access)
      tooltipText.children = [isDisabled ? `Missing: ${missing}` : '']
      validateBtn.isDisabled = isDisabled
      // Class toggle for opacity visual (post-render — acceptable)
      if (isDisabled) {
        validateBtn.instance?.addClass('app-btn-primary--disabled-pending')
      } else {
        validateBtn.instance?.removeClass('app-btn-primary--disabled-pending')
      }
    }
  }

  // Subscribe fields to readiness re-compute
  contextField.subscribe(() => updateReadiness())
  projectTypeField.subscribe(() => updateReadiness())
  sponsorField.subscribe(() => updateReadiness())

  // Initial readiness render — synchronous, no setTimeout needed since we use component refs
  updateReadiness()

  const validationInfoPanel = new Container([
    new Text('What validation does', { type: 'span', class: 'app-validation-info-panel__label' }),
    new Text(
      'Validates this proposal as a project. The title, context, project type and sponsor are carried over. You can complete the full charter from the Edit tab after creation.',
      { type: 'p', class: 'app-validation-info-panel__body' }
    ),
  ], { class: 'app-validation-info-panel' })

  const readinessRail = new Container([
    new Container([
      readinessCount,
      readinessBar,
      readinessList,
    ], { class: 'app-section-card' }),
    validationInfoPanel,
  ], { class: 'app-prop-detail-rail' })

  // ---- Form section with labeled fields ----
  const formSection = new Container([
    // Heading row
    new Container([
      new Text('Proposal details', { type: 'h2' }),
      new Text('Editable until validated', { type: 'span', class: 'app-section-card__meta' }),
    ], { class: 'app-create-section__heading-row' }),
    // Context full-width
    new Container([
      createLabeledField('Context', new TextArea(contextField)),
    ], { class: 'app-prop-context-area' }),
    // 2-up: project type + business line
    new Container([
      createLabeledField('Project type', new ComboBox(projectTypeField, projectTypes, { allowFiltering: false, allowCreate: true })),
      createLabeledField('Business line', new ComboBox(businessLineField, businessLines, { allowFiltering: true, allowCreate: true })),
    ], { class: 'app-create-fields-2up' }),
    // 2-up: sponsor + pm scope
    new Container([
      createLabeledField('Sponsor', new PeoplePicker(sponsorField, { placeholder: 'Select sponsor' })),
      createLabeledField('PM scope', new ComboBox(pmScopeField, pmScopeOptions, { allowFiltering: false, placeholder: 'Select PM scope' })),
    ], { class: 'app-create-fields-2up' }),
    // Status pill group
    statusPillGroup,
    // Action row
    new Container([
      ...(deleteTriggerBtn ? [deleteTriggerBtn] : []),
      new Container([
        saveBtn,
        tooltipContainer,
      ], { class: 'app-prop-action-row__right' }),
    ], { class: 'app-prop-action-row' }),
  ], { class: 'app-form-section' })

  // ---- Body grid ----
  const bodyGrid = new Container([
    formSection,
    readinessRail,
  ], { class: 'app-prop-detail-body' })

  // ----------------------------------------------------------------
  // Record header (BNPP spec: title, status pill, raised by, last saved)
  // ----------------------------------------------------------------

  const metaRow = new Container([
    new Text(
      `Raised ${raisedDate}${submitterName ? ' by ' + submitterName : ''}`,
      { type: 'span', class: 'app-prop-header-meta__raised' }
    ),
    new Text(lastSavedLabel(), { type: 'span', class: 'app-prop-header-meta__saved' }),
  ], { class: 'app-prop-header-meta' })

  const recordHeader = new Container([
    new Container([
      new Text(proposal.Title, { type: 'h1', class: 'app-record-header__title' }),
      new Text(proposal.Status || '', { type: 'span', class: statusClass(proposal.Status) }),
    ], { class: 'app-record-header__title-row' }),
    metaRow,
  ], { class: 'app-record-header' })

  return [recordHeader, bodyGrid, ...(deleteDialog ? [deleteDialog] : [])]
})
