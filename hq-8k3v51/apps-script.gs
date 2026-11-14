/**
 * CLPPS Lead Tracker backend — paste this whole file into a new project at
 * script.google.com, then Deploy → New deployment → Web app →
 * Execute as: Me → Access: Anyone. Nothing needs to be edited.
 *
 * On its first use it automatically creates a spreadsheet named
 * "CLPPS Leads" in your Google Drive and stores everything there.
 */

/* The tracker password. Run setupTrackerKey() once (pick it in the toolbar,
   press Run, read the key in the execution log) and type that key into the
   tracker on each phone. Until it has been run, the old built-in key still
   works so nothing breaks on the day the new code goes live. */
var LEGACY_PIN = 'clpps-8k3v51';
function pin_() {
  try { var k = PropertiesService.getScriptProperties().getProperty('TRACKER_KEY'); if (k) return k; } catch (e) {}
  return LEGACY_PIN;
}
function setupTrackerKey() {
  var key = Utilities.getUuid().replace(/-/g, '').slice(0, 20);
  PropertiesService.getScriptProperties().setProperty('TRACKER_KEY', key);
  Logger.log('TRACKER PASSWORD (type this into the tracker on each phone, once): ' + key);
  return key;
}
/* Limits on what an anonymous post can do. The lead endpoint has to be open
   (the public quote form uses it), so it is kept small and slow instead. */
var MAX_POST_BYTES = 20000, MAX_LEADS_PER_MINUTE = 200;
function clip_(v, n) { v = v == null ? '' : String(v); return v.length > n ? v.slice(0, n) : v; }
function floodGate_() {
  try {
    var cache = CacheService.getScriptCache(), k = 'rl_' + Math.floor(Date.now() / 60000);
    var n = parseInt(cache.get(k) || '0', 10) + 1;
    cache.put(k, String(n), 120);
    return n > MAX_LEADS_PER_MINUTE;
  } catch (e) { return false; }
}

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
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    // Belt and braces alongside safeCell_: tell the sheet the whole thing is
    // text, so nothing that lands in it is ever read as a formula.
    try { sh.getRange(1, 1, sh.getMaxRows(), HEADERS.length).setNumberFormat('@'); } catch (e) {}
  }
  return sh;
}

var NOTIFY_TO = 'clpropetservices@gmail.com';
var NOTIFY_CC = 'info@clpropetservices.com';

/* ============================================================
   PHONE NOTIFICATIONS.

   A real notification from an app on your phone, the moment a lead
   lands - not an email you have to go and look at.

   Pick ONE and fill it in. Both are set up on the phone, not here.

   ntfy  - free, no account, open source. Install "ntfy" from the App
           Store or Play Store, tap +, and subscribe to a topic. The
           topic name IS the password, so use the long random one below
           and do not share it - anybody who knows it can read your
           notifications. Then paste the same topic here.

   Pushover - $5 once per phone, more polished, has a proper account.
           Install Pushover, register, and it shows you a user key.
           Create an application on pushover.net for the API token.

   Leave both blank and nothing is sent; the emails carry on as normal.
   ============================================================ */
/* Push notifications go through ntfy.sh, which is free and needs no account:
   the phone's ntfy app subscribes to a topic name, and anything posted to
   that name arrives as a notification. The topic name is the only secret -
   whoever knows it can read the leads - so it lives in a script property,
   never in this file. Run setupPush() once: it makes a random topic, stores
   it and prints it in the execution log; type that into the ntfy app on
   each phone. */
var PUSH_NTFY_TOPIC    = '';   // left blank on purpose: see setupPush()
function pushTopic_() {
  try { var t = PropertiesService.getScriptProperties().getProperty('NTFY_TOPIC'); if (t) return t; } catch (e) {}
  return PUSH_NTFY_TOPIC;
}
function setupPush() {
  var topic = 'clpps-' + Utilities.getUuid().replace(/-/g, '').slice(0, 16);
  PropertiesService.getScriptProperties().setProperty('NTFY_TOPIC', topic);
  Logger.log('PUSH TOPIC (subscribe to this in the ntfy app on each phone): ' + topic);
  try {
    UrlFetchApp.fetch('https://ntfy.sh/' + encodeURIComponent(topic), { method: 'post', contentType: 'text/plain; charset=utf-8',
      payload: 'Push is on. New leads will arrive here, with one tap to the tracker.', headers: { 'Title': 'CLPPS Lead Tracker', 'Tags': 'white_check_mark' }, muteHttpExceptions: true });
  } catch (e) {}
  return topic;
}
var PUSH_OVER_USER     = '';   // Pushover user key
var PUSH_OVER_TOKEN    = '';   // Pushover application token
var PUSH_TRACKER_URL   = 'https://www.clpropetservices.com/hq-8k3v51/';

/* One line for the lock screen. It has to be readable without opening
   anything, because that is the whole point of a notification. */
function pushTitle_(l) {
  var t = String(l.type || ''), who = l.name || 'Someone';
  var price = l.price ? String(l.price).split(',')[0] : '';
  if (t === 'ACTIVATE')   return '\ud83d\udd25 ' + who + ' wants to start' + (price ? ' \u2014 ' + price : '');
  if (t === 'ENQUIRY')    return '\ud83d\udcdd ' + who + ' asked for a quote' + (price ? ' \u2014 ' + price : '');
  if (t === 'DECLINED')   return '\ud83d\udc4e ' + who + ' said no' + (price ? ' to ' + price : '');
  if (t === 'COMMERCIAL') return '\ud83c\udfe2 Commercial enquiry: ' + who;
  if (t === 'WAITLIST')   return '\ud83d\udccd Out of area: ' + who;
  if (t === 'AUTH')       return '\u2705 ' + who + ' authorized their quote';
  return '\ud83d\udc3e New lead: ' + who;
}
function pushBody_(l) {
  var bits = [];
  if (l.phone) bits.push(l.phone);
  if (l.zip) bits.push(l.zip);
  if (l.dogs) bits.push(l.dogs + (String(l.dogs) === '1' ? ' dog' : ' dogs'));
  if (l.service) bits.push(l.service);
  return bits.join(' \u00b7 ') || 'Open the tracker for the details.';
}

/* Never let a notification problem stop a lead being saved. Every call is
   muted and wrapped - if the phone service is down, the row is still in
   the sheet and the email still goes. */
function pushLead_(l) {
  var t = String(l.type || '');
  if (t === 'VIEW' || t === 'QVIEW' || t === 'OUTAREA' || t === 'CONFIG' ||
      t === 'SPEND' || l.silent) return;
  var title = pushTitle_(l), body = pushBody_(l);
  // an activation is worth waking somebody up for; a refusal is not
  var urgent = (t === 'ACTIVATE' || t === 'AUTH');

  var topic = pushTopic_();
  if (topic) {
    try {
      UrlFetchApp.fetch('https://ntfy.sh/' + encodeURIComponent(topic), {
        method: 'post',
        contentType: 'text/plain; charset=utf-8',
        payload: body,
        headers: {
          'Title': title,
          'Priority': urgent ? 'high' : 'default',
          'Tags': urgent ? 'fire' : 'paw_prints',
          'Click': PUSH_TRACKER_URL
        },
        muteHttpExceptions: true
      });
    } catch (e) {}
  }

  if (PUSH_OVER_USER && PUSH_OVER_TOKEN) {
    try {
      UrlFetchApp.fetch('https://api.pushover.net/1/messages.json', {
        method: 'post',
        payload: {
          token: PUSH_OVER_TOKEN, user: PUSH_OVER_USER,
          title: title, message: body,
          url: PUSH_TRACKER_URL, url_title: 'Open the lead tracker',
          priority: urgent ? '1' : '0'
        },
        muteHttpExceptions: true
      });
    } catch (e) {}
  }
}

function notifyLead_(l) {
  var t = String(l.type || '');
  // Analytics pings, no email. OUTAREA fires every time somebody types a ZIP
  // we do not cover, so mailing it would bury the real leads.
  if (t === 'VIEW' || t === 'QVIEW' || t === 'OUTAREA') return;
  // A re-write of a row we have already been told about: somebody changing
  // their answers before accepting, or an edit saved in the tracker. The row
  // still has to be written so the sheet stays current, but mailing it again
  // means one undecided customer fills the inbox on their own.
  if (l.silent) return;
  // Belt and braces: whatever asked for this email, the same lead's same
  // kind of email goes out at most once every six hours. A customer who
  // reloads the quote page four times is one lead, not four.
  try {
    var cache = CacheService.getScriptCache(), nk = 'ntf_' + String(l.id || '') + '_' + t;
    if (l.id && cache.get(nk)) return;
    if (l.id) cache.put(nk, '1', 6 * 3600);
    // and never more than sixty lead emails in an hour, whoever is posting:
    // past that it is a flood, and the daily mail quota is what keeps the
    // real ones arriving
    var hk = 'ntf_h' + Math.floor(Date.now() / 3600000), hn = parseInt(cache.get(hk) || '0', 10) + 1;
    cache.put(hk, String(hn), 7200);
    if (hn > 60) return;
  } catch (e) {}
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
  // where they came from, so the inbox alone says whether the ads are working
  var srcM = String(l.crmnotes || '').match(/\[SRC:([^\]]*)\]/);
  if (srcM && srcM[1]) lines.push('How they found us: ' + srcM[1]);
  lines.push('');
  lines.push('Lead tracker: https://www.clpropetservices.com/hq-8k3v51/');
  // The email goes out from the account the script runs under, which is a
  // personal Gmail. The sender NAME is ours to set, so the inbox reads
  // "CLPPS Lead Tracker" rather than somebody's address, and Reply goes to
  // the customer.
  var mail = { to: NOTIFY_TO, cc: NOTIFY_CC, subject: subject, body: lines.join('\n'), name: 'CLPPS Lead Tracker' };
  if (l.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(l.email))) mail.replyTo = String(l.email);
  MailApp.sendEmail(mail);
}

/* The newest row the sheet holds for an id, as an object, or null. Newest
   by created; on a tie the row lower down the sheet (appended later). */
function latestRow_(sh, id) {
  if (!id) return null;
  var rows = sh.getDataRange().getValues();
  var iId = HEADERS.indexOf('id'), iC = HEADERS.indexOf('created');
  var best = null, bestKey = '';
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][iId]) !== String(id)) continue;
    var key = String(rows[i][iC] || '');
    if (!best || key >= bestKey) { best = rows[i]; bestKey = key; }
  }
  if (!best) return null;
  var o = {};
  for (var j = 0; j < HEADERS.length; j++) o[HEADERS[j]] = best[j];
  return o;
}

