import { log } from './log.js'
import { createList, createField, fixIndex, setListHidden } from './actions.js'
import { setQuickEdit, setFormsRedirect } from './views.js'
import { scanSite } from './scan.js'

// -- File reading & validation -----------------------------------------------

export function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      let obj;
      try {
        obj = JSON.parse(e.target.result);
      } catch (err) {
        console.error('[restore.readBackupFile] JSON.parse failed', { fileName: file.name, err });
        reject(new Error('File is not valid JSON: ' + err.message));
        return;
      }
      if (obj.sparcBackup !== '1.0') {
        const msg = 'File missing valid sparcBackup version. Got: ' + obj.sparcBackup;
        console.error('[restore.readBackupFile] version check failed', { got: obj.sparcBackup });
        reject(new Error(msg));
        return;
      }
      if (!obj.lists || typeof obj.lists !== 'object') {
        const msg = 'Backup file missing "lists" object';
        console.error('[restore.readBackupFile] missing lists', obj);
        reject(new Error(msg));
        return;
      }
      resolve(obj);
    };
    reader.onerror = (e) => {
      console.error('[restore.readBackupFile] FileReader error', e);
      reject(new Error('Failed to read file'));
    };
    reader.readAsText(file);
  });
}

// -- Structure restore -------------------------------------------------------

export async function restoreStructure(siteApi, backup, scanResult, appUrl) {
  log('--- Restore: Structure ---', 'info');

  for (const [listName, listBackup] of Object.entries(backup.lists)) {
    const liveResult = scanResult[listName];

    // Build a schema-shaped object from backup fields
    const backupSchema = { [listName]: listBackup.fields };

    if (!liveResult || !liveResult.exists) {
      log(`[restore] ${listName}: creating list from backup...`, 'info');
      await createList(siteApi, listName, backupSchema, appUrl);
    } else {
      log(`[restore] ${listName}: list exists -- syncing fields...`, 'info');

      // Build a map of live field InternalNames
      const liveFieldNames = new Set((liveResult.fields || []).map(f => f.InternalName));

      for (const field of listBackup.fields) {
        if (field.builtIn) {
          // Only fix indexing for built-ins
          const liveField = (liveResult.fields || []).find(f => f.InternalName === field.title);
          if (liveField && !!liveField.Indexed !== !!field.indexed) {
            await fixIndex(siteApi, listName, field.title, backupSchema);
          }
          continue;
        }

        const type = (backup.lists[listName].fieldTypes || {})[field.title] || 'Text';
        const isTextOrNote = type === 'Text' || type === 'Note' || type === 'MultilineText';

        if (!isTextOrNote) {
          console.warn('[restore.restoreStructure] skipping non-Text/Note field', { listName, field: field.title, type });
          log(`[restore] ${listName}.${field.title}: skipped (type ${type} cannot be recreated)`, 'info');
          continue;
        }

        if (!liveFieldNames.has(field.title)) {
          await createField(siteApi, listName, field.title, backupSchema);
        } else {
          // Field exists -- check indexing
          const liveField = (liveResult.fields || []).find(f => f.InternalName === field.title);
          if (liveField && !!liveField.Indexed !== !!field.indexed) {
            await fixIndex(siteApi, listName, field.title, backupSchema);
          }
        }
      }
    }
  }

  log('Structure restore complete.', 'success');
}

// -- Config restore ----------------------------------------------------------

export async function restoreConfig(siteApi, backup, appUrl) {
  log('--- Restore: Config ---', 'info');
  const resolvedAppUrl = appUrl || backup.site?.appUrl || '';

  for (const [listName, listBackup] of Object.entries(backup.lists)) {
    const cfg = listBackup.config;
    if (!cfg) {
      log(`[restore] ${listName}: no config in backup -- skipping`, 'info');
      continue;
    }
    log(`[restore] ${listName}: applying config...`, 'info');
    await setListHidden(listName, cfg.hidden);
    await setQuickEdit(listName, !cfg.quickEditDisabled);
    await setFormsRedirect(listName, cfg.formsRedirected, resolvedAppUrl);
  }

  log('Config restore complete.', 'success');
}

// -- System key filter -------------------------------------------------------

const SYSTEM_KEYS = new Set([
  'Id', 'odata.etag', 'Created', 'Modified', 'Author', 'Editor',
  'Attachments', 'ContentType', 'ContentTypeId', 'GUID',
  '__metadata',
]);

