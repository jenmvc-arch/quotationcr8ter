'use strict';

function health_(actor) {
  if (!hasRole_(actor, 'Admin')) throw apiError_('FORBIDDEN', 'Administrator access is required.', false);
  var config = getConfig_();
  return { environment: config.APP_ENV, schemaVersion: config.SCHEMA_VERSION, actor: actor.id, tabs: Object.keys(SCHEMA_).length };
}

function settingsGet_(actor) {
  if (!hasRole_(actor, 'Admin')) throw apiError_('FORBIDDEN', 'Administrator access is required.', false);
  return rows_('Settings').filter(function(row) { return row.workspace_id === getConfig_().WORKSPACE_ID; });
}

function dashboardSummary_(actor) {
  var config = getConfig_(), documents = rows_('Documents').filter(function(row) { return row.workspace_id === config.WORKSPACE_ID && !row.archived_at && canReadRecord_(actor, row); });
  var payments = rows_('Payments').filter(function(row) { return row.workspace_id === config.WORKSPACE_ID && row.status === 'Active'; });
  var month = Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'yyyy-MM');
  var visibleIds = {};
  documents.forEach(function(row) { visibleIds[row.id] = true; });
  var pendingApproval = documents.filter(function(row) { return row.status === 'PendingApproval'; }).length;
  var overdue = documents.filter(function(row) { return row.type === 'invoice' && row.status === 'Issued' && Number(row.balance_minor) > 0 && String(row.due_date || '') && String(row.due_date) < Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'yyyy-MM-dd'); }).length;
  var monthPayments = payments.filter(function(row) { return visibleIds[row.invoice_id] && String(row.paid_date || '').slice(0, 7) === month; });
  var byCurrency = {};
  monthPayments.forEach(function(row) { byCurrency[row.currency] = (byCurrency[row.currency] || 0) + Number(row.amount_minor || 0); });
  var failedJobs = rows_('Jobs').filter(function(row) { return row.workspace_id === config.WORKSPACE_ID && ['failed','retry'].indexOf(String(row.status)) >= 0; }).length;
  return { pendingApproval: pendingApproval, overdueInvoices: overdue, monthPaymentsByCurrency: byCurrency, failedJobs: failedJobs, generatedAt: new Date().toISOString() };
}

function masterAllowed_(actor, write) {
  if (write) {
    if (!hasRole_(actor, 'Admin') && !hasRole_(actor, 'SalesOps')) throw apiError_('FORBIDDEN', 'SalesOps or Admin access is required.', false);
  } else if (!hasRole_(actor, 'Admin') && !hasRole_(actor, 'SalesOps') && !hasRole_(actor, 'Finance') && !hasRole_(actor, 'Viewer')) {
    throw apiError_('FORBIDDEN', 'Workspace access is required.', false);
  }
}

function masterList_(actor, name, options) {
  masterAllowed_(actor, false);
  var config = getConfig_(), pageSize = Math.max(1, Math.min(Number(options.pageSize) || 50, 100)), page = Math.max(1, Number(options.page) || 1), query = String(options.query || '').toLowerCase().slice(0, 100);
  var all = rows_(name).filter(function(row) { return row.workspace_id === config.WORKSPACE_ID && !row.archived_at && (!query || Object.keys(row).some(function(key) { return String(row[key] || '').toLowerCase().indexOf(query) >= 0; })); });
  all.sort(function(a, b) { return String(a.name || a.code || a.updated_at || '').localeCompare(String(b.name || b.code || b.updated_at || '')); });
  return { items: all.slice((page - 1) * pageSize, page * pageSize), page: page, pageSize: pageSize, total: all.length };
}

function masterSave_(actor, request, name, payload) {
  masterAllowed_(actor, true);
  var config = getConfig_(), requestId = String(request.requestId || ''), lock = LockService.getScriptLock();
  if (!requestId) throw apiError_('VALIDATION_ERROR', 'requestId is required.', false);
  if (!lock.tryLock(5000)) throw apiError_('BUSY_RETRYABLE', 'Workspace is busy. Retry the request.', true);
  try {
    var previous = requestResult_(config.WORKSPACE_ID, requestId, actor.id, request.action, payload); if (previous) return previous;
    var id = String(payload.id || Utilities.getUuid()), existing = sheetRecords_(name).filter(function(item) { return item.data.workspace_id === config.WORKSPACE_ID && item.data.id === id; })[0];
    if (existing && Number(request.expectedVersion) !== Number(existing.data.version)) throw apiError_('VERSION_CONFLICT', 'This record changed. Refresh and review the latest version.', true);
    if (existing && name === 'Clients' && !canReadRecord_(actor, existing.data)) throw apiError_('FORBIDDEN', 'You cannot update this client.', false);
    var now = new Date().toISOString(), version = existing ? Number(existing.data.version) + 1 : 1, row;
    if (name === 'Items') {
      var code = String(payload.code || '').trim(), description = String(payload.description || '').trim(), currency = String(payload.currency || 'MYR').toUpperCase(), price = Number(payload.unitPriceMinor);
      if (!code || code.length > 80 || !description || description.length > 2000 || ['MYR','SGD','USD','EUR','GBP','CNY'].indexOf(currency) < 0 || !Number.isSafeInteger(price) || price < 0) throw apiError_('VALIDATION_ERROR', 'Item code, description, currency and unit price are invalid.', false);
      row = { workspace_id: config.WORKSPACE_ID, id: id, code: code, description: description, unit: String(payload.unit || 'unit').slice(0, 40), unit_price_minor: price, currency: currency, active: payload.active !== false, created_at: existing ? existing.data.created_at : now, updated_at: now, version: version };
    } else if (name === 'Terms') {
      var termName = String(payload.name || '').trim(), text = String(payload.text || '').trim();
      if (!termName || termName.length > 200 || !text || text.length > 10000) throw apiError_('VALIDATION_ERROR', 'Term name and text are required.', false);
      row = { workspace_id: config.WORKSPACE_ID, id: id, name: termName, text: text, document_types_json: JSON.stringify(Array.isArray(payload.documentTypes) ? payload.documentTypes : ['quotation','proforma','invoice']), active: payload.active !== false, created_at: existing ? existing.data.created_at : now, updated_at: now, version: version };
    } else if (name === 'Projects') {
      var projectName = String(payload.name || '').trim(), clientId = String(payload.clientId || '').trim();
      if (!projectName || projectName.length > 200 || !clientId) throw apiError_('VALIDATION_ERROR', 'Project name and client are required.', false);
      row = { workspace_id: config.WORKSPACE_ID, id: id, code: String(payload.code || '').trim().slice(0, 80), name: projectName, client_id: clientId, owner_id: existing ? existing.data.owner_id : actor.id, due_date: payload.dueDate ? validDate_(payload.dueDate, 'Project due date') : '', status: String(payload.status || 'Open'), created_at: existing ? existing.data.created_at : now, updated_at: now, version: version };
    } else {
      var clientName = String(payload.name || '').trim();
      if (!clientName || clientName.length > 200) throw apiError_('VALIDATION_ERROR', 'Client name is required and must be under 200 characters.', false);
      row = { workspace_id: config.WORKSPACE_ID, id: id, name: clientName, attention: String(payload.attention || ''), email: String(payload.email || ''), phone: String(payload.phone || ''), address: String(payload.address || ''), owner_id: existing ? existing.data.owner_id : actor.id, created_at: existing ? existing.data.created_at : now, created_by: existing ? existing.data.created_by : actor.id, updated_at: now, updated_by: actor.id, version: version, archived_at: '' };
    }
    var result = { id: id, version: version };
    var writes = { AuditLogs: { appends: [auditRow_(config, requestId, actor, request.action, name.slice(0, -1), id, existing ? existing.data.version : 0, version, Object.keys(row))] }, Requests: { appends: [requestRow_(config, requestId, actor, request.action, payload, result)] } };
    if (existing) writes[name] = { updates: [{ rowNumber: existing.rowNumber, values: objectRow_(name, row) }] };
    else writes[name] = { appends: [objectRow_(name, row)] };
    atomicWrite_(writes);
    return result;
  } finally { lock.releaseLock(); }
}

