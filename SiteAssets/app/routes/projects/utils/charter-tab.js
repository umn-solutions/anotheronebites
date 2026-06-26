import {
  View, Container, TextInput, TextArea, DateInput, ComboBox, PeoplePicker, Button, FormField, Toast
} from '../../../libs/nofbiz/nofbiz.base.js'
import { GDPR_CLASSIFICATIONS, LIST_PROJECTS } from '../../../utils/constants.js'
import { createLabeledField, createFormSection, createFormRow, userIdentityToOption, optionToUserIdentity, comboValue } from '../../../utils/form-helpers.js'

export function createCharterTab({ project, siteApi, umbrellaOptions, projectTypes, techProjects, techPhases }) {
  const techProjectField = new FormField({ value: project.TechProject || '' })
  const techPhaseField = new FormField({ value: project.TechPhase || '' })
  const techProjectCombo = new ComboBox(techProjectField, techProjects, { allowFiltering: true })
  const techPhaseCombo = new ComboBox(techPhaseField, techPhases, { allowFiltering: false })

  const techFieldsContainer = new Container(
    project.ProjectType === 'Tech'
      ? [createLabeledField('Tech Project', techProjectCombo), createLabeledField('Tech Phase', techPhaseCombo)]
      : []
  )

  const projectNameField = new FormField({ value: project.Title || '' })
  const projectManagerField = new FormField({ value: userIdentityToOption(project.ProjectManager) || '' })
  const contextField = new FormField({ value: project.Context || '' })
  const objectivesField = new FormField({ value: project.Objectives || '' })
  const projectTypeField = new FormField({ value: project.ProjectType || '' })
  projectTypeField.subscribe((val) => {
    techFieldsContainer.children = val?.value === 'Tech'
      ? [createLabeledField('Tech Project', techProjectCombo), createLabeledField('Tech Phase', techPhaseCombo)]
      : []
  })
  const gdprField = new FormField({ value: project.GDPRClassification || '' })
  const scopeField = new FormField({ value: project.Scope || '' })
  const startDateField = new FormField({ value: project.StartDate || '' })
  const endDateField = new FormField({ value: project.ExpectedEndDate || '' })
  const umbrellaField = new FormField({ value: project.UmbrellaProgram || '' })

  const saveCharterBtn = new Button('Save Charter', {
    variant: 'primary',
    onClickHandler: async () => {
      await siteApi.list(LIST_PROJECTS).updateItem(project.Id, {
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
        TechProject: comboValue(techProjectField.value),
        TechPhase: comboValue(techPhaseField.value),
        UmbrellaProgram: comboValue(umbrellaField.value)
      })
      Toast.success('Charter updated')
    }
  })

  const charterTab = new View([
    createFormSection('Project Charter', [
      createFormRow([
        createLabeledField('Project Name', new TextInput(projectNameField), true),
        createLabeledField('Project Manager', new PeoplePicker(projectManagerField, { placeholder: 'Select Project Manager' }))
      ]),
      createLabeledField('Context', new TextInput(contextField)),
      createLabeledField('Objectives', new TextInput(objectivesField)),
      createFormRow([
        createLabeledField('Project Type', new ComboBox(projectTypeField, projectTypes, { allowFiltering: false, allowCreate: true })),
        createLabeledField('GDPR Classification', new ComboBox(gdprField, GDPR_CLASSIFICATIONS, { allowFiltering: false }))
      ]),
      createFormRow([
        createLabeledField('Scope/Out of Scope', new TextArea(scopeField, { placeholder: 'Describe what is in scope and out of scope' })),
        createLabeledField('Start Date', new DateInput(startDateField, { format: 'yyyy-mm-dd' })),
        createLabeledField('Expected End Date', new DateInput(endDateField, { format: 'yyyy-mm-dd' }))
      ]),
      createLabeledField('Umbrella Program', new ComboBox(umbrellaField, umbrellaOptions, { allowFiltering: true, allowCreate: true })),
      techFieldsContainer,
      new Container([saveCharterBtn], { class: 'app-charter-actions' })
    ])
  ])

  return charterTab
}
