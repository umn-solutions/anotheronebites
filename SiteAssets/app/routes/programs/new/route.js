import { defineRoute, Container, Text, TextInput, TextArea, ComboBox, Button, FormField, SiteApi, Router, Toast, PeoplePicker, Loader, CurrentUser } from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_PROGRAMS } from '../../../utils/constants.js'
import { createLabeledField, createMultiPersonPicker, optionToUserIdentity, comboValue } from '../../../utils/form-helpers.js'
import { generateStructuredId } from '../../../utils/id-generator.js'
import { loadScopes, getScopeOptions } from '../../../utils/scopes.js'
import { buildUmbrellaOptions } from '../../../utils/umbrella.js'

export default defineRoute(async (config) => {
  config.setRouteTitle('Create Program')

  const siteApi = new SiteApi()
  const user = new CurrentUser()

  const [scopeItems, builtOptions] = await Promise.all([
    loadScopes(siteApi),
    buildUmbrellaOptions(siteApi, user),
  ])

  // "None — top level" as the sentinel to clear the parent, then programs + projects
  const umbrellaOptions = [
    { label: 'None — top level', value: '' },
    ...builtOptions,
  ]
  const pmScopeOptions = getScopeOptions(scopeItems)

  // Form fields
  const programNameField = new FormField({
    value: '',
    validatorCallback: (v) => v.length > 0,
  })
  const contextField = new FormField({
    value: '',
    validatorCallback: (v) => v.length > 0,
  })
  const umbrellaField = new FormField({ value: '' })
  const sponsorField = new FormField({ value: '' })
  const pmScopeField = new FormField({ value: '' })
  const stakeholdersField = new FormField({ value: [] })

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
        UmbrellaProgram: (umbrellaField.value?.label || '').replace(/^\[(?:Program|Project)\]\s*/, ''),
        LinkedPrograms: umbrellaField.value?.value || '',
        PMScope: comboValue(pmScopeField.value),
        SubmittedBy: { email: currentUser.get('email'), displayName: currentUser.get('displayName') },
        SubmittedByEmail: currentUser.get('email'),
      })
      loader.toggleLoader()
      Toast.success('Program created')
      Router.navigateTo('/')
    } catch (err) {
      console.error('Create program failed:', err)
      loader.toggleLoader()
      Toast.error('Failed to create program')
      submitBtn.isLoading = false
    }
  }

  const submitBtn = new Button('Create program', {
    class: 'app-btn-primary',
    onClickHandler: handleSubmit,
  })

  const cancelBtn = new Button('Cancel', {
    class: 'app-btn-secondary',
    onClickHandler: () => Router.navigateTo('/'),
  })

  // Section heading row (title left, "* required" meta right)
  const sectionHeadingRow = new Container([
    new Text('Program details', { type: 'h2', class: 'app-create-section__heading' }),
    new Text('* required', { type: 'span', class: 'app-create-section__meta' }),
  ], { class: 'app-create-section__heading-row' })

  // Long fields: program name (full width), context (full width)
  const nameField = createLabeledField('Program name', new TextInput(programNameField, { placeholder: 'e.g. Digital Transformation' }), true)
  const contextFieldLabeled = createLabeledField('Context', new TextArea(contextField, { placeholder: 'What is this program for, and what sits under it?' }), true)

  // Short selects: 2-up grid (parent program, sponsor, PM scope, stakeholders)
  const shortSelects = new Container([
    createLabeledField('Umbrella Project', new ComboBox(umbrellaField, umbrellaOptions, { allowFiltering: true })),
    createLabeledField('Program sponsor', new PeoplePicker(sponsorField, { placeholder: 'Select sponsor' })),
    createLabeledField('PM scope', new ComboBox(pmScopeField, pmScopeOptions, { allowFiltering: false, placeholder: 'Select PM scope' })),
    createMultiPersonPicker('Stakeholders', stakeholdersField),
  ], { class: 'app-create-fields-2up' })

  const sectionCard = new Container([
    sectionHeadingRow,
    nameField,
    contextFieldLabeled,
    shortSelects,
  ], { class: 'app-create-section' })

  // Footer: Cancel left, Create program right
  const footer = new Container([
    cancelBtn,
    new Container([], { class: 'app-create-footer__spacer' }),
    submitBtn,
  ], { class: 'app-create-footer' })

  // Intro block
  const introBlock = new Container([
    new Text('Create', { type: 'span', class: 'app-create-intro__overline' }),
    new Text('New program', { type: 'h1', class: 'app-create-intro__title' }),
    new Text('A program groups projects and other programs. Projects inherit its dates unless they set their own.', { type: 'p', class: 'app-create-intro__purpose' }),
  ], { class: 'app-create-intro' })

  const column = new Container([
    introBlock,
    sectionCard,
    footer,
  ], { class: 'app-create-column' })

  const page = new Container([column], { class: 'app-create-page' })

  return [loader, page]
})
