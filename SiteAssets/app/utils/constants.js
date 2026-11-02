// App identity
export const APP_NAME = 'Management Platform'

// List Name Constants

export const LIST_PROJECTS = 'Projects'
export const LIST_PROGRAMS = 'Programs'
export const LIST_PROJECT_UPDATES = 'ProjectUpdates'
export const LIST_PROPOSALS = 'Proposals'
export const LIST_DEFINITIONS = 'Definitions'
export const LIST_SCOPES = 'Scopes'

// Dropdown Datasets
//
// Admin-managed option sets -- ProjectTypes, TechProjects, TechPhases,
// ProjectStatuses, BusinessLines, TargetTypes, TargetValueTypes -- are NOT
// defined here. Admins curate them in the Definitions list; they are loaded at
// runtime via loadDefinitions(siteApi) + defs.get('<Category>'). Never hardcode
// these in constants, comboboxes, detail pages, or search filters.

export const GDPR_CLASSIFICATIONS = [
  'Contact Information (CPD)',
  'Non-sensitive Personal Data: Other Information (OPD)',
  'Sensitive Personal Data (SPD)'
]

export const TARGET_SCOPES = [
  'Global', 'EMEA', 'AMER', 'APAC',
  'France', 'Germany', 'United Kingdom', 'Spain', 'Italy', 'Netherlands',
  'Belgium', 'Luxembourg', 'Switzerland', 'Austria', 'Portugal',
  'Poland', 'Czech Republic', 'Romania', 'Hungary', 'Greece',
  'Sweden', 'Norway', 'Denmark', 'Finland', 'Ireland',
  'United States', 'Canada', 'Brazil', 'Mexico', 'Argentina',
  'China', 'Japan', 'India', 'South Korea', 'Australia',
  'Singapore', 'Hong Kong', 'Taiwan', 'Thailand', 'Malaysia',
  'South Africa', 'Nigeria', 'Egypt', 'Morocco', 'Kenya',
  'UAE', 'Saudi Arabia', 'Turkey', 'Israel', 'Russia'
]

export const ITEM_TYPES = ['Project', 'Program', 'Proposal']

// Group Hierarchy (ordered lowest-to-highest privilege, Admins MUST be last)
export const GROUP_HIERARCHY = [
  { groupTitle: 'Users', groupLabel: 'USER' },
  { groupTitle: 'Admins', groupLabel: 'ADMIN' },
]

// P4P scope: the canonical allocation pool. Queried instead of a SharePoint group.
export const P4P_SCOPE_TITLE = 'P4P'

// ProjectAccess list name
export const LIST_PROJECT_ACCESS = 'ProjectAccess'
export const LIST_ALLOCATIONS = 'Allocations'

// Access levels for projects
export const ACCESS_LEVELS = ['NoRestriction', 'Internal', 'Confidential']

// Access types for delegation records
export const ACCESS_TYPES = ['Contributing', 'Read']

// Project actions (used by canPerformAction)
export const PROJECT_ACTIONS = {
  view: 'view',
  edit: 'edit',
  addUpdate: 'addUpdate',
  delegate: 'delegate',
  changeAccessLevel: 'changeAccessLevel',
}

// Project lifecycle -- terminal status constants
export const PROJECT_STATUS_COMPLETED = 'Completed'
export const PROJECT_STATUS_STOPPED = 'Stopped'

/**
 * Returns true when the project is in the Completed (closed) state.
 * Use this single check everywhere -- never scatter Status string comparisons.
 * @param {{ Status?: string }} project
 * @returns {boolean}
 */
export function isProjectClosed(project) {
  return project.Status === PROJECT_STATUS_COMPLETED
}

/**
 * Default statuses shown in the Capacity Tracker gantt.
 * Pipeline, On Hold, and Stopped are off by default.
 * Completed stays on so past months remain correct after closure.
 */
export const CAPACITY_DEFAULT_STATUSES = ['In Progress', 'Delayed', 'Completed']