/* The notes column carries markers like [FU:date] [ATT:2@date] and then free
   text. Some the SITE owns and rewrites every time (where they came from,
   their answer); the rest the OFFICE wrote (follow-up date, attempts, close
   date, notes) and a fresh row from the site must not lose them. */
function mergeNotes_(fresh, old) {
  fresh = String(fresh || ''); old = String(old || '');
  if (!old) return fresh;
  var SITE = { SID:1, SRC:1, QA:1, IC:1, MR:1, TM:1 };
  var re = /^\[([A-Z0-9]+):([^\]]*)\]\s*/;
  var parse = function(s){ var ms = [], hit; while ((hit = s.match(re))) { ms.push([hit[1], hit[2]]); s = s.slice(hit[0].length); } return { markers: ms, text: s }; };
  var f = parse(fresh), o = parse(old);
  var have = {}; f.markers.forEach(function(m){ have[m[0]] = 1; });
  var carried = o.markers.filter(function(m){ return !SITE[m[0]] && !have[m[0]]; });
  var text = f.text && o.text && f.text !== o.text ? f.text + ' | ' + o.text : (f.text || o.text || '');
  return f.markers.concat(carried).map(function(m){ return '[' + m[0] + ':' + m[1] + '] '; }).join('') + text;
}

/* Google Sheets treats a cell starting with =, +, - or @ as a FORMULA.
   A customer typing their number as +16365550143 - which phones offer as
   the standard international format - made Sheets try to evaluate it and
   store #ERROR! instead. The number was simply gone, on a live lead, and
   nothing anywhere said so.

   A leading apostrophe forces Sheets to treat the cell as text. It is not
   part of the value: getValues() reads it back without, so the tracker and
   the CSV see exactly what the customer typed. */
function safeCell_(v) {
  var s = v == null ? '' : String(v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

/* OPTIONAL, run by hand once. safeCell_ protects every lead from here on,
   but the sheet that already exists was created before any of this and is
   still on default formatting. Open the script editor, pick this function
   from the drop-down and press Run, and the whole sheet is set to plain
   text - after which even a cell written by hand cannot turn into a
   formula. It changes no data, only formatting. Nothing breaks if it is
   never run; it just means the apostrophe is doing all the work. */
function fixSheetFormatting() {
  var sh = sheet_();
  sh.getRange(1, 1, sh.getMaxRows(), HEADERS.length).setNumberFormat('@');
  var broken = [], data = sh.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    for (var c = 0; c < HEADERS.length; c++) {
      if (/^#(ERROR|REF|VALUE|NAME|N\/A|DIV\/0|NUM|NULL)/i.test(String(data[r][c]))) {
        broken.push('row ' + (r + 1) + ', ' + HEADERS[c]);
      }
    }
  }
  // Deliberately NOT cleared. A blank looks like "they never gave us one";
  // #ERROR! is at least honest, and the tracker now explains it.
  Logger.log(broken.length
    ? 'Sheet set to text. Still damaged from before: ' + broken.join('; ')
    : 'Sheet set to text. No damaged cells found.');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
   THE GOOGLE RATING ON THE WEBSITE.

   Every page shows "5.0 · N reviews". That used to be typed into sixteen
   files and drifted from the real number. Now the pages ask here, and this
   returns whatever is in the two CONFIG rows review_rating / review_count.

   Those rows are set either by hand in the tracker (Reviews → ⚙ Link), or
   automatically by refreshReviews() below if a Google Places key is
   pasted in. The key is never sent to the website - only the numbers are.
   The response is cached for an hour so a busy day on the site is not a
   busy day on the spreadsheet.
   ============================================================ */
var PLACES_API_KEY = '';   // Google Cloud → APIs → Places API (New or Legacy). Restrict it to the Places API only.
var PLACE_ID       = '';   // the business's Place ID: https://developers.google.com/maps/documentation/places/web-service/place-id

function publicStats_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('public_stats');
  if (hit) return JSON.parse(hit);
  var rows = sheet_().getDataRange().getValues();
  var iType = HEADERS.indexOf('type'), iName = HEADERS.indexOf('name'), iNotes = HEADERS.indexOf('notes'), iCreated = HEADERS.indexOf('created');
  var best = {};
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][iType]) !== 'CONFIG') continue;
    var n = String(rows[i][iName] || '');
    if (n !== 'review_rating' && n !== 'review_count' && n !== 'deo_season') continue;
    var when = String(rows[i][iCreated] || '');
    if (!best[n] || when > best[n].when) best[n] = { when: when, value: String(rows[i][iNotes] == null ? '' : rows[i][iNotes]) };
  }
  var rating = best.review_rating ? parseFloat(best.review_rating.value) : NaN;
  var count  = best.review_count  ? parseInt(best.review_count.value, 10) : NaN;
  // Always ok: the deodorize season switch rides along even when the review
  // figures were never set, and the site checks each field for itself.
  var deo = best.deo_season ? String(best.deo_season.value).toLowerCase() : '';
  var out = { ok: true,
              rating: (rating >= 1 && rating <= 5 && count >= 1) ? Math.round(rating * 10) / 10 : null,
              count: (rating >= 1 && rating <= 5 && count >= 1) ? count : null,
              deo: (deo === 'on' || deo === 'off') ? deo : '',
              updated: (best.review_count || {}).when || '' };
  cache.put('public_stats', JSON.stringify(out), 3600);
  return out;
}

/* OPTIONAL. Reads the live rating and count from Google and stores them.
   To turn on: fill in PLACES_API_KEY and PLACE_ID above, then in the left
   sidebar click Triggers (clock icon) → Add Trigger → refreshReviews →
   time-driven → day timer → pick an hour → Save. A Place Details call with
   only these two fields is in Google's free monthly allowance many times
   over at once a day. Leave the key blank and nothing is fetched; the
   numbers come from the tracker instead. */
/* The Places key and the Place ID live in Script Properties (PLACES_KEY,
   PLACE_ID); the two variables above are only a fallback. Run
   setupReviews() once and the count refreshes every Monday on its own. */
function placesKey_() { try { return PropertiesService.getScriptProperties().getProperty('PLACES_KEY') || PLACES_API_KEY; } catch (e) { return PLACES_API_KEY; } }
function placeId_() { try { return PropertiesService.getScriptProperties().getProperty('PLACE_ID') || PLACE_ID; } catch (e) { return PLACE_ID; } }
function setupReviews() {
  if (!placesKey_() || !placeId_()) throw new Error('Add PLACES_KEY and PLACE_ID under Project Settings > Script Properties first');
  ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'refreshReviews') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('refreshReviews').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(6).create();
  refreshReviews();
}
function refreshReviews() {
  if (!placesKey_() || !placeId_()) { Logger.log('No Places key or Place ID set; nothing fetched.'); return; }
  var url = 'https://maps.googleapis.com/maps/api/place/details/json?place_id=' + encodeURIComponent(placeId_()) +
            '&fields=rating,user_ratings_total&key=' + encodeURIComponent(placesKey_());
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var d = JSON.parse(res.getContentText() || '{}');
  var r = d && d.result;
  if (!r || !(r.rating >= 1) || !(r.user_ratings_total >= 1)) { Logger.log('Google did not return a rating: ' + res.getContentText().slice(0, 200)); return; }
  var sh = sheet_(), now = new Date().toISOString();
  [['review_rating', String(r.rating)], ['review_count', String(r.user_ratings_total)]].forEach(function(pair) {
    sh.appendRow(HEADERS.map(function(h) {
      if (h === 'id') return 'cfg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      if (h === 'created' || h === 'updated') return now;
      if (h === 'type') return 'CONFIG';
      if (h === 'name') return pair[0];
      if (h === 'notes') return safeCell_(pair[1]);
      if (h === 'status') return 'config';
      return '';
    }));
  });
  CacheService.getScriptCache().remove('public_stats');
  Logger.log('Stored ' + r.rating + ' / ' + r.user_ratings_total + ' reviews.');
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  // Public on purpose: it is the number already printed on the website.
  if (p.action === 'public') return json_(publicStats_());
  if (p.action === 'list') return list_(p);
  return json_({ok:true, service:'CLPPS lead tracker'});
}

/* The lead list. Reached by POST from the tracker (the key stays out of
   the address bar and the logs) and by GET for older pages. */
