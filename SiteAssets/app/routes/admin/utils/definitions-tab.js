import {
  View, Container, Text, TextInput, Button, FormField, Toast, TabGroup
} from '../../../libs/nofbiz/nofbiz.base.js'

export function createDefinitionsTab({ listApi, initialItems, categoryMap }) {
  function groupByCategory(items) {
    const grouped = new Map()
    for (const item of items) {
      if (!grouped.has(item.Title)) grouped.set(item.Title, [])
      grouped.get(item.Title).push(item)
    }
    return grouped
  }

  const tabContentRefs = new Map()

  function buildTabContent(categoryKey, displayName, items) {
    const categoryItems = items || []
    const activeItems = categoryItems.filter(i => i.IsActive === true)
    const inactiveItems = categoryItems.filter(i => i.IsActive !== true)

    const valueItems = activeItems.map(item => {
      const disableBtn = new Button('Disable', {
        variant: 'ghost',
        class: 'app-admin-disable-btn',
      })

      disableBtn.setEventHandler('click', async () => {
        disableBtn.isLoading = true
        const loading = Toast.loading('Disabling...')
        try {
          await listApi.updateItem(item.Id, { IsActive: 'false' }, item['odata.etag'])
          loading.success('Disabled')
          await refreshAll()
        } catch {
          loading.error('Failed to disable')
        } finally {
          if (disableBtn.isAlive) disableBtn.isLoading = false
        }
      })

      return new Container(
        [new Text(item.Value, { type: 'span' }), disableBtn],
        { class: 'app-admin-value-item' },
      )
    })

    const inactiveValueItems = inactiveItems.map(item => {
      const enableBtn = new Button('Enable', {
        variant: 'ghost',
        class: 'app-admin-enable-btn',
      })

      enableBtn.setEventHandler('click', async () => {
        enableBtn.isLoading = true
        const loading = Toast.loading('Enabling...')
        try {
          await listApi.updateItem(item.Id, { IsActive: 'true' }, item['odata.etag'])
          loading.success('Enabled')
          await refreshAll()
        } catch {
          loading.error('Failed to enable')
        } finally {
          if (enableBtn.isAlive) enableBtn.isLoading = false
        }
      })

      return new Container(
        [new Text(item.Value, { type: 'span', class: 'app-admin-value-inactive' }), enableBtn],
        { class: 'app-admin-value-item app-admin-value-item--inactive' },
      )
    })

    const addField = new FormField({ value: '' })
    const addInput = new TextInput(addField, { placeholder: `Add ${displayName.toLowerCase()}...` })
    const addBtn = new Button('Add', { variant: 'primary' })

    addBtn.setEventHandler('click', async () => {
      const trimmedValue = (addField.value || '').trim()
      if (!trimmedValue) {
        Toast.error('Value cannot be empty')
        return
      }

      const isDuplicate = categoryItems.some(
        i => i.Value.toLowerCase() === trimmedValue.toLowerCase()
      )
      if (isDuplicate) {
        Toast.error('Value already exists')
        return
      }

      addBtn.isLoading = true
      const loading = Toast.loading('Adding...')
      try {
        await listApi.createItem({ Title: categoryKey, Value: trimmedValue, IsActive: 'true' })
        loading.success('Added')
        addField.value = ''
        await refreshAll()
      } catch {
        loading.error('Failed to add')
      } finally {
        if (addBtn.isAlive) addBtn.isLoading = false
      }
    })

    const addRow = new Container([addInput, addBtn], { class: 'app-admin-add-row' })

    const children = [...valueItems, addRow]
    if (inactiveValueItems.length > 0) {
      children.push(
        new Text('Disabled', { type: 'h5', class: 'app-admin-inactive-heading' }),
        ...inactiveValueItems,
      )
    }

    return children
  }

  async function refreshAll() {
    const allItems = await listApi.getItems()
    const grouped = groupByCategory(allItems)
    for (const [categoryKey, displayName] of categoryMap) {
      const container = tabContentRefs.get(categoryKey)
      if (container && container.isAlive) {
        container.children = buildTabContent(categoryKey, displayName, grouped.get(categoryKey))
      }
    }
  }

  const initialGrouped = groupByCategory(initialItems)

  const tabs = categoryMap.map(([categoryKey, displayName]) => {
    const content = new Container(
      buildTabContent(categoryKey, displayName, initialGrouped.get(categoryKey)),
      { class: 'app-admin-tab-content' },
    )
    tabContentRefs.set(categoryKey, content)

    return {
      key: categoryKey,
      label: displayName,
      view: new View([content]),
    }
  })

  const tabGroup = new TabGroup(tabs, { onTabChangeHandler: () => {} })

  return { tabGroup, refreshAll }
}
