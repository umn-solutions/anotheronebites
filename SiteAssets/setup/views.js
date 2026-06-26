import { spGET, spMERGE, spPOST } from '../app/libs/nofbiz/nofbiz.base.js'
import { log } from './log.js'

export async function lockDefaultView(listName) {
  const url = `${_spPageContextInfo.webAbsoluteUrl}/_api/web/lists/getbytitle('${listName}')/DefaultView`;
  try {
    await spMERGE(url, {
      headers: { 'IF-MATCH': '*' },
      data: { TabularView: false },
    });
    log('  [view] Disabled quick edit on AllItems');
  } catch (e) {
    log('  [view] ! Failed to disable quick edit -- ' + (e.message || 'failed'), 'error');
  }
}

export async function lockDefaultForms(listName, appUrl) {
  const url = `${_spPageContextInfo.webAbsoluteUrl}/_api/web/lists/getbytitle('${listName}')`;
  try {
    await spMERGE(url, {
      headers: { 'IF-MATCH': '*' },
      data: { __metadata: { type: 'SP.List' }, DefaultNewFormUrl: appUrl, DefaultEditFormUrl: appUrl },
    });
    log('  [forms] Redirected New/Edit forms to app');
  } catch (e) {
    log('  [forms] ! Failed to redirect forms -- ' + (e.message || 'failed'), 'error');
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
