import {
  View, Container, Text, NumberInput, Button, FormField, Toast, CurrentUser
} from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_ALLOCATIONS } from '../../../utils/constants.js'
import { styleAfterRender } from '../../../utils/dynamic-style.js'

/**
 * Returns two-letter initials for a display name string.
 * @param {string} name
 * @returns {string}
 */
function initials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

/**
 * Clamp a number to [min, max].
 * @param {number} v
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max)
}

/**
 * FTE bar cell (token-safe: uses inline CSS custom property for width).
 * @param {number|string} fteValue
 * @returns {Container}
 */
function buildFteBarCell(fteValue) {
  const fte = parseFloat(fteValue) || 0
  const isOverAllocated = fte > 1.0
  const isLow = fte < 0.25
  const fillPct = clamp(fte / 2.0, 0, 1) * 100

  const fillClass = isOverAllocated
    ? 'app-fte-bar__fill app-fte-bar__fill--over'
    : isLow
      ? 'app-fte-bar__fill app-fte-bar__fill--low'
      : 'app-fte-bar__fill'

  const fill = styleAfterRender(new Container([], { class: fillClass }), { width: `${fillPct.toFixed(1)}%` })
  const bar = new Container([fill], { class: 'app-fte-bar' })

  return new Container([bar], { class: 'app-table-cell app-capacity-col--bar' })
}

/**
 * Creates the Capacity tab for the project detail page.
 *
 * Rows are derived from the project's PM list (ProjectManager + PMMembers), not
 * from allocation records. Each PM row looks up their allocation record by email.
 * The current user's own row is always editable (create-or-update on Save).
 * All other rows are read-only.
 *
 * @param {{ project: object, siteApi: object, uuid: string, allocations: object[] }} params
 * @returns {View}
 */
