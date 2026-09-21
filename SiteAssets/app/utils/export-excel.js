import { hucre, downloadFile } from '../libs/nofbiz/nofbiz.excelparser.js'
import { LIST_PROJECTS, LIST_PROGRAMS, LIST_PROPOSALS } from './constants.js'

// ---------------------------------------------------------------------------
// User field flattening helpers
// ---------------------------------------------------------------------------

/**
 * Flatten a single UserIdentity object (or raw string/null) to a display name.
 * @param {*} raw - already parsed by ListApi (object, null, string, etc.)
 * @returns {string}
 */
function flattenUser(raw) {
  if (!raw) return ''
  if (Array.isArray(raw)) {
    return raw.map(flattenUser).filter(Boolean).join('; ')
  }
  if (typeof raw === 'object') {
    return raw.displayName || raw.name || ''
  }
  if (typeof raw === 'string') return raw
  return ''
}

/**
 * Flatten a TargetValues JSON array (e.g. [{value:'5000',type:'EUR'}, ...])
 * to a readable string like "5000 EUR; 300 FTE".
 * Falls back to JSON.stringify for unexpected shapes.
 * @param {*} raw - already parsed by ListApi
 * @returns {string}
 */
function flattenTargetValues(raw) {
  if (!raw) return ''
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => {
        if (entry && typeof entry === 'object') {
          const v = entry.value != null ? String(entry.value) : ''
          const t = entry.type != null ? String(entry.type) : ''
          return [v, t].filter(Boolean).join(' ')
        }
        return String(entry)
      })
      .filter(Boolean)
      .join('; ')
  }
  // Fallback: plain stringify to avoid [object Object]
  try {
    return JSON.stringify(raw)
  } catch {
    return String(raw)
  }
}

/**
 * Coerce any arbitrary value to a safe cell string.
 * Objects/arrays that are not user identities or target values will be
 * JSON-stringified so no cell ever shows [object Object].
 * @param {*} v
 * @returns {string|number|boolean}
 */
