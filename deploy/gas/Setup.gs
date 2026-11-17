'use strict';

function initializeWorkspace_() {
  var config = requireConfig_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('Workspace setup is busy. Try again.');
  try {
    var ss = SpreadsheetApp.openById(config.SPREADSHEET_ID);
    Object.keys(SCHEMA_).forEach(function(name) {
      var sheet = ss.getSheetByName(name);
      if (!sheet) sheet = ss.insertSheet(name);
      if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, SCHEMA_[name].length).setValues([SCHEMA_[name]]);
      else {
        var existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0].map(String);
        if (SCHEMA_[name].some(function(column, index) { return existing[index] !== column; })) throw new Error('Existing sheet headers do not match expected schema: ' + name + '. No rows were changed.');
      }
    });
    var bootstrapEmail = config.BOOTSTRAP_ADMIN_EMAIL;
    if (bootstrapEmail) {
      if (!bootstrapEmail.endsWith('@' + config.ALLOWED_DOMAIN)) throw new Error('Bootstrap admin must belong to ALLOWED_DOMAIN.');
      var userSheet = ss.getSheetByName('Users');
      var existingUsers = userSheet.getDataRange().getValues();
      if (existingUsers.length === 1) userSheet.appendRow([Utilities.getUuid(), bootstrapEmail, bootstrapEmail, JSON.stringify(['Admin']), 'all', true]);
    }
    PropertiesService.getScriptProperties().setProperty('SCHEMA_VERSION', '1');
    return { ok: true, environment: config.APP_ENV, schemaVersion: '1', tabs: Object.keys(SCHEMA_).length };
  } finally { lock.releaseLock(); }
}
