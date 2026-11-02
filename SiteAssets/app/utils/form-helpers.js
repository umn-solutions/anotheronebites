import { Container, FieldLabel, Text, Button, TextInput, PeoplePicker, ComboBox, FormField } from '../libs/nofbiz/nofbiz.base.js'
import { getSubCategoryOptions } from './definitions.js'

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
    try { return src.toJSON() } catch (err) { console.warn('[optionToUserIdentity] toJSON failed', err) }
  }
  return { email: src.email, displayName: src.displayName || '' }
}

/**
 * Wraps a labeled field with an inline error-message slot.
 * Expose setError(text) for per-field validation feedback.
 * The 'app-field--error' CSS class is toggled on the wrapper element.
 * When text is null/empty, the error slot is cleared.
 *
 * @param {string} labelText - Display label
 * @param {HTMDNode} inputComponent - The form component to label
 * @param {boolean} [required=false] - Appends ' *' to label when true
 * @returns {{ node: Container, setError: (text: string|null) => void }}
 */
export function validatedField(labelText, inputComponent, required = false) {
  const msg = new Container([], { class: 'app-field__error' })
  const wrap = new Container([
    createLabeledField(labelText, inputComponent, required),
    msg
  ], { class: 'app-field' })
  return {
    node: wrap,
    setError(text) {
      const el = wrap.instance?.[0]
      if (el) el.classList.toggle('app-field--error', !!text)
      msg.children = text ? [new Text(text, { type: 'span' })] : []
    }
  }
}

/**
 * Build children for a Sub Category container.
 * Returns an empty array when there are no options (hides the container),
 * otherwise returns a fresh FieldLabel wrapping a new ComboBox instance.
 * Creating a new ComboBox each time avoids calling the .dataset setter on an
 * unmounted element, which would trigger an unwanted re-render.
 * @param {FormField} field - The sub category FormField
 * @param {string[]} options - Active sub category option strings
 * @returns {HTMDNode[]}
 */
export function buildSubCategoryChildren(field, options, { disabled = false } = {}) {
  if (!options || options.length === 0) return []
  return [
    createLabeledField('Sub Category', new ComboBox(field, options, {
      allowFiltering: false,
      placeholder: 'Select sub category',
      isDisabled: disabled,
    })),
  ]
}

/**
 * Reset a ComboBox to a stored value for discard.
 * Sets field.value first, then reassigns the dataset so the combo re-syncs its
 * display. Skips the dataset assignment when the combo is not alive (e.g. Tech
 * Project / Tech Phase are unmounted when category != Tech).
 * Adds the stored value to the dataset when missing so allowCreate values are
 * not wiped by the setter finding no matching option.
 * Handles datasets of both plain strings and {label, value} objects.
 *
 * @param {object} combo - ComboBox instance
 * @param {FormField} field - Bound FormField
 * @param {(string|{label:string,value:string})[]} dataset - Current option list
 * @param {string} stored - Value to restore ('' to clear)
 */
export function resetComboToStored(combo, field, dataset, stored) {
  field.value = stored
  if (!combo.isAlive) return
  const inDataset = stored
    ? dataset.some(opt => typeof opt === 'string' ? opt === stored : opt.value === stored)
    : true  // empty stored: no option to add; setter will clear the display
  const freshDataset = inDataset ? dataset : [...dataset, stored]
  combo.dataset = freshDataset
}

/**
 * Restore a PeoplePicker and its bound FormField to the stored identity after discard.
 * Uses no resolveUser call so the restore is synchronous. A resolveUser call would be
 * async, potentially re-dirty the section after the bar hides, and returns null when AD
 * has no match (which would visually clear the picker and delete a valid allocation on
 * the next save).
 *
 * For a non-empty stored identity: builds a ComboBoxOptionProps from it, sets the field,
 * and assigns the picker dataset. The dataset setter calls _syncDatasetFromField which
 * matches by label and marks the option checked, then renders the display.
 *
 * For an empty stored identity: calls clearSelection() which unchecks all items, resets
 * the input text, and sets the FormField to null. clearSelection does not call
 * _disableOnEmptyDataset, so the picker stays enabled and ready for user input.
 *
 * Note: callers must set pmPickerTouched / sponsorPickerTouched to false AFTER calling
 * this function because the field subscriber fires synchronously during the restore and
 * would otherwise leave the touched flag set.
 *
 * @param {PeoplePicker} picker - The PeoplePicker instance
 * @param {FormField} field - The bound FormField
 * @param {{ email: string, displayName?: string }|null} storedIdentity - Stored user identity
 */