function list_(p) {
  {
    if (p.key !== pin_()) return json_({ok:false, error:'bad pin'});
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
}

function doPost(e) {
  var body;
  // Sweep&Go's webhook: the secret word in the address is the whole handshake
  var qp = (e && e.parameter) || {};
  if (qp.hook) return json_(sgHook_(qp.hook, e));
  if (!e || !e.postData || e.postData.length > MAX_POST_BYTES) return json_({ok:false, error:'too big'});
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ok:false}); }
  if (body.action === 'list') return list_({ key: body.key, days: body.days });
  if (body.action === 'billing') {
    if (body.key !== pin_()) return json_({ok:false, error:'bad pin'});
    return json_(sgBilling_());
  }
  if (body.action === 'jobs') {
    if (body.key !== pin_()) return json_({ok:false, error:'bad pin'});
    return json_(sgJobs_());
  }
  if (body.action === 'sgcreate') {
    if (body.key !== pin_()) return json_({ok:false, error:'bad pin'});
    try { return json_(sgCreate_(String(body.id || ''), !!body.force)); } catch (e3) { return json_({ok:false, reason:'error', error:String(e3 && e3.message || e3).slice(0, 200)}); }
  }
  if (body.action === 'sgsync') {
    if (body.key !== pin_()) return json_({ok:false, error:'bad pin'});
    try { return json_(sgSync()); } catch (e2) { return json_({ok:false, error:String(e2 && e2.message || e2).slice(0, 200)}); }
  }

  if (body.action === 'lead' && body.lead) {
    var l = body.lead;
    if (typeof l !== 'object') return json_({ok:false});
    if (floodGate_()) return json_({ok:false, error:'busy'});
    var sh = sheet_();
    // Anyone can post a lead - the public quote form does - so what an
    // unsigned post may say is limited. Only the tracker, which signs with
    // the key, can write settings and spend, set a status, or back-date.
    var trusted = !!body.key && body.key === pin_();
    var t0 = String(l.type || '');
    if (!trusted) {
      if (t0 === 'CONFIG' || t0 === 'SPEND') return json_({ok:false, error:'bad pin'});
      delete l.status;
      var when0 = new Date(l.created || '');
      if (isNaN(when0.getTime()) || when0.getTime() > Date.now() + 600000) l.created = new Date().toISOString();
    }
    if (l.id != null && !/^[A-Za-z0-9_-]{1,64}$/.test(String(l.id))) return json_({ok:false, error:'bad id'});
    // The site keys a lead on the phone number, so one person is one card.
    // But a closed customer asking again months later, or somebody new on
    // the same number, is a new lead, not a rewrite of the old one.
    if (!trusted && /^p\d{10}$/.test(String(l.id || ''))) {
      var prior = latestRow_(sh, l.id);
      if (prior && (prior.status === 'closed' || prior.status === 'cancelled' ||
                    Date.now() - new Date(prior.created).getTime() > 180 * 86400000)) {
        l.id = l.id + '-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMM');
      }
    }
    // nothing longer than a sheet cell needs to be; a 10,000-character "name"
    // is somebody's script, not somebody's name
    HEADERS.forEach(function(h){ if (l[h] != null) l[h] = clip_(l[h], h === 'crmnotes' || h === 'notes' ? 4000 : 400); });
    // A row for this id already? The site writes the same person again when
    // they answer, change their mind, or reload; the tracker writes again on
    // an edit. The new row must not wipe out what the office has done on the
    // old one, and the same thing again inside a day is not news.
    var prev = latestRow_(sh, l.id);
    if (prev) {
      l.crmnotes = mergeNotes_(l.crmnotes, prev.crmnotes);
      if ((!l.status || l.status === 'new') &&
          (prev.status === 'called' || prev.status === 'closed' || prev.status === 'cancelled')) l.status = prev.status;
      if (!l.silent && String(prev.type) === String(l.type) &&
          Date.now() - new Date(prev.created).getTime() < 86400000) l.silent = 1;
    }
    sh.appendRow(HEADERS.map(function(h){
      if (h === 'status') return (h === 'status' && l.status) ? String(l.status) : 'new';
      if (h === 'crmnotes') return safeCell_(l.crmnotes != null ? l.crmnotes : '');
      if (h === 'updated') return new Date().toISOString();
      // a row with no timestamp could never be the newest of its kind
      if (h === 'created' && !l.created) return new Date().toISOString();
      return safeCell_(l[h]);
    }));
    try { notifyLead_(l); } catch (e) {}
    try { pushLead_(l); } catch (e) {}
    if (String(l.type) === 'CONFIG') { try { CacheService.getScriptCache().remove('public_stats'); } catch (e) {} }
    // an acceptance, and the office has switched on automatic sign-up:
    // put them in Sweep&Go now, if Sweep&Go's own price agrees with the quote
    if ((t0 === 'ACTIVATE' || t0 === 'AUTH') && cfg_('sg_auto_create') === 'on') {
      try { sgCreate_(t0 === 'AUTH' ? String(l.zip || '') : String(l.id || ''), false); } catch (e4) {}
    }
    return json_({ok:true});
  }

  if (body.action === 'quota') {
    if (body.key !== pin_()) return json_({ok:false, error:'bad pin'});
    var q = 0; try { q = MailApp.getRemainingDailyQuota(); } catch (e) {}
    return json_({ok:true, remaining:q});
  }
  if (body.action === 'blast') {
    if (body.key !== pin_()) return json_({ok:false, error:'bad pin'});
    return json_(blast_(body));
  }
  if (body.action === 'update') {
    if (body.key !== pin_()) return json_({ok:false, error:'bad pin'});
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
        if (body.notes  != null) sh2.getRange(i+1, HEADERS.indexOf('crmnotes')+1).setValue(safeCell_(body.notes));
        sh2.getRange(i+1, HEADERS.indexOf('updated')+1).setValue(new Date().toISOString());
        hit++;
      }
    }
    if (hit) return json_({ok:true, rowsUpdated:hit});
    return json_({ok:false, error:'not found'});
  }

  return json_({ok:false});
}

/* ======================================================================
   SWEEP&GO. Jesse: "Set up everything you can, make it work for me."
   The Open API (https://openapi.sweepandgo.com/docs/) gives everything the
   CSV uploads gave and more: every client with their service day, every
   subscription with its price, every invoice and payment, the dispatch
   board with map coordinates, and Sweep&Go's own route report. The token
   and the webhook secret live in Script Properties (SG_TOKEN, SG_HOOK),
   never in this file. Run setupSweepAndGo() once: it checks the token,
   does the first sync and schedules one every night at 4am.

   What a sync does:
     1. clients (active + inactive) -> customer rows in the lead sheet
        (status Active or Account closed, service day, source, phone,
        email, address), matched by phone, then email, then name; office
        notes are kept, the markers Sweep&Go owns are replaced.
     2. subscriptions -> the monthly price, dogs, plan, start/close dates
        and the reason they left.
     3. dispatch board for the next seven days -> [LL:lat,lng] on each
        customer, so the map and routes use Sweep&Go's own pins.
     4. invoices + payments -> the 'billing' sheet, which the tracker reads
        as billed / collected / unpaid by month.
     5. route planning report for today and tomorrow -> a CONFIG row the
        Day plan shows beside its own estimate.
   The webhook does not carry data we trust blindly: any client or
   subscription event just asks for a sync, at most once every ten
   minutes, so the tracker follows Sweep&Go within minutes of a change.
   ====================================================================== */
var SG_BASE = 'https://openapi.sweepandgo.com';
function sgToken_() { try { return PropertiesService.getScriptProperties().getProperty('SG_TOKEN') || ''; } catch (e) { return ''; } }
function sgHookWord_() { try { return PropertiesService.getScriptProperties().getProperty('SG_HOOK') || ''; } catch (e) { return ''; } }
function sgFetch_(path, method, payload) {
  var token = sgToken_(); if (!token) throw new Error('SG_TOKEN is not set (Project Settings > Script Properties)');
  var opts = { method: method || 'get', headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' }, muteHttpExceptions: true };
  if (payload) { opts.contentType = 'application/json'; opts.payload = JSON.stringify(payload); }
  var r = UrlFetchApp.fetch(SG_BASE + path, opts), code = r.getResponseCode();
  if (code >= 400) throw new Error('Sweep&Go ' + code + ' on ' + path + ': ' + r.getContentText().slice(0, 120));
  return JSON.parse(r.getContentText() || '{}');
}
/* Walks every page of a paginated list. Two shapes exist: {data, paginate}
   and {invoices|payments|subscriptions: {data, last_page}}. */
function sgAll_(path, key, maxPages) {
  var out = [], page = 1, pages = 1;
  do {
    var d = sgFetch_(path + (path.indexOf('?') >= 0 ? '&' : '?') + 'page=' + page + '&length=100');
    var box = key && d[key] ? d[key] : d;
    (box.data || []).forEach(function(x) { out.push(x); });
    pages = box.paginate ? (box.paginate.total_pages || 1) : (box.last_page || 1);
    page++;
  } while (page <= pages && page <= (maxPages || 40));
  return out;
}
function sgDigits_(p) { var d = String(p || '').replace(/\D/g, ''); return d.length >= 10 ? d.slice(-10) : ''; }
function sgNorm_(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
/* Sweep&Go's frequency words -> the tracker's plan words. */
function sgPlan_(f) {
  var x = String(f || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/twotimes|2xw|twice/.test(x)) return 'twice a week';
  if (/biweek|everyother|bw$|2w/.test(x) && !/2xw/.test(x)) return 'every other week';
  if (/onceamonth|monthly|1xm/.test(x)) return 'monthly';
  if (/onceaweek|weekly|1xw/.test(x)) return 'weekly';
  if (/onetime|once$/.test(x)) return 'one-time';
  return '';
}
function sgVisitsPerMonth_(plan) { return plan === 'twice a week' ? 8.67 : plan === 'every other week' ? 2.17 : plan === 'monthly' ? 1 : 4.33; }
/* A subscription's price as dollars a month. Monthly billing is the price;
   other intervals are multiplied up by how often they bill. */
function sgMonthly_(sub, plan) {
  var p = parseFloat(sub.price) || 0, bi = String(sub.billing_interval || 'monthly').toLowerCase();
  if (bi === 'monthly' || bi === 'month') return p;
  if (bi === 'weekly' || bi === 'week') return p * 4.33;
  if (bi === 'biweekly' || bi === 'bi_weekly' || bi === 'two_weeks') return p * 2.17;
  if (bi === 'yearly' || bi === 'annual') return p / 12;
  return p * sgVisitsPerMonth_(plan);   // per cleanup / daily: one charge a visit
}
function sgDayKeys_(days) {
  var seen = {}, order = ['mon','tue','wed','thu','fri','sat','sun'];
  return String(days || '').split(/[,;&\/ ]+/).map(function(x) { return x.trim().slice(0, 3).toLowerCase(); })
    .filter(function(k) { if (order.indexOf(k) < 0 || seen[k]) return false; seen[k] = 1; return true; })
    .sort(function(a, b) { return order.indexOf(a) - order.indexOf(b); }).join(',');
}
var SG_REASONS = { price: 'price', cost: 'price', expensive: 'price', moved: 'moved', moving: 'moved', relocat: 'moved', dog: 'nodog', pet: 'nodog', passed: 'nodog', service: 'service', quality: 'service', unhappy: 'service', pay: 'nonpay', nonpay: 'nonpay', season: 'season', winter: 'season', self: 'diy', myself: 'diy', themselves: 'diy' };
function sgReason_(t) { var x = String(t || '').toLowerCase(); for (var k in SG_REASONS) if (x.indexOf(k) >= 0) return SG_REASONS[k]; return x ? 'other' : ''; }
/* Replace the markers Sweep&Go owns in a notes string, keep everything else. */
function sgSetMarkers_(notes, set) {
  var s = String(notes || '');
  Object.keys(set).forEach(function(k) {
    s = s.replace(new RegExp('\\[' + k + ':[^\\]]*\\]\\s*', 'g'), '');
    if (set[k] !== '' && set[k] != null) s = '[' + k + ':' + String(set[k]).replace(/[\[\]]/g, '') + '] ' + s;
  });
  return s;
}
/* The same notes, whatever order the markers sit in. */
function sgNotesEqual_(a, b) {
  var split = function(x) { var m = String(x || '').match(/\[[A-Z0-9]+:[^\]]*\]/g) || []; var rest = String(x || '').replace(/\[[A-Z0-9]+:[^\]]*\]\s*/g, '').trim(); return m.sort().join(' ') + '|' + rest; };
  return split(a) === split(b);
}
function sgSource_(c) {
  var t = String(c.tracking_field || '');
  var m = t.match(/utm_source=([^&\s]+)/i);
  if (m) { var u = m[1].toLowerCase(); if (/facebook|meta|instagram|fb/.test(u)) return 'Meta Ads'; if (/google/.test(u)) return 'Google Ads'; if (/yardsign/.test(u)) return 'Yard sign'; return m[1]; }
  var h = String(c.how_heard_answer || c.how_heard_about_us || '').toLowerCase();
  if (!h) return '';
  if (/facebook|instagram|meta/.test(h)) return 'Meta (organic)';
  if (/google/.test(h)) return 'Google (organic)';
  if (/refer|friend|neighbor|word/.test(h)) return 'Referral';
  if (/nextdoor/.test(h)) return 'Nextdoor';
  if (/sign|truck|flyer/.test(h)) return 'Yard sign';
  return String(c.how_heard_answer || c.how_heard_about_us).slice(0, 30);
}
/* The sync. Returns a summary the tracker can show. */
/* Run from the editor before the first real sync: the same work, nothing
   written. The log says what it would add, update and pin, and who it
   could not match to a subscription. */