function stripSystemKeys(row) {
  const clean = {};
  for (const [k, v] of Object.entries(row)) {
    if (SYSTEM_KEYS.has(k)) continue;
    if (k.startsWith('OData__')) continue;
    clean[k] = v;
  }
  return clean;
}

// -- Data restore (upsert by UUID) -------------------------------------------

export async function restoreData(siteApi, backup, listName) {
  log(`--- Restore: Data (${listName}) ---`, 'info');
  const listBackup = backup.lists[listName];
  if (!listBackup) {
    log(`[restore] ${listName}: not found in backup`, 'error');
    return;
  }

  const items = listBackup.items || [];
  if (items.length === 0) {
    log(`[restore] ${listName}: no items in backup`, 'info');
    return;
  }

  const listApi = siteApi.list(listName);

  // Check whether this list has a UUID field in the backup
  const hasUUID = listBackup.fields.some(f => f.title === 'UUID');
  if (!hasUUID) {
    console.warn('[restore.restoreData] no UUID field -- falling back to insert-only', { listName });
    log(`[restore] ${listName}: no UUID field -- insert-only mode (upsert not possible)`, 'info');
    let created = 0;
    let failed = 0;
    for (const row of items) {
      const fields = stripSystemKeys(row);
      try {
        await listApi.createItem(fields);
        created++;
      } catch (e) {
        console.error('[restore.restoreData] createItem failed (no-UUID mode)', { listName, e });
        log(`[restore] ${listName}: insert failed -- ${e.message}`, 'error');
        failed++;
      }
    }
    log(`[restore] ${listName}: inserted ${created}, failed ${failed}`, created > 0 ? 'success' : 'error');
    return;
  }

  // Build UUID -> { Id, etag } map from live items
  log(`[restore] ${listName}: reading live UUIDs...`, 'info');
  let liveMap = new Map();
  try {
    const liveItems = await listApi.getItems(undefined, { viewFields: ['UUID'] });
    for (const item of liveItems) {
      const uuid = item.UUID;
      if (uuid) liveMap.set(uuid, { Id: item.Id, etag: item['odata.etag'] });
    }
    log(`[restore] ${listName}: ${liveMap.size} existing UUIDs found`, 'info');
  } catch (e) {
    console.error('[restore.restoreData] getItems (UUID scan) failed', { listName, e });
    log(`[restore] ${listName}: failed to read live UUIDs -- ${e.message}`, 'error');
    return;
  }

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (const row of items) {
    const fields = stripSystemKeys(row);
    const uuid = row.UUID;
    const live = uuid ? liveMap.get(uuid) : null;

    try {
      if (live) {
        await listApi.updateItem(live.Id, fields, live.etag);
        updated++;
      } else {
        await listApi.createItem(fields);
        created++;
      }
    } catch (e) {
      console.error('[restore.restoreData] write failed', { listName, uuid, live: !!live, e });
      log(`[restore] ${listName}: ${live ? 'update' : 'insert'} failed (UUID: ${uuid}) -- ${e.message}`, 'error');
      failed++;
    }
  }

  const summary = `created ${created}, updated ${updated}, failed ${failed}`;
  const level = failed === 0 ? 'success' : 'error';
  log(`[restore] ${listName}: ${summary}`, level);
}

// -- Top-level orchestrators -------------------------------------------------

export async function restoreList(siteApi, backup, listName, scanResult, appUrl) {
  log(`=== Restore List: ${listName} ===`, 'info');

  if (!backup.lists[listName]) {
    log(`[restore] ${listName} not found in backup file`, 'error');
    return;
  }

  const singleListBackup = {
    ...backup,
    lists: { [listName]: backup.lists[listName] },
  };

  await restoreStructure(siteApi, singleListBackup, scanResult, appUrl);

  // Re-scan the single list so config + data use fresh state
  // We pass the current scanResult and refresh after structure work
  await restoreConfig(siteApi, singleListBackup, appUrl);
  await restoreData(siteApi, singleListBackup, listName);

  log(`=== Restore List Complete: ${listName} ===`, 'success');
}

export async function restoreSite(siteApi, backup, scanResult, appUrl) {
  log('=== Site Restore ===', 'info');

  await restoreStructure(siteApi, backup, scanResult, appUrl);
  await restoreConfig(siteApi, backup, appUrl);

  for (const listName of Object.keys(backup.lists)) {
    await restoreData(siteApi, backup, listName);
  }

  log('=== Site Restore Complete ===', 'success');
}
