import {
  defineRoute, Container, Text, TextInput, TextArea, ComboBox, Button,
  FormField, SiteApi, Router, Toast, SystemError, PeoplePicker, CurrentUser
} from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_PROPOSALS, QUERY_PARAM_PROPOSAL } from '../../../utils/constants.js'
import { createDeleteAction } from '../../../utils/delete-entity.js'
import { createLabeledField, createFormSection, createFormRow, userIdentityToOption, optionToUserIdentity, comboValue } from '../../../utils/form-helpers.js'
import { loadDefinitions } from '../../../utils/definitions.js'
import { loadScopes, getScopeOptions } from '../../../utils/scopes.js'
import { statusClass } from '../../../utils/project-card.js'
import { fetchUserScopes, isScopeOrCreatorVisible, canValidateProposal } from '../../../utils/access-control.js'

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

  // ----------------------------------------------------------------
  // Editable form fields
  // ----------------------------------------------------------------

  const [defs, scopeItems] = await Promise.all([
    loadDefinitions(siteApi),
    loadScopes(siteApi),
  ])
  const projectTypes = defs.get('ProjectTypes')
  const businessLines = defs.get('BusinessLines')
  const projectStatuses = defs.get('ProjectStatuses')
  const pmScopeOptions = getScopeOptions(scopeItems)

  // ---- FormFields ----
  const contextField = new FormField({ value: proposal.Context || '' })
  const projectTypeField = new FormField({ value: proposal.ProjectType || '' })
  const businessLineField = new FormField({ value: proposal.BusinessLine || '' })
  const sponsorField = new FormField({ value: userIdentityToOption(proposal.Sponsor) || '' })
  const pmScopeField = new FormField({ value: proposal.PMScope || '' })
  const statusField = new FormField({ value: proposal.Status ? { label: proposal.Status, value: proposal.Status } : { label: 'In Progress', value: 'In Progress' } })

  // ---- Validate button (ADMIN or P4P members only) ----
  const validateBtn = canValidateProposal(accessLevel, userScopes)
    ? new Button('Validate as project', {
        class: 'app-btn-primary',
        onClickHandler: () => Router.navigateTo('projects/new', { query: { [QUERY_PARAM_PROPOSAL]: uuid } }),
      })
    : null

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

  // ---- Form section with labeled fields ----
  const formSection = new Container([
    // Heading row
    new Container([
      new Text('Proposal details', { type: 'h2' }),
      new Text('Editable', { type: 'span', class: 'app-section-card__meta' }),
    ], { class: 'app-create-section__heading-row' }),
    // Context full-width
    new Container([
      createLabeledField('Context', new TextArea(contextField)),
    ], { class: 'app-prop-context-area' }),
    // 2-up: category + business line
    new Container([
      createLabeledField('Category', new ComboBox(projectTypeField, projectTypes, { allowFiltering: false, allowCreate: true })),
      createLabeledField('Business line', new ComboBox(businessLineField, businessLines, { allowFiltering: true, allowCreate: true })),
    ], { class: 'app-create-fields-2up' }),
    // 2-up: sponsor + pm scope
    new Container([
      createLabeledField('Sponsor', new PeoplePicker(sponsorField, { placeholder: 'Select sponsor' })),
      createLabeledField('PM scope', new ComboBox(pmScopeField, pmScopeOptions, { allowFiltering: false, placeholder: 'Select PM scope' })),
    ], { class: 'app-create-fields-2up' }),
    // Status ComboBox
    createLabeledField('Status', new ComboBox(statusField, projectStatuses, { allowFiltering: false })),
    // Action row
    new Container([
      ...(deleteTriggerBtn ? [deleteTriggerBtn] : []),
      new Container([
        ...(validateBtn ? [validateBtn] : []),
        saveBtn,
      ], { class: 'app-prop-action-row__right' }),
    ], { class: 'app-prop-action-row' }),
  ], { class: 'app-form-section' })

  // ---- Body area ----
  const bodyArea = new Container([formSection], { class: 'app-prop-detail-body' })

  // ----------------------------------------------------------------
  // Record header (title + status pill)
  // ----------------------------------------------------------------

  const recordHeader = new Container([
    new Container([
      new Text(proposal.Title, { type: 'h1', class: 'app-record-header__title' }),
      new Text(proposal.Status || '', { type: 'span', class: statusClass(proposal.Status) }),
    ], { class: 'app-record-header__title-row' }),
  ], { class: 'app-record-header' })

  return [recordHeader, bodyArea, ...(deleteDialog ? [deleteDialog] : [])]
})
