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

  // Group sub category items (Title==='SubCategories') by their ParentValue
  function groupSubCategoriesByParent(items) {
    const byParent = new Map()
    for (const item of items) {
      if (item.Title !== 'SubCategories') continue
      const parent = item.ParentValue || ''
      if (!parent) continue
      if (!byParent.has(parent)) byParent.set(parent, [])
      byParent.get(parent).push(item)
    }
    return byParent
  }

  const tabContentRefs = new Map()

  /**
   * Build the list of children for a single category tab content.
   * @param {string} categoryKey
   * @param {string} displayName
   * @param {object[]} items - raw Definitions rows for this category/parent
   * @param {function|null} createPayloadFn - optional; receives trimmedValue and returns
   *   the object to pass to listApi.createItem. Defaults to {Title:categoryKey, Value, IsActive}.
   */
  function buildTabContent(categoryKey, displayName, items, createPayloadFn = null) {
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
        } catch (err) {
          console.error('[DefinitionsTab] disable (IsActive=false) failed', err)
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
        } catch (err) {
          console.error('[DefinitionsTab] enable (IsActive=true) failed', err)
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
        const payload = createPayloadFn
          ? createPayloadFn(trimmedValue)
          : { Title: categoryKey, Value: trimmedValue, IsActive: 'true' }
        await listApi.createItem(payload)
        loading.success('Added')
        addField.value = ''
        await refreshAll()
      } catch (err) {
        console.error('[DefinitionsTab] add failed', err)
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

  /**
   * Build the grouped content for the Sub Categories tab.
   * Groups sub category items by their parent category (ProjectTypes), calling
   * buildTabContent per parent so add/disable/enable logic is not duplicated.
   * Inactive parents that still have sub categories are shown with a visual note
   * so orphaned sub categories are never hidden from admins.
   */
  function buildSubCategoriesContent(allItems) {
    const parentItems = allItems.filter(i => i.Title === 'ProjectTypes')
    const subByParent = groupSubCategoriesByParent(allItems)

    // Render active ProjectTypes + any parent that has sub categories (even if disabled)
    const parentValuesToRender = new Set()
    for (const item of parentItems) parentValuesToRender.add(item.Value)
    for (const key of subByParent.keys()) parentValuesToRender.add(key)

    const result = []

    for (const parentValue of parentValuesToRender) {
      const parentItem = parentItems.find(i => i.Value === parentValue)
      const isParentActive = parentItem && (parentItem.IsActive === true || parentItem.IsActive === 'true')
      const parentSubItems = subByParent.get(parentValue) || []

      // Skip inactive parents with no sub categories -- nothing to show or add
      if (!isParentActive && parentSubItems.length === 0) continue

      const headingText = isParentActive ? parentValue : `${parentValue} (category disabled)`
      const headingClass = isParentActive
        ? 'app-admin-subcategory-parent-heading'
        : 'app-admin-subcategory-parent-heading app-admin-subcategory-parent-heading--inactive'

      result.push(
        new Container([
          new Text(headingText, { type: 'h4', class: headingClass }),
          ...buildTabContent(
            'SubCategories',
            'Sub Category',
            parentSubItems,
            (value) => ({ Title: 'SubCategories', Value: value, IsActive: 'true', ParentValue: parentValue }),
          ),
        ], { class: 'app-admin-subcategory-group' }),
      )
    }

    if (result.length === 0) {
      result.push(new Text('No categories defined yet.', { type: 'p', class: 'app-admin-empty-note' }))
    }
    return result
  }

  async function refreshAll() {
    const allItems = await listApi.getItems()
    const grouped = groupByCategory(allItems)
    for (const [categoryKey, displayName] of categoryMap) {
      const container = tabContentRefs.get(categoryKey)
      if (!container || !container.isAlive) continue
      if (categoryKey === 'SubCategories') {
        container.children = buildSubCategoriesContent(allItems)
      } else {
        container.children = buildTabContent(categoryKey, displayName, grouped.get(categoryKey))
      }
    }
  }

  const initialGrouped = groupByCategory(initialItems)

  const tabs = categoryMap.map(([categoryKey, displayName]) => {
    const contentChildren = categoryKey === 'SubCategories'
      ? buildSubCategoriesContent(initialItems)
      : buildTabContent(categoryKey, displayName, initialGrouped.get(categoryKey))

    const content = new Container(
      contentChildren,
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
