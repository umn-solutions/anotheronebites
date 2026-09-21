import { Button, Dialog, Container, Text, Toast, Router } from '../libs/nofbiz/nofbiz.base.js'

// Split a semicolon-separated UUID list into trimmed, non-empty ids.
export const splitUuids = (v) => (v || '').split(';').map(s => s.trim()).filter(Boolean)

/**
 * Build a reusable "delete with confirmation" action.
 * Wired to the app-modal-shell--danger foundation class per the 3f modal system spec.
 *
 * Returns { triggerButton, dialog }. Caller places triggerButton in the UI
 * and MUST include dialog in the route's returned component array.
 *
 * The confirm button states its verb (confirmLabel) — never "OK" or "Confirm".
 * The modal names the record in the body text.
 *
 * @param {object} opts
 * @param {string}   opts.triggerLabel  - Label for the trigger button (shown in the UI)
 * @param {string}   opts.dialogTitle   - Modal title (typically "Delete <Record name>")
 * @param {string}   opts.message       - Body copy naming the record, e.g. 'Delete "Acme Project"?'
 * @param {string}  [opts.warning]      - Secondary body paragraph with consequence details
 * @param {string}  [opts.confirmLabel] - Text for the confirm button (must be a verb, e.g. "Delete project")
 * @param {function} opts.onConfirm     - Async function: performs cleanup + deleteItem
 * @param {string}  [opts.loadingText]  - Toast loading message
 * @param {string}  [opts.successText]  - Toast success message
 * @param {string}  [opts.errorText]    - Toast error message
 * @param {string}  [opts.navigateTo]   - Route to navigate to after success
 * @returns {{ triggerButton: Button, dialog: Dialog }}
 */
export function createDeleteAction({
  triggerLabel,
  dialogTitle,
  message,
  warning,
  confirmLabel = 'Delete',
  onConfirm,
  loadingText = 'Deleting...',
  successText = 'Deleted',
  errorText = 'Failed to delete',
  navigateTo = '/',
}) {
  const confirmBtn = new Button(confirmLabel, {
    variant: 'danger',
    class: 'app-btn-danger-solid'
  })

  let dialog = null

  const cancelBtn = new Button('Cancel', {
    variant: 'secondary',
    class: 'app-btn-secondary',
    onClickHandler: () => dialog.close()
  })

  const content = [
    new Text(message, { type: 'p' })
  ]

  if (warning) {
    content.push(new Text(warning, { type: 'p', class: 'app-modal-shell__warning' }))
  }

  content.push(
    new Container([cancelBtn, confirmBtn], { class: 'app-modal-actions' })
  )

  dialog = new Dialog({
    title: dialogTitle,
    class: 'app-modal-shell app-modal-shell--danger',
    content,
    onCloseHandler: () => {},
  })

  confirmBtn.onClickHandler = async () => {
    confirmBtn.isLoading = true
    const loading = Toast.loading(loadingText)
    try {
      await onConfirm()
      loading.success(successText)
      dialog.close()
      Router.navigateTo(navigateTo)
    } catch {
      loading.error(errorText)
    } finally {
      if (confirmBtn.isAlive) confirmBtn.isLoading = false
    }
  }

  const triggerButton = new Button(triggerLabel, {
    variant: 'secondary',
    class: 'app-btn-danger-outline',
    onClickHandler: () => dialog.open(),
  })

  return { triggerButton, dialog }
}
