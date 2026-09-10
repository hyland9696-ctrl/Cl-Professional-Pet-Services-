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

var NOTIFY_TO = 'clpropetservices@gmail.com';
var NOTIFY_CC = 'info@clpropetservices.com';

function notifyLead_(l) {
  var t = String(l.type || '');
  // Analytics pings, no email. OUTAREA fires every time somebody types a ZIP
  // we do not cover, so mailing it would bury the real leads.
  if (t === 'VIEW' || t === 'QVIEW' || t === 'OUTAREA') return;
  var subject, intro;
  if (t === 'AUTH') {
    subject = '\u2705 QUOTE AUTHORIZED: ' + (l.name || 'Customer') + (l.price ? ' at ' + l.price : '');
    intro = 'This customer AUTHORIZED their emailed quote and accepted the Terms of Service. Add them in Sweep&Go and send their start date!';
  } else if (t === 'COMMERCIAL') {
    subject = '\ud83c\udfe2 NEW COMMERCIAL LEAD: ' + (l.name || '');
    intro = 'New commercial inquiry from the website. No pricing quoted; call back personally.';
  } else if (t === 'WAITLIST') {
    subject = '\ud83d\udccd OUT OF AREA: ' + (l.name || '') + ' wants service in ' + (l.address || l.zip || '');
    intro = 'Somebody outside our routes asked us to come to them. They were promised a personal call back, ' +
            'so ring them even if the answer is not yet. Their ZIP and what they told us is below.';
  } else if (t === 'ACTIVATE') {
    subject = '\ud83d\udd25 NEW LEAD (wants to start!): ' + (l.name || '') + (l.price ? ' - ' + String(l.price).split(',')[0] : '');
    intro = 'This lead activated through the website quote wizard and accepted the Terms of Service.';
  } else if (t === 'ENQUIRY') {
    subject = '\ud83d\udcdd QUOTE REQUEST: ' + (l.name || '') + (l.price ? ' - ' + String(l.price).split(',')[0] : '');
    intro = 'Somebody filled in the quote form and has just been shown this price. They have NOT answered yet - ' +
            'a second email follows if they accept or decline. Their details are real either way, so this is worth ' +
            'a call even if nothing else arrives.';
  } else if (t === 'DECLINED') {
    subject = '\ud83d\udc4e SAID NO: ' + (l.name || '') + (l.price ? ' to ' + String(l.price).split(',')[0] : '');
    intro = 'They saw the price and turned it down. The reason they gave is in the notes below. Their quote is held ' +
            'for 6 months, and the tracker will offer to email them a follow-up tomorrow.';
  } else {
    subject = '\ud83d\udc3e NEW LEAD: ' + (l.name || '') + (l.price ? ' - ' + String(l.price).split(',')[0] : '');
    intro = 'New lead captured.';
  }
  var lines = [intro, ''];
  var fields = [['Name','name'],['Phone','phone'],['Email','email'],['Address','address'],['ZIP','zip'],
                ['Service','service'],['Dogs','dogs'],['Yard','yard'],['Deodorize','deodorize'],
                ['Hero discount','hero'],['Price','price'],['Manual review','manual'],
                ['Quote honored until','honored'],['Customer notes','notes']];
  fields.forEach(function(f){ if (l[f[1]]) lines.push(f[0] + ': ' + l[f[1]]); });
  lines.push('');
  lines.push('Lead tracker: https://www.clpropetservices.com/hq-8k3v51/');
  MailApp.sendEmail({ to: NOTIFY_TO, cc: NOTIFY_CC, subject: subject, body: lines.join('\n') });
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
    // Every site visit is a row, so the analytics rows outgrow the real leads
    // by a wide margin. The tracker asks for a window (?days=) and we only
    // send analytics inside it; leads and settings are always sent in full.
    // No days= means everything, so an older tracker page still works.
    var days = parseInt(p.days, 10);
    var cut = days > 0 ? Date.now() - days * 86400000 : 0;
    var BULK = { VIEW:1, QVIEW:1, OUTAREA:1 };
    var iType = HEADERS.indexOf('type'), iCreated = HEADERS.indexOf('created');
    var leads = [], skipped = 0;
    for (var i = 1; i < rows.length; i++) {
      if (cut && BULK[String(rows[i][iType])]) {
        var when = new Date(rows[i][iCreated]).getTime();
        if (when && when < cut) { skipped++; continue; }
      }
      var o = {};
      for (var j = 0; j < HEADERS.length; j++) o[HEADERS[j]] = rows[i][j];
      leads.push(o);
    }
    leads.reverse(); // newest first
    return json_({ok:true, leads:leads, windowDays: days > 0 ? days : null, olderRowsSkipped: skipped});
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
      if (h === 'status') return (h === 'status' && l.status) ? String(l.status) : 'new';
      if (h === 'crmnotes') return l.crmnotes != null ? String(l.crmnotes) : '';
      if (h === 'updated') return new Date().toISOString();
      return l[h] != null ? String(l[h]) : '';
    }));
    try { notifyLead_(l); } catch (e) {}
    return json_({ok:true});
  }

  if (body.action === 'update') {
    if (body.key !== PIN) return json_({ok:false, error:'bad pin'});
    var sh2 = sheet_();
    var data = sh2.getDataRange().getValues();
    var idCol = HEADERS.indexOf('id');
    // A lead can appear more than once under the same id: saving an edit
    // appends a fresh row rather than rewriting the old one. The tracker
    // reads the NEWEST of those, so updating only the first match wrote the
    // change into a stale row where nothing could ever see it - a review
    // marked as asked, a status, a follow-up date, all silently lost.
    // Update every row carrying the id so it cannot matter which one is read.
    var hit = 0;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][idCol]) === String(body.id)) {
        if (body.status != null) sh2.getRange(i+1, HEADERS.indexOf('status')+1).setValue(body.status);
        if (body.notes  != null) sh2.getRange(i+1, HEADERS.indexOf('crmnotes')+1).setValue(body.notes);
        sh2.getRange(i+1, HEADERS.indexOf('updated')+1).setValue(new Date().toISOString());
        hit++;
      }
    }
    if (hit) return json_({ok:true, rowsUpdated:hit});
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
  var views = 0, qviews = 0, closed = 0, names = [];
  var outAsked = 0, outLooked = 0;   // people we cannot serve yet
  // One person is one lead. The quote wizard writes their row again when they
  // answer - ENQUIRY, then ACTIVATE or DECLINED, all under the same id - and
  // editing a lead in the tracker appends another. Counting rows would report
  // the same customer two or three times, so count distinct ids instead.
  var leadIds = {}, closedIds = {}, answered = 0, declined = 0;
  var NOT_A_LEAD = { VIEW:1, QVIEW:1, OUTAREA:1, WAITLIST:1, AUTH:1, SPEND:1, CONFIG:1 };
  for (var i = 1; i < rows.length; i++) {
    var created = new Date(rows[i][HEADERS.indexOf('created')]);
    var type = String(rows[i][HEADERS.indexOf('type')] || '');
    var status = rows[i][HEADERS.indexOf('status')];
    var id = String(rows[i][HEADERS.indexOf('id')] || '');
    if (created >= cut) {
      if (type === 'VIEW') views++;
      else if (type === 'QVIEW') qviews++;
      else if (type === 'OUTAREA') outLooked++;
      else if (type === 'WAITLIST') outAsked++;
      else if (NOT_A_LEAD[type]) { /* not leads */ }
      else if (id && !leadIds[id]) {
        leadIds[id] = 1;
        names.push(rows[i][HEADERS.indexOf('name')]);
      }
      if (type === 'ACTIVATE') answered++;
      if (type === 'DECLINED') declined++;
    }
    if (!NOT_A_LEAD[type] && status === 'closed' && created >= cut && id) closedIds[id] = 1;
  }
  var leads = 0; for (var k in leadIds) leads++;
  for (var k2 in closedIds) closed++;
  MailApp.sendEmail({
    to: 'info@clpropetservices.com',
    subject: 'CLPPS weekly: ' + leads + ' lead' + (leads === 1 ? '' : 's') + ', ' + views + ' site visits',
    body: 'Your website, last 7 days:\n\n' +
      'Site visits: ' + views + '\n' +
      'Saw a price: ' + qviews + '\n' +
      'New leads: ' + leads + (names.length ? ' (' + names.join(', ') + ')' : '') + '\n' +
      'Of those, accepted their quote: ' + answered + '\n' +
      'Of those, said no: ' + declined + '\n' +
      'Marked closed: ' + closed + '\n' +
      (outAsked || outLooked
        ? 'Outside our routes: ' + outAsked + ' asked us to come to them' +
          (outLooked ? ', ' + outLooked + ' more just checked a ZIP' : '') + '\n'
        : '') + '\n' +
      'Lead tracker: https://www.clpropetservices.com/hq-8k3v51/'
  });
}
