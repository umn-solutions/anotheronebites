import { SiteApi } from '../app/libs/nofbiz/nofbiz.base.js'
import { SCHEMA, BUILTIN_FIELDS, APP_URL } from './schema.js'
import { initLog, log } from './log.js'
import { scanSite } from './scan.js'
import { renderCards, setBusy, setButtonBusy } from './render.js'
import {
  createList, deleteList, setListHidden,
  createField, deleteField, fixIndex,
  syncList, fullSetup, syncAll,
} from './actions.js'
import { generateData } from './generate.js'

// -- State -------------------------------------------------------------------
const siteApi = new SiteApi();
let scanResult = null;
let busy = false;

// -- DOM refs ----------------------------------------------------------------
const cardsEl = document.getElementById('list-cards');
const logEl = document.getElementById('log');
const scanTimeEl = document.getElementById('scan-time');
const btnScan = document.getElementById('btn-scan');
const btnFullSetup = document.getElementById('btn-full-setup');
const btnSyncAll = document.getElementById('btn-sync-all');
const btnGenData = document.getElementById('btn-gen-data');
const genCountSelect = document.getElementById('gen-count');

initLog(logEl);

// -- Scan orchestration ------------------------------------------------------
async function doScan() {
  if (busy) return;
  busy = true;
  setBusy(true, btnScan);
  logEl.textContent = '';

  const result = await scanSite(siteApi, SCHEMA, BUILTIN_FIELDS);

  if (!result) {
    busy = false;
    setBusy(false, btnScan);
    return;
  }

  scanResult = result.scanResult;
  scanTimeEl.textContent = 'Last scan: ' + new Date().toLocaleTimeString();
  renderCards(scanResult, cardsEl);

  btnFullSetup.disabled = !(result.hasMissingLists || result.hasMissingFields || result.hasIndexIssues);
  btnSyncAll.disabled = !(result.hasMissingFields || result.hasIndexIssues);

  const projectsExists = result.scanResult.Projects?.exists ?? false;
  btnGenData.disabled = !projectsExists;
  genCountSelect.disabled = !projectsExists;

  busy = false;
  setBusy(false, btnScan);
}

// -- Full setup orchestration ------------------------------------------------
async function doFullSetup() {
  if (busy) return;
  busy = true;
  setBusy(true, btnScan);

  await fullSetup(siteApi, scanResult, SCHEMA, APP_URL);

  busy = false;
  await doScan();
}

// -- Sync all orchestration --------------------------------------------------
async function doSyncAll() {
  if (busy) return;
  busy = true;
  setBusy(true, btnScan);

  await syncAll(siteApi, scanResult, SCHEMA);

  busy = false;
  await doScan();
}

// -- Generate data orchestration ---------------------------------------------
async function doGenerateData() {
  if (busy) return;
  busy = true;
  setBusy(true, btnScan);
  await generateData(siteApi, parseInt(genCountSelect.value, 10));
  busy = false;
  setBusy(false, btnScan);
}

// -- Event delegation --------------------------------------------------------
cardsEl.addEventListener('click', async (e) => {
  const header = e.target.closest('.card-header');
  if (header && !e.target.closest('button')) {
    header.closest('.list-card').classList.toggle('open');
    return;
  }

  const btn = e.target.closest('button[data-action]');
  if (!btn || busy) return;

  const action = btn.dataset.action;
  const listName = btn.dataset.list;
  const fieldName = btn.dataset.field;

  if (action === 'delete-list') {
    if (!window.confirm('Delete list "' + listName + '" and all its data?')) return;
  }
  if (action === 'delete-field') {
    if (!window.confirm('Delete field "' + fieldName + '" from "' + listName + '"?')) return;
  }

  busy = true;
  setButtonBusy(btn, '...');

  if (action === 'create-list') await createList(siteApi, listName, SCHEMA, APP_URL);
  else if (action === 'delete-list') await deleteList(siteApi, listName);
  else if (action === 'create-field') await createField(siteApi, listName, fieldName, SCHEMA);
  else if (action === 'delete-field') await deleteField(siteApi, listName, fieldName);
  else if (action === 'fix-index') await fixIndex(siteApi, listName, fieldName, SCHEMA);
  else if (action === 'sync-list') await syncList(siteApi, listName, scanResult, SCHEMA);
  else if (action === 'toggle-hidden') await setListHidden(listName, !scanResult[listName]?.hidden);

  busy = false;
  await doScan();
});

// -- Global buttons ----------------------------------------------------------
btnScan.addEventListener('click', doScan);
btnFullSetup.addEventListener('click', doFullSetup);
btnSyncAll.addEventListener('click', doSyncAll);
btnGenData.addEventListener('click', doGenerateData);

// -- Log toggle --------------------------------------------------------------
document.getElementById('log-toggle').addEventListener('click', () => {
  document.getElementById('log-panel').classList.toggle('open');
});
