import {
  View, Container, Text, TextInput, Button, FormField
} from '../../../libs/nofbiz/nofbiz.base.js'
import { createMultiPersonPicker } from '../../../utils/form-helpers.js'

export function createScopesTab() {
  const scopes = []
  let nextId = 1

  const scopesList = new Container([], { class: 'app-scopes-list' })

  function renderList() {
    if (scopes.length === 0) {
      scopesList.children = [
        new Text('No scopes yet', { type: 'p', class: 'app-empty-state' }),
      ]
    } else {
      scopesList.children = scopes.map(s => s.card)
    }
  }

  function buildScopeCard(scope) {
    const deleteBtn = new Button('Delete', { variant: 'text' })
    deleteBtn.setEventHandler('click', () => {
      const idx = scopes.findIndex(s => s.id === scope.id)
      if (idx !== -1) scopes.splice(idx, 1)
      renderList()
    })

    const header = new Container([
      new Text(scope.name, { type: 'h4', class: 'app-scope-name' }),
      deleteBtn,
    ], { class: 'app-scope-header' })

    const memberPicker = createMultiPersonPicker('Members', scope.membersField)

    return new Container([header, memberPicker], { class: 'app-scope-card' })
  }

  const nameField = new FormField({ value: '' })
  const nameInput = new TextInput(nameField, { placeholder: 'New scope name...' })
  const addBtn = new Button('Add', { variant: 'primary' })

  addBtn.setEventHandler('click', () => {
    const trimmed = (nameField.value || '').trim()
    if (!trimmed) return

    const scope = {
      id: nextId++,
      name: trimmed,
      membersField: new FormField({ value: [] }),
    }
    scope.card = buildScopeCard(scope)
    scopes.push(scope)

    nameField.value = ''
    renderList()
  })

  const createRow = new Container([nameInput, addBtn], { class: 'app-scope-create-row' })

  renderList()

  return new View([createRow, scopesList])
}