function sgPreview() {
  var s = sgSync(true);
  Logger.log(JSON.stringify(s, null, 1));
  return s;
}
function sgSync(dry) {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(5000)) return { ok:false, error:'busy' };
  var summary = { ok:true, dry: !!dry, started: new Date().toISOString(), clients: 0, added: 0, updated: 0, skippedNeverStarted: 0, noSubscription: [], subs: 0, pinned: 0, invoices: 0, payments: 0, routes: 0, errors: [], addedNames: [], updatedNames: [] };
  try {
    var sh = sheet_(), data = sh.getDataRange().getValues();
    var iId = HEADERS.indexOf('id'), iC = HEADERS.indexOf('created');
    // newest row per id, plus lookups by phone, email and name
    var latest = {}, byPhone = {}, byMail = {}, byName = {};
    for (var i = 1; i < data.length; i++) {
      var id = String(data[i][iId]), key = String(data[i][iC] || '');
      if (!latest[id] || key >= latest[id].key) latest[id] = { row: i, key: key };
    }
    Object.keys(latest).forEach(function(id) {
      var r = data[latest[id].row], o = {}; for (var j = 0; j < HEADERS.length; j++) o[HEADERS[j]] = r[j];
      if (o.status === 'deleted' || /^(VIEW|QVIEW|OUTAREA|CONFIG|SPEND|AUTH|WAITLIST)$/.test(String(o.type))) return;
      var d = sgDigits_(o.phone); if (d && !byPhone[d]) byPhone[d] = id;
      var e = String(o.email || '').trim().toLowerCase(); if (e && !byMail[e]) byMail[e] = id;
      var n = sgNorm_(o.name); if (n && !byName[n]) byName[n] = id;
    });
    // ---- subscriptions first: price, dogs, plan, dates, by client email/name ----
    var subs = [];
    try { subs = sgAll_('/api/v2/subscriptions', 'subscriptions'); summary.subs = subs.length; } catch (e1) { summary.errors.push('subscriptions: ' + e1.message); }
    var subBy = {};   // key -> { plan, monthly, deo, dogs, start, end, reason, status, active }
    subs.forEach(function(s) {
      var k = String(s.client_email || '').trim().toLowerCase() || 'n:' + sgNorm_(s.client_name);
      var b = subBy[k] || (subBy[k] = { plan: '', monthly: 0, deo: 0, dogs: '', start: '', end: '', reason: '', comment: '', active: false, paused: false, anyStart: '' });
      var active = /^(active|paused)$/i.test(String(s.status || ''));
      var isDeo = /deodor|sanit/i.test(String(s.name || '') + ' ' + String(s.pricing_plan || '') + ' ' + String(s.service_plan || ''));
      var plan = sgPlan_(s.frequency || s.service_plan);
      if (isDeo) { if (active) b.deo += sgMonthly_(s, plan || b.plan || 'weekly'); return; }
      if (!b.anyStart || (s.start_date && s.start_date < b.anyStart)) b.anyStart = s.start_date || b.anyStart;
      if (active || !b.active) {
        if (active) { b.active = true; b.paused = /paused/i.test(String(s.status)); if (b.paused || s.pause_start_date) b.pause = String(s.pause_start_date || '').slice(0, 10) + '~' + String(s.pause_end_date || '').slice(0, 10); }
        b.plan = plan || b.plan; b.monthly = sgMonthly_(s, plan); b.dogs = String(s.number_of_dogs || b.dogs || '');
        b.start = s.start_date || b.start; b.end = s.canceled_at ? String(s.canceled_at).slice(0, 10) : (s.end_date || ''); b.reason = s.termination_reason || ''; b.comment = s.termination_comment || '';
      }
    });
    // ---- clients ----
    var clients = [];
    try { clients = sgAll_('/api/v1/clients/active').concat(sgAll_('/api/v1/clients/inactive')); } catch (e2) { summary.errors.push('clients: ' + e2.message); }
    summary.clients = clients.length;
    var today = new Date().toISOString().slice(0, 10), appended = [];
    clients.forEach(function(c) {
      var phone = sgDigits_(c.cell_phone) || sgDigits_(c.home_phone), email = String(c.email || '').trim().toLowerCase();
      var name = (String(c.first_name || '') + ' ' + String(c.last_name || '')).trim();
      var id = (phone && byPhone[phone]) || (email && byMail[email]) || byName[sgNorm_(name)] || (phone ? 'p' + phone : 'sg' + String(c.client || sgNorm_(name)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20));
      var sub = subBy[email] || subBy['n:' + sgNorm_(name)] || null;
      var active = String(c.status || '').toLowerCase() === 'active' && !c.one_time_client;
      var status = active ? 'closed' : 'cancelled';
      // somebody inactive who never had a plan is not a former customer
      if (!active && !sub && !latest[id]) { summary.skippedNeverStarted++; return; }
      if (active && !sub && summary.noSubscription.length < 30) summary.noSubscription.push(name);
      var plan = (sub && sub.plan) || sgPlan_(c.cleanup_frequency) || '';
      var total = sub ? Math.round(sub.monthly + sub.deo) : 0;
      var price = total ? '$' + total + '/mo' + (sub.deo ? ' (includes $' + Math.round(sub.deo) + ' deodorize)' : '') : '';
      var set = { DAY: sgDayKeys_(c.service_days), CD: (sub && (sub.start || sub.anyStart)) || '', SGID: String(c.client || ''), PZ: (sub && sub.paused && sub.pause) ? sub.pause : '' };
      // a quoted price still waiting to be set in Sweep&Go: clear the reminder once their price matches
      var qpRow = latest[id] && latest[id].row >= 0 ? String(data[latest[id].row][HEADERS.indexOf('crmnotes')] || '').match(/\[QP:(\d+(?:\.\d+)?)\]/) : null;
      if (qpRow && sub && Math.abs(sub.monthly - parseFloat(qpRow[1])) <= 1) set.QP = '';
      // Sweep&Go's marketing opt-out is the law of the land for the email blast
      if (c.marketing_allowed === 0 || c.marketing_allowed === '0' || c.marketing_allowed === false) set.NOEM = '1';
      if (!active) { set.CX = (sub && sub.end) || ''; set.CXR = sgReason_(sub && (sub.reason + ' ' + sub.comment)); } else { set.CX = ''; set.CXR = ''; }
      var src = sgSource_(c);
      var existing = latest[id] ? latest[id].row : -1;
      if (existing === -2) return;   // already appended this run (the same person twice in Sweep&Go)
      if (existing >= 0) {
        var row = data[existing], oldNotes = String(row[HEADERS.indexOf('crmnotes')] || ''), oldStatus = String(row[HEADERS.indexOf('status')] || '');
        if (src && oldNotes.indexOf('[SRC:') < 0) set.SRC = src;
        var notes = sgSetMarkers_(oldNotes, set);
        var changes = { status: status, crmnotes: notes };
        if (price) changes.price = price;
        if (plan) changes.service = plan;
        if (sub && sub.dogs) changes.dogs = sub.dogs;
        if (c.address && !row[HEADERS.indexOf('address')]) changes.address = String(c.address) + (c.zip_code ? ', ' + c.zip_code : '');
        if (c.zip_code && !row[HEADERS.indexOf('zip')]) changes.zip = String(c.zip_code);
        if (phone && !row[HEADERS.indexOf('phone')]) changes.phone = phone;
        if (email && !row[HEADERS.indexOf('email')]) changes.email = email;
        if (sub && sub.deo) changes.deodorize = 'every visit ($15/treatment)';
        // a customer the office marked Not interested or deleted is left alone
        if (oldStatus === 'deleted' || oldStatus === 'lost') return;
        var touched = false, newRow = row.slice();
        Object.keys(changes).forEach(function(h) {
          var col = HEADERS.indexOf(h); if (col < 0) return;
          if (h === 'crmnotes' ? sgNotesEqual_(row[col], changes[h]) : String(row[col] || '') === String(changes[h])) return;
          newRow[col] = safeCell_(changes[h]); touched = true;
        });
        if (touched) {
          newRow[HEADERS.indexOf('updated')] = new Date().toISOString();
          if (!dry) sh.getRange(existing + 1, 1, 1, HEADERS.length).setValues([newRow]);
          data[existing] = newRow; summary.updated++; if (summary.updatedNames.length < 40) summary.updatedNames.push(name);
        }
      } else {
        if (src) set.SRC = src;
        var notes2 = sgSetMarkers_('[IC:w] [QA:a] Synced from Sweep&Go ' + today + '.', set);
        var l = { id: id, created: (sub && (sub.start || sub.anyStart) ? (sub.start || sub.anyStart) + 'T12:00:00.000Z' : new Date().toISOString()), type: 'SAVED', name: name, phone: phone, email: email,
                  address: String(c.address || '') + (c.zip_code ? ', ' + c.zip_code : ''), zip: String(c.zip_code || ''), service: plan, dogs: sub ? sub.dogs : '', yard: '',
                  deodorize: sub && sub.deo ? 'every visit ($15/treatment)' : 'no', hero: '', price: price, manual: '', honored: '', notes: '', status: status, crmnotes: notes2, updated: new Date().toISOString() };
        appended.push(HEADERS.map(function(h) { return safeCell_(l[h] == null ? '' : l[h]); }));
        latest[id] = { row: -2, key: l.created }; summary.added++; if (summary.addedNames.length < 40) summary.addedNames.push(name);
      }
    });
    if (appended.length && !dry) sh.getRange(sh.getLastRow() + 1, 1, appended.length, HEADERS.length).setValues(appended);
    // ---- dispatch board: Sweep&Go's own pins for the next seven days ----
    try {
      var pins = {}, dayMs = 86400000;
      for (var k = 0; k < 7; k++) {
        var dt = new Date(Date.now() + k * dayMs).toISOString().slice(0, 10);
        var jobs = sgFetch_('/api/v1/dispatch_board/jobs_for_date?date=' + dt);
        (jobs.data || []).forEach(function(j) {
          if (!j.full_name) return;
          var em = String(j.estimate_time || '').match(/^(\d+):(\d+)/), est = em ? parseInt(em[1], 10) * 60 + parseInt(em[2], 10) : 0;
          var cur = pins[sgNorm_(j.full_name)] || (pins[sgNorm_(j.full_name)] = {});
          if (j.lat && j.lng) { cur.lat = j.lat; cur.lng = j.lng; }
          if (est) cur.est = est;
          cur.phone = cur.phone || sgDigits_(j.cell_phone) || sgDigits_(j.home_phone);
          if (cur.phone) pins['t:' + cur.phone] = cur;   // the sheet may spell the name its own way
        });
      }
      var data2 = dry ? data : sh.getDataRange().getValues(), nCol = HEADERS.indexOf('crmnotes'), nameCol = HEADERS.indexOf('name'), phCol = HEADERS.indexOf('phone'), done = {}, notesCol = [], changed = false;
      for (var r2 = 1; r2 < data2.length; r2++) notesCol.push([data2[r2][nCol]]);
      for (var r3 = data2.length - 1; r3 >= 1; r3--) {
        var ph2 = sgDigits_(data2[r3][phCol]), pn = ph2 && pins['t:' + ph2] ? 't:' + ph2 : sgNorm_(data2[r3][nameCol]), pin = pins[pn]; if (!pin || done[pn]) continue;
        if (pin.phone && ph2 && pin.phone !== ph2) continue;
        done[pn] = 1;
        var cur = String(data2[r3][nCol] || ''), set2 = {};
        if (pin.lat && pin.lng) set2.LL = Number(pin.lat).toFixed(5) + ',' + Number(pin.lng).toFixed(5);
        if (pin.est) set2.ET = String(pin.est);   // Sweep&Go's own minutes for this stop
        var next = sgSetMarkers_(cur, set2);
        if (sgNotesEqual_(next, cur)) continue;
        notesCol[r3 - 1] = [safeCell_(next)]; changed = true;
        if (set2.LL && cur.indexOf('[LL:' + set2.LL + ']') < 0) summary.pinned++;
      }
      if (changed && !dry && notesCol.length) sh.getRange(2, nCol + 1, notesCol.length, 1).setValues(notesCol);
    } catch (e3) { summary.errors.push('dispatch: ' + e3.message); }
    // ---- billing: invoices and payments into their own sheet ----
    try { summary.invoices = sgPullBilling_(dry); } catch (e4) { summary.errors.push('billing: ' + e4.message); }
    // ---- Sweep&Go's route report: the last two weeks and the next two days ----
    try {
      var rep = {};
      for (var k2 = -14; k2 <= 1; k2++) {
        var d2 = new Date(Date.now() + k2 * 86400000).toISOString().slice(0, 10);
        var rr = sgFetch_('/api/v2/report/route_planning_report?date=' + d2);
        var list = (rr.route_reports || []).map(function(x) { return { who: x.assigned_to_name, min: x.duration, drive: x.driving_time, clean: x.cleanup_time, mi: x.distance, jobs: x.number_of_jobs, price: x.price }; });
        if (list.length) { rep[d2] = list; summary.routes += list.length; }
      }
      if (!dry) sgConfig_('sg_routes', JSON.stringify(rep));
    } catch (e5) { summary.errors.push('routes: ' + e5.message); }
    // ---- the work actually done: completed and skipped visits, last 45 days ----
    try { summary.jobs = sgPullJobs_(dry); } catch (e6) { summary.errors.push('jobs: ' + e6.message); }
    // ---- leads from Sweep&Go's own form, if any are new to us ----
    try {
      var sgl = sgAll_('/api/v1/leads/list'), newLeads = [];
      var data3 = sh.getDataRange().getValues(), have = {};
      for (var r3 = 1; r3 < data3.length; r3++) { var dd = sgDigits_(data3[r3][HEADERS.indexOf('phone')]); if (dd) have['p' + dd] = 1; var ee = String(data3[r3][HEADERS.indexOf('email')] || '').trim().toLowerCase(); if (ee) have['e' + ee] = 1; have['s' + String(data3[r3][iId])] = 1; }
      sgl.forEach(function(L) {
        var ph = sgDigits_(L.cell_phone) || sgDigits_(L.home_phone), em = String(L.email || '').trim().toLowerCase();
        var lid = ph ? 'p' + ph : 'sgl' + String(L.lead || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20);
        if ((ph && have['p' + ph]) || (em && have['e' + em]) || have['s' + lid]) return;
        if (/delet|archiv|convert/i.test(String(L.status || ''))) return;
        have['s' + lid] = 1;
        var l = { id: lid, created: new Date().toISOString(), type: 'ENQUIRY', name: String(L.name || '').trim(), phone: ph, email: em, address: String(L.address || '') + (L.zip_code ? ', ' + L.zip_code : ''), zip: String(L.zip_code || ''),
                  service: '', dogs: '', yard: '', deodorize: '', hero: '', price: '', manual: '', honored: '', notes: 'Came in through Sweep&Go\u2019s own form.', status: 'new', crmnotes: '[SRC:Sweep&Go form] [QA:w] [SGID:' + String(L.lead || '') + '] ', updated: new Date().toISOString() };
        newLeads.push(HEADERS.map(function(h) { return safeCell_(l[h] == null ? '' : l[h]); }));
      });
      if (newLeads.length && !dry) sh.getRange(sh.getLastRow() + 1, 1, newLeads.length, HEADERS.length).setValues(newLeads);
      summary.leads = newLeads.length;
    } catch (e7) { summary.errors.push('leads: ' + e7.message); }
    summary.finished = new Date().toISOString();
    if (!dry) sgConfig_('sg_last_sync', JSON.stringify({ at: summary.finished, clients: summary.clients, added: summary.added, updated: summary.updated, pinned: summary.pinned, invoices: summary.invoices, jobs: summary.jobs || 0, leads: summary.leads || 0, errors: summary.errors.slice(0, 3) }));
  } finally { lock.releaseLock(); }
  return summary;
}
/* A CONFIG row the tracker reads like any other setting. */
function sgConfig_(name, value) {
  var sh = sheet_(), l = { id: 'cfg_' + name, created: new Date().toISOString(), type: 'CONFIG', name: name, notes: value, status: 'config', crmnotes: '' };
  var data = sh.getDataRange().getValues(), iId = HEADERS.indexOf('id');
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][iId]) === l.id) { sh.getRange(i + 1, HEADERS.indexOf('notes') + 1).setValue(safeCell_(value)); sh.getRange(i + 1, HEADERS.indexOf('created') + 1).setValue(l.created); return; }
  }
  sh.appendRow(HEADERS.map(function(h) { return safeCell_(l[h] == null ? '' : l[h]); }));
}
/* The billing sheet: one row per invoice, one per payment. Rewritten whole
   on every sync - it is a copy of Sweep&Go, not a record of our own. */