function masterArchive_(actor, request, name, payload) {
  masterAllowed_(actor, true);
  var config = getConfig_(), record = recordById_(name, String(payload.id || ''));
  if (!record) throw apiError_('NOT_FOUND', 'Record was not found.', false);
  requireCurrentVersion_(record, request.expectedVersion);
  var now = new Date().toISOString(), updated = Object.assign({}, record.data, { archived_at: now, updated_at: now, updated_by: actor.id, version: Number(record.data.version) + 1 });
  var result = { id: updated.id, version: updated.version, archived: true };
  atomicWrite_({ [name]: { updates: [{ rowNumber: record.rowNumber, values: objectRow_(name, updated) }] }, AuditLogs: { appends: [auditRow_(config, request.requestId, actor, request.action, name.slice(0, -1), updated.id, record.data.version, updated.version, ['archived_at'])] }, Requests: { appends: [requestRow_(config, request.requestId, actor, request.action, payload, result)] } });
  return result;
}

function usersList_(actor) {
  if (!hasRole_(actor, 'Admin')) throw apiError_('FORBIDDEN', 'Administrator access is required.', false);
  return rows_('Users').map(function(row) { return { id: row.id, email: row.email, name: row.name, roles: safeJson_(row.roles_json, []), scope: row.scope, active: row.active === true }; });
}

function usersUpdate_(actor, request, payload) {
  if (!hasRole_(actor, 'Admin')) throw apiError_('FORBIDDEN', 'Administrator access is required.', false);
  var config = getConfig_(), users = sheetRecords_('Users'), record = users.filter(function(item) { return item.data.id === String(payload.id || ''); })[0];
  if (!record) throw apiError_('NOT_FOUND', 'User was not found.', false);
  var roles = Array.isArray(payload.roles) ? payload.roles.filter(function(role) { return ['Admin','SalesOps','Approver','Finance','Viewer'].indexOf(role) >= 0; }) : [];
  if (!roles.length || ['own','all'].indexOf(String(payload.scope || 'own')) < 0) throw apiError_('VALIDATION_ERROR', 'At least one valid role and scope are required.', false);
  if (record.data.active === true && payload.active === false && safeJson_(record.data.roles_json, []).indexOf('Admin') >= 0) {
    var activeAdmins = users.filter(function(item) { return item.data.active === true && safeJson_(item.data.roles_json, []).indexOf('Admin') >= 0 && item.data.id !== record.data.id; });
    if (!activeAdmins.length) throw apiError_('VALIDATION_ERROR', 'The last active Admin cannot be disabled.', false);
  }
  var updated = [record.data.id, String(payload.email || record.data.email).toLowerCase(), String(payload.name || record.data.name), JSON.stringify(roles), String(payload.scope || record.data.scope), payload.active !== false];
  var result = { id: record.data.id, active: updated[5], roles: roles, scope: updated[4] };
  atomicWrite_({ Users: { updates: [{ rowNumber: record.rowNumber, values: updated }] }, AuditLogs: { appends: [auditRow_(config, request.requestId, actor, request.action, 'User', record.data.id, 0, 0, ['roles_json','scope','active'])] }, Requests: { appends: [requestRow_(config, request.requestId, actor, request.action, payload, result)] } });
  return result;
}

function settingsUpdate_(actor, request, payload) {
  if (!hasRole_(actor, 'Admin')) throw apiError_('FORBIDDEN', 'Administrator access is required.', false);
  var config = getConfig_(), key = String(payload.key || ''), allowed = ['company_profile','bank_profile','tax_profile','document_defaults','retention_policy'];
  if (allowed.indexOf(key) < 0) throw apiError_('VALIDATION_ERROR', 'This setting cannot be changed through the API.', false);
  var value = payload.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw apiError_('VALIDATION_ERROR', 'Setting value must be an object.', false);
  var rows = sheetRecords_('Settings'), record = rows.filter(function(item) { return item.data.workspace_id === config.WORKSPACE_ID && item.data.key === key; })[0], version = record ? Number(record.data.version) + 1 : 1, result = { key: key, version: version };
  var values = [config.WORKSPACE_ID, key, JSON.stringify(value), version];
  var writes = { AuditLogs: { appends: [auditRow_(config, request.requestId, actor, request.action, 'Setting', key, record ? record.data.version : 0, version, ['value_json'])] }, Requests: { appends: [requestRow_(config, request.requestId, actor, request.action, payload, result)] } };
  if (record) writes.Settings = { updates: [{ rowNumber: record.rowNumber, values: values }] }; else writes.Settings = { appends: [values] };
  atomicWrite_(writes);
  return result;
}

function fileList_(actor, payload) {
  var config = getConfig_(), documentId = String(payload.documentId || ''), document = recordById_('Documents', documentId);
  if (!document || !canReadRecord_(actor, document.data)) throw apiError_('NOT_FOUND', 'Document was not found.', false);
  return rows_('Files').filter(function(row) { return row.workspace_id === config.WORKSPACE_ID && row.document_id === documentId && row.status === 'active'; });
}

function validateUpload_(payload) {
  var mime = String(payload.mime || '').toLowerCase(), allowed = ['image/png','image/jpeg','application/pdf'];
  if (allowed.indexOf(mime) < 0) throw apiError_('VALIDATION_ERROR', 'Only PNG, JPEG, and PDF files are allowed.', false);
  var bytes = Utilities.base64Decode(String(payload.base64 || ''));
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw apiError_('FILE_TOO_LARGE', 'File must be between 1 byte and 5 MB.', false);
  return { mime: mime, bytes: bytes, size: bytes.length, name: String(payload.name || 'attachment').replace(/[^A-Za-z0-9._ -]/g, '_').slice(0, 120) };
}

function fileUpload_(actor, request, payload) {
  if (!hasRole_(actor, 'SalesOps') && !hasRole_(actor, 'Finance') && !hasRole_(actor, 'Admin')) throw apiError_('FORBIDDEN', 'File upload access is required.', false);
  var config = requireConfig_(), document = recordById_('Documents', String(payload.documentId || ''));
  if (!document || !canReadRecord_(actor, document.data)) throw apiError_('NOT_FOUND', 'Document was not found.', false);
  var upload = validateUpload_(payload), lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw apiError_('BUSY_RETRYABLE', 'Workspace is busy. Retry the request.', true);
  try {
    var previous = requestResult_(config.WORKSPACE_ID, request.requestId, actor.id, request.action, payload); if (previous) return previous;
    var root = DriveApp.getFolderById(config.DRIVE_ROOT_ID), documentsFolder = ensureFolder_(root, 'documents'), documentFolder = ensureFolder_(documentsFolder, document.data.id), attachmentFolder = ensureFolder_(documentFolder, 'attachments');
    var blob = Utilities.newBlob(upload.bytes, upload.mime, upload.name), file = attachmentFolder.createFile(blob), now = new Date().toISOString(), id = Utilities.getUuid();
    var result = { id: id, documentId: document.data.id, driveFileId: file.getId(), mime: upload.mime, sizeBytes: upload.size, status: 'active' };
    atomicWrite_({ Files: { appends: [[config.WORKSPACE_ID, id, document.data.id, file.getId(), upload.mime, upload.size, digest_(Utilities.base64Encode(upload.bytes)), 'active', actor.id, now]] }, AuditLogs: { appends: [auditRow_(config, request.requestId, actor, request.action, 'File', id, 0, 1, ['document_id','mime','size_bytes'])] }, Requests: { appends: [requestRow_(config, request.requestId, actor, request.action, payload, result)] } });
    return result;
  } finally { lock.releaseLock(); }
}