export function createCapacityTab({ project, siteApi, uuid, allocations }) {
  const user = new CurrentUser()
  const currentEmail = user.get('email').toLowerCase()

  let currentAllocations = [...allocations]

  // -------------------------------------------------------------------
  // Build the PM list: union of ProjectManager + PMMembers, deduped by email.
  // ProjectManager has priority (role label "Project Manager").
  // Preserve order: ProjectManager first, then PMMembers in order.
  // -------------------------------------------------------------------

  const pmRows = []
  const seenEmails = new Set()

  const pmEmail = (project.ProjectManagerEmail || '').toLowerCase()
  if (pmEmail) {
    const pmIdentity = project.ProjectManager
    const pmName = (pmIdentity && pmIdentity.displayName) ? pmIdentity.displayName : pmEmail
    pmRows.push({ email: pmEmail, displayName: pmName, role: 'Project Manager' })
    seenEmails.add(pmEmail)
  }

  const memberEmailsRaw = (project.PMMembersEmail || '')
    .split(';')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)

  const memberIdentities = Array.isArray(project.PMMembers) ? project.PMMembers : []

  memberEmailsRaw.forEach((email) => {
    if (seenEmails.has(email)) return
    const identity = memberIdentities.find(m => m && m.email && m.email.toLowerCase() === email)
    const displayName = (identity && identity.displayName) ? identity.displayName : email
    pmRows.push({ email, displayName, role: 'PM Member' })
    seenEmails.add(email)
  })

  // -------------------------------------------------------------------
  // Allocation lookup helpers
  // -------------------------------------------------------------------

  function findAllocationForEmail(email) {
    return currentAllocations.find(a => a.UserEmail && a.UserEmail.toLowerCase() === email.toLowerCase())
  }

  function computeTotal() {
    return pmRows.reduce((sum, pm) => {
      const record = findAllocationForEmail(pm.email)
      return sum + (record ? parseFloat(record.AllocationPercent) || 0 : 0)
    }, 0)
  }

  // -------------------------------------------------------------------
  // Table header
  // -------------------------------------------------------------------

  function buildTableHeader() {
    return new Container([
      new Container([new Text('Person', { type: 'span', class: 'app-table-col-header' })], { class: 'app-table-cell app-capacity-col--person' }),
      new Container([new Text('Role', { type: 'span', class: 'app-table-col-header' })], { class: 'app-table-cell app-capacity-col--role' }),
      new Container([new Text('Allocation', { type: 'span', class: 'app-table-col-header' })], { class: 'app-table-cell app-capacity-col--bar' }),
      new Container([new Text('FTE', { type: 'span', class: 'app-table-col-header' })], { class: 'app-table-cell app-capacity-col--fte' })
    ], { class: 'app-table-header' })
  }

  // -------------------------------------------------------------------
  // Totals row — uses a live Text node updated on re-render
  // -------------------------------------------------------------------

  const totalFteText = new Text(computeTotal().toFixed(2), { type: 'span', class: 'app-capacity-totals__value' })

  function buildTotalsRow() {
    return new Container([
      new Container([
        new Text('Total', { type: 'span', class: 'app-overline app-capacity-totals__label' })
      ], { class: 'app-table-cell app-capacity-col--person' }),
      new Container([], { class: 'app-table-cell app-capacity-col--role' }),
      new Container([], { class: 'app-table-cell app-capacity-col--bar' }),
      new Container([totalFteText], { class: 'app-table-cell app-capacity-col--fte' })
    ], { class: 'app-table-row app-table-row--totals' })
  }

  // -------------------------------------------------------------------
  // Row builders
  // -------------------------------------------------------------------

  function buildReadOnlyRow(pm, fte, rowIndex) {
    const personCell = new Container([
      new Container([
        new Text(initials(pm.displayName), { type: 'span', class: 'app-avatar__initials' })
      ], { class: 'app-avatar app-avatar--wash app-avatar--sm' }),
      new Text(pm.displayName, { type: 'span', class: 'app-capacity-name' })
    ], { class: 'app-table-cell app-capacity-col--person' })

    const roleCell = new Container([
      new Text(pm.role, { type: 'span', class: 'app-capacity-role' })
    ], { class: 'app-table-cell app-capacity-col--role' })

    const barCell = buildFteBarCell(fte)

    const fteCell = new Container([
      new Text(fte.toFixed(2), { type: 'span', class: 'app-capacity-fte' })
    ], { class: 'app-table-cell app-capacity-col--fte' })

    const rowClass = rowIndex % 2 === 0
      ? 'app-table-row app-capacity-table__row'
      : 'app-table-row app-capacity-table__row app-table-row--alt'

    return new Container([personCell, roleCell, barCell, fteCell], { class: rowClass })
  }

  function buildEditableRow(pm, existingRecord, rowIndex) {
    const initialFte = existingRecord ? parseFloat(existingRecord.AllocationPercent) || 0 : 0
    const editField = new FormField({ value: initialFte })

    const saveBtn = new Button('Save', {
      variant: 'primary',
      class: 'app-btn-primary--row',
      onClickHandler: async () => {
        saveBtn.isLoading = true
        const loading = Toast.loading('Saving allocation...')
        try {
          if (existingRecord) {
            await siteApi.list(LIST_ALLOCATIONS).updateItem(
              existingRecord.Id,
              {
                AllocationPercent: String(editField.value),
                UpdatedBy: JSON.stringify({ email: pm.email, displayName: pm.displayName }),
                UpdatedByEmail: pm.email,
              },
              existingRecord['odata.etag']
            )
          } else {
            await siteApi.list(LIST_ALLOCATIONS).createItem({
              Title: uuid + '_' + pm.email,
              ProjectUUID: uuid,
              UserEmail: pm.email,
              UserDisplayName: pm.displayName,
              AllocationPercent: String(editField.value),
              UpdatedBy: JSON.stringify({ email: pm.email, displayName: pm.displayName }),
              UpdatedByEmail: pm.email,
            })
          }
          loading.success('Allocation saved')
          await reloadAllocations()
        } catch (err) {
          console.error('[CapacityTab] save allocation:', err)
          loading.error('Failed to save allocation')
        } finally {
          if (saveBtn.isAlive) saveBtn.isLoading = false
        }
      }
    })

    const nameWithTag = pm.displayName + ' (you)'

    const personCell = new Container([
      new Container([
        new Text(initials(pm.displayName), { type: 'span', class: 'app-avatar__initials' })
      ], { class: 'app-avatar app-avatar--wash app-avatar--sm' }),
      new Text(nameWithTag, { type: 'span', class: 'app-capacity-name' })
    ], { class: 'app-table-cell app-capacity-col--person' })

    const roleCell = new Container([
      new Text(pm.role, { type: 'span', class: 'app-capacity-role' })
    ], { class: 'app-table-cell app-capacity-col--role' })

    const editCell = new Container([
      new NumberInput(editField, { step: 0.05, min: 0, max: 2 }),
      saveBtn
    ], { class: 'app-table-cell app-capacity-col--bar app-capacity-col--edit' })

    const fteCell = new Container([
      new Text(initialFte.toFixed(2), { type: 'span', class: 'app-capacity-fte' })
    ], { class: 'app-table-cell app-capacity-col--fte' })

    const rowClass = rowIndex % 2 === 0
      ? 'app-table-row app-capacity-table__row'
      : 'app-table-row app-capacity-table__row app-table-row--alt'

    return new Container([personCell, roleCell, editCell, fteCell], { class: rowClass })
  }

  // -------------------------------------------------------------------
  // Allocation table container — re-rendered on reload
  // -------------------------------------------------------------------

  const allocationTableContainer = new Container([], { class: 'app-capacity-table' })

  function renderAllocationList() {
    totalFteText.children = [computeTotal().toFixed(2)]

    if (pmRows.length === 0) {
      allocationTableContainer.children = [
        new Container([
          new Container([
            new Container([], { class: 'app-empty-state__icon' }),
            new Text('No project managers assigned.', { type: 'p', class: 'app-empty-state__heading' }),
            new Text('Assign a Project Manager or PM Members to track capacity for this project.', { type: 'p', class: 'app-empty-state__desc' })
          ], { class: 'app-empty-state' })
        ])
      ]
      return
    }

    const rows = pmRows.map((pm, idx) => {
      const record = findAllocationForEmail(pm.email)
      const fte = record ? parseFloat(record.AllocationPercent) || 0 : 0
      if (pm.email === currentEmail) {
        return buildEditableRow(pm, record || null, idx)
      }
      return buildReadOnlyRow(pm, fte, idx)
    })

    allocationTableContainer.children = [
      buildTableHeader(),
      ...rows,
      buildTotalsRow()
    ]
  }

  renderAllocationList()

  async function reloadAllocations() {
    currentAllocations = await siteApi.list(LIST_ALLOCATIONS).getItems({ ProjectUUID: uuid })
    renderAllocationList()
  }

  // -------------------------------------------------------------------
  // Team capacity card
  // -------------------------------------------------------------------

  const teamCapacityCard = new Container([
    new Container([
      new Text('Capacity', { type: 'h3', class: 'app-form-section__heading' }),
    ], { class: 'app-form-section__heading-row' }),
    allocationTableContainer
  ], { class: 'app-form-section' })

  return new View([teamCapacityCard])
}
