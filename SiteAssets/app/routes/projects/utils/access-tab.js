import {
  View, Container, Text, Button, ComboBox, PeoplePicker,
  FormField, Toast, Dialog, CurrentUser
} from '../../../libs/nofbiz/nofbiz.base.js'
import { ACCESS_LEVELS, ACCESS_TYPES, LIST_PROJECT_ACCESS, LIST_PROJECTS } from '../../../utils/constants.js'
import { canPerformAction } from '../../../utils/access-control.js'
import { createLabeledField, createFormSection, createFormRow, comboValue } from '../../../utils/form-helpers.js'

/**
 * Returns the two-letter initials for a display name or email string.
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
 * Creates the Access tab for the project detail page.
 * Redesigned per 3d spec: three stacked left-accent cards with proper table layout.
 *
 * @param {{ project: object, siteApi: object, uuid: string, effectiveRole: string, delegations: object[] }} params
 * @returns {View}
 */
export function createAccessTab({ project, siteApi, uuid, effectiveRole, delegations }) {
  const user = new CurrentUser()
  const currentUserEmail = user.get('email')
  const currentUserName = user.get('displayName')

  const canDelegate = canPerformAction(effectiveRole, 'delegate')
  const canChangeAccess = canPerformAction(effectiveRole, 'changeAccessLevel')

  // Human-readable labels for stored access level tokens
  const ACCESS_LEVEL_LABELS = {
    NoRestriction: 'Open — no restriction',
    Internal: 'Internal only',
    Confidential: 'Confidential',
  }

  // Accurate per-level descriptions (see .claude/rules/access-control.md).
  const ACCESS_LEVEL_DESCRIPTIONS = {
    NoRestriction: 'Open to everyone — unless a PM scope is set, in which case only that scope\'s members (plus project members and delegated users) can open it.',
    Internal: 'Restricted — only admins, project members, and explicitly delegated users can open it. PM scope membership does not grant access.',
    Confidential: 'Confidential — only admins, project members, and explicitly delegated users can view it.',
  }

  // -------------------------------------------------------------------
  // Card 1: Access Level
  // -------------------------------------------------------------------

  function buildAccessLevelCard() {
    const levelValue = project.AccessLevel || 'NoRestriction'
    const isPermanent = levelValue === 'Confidential'
    const levelLabel = ACCESS_LEVEL_LABELS[levelValue] || levelValue

    const levelDisplay = new Text(levelLabel, { type: 'span', class: 'app-access-level__value' })

    const permanentPill = isPermanent
      ? new Text('Permanent', { type: 'span', class: 'app-access-level__permanent-pill' })
      : null

    const description = new Text(
      ACCESS_LEVEL_DESCRIPTIONS[levelValue] || ACCESS_LEVEL_DESCRIPTIONS.NoRestriction,
      { type: 'p', class: 'app-access-level__desc' }
    )

    const changeBtn = canChangeAccess && !isPermanent
      ? buildChangeAccessBtn(levelValue)
      : null

    const topRow = new Container([
      new Container([
        levelDisplay,
        ...(permanentPill ? [permanentPill] : [])
      ], { class: 'app-access-level__level-row' }),
      description,
      ...(changeBtn ? [changeBtn] : [])
    ], { class: 'app-access-level__body' })

    return new Container([
      new Container([
        new Text('Access Level', { type: 'h3', class: 'app-form-section__heading' })
      ], { class: 'app-form-section__heading-row' }),
      topRow
    ], { class: 'app-form-section' })
  }

  function buildChangeAccessBtn(currentLevel) {
    const filteredLevels = ACCESS_LEVELS.filter(l => l !== 'Confidential')
    const accessLevelField = new FormField({
      value: { label: currentLevel, value: currentLevel }
    })
    const accessLevelCombo = new ComboBox(accessLevelField, filteredLevels, {
      allowFiltering: false,
      placeholder: 'Select access level'
    })

    const saveAccessBtn = new Button('Save Access Level', {
      variant: 'primary',
      class: 'app-btn-primary app-btn-primary--card',
      onClickHandler: async () => {
        saveAccessBtn.isLoading = true
        const loading = Toast.loading('Saving access level...')
        try {
          await siteApi.list(LIST_PROJECTS).updateItem(
            project.Id,
            { AccessLevel: comboValue(accessLevelField.value) },
            project['odata.etag']
          )
          const [fresh] = await siteApi.list(LIST_PROJECTS).getItemByUUID(uuid)
          if (fresh && fresh['odata.etag']) project['odata.etag'] = fresh['odata.etag']
          loading.success('Access level saved')
        } catch (err) {
          console.error('[AccessTab] save access level:', err)
          loading.error('Failed to save access level')
        } finally {
          if (saveAccessBtn.isAlive) saveAccessBtn.isLoading = false
        }
      }
    })

    return new Container([
      createLabeledField('Level', accessLevelCombo),
      new Container([saveAccessBtn], { class: 'app-form-actions' })
    ], { class: 'app-access-level__change' })
  }

  // -------------------------------------------------------------------
  // Card 2: Delegations table
  // -------------------------------------------------------------------

  let currentDelegations = [...delegations]
  const delegationTableBody = new Container([], { class: 'app-delegation-table__body' })
  const delegationCountText = new Text(
    `${currentDelegations.length} ${currentDelegations.length === 1 ? 'person' : 'people'}`,
    { type: 'span', class: 'app-section-card__meta' }
  )

  function buildDelegationRow(d, rowIndex) {
    const nameStr = d.UserDisplayName || d.UserEmail || ''
    const emailStr = d.UserEmail || ''
    const grantedDate = d.Created
      ? (typeof d.Created === 'string' ? d.Created.split('T')[0] : '')
      : ''

    const avatarCell = new Container([
      new Container([
        new Text(initials(nameStr), { type: 'span', class: 'app-avatar__initials' })
      ], { class: 'app-avatar app-avatar--wash' }),
      new Container([
        new Text(nameStr, { type: 'span', class: 'app-delegation-row__name' }),
        new Text(emailStr, { type: 'span', class: 'app-delegation-row__email' })
      ], { class: 'app-delegation-row__person-text' })
    ], { class: 'app-delegation-row__person app-table-cell' })

    const accessTypeCell = new Container([
      new Text(d.AccessType || '', { type: 'span' })
    ], { class: 'app-table-cell app-delegation-row__access-type' })

    const grantedCell = new Container([
      new Text(grantedDate, { type: 'span', class: 'app-delegation-row__granted' })
    ], { class: 'app-table-cell app-delegation-row__granted-cell' })

    const actionCell = canDelegate
      ? buildRemoveDelegationCell(d)
      : new Container([], { class: 'app-table-cell' })

    const rowClass = rowIndex % 2 === 0
      ? 'app-table-row app-delegation-table__row'
      : 'app-table-row app-delegation-table__row app-table-row--alt'

    return new Container([avatarCell, accessTypeCell, grantedCell, actionCell], { class: rowClass })
  }

  function buildRemoveDelegationCell(d) {
    const nameForDialog = d.UserDisplayName || d.UserEmail || 'this person'

    const doRemoveBtn = new Button('Remove', {
      variant: 'danger',
      class: 'app-btn-danger-solid',
      onClickHandler: async () => {
        doRemoveBtn.isLoading = true
        const loading = Toast.loading('Removing access...')
        try {
          await siteApi.list(LIST_PROJECT_ACCESS).deleteItem(d.Id, d['odata.etag'])
          currentDelegations = currentDelegations.filter(item => item.Id !== d.Id)
          confirmDialog.close()
          renderDelegationTable()
          loading.success(`Access removed for ${nameForDialog}`)
        } catch (err) {
          console.error('[AccessTab] remove delegation:', err)
          loading.error('Failed to remove delegation')
        } finally {
          if (doRemoveBtn.isAlive) doRemoveBtn.isLoading = false
        }
      }
    })

    const cancelRemoveBtn = new Button('Cancel', {
      variant: 'secondary',
      class: 'app-btn-secondary',
      onClickHandler: () => confirmDialog.close()
    })

    const confirmDialog = new Dialog({
      closeOnFocusLoss: false,
      class: 'app-modal-shell app-modal-shell--danger',
      title: `Remove access for ${nameForDialog}?`,
      content: [
        new Text(
          `This will permanently remove ${nameForDialog}'s delegated access to this project. This action cannot be undone.`,
          { type: 'p' }
        ),
        new Container([cancelRemoveBtn, doRemoveBtn], { class: 'app-modal-actions' })
      ]
    })
    confirmDialog.render()

    const triggerBtn = new Button('Remove', {
      variant: 'secondary',
      class: 'app-btn-danger-outline app-btn-danger-outline--row',
      onClickHandler: () => confirmDialog.open()
    })

    return new Container([triggerBtn], { class: 'app-table-cell app-delegation-row__action' })
  }

  function renderDelegationTable() {
    delegationCountText.children = [
      `${currentDelegations.length} ${currentDelegations.length === 1 ? 'person' : 'people'}`
    ]

    if (currentDelegations.length === 0) {
      delegationTableBody.children = [
        new Text('No delegations recorded.', { type: 'p', class: 'app-delegation-table__empty' })
      ]
      return
    }

    const headerRow = new Container([
      new Container([new Text('Person', { type: 'span', class: 'app-table-col-header' })], { class: 'app-table-cell' }),
      new Container([new Text('Access type', { type: 'span', class: 'app-table-col-header' })], { class: 'app-table-cell app-delegation-col--access' }),
      new Container([new Text('Granted', { type: 'span', class: 'app-table-col-header' })], { class: 'app-table-cell app-delegation-col--date' }),
      new Container([new Text('', { type: 'span' })], { class: 'app-table-cell app-delegation-col--action' })
    ], { class: 'app-table-header' })

    delegationTableBody.children = [
      headerRow,
      ...currentDelegations.map((d, i) => buildDelegationRow(d, i))
    ]
  }

  renderDelegationTable()

  const delegationsCard = new Container([
    new Container([
      new Text('Delegations', { type: 'h3', class: 'app-form-section__heading' }),
      delegationCountText
    ], { class: 'app-form-section__heading-row app-form-section__heading-row--spaced' }),
    delegationTableBody
  ], { class: 'app-form-section' })

  // -------------------------------------------------------------------
  // Card 3: Grant Access form
  // -------------------------------------------------------------------

  function buildGrantAccessCard() {
    if (!canDelegate) return null

    const personField = new FormField({ value: '' })
    const personPicker = new PeoplePicker(personField, { placeholder: 'Search for a person' })

    const accessTypeField = new FormField({ value: '' })
    const accessTypeCombo = new ComboBox(accessTypeField, ACCESS_TYPES, {
      allowFiltering: false,
      placeholder: 'Select access type'
    })

    const grantBtn = new Button('Grant access', {
      variant: 'primary',
      class: 'app-btn-primary',
      onClickHandler: async () => {
        const personOption = personField.value
        const identity = personOption?.value
        if (!identity?.email) {
          Toast.error('Please select a person')
          return
        }

        const accessType = comboValue(accessTypeField.value)
        if (!accessType) {
          Toast.error('Please select an access type')
          return
        }

        grantBtn.isLoading = true
        const loading = Toast.loading('Granting access...')
        try {
          const data = {
            Title: `${uuid}_${identity.email}`,
            ProjectUUID: uuid,
            UserEmail: identity.email,
            UserDisplayName: identity.displayName,
            AccessType: accessType,
            GrantedBy: JSON.stringify({ email: currentUserEmail, displayName: currentUserName }),
            GrantedByEmail: currentUserEmail,
          }
          await siteApi.list(LIST_PROJECT_ACCESS).createItem(data)
          currentDelegations = await siteApi.list(LIST_PROJECT_ACCESS).getItems({ ProjectUUID: uuid })
          renderDelegationTable()
          loading.success('Access granted')
          personPicker.clearSelection()
          accessTypeField.value = ''
        } catch (err) {
          console.error('[AccessTab] grant access:', err)
          loading.error('Failed to grant access')
        } finally {
          if (grantBtn.isAlive) grantBtn.isLoading = false
        }
      }
    })

    return new Container([
      new Container([
        new Text('Grant Access', { type: 'h3', class: 'app-form-section__heading' })
      ], { class: 'app-form-section__heading-row' }),
      new Container([
        new Container([
          createLabeledField('Person', personPicker)
        ], { class: 'app-grant-access__person' }),
        new Container([
          createLabeledField('Access type', accessTypeCombo)
        ], { class: 'app-grant-access__type' }),
        grantBtn
      ], { class: 'app-grant-access__row' })
    ], { class: 'app-form-section' })
  }

  // -------------------------------------------------------------------
  // Assemble
  // -------------------------------------------------------------------

  const sections = [
    buildAccessLevelCard(),
    delegationsCard,
    buildGrantAccessCard()
  ].filter(Boolean)

  return new View(sections)
}