function fileDownload_(actor, payload) {
  var config = requireConfig_(), fileRow = rows_('Files').filter(function(row) { return row.workspace_id === config.WORKSPACE_ID && row.id === String(payload.fileId || '') && row.status === 'active'; })[0];
  if (!fileRow) throw apiError_('NOT_FOUND', 'File was not found.', false);
  var document = recordById_('Documents', fileRow.document_id);
  if (!document || !canReadRecord_(actor, document.data)) throw apiError_('NOT_FOUND', 'File was not found.', false);
  if (Number(fileRow.size_bytes) > 2 * 1024 * 1024) throw apiError_('FILE_TOO_LARGE', 'This file requires the controlled large-file delivery path.', false);
  var file = DriveApp.getFileById(fileRow.drive_file_id), bytes = file.getBlob().getBytes();
  return { fileId: fileRow.id, mime: fileRow.mime, name: file.getName(), sizeBytes: bytes.length, base64: Utilities.base64Encode(bytes) };
}

function ensureFolder_(parent, name) {
  var folders = parent.getFoldersByName(name);
  return folders.hasNext() ? folders.next() : parent.createFolder(name);
}

function jobsStatus_(actor, payload) {
  if (!hasRole_(actor, 'Admin') && !hasRole_(actor, 'Finance')) throw apiError_('FORBIDDEN', 'Job access is required.', false);
  var config = getConfig_(), rows = rows_('Jobs').filter(function(row) { return row.workspace_id === config.WORKSPACE_ID && (!payload.status || row.status === payload.status); });
  return { items: rows.slice(0, 100), total: rows.length };
}

function jobsRetry_(actor, request, payload) {
  if (!hasRole_(actor, 'Admin')) throw apiError_('FORBIDDEN', 'Administrator access is required.', false);
  var config = getConfig_(), record = sheetRecords_('Jobs').filter(function(item) { return item.data.workspace_id === config.WORKSPACE_ID && item.data.id === String(payload.jobId || ''); })[0];
  if (!record) throw apiError_('NOT_FOUND', 'Job was not found.', false);
  var now = new Date().toISOString(), updated = Object.assign({}, record.data, { status: 'retry', attempts: Number(record.data.attempts || 0) + 1, next_attempt_at: now, last_error_code: '', lease_until: '' });
  var result = { id: updated.id, status: updated.status, attempts: updated.attempts };
  atomicWrite_({ Jobs: { updates: [{ rowNumber: record.rowNumber, values: objectRow_('Jobs', updated) }] }, AuditLogs: { appends: [auditRow_(config, request.requestId, actor, request.action, 'Job', updated.id, 0, 0, ['status','attempts'])] }, Requests: { appends: [requestRow_(config, request.requestId, actor, request.action, payload, result)] } });
  return result;
}

function backupRun_(actor, request) {
  if (!hasRole_(actor, 'Admin')) throw apiError_('FORBIDDEN', 'Administrator access is required.', false);
  var config = requireConfig_(), lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw apiError_('BUSY_RETRYABLE', 'Workspace is busy. Retry the request.', true);
  try {
    var previous = requestResult_(config.WORKSPACE_ID, request.requestId, actor.id, request.action, {}); if (previous) return previous;
    var started = new Date().toISOString(), backupId = Utilities.getUuid(), root = DriveApp.getFolderById(config.BACKUP_ROOT_ID), folder = ensureFolder_(root, Utilities.formatDate(new Date(), 'Asia/Kuala_Lumpur', 'yyyy-MM-dd'));
    var snapshot = { schemaVersion: config.SCHEMA_VERSION, workspaceId: config.WORKSPACE_ID, createdAt: started, sheets: {}, files: rows_('Files').filter(function(row) { return row.workspace_id === config.WORKSPACE_ID; }).map(function(row) { return { id: row.id, documentId: row.document_id, driveFileId: row.drive_file_id, sha256: row.sha256, status: row.status }; }) };
    Object.keys(SCHEMA_).forEach(function(name) { var values = sheetMap_()[name].getDataRange().getValues(); snapshot.sheets[name] = { rows: Math.max(0, values.length - 1), headers: values.length ? values[0] : SCHEMA_[name], sha256: digest_(JSON.stringify(values)) }; });
    var manifest = folder.createFile('manifest-' + backupId + '.json', JSON.stringify(snapshot), MimeType.PLAIN_TEXT), now = new Date().toISOString(), result = { id: backupId, folderId: folder.getId(), manifestFileId: manifest.getId(), status: 'completed' };
    atomicWrite_({ BackupRuns: { appends: [[config.WORKSPACE_ID, backupId, folder.getId(), manifest.getId(), 'completed', started, now, now]] }, AuditLogs: { appends: [auditRow_(config, request.requestId, actor, request.action, 'BackupRun', backupId, 0, 1, ['manifest_file_id','status'])] }, Requests: { appends: [requestRow_(config, request.requestId, actor, request.action, {}, result)] } });
    return result;
  } finally { lock.releaseLock(); }
}

function migrationPreview_(actor, payload) {
  if (!hasRole_(actor, 'Admin')) throw apiError_('FORBIDDEN', 'Administrator access is required.', false);
  var records = payload && payload.records && typeof payload.records === 'object' ? payload.records : {}, summary = {}, total = 0;
  ['clients','items','terms'].forEach(function(name) { var list = Array.isArray(records[name]) ? records[name] : []; summary[name] = { count: list.length }; total += list.length; });
  var raw = JSON.stringify(records), hash = digest_(raw);
  return { sourceDevice: String(payload.sourceDevice || ''), sourceHash: hash, totalRecords: total, counts: summary, ready: total > 0 && hash.length === 64 };
}

