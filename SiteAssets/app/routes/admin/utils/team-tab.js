import {
  View, Container, Text, Button, ComboBox, FormField, Toast,
} from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_ALLOCATIONS, LIST_PROJECTS, CAPACITY_DEFAULT_STATUSES } from '../../../utils/constants.js'
import { loadDefinitions } from '../../../utils/definitions.js'
import { statusClass } from '../../../utils/project-card.js'
import { calcMonthCapacity, getMonthWeeks, isOverAllocated } from './capacity-calc.js'

const MONTH_FULL_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Builds the Capacity Tracker gantt tab.
 *
 * @param {{ siteApi: object, p4pMembers: Array<{ email: string, displayName: string }> }} params
 * @returns {Promise<View>}
 */
export async function createTeamTab({ siteApi, p4pMembers }) {
  if (!p4pMembers || p4pMembers.length === 0) {
    return new View([
      new Container([
        new Container([
          new Container([], { class: 'app-empty-state__sq app-empty-state__sq--1' }),
          new Container([], { class: 'app-empty-state__sq app-empty-state__sq--2' }),
          new Container([], { class: 'app-empty-state__sq app-empty-state__sq--3' }),
        ], { class: 'app-empty-state__icon' }),
        new Text('No team members', { type: 'h3', class: 'app-empty-state__heading' }),
        new Text('No members are registered in the P4P scope. Add members in the Scopes tab.', { type: 'p', class: 'app-empty-state__desc' }),
      ], { class: 'app-empty-state' }),
    ])
  }

  // ------------------------------------------------------------------
  // Data loading
  // ------------------------------------------------------------------

  let allAllocations, allProjects, defs
  try {
    ;[allAllocations, allProjects, defs] = await Promise.all([
      siteApi.list(LIST_ALLOCATIONS).getItems(),
      siteApi.list(LIST_PROJECTS).getItems(
        undefined,
        { viewFields: ['UUID', 'Title', 'Status', 'StartDate', 'ExpectedEndDate', 'CloseDate'] }
      ),
      loadDefinitions(siteApi),
    ])
  } catch (err) {
    console.error('[TeamTab] failed to load allocations/projects/definitions', err)
    Toast.error('Could not load Capacity Tracker data. Please reload.')
    return new View([
      new Text('Could not load team data. Please reload.', { type: 'p', class: 'app-error-text' }),
    ])
  }

  // ------------------------------------------------------------------
  // Today / month state
  // ------------------------------------------------------------------

  // Snapshot today once; passed to capacity-calc as a parameter.
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  let displayYear = now.getFullYear()
  let displayMonth = now.getMonth() + 1  // 1-indexed

  function isCurrentMonth() {
    return displayYear === now.getFullYear() && displayMonth === now.getMonth() + 1
  }

  function monthLabel() {
    return `${MONTH_FULL_NAMES[displayMonth - 1]} ${displayYear}`
  }

  // ------------------------------------------------------------------
  // Status filter
  // ------------------------------------------------------------------

  const activeStatuses = defs.get('ProjectStatuses') || []
  const defaultStatusOpts = CAPACITY_DEFAULT_STATUSES
    .filter(s => activeStatuses.includes(s))
    .map(s => ({ label: s, value: s }))

  const statusFilterField = new FormField({ value: defaultStatusOpts })
  const statusFilter = new ComboBox(statusFilterField, activeStatuses, {
    allowMultiple: true,
    allowFiltering: false,
    placeholder: 'Select statuses...',
  })

  function getSelectedStatuses() {
    const val = statusFilterField.value
    if (!val || !Array.isArray(val)) return []
    return val.map(o => o.value)
  }

  // ------------------------------------------------------------------
  // UI containers that will be updated on refresh
  // ------------------------------------------------------------------

  const monthLabelContainer = new Container([
    new Text(monthLabel(), { type: 'span', class: 'app-gantt-month-text' }),
  ], { class: 'app-gantt-month-label' })

  const ganttContainer = new Container([], { class: 'app-gantt-grid' })

  // ------------------------------------------------------------------
  // Navigation buttons (created before refresh so isDisabled can be set)
  // ------------------------------------------------------------------

  const prevBtn = new Button('Previous', { variant: 'secondary' })
  const nextBtn = new Button('Next', { variant: 'secondary' })
  const currentMonthBtn = new Button('Current month', { variant: 'secondary' })

  prevBtn.setEventHandler('click', () => {
    if (displayMonth === 1) { displayYear -= 1; displayMonth = 12 }
    else { displayMonth -= 1 }
    refresh()
  })

  nextBtn.setEventHandler('click', () => {
    if (displayMonth === 12) { displayYear += 1; displayMonth = 1 }
    else { displayMonth += 1 }
    refresh()
  })

  currentMonthBtn.setEventHandler('click', () => {
    displayYear = now.getFullYear()
    displayMonth = now.getMonth() + 1
    refresh()
  })

  // Subscribe to status filter changes
  statusFilterField.subscribe(() => refresh())

  // ------------------------------------------------------------------
  // Grid builders
  // ------------------------------------------------------------------

  function buildHeaderRow(weeks) {
    const pmCell = new Container([
      new Text('Project Manager', { type: 'span', class: 'app-gantt-header-cell' }),
    ], { class: 'app-gantt-row-cell app-gantt-row-cell--pm' })

    const totalCell = new Container([
      new Text('Total', { type: 'span', class: 'app-gantt-header-cell' }),
    ], { class: 'app-gantt-row-cell app-gantt-row-cell--total' })

    const weekCells = weeks.map(w =>
      new Container([
        new Text(w.label, { type: 'span', class: 'app-gantt-week-label' }),
        new Text(w.range, { type: 'span', class: 'app-gantt-week-range' }),
      ], { class: 'app-gantt-row-cell app-gantt-row-cell--week' })
    )

    return new Container([pmCell, totalCell, ...weekCells], { class: 'app-gantt-header-row app-gantt-data-row' })
  }

  function buildWeekSummaryCell(weekData, { flagOverAllocation }) {
    const over = flagOverAllocation && isOverAllocated(weekData.fte)
    const cellClass = `app-gantt-row-cell app-gantt-row-cell--week${over ? ' app-gantt-week-over' : ''}`
    const children = []

    if (weekData.fte > 0 || weekData.projectCount > 0) {
      children.push(new Text(`${weekData.fte.toFixed(2)} FTE`, { type: 'span', class: 'app-gantt-week-fte' }))
      const countLabel = weekData.projectCount === 1 ? '1 project' : `${weekData.projectCount} projects`
      children.push(new Text(countLabel, { type: 'span', class: 'app-gantt-week-count' }))
    }

    if (over) {
      children.push(new Text('Over allocated', { type: 'span', class: 'app-gantt-over-label' }))
    }

    return new Container(children, { class: cellClass })
  }

  function projectBarCellClass(activeWeeks, weekIndex) {
    if (!activeWeeks[weekIndex]) {
      return 'app-gantt-row-cell app-gantt-row-cell--week app-gantt-bar-empty'
    }
    const isStart = weekIndex === 0 || !activeWeeks[weekIndex - 1]
    const isEnd = weekIndex === 3 || !activeWeeks[weekIndex + 1]
    let mod
    if (isStart && isEnd) mod = 'app-gantt-bar-cell--single'
    else if (isStart) mod = 'app-gantt-bar-cell--start'
    else if (isEnd) mod = 'app-gantt-bar-cell--end'
    else mod = 'app-gantt-bar-cell--middle'
    return `app-gantt-row-cell app-gantt-row-cell--week app-gantt-bar-cell ${mod}`
  }

  function buildProjectRow(proj) {
    // Column 1: badge + title (indented)
    const titleCell = new Container([
      new Text(proj.status, { type: 'span', class: statusClass(proj.status) }),
      new Text(proj.title, { type: 'span', class: 'app-gantt-project-title' }),
    ], { class: 'app-gantt-row-cell app-gantt-row-cell--pm app-gantt-project-title-cell' })

    // Column 2: project FTE
    const fteCell = new Container([
      new Text(`${proj.fte.toFixed(2)} FTE`, { type: 'span', class: 'app-gantt-project-fte' }),
    ], { class: 'app-gantt-row-cell app-gantt-row-cell--total' })

    // Columns 3-6: bar cells
    const barCells = proj.activeWeeks.map((active, i) => {
      const cls = projectBarCellClass(proj.activeWeeks, i)
      const children = active
        ? [new Text(proj.fte.toFixed(2), { type: 'span', class: 'app-gantt-bar-fte' })]
        : []
      return new Container(children, { class: cls })
    })

    return new Container([titleCell, fteCell, ...barCells], { class: 'app-gantt-data-row app-gantt-project-row' })
  }

  function buildMemberRows(member) {
    const isZero = member.totalProjects === 0
    const rowClass = `app-gantt-data-row app-gantt-member-row${isZero ? ' app-gantt-member-row--zero' : ''}`

    // Column 1: PM name
    const nameCell = new Container([
      new Text(member.name, { type: 'span', class: 'app-gantt-member-name' }),
    ], { class: 'app-gantt-row-cell app-gantt-row-cell--pm' })

    // Column 2: total projects
    const totalCountText = isZero ? '0 projects' : (member.totalProjects === 1 ? '1 project' : `${member.totalProjects} projects`)
    const totalCell = new Container([
      new Text(totalCountText, { type: 'span', class: `app-gantt-total-projects${isZero ? ' app-gantt-total-projects--zero' : ''}` }),
    ], { class: 'app-gantt-row-cell app-gantt-row-cell--total' })

    // Columns 3-6: week FTE + count
    const weekCells = member.weeks.map(w => buildWeekSummaryCell(w, { flagOverAllocation: true }))

    const summaryRow = new Container([nameCell, totalCell, ...weekCells], { class: rowClass })

    const projectRows = member.projects.map(proj => buildProjectRow(proj))

    return new Container([summaryRow, ...projectRows], { class: 'app-gantt-member-group' })
  }

  function buildTotalsRow(totals) {
    const labelCell = new Container([
      new Text('Team Total', { type: 'span', class: 'app-gantt-totals-label' }),
    ], { class: 'app-gantt-row-cell app-gantt-row-cell--pm' })

    const totalLabel = totals.totalProjects === 1 ? '1 project' : `${totals.totalProjects} projects`
    const totalCell = new Container([
      new Text(totalLabel, { type: 'span', class: 'app-gantt-total-projects' }),
    ], { class: 'app-gantt-row-cell app-gantt-row-cell--total' })

    // 1.00 FTE is a per-person limit; a team sum above it is normal.
    const weekCells = totals.weeks.map(w => buildWeekSummaryCell(w, { flagOverAllocation: false }))

    return new Container([labelCell, totalCell, ...weekCells], { class: 'app-gantt-data-row app-gantt-totals-row' })
  }

  function buildNoStatusMessage() {
    return new Container([
      new Text('No statuses selected. Use the filter above to choose which project statuses to include.', {
        type: 'p', class: 'app-gantt-no-statuses-msg',
      }),
    ], { class: 'app-gantt-empty-message' })
  }

  // ------------------------------------------------------------------
  // Refresh: rebuild gantt grid
  // ------------------------------------------------------------------

  function refresh() {
    // Update month label
    monthLabelContainer.children = [
      new Text(monthLabel(), { type: 'span', class: 'app-gantt-month-text' }),
    ]

    // Update current month button state
    currentMonthBtn.isDisabled = isCurrentMonth()

    const selectedStatuses = getSelectedStatuses()
    const weeks = getMonthWeeks(displayYear, displayMonth)

    if (selectedStatuses.length === 0) {
      ganttContainer.children = [buildHeaderRow(weeks), buildNoStatusMessage()]
      return
    }

    const result = calcMonthCapacity(
      p4pMembers, allAllocations, allProjects,
      todayStr, displayYear, displayMonth, selectedStatuses
    )

    const memberRowGroups = result.members.map(m => buildMemberRows(m))
    ganttContainer.children = [
      buildHeaderRow(weeks),
      ...memberRowGroups,
      buildTotalsRow(result.totals),
    ]
  }

  // Initial render
  refresh()

  // ------------------------------------------------------------------
  // Toolbar
  // ------------------------------------------------------------------

  const filterLabel = new Text('Statuses', { type: 'span', class: 'app-gantt-filter-label app-overline' })
  const filterWrapper = new Container([filterLabel, statusFilter], { class: 'app-gantt-filter-group' })

  const toolbar = new Container([
    prevBtn,
    monthLabelContainer,
    nextBtn,
    currentMonthBtn,
    filterWrapper,
  ], { class: 'app-gantt-toolbar' })

  const scrollWrapper = new Container([ganttContainer], { class: 'app-gantt-scroll' })

  return new View([toolbar, scrollWrapper])
}
