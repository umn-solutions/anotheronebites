import {
  View, Container, Text, TextInput, TextArea, FormField, Button, Toast
} from '../../../libs/nofbiz/nofbiz.base.js'
import { LIST_PROJECTS } from '../../../utils/constants.js'
import { createLabeledField, createFormSection, validatedField } from '../../../utils/form-helpers.js'
import { canPerformAction } from '../../../utils/access-control.js'

// NPS scores can be negative and fractional (e.g. -12.5, 67.98, 8).
// Empty string is allowed (field is optional).
const NPS_REGEX = /^-?\d+(\.\d+)?$/

/**
 * Creates the Project Review tab for the project detail page.
 * The tab is registered in the TabGroup with disabled:true while the project
 * is open; it becomes enabled only after the project is closed (via navigation).
 *
 * Editable by roles with the 'edit' permission (owner, contributing).
 * Readers see the same content read-only with no save button.
 *
 * @param {{ project: object, siteApi: object, uuid: string, effectiveRole: string }} params
 * @returns {View}
 */
export function createReviewTab({ project, siteApi, uuid, effectiveRole }) {
  const canEdit = canPerformAction(effectiveRole, 'edit')

  // Parse stored values defensively. ListApi leaves numeric strings as strings,
  // but guard against a numeric JS value in case some other code path writes one.
  const initialNps = project.NpsScore != null ? String(project.NpsScore) : ''
  const initialComments = project.ReviewComments != null ? String(project.ReviewComments) : ''

  // -------------------------------------------------------------------
  // Read-only view (readers)
  // -------------------------------------------------------------------

  function readOnlyRow(label, value) {
    const isEmpty = !value
    return new Container([
      new Text(label, { type: 'span', class: 'app-overline app-review-field__label' }),
      new Text(isEmpty ? '—' : value, {
        type: 'p',
        class: isEmpty ? 'app-review-field__value app-review-field__value--empty' : 'app-review-field__value'
      })
    ], { class: 'app-review-field-ro' })
  }

  if (!canEdit) {
    return new View([
      createFormSection('Project Review', [
        readOnlyRow('NPS Score', initialNps),
        readOnlyRow('Comments', initialComments),
      ])
    ])
  }

  // -------------------------------------------------------------------
  // Editable view (owner, contributing)
  // -------------------------------------------------------------------

  const npsField = new FormField({ value: initialNps })
  const commentsField = new FormField({ value: initialComments })

  const npsVF = validatedField(
    'NPS Score',
    new TextInput(npsField, { placeholder: 'e.g. 67.98, 8, or -12.5' })
  )

  const saveBtn = new Button('Save review', {
    variant: 'primary',
    class: 'app-btn-primary',
    onClickHandler: async () => {
      const npsRaw = (npsField.value || '').trim()

      if (npsRaw && !NPS_REGEX.test(npsRaw)) {
        npsVF.setError('Enter a valid number (e.g. 67.98, 8, -12.5). No commas, letters, or % signs.')
        return
      }
      npsVF.setError(null)

      saveBtn.isLoading = true
      const loading = Toast.loading('Saving review...')
      try {
        await siteApi.list(LIST_PROJECTS).updateItem(
          project.Id,
          { NpsScore: npsRaw, ReviewComments: commentsField.value || '' },
          project['odata.etag']
        )
        // Refresh etag so subsequent saves from this tab do not produce a 412
        const freshItems = await siteApi.list(LIST_PROJECTS).getItemByUUID(uuid)
        if (freshItems && freshItems[0] && freshItems[0]['odata.etag']) {
          project['odata.etag'] = freshItems[0]['odata.etag']
        }
        loading.success('Review saved')
      } catch (err) {
        if (err && err.name === 'ConcurrencyConflict') {
          console.error('[ReviewTab] concurrency conflict saving review', err)
          loading.error('Another user updated this project. Reload the page to save your changes.')
        } else {
          console.error('[ReviewTab] failed to save review', err)
          loading.error('Failed to save review')
        }
      } finally {
        if (saveBtn.isAlive) saveBtn.isLoading = false
      }
    }
  })

  return new View([
    createFormSection('Project Review', [
      npsVF.node,
      createLabeledField('Comments', new TextArea(commentsField, {
        placeholder: 'Summarise outcomes, lessons learned, and team performance...',
        rows: 5
      })),
      new Container([saveBtn], { class: 'app-review-actions' })
    ])
  ])
}
