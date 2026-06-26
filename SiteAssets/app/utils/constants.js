// List Name Constants

export const LIST_PROJECTS = 'Projects'
export const LIST_PROGRAMS = 'Programs'
export const LIST_PROJECT_UPDATES = 'ProjectUpdates'
export const LIST_PROPOSALS = 'Proposals'
export const LIST_DEFINITIONS = 'Definitions'

// Dropdown Datasets

export const PROJECT_TYPES = ['Consultancy', 'Transformation', 'Lean', 'PMO', 'Tech', 'Data']

export const TECH_PROJECTS = ['SharePoint', 'PowerBI', 'Dataiku', 'LightDev', 'Automation', 'AI', 'LLM', 'Centric/NOA']

export const TECH_PHASES = ['Discovery', 'Framing', 'Business Case', 'Dev', 'Live', 'CM']

export const GDPR_CLASSIFICATIONS = [
  'Contact Information (CPD)',
  'Non-sensitive Personal Data: Other Information (OPD)',
  'Sensitive Personal Data (SPD)'
]

export const PROJECT_STATUSES = ['Pipeline','On Hold', 'In Progress', 'Completed', 'Stopped', 'Delayed']

export const SCOPE_OPTIONS = ['In Scope', 'Out of Scope']

export const TARGET_TYPES = [
  'User Experience',
  'Client Experience',
  'Revenues',
  'Cost Avoidance',
  'RWA',
  'Operational Risk',
  'Employee Satisfaction'
]

export const TARGET_VALUE_TYPES = ['EUR', 'USD', 'GBP', 'FTE']

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

export const BUSINESS_LINES = ['CCG', 'GCM', 'TB', 'CCCO', 'ESG', 'Finance', 'HR', 'COO', 'Transversal']

export const ITEM_TYPES = ['Project', 'Program', 'Proposal']

// Group Hierarchy (ordered lowest-to-highest privilege, Admins MUST be last)
export const GROUP_HIERARCHY = [
  { groupTitle: 'Collaborators', groupLabel: 'COLLABORATOR' },
  { groupTitle: 'ProjectManagers', groupLabel: 'PROJECT_MANAGER' },
  { groupTitle: 'Admins', groupLabel: 'ADMIN' },
]

// UserRoles list name
export const LIST_USER_ROLES = 'UserRoles'

// Application permission map (used with RoleManager.canAccess)
export const APP_PERMISSIONS = {
  adminArea: ['admin'],
  createProject: ['*'],
  createProgram: ['*'],
  createProposal: ['*'],
  manageTeam: ['admin'],
  viewCapacity: ['admin', 'project_manager'],
}

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
  close: 'close',
  delegate: 'delegate',
  changeAccessLevel: 'changeAccessLevel',
}
