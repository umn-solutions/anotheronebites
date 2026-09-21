import {
  View, Container, Text, TextInput, Button, FormField, Toast
} from '../../../libs/nofbiz/nofbiz.base.js'
import { createGroupMemberPicker } from '../../../utils/form-helpers.js'

/**
 * Build the Scopes admin tab with full CRUD against the Scopes list.
 *
 * Supports: create scope, manage members per scope (Save), disable scope,
 * and re-enable inactive scopes.
 *
 * @param {object} opts
 * @param {object} opts.listApi - ListApi for the Scopes list
 * @param {object[]} opts.scopeItems - All Scopes rows (active + inactive)
 * @param {object[]} [opts.memberOptions] - Pre-built options from Users+Admins groups
 * @returns {View}
 */
export function createScopesTab({ listApi, scopeItems, memberOptions = [] }) {
  // Internal mutable reference used by refresh()
  let currentItems = scopeItems.slice()

  // Container whose children are rebuilt on each refresh
  const listContainer = new Container([], { class: 'app-scopes-list' })

  async function refresh() {
    try {
      currentItems = await listApi.getItems()
    } catch (err) {
      console.error('[ScopesTab.refresh] getItems failed', err)
      Toast.error('Failed to reload scopes')
      return
    }
    if (!listContainer.isAlive) return
    listContainer.children = buildListChildren(currentItems)
  }

  function buildListChildren(items) {
    const active = items.filter(s => s.IsActive === true || s.IsActive === 'true')
    const inactive = items.filter(s => s.IsActive !== true && s.IsActive !== 'true')

    const children = []

    if (active.length === 0) {
      children.push(new Text('No active scopes defined. Add one below.', { type: 'p', class: 'app-empty-state' }))
    } else {
      children.push(...active.map(s => buildScopeCard(s, false)))
    }

    if (inactive.length > 0) {
      children.push(
        new Text('Disabled', { type: 'h5', class: 'app-admin-inactive-heading' }),
        ...inactive.map(s => buildInactiveRow(s))
      )
    }

    return children
  }

  function buildScopeCard(row, _unused) {
    const initialMembers = Array.isArray(row.Members) ? row.Members : []
    const membersField = new FormField({ value: initialMembers })

    const saveBtn = new Button('Save', { variant: 'primary' })
    saveBtn.setEventHandler('click', async () => {
      saveBtn.isLoading = true
      const loading = Toast.loading('Saving scope members...')
      try {
        await listApi.updateItem(row.Id, { Members: membersField.value }, row['odata.etag'])
        loading.success('Scope members saved')
        await refresh()
      } catch (err) {
        console.error('[ScopesTab.saveMembers] updateItem failed', err)
        loading.error('Failed to save scope members')
      } finally {
        if (saveBtn.isAlive) saveBtn.isLoading = false
      }
    })

    const disableBtn = new Button('Disable', { variant: 'ghost', class: 'app-admin-disable-btn' })
    disableBtn.setEventHandler('click', async () => {
      disableBtn.isLoading = true
      const loading = Toast.loading('Disabling scope...')
      try {
        await listApi.updateItem(row.Id, { IsActive: 'false' }, row['odata.etag'])
        loading.success('Scope disabled')
        await refresh()
      } catch (err) {
        console.error('[ScopesTab.disableScope] updateItem failed', err)
        loading.error('Failed to disable scope')
      } finally {
        if (disableBtn.isAlive) disableBtn.isLoading = false
      }
    })

    const heading = new Text(row.Title, { type: 'h4', class: 'app-scope-name' })
    const picker = createGroupMemberPicker('Members', membersField, memberOptions)
    const cardActions = new Container([saveBtn, disableBtn], { class: 'app-scope-card-actions' })

    return new Container([heading, picker, cardActions], { class: 'app-scope-card' })
  }

  function buildInactiveRow(row) {
    const enableBtn = new Button('Enable', { variant: 'ghost', class: 'app-admin-enable-btn' })
    enableBtn.setEventHandler('click', async () => {
      enableBtn.isLoading = true
      const loading = Toast.loading('Enabling scope...')
      try {
        await listApi.updateItem(row.Id, { IsActive: 'true' }, row['odata.etag'])
        loading.success('Scope enabled')
        await refresh()
      } catch (err) {
        console.error('[ScopesTab.enableScope] updateItem failed', err)
        loading.error('Failed to enable scope')
      } finally {
        if (enableBtn.isAlive) enableBtn.isLoading = false
      }
    })

    return new Container(
      [new Text(row.Title, { type: 'span', class: 'app-admin-value-inactive' }), enableBtn],
      { class: 'app-admin-value-item app-admin-value-item--inactive' }
    )
  }

  // Seed the list container with initial data
  listContainer.children = buildListChildren(currentItems)

  // -- Create form --

  const nameField = new FormField({ value: '' })
  const nameInput = new TextInput(nameField, { placeholder: 'Scope name...' })
  const addBtn = new Button('Add', { variant: 'primary' })

  addBtn.setEventHandler('click', async () => {
    const trimmed = (nameField.value || '').trim()
    if (!trimmed) {
      Toast.error('Scope name cannot be empty')
      return
    }

    const isDuplicate = currentItems.some(
      s => s.Title.toLowerCase() === trimmed.toLowerCase()
    )
    if (isDuplicate) {
      Toast.error('A scope with that name already exists')
      return
    }

    addBtn.isLoading = true
    const loading = Toast.loading('Creating scope...')
    try {
      await listApi.createItem({ Title: trimmed, IsActive: 'true', Members: [] })
      loading.success('Scope created')
      nameField.value = ''
      await refresh()
    } catch (err) {
      console.error('[ScopesTab.createScope] createItem failed', err)
      loading.error('Failed to create scope')
    } finally {
      if (addBtn.isAlive) addBtn.isLoading = false
    }
  })

  const addRow = new Container([nameInput, addBtn], { class: 'app-admin-add-row' })

  return new View([
    new Text('Scopes', { type: 'h3', class: 'app-section-heading' }),
    addRow,
    listContainer,
  ])
}
