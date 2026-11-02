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
  // Sub-category map: parent category value -> active sub-category values[]
  // Built from rows with Title='SubCategories' and a non-empty ParentValue field.
  const subCategoryMap = new Map()

  for (const item of items) {
    if (item.Title === 'SubCategories') {
      // Sub categories are keyed by ParentValue, not by Title
      const parent = item.ParentValue || ''
      if (!parent) continue
      if (!subCategoryMap.has(parent)) subCategoryMap.set(parent, [])
      if (item.IsActive === true || item.IsActive === 'true') {
        subCategoryMap.get(parent).push(item.Value)
      }
      continue
    }
    if (item.IsActive !== true && item.IsActive !== 'true') continue
    if (!map.has(item.Title)) map.set(item.Title, [])
    map.get(item.Title).push(item.Value)
  }
  // Guarantee every known category resolves to an array (never undefined), so
  // ComboBoxes bound to an empty category render an empty, selectable dataset.
  for (const category of KNOWN_CATEGORIES) {
    if (!map.has(category)) map.set(category, [])
  }
  // Attach subCategoryMap as a property of the returned Map so callers can
  // access sub category options without a second list fetch.
  map.subCategoryMap = subCategoryMap
  return map
}

/**
 * Return active sub category options for a given parent category value.
 * Always returns an array (never undefined/null), so ComboBox never throws.
 *
 * @param {Map<string, string[]>} subCategoryMap - from defs.subCategoryMap
 * @param {string} parentValue - e.g. 'Tech', 'Data'
 * @returns {string[]}
 */
export function getSubCategoryOptions(subCategoryMap, parentValue) {
  if (!subCategoryMap || !parentValue) return []
  return subCategoryMap.get(parentValue) ?? []
}