function migrationCommit_(actor, request, payload) {
  if (!hasRole_(actor, 'Admin')) throw apiError_('FORBIDDEN', 'Administrator access is required.', false);
  var config = requireConfig_();
  if (config.APP_ENV === 'prod') throw apiError_('MAINTENANCE', 'Migration commits are disabled in production until reviewed.', false);
  var preview = migrationPreview_(actor, payload), existing = rows_('Migrations').filter(function(row) { return row.workspace_id === config.WORKSPACE_ID && row.source_hash === preview.sourceHash; })[0];
  if (existing) return { migrationId: existing.migration_id, status: existing.status, duplicate: true };
  var records = payload.records || {}, now = new Date().toISOString(), migrationId = Utilities.getUuid(), writes = { Migrations: { appends: [[config.WORKSPACE_ID, migrationId, String(payload.sourceDevice || ''), preview.sourceHash, JSON.stringify(preview.counts), JSON.stringify({}), 'committed', now]] }, AuditLogs: { appends: [auditRow_(config, request.requestId, actor, request.action, 'Migration', migrationId, 0, 1, ['counts_json','status'])] }, Requests: { appends: [requestRow_(config, request.requestId, actor, request.action, payload, { migrationId: migrationId, status: 'committed' })] } };
  var clients = Array.isArray(records.clients) ? records.clients : [], items = Array.isArray(records.items) ? records.items : [], terms = Array.isArray(records.terms) ? records.terms : [];
  clients.slice(0, 1000).forEach(function(item) { var id = String(item.id || Utilities.getUuid()); writes.Clients = writes.Clients || { appends: [] }; writes.Clients.appends.push([config.WORKSPACE_ID, id, String(item.name || '').slice(0, 200), String(item.attention || ''), String(item.email || ''), String(item.phone || ''), String(item.address || ''), actor.id, now, actor.id, now, 1, '']); });
  items.slice(0, 1000).forEach(function(item) { var id = String(item.id || Utilities.getUuid()); writes.Items = writes.Items || { appends: [] }; writes.Items.appends.push([config.WORKSPACE_ID, id, String(item.code || '').slice(0, 80), String(item.description || '').slice(0, 2000), String(item.unit || 'unit').slice(0, 40), Number(item.unitPriceMinor || 0), String(item.currency || 'MYR').toUpperCase(), item.active !== false, now, now, 1]); });
  terms.slice(0, 1000).forEach(function(item) { var id = String(item.id || Utilities.getUuid()); writes.Terms = writes.Terms || { appends: [] }; writes.Terms.appends.push([config.WORKSPACE_ID, id, String(item.name || '').slice(0, 200), String(item.text || '').slice(0, 10000), JSON.stringify(item.documentTypes || ['quotation','proforma','invoice']), item.active !== false, now, now, 1]); });
  atomicWrite_(writes);
  return { migrationId: migrationId, status: 'committed', counts: preview.counts };
}

function listRecords_(name, actor, options) {
  var allowed = name === 'Clients' ? ['name','email','created_at'] : ['updated_at','date','due_date','status','document_no'];
  if (options.sort && allowed.indexOf(options.sort) < 0) throw apiError_('VALIDATION_ERROR', 'Sort field is not supported.', false);
  var limit = Math.max(1, Math.min(Number(options.pageSize) || 50, 100));
  var page = Math.max(1, Number(options.page) || 1);
  var config = getConfig_();
  var all = rows_(name).filter(function(row) {
    return row.workspace_id === config.WORKSPACE_ID && !row.archived_at && (actor.scope === 'all' || hasRole_(actor, 'Admin') || row.owner_id === actor.id);
  });
  if (options.query) {
    var query = String(options.query).toLowerCase().slice(0, 100);
    all = all.filter(function(row) { return Object.keys(row).some(function(key) { return String(row[key] || '').toLowerCase().indexOf(query) >= 0; }); });
  }
  all.sort(function(a, b) { return String(b[options.sort || (name === 'Clients' ? 'name' : 'updated_at')] || '').localeCompare(String(a[options.sort || (name === 'Clients' ? 'name' : 'updated_at')] || '')); });
  return { items: all.slice((page - 1) * limit, page * limit), page: page, pageSize: limit, total: all.length };
}

function saveClient_(actor, request, payload) {
  return masterSave_(actor, request, 'Clients', payload);
}