var BILLING_HEADERS = ['kind','number','date','client','type','status','total','paid','remaining','interval','period_start','pay_type','description'];
function billingSheet_() {
  var ss = sheet_().getParent(), sh = ss.getSheetByName('billing');
  if (!sh) { sh = ss.insertSheet('billing'); sh.appendRow(BILLING_HEADERS); try { sh.getRange(1, 1, sh.getMaxRows(), BILLING_HEADERS.length).setNumberFormat('@'); } catch (e) {} }
  return sh;
}
function sgPullBilling_(dry) {
  var rows = [], seen = {};
  var add = function(v, kind) {
    if (!v.invoice_number || seen[v.invoice_number]) return; seen[v.invoice_number] = 1;
    var isOne = kind === 'one-time' || /one[_ -]?time/i.test(String(v.type || ''));
    rows.push(['invoice', v.invoice_number, String(v.created_at || '').slice(0, 10), v.client_name || v.commercial_client || '', isOne ? 'one-time' : (v.type || 'subscription'), String(v.status || '').toLowerCase(), v.total, v.paid, v.remaining, v.billing_interval || '', String(v.period_start || '').slice(0, 10), v.pay_method || '', '']);
  };
  // the docs only show type=recurring; the one-time word is a guess, so try the likely spellings and fall back to everything
  sgAll_('/api/v2/invoices?type=recurring', 'invoices').forEach(function(v) { add(v, 'recurring'); });
  var gotOne = false;
  ['one_time', 'onetime', 'one-time'].forEach(function(t) {
    if (gotOne) return;
    try { sgAll_('/api/v2/invoices?type=' + t, 'invoices').forEach(function(v) { add(v, 'one-time'); }); gotOne = true; } catch (e) {}
  });
  if (!gotOne) { try { sgAll_('/api/v2/invoices', 'invoices').forEach(function(v) { add(v, ''); }); } catch (e2) {} }
  sgAll_('/api/v2/payments', 'payments').forEach(function(p) {
    rows.push(['payment', '', String(p.date || '').slice(0, 10), p.client_name || p.commercial_client || '', p.type || '', String(p.status || '').toLowerCase(), p.amount, p.amount, p.tip_amount || '', '', '', p.type || '', String(p.description || '').slice(0, 80)]);
  });
  if (dry) return rows.length;
  var sh = billingSheet_();
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, BILLING_HEADERS.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, BILLING_HEADERS.length).setValues(rows.map(function(r) { return r.map(function(v) { return safeCell_(v == null ? '' : v); }); }));
  return rows.length;
}
/* The jobs sheet: one row per visit Sweep&Go recorded, completed or
   skipped, for the last 45 days. Real minutes on site, real skip reasons. */
