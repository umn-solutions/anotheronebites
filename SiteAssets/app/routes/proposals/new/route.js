import { defineRoute, Card, Container, Text, TextInput, TextArea, ComboBox, Button, FormField, SiteApi, Router, Toast, PeoplePicker, CheckBox, Loader, CurrentUser } from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_PROPOSALS } from '../../../utils/constants.js'
import { createLabeledField, createFormSection, optionToUserIdentity, comboValue } from '../../../utils/form-helpers.js'
import { generateStructuredId } from '../../../utils/id-generator.js'
import { setRouteContext } from '../../../utils/route-context.js'
import { loadDefinitions } from '../../../utils/definitions.js'

export default defineRoute(async (config) => {
  config.setRouteTitle('Create Proposal')

  const siteApi = new SiteApi()
  const defs = await loadDefinitions(siteApi)
  const projectTypes = defs.get('ProjectTypes')
  const businessLines = defs.get('BusinessLines')
  const projectStatuses = defs.get('ProjectStatuses')
  const pmScopeOptions = defs.get('PMScope') || []

  const titleField = new FormField({ value: '', validatorCallback: (v) => v.length > 0 })
  const contextField = new FormField({ value: '' })
  const projectTypeField = new FormField({ value: '' })
  const businessLineField = new FormField({ value: '' })
  const sponsorField = new FormField({ value: '' })
  const statusField = new FormField({ value: 'Pipeline' })
  const pmScopeField = new FormField({ value: '' })
  const validatedField = new FormField({ value: false })

  const loader = new Loader(new Text('Saving...'), { class: 'app-fullpage-loader' })

  async function handleSubmit() {
    if (!titleField.validate()) {
      titleField.focusOnInput()
      Toast.error('Title is required', { duration: 4000, autoClose: true })
      return
    }

    if (validatedField.value) {
      setRouteContext({
        source: 'proposal',
        title: titleField.value,
        context: contextField.value,
        projectType: comboValue(projectTypeField.value),
        businessLine: comboValue(businessLineField.value),
        sponsor: sponsorField.value,
        status: comboValue(statusField.value, 'Pipeline'),
      })
      Router.navigateTo('projects/new')
      return
    }

    const uuid = generateStructuredId('PROP')
    submitBtn.isLoading = true
    loader.toggleLoader()
    try {
      const currentUser = new CurrentUser()
      await siteApi.list(LIST_PROPOSALS).createItem({
        Title: titleField.value,
        UUID: uuid,
        Context: contextField.value,
        ProjectType: comboValue(projectTypeField.value),
        BusinessLine: comboValue(businessLineField.value),
        Sponsor: optionToUserIdentity(sponsorField.value) || '',
        Status: comboValue(statusField.value, 'Pipeline'),
        PMScope: comboValue(pmScopeField.value),
        SubmittedBy: { email: currentUser.get('email'), displayName: currentUser.get('displayName') },
        SubmittedByEmail: currentUser.get('email'),
      })
      loader.toggleLoader()
      Toast.success('Proposal created')
      Router.navigateTo('/')
    } catch {
      loader.toggleLoader()
      Toast.error('Failed to create proposal')
      submitBtn.isLoading = false
    }
  }

  const submitBtn = new Button('Create Proposal', { variant: 'primary', onClickHandler: handleSubmit })

  const cardContent = new Container([
    new Text('Create Proposal', { type: 'h1' }),
    createFormSection('Proposal Details', [
      createLabeledField('Title', new TextInput(titleField, { placeholder: 'Proposal title' }), true),
      createLabeledField('Context', new TextArea(contextField, { placeholder: 'Proposal context' })),
      createLabeledField('Project Type', new ComboBox(projectTypeField, projectTypes, { allowFiltering: false, allowCreate: true })),
      createLabeledField('Business Line', new ComboBox(businessLineField, businessLines, { allowFiltering: true, allowCreate: true })),
      createLabeledField('Sponsor', new PeoplePicker(sponsorField, { placeholder: 'Select sponsor' })),
      createLabeledField('Status', new ComboBox(statusField, projectStatuses, { allowFiltering: false })),
      createLabeledField('PM Scope', new ComboBox(pmScopeField, pmScopeOptions, { allowFiltering: false, placeholder: 'Select PM Scope' })),
      createLabeledField('Validated', new CheckBox(validatedField, { label: 'This proposal has been validated' })),
    ]),
    new Container([
      new Button('Cancel', { variant: 'danger', onClickHandler: () => Router.navigateTo('/') }),
      submitBtn
    ], { class: 'app-action-buttons' })
  ])

  return [new Card([cardContent], { variant: 'secondary', class: 'app-form-card app-wizard' })]
})
