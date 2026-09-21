import { defineRoute, Container, Text, TextInput, TextArea, ComboBox, CheckBox, Button, FormField, SiteApi, Router, Toast, PeoplePicker, Loader, CurrentUser } from '../../../libs/nofbiz/nofbiz.base.js'
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
  const pmScopeOptions = getScopeOptions(scopeItems)

  // The three pill options for proposal status (as shown in 4d design)
  const PROPOSAL_STATUS_PILLS = [
    { value: 'Pipeline',      label: 'Pipeline',      selectedClass: 'app-status-pill--selected-pipeline' },
    { value: 'Under review',  label: 'Under review',  selectedClass: 'app-status-pill--selected-under-review' },
    { value: 'On Hold',       label: 'On hold',       selectedClass: 'app-status-pill--selected-on-hold' },
  ]

  // Form fields
  const titleField = new FormField({ value: '', validatorCallback: (v) => v.length > 0 })
  const contextField = new FormField({ value: '' })
  const projectTypeField = new FormField({ value: '' })
  const businessLineField = new FormField({ value: '' })
  const sponsorField = new FormField({ value: '' })
  const pmScopeField = new FormField({ value: '' })
  // Status backed by a FormField; default to 'Pipeline'
  const statusField = new FormField({ value: 'Pipeline' })

  // Validated shortcut (restored): when ticked, submit skips proposal creation and
  // sends the user straight to the project wizard to charter it as a real project.
  const validatedField = new FormField({ value: false })

  const loader = new Loader(new Text('Saving...'), { class: 'app-fullpage-loader' })

  // Build the three selectable pill Buttons.
  // We keep references so we can toggle the selected class reactively.
  const pillButtons = PROPOSAL_STATUS_PILLS.map(({ value, label, selectedClass }) => {
    const btn = new Button(label, {
      class: value === 'Pipeline' ? `app-status-pill ${selectedClass}` : 'app-status-pill',
      onClickHandler: () => {
        statusField.value = value
      },
    })
    return { value, selectedClass, btn }
  })

  // Subscribe to statusField to toggle pill selected classes via .instance (only allowed .instance use)
  statusField.subscribe((newValue) => {
    pillButtons.forEach(({ value, selectedClass, btn }) => {
      if (!btn.instance) return
      const el = btn.instance[0]
      if (!el) return
      // Remove all possible selected classes first, then add the active one
      PROPOSAL_STATUS_PILLS.forEach(p => el.classList.remove(p.selectedClass))
      if (newValue === value) {
        el.classList.add(selectedClass)
      }
    })
  })

  async function handleSubmit() {
    if (!titleField.validate()) {
      titleField.focusOnInput()
      Toast.error('Title is required', { duration: 4000, autoClose: true })
      return
    }

    // Validated shortcut: no proposal is created -- go straight to the project wizard.
    if (validatedField.value) {
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
        Status: statusField.value,
        PMScope: comboValue(pmScopeField.value),
        Validated: 'false',
        SubmittedBy: { email: currentUser.get('email'), displayName: currentUser.get('displayName') },
        SubmittedByEmail: currentUser.get('email'),
      })
      loader.toggleLoader()
      Toast.success('Proposal created')
      Router.navigateTo('/')
    } catch (err) {
      console.error('Create proposal failed:', err)
      loader.toggleLoader()
      Toast.error('Failed to create proposal')
      submitBtn.isLoading = false
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

  // Short selects: 2-up grid (project type, business line, sponsor, PM scope)
  const shortSelects = new Container([
    createLabeledField('Project type', new ComboBox(projectTypeField, projectTypes, { allowFiltering: false, allowCreate: true, placeholder: 'Select...' })),
    createLabeledField('Business line', new ComboBox(businessLineField, businessLines, { allowFiltering: true, allowCreate: true, placeholder: 'Select...' })),
    createLabeledField('Sponsor', new PeoplePicker(sponsorField, { placeholder: 'Select sponsor' })),
    createLabeledField('PM scope', new ComboBox(pmScopeField, pmScopeOptions, { allowFiltering: false, placeholder: 'Select PM scope' })),
  ], { class: 'app-create-fields-2up' })

  // Status pill group (replaces the Status ComboBox)
  const statusPillGroup = new Container([
    new Text('Status', { type: 'span', class: 'app-status-pill-group__label' }),
    new Container(
      pillButtons.map(({ btn }) => btn),
      { class: 'app-status-pill-group__pills' }
    ),
  ], { class: 'app-status-pill-group' })

  // Validated shortcut checkbox: ticking it skips proposal creation and jumps to the wizard.
  // CheckBox has no label prop (FormControlProps), so the label is a sibling Text; the
  // wrapper renders as a <label> so clicking the text toggles the enclosed checkbox natively.
  const validatedCheckbox = new Container([
    new CheckBox(validatedField, {}),
    new Text('This proposal is already validated -- create it as a project instead', { type: 'span', class: 'app-create-validated-label' }),
  ], { as: 'label', class: 'app-create-validated-field' })

  const sectionCard = new Container([
    sectionHeadingRow,
    titleLabeled,
    contextLabeled,
    shortSelects,
    statusPillGroup,
    validatedCheckbox,
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
    new Text('A proposal is a candidate project. Validate it later to turn it into a project with a charter.', { type: 'p', class: 'app-create-intro__purpose' }),
  ], { class: 'app-create-intro' })

  const column = new Container([
    introBlock,
    sectionCard,
    footer,
  ], { class: 'app-create-column' })

  const page = new Container([column], { class: 'app-create-page' })

  return [loader, page]
})
