import { Button, Dialog, Container, Text, Toast, Router } from '../libs/nofbiz/nofbiz.base.js'

// Split a semicolon-separated UUID list into trimmed, non-empty ids.
export const splitUuids = (v) => (v || '').split(';').map(s => s.trim()).filter(Boolean)

/**
 * Build a reusable "delete with confirmation" action.
 * Returns { triggerButton, dialog }. Caller places triggerButton in the UI
 * and MUST include dialog in the route's returned component array.
 *
 * onConfirm: async () => {}  -- performs cleanup + the actual deleteItem.
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
  const confirmBtn = new Button(confirmLabel, { variant: 'danger' })
  let dialog = null

  const content = [new Text(message, { type: 'p' })]
  if (warning) content.push(new Text(warning, { type: 'p' }))
  content.push(new Container([
    new Button('Cancel', { variant: 'secondary', onClickHandler: () => dialog.close() }),
    confirmBtn,
  ], { class: 'app-dialog-actions' }))

  dialog = new Dialog({
    title: dialogTitle,
    variant: 'warning',
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
      confirmBtn.isLoading = false
    }
  }

  const triggerButton = new Button(triggerLabel, {
    variant: 'danger',
    onClickHandler: () => dialog.open(),
  })

  return { triggerButton, dialog }
}
