import { diffSummary } from './scan.js'

export function renderCards(scanResult, cardsEl) {
  if (!scanResult) return;

  let html = '';
  for (const [listName, result] of Object.entries(scanResult)) {
    const summary = result.exists
      ? diffSummary(result.diff)
      : 'List does not exist';
    const hiddenTag = result.hidden ? ' <span class="badge badge-hidden">HIDDEN</span>' : '';
    const listTag = result.exists
      ? hiddenTag
      : ' <span class="badge badge-list-missing">NOT FOUND</span>';

    html += `<div class="list-card open" data-list="${listName}">
      <div class="card-header">
        <span class="toggle">&#9654;</span>
        <span class="list-name">${listName}${listTag}</span>
        <span class="summary">${summary}</span>
        <span class="card-actions">`;

    if (!result.exists) {
      html += `<button class="btn btn-primary btn-sm" data-action="create-list" data-list="${listName}">Create List</button>`;
    } else {
      if (result.diff.some(d => d.status === 'MISSING' || d.status === 'INDEX')) {
        html += `<button class="btn btn-primary btn-sm" data-action="sync-list" data-list="${listName}">Sync Fields</button>`;
      }
      const hideLabel = result.hidden ? 'Show' : 'Hide';
      html += `<button class="btn btn-secondary btn-sm" data-action="toggle-hidden" data-list="${listName}">${hideLabel}</button>`;
      html += `<button class="btn btn-danger btn-sm" data-action="delete-list" data-list="${listName}">Delete List</button>`;
    }

    html += `</span></div><div class="card-body">`;

    if (result.diff.length > 0) {
      html += `<table class="field-table">
        <thead><tr>
          <th>Field</th><th>Type</th><th>Indexed</th><th>Status</th><th></th>
        </tr></thead><tbody>`;

      for (const d of result.diff) {
        const typeName = d.schema
          ? (d.schema.multiline ? 'Note' : 'Text')
          : (d.live ? d.live.TypeAsString : '');
        const indexed = d.schema
          ? (d.schema.indexed ? 'Yes' : 'No')
          : (d.live ? (d.live.Indexed ? 'Yes' : 'No') : '');
        const badgeClass = {
          OK: 'badge-ok', MISSING: 'badge-missing',
          EXTRA: 'badge-extra', INDEX: 'badge-index',
        }[d.status];
        const badgeLabel = d.status === 'INDEX' ? 'INDEX MISMATCH' : d.status;

        let actions = '';
        if (d.status === 'MISSING') {
          actions = `<button class="btn btn-primary btn-sm" data-action="create-field" data-list="${listName}" data-field="${d.field}">Create</button>`;
        } else if (d.status === 'EXTRA') {
          actions = `<button class="btn btn-danger btn-sm" data-action="delete-field" data-list="${listName}" data-field="${d.field}">Delete</button>`;
        } else if (d.status === 'INDEX') {
          actions = `<button class="btn btn-secondary btn-sm" data-action="fix-index" data-list="${listName}" data-field="${d.field}">Fix Index</button>`;
        }

        html += `<tr>
          <td class="field-name">${d.field}</td>
          <td class="field-type">${typeName}</td>
          <td>${indexed}</td>
          <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
          <td class="field-actions">${actions}</td>
        </tr>`;
      }

      html += '</tbody></table>';
    }

    html += '</div></div>';
  }

  cardsEl.innerHTML = html;
}

export function setBusy(state, btnScan) {
  btnScan.disabled = state;
  btnScan.textContent = state ? 'Scanning...' : 'Scan Site';
}

export function setButtonBusy(btn, label) {
  btn.disabled = true;
  btn.dataset.origLabel = btn.textContent;
  btn.textContent = label;
}
