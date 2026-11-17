'use strict';

var SCHEMA_ = {
  Settings: ['workspace_id','key','value_json','version'],
  Users: ['id','email','name','roles_json','scope','active'],
  Clients: ['workspace_id','id','name','attention','email','phone','address','owner_id','created_at','created_by','updated_at','updated_by','version','archived_at'],
  Items: ['workspace_id','id','code','description','unit','unit_price_minor','currency','active','created_at','updated_at','version'],
  Terms: ['workspace_id','id','name','text','document_types_json','active','created_at','updated_at','version'],
  Projects: ['workspace_id','id','code','name','client_id','owner_id','due_date','status','created_at','updated_at','version'],
  Documents: ['workspace_id','id','type','document_no','source_document_id','revision_of_id','revision_no','version','status','payment_status','client_id','project_id','owner_id','date','due_date','currency','subtotal_minor','discount_minor','tax_rate_scaled','tax_minor','total_minor','paid_minor','balance_minor','company_snapshot_json','client_snapshot_json','bank_snapshot_json','notes','terms','issued_at','created_at','created_by','updated_at','updated_by','archived_at'],
  DocumentLines: ['workspace_id','id','document_id','position','description','quantity_scaled','quantity_scale','unit','unit_price_minor','line_total_minor','version'],
  DocumentVersions: ['workspace_id','id','document_id','version','request_id','drive_file_id','sha256','created_at','created_by','status'],
  DocumentLinks: ['workspace_id','id','from_id','to_id','relation','created_at','created_by'],
  Payments: ['workspace_id','id','invoice_id','currency','amount_minor','paid_date','method','reference','status','reversal_of_id','created_by','created_at'],
  PaymentAllocations: ['workspace_id','id','payment_id','invoice_id','amount_minor','created_at'],
  Approvals: ['workspace_id','id','document_id','document_version','submitted_by','reviewed_by','decision','reason','reviewed_at'],
  Counters: ['workspace_id','type','year','last_number'],
  AuditLogs: ['workspace_id','id','request_id','actor','action','entity_type','entity_id','before_version','after_version','changed_fields_json','result','created_at'],
  Requests: ['workspace_id','request_id','actor','action','payload_hash','result_json','status','created_at'],
  Jobs: ['workspace_id','id','type','entity_id','entity_version','request_id','status','attempts','next_attempt_at','last_error_code','lease_until'],
  Files: ['workspace_id','id','document_id','drive_file_id','mime','size_bytes','sha256','status','uploaded_by','created_at'],
  SystemLogs: ['workspace_id','request_id','level','code','message_redacted','created_at'],
  Migrations: ['workspace_id','migration_id','source_device','source_hash','counts_json','totals_json','status','created_at'],
  BackupRuns: ['workspace_id','id','folder_id','manifest_file_id','status','started_at','completed_at','verified_at']
};

function sheetMap_() {
  var ss = SpreadsheetApp.openById(requireConfig_().SPREADSHEET_ID);
  var map = {};
  Object.keys(SCHEMA_).forEach(function(name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) throw apiError_('MAINTENANCE', 'Workspace schema is not initialized.', false);
    map[name] = sheet;
  });
  return map;
}

function rowObject_(headers, row) {
  var out = {};
  headers.forEach(function(key, index) { out[key] = row[index]; });
  return out;
}

function rows_(name) {
  return sheetRecords_(name).map(function(record) { return record.data; });
}

function sheetRecords_(name) {
  var sheet = sheetMap_()[name];
  var values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  var headers = values.shift().map(String);
  return values.map(function(row, index) { return { rowNumber: index + 2, data: rowObject_(headers, row) }; }).filter(function(record) { return Object.keys(record.data).some(function(key) { return record.data[key] !== '' && record.data[key] != null; }); });
}

function appendRequest_(requests, sheet, values) {
  requests.push({ appendCells: { sheetId: sheet.getSheetId(), rows: [{ values: values.map(function(value) { return { userEnteredValue: cellValue_(value) }; }) }], fields: 'userEnteredValue' } });
}

function cellValue_(value) {
  if (typeof value === 'number' && isFinite(value)) return { numberValue: value };
  if (typeof value === 'boolean') return { boolValue: value };
  return { stringValue: String(value == null ? '' : value) };
}

function atomicAppend_(rowsByName) {
  var map = sheetMap_(), requests = [];
  Object.keys(rowsByName).forEach(function(name) {
    (rowsByName[name] || []).forEach(function(values) { appendRequest_(requests, map[name], values); });
  });
  if (requests.length) Sheets.Spreadsheets.batchUpdate({ requests: requests }, requireConfig_().SPREADSHEET_ID);
}

function atomicWrite_(writesByName) {
  var map = sheetMap_(), requests = [];
  Object.keys(writesByName).forEach(function(name) {
    var entry = writesByName[name] || {};
    (entry.updates || []).forEach(function(update) {
      requests.push({ updateCells: { start: { sheetId: map[name].getSheetId(), rowIndex: update.rowNumber - 1, columnIndex: 0 }, rows: [{ values: update.values.map(function(value) { return { userEnteredValue: cellValue_(value) }; }) }], fields: 'userEnteredValue' } });
    });
    (entry.appends || []).forEach(function(values) { appendRequest_(requests, map[name], values); });
  });
  if (requests.length) Sheets.Spreadsheets.batchUpdate({ requests: requests }, requireConfig_().SPREADSHEET_ID);
}

function requestResult_(workspaceId, requestId, actorId, action, payload) {
  var existing = rows_('Requests').filter(function(row) { return row.workspace_id === workspaceId && row.request_id === requestId; })[0];
  if (!existing) return null;
  var hash = digest_(JSON.stringify(payload || {}));
  if (existing.actor !== actorId || existing.action !== action || existing.payload_hash !== hash) throw apiError_('IDEMPOTENCY_CONFLICT', 'This request ID was already used for a different operation.', false);
  return JSON.parse(existing.result_json);
}

function auditRow_(config, requestId, actor, action, entityType, entityId, beforeVersion, afterVersion, fields) {
  return [config.WORKSPACE_ID, Utilities.getUuid(), requestId, actor.id, action, entityType, entityId, beforeVersion || 0, afterVersion || 0, JSON.stringify(fields || []), 'ok', new Date().toISOString()];
}

function requestRow_(config, requestId, actor, action, payload, result) {
  return [config.WORKSPACE_ID, requestId, actor.id, action, digest_(JSON.stringify(payload || {})), JSON.stringify(result), 'completed', new Date().toISOString()];
}

function canReadRecord_(actor, record) {
  return actor.scope === 'all' || hasRole_(actor, 'Admin') || record.owner_id === actor.id;
}

function recordById_(name, id) {
  var config = getConfig_();
  return sheetRecords_(name).filter(function(item) { return item.data.workspace_id === config.WORKSPACE_ID && item.data.id === id && !item.data.archived_at; })[0] || null;
}
