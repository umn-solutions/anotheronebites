import {
  defineRoute, Container, Text, TextInput, ComboBox, Button, LinkButton,
  Card, FormField, SiteApi, Router, Toast, SystemError, PeoplePicker, CurrentUser
} from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_PROPOSALS } from '../../../utils/constants.js'
import { createDeleteAction } from '../../../utils/delete-entity.js'
import { createLabeledField, createFormSection, createFormRow, userIdentityToOption, optionToUserIdentity, comboValue } from '../../../utils/form-helpers.js'
import { loadDefinitions } from '../../../utils/definitions.js'
import { loadScopes, getScopeOptions } from '../../../utils/scopes.js'
import { statusClass } from '../../../utils/project-card.js'
import { setRouteContext } from '../../../utils/route-context.js'

export default defineRoute(async (config) => {
  const siteApi = new SiteApi()
  const uuid = Router.queryParams.get('uuid')

  if (!uuid) {
    throw new SystemError('MissingUUID', 'No proposal UUID provided in query params')
  }

  const proposals = await siteApi.list(LIST_PROPOSALS).getItemByUUID(uuid)
  const proposal = proposals[0]
  if (!proposal) {
    throw new SystemError('ProposalNotFound', `No proposal found for UUID: ${uuid}`)
  }

  // Access gate: proposals visible to ADMIN, PROJECT_MANAGER, and SubmittedBy
  const user = new CurrentUser()
  const accessLevel = user.accessLevel
  const userEmail = user.get('email').toLowerCase()

  if (accessLevel !== 'ADMIN' && accessLevel !== 'PROJECT_MANAGER') {
    if (!proposal.SubmittedByEmail || proposal.SubmittedByEmail.toLowerCase() !== userEmail) {
      throw new SystemError('AccessDenied', 'You do not have access to this proposal', { breaksFlow: true })
    }
  }

  config.setRouteTitle(proposal.Title)

  // Determine user role for view mode
  const isSubmitter = proposal.SubmittedByEmail && proposal.SubmittedByEmail.toLowerCase() === userEmail
  const canValidate = accessLevel === 'ADMIN' || accessLevel === 'PROJECT_MANAGER'
  const canDelete = accessLevel === 'ADMIN' || isSubmitter

  let currentEtag = proposal['odata.etag']

  // Build delete action (used in both paths, gated by canDelete / accessLevel)
  let deleteDialog = null
  let deleteTriggerBtn = null

  if (canDelete) {
    const { triggerButton, dialog } = createDeleteAction({
      triggerLabel: 'Delete Proposal',
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

  function buildValidateButton() {
    if (!canValidate) return null
    const btn = new Button('Validate Project', {
      variant: 'primary',
      onClickHandler: async () => {
        btn.isLoading = true
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
        } catch {
          loading.error('Failed to validate proposal')
        } finally {
          btn.isLoading = false
        }
      }
    })
    return btn
  }

  // Shared page header for both views
  const pageHeader = new Card([
    new Container([
      new Text(proposal.Title, { type: 'h2' }),
      new Text(proposal.Status || '', { type: 'span', class: statusClass(proposal.Status) })
    ], { class: 'app-detail-title' }),
    new LinkButton('Back to Home', '/', { variant: 'secondary' })
  ], { class: 'app-detail-header' })

  if (isSubmitter) {
    // Editable view for the submitter
    const [defs, scopeItems] = await Promise.all([
      loadDefinitions(siteApi),
      loadScopes(siteApi),
    ])
    const projectTypes = defs.get('ProjectTypes')
    const businessLines = defs.get('BusinessLines')
    const projectStatuses = defs.get('ProjectStatuses')
    const pmScopeOptions = getScopeOptions(scopeItems)

    const contextField = new FormField({ value: proposal.Context || '' })
    const projectTypeField = new FormField({ value: proposal.ProjectType || '' })
    const businessLineField = new FormField({ value: proposal.BusinessLine || '' })
    const sponsorField = new FormField({ value: userIdentityToOption(proposal.Sponsor) || '' })
    const statusField = new FormField({ value: proposal.Status || '' })
    const pmScopeField = new FormField({ value: proposal.PMScope || '' })

    const saveBtn = new Button('Save', {
      variant: 'primary',
      onClickHandler: async () => {
        saveBtn.isLoading = true
        const loading = Toast.loading('Saving proposal...')
        try {
          await siteApi.list(LIST_PROPOSALS).updateItem(proposal.Id, {
            Context: contextField.value,
            ProjectType: comboValue(projectTypeField.value),
            BusinessLine: comboValue(businessLineField.value),
            Sponsor: optionToUserIdentity(sponsorField.value),
            Status: comboValue(statusField.value),
            PMScope: comboValue(pmScopeField.value),
          }, currentEtag)
          const refreshed = await siteApi.list(LIST_PROPOSALS).getItemByUUID(uuid)
          if (refreshed[0]) currentEtag = refreshed[0]['odata.etag']
          loading.success('Proposal updated')
        } catch {
          loading.error('Failed to save proposal')
        } finally {
          saveBtn.isLoading = false
        }
      }
    })

    const validateBtn = buildValidateButton()

    const form = createFormSection('Proposal Details', [
      createLabeledField('Context', new TextInput(contextField)),
      createFormRow([
        createLabeledField('Project Type', new ComboBox(projectTypeField, projectTypes, { allowFiltering: false, allowCreate: true })),
        createLabeledField('Business Line', new ComboBox(businessLineField, businessLines, { allowFiltering: true, allowCreate: true }))
      ]),
      createFormRow([
        createLabeledField('Sponsor', new PeoplePicker(sponsorField, { placeholder: 'Select sponsor' })),
        createLabeledField('Status', new ComboBox(statusField, projectStatuses, { allowFiltering: false }))
      ]),
      createFormRow([
        createLabeledField('PM Scope', new ComboBox(pmScopeField, pmScopeOptions, { allowFiltering: false, placeholder: 'Select PM Scope' })),
      ]),
      new Container([
        saveBtn,
        ...(validateBtn ? [validateBtn] : []),
        ...(deleteTriggerBtn ? [deleteTriggerBtn] : []),
      ], { class: 'app-action-buttons' })
    ])

    return [pageHeader, form, ...(deleteDialog ? [deleteDialog] : [])]
  }

  // Read-only view with Validate button for ADMIN / PROJECT_MANAGER
  function createReadOnlyRow(label, value) {
    return new Container([
      new Text(label, { type: 'span', class: 'app-detail-label' }),
      new Text(value || 'Not specified', {
        type: 'span',
        class: value ? 'app-detail-value' : 'app-detail-value app-detail-value--empty'
      })
    ], { class: 'app-detail-row' })
  }

  const sponsorName = proposal.Sponsor?.displayName || ''

  const readOnlyContent = [
    createReadOnlyRow('Context', proposal.Context),
    createReadOnlyRow('Project Type', proposal.ProjectType),
    createReadOnlyRow('Business Line', proposal.BusinessLine),
    createReadOnlyRow('Sponsor', sponsorName),
    createReadOnlyRow('Status', proposal.Status),
    createReadOnlyRow('PM Scope', proposal.PMScope),
  ]

  const validateBtn = buildValidateButton()

  const readOnlyActionBtns = [
    ...(validateBtn ? [validateBtn] : []),
    ...(accessLevel === 'ADMIN' && deleteTriggerBtn ? [deleteTriggerBtn] : []),
  ]

  const readOnlySection = createFormSection('Proposal Details', [
    ...readOnlyContent,
    ...(readOnlyActionBtns.length ? [new Container(readOnlyActionBtns, { class: 'app-action-buttons' })] : [])
  ])

  return [pageHeader, readOnlySection, ...(accessLevel === 'ADMIN' && deleteDialog ? [deleteDialog] : [])]
})
