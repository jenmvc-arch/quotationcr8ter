'use strict';

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('QuotationCr8ter Internal System')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function api(request) {
  var requestId = request && typeof request.requestId === 'string' ? request.requestId : '';
  try {
    var actor = requireActor_();
    if (!request || typeof request !== 'object' || Array.isArray(request)) throw apiError_('VALIDATION_ERROR', 'Request is invalid.', false);
    if (typeof request.action !== 'string') throw apiError_('VALIDATION_ERROR', 'Action is required.', false);
    var data = dispatch_(actor, request);
    return { ok: true, requestId: requestId, data: data, serverTime: new Date().toISOString() };
  } catch (error) {
    var code = error && error.code || 'INTERNAL_ERROR';
    var message = error && error.publicMessage || (code === 'INTERNAL_ERROR' ? 'The request could not be completed.' : String(error.message || 'Request failed.'));
    return { ok: false, requestId: requestId, error: { code: code, message: message, retryable: Boolean(error && error.retryable) }, serverTime: new Date().toISOString() };
  }
}

function apiError_(code, message, retryable) {
  var error = new Error(message);
  error.code = code;
  error.retryable = Boolean(retryable);
  if (code === 'INTERNAL_ERROR') error.publicMessage = 'The request could not be completed.';
  return error;
}

function dispatch_(actor, request) {
  var action = request.action;
  var payload = request.payload || {};
  if (action === 'session.get') return { userId: actor.id, name: actor.name, roles: actor.roles, workspaceId: getConfig_().WORKSPACE_ID };
  if (action === 'admin.health') return health_(actor);
  if (action === 'dashboard.summary') return dashboardSummary_(actor);
  if (action === 'clients.list') return listRecords_('Clients', actor, payload);
  if (action === 'clients.save') return saveClient_(actor, request, payload);
  if (action === 'clients.archive') return masterArchive_(actor, request, 'Clients', payload);
  if (action === 'items.list') return masterList_(actor, 'Items', payload);
  if (action === 'items.save') return masterSave_(actor, request, 'Items', payload);
  if (action === 'items.archive') return masterArchive_(actor, request, 'Items', payload);
  if (action === 'terms.list') return masterList_(actor, 'Terms', payload);
  if (action === 'terms.save') return masterSave_(actor, request, 'Terms', payload);
  if (action === 'terms.archive') return masterArchive_(actor, request, 'Terms', payload);
  if (action === 'projects.list') return masterList_(actor, 'Projects', payload);
  if (action === 'projects.save') return masterSave_(actor, request, 'Projects', payload);
  if (action === 'projects.archive') return masterArchive_(actor, request, 'Projects', payload);
  if (action === 'documents.list') return listRecords_('Documents', actor, payload);
  if (action === 'documents.get') return getDocument_(actor, payload.documentId);
  if (action === 'documents.saveDraft') return saveDraft_(actor, request, payload);
  if (action === 'documents.submit') return transitionDocument_(actor, request, payload, 'PendingApproval');
  if (action === 'documents.approve') return reviewDocument_(actor, request, payload, 'Approved');
  if (action === 'documents.reject') return reviewDocument_(actor, request, payload, 'Draft');
  if (action === 'documents.issue') return issueDocument_(actor, request, payload);
  if (action === 'documents.void') return transitionDocument_(actor, request, payload, 'Void');
  if (action === 'documents.archive') return transitionDocument_(actor, request, payload, 'Archived');
  if (action === 'documents.revise') return reviseDocument_(actor, request, payload);
  if (action === 'payments.record') return recordPayment_(actor, request, payload);
  if (action === 'payments.reverse') return reversePayment_(actor, request, payload);
  if (action === 'payments.list') return listPayments_(actor, payload);
  if (action === 'receipts.create') return getReceiptForPayment_(actor, payload);
  if (action === 'settings.get') return settingsGet_(actor);
  if (action === 'settings.update') return settingsUpdate_(actor, request, payload);
  if (action === 'users.list') return usersList_(actor);
  if (action === 'users.update') return usersUpdate_(actor, request, payload);
  if (action === 'files.list') return fileList_(actor, payload);
  if (action === 'files.upload') return fileUpload_(actor, request, payload);
  if (action === 'files.download') return fileDownload_(actor, payload);
  if (action === 'jobs.status') return jobsStatus_(actor, payload);
  if (action === 'jobs.retry') return jobsRetry_(actor, request, payload);
  if (action === 'admin.backup') return backupRun_(actor, request);
  if (action === 'migration.preview') return migrationPreview_(actor, payload);
  if (action === 'migration.commit') return migrationCommit_(actor, request, payload);
  throw apiError_('VALIDATION_ERROR', 'Action is not supported.', false);
}
