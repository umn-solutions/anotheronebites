import { Container, FieldLabel, Text, Button, TextInput, PeoplePicker, ComboBox, FormField } from '../libs/nofbiz/nofbiz.base.js'

/**
 * Wraps a FieldLabel around an input component.
 * FieldLabel natively handles label-to-input association, so no Container needed.
 * @param {string} labelText - Display label
 * @param {HTMDElement} inputComponent - The form component to label
 * @param {boolean} [required=false] - Appends ' *' to label when true
 * @returns {FieldLabel}
 */
export function createLabeledField(labelText, inputComponent, required = false) {
  const label = required ? labelText + ' *' : labelText
  return new FieldLabel(label, inputComponent, { class: 'app-labeled-field' })
}

/**
 * Horizontal flex row of labeled fields.
 * @param {HTMDNode[]} children - Components to lay out horizontally
 * @returns {Container}
 */
export function createFormRow(children) {
  return new Container(children, { class: 'app-form-row' })
}

/**
 * Section with heading and grouped fields.
 * @param {string} title - Section heading text
 * @param {HTMDNode[]} children - Components within the section
 * @returns {Container}
 */
export function createFormSection(title, children) {
  return new Container([
    new Text(title, { type: 'h2' }),
    ...children
  ], { class: 'app-form-section' })
}

/**
 * Extract the plain string value from a ComboBox FormField.
 * Handles both ComboBoxOptionProps {label, value} (user interacted) and
 * raw strings (pre-populated, never changed).
 * @param {object|string|null} fieldValue - FormField value
 * @param {string} [fallback=''] - Default when value is null/undefined/empty
 * @returns {string}
 */
export function comboValue(fieldValue, fallback = '') {
  if (!fieldValue) return fallback
  if (typeof fieldValue === 'object' && 'value' in fieldValue) return fieldValue.value
  return fieldValue
}

/**
 * Convert a UserIdentity object (from SP auto-parse) into ComboBoxOptionProps
 * for pre-populating a PeoplePicker FormField.
 * @param {object|null} ui - UserIdentity {email, displayName} or null
 * @returns {object|null} ComboBoxOptionProps {label, value} or null
 */
export function userIdentityToOption(ui) {
  if (!ui || typeof ui !== 'object') return null
  return { label: ui.displayName || ui.email, value: ui }
}

/**
 * Extract a UserIdentity from a PeoplePicker FormField value.
 * Handles both ComboBoxOptionProps {label, value: UserIdentity} and
 * raw UserIdentity {email, displayName} (when pre-populated data was not changed).
 * @param {object|null} opt - FormField value from PeoplePicker
 * @returns {object|null} UserIdentity {email, displayName} or null
 */
export function optionToUserIdentity(opt) {
  if (!opt) return null
  const src = (opt.email && opt.displayName) ? opt : opt?.value
  if (!src?.email) return null
  if (typeof src.toJSON === 'function') {
    try { return src.toJSON() } catch { /* broken clone -- fall through */ }
  }
  return { email: src.email, displayName: src.displayName || '' }
}

/**
 * Multi-person add/remove UI wrapping a single-select PeoplePicker.
 * The provided formField.value stores a UserIdentity[] (array of {email, displayName}).
 * @param {string} labelText - Display label
 * @param {FormField} formField - FormField whose value is UserIdentity[]
 * @param {boolean} [required=false] - Appends ' *' to label when true
 * @returns {FieldLabel}
 */
export function createMultiPersonPicker(labelText, formField, required = false) {
  const pickerField = new FormField({ value: '' })
  const picker = new PeoplePicker(pickerField, { placeholder: 'Search for a person' })
  const listContainer = new Container([], { class: 'app-multi-person-list' })

  function getIdentities() {
    const val = formField.value
    if (Array.isArray(val)) return val
    return []
  }

  function renderList() {
    const identities = getIdentities()
    listContainer.children = identities.map(ui =>
      new Container([
        new Text(ui.displayName || ui.email, { type: 'span' }),
        new Button('Remove', {
          variant: 'text',
          onClickHandler: () => {
            formField.value = getIdentities().filter(p => p.email !== ui.email)
          }
        })
      ], { class: 'app-multi-person-item' })
    )
  }

  formField.subscribe(renderList)
  renderList()

  pickerField.subscribe((value) => {
    const identity = value?.value
    if (!identity?.email) return
    const current = getIdentities()
    if (!current.some(p => p.email === identity.email)) {
      formField.value = [...current, { email: identity.email, displayName: identity.displayName || '' }]
    }
    picker.clearSelection()
    picker.instance?.find('input').trigger('blur')
  })

  return createLabeledField(labelText, new Container([picker, listContainer]), required)
}

