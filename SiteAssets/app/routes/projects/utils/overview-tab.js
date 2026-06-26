import { View, Container, Text } from '../../../libs/nofbiz/nofbiz.base.js'
import { createFormSection } from '../../../utils/form-helpers.js'

/**
 * Creates the Overview tab for the project detail page.
 * Read-only KPI dashboard and field summary for data NOT shown in the sidebar.
 * @param {{ project: object, updates: object[] }} params
 * @returns {View}
 */
export function createOverviewTab({ project, updates }) {
  const today = new Date()
  const MS_PER_DAY = 86400000

  function parseDateOrNull(dateStr) {
    if (!dateStr) return null
    const d = new Date(dateStr)
    return isNaN(d.getTime()) ? null : d
  }

  // -------------------------------------------------------------------
  // KPI Calculations
  // -------------------------------------------------------------------

  const startDate = parseDateOrNull(project.StartDate)
  const expectedEndDate = parseDateOrNull(project.ExpectedEndDate)
  const achievedDate = parseDateOrNull(project.AchievedDate)

  const daysSinceStart = startDate
    ? String(Math.floor((today - startDate) / MS_PER_DAY))
    : 'N/A'

  const daysToEnd = expectedEndDate
    ? String(Math.floor((expectedEndDate - today) / MS_PER_DAY))
    : 'N/A'

  const deviationDisplay = (() => {
    if (!achievedDate || !expectedEndDate) return 'N/A'
    const deviationDays = Math.floor((achievedDate - expectedEndDate) / MS_PER_DAY)
    const totalPlannedDays = startDate
      ? Math.floor((expectedEndDate - startDate) / MS_PER_DAY)
      : 0
    const sign = deviationDays >= 0 ? '+' : ''
    if (totalPlannedDays > 0) {
      const pct = ((deviationDays / totalPlannedDays) * 100).toFixed(1)
      const pctSign = deviationDays >= 0 ? '+' : ''
      return `${sign}${deviationDays} days (${pctSign}${pct}%)`
    }
    return `${sign}${deviationDays} days`
  })()

  // -------------------------------------------------------------------
  // KPI Cards
  // -------------------------------------------------------------------

  function kpiCard(label, value) {
    return new Container([
      new Text(label, { type: 'span', class: 'app-kpi-label' }),
      new Text(value, { type: 'span', class: 'app-kpi-value' })
    ], { class: 'app-kpi-card' })
  }

  const kpiRow = new Container([
    kpiCard('Days Since Start', daysSinceStart),
    kpiCard('Days to Expected End', daysToEnd),
    kpiCard('Achieved Date Deviation', deviationDisplay)
  ], { class: 'app-kpi-row' })

  // -------------------------------------------------------------------
  // Read-Only Field Rows
  // -------------------------------------------------------------------

  function readOnlyRow(label, value) {
    return new Container([
      new Text(label, { type: 'span', class: 'app-overview-label' }),
      new Text(value || '--', { type: 'span', class: 'app-overview-value' })
    ], { class: 'app-overview-row' })
  }

  // -------------------------------------------------------------------
  // Dates & Scope Section
  // -------------------------------------------------------------------

  const datesSection = createFormSection('Dates & Scope', [
    readOnlyRow('Role', project.Role),
    readOnlyRow('Start Date', project.StartDate),
    readOnlyRow('Expected End Date', project.ExpectedEndDate),
    readOnlyRow('Scope/Out of Scope', project.Scope),
    readOnlyRow('Product', project.Product),
    readOnlyRow('Umbrella Program', project.UmbrellaProgram)
  ])

  // -------------------------------------------------------------------
  // Impact & Targets Section
  // -------------------------------------------------------------------

  const targetValuesDisplay = (() => {
    const entries = Array.isArray(project.TargetValues) ? project.TargetValues : []
    if (entries.length === 0) return null
    return entries.map(e => `${e.value} ${e.type}`).join(', ')
  })()

  const validatedDisplay = project.Validated === true || project.Validated === 'true'
    ? 'Yes'
    : project.Validated === false || project.Validated === 'false'
      ? 'No'
      : null

  const impactSection = createFormSection('Impact & Targets', [
    readOnlyRow('Target Type', project.TargetType),
    readOnlyRow('Target Values', targetValuesDisplay),
    readOnlyRow('Target Scope', project.TargetScope),
    readOnlyRow('Achieved Value', project.AchievedValue),
    readOnlyRow('Achieved Date', project.AchievedDate),
    readOnlyRow('Validated', validatedDisplay)
  ])

  // -------------------------------------------------------------------
  // Closure Data Section (conditional)
  // -------------------------------------------------------------------

  const hasClosureData = project.NpsScore || project.ClientFeedback || project.Improvements

  const closureSection = hasClosureData
    ? [createFormSection('Closure Data', [
        readOnlyRow('NPS Score', project.NpsScore),
        readOnlyRow('Client Feedback', project.ClientFeedback),
        readOnlyRow('Improvements', project.Improvements)
      ])]
    : []

  return new View([datesSection, impactSection, ...closureSection, kpiRow])
}
