import {
  LIST_DEFINITIONS,
  PROJECT_TYPES, TECH_PROJECTS, TECH_PHASES, PROJECT_STATUSES,
  BUSINESS_LINES, TARGET_TYPES, TARGET_VALUE_TYPES,
} from './constants.js'

// Code defaults per category. Definitions-list values override these; when a
// category has no active rows (or the list is empty/absent), the ComboBox still
// receives a valid dataset instead of undefined -- passing undefined to
// `new ComboBox(field, dataset)` throws "cannot read undefined length".
const CATEGORY_FALLBACKS = {
  ProjectTypes: PROJECT_TYPES,
  TechProjects: TECH_PROJECTS,
  TechPhases: TECH_PHASES,
  ProjectStatuses: PROJECT_STATUSES,
  BusinessLines: BUSINESS_LINES,
  TargetTypes: TARGET_TYPES,
  TargetValueTypes: TARGET_VALUE_TYPES,
}

export async function loadDefinitions(siteApi) {
  const items = await siteApi.list(LIST_DEFINITIONS).getItems()
  const map = new Map()
  for (const item of items) {
    if (item.IsActive !== true && item.IsActive !== 'true') continue
    if (!map.has(item.Title)) map.set(item.Title, [])
    map.get(item.Title).push(item.Value)
  }
  // Guarantee every known category resolves to a non-empty array.
  for (const [category, fallback] of Object.entries(CATEGORY_FALLBACKS)) {
    const values = map.get(category)
    if (!values || values.length === 0) map.set(category, fallback)
  }
  return map
}
