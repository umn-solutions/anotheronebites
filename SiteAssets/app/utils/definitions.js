import { LIST_DEFINITIONS } from './constants.js'

export async function loadDefinitions(siteApi) {
  const items = await siteApi.list(LIST_DEFINITIONS).getItems()
  const map = new Map()
  for (const item of items) {
    if (item.IsActive !== true) continue
    if (!map.has(item.Title)) map.set(item.Title, [])
    map.get(item.Title).push(item.Value)
  }
  return map
}