function safeCell(v) {
  if (v == null) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v
  if (Array.isArray(v) || typeof v === 'object') {
    try {
      return JSON.stringify(v)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

const PROJECTS_COLUMNS = [
  { header: 'Id', key: 'Id', width: 8 },
  { header: 'Title', key: 'Title', width: 36 },
  { header: 'UUID', key: 'UUID', width: 28 },
  { header: 'Status', key: 'Status', width: 16 },
  { header: 'Role', key: 'Role', width: 14 },
  { header: 'ProjectType', key: 'ProjectType', width: 18 },
  { header: 'TechProject', key: 'TechProject', width: 18 },
  { header: 'TechPhase', key: 'TechPhase', width: 16 },
  { header: 'UmbrellaProgram', key: 'UmbrellaProgram', width: 28 },
  { header: 'LinkedPrograms', key: 'LinkedPrograms', width: 36 },
  { header: 'Context', key: 'Context', width: 40 },
  { header: 'Objectives', key: 'Objectives', width: 40 },
  { header: 'Scope', key: 'Scope', width: 14 },
  { header: 'StartDate', key: 'StartDate', width: 14 },
  { header: 'ExpectedEndDate', key: 'ExpectedEndDate', width: 16 },
  { header: 'CloseDate', key: 'CloseDate', width: 14 },
  { header: 'GDPRClassification', key: 'GDPRClassification', width: 36 },
  { header: 'BusinessLine', key: 'BusinessLine', width: 16 },
  { header: 'Product', key: 'Product', width: 20 },
  { header: 'ProjectManager', key: 'ProjectManager', width: 24 },
  { header: 'ProjectManagerEmail', key: 'ProjectManagerEmail', width: 28 },
  { header: 'Sponsor', key: 'Sponsor', width: 24 },
  { header: 'Stakeholders', key: 'Stakeholders', width: 36 },
  { header: 'AccessLevel', key: 'AccessLevel', width: 16 },
  { header: 'PMScope', key: 'PMScope', width: 18 },
  { header: 'TargetType', key: 'TargetType', width: 22 },
  { header: 'TargetValues', key: 'TargetValues', width: 28 },
  { header: 'TargetScope', key: 'TargetScope', width: 18 },
  { header: 'AchievedValue', key: 'AchievedValue', width: 18 },
  { header: 'AchievedDate', key: 'AchievedDate', width: 14 },
  { header: 'Validated', key: 'Validated', width: 12 },
  { header: 'NpsScore', key: 'NpsScore', width: 12 },
  { header: 'ClientFeedback', key: 'ClientFeedback', width: 40 },
  { header: 'Improvements', key: 'Improvements', width: 40 },
  { header: 'SubmittedBy', key: 'SubmittedBy', width: 24 },
  { header: 'SubmittedByEmail', key: 'SubmittedByEmail', width: 28 },
]

const PROGRAMS_COLUMNS = [
  { header: 'Id', key: 'Id', width: 8 },
  { header: 'Title', key: 'Title', width: 36 },
  { header: 'UUID', key: 'UUID', width: 28 },
  { header: 'Context', key: 'Context', width: 40 },
  { header: 'ProgramSponsor', key: 'ProgramSponsor', width: 24 },
  { header: 'Stakeholders', key: 'Stakeholders', width: 36 },
  { header: 'UmbrellaProgram', key: 'UmbrellaProgram', width: 28 },
  { header: 'LinkedPrograms', key: 'LinkedPrograms', width: 36 },
  { header: 'PMScope', key: 'PMScope', width: 18 },
  { header: 'SubmittedBy', key: 'SubmittedBy', width: 24 },
  { header: 'SubmittedByEmail', key: 'SubmittedByEmail', width: 28 },
]

const PROPOSALS_COLUMNS = [
  { header: 'Id', key: 'Id', width: 8 },
  { header: 'Title', key: 'Title', width: 36 },
  { header: 'UUID', key: 'UUID', width: 28 },
  { header: 'Context', key: 'Context', width: 40 },
  { header: 'ProjectType', key: 'ProjectType', width: 18 },
  { header: 'BusinessLine', key: 'BusinessLine', width: 16 },
  { header: 'Sponsor', key: 'Sponsor', width: 24 },
  { header: 'Status', key: 'Status', width: 16 },
  { header: 'PMScope', key: 'PMScope', width: 18 },
  { header: 'SubmittedBy', key: 'SubmittedBy', width: 24 },
  { header: 'SubmittedByEmail', key: 'SubmittedByEmail', width: 28 },
]

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

function mapProjectRow(item) {
  return {
    Id: safeCell(item.Id),
    Title: safeCell(item.Title),
    UUID: safeCell(item.UUID),
    Status: safeCell(item.Status),
    Role: safeCell(item.Role),
    ProjectType: safeCell(item.ProjectType),
    TechProject: safeCell(item.TechProject),
    TechPhase: safeCell(item.TechPhase),
    UmbrellaProgram: safeCell(item.UmbrellaProgram),
    LinkedPrograms: safeCell(item.LinkedPrograms),
    Context: safeCell(item.Context),
    Objectives: safeCell(item.Objectives),
    Scope: safeCell(item.Scope),
    StartDate: safeCell(item.StartDate),
    ExpectedEndDate: safeCell(item.ExpectedEndDate),
    CloseDate: safeCell(item.CloseDate),
    GDPRClassification: safeCell(item.GDPRClassification),
    BusinessLine: safeCell(item.BusinessLine),
    Product: safeCell(item.Product),
    ProjectManager: flattenUser(item.ProjectManager),
    ProjectManagerEmail: safeCell(item.ProjectManagerEmail),
    Sponsor: flattenUser(item.Sponsor),
    Stakeholders: flattenUser(item.Stakeholders),
    AccessLevel: safeCell(item.AccessLevel),
    PMScope: safeCell(item.PMScope),
    TargetType: safeCell(item.TargetType),
    TargetValues: flattenTargetValues(item.TargetValues),
    TargetScope: safeCell(item.TargetScope),
    AchievedValue: safeCell(item.AchievedValue),
    AchievedDate: safeCell(item.AchievedDate),
    Validated: safeCell(item.Validated),
    NpsScore: safeCell(item.NpsScore),
    ClientFeedback: safeCell(item.ClientFeedback),
    Improvements: safeCell(item.Improvements),
    SubmittedBy: flattenUser(item.SubmittedBy),
    SubmittedByEmail: safeCell(item.SubmittedByEmail),
  }
}

function mapProgramRow(item) {
  return {
    Id: safeCell(item.Id),
    Title: safeCell(item.Title),
    UUID: safeCell(item.UUID),
    Context: safeCell(item.Context),
    ProgramSponsor: flattenUser(item.ProgramSponsor),
    Stakeholders: flattenUser(item.Stakeholders),
    UmbrellaProgram: safeCell(item.UmbrellaProgram),
    LinkedPrograms: safeCell(item.LinkedPrograms),
    PMScope: safeCell(item.PMScope),
    SubmittedBy: flattenUser(item.SubmittedBy),
    SubmittedByEmail: safeCell(item.SubmittedByEmail),
  }
}

function mapProposalRow(item) {
  return {
    Id: safeCell(item.Id),
    Title: safeCell(item.Title),
    UUID: safeCell(item.UUID),
    Context: safeCell(item.Context),
    ProjectType: safeCell(item.ProjectType),
    BusinessLine: safeCell(item.BusinessLine),
    Sponsor: flattenUser(item.Sponsor),
    Status: safeCell(item.Status),
    PMScope: safeCell(item.PMScope),
    SubmittedBy: flattenUser(item.SubmittedBy),
    SubmittedByEmail: safeCell(item.SubmittedByEmail),
  }
}

// ---------------------------------------------------------------------------
// Public export function
// ---------------------------------------------------------------------------

/**
 * Fetch all site data from SharePoint, build a 3-sheet XLSX workbook, and
 * trigger a browser download.
 *
 * @param {import('../libs/nofbiz/nofbiz.base.js').SiteApi} siteApi - Caller-supplied SiteApi instance.
 * @returns {Promise<void>}
 */
export async function exportSiteDataToExcel(siteApi) {
  const [projects, programs, proposals] = await Promise.all([
    siteApi.list(LIST_PROJECTS).getItems(),
    siteApi.list(LIST_PROGRAMS).getItems(),
    siteApi.list(LIST_PROPOSALS).getItems(),
  ])

  const buffer = await hucre.write({
    sheets: [
      {
        name: 'Projects',
        columns: PROJECTS_COLUMNS,
        data: projects.map(mapProjectRow),
      },
      {
        name: 'Programs',
        columns: PROGRAMS_COLUMNS,
        data: programs.map(mapProgramRow),
      },
      {
        name: 'Proposals',
        columns: PROPOSALS_COLUMNS,
        data: proposals.map(mapProposalRow),
      },
    ],
  })

  downloadFile(buffer, 'site-data-export.xlsx', {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
