import {
  View, Container, TextInput, TextArea, DateInput, ComboBox, PeoplePicker, FormField, Button, Toast
} from '../../../libs/nofbiz/nofbiz.base.js'
import { GDPR_CLASSIFICATIONS, TARGET_SCOPES, LIST_ALLOCATIONS } from '../../../utils/constants.js'
import { createLabeledField, createFormSection, createFormRow, createMultiPersonPicker, createGroupMemberPicker, createMultiTargetValuePicker, comboValue, optionToUserIdentity } from '../../../utils/form-helpers.js'

export function createEditTab({ project, umbrellaOptions, projectTypes, techProjects, techPhases, projectStatuses, businessLines, targetTypes, targetValueTypes, effectiveRole, siteApi, pmMemberOptions, allocations, pmScopeOptions = [] }) {
  // -- Charter fields --

  const projectNameField = new FormField({ value: project.Title || '' })
  const projectManagerField = new FormField({ value: '' })
  const contextField = new FormField({ value: project.Context || '' })
  const objectivesField = new FormField({ value: project.Objectives || '' })
  const projectTypeField = new FormField({ value: project.ProjectType || '' })
  const gdprField = new FormField({ value: project.GDPRClassification || '' })
  const scopeField = new FormField({ value: project.Scope || '' })
  const startDateField = new FormField({ value: project.StartDate || '' })
  const endDateField = new FormField({ value: project.ExpectedEndDate || '' })
  const matchingUmbrella = umbrellaOptions.find(o => o.value === project.LinkedPrograms) || null
  const umbrellaField = new FormField({ value: matchingUmbrella || '' })

  const techProjectField = new FormField({ value: project.TechProject || '' })
  const techPhaseField = new FormField({ value: project.TechPhase || '' })
  const techProjectCombo = new ComboBox(techProjectField, techProjects, { allowFiltering: true })
  const techPhaseCombo = new ComboBox(techPhaseField, techPhases, { allowFiltering: false })

  const techFieldsContainer = new Container(
    project.ProjectType === 'Tech'
      ? [createLabeledField('Tech Project', techProjectCombo), createLabeledField('Tech Phase', techPhaseCombo)]
      : []
  )

  projectTypeField.subscribe((val) => {
    techFieldsContainer.children = val?.value === 'Tech'
      ? [createLabeledField('Tech Project', techProjectCombo), createLabeledField('Tech Phase', techPhaseCombo)]
      : []
  })

  const pmPicker = new PeoplePicker(projectManagerField, { placeholder: 'Select Project Manager' })
  if (project.ProjectManager?.email) {
    pmPicker.resolveUser(project.ProjectManager.email)
  }

  const charterSection = createFormSection('Charter', [
    createFormRow([
      createLabeledField('Project Name', new TextInput(projectNameField), true),
      createLabeledField('Project Manager', pmPicker)
    ]),
    createLabeledField('Context', new TextInput(contextField)),
    createLabeledField('Objectives', new TextInput(objectivesField)),
    createFormRow([
      createLabeledField('Project Type', new ComboBox(projectTypeField, projectTypes, { allowFiltering: false, allowCreate: true })),
      createLabeledField('GDPR Classification', new ComboBox(gdprField, GDPR_CLASSIFICATIONS, { allowFiltering: false }))
    ]),
    createFormRow([
      createLabeledField('Start Date', new DateInput(startDateField, { format: 'yyyy-mm-dd' })),
      createLabeledField('Expected End Date', new DateInput(endDateField, { isDisabled: true, format: 'yyyy-mm-dd' }))
    ]),
    createLabeledField('Scope/Out of Scope', new TextArea(scopeField, { placeholder: 'Describe what is in scope and out of scope' })),
    createLabeledField('Umbrella Program', new ComboBox(umbrellaField, umbrellaOptions, { allowFiltering: true, allowCreate: true })),
    techFieldsContainer
  ])

  // -- Governance fields --

  const businessLineField = new FormField({ value: project.BusinessLine || '' })
  const productField = new FormField({ value: project.Product || '' })
  const sponsorField = new FormField({ value: '' })
  const sponsorPicker = new PeoplePicker(sponsorField, { placeholder: 'Select sponsor' })
  if (project.Sponsor?.email) {
    sponsorPicker.resolveUser(project.Sponsor.email)
  }
  const stakeholdersField = new FormField({ value: project.Stakeholders || [] })
  const pmMembersField = new FormField({ value: project.PMMembers || [] })
  const statusField = new FormField({ value: project.Status || '' })
  const pmScopeField = new FormField({ value: project.PMScope || '' })

  const governanceSection = createFormSection('Governance', [
    createFormRow([
      createLabeledField('Business Line', new ComboBox(businessLineField, businessLines, { allowFiltering: true, allowCreate: true })),
      createLabeledField('Product', new TextInput(productField))
    ]),
    createFormRow([
      createLabeledField('Sponsor', sponsorPicker),
      createMultiPersonPicker('Stakeholders', stakeholdersField)
    ]),
    createFormRow([
      createGroupMemberPicker('PM Members', pmMembersField, pmMemberOptions),
      createLabeledField('Status', new ComboBox(statusField, projectStatuses, { allowFiltering: false }))
    ]),
    createFormRow([
      createLabeledField('PM Scope', new ComboBox(pmScopeField, pmScopeOptions, { allowFiltering: false })),
    ])
  ])

  // -- Impact fields --

  const targetTypeField = new FormField({ value: project.TargetType || '' })
  const targetValuesField = new FormField({ value: project.TargetValues || [] })
  const targetScopeField = new FormField({ value: project.TargetScope || '' })
  const impactSection = createFormSection('Project Impact', [
    createFormRow([
      createLabeledField('Target Type', new ComboBox(targetTypeField, targetTypes, { allowFiltering: false })),
      createLabeledField('Target Scope', new ComboBox(targetScopeField, TARGET_SCOPES, { allowFiltering: true }))
    ]),
    createMultiTargetValuePicker('Target Values', targetValuesField, targetValueTypes)
  ])

  // -- Save Buttons --

  function deleteAllocationByEmail(email) {
    const record = allocations.find(a =>
      (a.UserEmail || '').toLowerCase() === email.toLowerCase()
    )
    if (!record) return Promise.resolve()
    return siteApi.list(LIST_ALLOCATIONS).deleteItem(record.Id, record['odata.etag'])
      .catch(() => Toast.warning('Could not remove allocation for ' + email))
  }

  function createSaveButton(label, buildData, afterSave) {
    const btn = new Button(label, {
      variant: 'primary',
      onClickHandler: async () => {
        btn.isLoading = true
        const loading = Toast.loading('Saving...')
        try {
          await siteApi.list('Projects').updateItem(project.Id, buildData(), project['odata.etag'])
          loading.success('Saved')
          if (afterSave) {
            try { await afterSave() } catch { /* best-effort */ }
          }
        } catch {
          loading.error('Failed to save')
        } finally {
          btn.isLoading = false
        }
      }
    })
    return btn
  }

  const saveCharterBtn = createSaveButton('Save Charter', () => {
    const umbrellaLabel = umbrellaField.value?.label || ''
    return {
      Title: projectNameField.value,
      ProjectManager: optionToUserIdentity(projectManagerField.value),
      ProjectManagerEmail: optionToUserIdentity(projectManagerField.value)?.email || '',
      Context: contextField.value,
      Objectives: objectivesField.value,
      ProjectType: comboValue(projectTypeField.value),
      GDPRClassification: comboValue(gdprField.value),
      Scope: scopeField.value,
      StartDate: startDateField.value,
      ExpectedEndDate: endDateField.value,
      UmbrellaProgram: umbrellaLabel.replace(/^\[(?:Program|Project)\]\s*/, ''),
      LinkedPrograms: umbrellaField.value?.value || '',
      TechProject: comboValue(techProjectField.value),
      TechPhase: comboValue(techPhaseField.value),
    }
  }, async () => {
    const newPmEmail = (optionToUserIdentity(projectManagerField.value)?.email || '').toLowerCase()
    const oldPmEmail = (project.ProjectManagerEmail || '').toLowerCase()
    if (!oldPmEmail || newPmEmail === oldPmEmail) return
    const storedMemberEmails = (project.PMMembersEmail || '').split(';').map(s => s.trim().toLowerCase()).filter(Boolean)
    if (storedMemberEmails.includes(oldPmEmail)) return
    await deleteAllocationByEmail(oldPmEmail)
  })

  const saveGovernanceBtn = createSaveButton('Save Governance', () => ({
    BusinessLine: comboValue(businessLineField.value),
    Product: productField.value,
    Sponsor: optionToUserIdentity(sponsorField.value),
    Stakeholders: stakeholdersField.value,
    PMMembers: pmMembersField.value,
    PMMembersEmail: (pmMembersField.value || []).map(ui => ui.email).join(';'),
    Status: comboValue(statusField.value),
    PMScope: comboValue(pmScopeField.value),
  }), async () => {
    const oldEmails = (project.PMMembersEmail || '').split(';').map(s => s.trim().toLowerCase()).filter(Boolean)
    const newEmails = (pmMembersField.value || []).map(ui => ui.email.toLowerCase())
    const removed = oldEmails.filter(e => !newEmails.includes(e))
    if (!removed.length) return
    const currentPmEmail = (optionToUserIdentity(projectManagerField.value)?.email || project.ProjectManagerEmail || '').toLowerCase()
    const toDelete = removed.filter(e => e !== currentPmEmail)
    if (toDelete.length) await Promise.all(toDelete.map(deleteAllocationByEmail))
  })

  const saveImpactBtn = createSaveButton('Save Impact', () => ({
    TargetType: comboValue(targetTypeField.value),
    TargetValues: targetValuesField.value,
    TargetScope: comboValue(targetScopeField.value),
  }))

  return new View([
    charterSection,
    new Container([saveCharterBtn], { class: 'app-charter-actions' }),
    governanceSection,
    new Container([saveGovernanceBtn], { class: 'app-charter-actions' }),
    impactSection,
    new Container([saveImpactBtn], { class: 'app-charter-actions' }),
  ])
}
