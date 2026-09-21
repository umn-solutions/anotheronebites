import {
  View, Container, Text, TextInput, TextArea, DateInput, ComboBox, PeoplePicker, FormField, Button, Toast
} from '../../../libs/nofbiz/nofbiz.base.js'
import { GDPR_CLASSIFICATIONS, TARGET_SCOPES, LIST_ALLOCATIONS } from '../../../utils/constants.js'
import {
  createLabeledField, createFormSection, createFormRow,
  createMultiPersonPicker, createGroupMemberPicker, createMultiTargetValuePicker,
  comboValue, optionToUserIdentity
} from '../../../utils/form-helpers.js'

export function createEditTab({ project, umbrellaOptions, projectTypes, techProjects, techPhases, projectStatuses, businessLines, targetTypes, targetValueTypes, effectiveRole, siteApi, pmMemberOptions, allocations, pmScopeOptions = [], deleteButton = null }) {

  // -------------------------------------------------------------------
  // Charter fields
  // -------------------------------------------------------------------

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

  // Read-only expected end date with reason line (if umbrella program set, end date is derived)
  const hasUmbrella = !!(project.LinkedPrograms || project.UmbrellaProgram)
  const endDateInput = new DateInput(endDateField, { isDisabled: hasUmbrella, format: 'yyyy-mm-dd' })

  const endDateField_ = hasUmbrella
    ? new Container([
        endDateInput,
        new Text('Derived from the umbrella project — read only.', {
          type: 'p',
          class: 'app-field-reason'
        })
      ], { class: 'app-readonly-date-field' })
    : endDateInput

  const charterSection = createFormSection('Charter', [
    new Container([
      new Text('* required', { type: 'span', class: 'app-section-meta' })
    ], { class: 'app-section-header-meta' }),
    createFormRow([
      createLabeledField('Project Name', new TextInput(projectNameField), true),
      createLabeledField('Project Manager', pmPicker)
    ]),
    createLabeledField('Context', new TextInput(contextField)),
    createLabeledField('Objectives', new TextInput(objectivesField)),
    createLabeledField('Scope / Out of Scope', new TextArea(scopeField, { placeholder: 'Describe what is in scope and out of scope' })),
    createFormRow([
      createLabeledField('Project Type', new ComboBox(projectTypeField, projectTypes, { allowFiltering: false, allowCreate: true })),
      createLabeledField('GDPR Classification', new ComboBox(gdprField, GDPR_CLASSIFICATIONS, { allowFiltering: false }))
    ]),
    createFormRow([
      createLabeledField('Start Date', new DateInput(startDateField, { format: 'yyyy-mm-dd' })),
      createLabeledField('Expected End Date', endDateField_)
    ]),
    createLabeledField('Umbrella Project', new ComboBox(umbrellaField, umbrellaOptions, { allowFiltering: true, allowCreate: true })),
    techFieldsContainer
  ])

  // -------------------------------------------------------------------
  // Governance fields
  // -------------------------------------------------------------------

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

  // -------------------------------------------------------------------
  // Impact fields
  // -------------------------------------------------------------------

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

  // -------------------------------------------------------------------
  // Dirty flag and sticky footer
  // -------------------------------------------------------------------

  let isCharteryDirty = false
  let isGovernanceDirty = false
  let isImpactDirty = false

  const stickyFooter = new Container([], { class: 'app-sticky-save-bar app-sticky-save-bar--hidden' })

  function updateStickyBar() {
    const dirty = isCharteryDirty || isGovernanceDirty || isImpactDirty
    if (!stickyFooter.isAlive) return
    if (dirty) {
      const dirtySections = [
        isCharteryDirty ? 'Charter' : null,
        isGovernanceDirty ? 'Governance' : null,
        isImpactDirty ? 'Impact' : null,
      ].filter(Boolean)
      const labelText = dirtySections.length === 1
        ? `Unsaved changes in `
        : `${dirtySections.length} sections have unsaved changes`
      const sectionLabel = dirtySections.length === 1 ? dirtySections[0] : ''
      stickyFooter.children = [
        new Text(labelText, { type: 'span', class: 'app-sticky-save-bar__label' }),
        ...(sectionLabel ? [new Text(sectionLabel, { type: 'strong', class: 'app-sticky-save-bar__section' })] : []),
        new Container([discardBtn, saveChangesBtn], { class: 'app-sticky-save-bar__actions' })
      ]
      stickyFooter.instance?.removeClass('app-sticky-save-bar--hidden')
    } else {
      stickyFooter.children = []
      stickyFooter.instance?.addClass('app-sticky-save-bar--hidden')
    }
  }

  // Mark charter dirty when any field changes
  const charterFields = [projectNameField, contextField, objectivesField, projectTypeField, gdprField, scopeField, startDateField, endDateField, umbrellaField, techProjectField, techPhaseField, projectManagerField]
  charterFields.forEach(f => f.subscribe(() => { isCharteryDirty = true; updateStickyBar() }))

  const governanceFields = [businessLineField, productField, sponsorField, stakeholdersField, pmMembersField, statusField, pmScopeField]
  governanceFields.forEach(f => f.subscribe(() => { isGovernanceDirty = true; updateStickyBar() }))

  const impactFields = [targetTypeField, targetValuesField, targetScopeField]
  impactFields.forEach(f => f.subscribe(() => { isImpactDirty = true; updateStickyBar() }))

  // -------------------------------------------------------------------
  // Allocation helper
  // -------------------------------------------------------------------

  function deleteAllocationByEmail(email) {
    const record = allocations.find(a =>
      (a.UserEmail || '').toLowerCase() === email.toLowerCase()
    )
    if (!record) return Promise.resolve()
    return siteApi.list(LIST_ALLOCATIONS).deleteItem(record.Id, record['odata.etag'])
      .catch(() => Toast.warning('Could not remove allocation for ' + email))
  }

  // -------------------------------------------------------------------
  // Save functions
  // -------------------------------------------------------------------

  async function saveCharter() {
    const umbrellaLabel = umbrellaField.value?.label || ''
    const data = {
      Title: projectNameField.value,
      ProjectManager: optionToUserIdentity(projectManagerField.value) || '',
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
    await siteApi.list('Projects').updateItem(project.Id, data, project['odata.etag'])
    const [fresh] = await siteApi.list('Projects').getItemByUUID(project.UUID)
    if (fresh && fresh['odata.etag']) project['odata.etag'] = fresh['odata.etag']

    // Clean up old PM allocation when PM changes
    const newPmEmail = (optionToUserIdentity(projectManagerField.value)?.email || '').toLowerCase()
    const oldPmEmail = (project.ProjectManagerEmail || '').toLowerCase()
    if (oldPmEmail && newPmEmail !== oldPmEmail) {
      const storedMemberEmails = (project.PMMembersEmail || '').split(';').map(s => s.trim().toLowerCase()).filter(Boolean)
      if (!storedMemberEmails.includes(oldPmEmail)) {
        await deleteAllocationByEmail(oldPmEmail)
      }
    }

    isCharteryDirty = false
  }

  async function saveGovernance() {
    const data = {
      BusinessLine: comboValue(businessLineField.value),
      Product: productField.value,
      Sponsor: optionToUserIdentity(sponsorField.value) || '',
      Stakeholders: stakeholdersField.value,
      PMMembers: pmMembersField.value,
      PMMembersEmail: (pmMembersField.value || []).map(ui => ui.email).join(';'),
      Status: comboValue(statusField.value),
      PMScope: comboValue(pmScopeField.value),
    }
    await siteApi.list('Projects').updateItem(project.Id, data, project['odata.etag'])
    const [fresh] = await siteApi.list('Projects').getItemByUUID(project.UUID)
    if (fresh && fresh['odata.etag']) project['odata.etag'] = fresh['odata.etag']

    const oldEmails = (project.PMMembersEmail || '').split(';').map(s => s.trim().toLowerCase()).filter(Boolean)
    const newEmails = (pmMembersField.value || []).map(ui => ui.email.toLowerCase())
    const removed = oldEmails.filter(e => !newEmails.includes(e))
    if (removed.length) {
      const currentPmEmail = (optionToUserIdentity(projectManagerField.value)?.email || project.ProjectManagerEmail || '').toLowerCase()
      const toDelete = removed.filter(e => e !== currentPmEmail)
      if (toDelete.length) await Promise.all(toDelete.map(deleteAllocationByEmail))
    }

    isGovernanceDirty = false
  }

  async function saveImpact() {
    const data = {
      TargetType: comboValue(targetTypeField.value),
      TargetValues: targetValuesField.value,
      TargetScope: comboValue(targetScopeField.value),
    }
    await siteApi.list('Projects').updateItem(project.Id, data, project['odata.etag'])
    const [fresh] = await siteApi.list('Projects').getItemByUUID(project.UUID)
    if (fresh && fresh['odata.etag']) project['odata.etag'] = fresh['odata.etag']
    isImpactDirty = false
  }

  // -------------------------------------------------------------------
  // Sticky footer buttons
  // -------------------------------------------------------------------

  const discardBtn = new Button('Discard', {
    variant: 'secondary',
    class: 'app-btn-secondary',
    onClickHandler: () => {
      // Reset fields to original project data
      projectNameField.value = project.Title || ''
      contextField.value = project.Context || ''
      objectivesField.value = project.Objectives || ''
      projectTypeField.value = project.ProjectType || ''
      gdprField.value = project.GDPRClassification || ''
      scopeField.value = project.Scope || ''
      startDateField.value = project.StartDate || ''
      endDateField.value = project.ExpectedEndDate || ''
      umbrellaField.value = umbrellaOptions.find(o => o.value === project.LinkedPrograms) || ''
      techProjectField.value = project.TechProject || ''
      techPhaseField.value = project.TechPhase || ''
      businessLineField.value = project.BusinessLine || ''
      productField.value = project.Product || ''
      stakeholdersField.value = project.Stakeholders || []
      pmMembersField.value = project.PMMembers || []
      statusField.value = project.Status || ''
      pmScopeField.value = project.PMScope || ''
      targetTypeField.value = project.TargetType || ''
      targetValuesField.value = project.TargetValues || []
      targetScopeField.value = project.TargetScope || ''
      isCharteryDirty = false
      isGovernanceDirty = false
      isImpactDirty = false
      updateStickyBar()
    }
  })

  const saveChangesBtn = new Button('Save changes', {
    variant: 'primary',
    class: 'app-btn-primary',
    onClickHandler: async () => {
      saveChangesBtn.isLoading = true
      const loading = Toast.loading('Saving...')
      try {
        if (isCharteryDirty) await saveCharter()
        if (isGovernanceDirty) await saveGovernance()
        if (isImpactDirty) await saveImpact()
        loading.success('Saved')
        updateStickyBar()
      } catch (err) {
        console.error('[EditTab] save changes:', err)
        loading.error('Failed to save')
      } finally {
        if (saveChangesBtn.isAlive) saveChangesBtn.isLoading = false
      }
    }
  })

  return new View([
    charterSection,
    governanceSection,
    impactSection,
    ...(deleteButton ? [new Container([deleteButton], { class: 'app-danger-zone' })] : []),
    stickyFooter
  ])
}