function digest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8).map(function(byte) {
    var hex = (byte < 0 ? byte + 256 : byte).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function saveDraft_(actor, request, payload) {
  if (!hasRole_(actor, 'SalesOps')) throw apiError_('FORBIDDEN', 'SalesOps access is required.', false);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw apiError_('BUSY_RETRYABLE', 'Workspace is busy. Retry the request.', true);
  try {
    var config = getConfig_(), requestId = String(request.requestId || ''), previous;
    if (!requestId) throw apiError_('VALIDATION_ERROR', 'requestId is required.', false);
    previous = requestResult_(config.WORKSPACE_ID, requestId, actor.id, request.action, payload);
    if (previous) return previous;
    var normalized = normalizeDocument_(payload);
    var clientRecord = recordById_('Clients', normalized.clientId);
    if (!clientRecord || !canReadRecord_(actor, clientRecord.data)) throw apiError_('NOT_FOUND', 'Client was not found.', false);
    var records = sheetRecords_('Documents'), current = normalized.id ? records.filter(function(item) { return item.data.id === normalized.id; })[0] : null;
    if (current && !canReadRecord_(actor, current.data)) throw apiError_('NOT_FOUND', 'Document was not found.', false);
    if (current && current.data.status !== 'Draft') throw apiError_('INVALID_TRANSITION', 'Only draft documents can be edited.', false);
    if (current && Number(request.expectedVersion) !== Number(current.data.version)) throw apiError_('VERSION_CONFLICT', 'This document changed. Reload it and review the latest version.', true);
    var id = current ? normalized.id : Utilities.getUuid(), version = current ? Number(current.data.version) + 1 : 1, now = new Date().toISOString();
    var companySnapshot = settingJson_('company_profile', {}), bankSnapshot = settingJson_('bank_profile', {});
    var clientSnapshot = clientRecord.data, sourceId = String(payload.sourceDocumentId || '');
    var existing = current ? current.data : {};
    var document = Object.assign({}, existing, normalized, { id: id, workspace_id: config.WORKSPACE_ID, document_no: '', source_document_id: sourceId, revision_of_id: String(payload.revisionOfId || ''), revision_no: Number(payload.revisionNo || 0), version: version, status: 'Draft', payment_status: 'Unpaid', owner_id: current ? existing.owner_id : actor.id, company_snapshot_json: JSON.stringify(current ? safeJson_(existing.company_snapshot_json, companySnapshot) : companySnapshot), client_snapshot_json: JSON.stringify(clientSnapshot), bank_snapshot_json: JSON.stringify(current ? safeJson_(existing.bank_snapshot_json, bankSnapshot) : bankSnapshot), issued_at: '', created_at: current ? existing.created_at : now, created_by: current ? existing.created_by : actor.id, updated_at: now, updated_by: actor.id, archived_at: '' });
    var updates = current ? [{ rowNumber: current.rowNumber, values: objectRow_('Documents', document) }] : [];
    var appends = current ? [] : [objectRow_('Documents', document)];
    var lines = normalized.lines.map(function(line, index) { return [config.WORKSPACE_ID, Utilities.getUuid(), id, index + 1, line.description, line.quantityScaled, 1000, line.unit, line.unitPriceMinor, line.lineTotalMinor, version]; });
    var result = { id: id, version: version, status: 'Draft', totals: { subtotalMinor: normalized.subtotalMinor, discountMinor: normalized.discountMinor, taxMinor: normalized.taxMinor, totalMinor: normalized.totalMinor, balanceMinor: normalized.totalMinor } };
    var writes = { Documents: { updates: updates, appends: appends }, DocumentLines: { appends: lines }, AuditLogs: { appends: [auditRow_(config, requestId, actor, request.action, 'Document', id, version - 1, version, ['type','client_id','lines','totals','notes','terms'])] }, Requests: { appends: [requestRow_(config, requestId, actor, request.action, payload, result)] } };
    atomicWrite_(writes);
    return result;
  } finally { lock.releaseLock(); }
}

function normalizeDocument_(payload) {
  if (!payload || typeof payload !== 'object' || !payload.clientId || !Array.isArray(payload.lines) || payload.lines.length < 1 || payload.lines.length > 100) throw apiError_('VALIDATION_ERROR', 'A client and 1 to 100 line items are required.', false);
  var types = ['quotation','proforma','invoice'], currencies = ['MYR','SGD','USD','EUR','GBP','CNY'];
  var type = String(payload.type || ''), currency = String(payload.currency || 'MYR').toUpperCase();
  if (types.indexOf(type) < 0) throw apiError_('VALIDATION_ERROR', 'This document type cannot be saved as a draft.', false);
  if (currencies.indexOf(currency) < 0) throw apiError_('VALIDATION_ERROR', 'Currency is not supported.', false);
  var lines = payload.lines.map(function(line, index) {
    var quantity = Number(line && line.quantity), unitMinor = Number(line && line.unitPriceMinor);
    if (!isFinite(quantity) || quantity <= 0 || Math.round(quantity * 1000) !== quantity * 1000) throw apiError_('VALIDATION_ERROR', 'Line ' + (index + 1) + ' quantity must be positive with up to 3 decimal places.', false);
    if (!isFinite(unitMinor) || unitMinor < 0 || Math.round(unitMinor) !== unitMinor || unitMinor > 9000000000) throw apiError_('VALIDATION_ERROR', 'Line ' + (index + 1) + ' unit price is invalid.', false);
    var quantityScaled = Math.round(quantity * 1000), product = quantityScaled * unitMinor;
    if (!Number.isSafeInteger(product)) throw apiError_('VALIDATION_ERROR', 'Line ' + (index + 1) + ' total is outside the supported amount range.', false);
    var description = String(line.description || '').trim();
    if (!description || description.length > 2000) throw apiError_('VALIDATION_ERROR', 'Line ' + (index + 1) + ' description is required and limited to 2000 characters.', false);
    return { description: description, quantityScaled: quantityScaled, unit: String(line.unit || 'unit').slice(0, 40), unitPriceMinor: unitMinor, lineTotalMinor: Math.floor((product + 500) / 1000) };
  });
  var subtotal = lines.reduce(function(total, line) { return total + line.lineTotalMinor; }, 0);
  if (!Number.isSafeInteger(subtotal) || subtotal > 90000000000) throw apiError_('VALIDATION_ERROR', 'Subtotal is outside the supported amount range.', false);
  var discount = payload.discountMinor == null ? 0 : Number(payload.discountMinor), rate = payload.taxRateScaled == null ? Number(payload.taxRate || 0) * 1000 : Number(payload.taxRateScaled);
  if (!Number.isSafeInteger(discount) || discount < 0 || discount > subtotal) throw apiError_('VALIDATION_ERROR', 'Discount is outside the allowed range.', false);
  if (!Number.isSafeInteger(rate) || rate < 0 || rate > 100000) throw apiError_('VALIDATION_ERROR', 'Tax rate must be between 0 and 100 percent.', false);
  var taxable = subtotal - discount, taxProduct = taxable * rate;
  if (!Number.isSafeInteger(taxProduct)) throw apiError_('VALIDATION_ERROR', 'Tax calculation is outside the supported amount range.', false);
  var tax = Math.floor((taxProduct + 50000) / 100000), total = taxable + tax;
  var date = validDate_(payload.date, 'Document date'), due = payload.dueDate ? validDate_(payload.dueDate, 'Due date') : '';
  var notes = String(payload.notes || ''), terms = String(payload.terms || '');
  if (notes.length > 10000 || terms.length > 10000) throw apiError_('VALIDATION_ERROR', 'Notes and terms are limited to 10000 characters.', false);
  return { id: String(payload.documentId || ''), type: type, client_id: String(payload.clientId), project_id: String(payload.projectId || ''), date: date, due_date: due, currency: currency, lines: lines, subtotal_minor: subtotal, discount_minor: discount, tax_rate_scaled: rate, tax_minor: tax, total_minor: total, paid_minor: 0, balance_minor: total, notes: notes, terms: terms };
}

function validDate_(value, label) {
  var text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw apiError_('VALIDATION_ERROR', label + ' must use YYYY-MM-DD.', false);
  var date = new Date(text + 'T00:00:00Z');
  if (!isFinite(date.getTime()) || date.toISOString().slice(0,10) !== text) throw apiError_('VALIDATION_ERROR', label + ' is invalid.', false);
  return text;
}

function safeJson_(value, fallback) { try { return JSON.parse(value || ''); } catch (_) { return fallback; } }

function settingJson_(key, fallback) {
  var config = getConfig_();
  var row = rows_('Settings').filter(function(item) { return item.workspace_id === config.WORKSPACE_ID && item.key === key; })[0];
  return row ? safeJson_(row.value_json, fallback) : fallback;
}

function objectRow_(sheetName, object) {
  return SCHEMA_[sheetName].map(function(key) { return object[key] == null ? '' : object[key]; });
}

function getDocument_(actor, id) {
  var record = recordById_('Documents', String(id || ''));
  if (!record || !canReadRecord_(actor, record.data)) throw apiError_('NOT_FOUND', 'Document was not found.', false);
  var doc = record.data, lines = documentLines_(doc.workspace_id, doc.id, Number(doc.version));
  return { document: doc, lines: lines };
}

function documentLines_(workspaceId, documentId, maxVersion) {
  var matching = rows_('DocumentLines').filter(function(line) { return line.workspace_id === workspaceId && line.document_id === documentId && Number(line.version) <= maxVersion; });
  if (!matching.length) return [];
  var contentVersion = matching.reduce(function(latest, line) { return Math.max(latest, Number(line.version)); }, 0);
  return matching.filter(function(line) { return Number(line.version) === contentVersion; });
}

function requireCurrentVersion_(record, expected) {
  if (!record) throw apiError_('NOT_FOUND', 'Document was not found.', false);
  if (Number(expected) !== Number(record.data.version)) throw apiError_('VERSION_CONFLICT', 'This document changed. Reload it and review the latest version.', true);
}

function transitionDocument_(actor, request, payload, nextStatus) {
  var config = getConfig_(), requestId = String(request.requestId || ''), lock = LockService.getScriptLock();
  if (!requestId) throw apiError_('VALIDATION_ERROR', 'requestId is required.', false);
  if (!lock.tryLock(5000)) throw apiError_('BUSY_RETRYABLE', 'Workspace is busy. Retry the request.', true);
  try {
    var previous = requestResult_(config.WORKSPACE_ID, requestId, actor.id, request.action, payload); if (previous) return previous;
    var record = recordById_('Documents', String(payload.documentId || ''));
    if (!record || !canReadRecord_(actor, record.data)) throw apiError_('NOT_FOUND', 'Document was not found.', false);
    requireCurrentVersion_(record, request.expectedVersion);
    var doc = record.data, current = String(doc.status), roles = actor.roles;
    if (nextStatus === 'PendingApproval' && (!hasRole_(actor, 'SalesOps') || doc.type !== 'quotation' || current !== 'Draft')) throw apiError_('FORBIDDEN', 'Only SalesOps can submit a draft quotation for approval.', false);
    if (nextStatus === 'Void' && (!hasRole_(actor, 'Finance') || current !== 'Issued' || Number(doc.paid_minor) > 0)) throw apiError_('FORBIDDEN', 'Finance can void only issued documents without recorded payments.', false);
    if (nextStatus === 'Archived' && (!hasRole_(actor, 'Admin') && !hasRole_(actor, 'Finance'))) throw apiError_('FORBIDDEN', 'Administrator or Finance access is required.', false);
    var allowed = current === 'Draft' && nextStatus === 'PendingApproval' || current === 'Issued' && nextStatus === 'Void' || current === 'Void' && nextStatus === 'Archived' || current === 'Issued' && nextStatus === 'Archived';
    if (!allowed) throw apiError_('INVALID_TRANSITION', 'This document cannot move to the requested state.', false);
    var now = new Date().toISOString(), updated = Object.assign({}, doc, { status: nextStatus, version: Number(doc.version) + 1, updated_at: now, updated_by: actor.id });
    if (nextStatus === 'Archived') updated.archived_at = now;
    var result = { id: doc.id, version: updated.version, status: nextStatus };
    atomicWrite_({ Documents: { updates: [{ rowNumber: record.rowNumber, values: objectRow_('Documents', updated) }] }, AuditLogs: { appends: [auditRow_(config, requestId, actor, request.action, 'Document', doc.id, doc.version, updated.version, ['status'])] }, Requests: { appends: [requestRow_(config, requestId, actor, request.action, payload, result)] } });
    return result;
  } finally { lock.releaseLock(); }
}

function reviewDocument_(actor, request, payload, decision) {
  if (!hasRole_(actor, 'Approver')) throw apiError_('FORBIDDEN', 'Approver access is required.', false);
  var config = getConfig_(), requestId = String(request.requestId || ''), lock = LockService.getScriptLock();
  if (!requestId) throw apiError_('VALIDATION_ERROR', 'requestId is required.', false);
  if (!lock.tryLock(5000)) throw apiError_('BUSY_RETRYABLE', 'Workspace is busy. Retry the request.', true);
  try {
    var previous = requestResult_(config.WORKSPACE_ID, requestId, actor.id, request.action, payload); if (previous) return previous;
    var record = recordById_('Documents', String(payload.documentId || ''));
    if (!record || !canReadRecord_(actor, record.data)) throw apiError_('NOT_FOUND', 'Document was not found.', false);
    requireCurrentVersion_(record, request.expectedVersion);
    var doc = record.data;
    if (doc.type !== 'quotation' || doc.status !== 'PendingApproval') throw apiError_('INVALID_TRANSITION', 'Only a pending quotation can be reviewed.', false);
    if (doc.created_by === actor.id) throw apiError_('FORBIDDEN', 'A user cannot approve their own quotation.', false);
    var reason = String(payload.reason || '').trim();
    if (decision === 'Draft' && !reason) throw apiError_('VALIDATION_ERROR', 'A reason is required when rejecting a quotation.', false);
    if (reason.length > 1000) throw apiError_('VALIDATION_ERROR', 'Review reason is too long.', false);
    var now = new Date().toISOString(), updated = Object.assign({}, doc, { status: decision, version: Number(doc.version) + 1, updated_at: now, updated_by: actor.id });
    var approval = [config.WORKSPACE_ID, Utilities.getUuid(), doc.id, Number(doc.version), doc.created_by, actor.id, decision === 'Approved' ? 'approve' : 'reject', reason, now];
    var result = { id: doc.id, version: updated.version, status: decision };
    atomicWrite_({ Documents: { updates: [{ rowNumber: record.rowNumber, values: objectRow_('Documents', updated) }] }, Approvals: { appends: [approval] }, AuditLogs: { appends: [auditRow_(config, requestId, actor, request.action, 'Document', doc.id, doc.version, updated.version, ['status','review'])] }, Requests: { appends: [requestRow_(config, requestId, actor, request.action, payload, result)] } });
    return result;
  } finally { lock.releaseLock(); }
}

function issueDocument_(actor, request, payload) {
  var config = getConfig_(), requestId = String(request.requestId || ''), lock = LockService.getScriptLock();
  if (!requestId) throw apiError_('VALIDATION_ERROR', 'requestId is required.', false);
  if (!lock.tryLock(5000)) throw apiError_('BUSY_RETRYABLE', 'Workspace is busy. Retry the request.', true);
  try {
    var previous = requestResult_(config.WORKSPACE_ID, requestId, actor.id, request.action, payload); if (previous) return previous;
    var record = recordById_('Documents', String(payload.documentId || ''));
    if (!record || !canReadRecord_(actor, record.data)) throw apiError_('NOT_FOUND', 'Document was not found.', false);
    requireCurrentVersion_(record, request.expectedVersion);
    var doc = record.data;
    if (doc.type === 'quotation' && (!hasRole_(actor, 'Approver') || doc.status !== 'Approved')) throw apiError_('FORBIDDEN', 'An approved quotation and Approver access are required to issue it.', false);
    if ((doc.type === 'invoice' || doc.type === 'proforma') && (!hasRole_(actor, 'Finance') || doc.status !== 'Draft')) throw apiError_('FORBIDDEN', 'Finance can issue only draft invoices and proformas.', false);
    if (doc.status !== 'Draft' && doc.status !== 'Approved') throw apiError_('INVALID_TRANSITION', 'This document cannot be issued.', false);
    var year = String(doc.date).slice(0,4), prefix = { quotation: 'QT', proforma: 'PI', invoice: 'INV' }[doc.type];
    if (!prefix) throw apiError_('VALIDATION_ERROR', 'This document type cannot be issued.', false);
    var counters = sheetRecords_('Counters'), counter = counters.filter(function(item) { return item.data.workspace_id === config.WORKSPACE_ID && item.data.type === doc.type && String(item.data.year) === year; })[0];
    var next = Number(counter ? counter.data.last_number : 0) + 1, number = prefix + '-' + year + '-' + ('0000' + next).slice(-4), now = new Date().toISOString();
    var updated = Object.assign({}, doc, { status: 'Issued', document_no: number, version: Number(doc.version) + 1, issued_at: now, updated_at: now, updated_by: actor.id });
    var result = { id: doc.id, version: updated.version, status: 'Issued', documentNo: number };
    var writes = { Documents: { updates: [{ rowNumber: record.rowNumber, values: objectRow_('Documents', updated) }] }, AuditLogs: { appends: [auditRow_(config, requestId, actor, request.action, 'Document', doc.id, doc.version, updated.version, ['status','document_no','issued_at'])] }, Requests: { appends: [requestRow_(config, requestId, actor, request.action, payload, result)] } };
    if (counter) writes.Counters = { updates: [{ rowNumber: counter.rowNumber, values: [config.WORKSPACE_ID, doc.type, year, next] }] };
    else writes.Counters = { appends: [[config.WORKSPACE_ID, doc.type, year, next]] };
    atomicWrite_(writes);
    return result;
  } finally { lock.releaseLock(); }
}

function reviseDocument_(actor, request, payload) {
  if (!hasRole_(actor, 'SalesOps')) throw apiError_('FORBIDDEN', 'SalesOps access is required.', false);
  var config = getConfig_(), requestId = String(request.requestId || ''), lock = LockService.getScriptLock();
  if (!requestId) throw apiError_('VALIDATION_ERROR', 'requestId is required.', false);
  if (!lock.tryLock(5000)) throw apiError_('BUSY_RETRYABLE', 'Workspace is busy. Retry the request.', true);
  try {
    var previous = requestResult_(config.WORKSPACE_ID, requestId, actor.id, request.action, payload);
    if (previous) return previous;
    var original = recordById_('Documents', String(payload.documentId || ''));
    if (!original || !canReadRecord_(actor, original.data)) throw apiError_('NOT_FOUND', 'Document was not found.', false);
    requireCurrentVersion_(original, request.expectedVersion);
    if (original.data.status !== 'Issued') throw apiError_('INVALID_TRANSITION', 'Only an issued document can be revised.', false);
    if (Number(original.data.paid_minor) > 0) throw apiError_('INVALID_TRANSITION', 'A paid document must be handled by Finance before revision.', false);
    var currentLines = documentLines_(config.WORKSPACE_ID, original.data.id, Number(original.data.version));
    var revisionNo = Number(original.data.revision_no || 0) + 1;
    var newPayload = { sourceDocumentId: original.data.id, revisionOfId: original.data.id, revisionNo: revisionNo, type: original.data.type, clientId: original.data.client_id, projectId: original.data.project_id, date: original.data.date, dueDate: original.data.due_date, currency: original.data.currency, discountMinor: original.data.discount_minor, taxRateScaled: Number(original.data.tax_rate_scaled || 0), notes: original.data.notes, terms: original.data.terms, lines: currentLines.map(function(line) { return { description: line.description, quantity: Number(line.quantity_scaled) / 1000, unit: line.unit, unitPriceMinor: line.unit_price_minor }; }) };
    var normalized = normalizeDocument_(newPayload), id = Utilities.getUuid(), now = new Date().toISOString();
    var client = recordById_('Clients', normalized.client_id);
    if (!client || !canReadRecord_(actor, client.data)) throw apiError_('NOT_FOUND', 'Client was not found.', false);
    var document = Object.assign({}, normalized, { id: id, workspace_id: config.WORKSPACE_ID, document_no: '', source_document_id: original.data.id, revision_of_id: original.data.id, revision_no: revisionNo, version: 1, status: 'Draft', payment_status: 'Unpaid', owner_id: actor.id, company_snapshot_json: original.data.company_snapshot_json, client_snapshot_json: JSON.stringify(client.data), bank_snapshot_json: original.data.bank_snapshot_json, issued_at: '', created_at: now, created_by: actor.id, updated_at: now, updated_by: actor.id, archived_at: '' });
    var lineRows = normalized.lines.map(function(line, index) { return [config.WORKSPACE_ID, Utilities.getUuid(), id, index + 1, line.description, line.quantityScaled, 1000, line.unit, line.unitPriceMinor, line.lineTotalMinor, 1]; });
    var result = { id: id, version: 1, status: 'Draft', revisionOfId: original.data.id, revisionNo: revisionNo, totals: { subtotalMinor: normalized.subtotal_minor, discountMinor: normalized.discount_minor, taxMinor: normalized.tax_minor, totalMinor: normalized.total_minor, balanceMinor: normalized.total_minor } };
    atomicWrite_({ Documents: { appends: [objectRow_('Documents', document)] }, DocumentLines: { appends: lineRows }, DocumentLinks: { appends: [[config.WORKSPACE_ID, Utilities.getUuid(), original.data.id, id, 'revision', now, actor.id]] }, AuditLogs: { appends: [auditRow_(config, requestId, actor, request.action, 'Document', id, 0, 1, ['revision_of_id','revision_no','type','client_id','lines','totals'])] }, Requests: { appends: [requestRow_(config, requestId, actor, request.action, payload, result)] } });
    return result;
  } finally { lock.releaseLock(); }
}

function recordPayment_(actor, request, payload) {
  if (!hasRole_(actor, 'Finance')) throw apiError_('FORBIDDEN', 'Finance access is required.', false);
  var config = getConfig_(), requestId = String(request.requestId || ''), lock = LockService.getScriptLock();
  if (!requestId) throw apiError_('VALIDATION_ERROR', 'requestId is required.', false);
  if (!lock.tryLock(5000)) throw apiError_('BUSY_RETRYABLE', 'Workspace is busy. Retry the request.', true);
  try {
    var previous = requestResult_(config.WORKSPACE_ID, requestId, actor.id, request.action, payload);
    if (previous) return previous;
    var invoiceRecord = recordById_('Documents', String(payload.invoiceId || ''));
    if (!invoiceRecord || !canReadRecord_(actor, invoiceRecord.data)) throw apiError_('NOT_FOUND', 'Invoice was not found.', false);
    var invoice = invoiceRecord.data;
    if (invoice.type !== 'invoice' || invoice.status !== 'Issued') throw apiError_('INVALID_TRANSITION', 'Payments can be recorded only against issued invoices.', false);
    requireCurrentVersion_(invoiceRecord, request.expectedVersion);
    var amount = Number(payload.amountMinor), currency = String(payload.currency || '').toUpperCase();
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 90000000000) throw apiError_('VALIDATION_ERROR', 'Payment amount must be a positive supported amount in minor units.', false);
    if (currency !== invoice.currency) throw apiError_('VALIDATION_ERROR', 'Payment currency must match the invoice.', false);
    if (amount > Number(invoice.balance_minor)) throw apiError_('VALIDATION_ERROR', 'Payment cannot exceed the invoice balance.', false);
    var paidDate = validDate_(payload.paidDate, 'Payment date');
    var method = String(payload.method || '').trim();
    if (['Cash','Bank transfer','Card','Cheque','Other'].indexOf(method) < 0) throw apiError_('VALIDATION_ERROR', 'Payment method is not supported.', false);
    var reference = String(payload.reference || '').trim();
    if (reference.length > 200) throw apiError_('VALIDATION_ERROR', 'Payment reference is too long.', false);
    var paymentId = Utilities.getUuid(), now = new Date().toISOString();
    var paid = Number(invoice.paid_minor) + amount, balance = Number(invoice.total_minor) - paid;
    var paymentStatus = balance === 0 ? 'Paid' : 'PartiallyPaid';
    var updatedInvoice = Object.assign({}, invoice, { paid_minor: paid, balance_minor: balance, payment_status: paymentStatus, version: Number(invoice.version) + 1, updated_at: now, updated_by: actor.id });
    var receiptId = Utilities.getUuid(), receiptYear = paidDate.slice(0, 4), counterRecords = sheetRecords_('Counters');
    var counter = counterRecords.filter(function(row) { return row.data.workspace_id === config.WORKSPACE_ID && row.data.type === 'receipt' && String(row.data.year) === receiptYear; })[0];
    var next = Number(counter ? counter.data.last_number : 0) + 1;
    var receiptNo = 'RCPT-' + receiptYear + '-' + ('0000' + next).slice(-4);
    var company = safeJson_(invoice.company_snapshot_json, {}), client = safeJson_(invoice.client_snapshot_json, {}), bank = safeJson_(invoice.bank_snapshot_json, {});
    var receipt = { workspace_id: config.WORKSPACE_ID, id: receiptId, type: 'receipt', document_no: receiptNo, source_document_id: invoice.id, revision_of_id: '', revision_no: 0, version: 1, status: 'Issued', payment_status: 'Paid', client_id: invoice.client_id, project_id: invoice.project_id, owner_id: invoice.owner_id, date: paidDate, due_date: '', currency: currency, subtotal_minor: amount, discount_minor: 0, tax_minor: 0, total_minor: amount, paid_minor: amount, balance_minor: 0, company_snapshot_json: JSON.stringify(company), client_snapshot_json: JSON.stringify(client), bank_snapshot_json: JSON.stringify(bank), notes: reference, terms: '', issued_at: now, created_at: now, created_by: actor.id, updated_at: now, updated_by: actor.id, archived_at: '' };
    var result = { id: paymentId, invoiceId: invoice.id, amountMinor: amount, invoiceVersion: updatedInvoice.version, paymentStatus: paymentStatus, receiptId: receiptId, receiptNo: receiptNo };
    var writes = {
      Payments: { appends: [[config.WORKSPACE_ID, paymentId, invoice.id, currency, amount, paidDate, method, reference, 'Active', '', actor.id, now]] },
      PaymentAllocations: { appends: [[config.WORKSPACE_ID, Utilities.getUuid(), paymentId, invoice.id, amount, now]] },
      Documents: { updates: [{ rowNumber: invoiceRecord.rowNumber, values: objectRow_('Documents', updatedInvoice) }], appends: [objectRow_('Documents', receipt)] },
      DocumentLines: { appends: [[config.WORKSPACE_ID, Utilities.getUuid(), receiptId, 1, 'Payment received for invoice ' + String(invoice.document_no || invoice.id), 1000, 1000, 'payment', amount, amount, 1]] },
      DocumentLinks: { appends: [[config.WORKSPACE_ID, Utilities.getUuid(), paymentId, receiptId, 'payment_to_receipt', now, actor.id]] },
      AuditLogs: { appends: [auditRow_(config, requestId, actor, request.action, 'Payment', paymentId, 0, 1, ['invoice_id','amount_minor','paid_date','method']), auditRow_(config, requestId, actor, request.action, 'Document', invoice.id, invoice.version, updatedInvoice.version, ['paid_minor','balance_minor','payment_status'])] },
      Requests: { appends: [requestRow_(config, requestId, actor, request.action, payload, result)] }
    };
    if (counter) writes.Counters.updates = [{ rowNumber: counter.rowNumber, values: [config.WORKSPACE_ID, 'receipt', receiptYear, next] }];
    else writes.Counters = { appends: [[config.WORKSPACE_ID, 'receipt', receiptYear, next]] };
    atomicWrite_(writes);
    return result;
  } finally { lock.releaseLock(); }
}

function reversePayment_(actor, request, payload) {
  if (!hasRole_(actor, 'Finance')) throw apiError_('FORBIDDEN', 'Finance access is required.', false);
  var config = getConfig_(), requestId = String(request.requestId || ''), lock = LockService.getScriptLock();
  if (!requestId) throw apiError_('VALIDATION_ERROR', 'requestId is required.', false);
  if (!lock.tryLock(5000)) throw apiError_('BUSY_RETRYABLE', 'Workspace is busy. Retry the request.', true);
  try {
    var previous = requestResult_(config.WORKSPACE_ID, requestId, actor.id, request.action, payload);
    if (previous) return previous;
    var payment = rows_('Payments').filter(function(row) { return row.workspace_id === config.WORKSPACE_ID && row.id === String(payload.paymentId || '') && row.status === 'Active'; })[0];
    if (!payment) throw apiError_('NOT_FOUND', 'Active payment was not found.', false);
    var invoiceRecord = recordById_('Documents', payment.invoice_id);
    if (!invoiceRecord || !canReadRecord_(actor, invoiceRecord.data)) throw apiError_('NOT_FOUND', 'Payment was not found.', false);
    requireCurrentVersion_(invoiceRecord, request.expectedVersion);
    if (invoiceRecord.data.status !== 'Issued') throw apiError_('INVALID_TRANSITION', 'The invoice cannot accept a payment reversal.', false);
    var reversals = rows_('Payments').filter(function(row) { return row.workspace_id === config.WORKSPACE_ID && row.reversal_of_id === payment.id && row.status === 'Reversal'; });
    if (reversals.length) throw apiError_('INVALID_TRANSITION', 'This payment has already been reversed.', false);
    var now = new Date().toISOString(), reversalDate = validDate_(payload.reversalDate, 'Reversal date');
    var updated = Object.assign({}, invoiceRecord.data, { paid_minor: Number(invoiceRecord.data.paid_minor) - Number(payment.amount_minor), balance_minor: Number(invoiceRecord.data.balance_minor) + Number(payment.amount_minor), payment_status: Number(invoiceRecord.data.paid_minor) === Number(payment.amount_minor) ? 'Unpaid' : 'PartiallyPaid', version: Number(invoiceRecord.data.version) + 1, updated_at: now, updated_by: actor.id });
    var id = Utilities.getUuid(), reason = String(payload.reason || '').trim();
    if (!reason || reason.length > 1000) throw apiError_('VALIDATION_ERROR', 'A reversal reason of up to 1000 characters is required.', false);
    var result = { id: id, reversedPaymentId: payment.id, invoiceId: payment.invoice_id, amountMinor: Number(payment.amount_minor), invoiceVersion: updated.version };
    atomicWrite_({ Payments: { appends: [[config.WORKSPACE_ID, id, payment.invoice_id, payment.currency, payment.amount_minor, reversalDate, payment.method, reason, 'Reversal', payment.id, actor.id, now]] }, Documents: { updates: [{ rowNumber: invoiceRecord.rowNumber, values: objectRow_('Documents', updated) }] }, AuditLogs: { appends: [auditRow_(config, requestId, actor, request.action, 'Payment', id, 0, 1, ['reversal_of_id','amount_minor','paid_date','reason']), auditRow_(config, requestId, actor, request.action, 'Document', payment.invoice_id, invoiceRecord.data.version, updated.version, ['paid_minor','balance_minor','payment_status'])] }, Requests: { appends: [requestRow_(config, requestId, actor, request.action, payload, result)] } });
    return result;
  } finally { lock.releaseLock(); }
}

function listPayments_(actor, options) {
  if (!hasRole_(actor, 'Finance') && !hasRole_(actor, 'Viewer') && !hasRole_(actor, 'SalesOps')) throw apiError_('FORBIDDEN', 'Payment access is required.', false);
  var config = getConfig_(), pageSize = Math.max(1, Math.min(Number(options.pageSize) || 50, 100)), page = Math.max(1, Number(options.page) || 1);
  var invoices = {};
  sheetRecords_('Documents').forEach(function(item) { if (item.data.workspace_id === config.WORKSPACE_ID && canReadRecord_(actor, item.data)) invoices[item.data.id] = true; });
  var all = rows_('Payments').filter(function(row) { return row.workspace_id === config.WORKSPACE_ID && invoices[row.invoice_id]; }).sort(function(a, b) { return String(b.paid_date).localeCompare(String(a.paid_date)); });
  return { items: all.slice((page - 1) * pageSize, page * pageSize), page: page, pageSize: pageSize, total: all.length };
}

function getReceiptForPayment_(actor, payload) {
  var config = getConfig_(), paymentId = String(payload.paymentId || '');
  var payment = rows_('Payments').filter(function(row) { return row.workspace_id === config.WORKSPACE_ID && row.id === paymentId && row.status === 'Active'; })[0];
  if (!payment) throw apiError_('NOT_FOUND', 'Payment was not found.', false);
  var invoice = recordById_('Documents', payment.invoice_id);
  if (!invoice || !canReadRecord_(actor, invoice.data)) throw apiError_('NOT_FOUND', 'Payment was not found.', false);
  var link = rows_('DocumentLinks').filter(function(row) { return row.workspace_id === config.WORKSPACE_ID && row.from_id === paymentId && row.relation === 'payment_to_receipt'; })[0];
  var receipt = link && recordById_('Documents', link.to_id);
  if (!receipt || receipt.data.type !== 'receipt') throw apiError_('NOT_FOUND', 'Receipt was not found.', false);
  return { document: receipt.data, lines: rows_('DocumentLines').filter(function(line) { return line.workspace_id === config.WORKSPACE_ID && line.document_id === receipt.data.id; }) };
}
