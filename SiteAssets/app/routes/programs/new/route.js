import { defineRoute, Card, Container, Text, TextInput, TextArea, ComboBox, Button, FormField, SiteApi, Router, Toast, PeoplePicker, Loader, CurrentUser } from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_PROGRAMS } from '../../../utils/constants.js'
import { createLabeledField, createFormSection, createMultiPersonPicker, optionToUserIdentity, comboValue } from '../../../utils/form-helpers.js'
import { generateStructuredId } from '../../../utils/id-generator.js'
import { loadDefinitions } from '../../../utils/definitions.js'

export default defineRoute(async (config) => {
  config.setRouteTitle('Create Program')

  const siteApi = new SiteApi()

  // Fetch existing programs for parent selector and definitions
  const [allPrograms, defs] = await Promise.all([
    siteApi.list(LIST_PROGRAMS).getItems(),
    loadDefinitions(siteApi),
  ])
  const umbrellaOptions = allPrograms.map(p => ({ label: p.Title, value: p.UUID }))
  const pmScopeOptions = defs.get('PMScope') || []

  // Form fields
  const programNameField = new FormField({
    value: '',
    validatorCallback: (v) => v.length > 0
  })
  const contextField = new FormField({
    value: '',
    validatorCallback: (v) => v.length > 0
  })
  const sponsorField = new FormField({ value: '' })
  const stakeholdersField = new FormField({ value: [] })
  const umbrellaField = new FormField({ value: '' })
  const pmScopeField = new FormField({ value: '' })

  const loader = new Loader(new Text('Saving...'), { class: 'app-fullpage-loader' })

  async function handleSubmit() {
    if (!programNameField.validate()) {
      programNameField.focusOnInput()
      Toast.error('Program name is required', { duration: 4000, autoClose: true })
      return
    }
    if (!contextField.validate()) {
      contextField.focusOnInput()
      Toast.error('Context is required', { duration: 4000, autoClose: true })
      return
    }

    const uuid = generateStructuredId('PROG')
    submitBtn.isLoading = true
    loader.toggleLoader()
    try {
      const currentUser = new CurrentUser()
      await siteApi.list(LIST_PROGRAMS).createItem({
        Title: programNameField.value,
        UUID: uuid,
        Context: contextField.value,
        ProgramSponsor: optionToUserIdentity(sponsorField.value) || '',
        Stakeholders: stakeholdersField.value,
        UmbrellaProgram: umbrellaField.value?.label || '',
        LinkedPrograms: umbrellaField.value?.value || '',
        PMScope: comboValue(pmScopeField.value),
        SubmittedBy: { email: currentUser.get('email'), displayName: currentUser.get('displayName') },
        SubmittedByEmail: currentUser.get('email'),
      })
      loader.toggleLoader()
      Toast.success('Program created')
      Router.navigateTo('/')
    } catch {
      loader.toggleLoader()
      Toast.error('Failed to create program')
      submitBtn.isLoading = false
    }
  }

  const submitBtn = new Button('Create Program', {
    variant: 'primary',
    onClickHandler: handleSubmit
  })

  const cardContent = new Container([
    new Text('Create Program', { type: 'h1' }),
    createFormSection('Program Details', [
      createLabeledField('Program Name', new TextInput(programNameField, { placeholder: 'Enter program name' }), true),
      createLabeledField('Context', new TextArea(contextField, { placeholder: 'Describe the program context' }), true),
      createLabeledField('Parent Program', new ComboBox(umbrellaField, umbrellaOptions, { allowFiltering: true, placeholder: 'Select parent program (optional)' })),
      createLabeledField('Program Sponsor', new PeoplePicker(sponsorField, { placeholder: 'Select sponsor' })),
      createMultiPersonPicker('Stakeholders', stakeholdersField),
      createLabeledField('PM Scope', new ComboBox(pmScopeField, pmScopeOptions, { allowFiltering: false, placeholder: 'Select PM Scope' })),
    ]),
    new Container([
      new Button('Cancel', {
        variant: 'danger',
        onClickHandler: () => Router.navigateTo('/')
      }),
      submitBtn
    ], { class: 'app-action-buttons' })
  ])

  return [
    new Card([cardContent], { variant: 'secondary', class: 'app-form-card app-wizard' })
  ]
})
