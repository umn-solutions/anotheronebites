import {
  View, Container, Text, NumberInput, Button, FormField, Toast, CurrentUser
} from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_ALLOCATIONS } from '../../../utils/constants.js'
import { createFormSection, createLabeledField, createFormRow } from '../../../utils/form-helpers.js'

/**
 * Creates the Capacity tab for the project detail page.
 * Displays FTE allocation per team member and allows editing own allocation.
 *
 * @param {{ project: object, siteApi: object, uuid: string, allocations: object[] }} params
 * @returns {View}
 */
export function createCapacityTab({ project, siteApi, uuid, allocations }) {
  const user = new CurrentUser()
  const currentEmail = user.get('email').toLowerCase()

  // Mutable copy of allocations for local state
  let currentAllocations = [...allocations]

  // Determine if user is a PM on this project (ProjectManager or PMMembers)
  const projectManagerEmail = (project.ProjectManagerEmail || '').toLowerCase()
  const pmMembersEmails = (project.PMMembersEmail || '')
    .split(';')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
  const isProjectPm = currentEmail === projectManagerEmail || pmMembersEmails.includes(currentEmail)

  // Find existing allocation for the current user
  function findOwnAllocation() {
    return currentAllocations.find(a => a.UserEmail.toLowerCase() === currentEmail)
  }

  // -------------------------------------------------------------------
  // Total display
  // -------------------------------------------------------------------

  function computeTotal() {
    return currentAllocations.reduce((sum, a) => sum + (parseFloat(a.AllocationPercent) || 0), 0)
  }

  const totalText = new Text(computeTotal().toFixed(2) + ' FTE', { type: 'span', class: 'app-capacity-percent' })

  const totalRow = new Container([
    new Text('Total', { type: 'span', class: 'app-capacity-name app-capacity-total-label' }),
    totalText,
  ], { class: 'app-capacity-row app-capacity-row--total' })

  function refreshTotal() {
    totalText.children = [computeTotal().toFixed(2) + ' FTE']
  }

  // -------------------------------------------------------------------
  // Allocation rows
  // -------------------------------------------------------------------

  const allocationListContainer = new Container([], { class: 'app-capacity-list' })

  function buildReadOnlyRow(allocation) {
    return new Container([
      new Text(allocation.UserDisplayName, { type: 'span', class: 'app-capacity-name' }),
      new Text(allocation.AllocationPercent + ' FTE', { type: 'span', class: 'app-capacity-percent' }),
    ], { class: 'app-capacity-row' })
  }

  function buildEditableRow(allocation) {
    const editField = new FormField({ value: parseFloat(allocation.AllocationPercent) || 0 })

    const saveBtn = new Button('Save', {
      variant: 'primary',
      onClickHandler: async () => {
        saveBtn.isLoading = true
        const loading = Toast.loading('Saving allocation...')
        try {
          await siteApi.list(LIST_ALLOCATIONS).updateItem(
            allocation.Id,
            { AllocationPercent: editField.value },
            allocation['odata.etag']
          )
          allocation.AllocationPercent = editField.value
          loading.success('Allocation saved')
          refreshTotal()
        } catch {
          loading.error('Failed to save allocation')
        } finally {
          saveBtn.isLoading = false
        }
      }
    })

    return new Container([
      new Text(allocation.UserDisplayName + ' (you)', { type: 'span', class: 'app-capacity-name' }),
      new NumberInput(editField, { step: 0.05, min: 0, max: 2 }),
      saveBtn,
    ], { class: 'app-capacity-row app-capacity-row--editable' })
  }

  function renderAllocationList() {
    if (currentAllocations.length === 0 && !isProjectPm) {
      allocationListContainer.children = [
        new Text('No allocations recorded', { type: 'p', class: 'app-empty-state' })
      ]
      return
    }

    const rows = currentAllocations.map(allocation => {
      if (allocation.UserEmail.toLowerCase() === currentEmail) {
        return buildEditableRow(allocation)
      }
      return buildReadOnlyRow(allocation)
    })

    allocationListContainer.children = rows
  }

  renderAllocationList()

  // -------------------------------------------------------------------
  // Add own allocation (when user is PM but has no existing allocation)
  // -------------------------------------------------------------------

  function buildAddOwnSection() {
    const ownAllocation = findOwnAllocation()
    if (ownAllocation || !isProjectPm) return null

    const newAllocField = new FormField({ value: 0 })

    const addBtn = new Button('Add Allocation', {
      variant: 'primary',
      onClickHandler: async () => {
        if (!newAllocField.value) {
          Toast.error('Please enter an FTE value')
          return
        }

        addBtn.isLoading = true
        const loading = Toast.loading('Adding allocation...')
        try {
          const data = {
            Title: uuid + '_' + user.get('email'),
            ProjectUUID: uuid,
            UserEmail: user.get('email'),
            UserDisplayName: user.get('displayName'),
            AllocationPercent: newAllocField.value,
            UpdatedBy: JSON.stringify({ email: user.get('email'), displayName: user.get('displayName') }),
            UpdatedByEmail: user.get('email'),
          }
          const created = await siteApi.list(LIST_ALLOCATIONS).createItem(data)
          currentAllocations.push(created)
          renderAllocationList()
          refreshTotal()
          loading.success('Allocation added')
          // Hide the add section after successful creation
          if (addSectionContainer) {
            addSectionContainer.children = []
          }
        } catch {
          loading.error('Failed to add allocation')
        } finally {
          addBtn.isLoading = false
        }
      }
    })

    return createFormSection('Add Your Allocation', [
      createFormRow([
        createLabeledField('FTE', new NumberInput(newAllocField, { step: 0.05, min: 0, max: 2 })),
      ]),
      new Container([addBtn], { class: 'app-form-actions' }),
    ])
  }

  const addSection = buildAddOwnSection()
  const addSectionContainer = new Container(addSection ? [addSection] : [])

  // -------------------------------------------------------------------
  // Assemble tab
  // -------------------------------------------------------------------

  const teamSection = createFormSection('Team Capacity', [
    allocationListContainer,
    totalRow,
  ])

  const sections = [teamSection, addSectionContainer]

  return new View(sections)
}