var JOBS_HEADERS = ['date','client','zip','status','skip_reason','start','end','minutes','dogs','plan','price','tech','commercial'];
var JOBS_DAYS = 45;
function jobsSheet_() {
  var ss = sheet_().getParent(), sh = ss.getSheetByName('jobs');
  if (!sh) { sh = ss.insertSheet('jobs'); sh.appendRow(JOBS_HEADERS); try { sh.getRange(1, 1, sh.getMaxRows(), JOBS_HEADERS.length).setNumberFormat('@'); } catch (e) {} }
  return sh;
}
function sgMinutes_(j) {
  var d = String(j.duration || '').match(/^(\d+):(\d+)/);
  if (d) return parseInt(d[1], 10) + parseInt(d[2], 10) / 60;
  if (j.start_time && j.end_time) { var ms = new Date(String(j.end_time).replace(' ', 'T')) - new Date(String(j.start_time).replace(' ', 'T')); if (ms > 0 && ms < 6 * 3600000) return ms / 60000; }
  return 0;
}
function sgPullJobs_(dry) {
  var to = new Date().toISOString().slice(0, 10), from = new Date(Date.now() - JOBS_DAYS * 86400000).toISOString().slice(0, 10);
  var d = sgFetch_('/api/v2/report/completed_jobs_report?date_from=' + from + '&date_to=' + to), list = d.job_list || [];
  var rows = list.map(function(j) {
    var dogs = (String(j.service_plan_name || '').match(/^(\d+)d/) || [])[1] || '';
    return [String(j.date || '').slice(0, 10), j.commercial_name || ((j.first_name || '') + ' ' + (j.last_name || '')).trim(), String(j.zip || ''), String(j.status_name || '').toLowerCase(), j.skip_reason_title || '',
            String(j.start_time || '').slice(11, 16), String(j.end_time || '').slice(11, 16), Math.round(sgMinutes_(j) * 10) / 10, dogs, j.service_plan_slug || j.service_plan_name || '', j.price || '', j.assigned_to_name || '', j.commercial_name ? 1 : 0];
  });
  if (dry) return rows.length;
  var sh = jobsSheet_();
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, JOBS_HEADERS.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, JOBS_HEADERS.length).setValues(rows.map(function(r) { return r.map(function(v) { return safeCell_(v == null ? '' : v); }); }));
  return rows.length;
}
function median_(a) { if (!a.length) return 0; var s = a.slice().sort(function(x, y) { return x - y; }); var m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
/* The last 30 days of work, folded small: visits, minutes, skips and why,
   minutes a stop by dog count (median, so one long stop does not pull it),
   and each day with its real miles from the route report. */
function sgJobs_() {
  var sh = jobsSheet_(); if (sh.getLastRow() < 2) return { ok:true, empty:true };
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, JOBS_HEADERS.length).getValues(), H = {}; JOBS_HEADERS.forEach(function(h, i) { H[h] = i; });
  var cut = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  var out = { ok:true, days: 30, visits: 0, minutes: 0, timed: 0, skipped: 0, skipReasons: {}, byDogs: {}, byDate: {}, techs: {}, skippedBy: {}, rate: { byPlan: {}, byDogs: {}, byWeekday: {} } };
  var mins = {}, WD = ['sun','mon','tue','wed','thu','fri','sat'];
  var bump = function(map, k, price, m) { var b = map[k] || (map[k] = { n: 0, price: 0, min: 0 }); b.n++; b.price += price; b.min += m; };
  rows.forEach(function(r) {
    var dt = String(r[H.date] || ''); if (!dt || dt < cut) return;
    var st = String(r[H.status] || ''), m = parseFloat(r[H.minutes]) || 0, dogs = String(r[H.dogs] || '') || '?';
    var day = out.byDate[dt] || (out.byDate[dt] = { visits: 0, skipped: 0, minutes: 0, price: 0 });
    if (/skip/.test(st)) { out.skipped++; day.skipped++; var why = String(r[H.skip_reason] || 'no reason given'); out.skipReasons[why] = (out.skipReasons[why] || 0) + 1; var who = String(r[H.client] || ''); if (who) out.skippedBy[who] = (out.skippedBy[who] || 0) + 1; return; }
    if (!/complet|done/.test(st)) return;
    var price = parseFloat(r[H.price]) || 0;
    out.visits++; day.visits++; day.price += price;
    if (r[H.tech]) out.techs[r[H.tech]] = (out.techs[r[H.tech]] || 0) + 1;
    if (m > 0 && m < 180) {
      out.minutes += m; out.timed++; day.minutes += m; (mins[dogs] = mins[dogs] || []).push(m);
      if (price > 0) {
        var plan = String(r[H.plan] || '').toLowerCase().replace(/[^a-z]/g, '') || 'other';
        plan = /twotimes|2xw|twice/.test(plan) ? 'twice a week' : /biweek|everyother|bw/.test(plan) ? 'every other week' : /month|1xm/.test(plan) ? 'monthly' : /week|1xw/.test(plan) ? 'weekly' : plan;
        bump(out.rate.byPlan, plan, price, m); bump(out.rate.byDogs, dogs, price, m);
        var wd = WD[new Date(dt + 'T12:00:00').getDay()]; bump(out.rate.byWeekday, wd, price, m);
      }
    }
  });
  Object.keys(mins).forEach(function(k) { out.byDogs[k] = { n: mins[k].length, median: Math.round(median_(mins[k]) * 10) / 10 }; });
  ['byPlan', 'byDogs', 'byWeekday'].forEach(function(g) { Object.keys(out.rate[g]).forEach(function(k) { var b = out.rate[g][k]; b.price = Math.round(b.price); b.min = Math.round(b.min); b.perHour = b.min ? Math.round(b.price / (b.min / 60)) : 0; }); });
  out.minutes = Math.round(out.minutes);
  Object.keys(out.byDate).forEach(function(k) { out.byDate[k].minutes = Math.round(out.byDate[k].minutes); out.byDate[k].price = Math.round(out.byDate[k].price); });
  return out;
}
/* What the tracker's billing card shows: by month, billed (voids out),
   collected, unpaid; plus the unpaid list by customer. Small on purpose. */
function sgBilling_() {
  var sh = billingSheet_(); if (sh.getLastRow() < 2) return { ok:true, months: {}, unpaid: [], empty: true };
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, BILLING_HEADERS.length).getValues();
  var H = {}; BILLING_HEADERS.forEach(function(h, i) { H[h] = i; });
  var months = {}, unpaidBy = {}, lastPay = {};
  rows.forEach(function(r) {
    var mo = String(r[H.date] || '').slice(0, 7); if (!/^\d{4}-\d{2}$/.test(mo)) return;
    var m = months[mo] || (months[mo] = { billed: 0, onetime: 0, collected: 0, unpaid: 0, failed: 0, invoices: 0, tips: 0, customers: {} });
    var status = String(r[H.status] || ''), total = parseFloat(r[H.total]) || 0;
    if (r[H.kind] === 'invoice') {
      if (status === 'voided' || status === 'void') return;
      m.billed += total; m.invoices++;
      if (r[H.type] === 'one-time') m.onetime += total; else if (r[H.client]) m.customers[sgNorm_(r[H.client])] = 1;
      if (status !== 'paid') {
        var rem = r[H.remaining] !== '' && r[H.remaining] != null ? parseFloat(r[H.remaining]) : total;
        if (!(rem > 0)) rem = total;
        m.unpaid += rem;
        var u = unpaidBy[r[H.client]] || (unpaidBy[r[H.client]] = { name: r[H.client], owed: 0, n: 0, oldest: '', statuses: {} });
        u.owed += rem; u.n++; u.statuses[status] = (u.statuses[status] || 0) + 1; if (!u.oldest || String(r[H.date]) < u.oldest) u.oldest = String(r[H.date]);
      }
    } else {
      var when = String(r[H.date] || ''), who = String(r[H.client] || '');
      if (status === 'succeeded' || status === 'paid') { m.collected += total; m.tips += parseFloat(r[H.remaining]) || 0; }
      else if (status === 'failed') m.failed++;
      // the latest card result per customer: a failure with nothing good after it is a card to chase
      if (who && (status === 'succeeded' || status === 'failed') && (!lastPay[who] || when >= lastPay[who].when)) lastPay[who] = { when: when, status: status, amount: total };
    }
  });
  var cut60 = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  var declining = Object.keys(lastPay).filter(function(k) { return lastPay[k].status === 'failed' && lastPay[k].when >= cut60; }).map(function(k) { return { name: k, when: lastPay[k].when, amount: Math.round(lastPay[k].amount) }; }).sort(function(a, b) { return b.when < a.when ? -1 : 1; }).slice(0, 40);
  Object.keys(months).forEach(function(k) { months[k].customers = Object.keys(months[k].customers).length; ['billed','onetime','collected','unpaid','tips'].forEach(function(f) { months[k][f] = Math.round(months[k][f]); }); });
  var unpaid = Object.keys(unpaidBy).map(function(k) { var u = unpaidBy[k]; u.owed = Math.round(u.owed); return u; }).sort(function(a, b) { return b.owed - a.owed; }).slice(0, 40);
  return { ok:true, months: months, unpaid: unpaid, declining: declining, rows: rows.length };
}
/* The webhook. Sweep&Go posts here on the events ticked on the token. We
   never act on the body: we log the event and ask for a sync. */
function sgHook_(word, e) {
  var want = sgHookWord_();
  if (!want || word !== want) return { ok:false, error:'no' };
  var raw = (e && e.postData && e.postData.contents) || '', ev = '';
  try { var b = JSON.parse(raw); ev = String(b.event || b.type || b.event_type || b.name || ''); } catch (err) {}
  try {
    var ss = sheet_().getParent(), sh = ss.getSheetByName('hooks');
    if (!sh) { sh = ss.insertSheet('hooks'); sh.appendRow(['received', 'event', 'payload']); }
    sh.appendRow([new Date().toISOString(), ev.slice(0, 80), safeCell_(raw.slice(0, 4000))]);
    if (sh.getLastRow() > 500) sh.deleteRows(2, sh.getLastRow() - 500);
  } catch (e2) {}
  // a change worth syncing for, at most once every ten minutes
  if (!/^(notification|staff|payroll|dog|organization)/.test(ev)) {
    try {
      var cache = CacheService.getScriptCache();
      if (!cache.get('sg_sync_soon')) { cache.put('sg_sync_soon', '1', 600); sgSync(); }
    } catch (e3) {}
  }
  return { ok:true, event: ev };
}
/* The latest value of a CONFIG row, or ''. */
function cfg_(name) {
  try {
    var sh = sheet_(), rows = sh.getDataRange().getValues(), iT = HEADERS.indexOf('type'), iN = HEADERS.indexOf('name'), iV = HEADERS.indexOf('notes');
    for (var i = rows.length - 1; i >= 1; i--) if (String(rows[i][iT]) === 'CONFIG' && String(rows[i][iN]) === name) return String(rows[i][iV] == null ? '' : rows[i][iV]);
  } catch (e) {}
  return '';
}
/* ---- sign-up straight into Sweep&Go ----
   Jesse: "just get the client's main information inserted, I'll add the
   price and assign the person." Everything but the price goes across as
   typed. Sweep&Go's sign-up has no price field: it attaches its own
   default subscription for that frequency and dog count, so the quoted
   price goes into the client's notes there and is stamped here as
   [QP:price]. The card reminds the office to set it until the nightly
   sync sees Sweep&Go's price match, then the reminder clears itself.
   Nothing is created twice: Sweep&Go refuses an email it already has,
   and we stamp [SGC:date]. */
