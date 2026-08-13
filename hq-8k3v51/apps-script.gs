/**
 * CLPPS Lead Tracker backend — paste this whole file into Google Apps Script
 * (sheet.new → Extensions → Apps Script), then
 * Deploy → New deployment → Web app → Execute as: Me → Access: Anyone.
 * Nothing needs to be edited.
 */

var PIN = 'clpps-8k3v51';   // built-in key the tracker page sends automatically

var HEADERS = ['id','created','type','name','phone','email','address','zip','service',
               'dogs','yard','deodorize','hero','price','manual','honored','notes',
               'status','crmnotes','updated'];

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheets()[0];
  if (sh.getLastRow() === 0) sh.appendRow(HEADERS);
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.action === 'list') {
    if (p.key !== PIN) return json_({ok:false, error:'bad pin'});
    var sh = sheet_();
    var rows = sh.getDataRange().getValues();
    var leads = [];
    for (var i = 1; i < rows.length; i++) {
      var o = {};
      for (var j = 0; j < HEADERS.length; j++) o[HEADERS[j]] = rows[i][j];
      leads.push(o);
    }
    leads.reverse(); // newest first
    return json_({ok:true, leads:leads});
  }
  return json_({ok:true, service:'CLPPS lead tracker'});
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ok:false}); }

  if (body.action === 'lead' && body.lead) {
    var l = body.lead;
    var sh = sheet_();
    sh.appendRow(HEADERS.map(function(h){
      if (h === 'status') return 'new';
      if (h === 'crmnotes') return '';
      if (h === 'updated') return new Date().toISOString();
      return l[h] != null ? String(l[h]) : '';
    }));
    return json_({ok:true});
  }

  if (body.action === 'update') {
    if (body.key !== PIN) return json_({ok:false, error:'bad pin'});
    var sh2 = sheet_();
    var data = sh2.getDataRange().getValues();
    var idCol = HEADERS.indexOf('id');
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(body.id)) {
        if (body.status != null) sh2.getRange(i+1, HEADERS.indexOf('status')+1).setValue(body.status);
        if (body.notes  != null) sh2.getRange(i+1, HEADERS.indexOf('crmnotes')+1).setValue(body.notes);
        sh2.getRange(i+1, HEADERS.indexOf('updated')+1).setValue(new Date().toISOString());
        return json_({ok:true});
      }
    }
    return json_({ok:false, error:'not found'});
  }

  return json_({ok:false});
}
