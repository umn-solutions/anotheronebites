import {
  View, Container, Text, TextInput, DateInput, ComboBox, PeoplePicker, FormField, Button, Toast
} from '../../../libs/nofbiz/nofbiz.base.js'
import { GDPR_CLASSIFICATIONS, TARGET_SCOPES, LIST_ALLOCATIONS, LIST_PROJECTS, PROJECT_STATUS_COMPLETED } from '../../../utils/constants.js'
import { canPerformAction } from '../../../utils/access-control.js'
import {
  createLabeledField, createFormSection, createFormRow,
  createMultiPersonPicker, createGroupMemberPicker, createMultiTargetValuePicker,
  comboValue, optionToUserIdentity, buildSubCategoryChildren, bindSubCategoryToCategory,
  resetComboToStored, resetPeoplePickerToStored, toIdentityList
} from '../../../utils/form-helpers.js'
import { getSubCategoryOptions } from '../../../utils/definitions.js'

export function createEditTab({ project, umbrellaCtx, umbrellaCurrent, createUmbrellaPicker, seedUmbrellaCurrent, resolveUmbrellaOption = null, projectTypes, techProjects, techPhases, projectStatuses, businessLines, targetTypes, targetValueTypes, effectiveRole, siteApi, pmMemberOptions, allocations, pmScopeOptions = [], deleteButton = null, subCategoryMap = null, isClosed = false, onProjectSaved = null }) {

  const canEdit = canPerformAction(effectiveRole, 'edit')

  // Exclude Completed from status options while the project is open so users cannot
  // manually set it -- Completed is written only by the Close action in updates-tab.js.
  // When the project is already closed the disabled ComboBox must include Completed in
  // its dataset or _syncDatasetFromField finds no matching option and renders blank.
  const filteredStatuses = isClosed
    ? projectStatuses
    : projectStatuses.filter(s => s !== PROJECT_STATUS_COMPLETED)

  // -------------------------------------------------------------------
  // Charter fields
  // -------------------------------------------------------------------

  const projectNameField = new FormField({ value: project.Title || '' })
  const projectManagerField = new FormField({ value: '' })
  const contextField = new FormField({ value: project.Context || '' })
  const objectivesField = new FormField({ value: project.Objectives || '' })
  const projectTypeField = new FormField({ value: project.ProjectType || '' })
  const gdprField = new FormField({ value: project.GDPRClassification || '' })
  const startDateField = new FormField({ value: project.StartDate || '' })
  const endDateField = new FormField({ value: project.ExpectedEndDate || '' })
  const umbrellaField = new FormField({ value: umbrellaCurrent || '' })

  const techProjectField = new FormField({ value: project.TechProject || '' })
  const techPhaseField = new FormField({ value: project.TechPhase || '' })

  // Factory creates fresh ComboBox instances each time tech fields mount.
  // Avoids calling .dataset on an unmounted element (renders into the default
  // container selector). Field values must be set to the desired state BEFORE the
  // subscriber fires (e.g. during discard) so the new instances pre-check correctly.
  function buildTechFields() {
    return [
      createLabeledField('Tech Project', new ComboBox(techProjectField, techProjects, { allowFiltering: true, isDisabled: isClosed })),
      createLabeledField('Tech Phase', new ComboBox(techPhaseField, techPhases, { allowFiltering: false, isDisabled: isClosed })),
    ]
  }

  // Construct projectTypeCombo BEFORE registering any subscribers on projectTypeField.
  // Secondary defence: constructor normalisation fires with no subscribers attached.
  // Primary defence: bindSubCategoryToCategory's initialParent guard covers
  // ComboBox.render() re-fires (_onSelectHandlerProxy on first render).
  const projectTypeCombo = new ComboBox(projectTypeField, projectTypes, { allowFiltering: false, allowCreate: true, isDisabled: isClosed })

  const techFieldsContainer = new Container(
    project.ProjectType === 'Tech' ? buildTechFields() : []
  )

  // comboValue handles both option objects and raw strings; discard assigns a plain
  // string temporarily before the dataset setter normalises it.
  projectTypeField.subscribe((val) => {
    techFieldsContainer.children = comboValue(val) === 'Tech' ? buildTechFields() : []
  })

  // Sub Category -- options depend on the selected category
  const subCategoryField = new FormField({ value: project.SubCategory || '' })
  const initialSubCatOpts = getSubCategoryOptions(subCategoryMap, project.ProjectType || '')
  const subCategoryContainer = new Container(
    buildSubCategoryChildren(subCategoryField, initialSubCatOpts, { disabled: isClosed }),
    { class: 'app-subcategory-field' },
  )

  // Keep sub category in sync with category. Uses initialParent guard so render-time
  // re-fires (ComboBox.render calls _onSelectHandlerProxy when option is checked) do
  // not wipe a pre-loaded sub category value on first render.
  bindSubCategoryToCategory({
    categoryField: projectTypeField,
    subCategoryField,
    container: subCategoryContainer,
    subCategoryMap,
    initialParent: project.ProjectType || '',
    disabled: isClosed,
  })

  const pmPicker = new PeoplePicker(projectManagerField, { placeholder: 'Select Project Manager', isDisabled: isClosed })
  resetPeoplePickerToStored(pmPicker, projectManagerField, project.ProjectManager)

  // Read-only expected end date with reason line (if umbrella program set, end date is derived)
  const hasUmbrella = !!(project.LinkedPrograms || project.UmbrellaProgram)
  const endDateInput = new DateInput(endDateField, { isDisabled: hasUmbrella || isClosed, format: 'yyyy-mm-dd' })

  const endDateField_ = hasUmbrella
    ? new Container([
        endDateInput,
        new Text('Derived from the umbrella project — read only.', {
          type: 'p',
          class: 'app-field-reason'
        })
      ], { class: 'app-readonly-date-field' })
    : endDateInput

  // Pass isDisabled at construction time so _isDisabled is set before render.
  // FormControl.set isDisabled guards on isAlive (DOM presence), so it is a no-op
  // before first render -- the prop must be wired through the constructor instead.
  const umbrellaPicker = createUmbrellaPicker(umbrellaField, umbrellaCtx, { isDisabled: isClosed })
  seedUmbrellaCurrent(umbrellaPicker, umbrellaField, umbrellaCurrent)

  // Extract combo instances so discard can call resetComboToStored on each one.
  const gdprCombo = new ComboBox(gdprField, GDPR_CLASSIFICATIONS, { allowFiltering: false, isDisabled: isClosed })

  const charterSection = createFormSection('Charter', [
    new Container([
      new Text('* required', { type: 'span', class: 'app-section-meta' })
    ], { class: 'app-section-header-meta' }),
    createFormRow([
      createLabeledField('Project Name', new TextInput(projectNameField, { isDisabled: isClosed }), true),
      createLabeledField('Project Manager', pmPicker)
    ]),
    createLabeledField('Context', new TextInput(contextField, { isDisabled: isClosed })),
    createLabeledField('Objectives', new TextInput(objectivesField, { isDisabled: isClosed })),
    createFormRow([
      createLabeledField('Category', projectTypeCombo),
      createLabeledField('GDPR Classification', gdprCombo)
    ]),
    subCategoryContainer,
    createFormRow([
      createLabeledField('Start Date', new DateInput(startDateField, { format: 'yyyy-mm-dd', isDisabled: isClosed })),
      createLabeledField('Expected End Date', endDateField_)
    ]),
    createLabeledField('Umbrella Project', umbrellaPicker),
    techFieldsContainer
  ])

  // -------------------------------------------------------------------
  // Governance fields
  // -------------------------------------------------------------------

  const businessLineField = new FormField({ value: project.BusinessLine || '' })
  const productField = new FormField({ value: project.Product || '' })
  // A2: Sponsor is now a UserIdentity[] (multi-person). toIdentityList normalizes legacy single objects.
  const sponsorsField = new FormField({ value: toIdentityList(project.Sponsor) })
  const stakeholdersField = new FormField({ value: project.Stakeholders || [] })
  const pmMembersField = new FormField({ value: project.PMMembers || [] })
  const statusField = new FormField({ value: project.Status || '' })
  const pmScopeField = new FormField({ value: project.PMScope || '' })

  // A1: P4P PM field — single-select ComboBox, Contributing projects only.
  // The field is always constructed so dirty-tracking and discard can reference it;
  // it is only shown in the UI when project.Role === 'Contributing'.
  const p4pPmField = new FormField({ value: '' })
  if (project.P4PPM && typeof project.P4PPM === 'object' && project.P4PPM.email) {
    const storedOpt = pmMemberOptions.find(opt => (opt.value?.email || '').toLowerCase() === project.P4PPM.email.toLowerCase())
    p4pPmField.value = storedOpt || { label: project.P4PPM.displayName || project.P4PPM.email, value: project.P4PPM }
  }
  const p4pPmCombo = new ComboBox(p4pPmField, pmMemberOptions, {
    allowFiltering: true,
    placeholder: 'Select P4P PM',
    isDisabled: isClosed,
  })

  const businessLineCombo = new ComboBox(businessLineField, businessLines, { allowFiltering: true, allowCreate: true, isDisabled: isClosed })
  const statusCombo = new ComboBox(statusField, filteredStatuses, { allowFiltering: false, isDisabled: isClosed })
  const pmScopeCombo = new ComboBox(pmScopeField, pmScopeOptions, { allowFiltering: false, isDisabled: isClosed })

  const governancePeopleRows = [
    createFormRow([
      // A2: multi-person sponsor picker
      createMultiPersonPicker('Sponsors', sponsorsField, false, { disabled: isClosed }),
      createMultiPersonPicker('Stakeholders', stakeholdersField, false, { disabled: isClosed })
    ]),
    createFormRow([
      createGroupMemberPicker('PM Members', pmMembersField, pmMemberOptions, false, { disabled: isClosed }),
      createLabeledField('Status', statusCombo)
    ]),
  ]

  // A1: P4P PM row — only for Contributing projects
  if (project.Role === 'Contributing') {
    governancePeopleRows.push(createLabeledField('P4P PM', p4pPmCombo))
  }

  const governanceSection = createFormSection('Governance', [
    createFormRow([
      createLabeledField('Business Line', businessLineCombo),
      createLabeledField('Product', new TextInput(productField, { isDisabled: isClosed }))
    ]),
    ...governancePeopleRows,
    createFormRow([
      createLabeledField('PM Scope', pmScopeCombo),
    ])
  ])

  // -------------------------------------------------------------------
  // Impact fields
  // -------------------------------------------------------------------

  const targetTypeField = new FormField({ value: project.TargetType || '' })
  const targetValuesField = new FormField({ value: project.TargetValues || [] })
  const targetScopeField = new FormField({ value: project.TargetScope || '' })

  const targetTypeCombo = new ComboBox(targetTypeField, targetTypes, { allowFiltering: false, isDisabled: isClosed })
  const targetScopeCombo = new ComboBox(targetScopeField, TARGET_SCOPES, { allowFiltering: true, isDisabled: isClosed })

  const impactSection = createFormSection('Project Impact', [
    createFormRow([
      createLabeledField('Target Type', targetTypeCombo),
      createLabeledField('Target Scope', targetScopeCombo)
    ]),
    createMultiTargetValuePicker('Target Values', targetValuesField, targetValueTypes, { disabled: isClosed })
  ])

  // -------------------------------------------------------------------
  // Dirty flag and sticky footer
  // -------------------------------------------------------------------

  let isCharteryDirty = false
  let isGovernanceDirty = false
  let isImpactDirty = false

  // Set to true when the PM picker's emitted email differs from the stored project email.
  // Prevents writing to SharePoint when the picker holds the seeded value or is empty
  // (no stored person). Reset to false on discard so a discarded pick is not written
  // on the next save.
  let pmPickerTouched = false

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

  // Dirty tracking and sticky footer only apply when the project is open.
  // When closed all controls are disabled so no user-driven changes can occur.
  if (!isClosed) {
    // Subscribe fields using value comparison so that ComboBox re-fires on initial
    // render (which re-emits the stored value) and discard resets are both filtered
    // out without a timing-based re-baseline. The stored value is read via a getter
    // at subscriber call time, so it reflects saves (Object.assign(project, lastFresh))
    // correctly.
    //
    // watchField compares comboValue(newVal) to the stored string. Handles both
    // ComboBoxOptionProps objects and raw strings emitted by field resets.
    function watchField(field, getStored, onDirty) {
      field.subscribe((val) => {
        if (comboValue(val) === (getStored() || '')) return
        onDirty()
      })
    }

    // watchPickerField is the people-picker variant: compares emails case-insensitively
    // so that seeding the stored person via resetPeoplePickerToStored never marks dirty,
    // while a genuine user selection (different person or clear) does. Also sets the
    // touched flag so saveCharter/saveGovernance includes the field in the SP update.
    function watchPickerField(field, getStoredEmail, setTouched, onDirty) {
      field.subscribe((val) => {
        const newEmail = (val?.value?.email || val?.email || '').toLowerCase()
        const storedEmail = (getStoredEmail() || '').toLowerCase()
        if (newEmail === storedEmail) return
        setTouched(true)
        onDirty()
      })
    }

    const markCharteryDirty = () => { isCharteryDirty = true; updateStickyBar() }
    const markGovernanceDirty = () => { isGovernanceDirty = true; updateStickyBar() }
    const markImpactDirty = () => { isImpactDirty = true; updateStickyBar() }

    // Charter fields
    watchField(projectNameField, () => project.Title, markCharteryDirty)
    watchField(contextField, () => project.Context, markCharteryDirty)
    watchField(objectivesField, () => project.Objectives, markCharteryDirty)
    watchField(projectTypeField, () => project.ProjectType, markCharteryDirty)
    watchField(subCategoryField, () => project.SubCategory, markCharteryDirty)
    watchField(gdprField, () => project.GDPRClassification, markCharteryDirty)
    watchField(startDateField, () => project.StartDate, markCharteryDirty)
    watchField(endDateField, () => project.ExpectedEndDate, markCharteryDirty)
    watchField(umbrellaField, () => project.LinkedPrograms, markCharteryDirty)
    watchField(techProjectField, () => project.TechProject, markCharteryDirty)
    watchField(techPhaseField, () => project.TechPhase, markCharteryDirty)
    watchPickerField(projectManagerField, () => project.ProjectManagerEmail,
      (v) => { pmPickerTouched = v }, markCharteryDirty)

    // Governance fields
    watchField(businessLineField, () => project.BusinessLine, markGovernanceDirty)
    watchField(productField, () => project.Product, markGovernanceDirty)
    watchField(statusField, () => project.Status, markGovernanceDirty)
    watchField(pmScopeField, () => project.PMScope, markGovernanceDirty)
    // A2: Sponsors is now an array — subscribe directly (no touched flag needed)
    sponsorsField.subscribe(() => markGovernanceDirty())
    stakeholdersField.subscribe(() => markGovernanceDirty())
    pmMembersField.subscribe(() => markGovernanceDirty())
    // A1: P4P PM dirty tracking for Contributing projects
    if (project.Role === 'Contributing') {
      p4pPmField.subscribe((val) => {
        const newEmail = (val?.value?.email || val?.email || '').toLowerCase()
        const storedEmail = (project.P4PPMEmail || '').toLowerCase()
        if (newEmail === storedEmail) return
        markGovernanceDirty()
      })
    }

    // Impact fields
    watchField(targetTypeField, () => project.TargetType, markImpactDirty)
    watchField(targetScopeField, () => project.TargetScope, markImpactDirty)
    targetValuesField.subscribe(() => markImpactDirty())
  }

  // -------------------------------------------------------------------
  // Allocation helper
  // -------------------------------------------------------------------

  function deleteAllocationByEmail(email) {
    const record = allocations.find(a =>
      (a.UserEmail || '').toLowerCase() === email.toLowerCase()
    )
    if (!record) return Promise.resolve()
    return siteApi.list(LIST_ALLOCATIONS).deleteItem(record.Id, record['odata.etag'])
      .catch((err) => {
        console.warn('[EditTab] deleteAllocationByEmail failed', { email, err })
        Toast.warning('Could not remove allocation for ' + email)
      })
  }

  // -------------------------------------------------------------------
  // Save functions
  // -------------------------------------------------------------------

  async function saveCharter() {
    if (isClosed) { console.warn('[EditTab] blocked save — project is closed'); return null }
    if (!canEdit) { console.warn('[EditTab] blocked save for non-editor role', effectiveRole); return null }
    const umbrellaLabel = umbrellaField.value?.label || ''
    // Only include PM fields when the user explicitly changed the picker.
    // Skipping the write when untouched avoids triggering allocation cleanup
    // for a PM the user did not change.
    const pmIdentity = pmPickerTouched ? optionToUserIdentity(projectManagerField.value) : undefined
    const data = {
      Title: projectNameField.value,
      ...(pmPickerTouched ? {
        ProjectManager: pmIdentity || '',
        ProjectManagerEmail: pmIdentity?.email || '',
      } : {}),
      Context: contextField.value,
      Objectives: objectivesField.value,
      ProjectType: comboValue(projectTypeField.value),
      SubCategory: comboValue(subCategoryField.value),
      GDPRClassification: comboValue(gdprField.value),
      StartDate: startDateField.value,
      ExpectedEndDate: endDateField.value,
      UmbrellaProgram: umbrellaLabel.replace(/^\[(?:Program|Project)\]\s*/, ''),
      LinkedPrograms: umbrellaField.value?.value || '',
      TechProject: comboValue(techProjectField.value),
      TechPhase: comboValue(techPhaseField.value),
    }
    await siteApi.list(LIST_PROJECTS).updateItem(project.Id, data, project['odata.etag'])
    const [fresh] = await siteApi.list(LIST_PROJECTS).getItemByUUID(project.UUID)
    if (fresh && fresh['odata.etag']) project['odata.etag'] = fresh['odata.etag']

    // Clean up old PM allocation only when the user explicitly changed the picker.
    // Guard on pmPickerTouched prevents treating an empty un-resolved field as
    // "PM was removed", which would incorrectly delete the stored PM's allocation.
    if (pmPickerTouched) {
      const newPmEmail = (pmIdentity?.email || '').toLowerCase()
      const oldPmEmail = (project.ProjectManagerEmail || '').toLowerCase()
      if (oldPmEmail && newPmEmail !== oldPmEmail) {
        const storedMemberEmails = (project.PMMembersEmail || '').split(';').map(s => s.trim().toLowerCase()).filter(Boolean)
        if (!storedMemberEmails.includes(oldPmEmail)) {
          await deleteAllocationByEmail(oldPmEmail)
        }
      }
    }

    isCharteryDirty = false
    return fresh || null
  }

  async function saveGovernance() {
    if (isClosed) { console.warn('[EditTab] blocked save — project is closed'); return null }
    if (!canEdit) { console.warn('[EditTab] blocked save for non-editor role', effectiveRole); return null }
    // A1: resolve P4PPM identity only for Contributing projects
    const p4pPmIdentity = project.Role === 'Contributing' ? optionToUserIdentity(p4pPmField.value) : undefined
    const data = {
      BusinessLine: comboValue(businessLineField.value),
      Product: productField.value,
      // A2: Sponsor is now a UserIdentity[] array — always written
      Sponsor: sponsorsField.value,
      Stakeholders: stakeholdersField.value,
      PMMembers: pmMembersField.value,
      PMMembersEmail: (pmMembersField.value || []).map(ui => ui.email).join(';'),
      Status: comboValue(statusField.value),
      PMScope: comboValue(pmScopeField.value),
      // A1: P4P PM fields for Contributing projects
      ...(project.Role === 'Contributing' ? {
        P4PPM: p4pPmIdentity || '',
        P4PPMEmail: p4pPmIdentity?.email || '',
      } : {}),
    }
    await siteApi.list(LIST_PROJECTS).updateItem(project.Id, data, project['odata.etag'])
    const [fresh] = await siteApi.list(LIST_PROJECTS).getItemByUUID(project.UUID)
    if (fresh && fresh['odata.etag']) project['odata.etag'] = fresh['odata.etag']

    const oldEmails = (project.PMMembersEmail || '').split(';').map(s => s.trim().toLowerCase()).filter(Boolean)
    const newEmails = (pmMembersField.value || []).map(ui => ui.email.toLowerCase())
    const removed = oldEmails.filter(e => !newEmails.includes(e))
    if (removed.length) {
      // Use the picker value only if the PM picker was touched (user changed it).
      // Otherwise fall back to the stored ProjectManagerEmail so an untouched
      // picker does not appear as "no PM" and delete the stored allocation.
      const currentPmEmail = (
        pmPickerTouched
          ? optionToUserIdentity(projectManagerField.value)?.email
          : null
      ) || (project.ProjectManagerEmail || '')
      const currentPmEmailLower = currentPmEmail.toLowerCase()
      const toDelete = removed.filter(e => e !== currentPmEmailLower)
      if (toDelete.length) await Promise.all(toDelete.map(deleteAllocationByEmail))
    }

    isGovernanceDirty = false
    return fresh || null
  }

  async function saveImpact() {
    if (isClosed) { console.warn('[EditTab] blocked save — project is closed'); return null }
    if (!canEdit) { console.warn('[EditTab] blocked save for non-editor role', effectiveRole); return null }
    const data = {
      TargetType: comboValue(targetTypeField.value),
      TargetValues: targetValuesField.value,
      TargetScope: comboValue(targetScopeField.value),
    }
    await siteApi.list(LIST_PROJECTS).updateItem(project.Id, data, project['odata.etag'])
    const [fresh] = await siteApi.list(LIST_PROJECTS).getItemByUUID(project.UUID)
    if (fresh && fresh['odata.etag']) project['odata.etag'] = fresh['odata.etag']
    isImpactDirty = false
    return fresh || null
  }

  // -------------------------------------------------------------------
  // Sticky footer buttons
  // -------------------------------------------------------------------

  const discardBtn = new Button('Discard', {
    variant: 'secondary',
    class: 'app-btn-secondary',
    onClickHandler: () => {
      // Reset tech field VALUES first so the factory creates combos with the correct
      // pre-checked option when the category subscriber fires below.
      techProjectField.value = project.TechProject || ''
      techPhaseField.value = project.TechPhase || ''

      // Reset category: resetComboToStored sets the field value then reassigns the
      // dataset so the combo re-syncs its display. The dataset setter normalises the
      // stored string to an option object, fires subscribers (tech field factory +
      // bindSubCategoryToCategory), and re-renders the combo.
      resetComboToStored(projectTypeCombo, projectTypeField, projectTypes, project.ProjectType || '')

      // Restore sub category AFTER category reset; bindSubCategoryToCategory may have
      // cleared it if the category changed during editing.
      const discardSubOpts = getSubCategoryOptions(subCategoryMap, project.ProjectType || '')
      subCategoryField.value = project.SubCategory || ''
      subCategoryContainer.children = buildSubCategoryChildren(subCategoryField, discardSubOpts)

      resetComboToStored(gdprCombo, gdprField, GDPR_CLASSIFICATIONS, project.GDPRClassification || '')

      projectNameField.value = project.Title || ''
      contextField.value = project.Context || ''
      objectivesField.value = project.Objectives || ''
      startDateField.value = project.StartDate || ''
      endDateField.value = project.ExpectedEndDate || ''
      // Umbrella: resolve from the current project state so Discard after a Save
      // restores the saved parent, not the page-load snapshot. Falls back to the
      // page-load umbrellaCurrent if resolveUmbrellaOption was not supplied.
      const discardUmbrellaOption = resolveUmbrellaOption ? resolveUmbrellaOption(project) : umbrellaCurrent
      seedUmbrellaCurrent(umbrellaPicker, umbrellaField, discardUmbrellaOption)

      // Restore People pickers synchronously from stored identity.
      // resetPeoplePickerToStored is used instead of resolveUser to avoid an async
      // AD lookup that could re-dirty the section after the bar hides.
      resetPeoplePickerToStored(pmPicker, projectManagerField, project.ProjectManager)
      // A2: Sponsors is now a UserIdentity[] — restore the array directly
      sponsorsField.value = toIdentityList(project.Sponsor)

      resetComboToStored(businessLineCombo, businessLineField, businessLines, project.BusinessLine || '')
      productField.value = project.Product || ''
      stakeholdersField.value = project.Stakeholders || []
      pmMembersField.value = project.PMMembers || []
      resetComboToStored(statusCombo, statusField, filteredStatuses, project.Status || '')
      resetComboToStored(pmScopeCombo, pmScopeField, pmScopeOptions, project.PMScope || '')

      // A1: restore P4PPM ComboBox for Contributing projects
      if (project.Role === 'Contributing') {
        const storedP4pEmail = (project.P4PPMEmail || '').toLowerCase()
        const matchingOpt = pmMemberOptions.find(opt => (opt.value?.email || '').toLowerCase() === storedP4pEmail)
        p4pPmField.value = matchingOpt || ''
        if (p4pPmCombo.isAlive) p4pPmCombo.dataset = [...pmMemberOptions]
      }

      resetComboToStored(targetTypeCombo, targetTypeField, targetTypes, project.TargetType || '')
      targetValuesField.value = project.TargetValues || []
      resetComboToStored(targetScopeCombo, targetScopeField, TARGET_SCOPES, project.TargetScope || '')

      // Clear touched flag AFTER all resets — resetting the PM picker fires field
      // subscribers synchronously (dirty tracker and touched flag) which would
      // otherwise leave pmPickerTouched set to true, causing the next Save to
      // overwrite the stored PM or delete their allocation.
      pmPickerTouched = false

      // Reset dirty AFTER all resyncs. The resets fire subscribers (marking dirty),
      // but the explicit reset below wins -- the bar is hidden after this handler.
      isCharteryDirty = false
      isGovernanceDirty = false
      isImpactDirty = false
      updateStickyBar()
    }
  })

  const saveChangesBtn = canEdit
    ? new Button('Save changes', {
        variant: 'primary',
        class: 'app-btn-primary',
        onClickHandler: async () => {
          saveChangesBtn.isLoading = true
          const loading = Toast.loading('Saving...')
          try {
            let lastFresh = null
            if (isCharteryDirty) lastFresh = (await saveCharter()) || lastFresh
            if (isGovernanceDirty) lastFresh = (await saveGovernance()) || lastFresh
            if (isImpactDirty) lastFresh = (await saveImpact()) || lastFresh
            loading.success('Saved')
            // Update project baseline and notify parent (sidebar/header/overview refresh).
            if (lastFresh) {
              Object.assign(project, lastFresh)
              if (onProjectSaved) onProjectSaved(lastFresh)
            }
          } catch (err) {
            console.error('[EditTab] save changes:', err)
            loading.error('Failed to save')
          } finally {
            // Reset isLoading BEFORE updateStickyBar. The bar hides on success (dirty
            // flags cleared) which removes the button from the DOM. If we let the bar
            // hide first, saveChangesBtn.isAlive becomes false and the reset is skipped,
            // leaving the button stuck in loading state when it is re-mounted next save.
            if (saveChangesBtn.isAlive) saveChangesBtn.isLoading = false
            updateStickyBar()
          }
        }
      })
    : new Text('You have read-only access to this project.', { type: 'p', class: 'app-readonly-notice' })

  const closedNotice = isClosed
    ? new Container([
        new Text('This project is closed. All fields are read-only. Open the Project Review tab to add review notes, or use the Reopen action to resume editing.', {
          type: 'p',
          class: 'app-closed-notice__text'
        })
      ], { class: 'app-closed-notice' })
    : null

  return new View([
    ...(closedNotice ? [closedNotice] : []),
    charterSection,
    governanceSection,
    impactSection,
    ...(deleteButton ? [new Container([deleteButton], { class: 'app-danger-zone' })] : []),
    ...(!isClosed ? [stickyFooter] : [])
  ])
}