var SG_FREQ = { 'weekly': 'once_a_week', 'every other week': 'bi_weekly', 'twice a week': 'two_times_a_week', 'monthly': 'once_a_month', 'one-time': 'one_time' };
function sgSplitAddress_(addr, zip) {
  // "316 Old Forester Dr., Lake St. Louis, MO 63367" -> street, city, state
  var a = String(addr || '').replace(/,\s*USA$/i, '').split(',').map(function(x) { return x.trim(); }).filter(Boolean);
  var street = a[0] || '', city = a[1] || '', state = 'MO';
  var tail = a.slice(2).join(' ') + ' ' + (a[1] || '');
  var sm = tail.match(/\b(MO|IL|Missouri|Illinois)\b/i);
  if (sm) state = /^il/i.test(sm[1]) ? 'IL' : 'MO'; else if (/^62/.test(String(zip || ''))) state = 'IL';
  if (a.length >= 2 && /\b(MO|IL|Missouri|Illinois)\b/i.test(a[1]) && !a[2]) city = a[1].replace(/\b(MO|IL|Missouri|Illinois)\b.*$/i, '').trim();
  return { street: street, city: city, state: state };
}
function sgQuotedBase_(price) {
  var p = String(price || ''), m = p.match(/\$?(\d+(?:\.\d+)?)/), total = m ? parseFloat(m[1]) : 0;
  var d = p.match(/includes \$(\d+(?:\.\d+)?) deodorize/i), deo = d ? parseFloat(d[1]) : 0;
  return { total: total, base: total - deo, deo: deo, monthly: /\/mo|month/i.test(p) };
}
function sgCreate_(id, force) {
  if (!id) return { ok:false, reason:'no id' };
  var sh = sheet_(), l = latestRow_(sh, id);
  if (!l) return { ok:false, reason:'not found' };
  var notes = String(l.crmnotes || '');
  if (/\[SGC:/.test(notes)) return { ok:false, reason:'done', when: (notes.match(/\[SGC:([^\]]*)\]/) || [])[1] };
  var email = String(l.email || '').trim().toLowerCase(), zip = String(l.zip || '').match(/\b(6[23]\d{3})\b/) ? String(l.zip).match(/\b(6[23]\d{3})\b/)[1] : (String(l.address || '').match(/\b(6[23]\d{3})\b/) || [])[1] || '';
  var name = String(l.name || '').trim().split(/\s+/), first = name[0] || '', last = name.slice(1).join(' ') || '-';
  var plan = String(l.service || '').toLowerCase(), freq = SG_FREQ[plan], dogs = parseInt(l.dogs, 10) || 0;
  if (!email) return { ok:false, reason:'no email' };
  if (!zip) return { ok:false, reason:'no zip' };
  if (!freq) return { ok:false, reason:'no plan', plan: plan };
  if (!dogs || dogs > 5) return { ok:false, reason:'dogs', dogs: l.dogs };
  // 1. does Sweep&Go cover the ZIP, and is the email new to it
  var zc = sgFetch_('/api/v2/client_on_boarding/check_zip_code_exists', 'post', { value: zip });
  if (String(zc.exists) !== 'exists') return { ok:false, reason:'zip', zip: zip };
  var ex = sgFetch_('/api/v2/client_on_boarding/check_client_email_exists?email=' + encodeURIComponent(email));
  if (ex && ex.exists === true) return { ok:false, reason:'exists', email: email };
  // 2. what Sweep&Go would charge, against what the website quoted
  var q = sgQuotedBase_(l.price), sgPrice = 0, deoId = null, interval = 'monthly';
  var pr = sgFetch_('/api/v2/client_on_boarding/price_registration_form?last_time_yard_was_thoroughly_cleaned=one_month&clean_up_frequency=' + freq + '&number_of_dogs=' + dogs + '&zip_code=' + zip);
  if (pr && pr.price) { sgPrice = parseFloat(pr.price.value) || 0; interval = String(pr.price.billing_interval || 'monthly'); }
  (pr && pr.cross_sells || []).forEach(function(c) { if (!deoId && /deodor|sanit/i.test(String(c.name || ''))) deoId = c.id; });
  var sgMonthly = interval === 'monthly' ? sgPrice : interval === 'weekly' ? sgPrice * 4.33 : sgPrice * (freq === 'two_times_a_week' ? 8.67 : freq === 'bi_weekly' ? 2.17 : freq === 'once_a_month' ? 1 : 4.33);
  var wantsDeo = /every|other/i.test(String(l.deodorize || '')) && !/season reopens/i.test(String(l.deodorize || ''));
  var priceOk = freq === 'one_time' ? true : (q.base > 0 && sgMonthly > 0 && Math.abs(sgMonthly - q.base) <= 1);
  // 3. create
  var adr = sgSplitAddress_(l.address, zip), how = (notes.match(/\[HH:([^\]]*)\]/) || [])[1] || '', src = (notes.match(/\[SRC:([^\]]*)\]/) || [])[1] || '';
  var body = {
    zip_code: zip, number_of_dogs: dogs, last_time_yard_was_thoroughly_cleaned: 'one_month', clean_up_frequency: freq,
    first_name: first, last_name: last, email: email, city: adr.city, home_address: adr.street, state: adr.state,
    cell_phone_number: String(l.phone || '').replace(/\D/g, '').slice(-10),
    initial_cleanup_required: 1, cleanup_notification_type: 'on_the_way,completed', cleanup_notification_channel: 'sms',
    how_heard_about_us: how || src ? 'other' : undefined, how_heard_answer: how || src || undefined,
    additional_comment: ('From the website quote.' + (q.base ? ' QUOTED PRICE: $' + q.base + '/mo for the cleanup' + (q.deo ? ' plus $' + q.deo + '/mo deodorize' : '') + ' - set the subscription price to this.' : '') + (l.notes ? ' ' + String(l.notes).slice(0, 280) : '')).slice(0, 400),
    marketing_allowed: 1, marketing_allowed_source: 'open_api', terms_open_api: 1,
    tracking_field: [ (notes.match(/\[CAMP:([^\]]*)\]/) || [])[1] ? 'utm_campaign=' + (notes.match(/\[CAMP:([^\]]*)\]/) || [])[1] : '', src ? 'utm_source=' + src : '' ].filter(Boolean).join('&') || undefined
  };
  if (wantsDeo && deoId) { body.cross_sells = [deoId]; body.cross_sells_names = 'Deodorizing'; }
  Object.keys(body).forEach(function(k) { if (body[k] === undefined || body[k] === '') delete body[k]; });
  var r = UrlFetchApp.fetch(SG_BASE + '/api/v1/residential/onboarding', { method: 'put', contentType: 'application/json', payload: JSON.stringify(body), headers: { 'Authorization': 'Bearer ' + sgToken_(), 'Accept': 'application/json' }, muteHttpExceptions: true });
  var code = r.getResponseCode(), txt = r.getContentText() || '';
  if (code === 409) return { ok:false, reason:'exists', email: email };
  if (code === 429) return { ok:false, reason:'wait' };
  if (code >= 400) return { ok:false, reason:'error', error: ('Sweep&Go ' + code + ': ' + txt).slice(0, 200), sent: body };
  // 4. stamp it, and the customer is on the books
  var today = new Date().toISOString().slice(0, 10), data = sh.getDataRange().getValues(), idCol = HEADERS.indexOf('id');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) !== String(id)) continue;
    var old = String(data[i][HEADERS.indexOf('crmnotes')] || '');
    sh.getRange(i + 1, HEADERS.indexOf('crmnotes') + 1).setValue(safeCell_(sgSetMarkers_(old, { SGC: today, CD: (old.match(/\[CD:([^\]]*)\]/) || [])[1] || today, QP: (!priceOk && q.base) ? String(q.base) : '' })));
    sh.getRange(i + 1, HEADERS.indexOf('status') + 1).setValue('closed');
    sh.getRange(i + 1, HEADERS.indexOf('updated') + 1).setValue(new Date().toISOString());
  }
  return { ok:true, created: true, sgPrice: Math.round(sgMonthly * 100) / 100, quoted: q.base, priceOk: priceOk, deo: !!(wantsDeo && deoId), sent: body };
}
/* ---- the Monday push: last week in numbers, to both phones ----
   Jesse: "a Monday morning push". Goes through the same free ntfy topic
   as new leads (setupPush). Everything in it is already in the sheets. */
