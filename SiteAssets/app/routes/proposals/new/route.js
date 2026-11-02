import { defineRoute, Container, Text, TextInput, TextArea, ComboBox, Button, FormField, SiteApi, Router, Toast, PeoplePicker, Loader, CurrentUser } from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_PROPOSALS } from '../../../utils/constants.js'
import { createLabeledField, optionToUserIdentity, comboValue } from '../../../utils/form-helpers.js'
import { generateStructuredId } from '../../../utils/id-generator.js'
import { loadDefinitions } from '../../../utils/definitions.js'
import { loadScopes, getScopeOptions } from '../../../utils/scopes.js'

export default defineRoute(async (config) => {
  config.setRouteTitle('Create Proposal')

  const siteApi = new SiteApi()
  const [defs, scopeItems] = await Promise.all([
    loadDefinitions(siteApi),
    loadScopes(siteApi),
  ])
  const projectTypes = defs.get('ProjectTypes')
  const businessLines = defs.get('BusinessLines')
  const projectStatuses = defs.get('ProjectStatuses')
  const pmScopeOptions = getScopeOptions(scopeItems)

  // Form fields
  const titleField = new FormField({ value: '', validatorCallback: (v) => v.length > 0 })
  const contextField = new FormField({ value: '' })
  const projectTypeField = new FormField({ value: '' })
  const businessLineField = new FormField({ value: '' })
  const sponsorField = new FormField({ value: '' })
  const pmScopeField = new FormField({ value: '' })
  const statusField = new FormField({ value: { label: 'In Progress', value: 'In Progress' } })

  const loader = new Loader(new Text('Saving...'), { class: 'app-fullpage-loader' })

  async function handleSubmit() {
    if (!titleField.validate()) {
      titleField.focusOnInput()
      Toast.error('Title is required', { duration: 4000, autoClose: true })
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
        Status: comboValue(statusField.value),
        PMScope: comboValue(pmScopeField.value),
        SubmittedBy: { email: currentUser.get('email'), displayName: currentUser.get('displayName') },
        SubmittedByEmail: currentUser.get('email'),
      })
      Toast.success('Proposal created')
      Router.navigateTo('/')
    } catch (err) {
      console.error('Create proposal failed:', err)
      Toast.error('Failed to create proposal')
    } finally {
      loader.toggleLoader()
      if (submitBtn.isAlive) submitBtn.isLoading = false
    }
  }

  const submitBtn = new Button('Create proposal', {
    class: 'app-btn-primary',
    onClickHandler: handleSubmit,
  })

  const cancelBtn = new Button('Cancel', {
    class: 'app-btn-secondary',
    onClickHandler: () => Router.navigateTo('/'),
  })

  // Section heading row
  const sectionHeadingRow = new Container([
    new Text('Proposal details', { type: 'h2', class: 'app-create-section__heading' }),
    new Text('* required', { type: 'span', class: 'app-create-section__meta' }),
  ], { class: 'app-create-section__heading-row' })

  // Long fields: title (full width), context (full width)
  const titleLabeled = createLabeledField('Title', new TextInput(titleField, { placeholder: 'e.g. API Gateway Modernization' }), true)
  const contextLabeled = createLabeledField('Context', new TextArea(contextField, { placeholder: 'What is being proposed, and why now?' }))

  // Short selects: 2-up grid (category, business line, sponsor, PM scope)
  const shortSelects = new Container([
    createLabeledField('Category', new ComboBox(projectTypeField, projectTypes, { allowFiltering: false, allowCreate: true, placeholder: 'Select...' })),
    createLabeledField('Business line', new ComboBox(businessLineField, businessLines, { allowFiltering: true, allowCreate: true, placeholder: 'Select...' })),
    createLabeledField('Sponsor', new PeoplePicker(sponsorField, { placeholder: 'Select sponsor' })),
    createLabeledField('PM scope', new ComboBox(pmScopeField, pmScopeOptions, { allowFiltering: false, placeholder: 'Select PM scope' })),
  ], { class: 'app-create-fields-2up' })

  const statusLabeled = createLabeledField('Status', new ComboBox(statusField, projectStatuses, { allowFiltering: false, placeholder: 'Select status' }))

  const sectionCard = new Container([
    sectionHeadingRow,
    titleLabeled,
    contextLabeled,
    shortSelects,
    statusLabeled,
  ], { class: 'app-create-section' })

  // Footer: Cancel left, Create proposal right
  const footer = new Container([
    cancelBtn,
    new Container([], { class: 'app-create-footer__spacer' }),
    submitBtn,
  ], { class: 'app-create-footer' })

  // Intro block
  const introBlock = new Container([
    new Text('Create', { type: 'span', class: 'app-create-intro__overline' }),
    new Text('New proposal', { type: 'h1', class: 'app-create-intro__title' }),
    new Text('A proposal is a candidate project awaiting review.', { type: 'p', class: 'app-create-intro__purpose' }),
  ], { class: 'app-create-intro' })

  const column = new Container([
    introBlock,
    sectionCard,
    footer,
  ], { class: 'app-create-column' })

  const page = new Container([column], { class: 'app-create-page' })

  return [loader, page]
})
