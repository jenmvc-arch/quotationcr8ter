'use strict';

function getConfig_() {
  var p = PropertiesService.getScriptProperties().getProperties();
  return {
    APP_ENV: p.APP_ENV || '',
    WORKSPACE_ID: p.WORKSPACE_ID || '',
    SPREADSHEET_ID: p.SPREADSHEET_ID || '',
    DRIVE_ROOT_ID: p.DRIVE_ROOT_ID || '',
    BACKUP_ROOT_ID: p.BACKUP_ROOT_ID || '',
    ALLOWED_DOMAIN: (p.ALLOWED_DOMAIN || '').toLowerCase().replace(/^@/, ''),
    BOOTSTRAP_ADMIN_EMAIL: (p.BOOTSTRAP_ADMIN_EMAIL || '').toLowerCase(),
    SCHEMA_VERSION: p.SCHEMA_VERSION || '1',
    AI_ENABLED: p.AI_ENABLED === 'true'
  };
}

function requireConfig_() {
  var c = getConfig_();
  var missing = ['APP_ENV', 'WORKSPACE_ID', 'SPREADSHEET_ID', 'DRIVE_ROOT_ID', 'BACKUP_ROOT_ID', 'ALLOWED_DOMAIN'];
  var empty = missing.filter(function(key) { return !c[key]; });
  if (empty.length) throw apiError_('MAINTENANCE', 'Workspace configuration is incomplete: ' + empty.join(', '), false);
  if (c.APP_ENV === 'prod' && c.ALLOWED_DOMAIN === '*') throw apiError_('MAINTENANCE', 'Production requires a specific Workspace domain.', false);
  return c;
}