function weeklyNumbers_() {
  var sh = sheet_(), rows = sh.getDataRange().getValues(), H = {}; HEADERS.forEach(function(h, i) { H[h] = i; });
  var now = new Date(), cut = new Date(now.getTime() - 7 * 86400000), cutD = cut.toISOString().slice(0, 10), nowD = now.toISOString().slice(0, 10);
  var latest = {}, NOT = { VIEW:1, QVIEW:1, OUTAREA:1, WAITLIST:1, AUTH:1, SPEND:1, CONFIG:1 };
  for (var i = 1; i < rows.length; i++) {
    var id = String(rows[i][H.id]), t = String(rows[i][H.type] || ''); if (NOT[t]) continue;
    var key = String(rows[i][H.created] || ''); if (!latest[id] || key >= latest[id].key) latest[id] = { key: key, r: rows[i] };
  }
  var n = { active: 0, newCust: 0, left: 0, leftWhy: {}, leadsIn: 0, waiting: 0, reviews: '' };
  Object.keys(latest).forEach(function(id) {
    var r = latest[id].r, st = String(r[H.status] || 'new'), notes = String(r[H.crmnotes] || '');
    if (st === 'deleted' || /\[TM:1\]/.test(notes)) return;
    var cd = (notes.match(/\[CD:(\d{4}-\d{2}-\d{2})\]/) || [])[1] || '', cx = (notes.match(/\[CX:(\d{4}-\d{2}-\d{2})\]/) || [])[1] || '';
    if (st === 'closed') { n.active++; if (cd >= cutD && cd <= nowD) n.newCust++; }
    if (st === 'cancelled' && cx >= cutD && cx <= nowD) { n.left++; var why = (notes.match(/\[CXR:([^\]]*)\]/) || [])[1] || 'no reason'; n.leftWhy[why] = (n.leftWhy[why] || 0) + 1; }
    if (String(r[H.created] || '') >= cut.toISOString()) n.leadsIn++;
    if (st === 'new' && String(r[H.created] || '') >= new Date(now.getTime() - 30 * 86400000).toISOString()) n.waiting++;
  });
  for (var j = rows.length - 1; j >= 1; j--) { if (String(rows[j][H.type]) === 'CONFIG' && String(rows[j][H.name]) === 'review_count') { n.reviews = String(rows[j][H.notes] || ''); break; } }
  // money and work, from the Sweep&Go sheets if they exist
  n.billed = 0; n.collected = 0; n.owed = 0; n.visits = 0; n.skipped = 0;
  try {
    var bs = sheet_().getParent().getSheetByName('billing');
    if (bs && bs.getLastRow() > 1) {
      var BH = {}; BILLING_HEADERS.forEach(function(h, i) { BH[h] = i; });
      bs.getRange(2, 1, bs.getLastRow() - 1, BILLING_HEADERS.length).getValues().forEach(function(r) {
        var d = String(r[BH.date] || ''), st = String(r[BH.status] || ''), tot = parseFloat(r[BH.total]) || 0;
        if (r[BH.kind] === 'invoice') { if (st === 'voided') return; if (d >= cutD) n.billed += tot; if (st !== 'paid') { var rem = parseFloat(r[BH.remaining]); n.owed += rem > 0 ? rem : tot; } }
        else if (st === 'succeeded' && d >= cutD) n.collected += tot;
      });
    }
    var js = sheet_().getParent().getSheetByName('jobs');
    if (js && js.getLastRow() > 1) {
      var JH = {}; JOBS_HEADERS.forEach(function(h, i) { JH[h] = i; });
      js.getRange(2, 1, js.getLastRow() - 1, JOBS_HEADERS.length).getValues().forEach(function(r) {
        var d = String(r[JH.date] || ''); if (d < cutD) return;
        if (/skip/.test(String(r[JH.status]))) n.skipped++; else if (/complet|done/.test(String(r[JH.status]))) n.visits++;
      });
    }
  } catch (e) {}
  return n;
}
function weeklyPushText_(n) {
  var money = function(v) { return '$' + Math.round(v).toLocaleString(); };
  var why = Object.keys(n.leftWhy).map(function(k) { return n.leftWhy[k] + ' ' + k; }).join(', ');
  var L = [];
  if (n.billed || n.collected) L.push(money(n.billed) + ' billed, ' + money(n.collected) + ' collected' + (n.owed ? ', ' + money(n.owed) + ' still owed' : ''));
  L.push(n.active + ' active' + (n.newCust ? ', +' + n.newCust + ' new' : '') + (n.left ? ', -' + n.left + ' left (' + why + ')' : '') + (!n.newCust && !n.left ? ', no comings or goings' : ''));
  L.push(n.leadsIn + ' lead' + (n.leadsIn === 1 ? '' : 's') + ' in' + (n.waiting ? ', ' + n.waiting + ' still waiting for a call' : ''));
  if (n.visits || n.skipped) L.push(n.visits + ' visits done' + (n.skipped ? ', ' + n.skipped + ' skipped' : ''));
  if (n.reviews) L.push(n.reviews + ' Google reviews');
  return L.join('\n');
}
function weeklyPush() {
  var n = weeklyNumbers_(), body = weeklyPushText_(n), topic = pushTopic_();
  var title = 'CLPPS last week';
  if (topic) {
    try { UrlFetchApp.fetch('https://ntfy.sh/' + encodeURIComponent(topic), { method: 'post', contentType: 'text/plain; charset=utf-8', payload: body, headers: { 'Title': title, 'Priority': 'default', 'Tags': 'bar_chart', 'Click': PUSH_TRACKER_URL }, muteHttpExceptions: true }); } catch (e) {}
  } else { Logger.log('No push topic yet (run setupPush). Would have sent:\n' + body); }
  return body;
}
function setupWeeklyPush() {
  ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'weeklyPush') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('weeklyPush').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).create();
  Logger.log('Monday 7am push scheduled. A sample of what it sends:\n' + weeklyPushText_(weeklyNumbers_()));
}
/* Run once, from the editor: checks the token, syncs, and schedules 4am. */
function setupSweepAndGo() {
  if (!sgToken_()) throw new Error('Add SG_TOKEN under Project Settings > Script Properties first');
  var who = sgFetch_('/api/v2/welcome');
  Logger.log('Token works: ' + JSON.stringify(who).slice(0, 200));
  ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'sgSync') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sgSync').timeBased().everyDays(1).atHour(4).create();
  try { setupWeeklyPush(); } catch (e) { Logger.log('weekly push not scheduled: ' + e); }
  var s = sgSync();
  Logger.log('First sync: ' + JSON.stringify(s, null, 1));
  return s;
}

/* ---- Email blast ------------------------------------------------------
   Jesse: "send out a seasonal promotion to their email". The tracker picks
   who, writes the message once with {first} {price} {plan} in it, and posts
   it here in batches of up to 60. Each person gets their own email from the
   business account, reply-to the office. Every send is stamped on the
   lead's notes as [EM:tag@date] so nobody is mailed twice for the same
   promotion and the tracker can show who was reached. Gmail allows about
   100 recipients a day from a plain Gmail account (1,500 on Workspace);
   the tracker asks for the remaining quota first and sends what fits. */
var BLAST_MAX = 60, BLAST_SUBJECT_MAX = 150, BLAST_BODY_MAX = 6000;
function fillBlast_(text, r) {
  var first = String(r.first || '').trim() || 'there';
  var price = String(r.price || '').trim() || 'your quoted price';
  var plan = String(r.plan || '').trim() || 'your plan';
  return String(text || '').split('{first}').join(first).split('{price}').join(price).split('{plan}').join(plan);
}
function blast_(body) {
  var subject = clip_(body.subject, BLAST_SUBJECT_MAX).trim(), text = clip_(body.body, BLAST_BODY_MAX);
  var tag = String(body.tag || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || 'promo';
  var to = Array.isArray(body.to) ? body.to.slice(0, BLAST_MAX) : [];
  if (!subject || !text.trim() || !to.length) return { ok:false, error:'nothing to send' };
  var sent = [], failed = [], stamp = '[EM:' + tag + '@' + new Date().toISOString().slice(0, 10) + '] ';
  var sh = sheet_(), data = sh.getDataRange().getValues(), idCol = HEADERS.indexOf('id'), nCol = HEADERS.indexOf('crmnotes');
  for (var k = 0; k < to.length; k++) {
    var r = to[k] || {}, email = String(r.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { failed.push({ id:r.id, error:'bad email' }); continue; }
    var left = 0; try { left = MailApp.getRemainingDailyQuota(); } catch (e) { left = 1; }
    if (left < 1) { failed.push({ id:r.id, error:'quota' }); continue; }
    try {
      MailApp.sendEmail({ to: email, subject: fillBlast_(subject, r), body: fillBlast_(text, r), name: 'CL Professional Pet Services', replyTo: NOTIFY_CC });
      sent.push(r.id);
      // stamp every row that carries the id, same as an update
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][idCol]) !== String(r.id)) continue;
        var old = String(data[i][nCol] || '');
        if (old.indexOf('[EM:' + tag + '@') < 0) sh.getRange(i + 1, nCol + 1).setValue(safeCell_(stamp + old));
      }
    } catch (e) { failed.push({ id:r.id, error:String(e && e.message || e).slice(0, 80) }); }
  }
  var remaining = 0; try { remaining = MailApp.getRemainingDailyQuota(); } catch (e2) {}
  return { ok:true, sent:sent, failed:failed, remaining:remaining, tag:tag };
}

/**
 * WEEKLY DIGEST (optional): emails a Monday summary of views, leads and
 * closes to the business inbox. To turn on: paste this whole updated file
 * over the old code, save, then in the left sidebar click Triggers (clock
 * icon) -> Add Trigger -> function weeklyDigest -> time-driven -> week
 * timer -> Monday 7-8am -> Save.
 */
/* ---- Backups ----------------------------------------------------------
   The sheet is the whole customer list and history. backupSheet() copies it
   to a dated file in a Drive folder called "CLPPS Backups" and keeps the
   newest eight. Run setupBackupTrigger() ONCE (pick it in the toolbar above,
   press Run, allow Drive when asked) and it happens every Sunday night on
   its own, starting with a copy right now. */
function backupSheet() {
  var ss = sheet_().getParent();
  var file = DriveApp.getFileById(ss.getId());
  var folders = DriveApp.getFoldersByName('CLPPS Backups');
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('CLPPS Backups');
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  file.makeCopy('CLPPS Leads backup ' + stamp, folder);
  var all = [], it = folder.getFiles();
  while (it.hasNext()) { var f = it.next(); if (/^CLPPS Leads backup /.test(f.getName())) all.push(f); }
  all.sort(function(a, b){ return b.getDateCreated() - a.getDateCreated(); });
  for (var i = 8; i < all.length; i++) all[i].setTrashed(true);
  return all.length;
}
function setupBackupTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'backupSheet') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('backupSheet').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(23).create();
  backupSheet();
}

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
  var leadIds = {}, closedIds = {}, yesIds = {}, noIds = {};
  var NOT_A_LEAD = { VIEW:1, QVIEW:1, OUTAREA:1, WAITLIST:1, AUTH:1, SPEND:1, CONFIG:1 };
  for (var i = 1; i < rows.length; i++) {
    var created = new Date(rows[i][HEADERS.indexOf('created')]);
    var type = String(rows[i][HEADERS.indexOf('type')] || '');
    var status = rows[i][HEADERS.indexOf('status')];
    var id = String(rows[i][HEADERS.indexOf('id')] || '');
    var notes = String(rows[i][HEADERS.indexOf('crmnotes')] || '');
    if (status === 'deleted' || /\[TM:1\]/.test(notes)) continue;   // removed, or a team phone's test
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
      // by id, not by row: the same customer's row gets written again when
      // they answer, and again if somebody edits them in the tracker.
      if (type === 'ACTIVATE' && id) yesIds[id] = 1;
      if (type === 'DECLINED' && id) noIds[id] = 1;
    }
    // A lead is almost never created and closed inside the same week - they
    // take days to call back and sign up - so gating this on the CREATED date
    // made "Marked closed" read zero nearly every Monday. The closed date is
    // stamped in the notes as [CD:yyyy-mm-dd] when the status is set; use it,
    // and only fall back to created for old rows that never got one.
    if (!NOT_A_LEAD[type] && status === 'closed' && id) {
      var cdm = notes.match(/\[CD:([0-9]{4}-[0-9]{2}-[0-9]{2})\]/);
      var when = cdm ? new Date(cdm[1] + 'T12:00:00') : created;
      if (when >= cut) closedIds[id] = 1;
    }
  }
  var leads = 0, answered = 0, declined = 0;
  for (var k in leadIds) leads++;
  for (var k2 in closedIds) closed++;
  for (var k3 in yesIds) answered++;
  for (var k4 in noIds) declined++;
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