export function resetPeoplePickerToStored(picker, field, storedIdentity) {
  if (!storedIdentity?.email) {
    picker.clearSelection()
    return
  }
  const option = {
    label: storedIdentity.displayName || storedIdentity.email,
    value: storedIdentity,
    checked: true,
  }
  field.value = option
  picker.dataset = [option]
}

/**
 * Subscribe categoryField to keep the sub category container in sync.
 * Tracks the last-seen parent value in a closure; only acts when the category
 * actually changes. This guards against ComboBox.render() calling
 * _onSelectHandlerProxy() on first render (which re-fires subscribers even
 * though the value hasn't changed), which would otherwise wipe a stored sub
 * category value.
 *
 * @param {object} opts
 * @param {FormField} opts.categoryField - The category (ProjectType) FormField
 * @param {FormField} opts.subCategoryField - The sub category FormField
 * @param {Container} opts.container - Container holding the Sub Category FieldLabel
 * @param {Map<string,string[]>} opts.subCategoryMap - From defs.subCategoryMap
 * @param {string} [opts.initialParent=''] - The already-loaded category value on open
 */
export function bindSubCategoryToCategory({ categoryField, subCategoryField, container, subCategoryMap, initialParent = '', disabled = false }) {
  let currentParent = initialParent
  categoryField.subscribe((val) => {
    const parentVal = val && typeof val === 'object' ? (val.value || '') : (val || '')
    if (parentVal === currentParent) return
    currentParent = parentVal
    subCategoryField.value = ''
    container.children = buildSubCategoryChildren(subCategoryField, getSubCategoryOptions(subCategoryMap, parentVal), { disabled })
  })
}

/**
 * Multi-person add/remove UI wrapping a single-select PeoplePicker.
 * The provided formField.value stores a UserIdentity[] (array of {email, displayName}).
 * @param {string} labelText - Display label
 * @param {FormField} formField - FormField whose value is UserIdentity[]
 * @param {boolean} [required=false] - Appends ' *' to label when true
 * @param {{ disabled?: boolean }} [opts] - options; set disabled:true to make read-only
 * @returns {FieldLabel}
 */
export function createMultiPersonPicker(labelText, formField, required = false, { disabled = false } = {}) {
  const pickerField = new FormField({ value: '' })
  const picker = new PeoplePicker(pickerField, { placeholder: 'Search for a person', isDisabled: disabled })
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
          isDisabled: disabled,
          onClickHandler: () => {
            if (disabled) return
            formField.value = getIdentities().filter(p => p.email !== ui.email)
          }
        })
      ], { class: 'app-multi-person-item' })
    )
  }

  formField.subscribe(renderList)
  renderList()

  pickerField.subscribe((value) => {
    if (disabled) return
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
 * @param {{ disabled?: boolean }} [opts] - options; set disabled:true to make read-only
 * @returns {FieldLabel}
 */
export function createMultiTargetValuePicker(labelText, formField, targetValueTypes, { disabled = false } = {}) {
  const valueField = new FormField({ value: '' })
  const typeField = new FormField({ value: '' })
  const valueInput = new TextInput(valueField, { placeholder: 'Amount', isDisabled: disabled })
  const typeCombo = new ComboBox(typeField, targetValueTypes, { allowFiltering: false, isDisabled: disabled })
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
          isDisabled: disabled,
          onClickHandler: () => {
            if (disabled) return
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
    isDisabled: disabled,
    onClickHandler: () => {
      if (disabled) return
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
 * @param {{ disabled?: boolean }} [opts] - options; set disabled:true to make read-only
 * @returns {FieldLabel}
 */
export function createGroupMemberPicker(labelText, formField, options, required = false, { disabled = false } = {}) {
  const pickerField = new FormField({ value: '' })
  const combo = new ComboBox(pickerField, options, { allowFiltering: true, placeholder: 'Select a member', isDisabled: disabled })
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
          isDisabled: disabled,
          onClickHandler: () => {
            if (disabled) return
            formField.value = getIdentities().filter(p => p.email !== ui.email)
          }
        })
      ], { class: 'app-multi-person-item' })
    )
  }

  formField.subscribe(renderList)
  renderList()

  pickerField.subscribe((value) => {
    if (disabled) return
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
