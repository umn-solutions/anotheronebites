import { LIST_DEFINITIONS } from './constants.js'

// Admin-curated option categories live in the Definitions list -- NEVER hardcoded
// here or in constants.js. These are only the category KEYS (not option values),
// used to guarantee `defs.get(category)` returns an array (empty if the admin has
// defined no active rows) rather than undefined -- passing undefined to
// `new ComboBox(field, dataset)` throws "cannot read undefined length".
const KNOWN_CATEGORIES = [
  'ProjectTypes', 'TechProjects', 'TechPhases', 'ProjectStatuses',
  'BusinessLines', 'TargetTypes', 'TargetValueTypes',
]

export async function loadDefinitions(siteApi) {
  const items = await siteApi.list(LIST_DEFINITIONS).getItems()
  const map = new Map()
  for (const item of items) {
    if (item.IsActive !== true && item.IsActive !== 'true') continue
    if (!map.has(item.Title)) map.set(item.Title, [])
    map.get(item.Title).push(item.Value)
  }
  // Guarantee every known category resolves to an array (never undefined), so
  // ComboBoxes bound to an empty category render an empty, selectable dataset.
  for (const category of KNOWN_CATEGORIES) {
    if (!map.has(category)) map.set(category, [])
  }
  return map
}
