import { log } from './log.js'

export function computeDiff(schemaFields, liveFields, builtinFields) {
  const liveMap = new Map();
  for (const f of liveFields) {
    liveMap.set(f.InternalName, f);
  }

  const diff = [];

  for (const sf of schemaFields) {
    const live = liveMap.get(sf.title);
    if (!live) {
      if (sf.builtIn) {
        diff.push({ field: sf.title, status: 'OK', schema: sf, live: null });
      } else {
        diff.push({ field: sf.title, status: 'MISSING', schema: sf, live: null });
      }
    } else {
      const expectedIndexed = sf.indexed || false;
      if (live.Indexed !== expectedIndexed) {
        diff.push({ field: sf.title, status: 'INDEX', schema: sf, live });
      } else {
        diff.push({ field: sf.title, status: 'OK', schema: sf, live });
      }
      liveMap.delete(sf.title);
    }
  }

  for (const [name, f] of liveMap) {
    if (!builtinFields.has(name)) {
      diff.push({ field: name, status: 'EXTRA', schema: null, live: f });
    }
  }

  return diff;
}

export function diffSummary(diff) {
  const counts = { OK: 0, MISSING: 0, EXTRA: 0, INDEX: 0 };
  for (const d of diff) counts[d.status]++;
  const parts = [];
  if (counts.OK) parts.push(counts.OK + ' OK');
  if (counts.MISSING) parts.push(counts.MISSING + ' missing');
  if (counts.EXTRA) parts.push(counts.EXTRA + ' extra');
  if (counts.INDEX) parts.push(counts.INDEX + ' index mismatch');
  return parts.join(' | ');
}

export async function scanSite(siteApi, schema, builtinFields) {
  log('Scanning site...', 'info');

  const result = {};
  let siteLists;

  try {
    siteLists = await siteApi.getLists();
  } catch (e) {
    log('Failed to fetch site lists: ' + e.message, 'error');
    return null;
  }

  const listTitles = new Set(siteLists.map(l => l.Title));

  for (const listName of Object.keys(schema)) {
    const exists = listTitles.has(listName);
    result[listName] = { exists, hidden: false, fields: [], diff: [] };

    if (exists) {
      const liveList = siteLists.find(l => l.Title === listName);
      result[listName].hidden = liveList?.Hidden ?? false;
      try {
        const listApi = siteApi.list(listName);
        const liveFields = await listApi.getFields();
        result[listName].fields = liveFields;
        result[listName].diff = computeDiff(schema[listName], liveFields, builtinFields);
        log(listName + ': ' + diffSummary(result[listName].diff));
      } catch (e) {
        log(listName + ': failed to read fields -- ' + e.message, 'error');
      }
    } else {
      result[listName].diff = schema[listName].map(sf => ({
        field: sf.title, status: sf.builtIn ? 'OK' : 'MISSING', schema: sf, live: null,
      }));
      log(listName + ': list does not exist', 'info');
    }
  }

  log('Scan complete.', 'success');

  const hasMissingLists = Object.values(result).some(r => !r.exists);
  const hasMissingFields = Object.values(result).some(r =>
    r.diff.some(d => d.status === 'MISSING')
  );
  const hasIndexIssues = Object.values(result).some(r =>
    r.diff.some(d => d.status === 'INDEX')
  );

  return { scanResult: result, hasMissingLists, hasMissingFields, hasIndexIssues };
}
