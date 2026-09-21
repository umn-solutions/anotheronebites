import { spGET, spMERGE, spPOST } from '../app/libs/nofbiz/nofbiz.base.js'
import { log } from './log.js'

export async function setQuickEdit(listName, enabled) {
  const url = `${_spPageContextInfo.webAbsoluteUrl}/_api/web/lists/getbytitle('${listName}')/DefaultView`;
  try {
    await spMERGE(url, {
      headers: { 'IF-MATCH': '*' },
      data: { TabularView: enabled },
    });
    log(`  [view] Quick edit ${enabled ? 'enabled' : 'disabled'} on ${listName}`);
  } catch (e) {
    log(`  [view] ! Failed to ${enabled ? 'enable' : 'disable'} quick edit -- ` + (e.message || 'failed'), 'error');
  }
}

export async function setFormsRedirect(listName, redirect, appUrl) {
  const url = `${_spPageContextInfo.webAbsoluteUrl}/_api/web/lists/getbytitle('${listName}')`;
  const target = redirect ? appUrl : '';
  try {
    await spMERGE(url, {
      headers: { 'IF-MATCH': '*' },
      data: { __metadata: { type: 'SP.List' }, DefaultNewFormUrl: target, DefaultEditFormUrl: target },
    });
    log(`  [forms] ${redirect ? 'Redirected New/Edit forms to app' : 'Restored default New/Edit forms'} on ${listName}`);
  } catch (e) {
    log(`  [forms] ! Failed to ${redirect ? 'redirect' : 'restore'} forms -- ` + (e.message || 'failed'), 'error');
  }
}

export async function ensureAdminView(listName) {
  const base = `${_spPageContextInfo.webAbsoluteUrl}/_api/web/lists/getbytitle('${listName}')`;
  try {
    await spGET(`${base}/views/getbytitle('Admin')`);
  } catch (e) {
    if (e.status && e.status !== 404) throw e;
    await spPOST(`${base}/views`, { data: { Title: 'Admin', PersonalView: true, TabularView: true } });
    log('  [view] Created Admin view');
  }
}

export async function addFieldToAdminView(listName, fieldName) {
  const url = `${_spPageContextInfo.webAbsoluteUrl}/_api/web/lists/getbytitle('${listName}')/views/getbytitle('Admin')/ViewFields/addviewfield('${fieldName}')`;
  try {
    await spPOST(url);
    log('  [view] + ' + fieldName);
  } catch (e) {
    log('  [view] ! ' + fieldName + ' -- ' + (e.message || 'failed'), 'error');
  }
}