/**
 * Multi-target value add/remove UI for target value + type pairs.
 * FormField value: [{value: "5000", type: "EUR"}, ...]
 * @param {string} labelText - Display label
 * @param {FormField} formField - FormField whose value is {value, type}[]
 * @param {string[]} targetValueTypes - Dataset for the type ComboBox
 * @returns {FieldLabel}
 */
export function createMultiTargetValuePicker(labelText, formField, targetValueTypes) {
  const valueField = new FormField({ value: '' })
  const typeField = new FormField({ value: '' })
  const valueInput = new TextInput(valueField, { placeholder: 'Amount' })
  const typeCombo = new ComboBox(typeField, targetValueTypes, { allowFiltering: false })
  const listContainer = new Container([], { class: 'app-multi-person-list' })

  function getEntries() {
    const val = formField.value
    return Array.isArray(val) ? val : []
  }

  function renderList() {
    const entries = getEntries()
    listContainer.children = entries.map((entry, idx) =>
      new Container([
        new Text(`${entry.value} ${entry.type}`, { type: 'span' }),
        new Button('Remove', {
          variant: 'text',
          onClickHandler: () => {
            formField.value = getEntries().filter((_, i) => i !== idx)
          }
        })
      ], { class: 'app-multi-person-item' })
    )
  }

  formField.subscribe(renderList)
  renderList()

  const addBtn = new Button('Add', {
    variant: 'secondary',
    onClickHandler: () => {
      const v = valueField.value?.trim()
      const t = typeof typeField.value === 'object' ? typeField.value.value : typeField.value
      if (!v || !t) return
      formField.value = [...getEntries(), { value: v, type: t }]
      valueField.value = ''
      typeField.value = ''
    }
  })

  const inputRow = new Container([valueInput, typeCombo, addBtn], { class: 'app-target-value-input-row' })

  return createLabeledField(labelText, new Container([inputRow, listContainer]))
}

/**
 * Multi-person add/remove UI using a ComboBox with pre-built group member options.
 * Same add/remove list pattern as createMultiPersonPicker but restricted to a known set.
 * @param {string} labelText - Display label
 * @param {FormField} formField - FormField whose value is UserIdentity[]
 * @param {Array<{label: string, value: {email: string, displayName: string}}>} options - Pre-built options from group members
 * @param {boolean} [required=false] - Appends ' *' to label when true
 * @returns {FieldLabel}
 */
export function createGroupMemberPicker(labelText, formField, options, required = false) {
  const pickerField = new FormField({ value: '' })
  const combo = new ComboBox(pickerField, options, { allowFiltering: true, placeholder: 'Select a member' })
  const listContainer = new Container([], { class: 'app-multi-person-list' })

  function getIdentities() {
    const val = formField.value
    if (Array.isArray(val)) return val
    return []
  }

  function renderList() {
    const identities = getIdentities()
    listContainer.children = identities.map(ui =>
      new Container([
        new Text(ui.displayName || ui.email, { type: 'span' }),
        new Button('Remove', {
          variant: 'text',
          onClickHandler: () => {
            formField.value = getIdentities().filter(p => p.email !== ui.email)
          }
        })
      ], { class: 'app-multi-person-item' })
    )
  }

  formField.subscribe(renderList)
  renderList()

  pickerField.subscribe((value) => {
    const identity = value?.value
    if (!identity?.email) return
    const current = getIdentities()
    if (!current.some(p => p.email === identity.email)) {
      formField.value = [...current, { email: identity.email, displayName: identity.displayName || '' }]
    }
    pickerField.value = ''
  })

  return createLabeledField(labelText, new Container([combo, listContainer]), required)
}
