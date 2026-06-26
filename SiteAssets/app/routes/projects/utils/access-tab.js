import {
  View, Container, Text, Button, ComboBox, PeoplePicker,
  FormField, Toast, CurrentUser
} from '../../../libs/nofbiz/nofbiz.base.js'
import { ACCESS_LEVELS, ACCESS_TYPES, LIST_PROJECT_ACCESS, LIST_PROJECTS } from '../../../utils/constants.js'
import { canPerformAction } from '../../../utils/access-control.js'
import { createLabeledField, createFormSection, createFormRow, comboValue } from '../../../utils/form-helpers.js'

/**
 * Creates the Access tab for the project detail page.
 * Manages access level and delegation records.
 *
 * @param {{ project: object, siteApi: object, uuid: string, effectiveRole: string, delegations: object[] }} params
 * @returns {View}
 */
export function createAccessTab({ project, siteApi, uuid, effectiveRole, delegations }) {
  const user = new CurrentUser()
  const currentUserEmail = user.get('email')
  const currentUserName = user.get('displayName')

  const canDelegate = canPerformAction(effectiveRole, 'delegate')
  const canChangeAccess = canPerformAction(effectiveRole, 'changeAccessLevel')

  // -------------------------------------------------------------------
  // Access Level Section
  // -------------------------------------------------------------------

  function buildAccessLevelSection() {
    if (project.AccessLevel === 'Confidential') {
      return createFormSection('Access Level', [
        new Text('Confidential (permanent)', { type: 'p' })
      ])
    }

    if (!canChangeAccess) {
      return createFormSection('Access Level', [
        new Text(project.AccessLevel || 'NoRestriction', { type: 'p' })
      ])
    }

    // Editable: ComboBox with filtered levels (no Confidential)
    const filteredLevels = ACCESS_LEVELS.filter(l => l !== 'Confidential')
    const accessLevelField = new FormField({
      value: { label: project.AccessLevel || 'NoRestriction', value: project.AccessLevel || 'NoRestriction' }
    })
    const accessLevelCombo = new ComboBox(accessLevelField, filteredLevels, {
      allowFiltering: false,
      placeholder: 'Select access level'
    })

    const saveAccessBtn = new Button('Save Access Level', {
      variant: 'primary',
      onClickHandler: async () => {
        saveAccessBtn.isLoading = true
        const loading = Toast.loading('Saving access level...')
        try {
          await siteApi.list(LIST_PROJECTS).updateItem(
            project.Id,
            { AccessLevel: comboValue(accessLevelField.value) },
            project['odata.etag']
          )
          loading.success('Access level saved')
        } catch {
          loading.error('Failed to save access level')
        } finally {
          saveAccessBtn.isLoading = false
        }
      }
    })

    return createFormSection('Access Level', [
      createFormRow([
        createLabeledField('Level', accessLevelCombo),
      ]),
      new Container([saveAccessBtn], { class: 'app-form-actions' })
    ])
  }

  // -------------------------------------------------------------------
  // Delegation List
  // -------------------------------------------------------------------

  let currentDelegations = [...delegations]
  const delegationListContainer = new Container([], { class: 'app-delegation-list' })

  function buildDelegationRow(d) {
    const children = [
      new Text(d.UserDisplayName || d.UserEmail, { type: 'span', class: 'app-delegation-user' }),
      new Text(d.AccessType, { type: 'span', class: 'app-access-type-badge' })
    ]

    if (canDelegate) {
      const removeBtn = new Button('Remove', {
        variant: 'text',
        onClickHandler: async () => {
          removeBtn.isLoading = true
          try {
            await siteApi.list(LIST_PROJECT_ACCESS).deleteItem(d.Id, d['odata.etag'])
            currentDelegations = currentDelegations.filter(item => item.Id !== d.Id)
            renderDelegationList()
            Toast.success('Delegation removed')
          } catch {
            Toast.error('Failed to remove delegation')
          } finally {
            removeBtn.isLoading = false
          }
        }
      })
      children.push(removeBtn)
    }

    return new Container(children, { class: 'app-delegation-row' })
  }

  function renderDelegationList() {
    if (currentDelegations.length === 0) {
      delegationListContainer.children = [
        new Text('No delegations', { type: 'p', class: 'app-empty-state' })
      ]
      return
    }
    delegationListContainer.children = currentDelegations.map(d => buildDelegationRow(d))
  }

  renderDelegationList()

  // -------------------------------------------------------------------
  // Add Delegation Form (only for users with delegate permission)
  // -------------------------------------------------------------------

  function buildAddDelegationSection() {
    if (!canDelegate) return null

    const personField = new FormField({ value: '' })
    const personPicker = new PeoplePicker(personField, { placeholder: 'Search for a person' })

    const accessTypeField = new FormField({ value: '' })
    const accessTypeCombo = new ComboBox(accessTypeField, ACCESS_TYPES, {
      allowFiltering: false,
      placeholder: 'Select access type'
    })

    const grantBtn = new Button('Grant Access', {
      variant: 'primary',
      onClickHandler: async () => {
        // Validate: person must be selected
        const personOption = personField.value
        const identity = personOption?.value
        if (!identity?.email) {
          Toast.error('Please select a person')
          return
        }

        // Validate: access type must be chosen
        const accessType = comboValue(accessTypeField.value)
        if (!accessType) {
          Toast.error('Please select an access type')
          return
        }

        grantBtn.isLoading = true
        const loading = Toast.loading('Granting access...')
        try {
          const data = {
            Title: `${uuid}_${identity.email}`,
            ProjectUUID: uuid,
            UserEmail: identity.email,
            UserDisplayName: identity.displayName,
            AccessType: accessType,
            GrantedBy: JSON.stringify({ email: currentUserEmail, displayName: currentUserName }),
            GrantedByEmail: currentUserEmail,
          }
          const created = await siteApi.list(LIST_PROJECT_ACCESS).createItem(data)
          currentDelegations.push(created)
          renderDelegationList()
          loading.success('Access granted')
          personPicker.clearSelection()
          accessTypeField.value = ''
        } catch {
          loading.error('Failed to grant access')
        } finally {
          grantBtn.isLoading = false
        }
      }
    })

    return createFormSection('Grant Access', [
      createFormRow([
        createLabeledField('Person', personPicker),
        createLabeledField('Access Type', accessTypeCombo)
      ]),
      new Container([grantBtn], { class: 'app-form-actions' })
    ])
  }

  // -------------------------------------------------------------------
  // Assemble Tab
  // -------------------------------------------------------------------

  const accessLevelSection = buildAccessLevelSection()
  const delegationsSection = createFormSection('Delegations', [delegationListContainer])
  const addDelegationSection = buildAddDelegationSection()

  const sections = [accessLevelSection, delegationsSection]
  if (addDelegationSection) sections.push(addDelegationSection)

  return new View(sections)
}
