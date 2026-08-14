/**
 * CLPPS Lead Tracker backend — paste this whole file into a new project at
 * script.google.com, then Deploy → New deployment → Web app →
 * Execute as: Me → Access: Anyone. Nothing needs to be edited.
 *
 * On its first use it automatically creates a spreadsheet named
 * "CLPPS Leads" in your Google Drive and stores everything there.
 */

var PIN = 'clpps-8k3v51';   // built-in key the tracker page sends automatically

var HEADERS = ['id','created','type','name','phone','email','address','zip','service',
               'dogs','yard','deodorize','hero','price','manual','honored','notes',
               'status','crmnotes','updated'];

function sheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  var ss;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('CLPPS Leads');
    props.setProperty('SHEET_ID', ss.getId());
  }
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

/**
 * WEEKLY DIGEST (optional): emails a Monday summary of views, leads and
 * closes to the business inbox. To turn on: paste this whole updated file
 * over the old code, save, then in the left sidebar click Triggers (clock
 * icon) -> Add Trigger -> function weeklyDigest -> time-driven -> week
 * timer -> Monday 7-8am -> Save.
 */
function weeklyDigest() {
  var sh = sheet_();
  var rows = sh.getDataRange().getValues();
  var cut = new Date(Date.now() - 7 * 86400000);
  var views = 0, qviews = 0, leads = 0, closed = 0, names = [];
  for (var i = 1; i < rows.length; i++) {
    var created = new Date(rows[i][HEADERS.indexOf('created')]);
    var type = rows[i][HEADERS.indexOf('type')];
    var status = rows[i][HEADERS.indexOf('status')];
    if (created >= cut) {
      if (type === 'VIEW') views++;
      else if (type === 'QVIEW') qviews++;
      else { leads++; names.push(rows[i][HEADERS.indexOf('name')]); }
    }
    if (type !== 'VIEW' && type !== 'QVIEW' && status === 'closed' && created >= cut) closed++;
  }
  MailApp.sendEmail({
    to: 'info@clpropetservices.com',
    subject: 'CLPPS weekly: ' + leads + ' lead' + (leads === 1 ? '' : 's') + ', ' + views + ' site visits',
    body: 'Your website, last 7 days:\n\n' +
      'Site visits: ' + views + '\n' +
      'Saw a price: ' + qviews + '\n' +
      'New leads: ' + leads + (names.length ? ' (' + names.join(', ') + ')' : '') + '\n' +
      'Marked closed: ' + closed + '\n\n' +
      'Lead tracker: https://www.clpropetservices.com/hq-8k3v51/'
  });
}
