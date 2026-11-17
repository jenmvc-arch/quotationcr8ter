'use strict';

function requireActor_() {
  var config = requireConfig_();
  var email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) {
    appendSecurityEvent_('IDENTITY_UNAVAILABLE', 'Active user email is empty.');
    throw apiError_('IDENTITY_UNAVAILABLE', 'Google could not verify your account. Contact the workspace administrator.', false);
  }
  if (!email.endsWith('@' + config.ALLOWED_DOMAIN)) {
    appendSecurityEvent_('FORBIDDEN', 'Account outside allowed domain.');
    throw apiError_('FORBIDDEN', 'Your account is not allowed to use this workspace.', false);
  }
  var user = rows_('Users').filter(function(item) { return String(item.email).toLowerCase() === email; })[0];
  if (!user || user.active !== true) {
    appendSecurityEvent_('FORBIDDEN', 'Account is not an active workspace member.');
    throw apiError_('FORBIDDEN', 'Your account is not an active workspace member.', false);
  }
  var roles;
  try { roles = JSON.parse(user.roles_json || '[]'); } catch (_) { roles = []; }
  return { id: String(user.id), email: email, name: String(user.name || email), roles: roles, scope: String(user.scope || 'own') };
}

function hasRole_(actor, role) { return actor.roles.indexOf('Admin') >= 0 || actor.roles.indexOf(role) >= 0; }

function appendSecurityEvent_(code, message) {
  try {
    var c = getConfig_();
    if (!c.SPREADSHEET_ID) return;
    var ss = SpreadsheetApp.openById(c.SPREADSHEET_ID);
    var sheet = ss.getSheetByName('SystemLogs');
    if (!sheet) return;
    sheet.appendRow([c.WORKSPACE_ID, '', 'WARN', code, message, new Date().toISOString()]);
  } catch (_) {}
}
