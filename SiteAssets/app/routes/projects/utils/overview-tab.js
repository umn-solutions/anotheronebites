import { View, Container, Text } from '../../../libs/nofbiz/nofbiz.base.js'

/**
 * Isolated "Dates & Scope" row-section component.
 * Renders as 200px-label / 1fr-value rows with zebra wash background.
 * Isolated so a 2a/2b/2c treatment can swap in without touching the parent.
 *
 * @param {object} project
 * @returns {Container}
 */
function createDatesAndScopeSection(project) {
  function readOnlyRow(label, value) {
    const isEmpty = !value
    return new Container([
      new Text(label, { type: 'span', class: 'app-overview-row__label app-overline' }),
      new Text(isEmpty ? '—' : value, {
        type: 'span',
        class: isEmpty ? 'app-overview-row__value app-overview-row__value--empty' : 'app-overview-row__value'
      })
    ], { class: 'app-overview-row' })
  }

  const rows = [
    readOnlyRow('Role', project.Role),
    readOnlyRow('Start Date', project.StartDate),
    readOnlyRow('Expected End Date', project.ExpectedEndDate),
    project.CloseDate ? readOnlyRow('Close Date', project.CloseDate) : null,
    readOnlyRow('Scope', project.Scope),
    readOnlyRow('Product', project.Product),
    readOnlyRow('Umbrella Project', project.UmbrellaProgram),
  ].filter(Boolean)

  return new Container([
    new Container([
      new Text('Dates & Scope', { type: 'h3', class: 'app-section-card__heading' })
    ], { class: 'app-section-card__heading-row' }),
    new Container(rows, { class: 'app-overview-rows' })
  ], { class: 'app-form-section app-overview-section' })
}

/**
 * Isolated "Impact & Targets" row-section component.
 * Isolated so a 2a/2b/2c treatment can swap in without touching the parent.
 *
 * @param {object} project
 * @returns {Container}
 */
function createImpactAndTargetsSection(project) {
  function readOnlyRow(label, value) {
    const isEmpty = !value
    return new Container([
      new Text(label, { type: 'span', class: 'app-overview-row__label app-overline' }),
      new Text(isEmpty ? '—' : value, {
        type: 'span',
        class: isEmpty ? 'app-overview-row__value app-overview-row__value--empty' : 'app-overview-row__value'
      })
    ], { class: 'app-overview-row' })
  }

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

  const rows = [
    readOnlyRow('Target Type', project.TargetType),
    readOnlyRow('Target Values', targetValuesDisplay),
    readOnlyRow('Target Scope', project.TargetScope),
    readOnlyRow('Achieved Value', project.AchievedValue),
    readOnlyRow('Achieved Date', project.AchievedDate),
    readOnlyRow('Validated', validatedDisplay),
  ]

  return new Container([
    new Container([
      new Text('Impact & Targets', { type: 'h3', class: 'app-section-card__heading' })
    ], { class: 'app-section-card__heading-row' }),
    new Container(rows, { class: 'app-overview-rows' })
  ], { class: 'app-form-section app-overview-section' })
}

/**
 * Creates the Overview tab for the project detail page.
 * Restructured per 1c design: KPI grid at the top, then the two isolated row-sections.
 *
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
    : null

  const daysToEnd = expectedEndDate
    ? String(Math.floor((expectedEndDate - today) / MS_PER_DAY))
    : null

  const deviationDisplay = (() => {
    if (!achievedDate || !expectedEndDate) return null
    const deviationDays = Math.floor((achievedDate - expectedEndDate) / MS_PER_DAY)
    const totalPlannedDays = startDate
      ? Math.floor((expectedEndDate - startDate) / MS_PER_DAY)
      : 0
    const sign = deviationDays >= 0 ? '+' : ''
    if (totalPlannedDays > 0) {
      const pct = ((deviationDays / totalPlannedDays) * 100).toFixed(1)
      const pctSign = deviationDays >= 0 ? '+' : ''
      return `${sign}${deviationDays}d (${pctSign}${pct}%)`
    }
    return `${sign}${deviationDays}d`
  })()

  // -------------------------------------------------------------------
  // KPI Cards (app-kpi-grid / app-kpi-card pattern from app.css)
  // -------------------------------------------------------------------

  function kpiCard(label, value) {
    const isEmpty = !value
    return new Container([
      new Text(label, { type: 'span', class: 'app-kpi-card__label' }),
      new Text(isEmpty ? '—' : value, {
        type: 'span',
        class: isEmpty ? 'app-kpi-card__value app-kpi-card__value--empty' : 'app-kpi-card__value'
      })
    ], { class: 'app-kpi-card' })
  }

  const kpiGrid = new Container([
    kpiCard('Days Since Start', daysSinceStart),
    kpiCard('Days to End', daysToEnd),
    kpiCard('Achieved Deviation', deviationDisplay)
  ], { class: 'app-kpi-grid' })

  // -------------------------------------------------------------------
  // Closure Data Section (conditional, keep as-is — not in 1c design spec)
  // -------------------------------------------------------------------

  const hasClosureData = project.NpsScore || project.ClientFeedback || project.Improvements

  function closureRow(label, value) {
    const isEmpty = !value
    return new Container([
      new Text(label, { type: 'span', class: 'app-overview-row__label app-overline' }),
      new Text(isEmpty ? '—' : value, {
        type: 'span',
        class: isEmpty ? 'app-overview-row__value app-overview-row__value--empty' : 'app-overview-row__value'
      })
    ], { class: 'app-overview-row' })
  }

  const closureSection = hasClosureData
    ? [new Container([
        new Container([
          new Text('Closure Data', { type: 'h3', class: 'app-section-card__heading' })
        ], { class: 'app-section-card__heading-row' }),
        new Container([
          closureRow('NPS Score', project.NpsScore),
          closureRow('Client Feedback', project.ClientFeedback),
          closureRow('Improvements', project.Improvements),
        ], { class: 'app-overview-rows' })
      ], { class: 'app-form-section app-overview-section' })]
    : []

  // -------------------------------------------------------------------
  // Assemble: KPI grid, then two isolated sections, then optional closure
  // -------------------------------------------------------------------

  return new View([
    kpiGrid,
    createDatesAndScopeSection(project),
    createImpactAndTargetsSection(project),
    ...closureSection
  ])
}
