/**
 * Capacity calculation for the Gantt / Capacity Tracker view.
 *
 * Pure module: no SPARC imports. Runs under plain Node.js for unit testing.
 * All date comparisons use ISO 'YYYY-MM-DD' strings (lexicographic order equals
 * chronological order) to avoid timezone bugs. `today` is always passed as a
 * parameter -- never read from Date() inside these functions.
 */

import { PROJECT_STATUS_COMPLETED, PROJECT_STATUS_STOPPED } from '../../../utils/constants.js'

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/**
 * Zero-pads a number to 2 digits and returns an ISO date string.
 * @param {number} year
 * @param {number} month - 1-indexed
 * @param {number} day
 * @returns {string} 'YYYY-MM-DD'
 */
function padDate(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * Returns the last day of the given month.
 * @param {number} year
 * @param {number} month - 1-indexed (1=Jan, 12=Dec)
 * @returns {number} day number (28-31)
 */
function lastDayOfMonth(year, month) {
  // new Date(year, month, 0) gives the last day of month-1 in 0-indexed months,
  // which is equivalent to the last day of `month` in 1-indexed terms.
  return new Date(year, month, 0).getDate()
}

/**
 * Returns 4 week objects for the given year/month.
 * Always exactly 4 weeks: days 1-7, 8-14, 15-21, 22-lastDay.
 *
 * @param {number} year
 * @param {number} month - 1-indexed
 * @returns {Array<{ start: string, end: string, label: string, range: string }>}
 */
export function getMonthWeeks(year, month) {
  const lastDay = lastDayOfMonth(year, month)
  const abbr = MONTH_NAMES[month - 1]
  return [
    { start: padDate(year, month, 1),  end: padDate(year, month, 7),       label: 'W1', range: `1-7 ${abbr}` },
    { start: padDate(year, month, 8),  end: padDate(year, month, 14),      label: 'W2', range: `8-14 ${abbr}` },
    { start: padDate(year, month, 15), end: padDate(year, month, 21),      label: 'W3', range: `15-21 ${abbr}` },
    { start: padDate(year, month, 22), end: padDate(year, month, lastDay), label: 'W4', range: `22-${lastDay} ${abbr}` },
  ]
}

/**
 * Returns an ISO date string for the last day of the month containing `today`.
 * @param {string} today - 'YYYY-MM-DD'
 * @returns {string} 'YYYY-MM-DD'
 */
function lastDayOfTodayMonth(today) {
  const year = parseInt(today.slice(0, 4), 10)
  const month = parseInt(today.slice(5, 7), 10)
  return padDate(year, month, lastDayOfMonth(year, month))
}

/**
 * Returns the effective [start, end] window for a project.
 * Null values are open-ended in that direction.
 *
 * End resolution order:
 *   1. CloseDate if set -> use CloseDate.
 *   2. Status is terminal (Completed or Stopped):
 *      a. ExpectedEndDate set -> use it.
 *      b. No ExpectedEndDate -> null (open-ended -- unusual for closed projects).
 *   3. Project still open:
 *      a. No ExpectedEndDate -> null (open-ended, no known end).
 *      b. ExpectedEndDate today or later -> use it.
 *      c. ExpectedEndDate before today (overdue) -> lastDayOfTodayMonth. Still
 *         consuming capacity, but no end is known, so it stops at the current month.
 *
 * @param {{ Status?: string, StartDate?: string, ExpectedEndDate?: string, CloseDate?: string }} project
 * @param {string} today - 'YYYY-MM-DD' real current date
 * @returns {{ start: string|null, end: string|null }}
 */
export function getProjectWindow(project, today) {
  const start = project.StartDate || null
  const closeDate = project.CloseDate || null
  const expectedEnd = project.ExpectedEndDate || null

  let end
  if (closeDate) {
    end = closeDate
  } else if (project.Status === PROJECT_STATUS_COMPLETED || project.Status === PROJECT_STATUS_STOPPED) {
    end = expectedEnd || null
  } else {
    // Project still open
    if (!expectedEnd) {
      end = null  // open-ended
    } else {
      end = expectedEnd < today ? lastDayOfTodayMonth(today) : expectedEnd
    }
  }

  return { start, end }
}

/**
 * Returns true when the given week overlaps the project window (inclusive).
 * Overlap test: NOT (end < weekStart OR start > weekEnd)
 *   = (end is null OR end >= weekStart) AND (start is null OR start <= weekEnd)
 *
 * @param {{ start: string, end: string }} week
 * @param {{ start: string|null, end: string|null }} window
 * @returns {boolean}
 */
export function isWeekActive(week, window) {
  const { start, end } = window
  return (end === null || end >= week.start) && (start === null || start <= week.end)
}

/**
 * Returns true when the FTE value (after rounding to 2 decimals) exceeds 1.00.
 * Rounding guards against floating-point accumulation noise (e.g. 0.1+0.2).
 * @param {number} fte
 * @returns {boolean}
 */
export function isOverAllocated(fte) {
  return parseFloat(fte.toFixed(2)) > 1
}

/**
 * Calculates monthly capacity for all P4P members.
 *
 * @param {Array<{ email: string, displayName: string }>} p4pMembers
 * @param {Array<object>} allocations  - rows from the Allocations list
 * @param {Array<object>} projects     - rows from the Projects list
 * @param {string}        today        - 'YYYY-MM-DD' real current date (never computed inside)
 * @param {number}        year         - displayed year
 * @param {number}        month        - displayed month (1-indexed)
 * @param {string[]}      selectedStatuses - which project statuses count
 * @returns {{
 *   members: Array<{
 *     name: string, email: string,
 *     totalProjects: number,
 *     weeks: Array<{ fte: number, projectCount: number }>,
 *     projects: Array<{ title: string, uuid: string, status: string, fte: number, activeWeeks: boolean[] }>
 *   }>,
 *   totals: { totalProjects: number, weeks: Array<{ fte: number, projectCount: number }> }
 * }}
 */
export function calcMonthCapacity(p4pMembers, allocations, projects, today, year, month, selectedStatuses) {
  const weeks = getMonthWeeks(year, month)
  const selectedSet = new Set(selectedStatuses)

  // Build project lookup by UUID
  const projectByUUID = new Map(projects.map(p => [p.UUID, p]))

  // Build allocation lookup by lowercase email
  const allocsByEmail = new Map()
  for (const alloc of allocations) {
    const email = (alloc.UserEmail || '').toLowerCase()
    if (!email) continue
    if (!allocsByEmail.has(email)) allocsByEmail.set(email, [])
    allocsByEmail.get(email).push({
      projectUUID: alloc.ProjectUUID,
      fte: parseFloat(alloc.AllocationPercent) || 0,
    })
  }

  // Team-level accumulators
  const teamWeekFTE = [0, 0, 0, 0]
  const teamWeekUUIDs = [new Set(), new Set(), new Set(), new Set()]
  const allTeamUUIDs = new Set()

  const members = p4pMembers.map(member => {
    const email = member.email.toLowerCase()
    const allocs = allocsByEmail.get(email) || []

    const weekFTE = [0, 0, 0, 0]
    const weekUUIDs = [new Set(), new Set(), new Set(), new Set()]
    const countedProjects = []

    for (const alloc of allocs) {
      const project = projectByUUID.get(alloc.projectUUID)
      if (!project) continue
      if (!selectedSet.has(project.Status)) continue

      const window = getProjectWindow(project, today)
      const activeWeeks = weeks.map(w => isWeekActive(w, window))

      // Skip projects with no overlap in this month
      if (!activeWeeks.some(Boolean)) continue

      countedProjects.push({
        title: project.Title,
        uuid: project.UUID,
        status: project.Status,
        fte: alloc.fte,
        activeWeeks,
      })

      for (let i = 0; i < 4; i++) {
        if (activeWeeks[i]) {
          weekFTE[i] += alloc.fte
          weekUUIDs[i].add(alloc.projectUUID)
        }
      }
    }

    const activeUUIDs = new Set(countedProjects.map(p => p.uuid))

    // Accumulate into team totals
    for (let i = 0; i < 4; i++) {
      teamWeekFTE[i] += weekFTE[i]
      for (const uuid of weekUUIDs[i]) teamWeekUUIDs[i].add(uuid)
    }
    for (const uuid of activeUUIDs) allTeamUUIDs.add(uuid)

    return {
      name: member.displayName,
      email: member.email,
      totalProjects: activeUUIDs.size,
      weeks: weekFTE.map((fte, i) => ({ fte, projectCount: weekUUIDs[i].size })),
      projects: countedProjects,
    }
  })

  return {
    members,
    totals: {
      totalProjects: allTeamUUIDs.size,
      weeks: teamWeekFTE.map((fte, i) => ({ fte, projectCount: teamWeekUUIDs[i].size })),
    },
  }
}
