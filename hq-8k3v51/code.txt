/**
 * CLPPS Lead Tracker backend — paste this whole file into a new project at
 * script.google.com, then Deploy → New deployment → Web app →
 * Execute as: Me → Access: Anyone. Nothing needs to be edited.
 *
 * On its first use it automatically creates a spreadsheet named
 * "CLPPS Leads" in your Google Drive and stores everything there.
 */

/* ---- ONE-TIME INSTALL ----------------------------------------------------
   Fill in the values below, pick install in the toolbar, press Run, read the
   log. It saves them as Script Properties (where the code reads them from),
   checks the Sweep&Go token, schedules every job, runs the first sync and
   tells you the two things it cannot do itself: publish the new version and
   paste the webhook address into Sweep&Go.

   Blank values change nothing, so pasting a fresh copy of this file over
   the old one later is safe: what was saved stays saved. The copy of this
   file in the repository is always blank here. Never commit a filled one. */
var INSTALL = {
  SG_TOKEN:    '',   // Sweep&Go > Settings > Integrations > Open API: a NEW token
  SG_HOOK:     '',   // the secret word in the webhook address
  TRACKER_KEY: '',   // the tracker password everyone types once per phone
  NTFY_TOPIC:  '',   // the topic the phones already follow in the ntfy app
  MAIL_FROM:   '',   // the office mailbox, info@...
  MS_TENANT:   '',   // from Corey's Microsoft app registration (Directory ID)
  MS_CLIENT:   '',   // Application (client) ID
  MS_SECRET:   '',   // the client secret's Value
  PLACES_KEY:  '',   // optional: Google Places key, for the review count
  PLACE_ID:    ''    // optional: the business's Place ID
};
function install() {
  var L = function(t) { Logger.log(t); };
  var p = PropertiesService.getScriptProperties(), saved = [];
  Object.keys(INSTALL).forEach(function(k) {
    var v = String(INSTALL[k] == null ? '' : INSTALL[k]).trim();
    if (v && !/paste|here|xxx/i.test(v)) { p.setProperty(k, v); saved.push(k); }
  });
  L('1. Saved to Script Properties: ' + (saved.length ? saved.join(', ') : 'nothing new (blank lines keep what was already saved)'));
  if (!sgToken_()) { L('STOP: there is no Sweep&Go token. Put the new token in INSTALL.SG_TOKEN and run install again.'); return { ok:false, step:'token' }; }
  if (!sgHookWord_()) L('   Note: no SG_HOOK, so the Sweep&Go webhook will be refused until one is set.');
  if (/no-key-set/.test(pin_())) L('   Note: no TRACKER_KEY, so nobody can open the tracker until one is set.');
  var who;
  try { who = sgFetch_('/api/v2/welcome'); } catch (e) { L('STOP: Sweep&Go did not accept the token: ' + e.message + '. Make a new token in Sweep&Go, put it in INSTALL.SG_TOKEN, run install again. Nothing was written.'); return { ok:false, step:'token', error: e.message }; }
  L('2. Sweep&Go accepts the token.');
  setupSweepAndGo();
  L('3. Jobs scheduled: the customer sync at 4am daily, the invoice pull right after it (and the mileage log back to last January, a hundred days a run), the Monday 7am push, the 9am daily emails, the hourly and 5pm lead nudges, the month in review on the 1st, the year in review each January. The FIRST sync starts by itself in about a minute and the invoice history a minute after that, each in its own window. In five minutes pick sgStatus and press Run to read the result.');
  try { setupBackupTrigger(); var tidied = tidySheet(); L('4. Backups: every Sunday night to the Drive folder "CLPPS Backups", one made now, and the sheet tidied: ' + tidied.removed + ' duplicate or stale rows folded away, ' + tidied.kept + ' kept.'); }
  catch (e) { L('4. Backup trigger scheduled; the first copy or tidy failed: ' + e.message); }
  if (placesKey_() && placeId_()) { try { setupReviews(); L('5. Reviews: refreshing every Monday.'); } catch (e) { L('5. Reviews not set up: ' + e.message); } }
  else L('5. Reviews: skipped (no PLACES_KEY / PLACE_ID). Optional.');
  if (msCfg_()) L('6. Office mailbox test: ' + testOfficeMail());
  else L('6. Office mailbox: not set up yet, so NO customer email goes out (follow-ups, welcome, price notices, the blast) - nothing is ever sent from a Gmail address. Fill in MS_TENANT, MS_CLIENT, MS_SECRET and MAIL_FROM when Corey has them, and run install again.');
  if (pushTopic_()) { try { UrlFetchApp.fetch('https://ntfy.sh/' + encodeURIComponent(pushTopic_()), { method:'post', contentType:'text/plain; charset=utf-8', payload:'The new tracker script is installed. New leads keep arriving here.', headers: { 'Title': 'CLPPS Lead Tracker', 'Tags': 'white_check_mark' }, muteHttpExceptions:true }); L('7. Push: a test went to the phones.'); } catch (e) { L('7. Push test failed: ' + e.message); } }
  else L('7. Push: no NTFY_TOPIC, so no phone pushes until one is set.');
  var url = ''; try { url = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  L('');
  L('DONE HERE. Two things left, by hand:');
  L('  A. Publish: Deploy > Manage deployments > pencil on the existing deployment > Version: New version > Deploy. (Not "New deployment": that changes the address.)');
  L('  B. In Sweep&Go, Settings > Integrations > Open API, paste the webhook address and tick the client and subscription events:');
  L('     ' + (url || '(your /exec address)') + '?hook=' + (sgHookWord_() || '(SG_HOOK)'));
  L('Then open the tracker on your phone and type the password once.');
  return { ok:true, saved: saved, scheduled: true, webhook: url ? url + '?hook=' + sgHookWord_() : '' };
}
/* The tracker password. Run setupTrackerKey() once (pick it in the toolbar,
   press Run, read the key in the execution log) and type that key into the
   tracker on each phone. Until it has been run, the old built-in key still
   works so nothing breaks on the day the new code goes live. */
function pin_() {
  try { var k = PropertiesService.getScriptProperties().getProperty('TRACKER_KEY'); if (k) return k; } catch (e) {}
  return '\u0000no-key-set';   // nothing a browser can send: until TRACKER_KEY is set, nobody gets in
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

/* Customer-facing emails (follow-ups, welcome, price notices, the blast)
   go out through this, and ONLY as the office mailbox,
   info@clpropetservices.com, through Microsoft 365. Nothing to a customer
   is ever sent from a Gmail address. Four Script Properties turn it on:
     MS_TENANT  the Directory (tenant) ID of the app registration
     MS_CLIENT  its Application (client) ID
     MS_SECRET  a client secret (note the expiry; make a new one before it)
     MAIL_FROM  info@clpropetservices.com
   The app needs the Microsoft Graph application permission Mail.Send
   with admin consent. Until those are set, every customer email simply
   does not go: the switches stay quiet, the buttons say why. The office's
   own lead alerts are separate and unaffected. Run testOfficeMail from
   the editor to check the Microsoft path. */
var MS_LOGIN = 'https://login.microsoftonline.com/';
var MS_DAILY_LIMIT = 10000;   // Exchange Online's recipients-a-day limit for one mailbox
var MS_GRAPH = 'https://graph.microsoft.com/v1.0/';
function msCfg_() {
  try {
    var p = PropertiesService.getScriptProperties(), c = { tenant: p.getProperty('MS_TENANT') || '', client: p.getProperty('MS_CLIENT') || '', secret: p.getProperty('MS_SECRET') || '', from: p.getProperty('MAIL_FROM') || '' };
    return c.tenant && c.client && c.secret && /@/.test(c.from) ? c : null;
  } catch (e) { return null; }
}
function msToken_(c) {
  var cache = null; try { cache = CacheService.getScriptCache(); var hit = cache.get('ms_token'); if (hit) return hit; } catch (e) {}
  var r = UrlFetchApp.fetch(MS_LOGIN + encodeURIComponent(c.tenant) + '/oauth2/v2.0/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { client_id: c.client, client_secret: c.secret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }
  });
  if (r.getResponseCode() !== 200) throw new Error('Microsoft sign-in failed: ' + String(r.getContentText()).slice(0, 200));
  var tok = JSON.parse(r.getContentText()).access_token;
  if (!tok) throw new Error('Microsoft sign-in returned no token');
  try { cache.put('ms_token', tok, 3000); } catch (e) {}
  return tok;
}
/* Send as the office mailbox through Microsoft Graph. Returns true when
   Microsoft took it (202), throws otherwise so the caller can fall back. */
function msSend_(c, o) {
  var msg = {
    message: {
      subject: String(o.subject || ''),
      body: { contentType: 'Text', content: String(o.body || '') },
      toRecipients: String(o.to).split(',').map(function(a) { return { emailAddress: { address: a.trim() } }; }).filter(function(x) { return x.emailAddress.address; }),
      replyTo: [{ emailAddress: { address: o.replyTo || c.from, name: o.name || 'CL Professional Pet Services' } }]
    },
    saveToSentItems: true
  };
  if (o.attachments && o.attachments.length) msg.message.attachments = o.attachments.map(function(a) { return { '@odata.type': '#microsoft.graph.fileAttachment', name: a.name, contentType: a.type || 'text/plain', contentBytes: Utilities.base64Encode(a.content, Utilities.Charset.UTF_8) }; });
  var r = UrlFetchApp.fetch(MS_GRAPH + 'users/' + encodeURIComponent(c.from) + '/sendMail', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + msToken_(c) }, payload: JSON.stringify(msg)
  });
  var code = r.getResponseCode();
  if (code === 401) { try { CacheService.getScriptCache().remove('ms_token'); } catch (e) {} }
  if (code < 200 || code >= 300) throw new Error('Microsoft would not send (' + code + '): ' + String(r.getContentText()).slice(0, 200));
  return true;
}
/* Mail to the office itself (reports, alerts): the office mailbox when it
   is connected, else the Google account. Never to a customer. */
function sendOfficeMail_(o) {
  var c = msCfg_();
  if (c) { try { msSend_(c, o); return 'microsoft'; } catch (e) { try { Logger.log('Office report fell back to Google: ' + e.message); } catch (e2) {} } }
  var opts = { to: o.to, subject: o.subject, body: o.body, name: 'CLPPS Lead Tracker' };
  if (o.attachments && o.attachments.length) opts.attachments = o.attachments.map(function(a) { return Utilities.newBlob(a.content, a.type || 'text/plain', a.name); });
  MailApp.sendEmail(opts);
  return 'google';
}
var NO_OFFICE_MAIL = 'office mailbox not set up';
function officeMailReady_() { return !!msCfg_(); }
function sendCustomerMail_(o) {
  var c = msCfg_();
  if (!c) throw new Error(NO_OFFICE_MAIL);
  msSend_(c, o);   // throws if Microsoft will not take it: the caller records it, nothing else is tried
  return 'microsoft';
}
/* Run this from the editor after setting the four properties: it sends
   one test email from the office mailbox to the office mailbox and logs
   which way it went. */
function testOfficeMail() {
  var c = msCfg_();
  if (!c) { Logger.log('Not set up: MS_TENANT, MS_CLIENT, MS_SECRET and MAIL_FROM all need to be in Script Properties.'); return 'not configured'; }
  try {
    msSend_(c, { to: c.from, subject: 'Tracker test: this came from the office mailbox', body: 'If you are reading this in Outlook, the tracker can send as ' + c.from + '. A copy is in Sent, and replies to customer emails will land here.\n\nSent ' + new Date().toString() });
    Logger.log('Sent from ' + c.from + ' through Microsoft. Check the Outlook inbox and Sent folder.');
    return 'ok';
  } catch (e) { Logger.log(e.message); return e.message; }
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

/* For the quote page: the days we already serve each ZIP, from the route.
   Nothing about anyone: only ZIPs with three or more customers, only days
   with two or more, no counts. Cached for six hours. */
function publicDays_() {
  var cache = CacheService.getScriptCache(), hit = null;
  try { hit = cache.get('public_days'); } catch (e) {}
  if (hit) return JSON.parse(hit);
  var rows = sheet_().getDataRange().getValues(), H = {}; HEADERS.forEach(function(h, i) { H[h] = i; });
  var latest = {}, NOT = { VIEW:1, QVIEW:1, OUTAREA:1, WAITLIST:1, AUTH:1, SPEND:1, CONFIG:1 };
  for (var i = 1; i < rows.length; i++) { var t = String(rows[i][H.type] || ''); if (NOT[t]) continue; var id = String(rows[i][H.id]), key = String(rows[i][H.created] || ''); if (!latest[id] || key >= latest[id].key) latest[id] = { key: key, r: rows[i] }; }
  var byZip = {};
  Object.keys(latest).forEach(function(id) {
    var r = latest[id].r, notes = String(r[H.crmnotes] || '');
    if (String(r[H.status] || '') !== 'closed' || !/\[SGID:/.test(notes) || /\[(OS:1|SS:none|CM:1|TM:1)\]/.test(notes)) return;
    var zip = String(r[H.zip] || '').slice(0, 5), days = ((notes.match(/\[DAY:([^\]]*)\]/) || [])[1] || '').split(',').filter(Boolean);
    if (!/^\d{5}$/.test(zip) || !days.length) return;
    var z = byZip[zip] || (byZip[zip] = { n: 0, days: {} }); z.n++;
    days.forEach(function(d) { z.days[d] = (z.days[d] || 0) + 1; });
  });
  var out = { ok:true, zips: {} }, order = ['mon','tue','wed','thu','fri','sat','sun'];
  Object.keys(byZip).forEach(function(zip) {
    var z = byZip[zip]; if (z.n < 3) return;
    var days = order.filter(function(d) { return (z.days[d] || 0) >= 2; }).sort(function(a, b) { return z.days[b] - z.days[a]; });
    if (days.length) out.zips[zip] = days.slice(0, 3);
  });
  try { cache.put('public_days', JSON.stringify(out), 21600); } catch (e2) {}
  return out;
}
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
  // one more than last time: a new review to reply to, today
  try { var prev = parseInt(cfg_('review_count'), 10), topicR = pushTopic_();
    if (prev >= 1 && r.user_ratings_total > prev && topicR) UrlFetchApp.fetch('https://ntfy.sh/' + encodeURIComponent(topicR), { method: 'post', contentType: 'text/plain; charset=utf-8', payload: (r.user_ratings_total - prev) + ' new Google review' + (r.user_ratings_total - prev === 1 ? '' : 's') + ': ' + r.user_ratings_total + ' now at ' + r.rating + ' stars. Reply today; people read the replies.', headers: { 'Title': 'New Google review', 'Tags': 'star' }, muteHttpExceptions: true });
  } catch (eR) {}
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
  if (p.action === 'days') return json_(publicDays_());
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
    var iType = HEADERS.indexOf('type'), iCreated = HEADERS.indexOf('created'), iUpdated = HEADERS.indexOf('updated');
    // since= asks for only the rows created or updated after that moment: the
    // phone refreshes every minute and most minutes nothing has changed
    var since = /^\d{4}-\d{2}-\d{2}T/.test(String(p.since || '')) ? String(p.since) : '';
    var leads = [], skipped = 0;
    for (var i = 1; i < rows.length; i++) {
      if (since) { var c0 = String(rows[i][iCreated] || ''), u0 = String(rows[i][iUpdated] || ''); if (c0 < since && (!u0 || u0 < since)) continue; }
      if (cut && BULK[String(rows[i][iType])]) {
        var when = new Date(rows[i][iCreated]).getTime();
        if (when && when < cut) { skipped++; continue; }
      }
      var o = {};
      for (var j = 0; j < HEADERS.length; j++) o[HEADERS[j]] = rows[i][j];
      leads.push(o);
    }
    leads.reverse(); // newest first
    return json_({ok:true, leads:leads, windowDays: days > 0 ? days : null, olderRowsSkipped: skipped, delta: !!since, since: since || null});
  }
}

function doPost(e) {
  var body;
  // Sweep&Go's webhook: the secret word in the address is the whole handshake
  var qp = (e && e.parameter) || {};
  if (qp.hook) return json_(sgHook_(qp.hook, e));
  if (!e || !e.postData || e.postData.length > MAX_POST_BYTES) return json_({ok:false, error:'too big'});
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ok:false}); }
  if (body.action === 'list') return list_({ key: body.key, days: body.days, since: body.since });
  if (body.action === 'billing') {
    if (body.key !== pin_()) return json_({ok:false, error:'bad pin'});
    return json_(sgBilling_());
  }
  if (body.action === 'jobs') {
    if (body.key !== pin_()) return json_({ok:false, error:'bad pin'});
    return json_(sgJobs_());
  }
  if (body.action === 'pricemove') {
    if (body.key !== pin_()) return json_({ok:false, error:'bad pin'});
    return json_(priceMove_(body));
  }
  if (body.action === 'billingcsv') {
    if (body.key !== pin_()) return json_({ok:false, error:'bad pin'});
    return json_(billingCsv_());
  }
  if (body.action === 'payremind') {
    if (body.key !== pin_()) return json_({ok:false, error:'bad pin'});
    return json_(payRemind_(body));
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
    var c = msCfg_();
    return json_({ ok:true, office: !!c, from: c ? c.from : '', remaining: c ? MS_DAILY_LIMIT : 0 });
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
  // Sweep&Go limits how many calls a minute; past it every answer is 429
  // "Too Many Attempts". Pace the calls to stay under it, and if one still
  // comes back 429, wait and ask again rather than fail the run.
  var now = Date.now(); while (SG_CALLS.length && SG_CALLS[0] < now - 60000) SG_CALLS.shift();
  if (SG_CALLS.length >= SG_PER_MIN) { var hold = SG_CALLS[0] + 60000 - now; if (hold > 0) Utilities.sleep(hold); SG_CALLS.shift(); }
  SG_CALLS.push(Date.now());
  var waits = [15, 30, 60], r, code;
  for (var i = 0; ; i++) {
    r = UrlFetchApp.fetch(SG_BASE + path, opts); code = r.getResponseCode();
    if (code !== 429 || i >= waits.length) break;
    var after = 0; try { after = parseInt((r.getAllHeaders() || {})['Retry-After'], 10) || 0; } catch (e) {}
    Utilities.sleep(Math.min(Math.max(after, waits[i]), 90) * 1000);
  }
  if (code >= 400) throw new Error('Sweep&Go ' + code + ' on ' + path + ': ' + r.getContentText().slice(0, 120));
  return JSON.parse(r.getContentText() || '{}');
}
/* Walks every page of a paginated list. Two shapes exist: {data, paginate}
   and {invoices|payments|subscriptions: {data, last_page}}. Sweep&Go allows
   at most 50 a page (it answers 422 to more). */
var SG_PAGE = 50;
var SG_PER_MIN = 40, SG_CALLS = [];   // calls this run has made, newest last; the pace keeps under Sweep&Go's limit
function sgAll_(path, key, maxPages) { return sgAllUntil_(path, key, null, maxPages); }
/* The same, stopping early once a whole page is older than we need (the
   lists come newest first; if a list turns out oldest first the stop is
   ignored and every page is read). */
function sgAllUntil_(path, key, stop, maxPages) {
  var out = [], page = 1, pages = 1, ordered = null;
  do {
    var d = sgFetch_(path + (path.indexOf('?') >= 0 ? '&' : '?') + 'page=' + page + '&length=' + SG_PAGE);
    var box = key && d[key] ? d[key] : d, items = box.data || [];
    items.forEach(function(x) { out.push(x); });
    pages = box.paginate ? (box.paginate.total_pages || 1) : (box.last_page || 1);
    page++;
    if (stop && items.length) {
      if (ordered === null && items.length > 1) { var a = sgWhen_(items[0]), b = sgWhen_(items[items.length - 1]); ordered = a && b ? (a >= b ? 'desc' : 'asc') : null; }
      if (ordered === 'desc' && items.every(stop)) break;
    }
  } while (page <= pages && page <= (maxPages || 100));
  return out;
}
function sgWhen_(x) { return String(x.created_at || x.date || '').slice(0, 10); }
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
    // active clients with no subscription at all, by Sweep&Go's own list
    var noSub = {}; try { sgAll_('/api/v1/clients/active_no_subscription').forEach(function(c) { if (c.client) noSub[c.client] = 1; }); } catch (e2b) {}
    // what each customer is actually invoiced each month, from the last billing pull
    var lastInv = {}; try { lastInv = sgLastInvoices_(); } catch (e2c) {}
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
      // the price: the subscription record, unless the invoices say otherwise.
      // Some old subscriptions carry a per-visit figure ($15) against a
      // monthly invoice ($65); whatever Sweep&Go actually bills is the price.
      var monthly = sub ? sub.monthly : 0, deo = sub ? sub.deo : 0, li = lastInv[sgNorm_(name)];
      if (sub && sub.active && li && li.total > 0) {
        var vpm = sgVisitsPerMonth_(plan || 'weekly');
        if (Math.abs(monthly + deo - li.total) > 0.2 * li.total) {
          if (Math.abs(monthly * vpm + deo - li.total) <= 0.2 * li.total) monthly = monthly * vpm;   // the record was per visit
          else { monthly = li.total - deo; if (monthly <= 0) { monthly = li.total; deo = 0; } }   // the invoice is the truth
        }
      }
      var total = sub ? Math.round(monthly + deo) : 0;
      var price = total ? '$' + total + '/mo' + (deo ? ' (includes $' + Math.round(deo) + ' deodorize)' : '') : '';
      var offSchedule = c.off_schedule === true || c.off_schedule === 1 || c.off_schedule === '1';
      var set = { DAY: sgDayKeys_(c.service_days), CD: (sub && (sub.start || sub.anyStart)) || '', SGID: String(c.client || ''), PZ: (sub && sub.paused && sub.pause) ? sub.pause : '',
                  OS: active && offSchedule ? '1' : '',                                                   // Sweep&Go's own "off schedule" flag
                  SS: active && (!sub || !sub.active || noSub[c.client]) ? 'none' : '' };                  // active client, no live subscription
      // a quoted price still waiting to be set in Sweep&Go: clear the reminder once their price matches
      var qpRow = latest[id] && latest[id].row >= 0 ? String(data[latest[id].row][HEADERS.indexOf('crmnotes')] || '').match(/\[QP:(\d+(?:\.\d+)?)\]/) : null;
      if (qpRow && sub && Math.abs(monthly - parseFloat(qpRow[1])) <= 1) set.QP = '';
      var pmRow = latest[id] && latest[id].row >= 0 ? String(data[latest[id].row][HEADERS.indexOf('crmnotes')] || '').match(/\[PM:(\d+(?:\.\d+)?)@/) : null;
      if (pmRow && sub && monthly >= parseFloat(pmRow[1]) - 1) set.PM = '';
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
          cur.name = cur.name || String(j.full_name);
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
        // matched by phone under another spelling: keep Sweep&Go's, so invoices and visits (names only) still find this card
        if (pn.indexOf('t:') === 0 && pin.name && sgNorm_(pin.name) !== sgNorm_(data2[r3][nameCol])) set2.AKA = pin.name;
        var next = sgSetMarkers_(cur, set2);
        if (sgNotesEqual_(next, cur)) continue;
        notesCol[r3 - 1] = [safeCell_(next)]; changed = true;
        if (set2.LL && cur.indexOf('[LL:' + set2.LL + ']') < 0) summary.pinned++;
      }
      if (changed && !dry && notesCol.length) sh.getRange(2, nCol + 1, notesCol.length, 1).setValues(notesCol);
    } catch (e3) { summary.errors.push('dispatch: ' + e3.message); }
    // ---- billing: fifty-odd pages the first time, so it runs on its own a
    // minute from now (Google stops any one run at six minutes) ----
    if (!dry) { try { sgScheduleBilling_(); summary.billing = 'scheduled'; } catch (e4) { summary.errors.push('billing: ' + e4.message); } }
    // ---- Sweep&Go's route report: the last two weeks and the next two days
    // for the tracker, and every day kept for good in the routes sheet (the
    // mileage log the accountant wants) ----
    try {
      var rep = {}, kept = [];
      for (var k2 = -14; k2 <= 1; k2++) {
        var d2 = new Date(Date.now() + k2 * 86400000).toISOString().slice(0, 10);
        var rr = sgFetch_('/api/v2/report/route_planning_report?date=' + d2);
        var list = (rr.route_reports || []).map(function(x) { return { who: x.assigned_to_name, min: x.duration, drive: x.driving_time, clean: x.cleanup_time, mi: x.distance, jobs: x.number_of_jobs, price: x.price }; });
        if (list.length) { rep[d2] = list; summary.routes += list.length; if (k2 <= 0) list.forEach(function(x) { kept.push([d2, x.who || '', x.mi || 0, x.min || 0, x.drive || 0, x.clean || 0, x.jobs || 0, x.price || 0]); }); }
      }
      if (!dry) { sgConfig_('sg_routes', JSON.stringify(rep)); routesUpsert_(kept); }
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
    // ---- commercial accounts: one row per location, with its subscriptions ----
    try { summary.commercial = sgCommercial_(dry, sh, latest, byName); } catch (e8) { summary.errors.push('commercial: ' + e8.message); }
    summary.finished = new Date().toISOString();
    if (!dry) sgConfig_('sg_last_sync', JSON.stringify({ at: summary.finished, clients: summary.clients, added: summary.added, updated: summary.updated, pinned: summary.pinned, invoices: summary.invoices, jobs: summary.jobs || 0, leads: summary.leads || 0, errors: summary.errors.slice(0, 3) }));
  } finally { lock.releaseLock(); }
  return summary;
}
/* ---- the routes sheet: one row per driver per day, kept for good ----
   Miles, minutes, driving minutes, stops and the day's price, from Sweep&Go's
   own route report. The mileage log: at the standard rate a year of these
   is real money off the taxes, and nobody was writing it down. */
var ROUTES_HEADERS = ['date','who','miles','minutes','drive','clean','jobs','price'];
function routesSheet_() {
  var ss = sheet_().getParent(), sh = ss.getSheetByName('routes');
  if (!sh) { sh = ss.insertSheet('routes'); sh.appendRow(ROUTES_HEADERS); try { sh.getRange(1, 1, sh.getMaxRows(), ROUTES_HEADERS.length).setNumberFormat('@'); } catch (e) {} }
  return sh;
}
function routesUpsert_(rows) {
  if (!rows.length) return 0;
  var sh = routesSheet_(), W = ROUTES_HEADERS.length, have = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, W).getValues() : [];
  var key = function(r) { return String(r[0]).slice(0, 10) + '|' + sgNorm_(r[1]); }, fresh = {}; rows.forEach(function(r) { fresh[key(r)] = r; });
  var out = have.filter(function(r) { return !fresh[key(r)]; }).concat(rows).map(function(r) { return r.map(function(v) { return safeCell_(v == null ? '' : v); }); });
  out.sort(function(a, b) { return String(a[0]) < String(b[0]) ? -1 : 1; });
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, W).clearContent();
  sh.getRange(2, 1, out.length, W).setValues(out);
  return out.length;
}
/* Back to the start of last year, a hundred days a run, in its own runs
   after the first billing pull; stops by itself when it reaches the start. */
var ROUTES_BACK_TO = (new Date().getFullYear() - 1) + '-01-01';
function sgRoutesBackfill() {
  try { ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'sgRoutesBackfill') ScriptApp.deleteTrigger(t); }); } catch (e0) {}
  var sh = routesSheet_(), have = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function(r) { return String(r[0]).slice(0, 10); }) : [];
  var oldest = have.length ? have.sort()[0] : new Date().toISOString().slice(0, 10);
  var rows = [], d = new Date(oldest + 'T12:00:00'), n = 0, from = '';
  while (n < 100) {
    d.setDate(d.getDate() - 1); var ds = d.toISOString().slice(0, 10); if (ds < ROUTES_BACK_TO) break;
    from = ds; n++;
    try { var rr = sgFetch_('/api/v2/report/route_planning_report?date=' + ds); (rr.route_reports || []).forEach(function(x) { rows.push([ds, x.assigned_to_name || '', x.distance || 0, x.duration || 0, x.driving_time || 0, x.cleanup_time || 0, x.number_of_jobs || 0, x.price || 0]); }); }
    catch (e) { break; }
  }
  // a day with no route still counts as looked at: mark it so the next run moves on
  if (from && !rows.some(function(r) { return r[0] === from; })) rows.push([from, '', 0, 0, 0, 0, 0, 0]);
  routesUpsert_(rows);
  var done = !from || from <= ROUTES_BACK_TO;
  if (!done) { try { ScriptApp.newTrigger('sgRoutesBackfill').timeBased().after(60 * 1000).create(); } catch (e2) {} }
  Logger.log('Routes backfill: ' + rows.length + ' rows, back to ' + (from || oldest) + (done ? ', done' : ', more in a minute'));
  return { ok:true, rows: rows.length, from: from, done: done };
}
/* Miles by month, from the routes sheet. */
function mileage_() {
  var sh = sheet_().getParent().getSheetByName('routes'), months = {}, days = {};
  if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, ROUTES_HEADERS.length).getValues().forEach(function(r) {
    var d = String(r[0] || '').slice(0, 10), mi = parseFloat(r[2]) || 0; if (!/^\d{4}-\d{2}/.test(d) || !mi) return;
    var mk = d.slice(0, 7), m = months[mk] || (months[mk] = { miles: 0, days: {} }); m.miles += mi; m.days[d] = 1;
  });
  var out = {}; Object.keys(months).sort().forEach(function(k) { out[k] = { miles: Math.round(months[k].miles), days: Object.keys(months[k].days).length }; });
  return out;
}
function mileageCsv_() { var m = mileage_(); return 'month,miles,days_driven\n' + Object.keys(m).map(function(k) { return [k, m[k].miles, m[k].days].join(','); }).join('\n') + '\n'; }
/* The last recurring monthly invoice per customer, from the billing sheet
   (yesterday's pull is fine): what Sweep&Go actually charges them. Only
   invoices inside 45 days count, and not initial or prorated ones. */
function sgLastInvoices_() {
  var sh = sheet_().getParent().getSheetByName('billing'); if (!sh || sh.getLastRow() < 2) return {};
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, BILLING_HEADERS.length).getValues(), H = {}; BILLING_HEADERS.forEach(function(h, i) { H[h] = i; });
  var cut = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10), out = {};
  rows.forEach(function(r) {
    if (r[H.kind] !== 'invoice' || r[H.type] === 'one-time') return;
    var when = String(r[H.date] || '').slice(0, 10), st = String(r[H.status] || ''), iv = String(r[H.interval] || '').toLowerCase();
    if (when < cut || st === 'voided' || st === 'void' || /initial|prorat/.test(iv) || (iv && iv !== 'monthly')) return;
    var k = sgNorm_(r[H.client]), tot = parseFloat(r[H.total]) || 0; if (!k || !tot) return;
    if (!out[k] || when > out[k].date) out[k] = { date: when, total: tot };
  });
  return out;
}
/* Commercial accounts from Sweep&Go's commercial side: one tracker row per
   location, priced from the commercial subscriptions, typed "commercial".
   Their invoices and visits already come through under the company name. */
function sgCommercial_(dry, sh, latest, byName) {
  var subs = [], clients = [], n = 0;
  try { subs = sgAll_('/api/v2/commercial/subscriptions', 'subscriptions'); } catch (e) { return 0; }   // no commercial side on this account
  try { clients = sgAll_('/api/v2/commercial_clients/active').concat(sgAll_('/api/v2/commercial_clients/inactive')); } catch (e2) {}
  var byLoc = {};
  subs.forEach(function(sb) {
    var k = sgNorm_(sb.commercial_client) + '|' + sgNorm_(sb.commercial_location), b = byLoc[k] || (byLoc[k] = { monthly: 0, start: '', end: '', active: false, reason: '', plan: '' });
    var active = /^(active|paused)$/i.test(String(sb.status || '')), plan = sgPlan_(sb.frequency) || 'weekly';
    if (active) { b.active = true; b.monthly += sgMonthly_(sb, plan); b.plan = plan; }
    if (!b.start || (sb.start_date && sb.start_date < b.start)) b.start = sb.start_date || b.start;
    if (!active) { b.end = sb.canceled_at ? String(sb.canceled_at).slice(0, 10) : (sb.end_date || b.end); b.reason = sb.termination_reason || b.reason; }
  });
  var data = sh.getDataRange().getValues(), today = new Date().toISOString().slice(0, 10), appended = [];
  clients.forEach(function(c) {
    var locs = c.locations && c.locations.length ? c.locations : [{ location: c.client, name: '', status: c.status }];
    locs.forEach(function(L) {
      var name = String(c.name || '').trim() + (locs.length > 1 && L.name ? ' \u2013 ' + String(L.name).trim() : '');
      var b = byLoc[sgNorm_(c.name) + '|' + sgNorm_(L.name)] || byLoc[sgNorm_(c.name) + '|'] || null;
      var active = String(c.status || '').toLowerCase() === 'active' && String(L.status || 'active').toLowerCase() === 'active';
      var id = byName[sgNorm_(name)] || '';
      if (!id) Object.keys(byName).forEach(function(nm) { if (!id && nm.indexOf(sgNorm_(c.name)) === 0 && latest[byName[nm]] && latest[byName[nm]].row >= 0 && String(data[latest[byName[nm]].row][HEADERS.indexOf('service')] || '').toLowerCase() === 'commercial') id = byName[nm]; });
      if (!id) id = 'sg' + String(L.location || c.client || sgNorm_(name)).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
      if (!active && !b && !latest[id]) return;
      var total = b && b.active ? Math.round(b.monthly) : 0, price = total ? '$' + total + '/mo' : '';
      var set = { SGID: String(L.location || c.client || ''), CM: '1', DAY: sgDayKeys_(L.service_days), CD: (b && b.start) || '', CX: active ? '' : ((b && b.end) || ''), CXR: active ? '' : sgReason_(b && b.reason) };
      var status = active ? 'closed' : 'cancelled';
      if (latest[id] && latest[id].row >= 0) {
        var row = data[latest[id].row], notes = sgSetMarkers_(String(row[HEADERS.indexOf('crmnotes')] || ''), set), newRow = row.slice(), touched = false;
        var ch = { status: status, crmnotes: notes, service: 'commercial' }; if (price) ch.price = price; if (!row[HEADERS.indexOf('name')]) ch.name = name;
        if (L.billing_address && !row[HEADERS.indexOf('address')]) ch.address = [L.billing_address, L.billing_city, L.billing_zip].filter(Boolean).join(', ');
        if (L.billing_zip && !row[HEADERS.indexOf('zip')]) ch.zip = String(L.billing_zip);
        Object.keys(ch).forEach(function(h) { var col = HEADERS.indexOf(h); if (col < 0) return; if (h === 'crmnotes' ? sgNotesEqual_(row[col], ch[h]) : String(row[col] || '') === String(ch[h])) return; newRow[col] = safeCell_(ch[h]); touched = true; });
        if (touched) { newRow[HEADERS.indexOf('updated')] = new Date().toISOString(); if (!dry) sh.getRange(latest[id].row + 1, 1, 1, HEADERS.length).setValues([newRow]); data[latest[id].row] = newRow; n++; }
      } else if (!latest[id]) {
        var l = { id: id, created: (b && b.start ? b.start + 'T12:00:00.000Z' : new Date().toISOString()), type: 'SAVED', name: name, phone: '', email: String(L.email || ''), address: [L.billing_address, L.billing_city, L.billing_zip].filter(Boolean).join(', '), zip: String(L.billing_zip || ''),
                  service: 'commercial', dogs: '', yard: '', deodorize: 'no', hero: '', price: price, manual: '', honored: '', notes: '', status: status, crmnotes: sgSetMarkers_('[IC:w] [QA:a] Commercial account, synced from Sweep&Go ' + today + '.', set), updated: new Date().toISOString() };
        appended.push(HEADERS.map(function(h) { return safeCell_(l[h] == null ? '' : l[h]); })); latest[id] = { row: -2, key: l.created }; n++;
      }
    });
  });
  if (appended.length && !dry) sh.getRange(sh.getLastRow() + 1, 1, appended.length, HEADERS.length).setValues(appended);
  return n;
}
/* The billing pull as its own run: invoices and payments into their sheet,
   then a CONFIG row with the result, then its one-off trigger removed. */
function sgScheduleBilling_() {
  ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'sgBillingSync') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sgBillingSync').timeBased().after(60 * 1000).create();
}
function sgBillingSync() {
  try { ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'sgBillingSync') ScriptApp.deleteTrigger(t); }); } catch (e0) {}
  var lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) return { ok:false, error:'busy' };
  var out = { ok:true, started: new Date().toISOString() };
  try { var r = sgPullBilling_(false); out.rows = r.rows; out.full = r.full; out.fetched = r.fetched; }
  catch (e) { out.ok = false; out.error = String(e && e.message || e).slice(0, 200); }
  finally { lock.releaseLock(); }
  // the mileage log back to last January, a hundred days a run, when there is little of it yet
  try { var rs = sheet_().getParent().getSheetByName('routes'); if (!rs || rs.getLastRow() < 60) { ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'sgRoutesBackfill') ScriptApp.deleteTrigger(t); }); ScriptApp.newTrigger('sgRoutesBackfill').timeBased().after(90 * 1000).create(); out.backfill = 'scheduled'; } } catch (e3) {}
  out.finished = new Date().toISOString();
  try { sgConfig_('sg_last_billing', JSON.stringify(out)); } catch (e2) {}
  Logger.log('Billing pull: ' + JSON.stringify(out));
  return out;
}
/* The first sync after install, in its own run so install itself is quick. */
function sgSyncOnce() {
  try { ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'sgSyncOnce') ScriptApp.deleteTrigger(t); }); } catch (e0) {}
  var s = sgSync();
  Logger.log('First sync: ' + JSON.stringify(s, null, 1));
  return s;
}
/* Read back how the last sync and the last billing pull went. */
function sgStatus() {
  var a = cfg_('sg_last_sync'), b = cfg_('sg_last_billing');
  Logger.log('Last sync: ' + (a || 'none yet'));
  Logger.log('Last billing pull: ' + (b || 'none yet'));
  return { sync: a, billing: b };
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
function sgPullBilling_(dry, wantFull) {
  var sh = billingSheet_(), W = BILLING_HEADERS.length, H = {}; BILLING_HEADERS.forEach(function(h, i) { H[h] = i; });
  var existing = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, W).getValues() : [];
  // the whole history the first time and every Sunday (self-healing); otherwise the last 60 days of what we already have, refreshed
  var newest = ''; existing.forEach(function(r) { var d = String(r[H.date] || ''); if (d > newest) newest = d; });
  var full = !!wantFull || !existing.length || !newest || new Date().getDay() === 0;
  var cutoff = full ? '' : new Date(new Date(newest + 'T12:00:00').getTime() - 60 * 86400000).toISOString().slice(0, 10);
  var stop = cutoff ? function(v) { return sgWhen_(v) < cutoff; } : null;
  var rows = [], seen = {};
  var add = function(v, kind) {
    if (!v.invoice_number || seen[v.invoice_number]) return; seen[v.invoice_number] = 1;
    var isOne = kind === 'one-time' || /one[_ -]?time/i.test(String(v.type || ''));
    rows.push(['invoice', v.invoice_number, String(v.created_at || '').slice(0, 10), v.client_name || v.commercial_client || '', isOne ? 'one-time' : (v.type || 'subscription'), String(v.status || '').toLowerCase(), v.total, v.paid, v.remaining, v.billing_interval || '', String(v.period_start || '').slice(0, 10), v.pay_method || '', '']);
  };
  // the docs list two types: recurring and one_time
  sgAllUntil_('/api/v2/invoices?type=recurring', 'invoices', stop).forEach(function(v) { add(v, 'recurring'); });
  try { sgAllUntil_('/api/v2/invoices?type=one_time', 'invoices', stop).forEach(function(v) { add(v, 'one-time'); }); }
  catch (e) { try { sgAllUntil_('/api/v2/invoices', 'invoices', stop).forEach(function(v) { add(v, ''); }); } catch (e2) {} }
  sgAllUntil_('/api/v2/payments', 'payments', stop).forEach(function(p) {
    rows.push(['payment', '', String(p.date || '').slice(0, 10), p.client_name || p.commercial_client || '', p.type || '', String(p.status || '').toLowerCase(), p.amount, p.amount, p.tip_amount || '', '', '', p.type || '', String(p.description || '').slice(0, 80)]);
  });
  if (dry) return { rows: rows.length, full: full, fetched: rows.length };
  // a partial pull replaces only the window it covers; everything older stays as it was
  var keep = full ? [] : existing.filter(function(r) { return String(r[H.date] || '') < cutoff; });
  var fresh = (full ? rows : rows.filter(function(r) { return String(r[2] || '') >= cutoff; })).map(function(r) { return r.map(function(v) { return safeCell_(v == null ? '' : v); }); });
  var all = keep.concat(fresh);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, W).clearContent();
  if (all.length) sh.getRange(2, 1, all.length, W).setValues(all);
  return { rows: all.length, full: full, fetched: rows.length };
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
  var out = { ok:true, days: 30, visits: 0, minutes: 0, timed: 0, skipped: 0, skipReasons: {}, byDogs: {}, byDate: {}, techs: {}, skippedBy: {}, rate: { byPlan: {}, byDogs: {}, byWeekday: {} }, byClient: {} };
  var mins = {}, WD = ['sun','mon','tue','wed','thu','fri','sat'], cm = {}, recent = {};
  var bump = function(map, k, price, m) { var b = map[k] || (map[k] = { n: 0, price: 0, min: 0 }); b.n++; b.price += price; b.min += m; };
  rows.forEach(function(r) {
    var dt = String(r[H.date] || ''); if (!dt) return;
    // the last five visits at each house, over the whole 45 days the sheet holds
    var nm = String(r[H.client] || ''); if (nm) { var rc = recent[nm] || (recent[nm] = []); rc.push({ d: dt, min: Math.round(parseFloat(r[H.minutes]) || 0), who: String(r[H.tech] || '').split(' ')[0], skip: /skip/.test(String(r[H.status] || '')) ? String(r[H.skip_reason] || 'skipped') : '' }); }
    if (dt < cut) return;
    var st = String(r[H.status] || ''), m = parseFloat(r[H.minutes]) || 0, dogs = String(r[H.dogs] || '') || '?';
    var day = out.byDate[dt] || (out.byDate[dt] = { visits: 0, skipped: 0, minutes: 0, price: 0 });
    if (/skip/.test(st)) { out.skipped++; day.skipped++; var why = String(r[H.skip_reason] || 'no reason given'); out.skipReasons[why] = (out.skipReasons[why] || 0) + 1; var who = String(r[H.client] || ''); if (who) out.skippedBy[who] = (out.skippedBy[who] || 0) + 1; return; }
    if (!/complet|done/.test(st)) return;
    var price = parseFloat(r[H.price]) || 0;
    out.visits++; day.visits++; day.price += price;
    if (r[H.tech]) out.techs[r[H.tech]] = (out.techs[r[H.tech]] || 0) + 1;
    if (m > 0 && m < 180) {
      out.minutes += m; out.timed++; day.minutes += m; (mins[dogs] = mins[dogs] || []).push(m);
      var who2 = String(r[H.client] || ''); if (who2) { var cc = cm[who2] || (cm[who2] = { mins: [], price: 0, n: 0 }); cc.mins.push(m); cc.price += price; cc.n++; }
      if (price > 0) {
        var plan = String(r[H.plan] || '').toLowerCase().replace(/[^a-z]/g, '') || 'other';
        plan = /twotimes|2xw|twice/.test(plan) ? 'twice a week' : /biweek|everyother|bw/.test(plan) ? 'every other week' : /month|1xm/.test(plan) ? 'monthly' : /week|1xw/.test(plan) ? 'weekly' : plan;
        bump(out.rate.byPlan, plan, price, m); bump(out.rate.byDogs, dogs, price, m);
        var wd = WD[new Date(dt + 'T12:00:00').getDay()]; bump(out.rate.byWeekday, wd, price, m);
      }
    }
  });
  Object.keys(mins).forEach(function(k) { out.byDogs[k] = { n: mins[k].length, median: Math.round(median_(mins[k]) * 10) / 10 }; });
  Object.keys(cm).forEach(function(k) { var c = cm[k]; out.byClient[k] = { n: c.n, med: Math.round(median_(c.mins) * 10) / 10, price: Math.round(c.price / c.n * 100) / 100 }; });
  ['byPlan', 'byDogs', 'byWeekday'].forEach(function(g) { Object.keys(out.rate[g]).forEach(function(k) { var b = out.rate[g][k]; b.price = Math.round(b.price); b.min = Math.round(b.min); b.perHour = b.min ? Math.round(b.price / (b.min / 60)) : 0; }); });
  out.minutes = Math.round(out.minutes);
  Object.keys(out.byDate).forEach(function(k) { out.byDate[k].minutes = Math.round(out.byDate[k].minutes); out.byDate[k].price = Math.round(out.byDate[k].price); });
  out.recent = {}; Object.keys(recent).forEach(function(k) { out.recent[k] = recent[k].sort(function(a, b) { return a.d < b.d ? 1 : -1; }).slice(0, 5); });
  return out;
}
/* What the tracker's billing card shows: by month, billed (voids out),
   collected, unpaid; plus the unpaid list by customer. Small on purpose. */
function sgBilling_() {
  var sh = billingSheet_(); if (sh.getLastRow() < 2) return { ok:true, months: {}, unpaid: [], empty: true };
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, BILLING_HEADERS.length).getValues();
  var H = {}; BILLING_HEADERS.forEach(function(h, i) { H[h] = i; });
  var months = {}, unpaidBy = {}, lastPay = {}, last = {};
  // the last day money moved for each customer: a recurring invoice or a payment that went through
  var touch = function(who, when) { var k = sgNorm_(who); if (!k || !/^\d{4}-\d{2}-\d{2}/.test(when)) return; when = when.slice(0, 10); if (!last[k] || when > last[k]) last[k] = when; };
  rows.forEach(function(r) {
    var mo = String(r[H.date] || '').slice(0, 7); if (!/^\d{4}-\d{2}$/.test(mo)) return;
    var m = months[mo] || (months[mo] = { billed: 0, onetime: 0, collected: 0, unpaid: 0, failed: 0, invoices: 0, tips: 0, customers: {} });
    var status = String(r[H.status] || ''), total = parseFloat(r[H.total]) || 0;
    if (r[H.kind] === 'invoice') {
      if (status === 'voided' || status === 'void') return;
      if (r[H.type] !== 'one-time') touch(r[H.client], String(r[H.date] || ''));
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
      if (status === 'succeeded' || status === 'paid') { m.collected += total; m.tips += parseFloat(r[H.remaining]) || 0; touch(who, when); }
      else if (status === 'failed') m.failed++;
      // the latest card result per customer: a failure with nothing good after it is a card to chase
      if (who && (status === 'succeeded' || status === 'failed') && (!lastPay[who] || when >= lastPay[who].when)) lastPay[who] = { when: when, status: status, amount: total };
    }
  });
  var cut60 = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10);
  var declining = Object.keys(lastPay).filter(function(k) { return lastPay[k].status === 'failed' && lastPay[k].when >= cut60; }).map(function(k) { return { name: k, when: lastPay[k].when, amount: Math.round(lastPay[k].amount) }; }).sort(function(a, b) { return b.when < a.when ? -1 : 1; }).slice(0, 40);
  Object.keys(months).forEach(function(k) { months[k].customers = Object.keys(months[k].customers).length; ['billed','onetime','collected','unpaid','tips'].forEach(function(f) { months[k][f] = Math.round(months[k][f]); }); });
  var unpaid = Object.keys(unpaidBy).map(function(k) { var u = unpaidBy[k]; u.owed = Math.round(u.owed); return u; }).sort(function(a, b) { return b.owed - a.owed; }).slice(0, 40);
  return { ok:true, months: months, unpaid: unpaid, declining: declining, last: last, rows: rows.length };
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
  // somebody signed up straight in Sweep&Go: the phones hear within minutes
  if (/onboarding|subscription[_: ]?created/i.test(ev)) {
    try { var b2 = JSON.parse(raw), who = String(b2.client_name || b2.name || ((b2.first_name || '') + ' ' + (b2.last_name || '')) || '').trim() || 'Someone', topic0 = pushTopic_();
      if (topic0) UrlFetchApp.fetch('https://ntfy.sh/' + encodeURIComponent(topic0), { method: 'post', contentType: 'text/plain; charset=utf-8', payload: who + ' just signed up in Sweep&Go (' + ev + '). The tracker picks them up within minutes.', headers: { 'Title': 'New sign-up in Sweep&Go', 'Tags': 'tada', 'Click': 'https://www.clpropetservices.com/hq-8k3v51/' }, muteHttpExceptions: true });
    } catch (e4) {}
  }
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
/* ---- follow-up emails for quotes that went quiet ----
   Jesse: "the one feature here that makes money by itself". A quote with
   no answer gets a short personal email two days on, one more six days
   on, then nothing. It stops the moment they accept, decline, get
   called or texted, or ask to be left alone. Each send is stamped
   [FE:step@date] so it never repeats and the office can see it. Off
   until the office switches it on (CONFIG fu_emails = on). */
var FU_STEPS = [
  { step: 1, afterDays: 2, subject: '{first}, your yard price is saved - any questions?',
    body: 'Hi {first},\n\nIt\u2019s Corey with CL Professional Pet Services. You looked at a price for {plan} the other day and I wanted to make sure you had what you needed.\n\nYour price of {price} is saved for six months either way, the $40 initial clean is waived right now, and there is no contract - month to month, cancel any time.\n\nIf you have a question about the yard, the day, or the dogs, just reply here or text me at (636) 375-4342. Happy to help either way.' },
  { step: 2, afterDays: 6, subject: 'Last note from me, {first}',
    body: 'Hi {first},\n\nOne last note so I am not filling your inbox. Your price of {price} for {plan} stays locked for six months, so there is no rush.\n\nIf the timing is off, no problem at all. If you would like us to take the yard off your plate, reply here or text (636) 375-4342 and I will get you on the schedule this week.' }
];
var FU_FOOTER = '\n\n\u2014 Corey\nCL Professional Pet Services LLC \u00b7 St. Peters, MO \u00b7 (636) 375-4342 \u00b7 clpropetservices.com\nReply STOP and we\u2019ll leave you off future emails.';
function fuFill_(t, r) { return String(t).split('{first}').join(r.first).split('{price}').join(r.price).split('{plan}').join(r.plan); }
/* Which quotes are due which step, today. Pure, so it can be tested. */
function followupsDue_(rows, now) {
  now = now || new Date();
  var H = {}; HEADERS.forEach(function(h, i) { H[h] = i; });
  var latest = {}, NOT = { VIEW:1, QVIEW:1, OUTAREA:1, WAITLIST:1, AUTH:1, SPEND:1, CONFIG:1 }, auths = {};
  for (var i = 1; i < rows.length; i++) {
    var t = String(rows[i][H.type] || '');
    if (t === 'AUTH') { auths[String(rows[i][H.zip] || '')] = 1; continue; }
    if (NOT[t]) continue;
    var id = String(rows[i][H.id]), key = String(rows[i][H.created] || '');
    if (!latest[id] || key >= latest[id].key) latest[id] = { key: key, r: rows[i], anyType: {} };
  }
  var due = [];
  Object.keys(latest).forEach(function(id) {
    var r = latest[id].r, st = String(r[H.status] || 'new'), notes = String(r[H.crmnotes] || ''), type = String(r[H.type] || '');
    if (st !== 'new' || auths[id]) return;                                   // called, closed, lost, cancelled: not ours to chase
    if (type === 'ACTIVATE' || type === 'DECLINED' || type === 'COMMERCIAL') return;
    if (/\[QA:[ad]\]/.test(notes)) return;                                   // answered
    if (/\[(ATT|TX|NOEM|TM):/.test(notes)) return;                           // somebody reached out, or they asked to be left alone, or a test
    var email = String(r[H.email] || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    var price = String(r[H.price] || '').split(',')[0].split(' (')[0].trim();
    if (price.indexOf('$') < 0 || String(r[H.manual] || '').toUpperCase() === 'YES') return;   // no price to remind them of
    var created = new Date(r[H.created]); if (isNaN(created.getTime())) return;
    var ageDays = (now.getTime() - created.getTime()) / 86400000;
    if (ageDays > 21) return;                                                 // too old to chase by email
    var sent = {}; (notes.match(/\[FE:(\d)@(\d{4}-\d{2}-\d{2})\]/g) || []).forEach(function(m) { var mm = m.match(/\[FE:(\d)@([^\]]+)\]/); sent[mm[1]] = mm[2]; });
    var next = null;
    FU_STEPS.forEach(function(sstep) { if (!next && !sent[sstep.step] && ageDays >= sstep.afterDays && (sstep.step === 1 || sent[sstep.step - 1])) next = sstep; });
    if (!next) return;
    if (next.step === 2 && sent[1] && (now.getTime() - new Date(sent[1] + 'T12:00:00').getTime()) / 86400000 < 3) return;   // not two emails in three days
    var name = String(r[H.name] || '').trim().split(/\s+/)[0] || 'there';
    var plan = String(r[H.service] || '').toLowerCase() || 'your plan';
    due.push({ id: id, step: next.step, email: email, first: name, price: price, plan: plan, notes: notes });
  });
  return due;
}
function quoteFollowups() {
  if (cfg_('fu_emails') !== 'on') { Logger.log('Follow-up emails are off (CONFIG fu_emails).'); return { ok:true, off:true, sent:0 }; }
  if (!officeMailReady_()) { Logger.log('Follow-up emails: switch is on but the ' + NO_OFFICE_MAIL + ', so nothing goes.'); return { ok:true, off:true, reason: NO_OFFICE_MAIL, sent:0 }; }
  var sh = sheet_(), rows = sh.getDataRange().getValues(), due = followupsDue_(rows, new Date()), sent = 0, today = new Date().toISOString().slice(0, 10);
  var idCol = HEADERS.indexOf('id'), nCol = HEADERS.indexOf('crmnotes');
  due.slice(0, 40).forEach(function(d) {
    var step = FU_STEPS[d.step - 1];
    try {
      sendCustomerMail_({ to: d.email, subject: fuFill_(step.subject, d), body: fuFill_(step.body, d) + FU_FOOTER });
      sent++;
      for (var i = 1; i < rows.length; i++) if (String(rows[i][idCol]) === d.id) sh.getRange(i + 1, nCol + 1).setValue(safeCell_('[FE:' + d.step + '@' + today + '] ' + String(rows[i][nCol] || '')));
    } catch (e) {}
  });
  return { ok:true, due: due.length, sent: sent };
}
/* ---- the welcome sequence ----
   Day 1 after a customer starts: what to expect and how to reach us.
   Day 30: how is it going, and the review link if there is one. Off
   until the office switches it on (CONFIG welcome_emails). The day-30
   email counts as the review ask, so the card does not ask again. */
var WE_STEPS = [
  { step: 1, from: 1, to: 6, subject: 'Welcome aboard, {first} - what happens next',
    body: 'Hi {first},\n\nThanks for choosing CL Professional Pet Services - we are glad to have you.\n\nHere is how it works: we come on your service day, clean the whole yard, haul the waste away and make sure the gate is shut behind us. You will get a text when we are on the way and another when we are done. If the gate is locked or a dog is out, we text you and come back.\n\nAnything at all - a different day, a gate code, a dog who needs a minute to warm up to us - reply here or text (636) 375-4342.\n\nSee you on {day}!' },
  { step: 2, from: 30, to: 46, subject: 'How are we doing, {first}?',
    body: 'Hi {first},\n\nYou have been with us about a month now, so a quick check-in: is everything the way you want it? If anything is off, reply here and I will fix it myself.\n\nAnd if we have earned it, a Google review would mean the world to a small local business like ours. It takes a minute: {review}\n\nThank you for having us in your yard.' }
];
var WE_FOOTER = '\n\n\u2014 Corey\nCL Professional Pet Services LLC \u00b7 St. Peters, MO \u00b7 (636) 375-4342 \u00b7 clpropetservices.com\nReply STOP and we\u2019ll leave you off future emails.';
function welcomeDue_(rows, now, reviewLink) {
  now = now || new Date();
  var H = {}; HEADERS.forEach(function(h, i) { H[h] = i; });
  var latest = {}, NOT = { VIEW:1, QVIEW:1, OUTAREA:1, WAITLIST:1, AUTH:1, SPEND:1, CONFIG:1 };
  for (var i = 1; i < rows.length; i++) { var t = String(rows[i][H.type] || ''); if (NOT[t]) continue; var id = String(rows[i][H.id]), key = String(rows[i][H.created] || ''); if (!latest[id] || key >= latest[id].key) latest[id] = { key: key, r: rows[i] }; }
  var due = [], days = { mon:'Monday', tue:'Tuesday', wed:'Wednesday', thu:'Thursday', fri:'Friday', sat:'Saturday', sun:'Sunday' };
  Object.keys(latest).forEach(function(id) {
    var r = latest[id].r, st = String(r[H.status] || 'new'), notes = String(r[H.crmnotes] || '');
    if (st !== 'closed') return;
    if (/\[(NOEM|TM|PZ):/.test(notes)) return;
    var email = String(r[H.email] || '').trim(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    var cd = (notes.match(/\[CD:(\d{4}-\d{2}-\d{2})\]/) || [])[1]; if (!cd) return;
    var age = (now.getTime() - new Date(cd + 'T12:00:00').getTime()) / 86400000;
    var sent = {}; (notes.match(/\[WE:(\d)@[^\]]+\]/g) || []).forEach(function(m) { sent[m.match(/\[WE:(\d)/)[1]] = 1; });
    var next = null;
    WE_STEPS.forEach(function(w) { if (!next && !sent[w.step] && age >= w.from && age < w.to) next = w; });
    if (!next) return;
    if (next.step === 2 && /\[RV:/.test(notes)) return;   // already asked for a review by hand
    var dayKey = ((notes.match(/\[DAY:([^\]]*)\]/) || [])[1] || '').split(',')[0];
    due.push({ id: id, step: next.step, email: email, first: String(r[H.name] || '').trim().split(/\s+/)[0] || 'there', day: days[dayKey] || 'your service day', review: reviewLink || 'search for CL Professional Pet Services on Google' });
  });
  return due;
}
function welcomeEmails() {
  if (cfg_('welcome_emails') !== 'on') return { ok:true, off:true, sent:0 };
  if (!officeMailReady_()) { Logger.log('Welcome emails: switch is on but the ' + NO_OFFICE_MAIL + ', so nothing goes.'); return { ok:true, off:true, reason: NO_OFFICE_MAIL, sent:0 }; }
  var link = cfg_('review_link'); if (!/^https:\/\//.test(link)) link = '';
  var sh = sheet_(), rows = sh.getDataRange().getValues(), due = welcomeDue_(rows, new Date(), link), sent = 0, today = new Date().toISOString().slice(0, 10);
  var idCol = HEADERS.indexOf('id'), nCol = HEADERS.indexOf('crmnotes');
  due.slice(0, 30).forEach(function(d) {
    var w = WE_STEPS[d.step - 1], fill = function(t) { return String(t).split('{first}').join(d.first).split('{day}').join(d.day).split('{review}').join(d.review); };
    try {
      sendCustomerMail_({ to: d.email, subject: fill(w.subject), body: fill(w.body) + WE_FOOTER });
      sent++;
      for (var i = 1; i < rows.length; i++) if (String(rows[i][idCol]) === d.id) sh.getRange(i + 1, nCol + 1).setValue(safeCell_('[WE:' + d.step + '@' + today + '] ' + (d.step === 2 ? '[RV:' + today + '] ' : '') + String(rows[i][nCol] || '')));
    } catch (e) {}
  });
  return { ok:true, due: due.length, sent: sent };
}
/* ---- price notices ----
   The office picks who, the new price and the date; this sends each one
   a plain notice from Corey and stamps [PM:new@date] so the card shows
   it and the sync clears it once Sweep&Go carries the new price. */
function priceMove_(body) {
  var items = Array.isArray(body.items) ? body.items.slice(0, 60) : [], reason = clip_(body.reason, 300).trim(), when = String(body.date || '');
  if (!items.length || !/^\d{4}-\d{2}-\d{2}$/.test(when)) return { ok:false, error:'nothing to send' };
  if (!officeMailReady_()) return { ok:false, error: NO_OFFICE_MAIL };
  var sh = sheet_(), rows = sh.getDataRange().getValues(), idCol = HEADERS.indexOf('id'), nCol = HEADERS.indexOf('crmnotes');
  var pretty = new Date(when + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  var sent = [], failed = [];
  items.forEach(function(it) {
    var l = latestRow_(sh, String(it.id || '')); if (!l) { failed.push({ id: it.id, error: 'not found' }); return; }
    var email = String(l.email || '').trim(), first = String(l.name || '').trim().split(/\s+/)[0] || 'there', oldP = parseFloat(it.oldPrice) || 0, newP = parseFloat(it.newPrice) || 0;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { failed.push({ id: it.id, error: 'no email' }); return; }
    if (!(newP > 0)) { failed.push({ id: it.id, error: 'no price' }); return; }
    var text = 'Hi ' + first + ',\n\nA quick note about your service, with plenty of notice.' + (oldP ? ' Your price has been $' + oldP + ' a month' : '') + (oldP ? ', and on ' + pretty + ' it moves to $' + newP + ' a month' : ' On ' + pretty + ' your price moves to $' + newP + ' a month') + '.' +
      (reason ? ' ' + reason : '') + '\n\nNothing else changes: same day, same crew, same clean yard, still month to month with no contract. If you have any questions, or if money is tight right now, reply here and we will work it out - I would much rather talk than lose you.\n\nThank you for having us.';
    try {
      sendCustomerMail_({ to: email, subject: 'Your CL Professional Pet Services price from ' + pretty, body: text + WE_FOOTER });
      sent.push(it.id);
      for (var i = 1; i < rows.length; i++) if (String(rows[i][idCol]) === String(it.id)) sh.getRange(i + 1, nCol + 1).setValue(safeCell_(sgSetMarkers_(String(rows[i][nCol] || ''), { PM: newP + '@' + when })));
    } catch (e) { failed.push({ id: it.id, error: String(e && e.message || e).slice(0, 80) }); }
  });
  return { ok:true, sent: sent, failed: failed, date: when };
}
/* ---- the accountant's file: every invoice and payment, and the months ---- */
function billingCsv_() {
  var sh = billingSheet_(); if (sh.getLastRow() < 2) return { ok:true, csv: BILLING_HEADERS.join(',') + '\n', months: '' };
  var rows = sh.getRange(2, 1, sh.getLastRow() - 1, BILLING_HEADERS.length).getValues();
  var q = function(v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var csv = BILLING_HEADERS.join(',') + '\n' + rows.map(function(r) { return r.map(q).join(','); }).join('\n') + '\n';
  var f = sgBilling_(), ms = Object.keys(f.months || {}).sort();
  var months = 'month,billed,one_time,collected,unpaid,tips,failed_payments,customers_invoiced\n' + ms.map(function(k) { var m = f.months[k]; return [k, m.billed, m.onetime, m.collected, m.unpaid, m.tips, m.failed, m.customers].join(','); }).join('\n') + '\n';
  var miles = ''; try { miles = mileageCsv_(); } catch (e) {}
  return { ok:true, csv: csv, months: months, miles: miles, rows: rows.length };
}
/* ---- payment reminders ----
   Corey's collections question. A plain note from the office with the
   amount and how long it has been open; one tap from the Owed list, or on
   Mondays for everyone 14+ days behind while the switch (CONFIG
   pay_reminders) is on. Never twice inside 14 days. Stamped [PR:amount@date]. */
function payReminderText_(first, amount, since) {
  var days = since ? Math.round((Date.now() - new Date(since + 'T12:00:00').getTime()) / 86400000) : 0;
  return 'Hi ' + first + ',\n\nA quick note from the office: there is $' + Math.round(amount) + ' open on your account' + (days > 0 ? ', from ' + days + ' days ago' : '') + '. Most of the time this is just a card that expired or a payment that did not go through, nothing more.\n\nIf you have already taken care of it, thank you, and please ignore this. If not, you can update your card in the client portal, or reply here and we will sort it out together.\n\nThanks for having us.';
}
function sendPayReminder_(sh, rows, lead, amount, since) {
  var email = String(lead.email || '').trim(), first = String(lead.name || '').trim().split(/\s+/)[0] || 'there';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('no email');
  sendCustomerMail_({ to: email, subject: 'A quick note about your account', body: payReminderText_(first, amount, since) + WE_FOOTER });
  var today = new Date().toISOString().slice(0, 10), idCol = HEADERS.indexOf('id'), nCol = HEADERS.indexOf('crmnotes');
  for (var i = 1; i < rows.length; i++) if (String(rows[i][idCol]) === String(lead.id)) sh.getRange(i + 1, nCol + 1).setValue(safeCell_(sgSetMarkers_(String(rows[i][nCol] || ''), { PR: Math.round(amount) + '@' + today })));
  return today;
}
function payRemind_(body) {
  if (!officeMailReady_()) return { ok:false, error: NO_OFFICE_MAIL };
  var sh = sheet_(), l = latestRow_(sh, String(body.id || '')); if (!l) return { ok:false, error:'not found' };
  var amount = parseFloat(body.amount) || 0; if (!(amount > 0)) return { ok:false, error:'no amount' };
  try { var d = sendPayReminder_(sh, sh.getDataRange().getValues(), l, amount, String(body.since || '')); return { ok:true, date: d }; }
  catch (e) { return { ok:false, error: String(e && e.message || e).slice(0, 120) }; }
}
function paymentReminders() {
  if (cfg_('pay_reminders') !== 'on') return { ok:true, off:true, sent:0 };
  if (!officeMailReady_()) return { ok:true, off:true, reason: NO_OFFICE_MAIL, sent:0 };
  var f = sgBilling_(), sh = sheet_(), rows = sh.getDataRange().getValues(), H = {}; HEADERS.forEach(function(h, i) { H[h] = i; });
  var cut14 = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10), sent = 0, skipped = 0;
  var byName = {}; for (var i = rows.length - 1; i >= 1; i--) { var nm = sgNorm_(rows[i][H.name]); if (nm && !byName[nm]) { var o = {}; HEADERS.forEach(function(h, j) { o[h] = rows[i][j]; }); byName[nm] = o; var aka = (String(rows[i][H.crmnotes] || '').match(/\[AKA:([^\]]*)\]/) || [])[1]; if (aka && !byName[sgNorm_(aka)]) byName[sgNorm_(aka)] = o; } }
  (f.unpaid || []).forEach(function(u) {
    if (sent >= 20 || !u.oldest || u.oldest > cut14) return;
    var l = byName[sgNorm_(u.name)]; if (!l || String(l.status || '') !== 'closed') return;
    var notes = String(l.crmnotes || ''), last = (notes.match(/\[PR:\d+@(\d{4}-\d{2}-\d{2})\]/) || [])[1] || '';
    if (/\[(NOEM|TM):/.test(notes) || (last && last > cut14)) { skipped++; return; }
    try { sendPayReminder_(sh, rows, l, u.owed, u.oldest); sent++; } catch (e) { skipped++; }
  });
  return { ok:true, sent: sent, skipped: skipped };
}
/* ---- the month in review, emailed to the office on the 1st ---- */
function monthlyReportText_(mk) {
  var money = function(v) { return '$' + Math.round(v || 0).toLocaleString(); };
  var f = sgBilling_(), m = (f.months || {})[mk] || {}, prevK = mk.slice(0, 4) + '-' + ('0' + (((parseInt(mk.slice(5), 10) + 10) % 12) + 1)).slice(-2);
  if (mk.slice(5) === '01') prevK = (parseInt(mk.slice(0, 4), 10) - 1) + '-12';
  var p = (f.months || {})[prevK] || {};
  var sh = sheet_(), rows = sh.getDataRange().getValues(), H = {}; HEADERS.forEach(function(h, i) { H[h] = i; });
  var latest = {}, NOT = { VIEW:1, QVIEW:1, OUTAREA:1, WAITLIST:1, AUTH:1, SPEND:1, CONFIG:1 };
  for (var i = 1; i < rows.length; i++) { var t = String(rows[i][H.type] || ''); if (NOT[t]) continue; var id = String(rows[i][H.id]), key = String(rows[i][H.created] || ''); if (!latest[id] || key >= latest[id].key) latest[id] = { key: key, r: rows[i] }; }
  var active = 0, toCheck = 0, started = 0, left = 0, why = {}, leadsIn = 0, won = 0;
  Object.keys(latest).forEach(function(id) {
    var r = latest[id].r, st = String(r[H.status] || 'new'), notes = String(r[H.crmnotes] || '');
    if (st === 'deleted' || /\[TM:1\]/.test(notes)) return;
    var cd = (notes.match(/\[CD:(\d{4}-\d{2})/) || [])[1] || '', cx = (notes.match(/\[CX:(\d{4}-\d{2})/) || [])[1] || '';
    if (st === 'closed') { if (/\[(OS:1|SS:none)\]/.test(notes)) toCheck++; else active++; if (cd === mk) started++; }
    if (st === 'cancelled' && cx === mk) { left++; var w = (notes.match(/\[CXR:([^\]]*)\]/) || [])[1] || 'no reason'; why[w] = (why[w] || 0) + 1; }
    if (String(r[H.created] || '').slice(0, 7) === mk) { leadsIn++; if (st === 'closed') won++; }
  });
  var visits = 0, skipped = 0;
  try { var js = sheet_().getParent().getSheetByName('jobs'); if (js && js.getLastRow() > 1) { var JH = {}; JOBS_HEADERS.forEach(function(h, i) { JH[h] = i; }); js.getRange(2, 1, js.getLastRow() - 1, JOBS_HEADERS.length).getValues().forEach(function(r) { if (String(r[JH.date] || '').slice(0, 7) !== mk) return; if (/skip/.test(String(r[JH.status]))) skipped++; else if (/complet|done/.test(String(r[JH.status]))) visits++; }); } } catch (e) {}
  var pct = function(a, b) { return b ? (a >= b ? '+' : '') + Math.round((a - b) / b * 100) + '% on the month before' : ''; };
  var L = [];
  L.push('CL Professional Pet Services, ' + mk + ' in review');
  L.push('');
  L.push('Money: ' + money(m.billed) + ' billed (' + (pct(m.billed, p.billed) || 'first month on record') + '), ' + money(m.collected) + ' collected, ' + money(m.unpaid) + ' invoiced and still unpaid' + (m.onetime ? ', ' + money(m.onetime) + ' of the billing was one-time work' : '') + (m.failed ? ', ' + m.failed + ' card payments failed' : '') + '.');
  L.push('Customers: ' + active + ' active' + (toCheck ? ' (plus ' + toCheck + ' Sweep&Go still calls active with no schedule or subscription: worth deactivating)' : '') + ', +' + started + ' started, -' + left + ' left' + (left ? ' (' + Object.keys(why).map(function(k) { return why[k] + ' ' + k; }).join(', ') + ')' : '') + '.');
  L.push('Work: ' + visits + ' visits done, ' + skipped + ' skipped.');
  L.push('Leads: ' + leadsIn + ' came in, ' + won + ' of them are customers now.');
  var owed = (f.unpaid || []).slice(0, 8).map(function(u) { return u.name + ' ' + money(u.owed) + (u.oldest ? ' since ' + u.oldest : ''); });
  if (owed.length) L.push('Owed, biggest first: ' + owed.join('; ') + '.');
  try { var mv = mrrMoves_(Object.keys(latest).map(function(id) { return latest[id].r; }), H, mk); L.push('On the books: ' + money(mv.start) + ' a month at the start, +' + money(mv.added) + ' from ' + mv.n + ' new, -' + money(mv.lost) + ' from ' + mv.left + ' who left' + (Math.abs(mv.changes) >= 1 ? ', ' + (mv.changes > 0 ? '+' : '-') + money(Math.abs(mv.changes)) + ' from price and plan changes' : '') + ', ' + money(mv.end) + ' now.'); } catch (e9) {}
  try { var mm = mileage_()[mk]; if (mm) L.push('Miles: ' + mm.miles.toLocaleString() + ' driven over ' + mm.days + ' days, from Sweep&Go\u2019s route report.'); } catch (e10) {}
  L.push('');
  L.push('Three files attached: the month by month summary, every invoice and payment, and the miles by month, for the accountant.');
  L.push('The tracker has the detail: Numbers, then Money.');
  return L.join('\n');
}
/* What moved the monthly number: the books at the start of the month, what
   the new ones added, what the leavers took, and the rest is price and plan
   changes. From the cards' prices and their start and leaving dates. */
function mrrMoves_(rows, H, mk) {
  var first = mk + '-01', next = (mk.slice(5) === '12' ? (parseInt(mk.slice(0, 4), 10) + 1) + '-01' : mk.slice(0, 4) + '-' + ('0' + (parseInt(mk.slice(5), 10) + 1)).slice(-2)) + '-01';
  var amt = function(r) { var p = String(r[H.price] || ''); if (!/\/mo|month/.test(p)) return 0; var m = p.match(/\$?(\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
  var o = { start: 0, added: 0, n: 0, lost: 0, left: 0, end: 0, changes: 0 };
  rows.forEach(function(r) {
    var st = String(r[H.status] || ''), notes = String(r[H.crmnotes] || ''); if (/\[(TM:1|OS:1|SS:none)\]/.test(notes) || (st !== 'closed' && st !== 'cancelled')) return;
    var cd = (notes.match(/\[CD:(\d{4}-\d{2}-\d{2})\]/) || [])[1] || String(r[H.created] || '').slice(0, 10), cx = (notes.match(/\[CX:(\d{4}-\d{2}-\d{2})\]/) || [])[1] || '', a = amt(r);
    var activeAtStart = cd < first && (!cx || cx >= first), activeNow = st === 'closed';
    if (activeAtStart) o.start += a;
    if (cd >= first && cd < next) { o.added += a; o.n++; }
    if (st === 'cancelled' && cx >= first && cx < next) { o.lost += a; o.left++; }
    if (activeNow) o.end += a;
  });
  o.changes = o.end - (o.start + o.added - o.lost);
  ['start','added','lost','end','changes'].forEach(function(k) { o[k] = Math.round(o[k]); });
  return o;
}
function monthlyReport() {
  var d = new Date(); d.setDate(0);   // the last day of the month just ended
  var mk = d.toISOString().slice(0, 7), text = monthlyReportText_(mk), files = billingCsv_();
  var to = NOTIFY_CC + (NOTIFY_TO && NOTIFY_TO !== NOTIFY_CC ? ',' + NOTIFY_TO : '');
  var how = sendOfficeMail_({ to: to, subject: 'CLPPS ' + mk + ' in review', body: text, attachments: [
    { name: 'clpps-billing-by-month.csv', type: 'text/csv', content: files.months || '' },
    { name: 'clpps-invoices-and-payments.csv', type: 'text/csv', content: files.csv || '' },
    { name: 'clpps-miles-by-month.csv', type: 'text/csv', content: files.miles || '' } ] });
  Logger.log('Month in review for ' + mk + ' sent (' + how + ') to ' + to);
  return { ok:true, month: mk, how: how };
}
/* The year in review, 1 January: how long customers stay by the month they
   started, measured lifetime, the best and worst months, churn by quarter. */
function yearlyReportText_(year) {
  var money = function(v) { return '$' + Math.round(v || 0).toLocaleString(); };
  var f = sgBilling_(), E = emailRows_(), L = [];
  var months = Object.keys(f.months || {}).filter(function(k) { return k.indexOf(year + '-') === 0; }).sort();
  var billed = 0, collected = 0, best = null, worst = null;
  months.forEach(function(k) { var m = f.months[k]; billed += m.billed; collected += m.collected; if (!best || m.billed > f.months[best].billed) best = k; if (!worst || m.billed < f.months[worst].billed) worst = k; });
  var cohorts = {}, lifetimes = [], churn = {}, started = 0, left = 0, leadsIn = 0, won = 0;
  E.people.forEach(function(p) {
    var st = String(p.status || 'new'), n = String(p.crmnotes || '');
    if (/\[TM:1\]/.test(n)) return;
    var cd = (n.match(/\[CD:(\d{4}-\d{2}-\d{2})\]/) || [])[1] || '', cx = (n.match(/\[CX:(\d{4}-\d{2}-\d{2})\]/) || [])[1] || '';
    if (cd && cd.indexOf(year) === 0 && (st === 'closed' || st === 'cancelled')) { started++; var c = cohorts[cd.slice(0, 7)] || (cohorts[cd.slice(0, 7)] = { n: 0, still: 0 }); c.n++; if (st === 'closed') c.still++; }
    if (st === 'cancelled' && cx && cx.indexOf(year) === 0) { left++; var q = 'Q' + (Math.floor(parseInt(cx.slice(5, 7), 10) / 3.01) + 1), why = (n.match(/\[CXR:([^\]]*)\]/) || [])[1] || 'no reason'; churn[q] = churn[q] || {}; churn[q][why] = (churn[q][why] || 0) + 1; if (cd) lifetimes.push(Math.round((new Date(cx) - new Date(cd)) / DAY_MS / 30.4)); }
    if (String(p.created || '').indexOf(year) === 0 && /^(ENQUIRY|ACTIVATE|DECLINED)$/.test(String(p.type || ''))) { leadsIn++; if (st === 'closed' || st === 'cancelled') won++; }
  });
  var active = E.people.filter(function(p) { return String(p.status) === 'closed' && !/\[(OS:1|SS:none|TM:1)\]/.test(String(p.crmnotes || '')); }).length;
  L.push('CL Professional Pet Services, ' + year + ' in review');
  L.push('');
  L.push('Money: ' + money(billed) + ' billed, ' + money(collected) + ' collected' + (best ? '. Best month ' + best + ' (' + money(f.months[best].billed) + '), quietest ' + worst + ' (' + money(f.months[worst].billed) + ')' : '') + '.');
  L.push('Customers: ' + active + ' active at year end. ' + started + ' started during the year, ' + left + ' left.' + (lifetimes.length >= 5 ? ' Those who left had stayed a median ' + median_(lifetimes) + ' months.' : ''));
  var ck = Object.keys(cohorts).sort();
  if (ck.length) L.push('Still with us, by the month they started: ' + ck.map(function(k) { return k.slice(5) + ': ' + cohorts[k].still + ' of ' + cohorts[k].n; }).join(', ') + '.');
  var qk = Object.keys(churn).sort();
  if (qk.length) L.push('Why people left, by quarter: ' + qk.map(function(q) { return q + ' ' + Object.keys(churn[q]).map(function(w) { return churn[q][w] + ' ' + w; }).join(', '); }).join('; ') + '.');
  L.push('Leads: ' + leadsIn + ' came in through the website and the phone, ' + won + ' became customers' + (leadsIn ? ' (' + Math.round(won / leadsIn * 100) + '%)' : '') + '.');
  try { var mm = mileage_(), miles = 0, days = 0; Object.keys(mm).forEach(function(k) { if (k.indexOf(year + '-') === 0) { miles += mm[k].miles; days += mm[k].days; } }); if (miles) L.push('Miles: ' + miles.toLocaleString() + ' driven over ' + days + ' days. At 70 cents a mile (the 2025 standard rate; check the current one) that is about $' + Math.round(miles * 0.7).toLocaleString() + ' of deductible mileage.'); } catch (e11) {}
  L.push('');
  L.push('The files attached cover every invoice and payment on record, the month by month totals, and the miles by month.');
  return L.join('\n');
}
function yearlyReport() {
  var year = String(new Date().getFullYear() - 1), text = yearlyReportText_(year), files = billingCsv_();
  var to = NOTIFY_CC + (NOTIFY_TO && NOTIFY_TO !== NOTIFY_CC ? ',' + NOTIFY_TO : '');
  var how = sendOfficeMail_({ to: to, subject: 'CLPPS ' + year + ' in review', body: text, attachments: [
    { name: 'clpps-billing-by-month.csv', type: 'text/csv', content: files.months || '' },
    { name: 'clpps-invoices-and-payments.csv', type: 'text/csv', content: files.csv || '' },
    { name: 'clpps-miles-by-month.csv', type: 'text/csv', content: files.miles || '' } ] });
  return { ok:true, year: year, how: how };
}
function setupYearly() {
  ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'yearlyReport') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('yearlyReportIfJanuary').timeBased().onMonthDay(1).atHour(8).create();   // checked monthly; sends only in January
}
function yearlyReportIfJanuary() { if (new Date().getMonth() === 0) return yearlyReport(); return { ok:true, skipped: true }; }
function setupMonthly() {
  ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'monthlyReport') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('monthlyReport').timeBased().onMonthDay(1).atHour(7).create();
}
/* ---- the 5pm nudge: leads from today still not called ---- */
function eveningNudge() {
  var tz = Session.getScriptTimeZone(), today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var sh = sheet_(), rows = sh.getDataRange().getValues(), H = {}; HEADERS.forEach(function(h, i) { H[h] = i; });
  var latest = {}, LEAD = { ENQUIRY:1, ACTIVATE:1, SAVED:1, DECLINED:1 };
  for (var i = 1; i < rows.length; i++) { var t = String(rows[i][H.type] || ''); if (!LEAD[t]) continue; var id = String(rows[i][H.id]), key = String(rows[i][H.created] || ''); if (!latest[id] || key >= latest[id].key) latest[id] = { key: key, r: rows[i] }; }
  var names = [];
  Object.keys(latest).forEach(function(id) {
    var r = latest[id].r, notes = String(r[H.crmnotes] || '');
    if (String(r[H.status] || 'new') !== 'new' || /\[(TM:1|TX:|T1:)/.test(notes)) return;
    if (Utilities.formatDate(new Date(String(r[H.created])), tz, 'yyyy-MM-dd') !== today) return;
    names.push(String(r[H.name] || '').trim() || 'someone');
  });
  // paused customers back on the route tomorrow
  var tomorrow = Utilities.formatDate(new Date(Date.now() + 86400000), tz, 'yyyy-MM-dd'), back = [];
  for (var k = 1; k < rows.length; k++) { var nt = String(rows[k][H.crmnotes] || ''), pz = nt.match(/\[PZ:[^~\]]*~(\d{4}-\d{2}-\d{2})\]/); if (pz && pz[1] === tomorrow && String(rows[k][H.status] || '') === 'closed') back.push(String(rows[k][H.name] || '').trim()); }
  back = back.filter(function(n, i, a) { return n && a.indexOf(n) === i; });
  if (back.length) { var topicB = pushTopic_(); if (topicB) { try { UrlFetchApp.fetch('https://ntfy.sh/' + encodeURIComponent(topicB), { method: 'post', contentType: 'text/plain; charset=utf-8', payload: back.join(', ') + ' ' + (back.length === 1 ? 'is' : 'are') + ' back on the route tomorrow after a pause. Worth a look at the day plan tonight.', headers: { 'Title': 'Back tomorrow', 'Tags': 'arrows_counterclockwise' }, muteHttpExceptions: true }); } catch (e5) {} } }
  if (!names.length) return { ok:true, waiting: 0, back: back };
  var body = names.length + ' lead' + (names.length === 1 ? '' : 's') + ' from today still not called: ' + names.slice(0, 6).join(', ') + (names.length > 6 ? ' and ' + (names.length - 6) + ' more' : '') + '. A call tonight beats one tomorrow.';
  var topic = pushTopic_();
  if (topic) { try { UrlFetchApp.fetch('https://ntfy.sh/' + encodeURIComponent(topic), { method: 'post', contentType: 'text/plain; charset=utf-8', payload: body, headers: { 'Title': 'Before you clock off', 'Priority': 'default', 'Tags': 'telephone_receiver', 'Click': 'https://www.clpropetservices.com/hq-8k3v51/' }, muteHttpExceptions: true }); } catch (e) {} }
  return { ok:true, waiting: names.length, body: body, back: back };
}
/* A lead still not called an hour on: one more push, once, then the 5pm round-up. */
function hourlyNudge() {
  var tz = Session.getScriptTimeZone(), hour = parseInt(Utilities.formatDate(new Date(), tz, 'H'), 10);
  if (hour < 8 || hour > 19) return { ok:true, quiet: true };
  var sh = sheet_(), rows = sh.getDataRange().getValues(), H = {}; HEADERS.forEach(function(h, i) { H[h] = i; });
  var latest = {}, LEAD = { ENQUIRY:1, ACTIVATE:1, SAVED:1, DECLINED:1 };
  for (var i = 1; i < rows.length; i++) { var t = String(rows[i][H.type] || ''); if (!LEAD[t]) continue; var id = String(rows[i][H.id]), key = String(rows[i][H.created] || ''); if (!latest[id] || key >= latest[id].key) latest[id] = { key: key, row: i }; }
  var now = Date.now(), due = [];
  Object.keys(latest).forEach(function(id) {
    var r = rows[latest[id].row], notes = String(r[H.crmnotes] || ''), age = (now - new Date(String(r[H.created])).getTime()) / 60000;
    if (String(r[H.status] || 'new') !== 'new' || /\[(TM:1|TX:|T1:|NG:)/.test(notes) || age < 55 || age > 240) return;
    due.push({ row: latest[id].row, name: String(r[H.name] || '').trim() || 'someone', mins: Math.round(age) });
  });
  if (!due.length) return { ok:true, waiting: 0 };
  due.forEach(function(d) { sh.getRange(d.row + 1, H.crmnotes + 1).setValue(safeCell_(sgSetMarkers_(String(rows[d.row][H.crmnotes] || ''), { NG: '1' }))); });
  var body = due.map(function(d) { return d.name + ' (' + d.mins + ' min)'; }).join(', ') + ' still waiting for a call. The first hour wins most of them.';
  var topic = pushTopic_();
  if (topic) { try { UrlFetchApp.fetch('https://ntfy.sh/' + encodeURIComponent(topic), { method: 'post', contentType: 'text/plain; charset=utf-8', payload: body, headers: { 'Title': 'Lead waiting an hour', 'Priority': 'high', 'Tags': 'hourglass', 'Click': 'https://www.clpropetservices.com/hq-8k3v51/' }, muteHttpExceptions: true }); } catch (e) {} }
  return { ok:true, waiting: due.length, body: body };
}
function setupNudge() {
  ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'eveningNudge' || t.getHandlerFunction() === 'hourlyNudge') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('eveningNudge').timeBased().everyDays(1).atHour(17).create();
  ScriptApp.newTrigger('hourlyNudge').timeBased().everyHours(1).create();
}
/* Shared plumbing for the daily rounds: the newest row per person, a
   stamp writer, and the three checks every customer email passes. */
function emailRows_() {
  var sh = sheet_(), rows = sh.getDataRange().getValues(), H = {}; HEADERS.forEach(function(h, i) { H[h] = i; });
  var latest = {}, NOT = { VIEW:1, QVIEW:1, OUTAREA:1, WAITLIST:1, AUTH:1, SPEND:1, CONFIG:1 };
  for (var i = 1; i < rows.length; i++) { var t = String(rows[i][H.type] || ''); if (NOT[t]) continue; var id = String(rows[i][H.id]), key = String(rows[i][H.created] || ''); if (!latest[id] || key >= latest[id].key) latest[id] = { key: key, row: i }; }
  var people = Object.keys(latest).map(function(id) { var o = {}; HEADERS.forEach(function(h, j) { o[h] = rows[latest[id].row][j]; }); o._row = latest[id].row; return o; });
  return { sh: sh, rows: rows, H: H, people: people,
    stamp: function(p, marker) { var cur = String(rows[p._row][H.crmnotes] || ''), next = marker.EM ? '[EM:' + marker.EM + '] ' + cur : sgSetMarkers_(cur, marker); rows[p._row][H.crmnotes] = next; sh.getRange(p._row + 1, H.crmnotes + 1).setValue(safeCell_(next)); },
    mailable: function(p) { var n = String(p.crmnotes || ''); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(p.email || '').trim()) && !/\[(NOEM|TM):/.test(n); },
    first: function(p) { return String(p.name || '').trim().split(/\s+/)[0] || 'there'; } };
}
function round_(name, cfgKey, fn) {
  if (cfgKey && cfg_(cfgKey) !== 'on') return { ok:true, off:true, sent:0 };
  if (!officeMailReady_()) { Logger.log(name + ': switch is on but the ' + NO_OFFICE_MAIL + ', so nothing goes.'); return { ok:true, off:true, reason: NO_OFFICE_MAIL, sent:0 }; }
  var E = emailRows_(), today = new Date().toISOString().slice(0, 10), sent = 0, failed = 0;
  var send = function(p, subject, body, marker) {
    if (sent >= 30) return;
    try { sendCustomerMail_({ to: String(p.email).trim(), subject: subject, body: body + WE_FOOTER }); E.stamp(p, marker); sent++; }
    catch (e) { failed++; }
  };
  fn(E, today, send);
  return { ok:true, sent: sent, failed: failed };
}
var DAY_MS = 86400000;
function ageDays_(d) { return d ? (Date.now() - new Date(String(d).slice(0, 10) + 'T12:00:00').getTime()) / DAY_MS : -1; }
/* A card that failed: the same night, once a week at most. */
function cardFailedEmails() {
  return round_('Card-failed notices', 'card_emails', function(E, today, send) {
    var f = sgBilling_(), cut7 = new Date(Date.now() - 7 * DAY_MS).toISOString().slice(0, 10), cut3 = new Date(Date.now() - 3 * DAY_MS).toISOString().slice(0, 10);
    var byName = {}; E.people.forEach(function(p) { byName[sgNorm_(p.name)] = p; var aka = (String(p.crmnotes || '').match(/\[AKA:([^\]]*)\]/) || [])[1]; if (aka) byName[sgNorm_(aka)] = p; });
    (f.declining || []).forEach(function(d) {
      if (d.when < cut3) return;   // older failures are the payment reminder's job
      var p = byName[sgNorm_(d.name)]; if (!p || String(p.status) !== 'closed' || !E.mailable(p)) return;
      var last = (String(p.crmnotes || '').match(/\[CF:\d+@(\d{4}-\d{2}-\d{2})\]/) || [])[1] || ''; if (last && last >= cut7) return;
      send(p, 'Your card did not go through', 'Hi ' + E.first(p) + ',\n\nA quick heads-up from the office: the card on file did not go through for $' + Math.round(d.amount) + ' on ' + d.when + '. Nine times out of ten it is an expired card or a new one that was never added.\n\nIf you can update it in the client portal, or reply here with a good time to call, we will have it sorted in a minute. Service carries on as normal either way.\n\nThanks for having us.', { CF: Math.round(d.amount) + '@' + today });
    });
  });
}
/* Thirty days after someone leaves, one come-back note, unless they moved or lost the dog. */
function winbackEmails() {
  return round_('Win-back emails', 'winback_emails', function(E, today, send) {
    E.people.forEach(function(p) {
      if (String(p.status) !== 'cancelled' || !E.mailable(p)) return;
      var n = String(p.crmnotes || ''), cx = (n.match(/\[CX:(\d{4}-\d{2}-\d{2})\]/) || [])[1], why = (n.match(/\[CXR:([^\]]*)\]/) || [])[1] || '';
      var age = ageDays_(cx); if (!cx || age < 30 || age > 75) return;
      if (/moved|nodog/.test(why) || /\[(WK|WC):/.test(n) || /\[EM:winback/.test(n)) return;
      send(p, E.first(p) + ', we\u2019d love to have you back', 'Hi ' + E.first(p) + ',\n\nIt\u2019s Corey with CL Professional Pet Services. We miss your yard! If you\u2019d like us to pick it back up, there is no initial clean fee to restart and your old price holds.\n\nJust reply here or text (636) 375-4342 and we\u2019ll put you back on the route.', { WK: today });
    });
  });
}
/* The ones who got a price and never went ahead, or said no: one note a
   month or more later, once. Jesse: "send those out and see if we get anyone". */
function leadRevival() {
  return round_('Lead revival', 'revival_emails', function(E, today, send) {
    E.people.forEach(function(p) {
      var st = String(p.status || 'new'), n = String(p.crmnotes || '');
      if (!/^(new|called|lost)$/.test(st) || !/^(ENQUIRY|ACTIVATE|DECLINED|SAVED)$/.test(String(p.type || '')) || !E.mailable(p)) return;
      var age = ageDays_(p.created); if (age < 30 || age > 400) return;
      if (/\[LR:/.test(n) || /\[SGID:/.test(n)) return;
      var price = String(p.price || '').trim(), plan = String(p.service || '').trim() || 'your plan', when = new Date(String(p.created)).toLocaleDateString('en-US', { month: 'long' });
      var body = 'Hi ' + E.first(p) + ',\n\nIt\u2019s Corey with CL Professional Pet Services. You asked us for a price back in ' + when + ' and I wanted to check in, in case the yard is still on the to-do list.\n\n' +
        (price && /\d/.test(price) ? 'Your price of ' + price + ' for ' + plan + ' still stands, ' : 'The price we gave you still stands, ') + 'the $40 initial clean is waived if you start this month, and there is no contract \u2014 month to month, cancel any time.\n\nIf you\u2019d like us to take it off your plate, just reply to this email or text me at (636) 375-4342 and I\u2019ll get you on the schedule this week.';
      send(p, E.first(p) + ', is the yard still on the list?', body, { LR: today });
    });
  });
}
/* When someone a customer referred starts, thank the referrer and remind the office of the free deodorize. */
function refCode_(id, name) {
  var first = String(name || '').trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, '').slice(0, 6) || 'clpps';
  var h = 0, str = String(id || ''); for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return first + '-' + ('000' + (h % 46656).toString(36)).slice(-3);
}
function referralThanks() {
  return round_('Referral thank-yous', 'referral_emails', function(E, today, send) {
    var byCode = {}, byName = {};
    E.people.forEach(function(p) { var st = String(p.status || ''); if (st === 'closed' || st === 'cancelled') { byCode[refCode_(p.id, p.name)] = p; byName[sgNorm_(p.name)] = p; } });
    E.people.forEach(function(p) {
      var n = String(p.crmnotes || ''); if (String(p.status) !== 'closed' || /\[RT:/.test(n)) return;
      var cd = (n.match(/\[CD:(\d{4}-\d{2}-\d{2})\]/) || [])[1]; var age = ageDays_(cd); if (!cd || age < 0 || age > 21) return;
      var rb = (n.match(/\[RB:([^\]]*)\]/) || [])[1], rf = (n.match(/\[RF:([^\]]*)\]/) || [])[1];
      var ref = (rb && byName[sgNorm_(rb)]) || (rf && byCode[rf]); if (!ref || ref.id === p.id) return;
      var newFirst = E.first(p);
      if (E.mailable(ref)) send(ref, 'Thank you, ' + E.first(ref) + ' \u2014 your free deodorize is on the way', 'Hi ' + E.first(ref) + ',\n\n' + newFirst + ' just started with us and mentioned you sent them our way. Thank you \u2014 that is the best compliment a small business can get.\n\nAs promised, your next visit includes a free deodorizing and sanitizing treatment on the house. Nothing to do on your end.\n\nThanks again for having us, and for the kind word.', { RT: today });
      else E.stamp(p, { RT: today });
      // the office: the reward to apply in Sweep&Go
      var topic = pushTopic_();
      if (topic) { try { UrlFetchApp.fetch('https://ntfy.sh/' + encodeURIComponent(topic), { method: 'post', contentType: 'text/plain; charset=utf-8', payload: String(ref.name || '').trim() + ' referred ' + String(p.name || '').trim() + ', who just started. Add the free deodorize to ' + E.first(ref) + '\u2019s next visit in Sweep&Go.', headers: { 'Title': 'Referral reward owed', 'Tags': 'handshake' }, muteHttpExceptions: true }); } catch (e) {} }
      if (E.mailable(ref)) { /* stamped by send */ } else { /* stamped above */ }
      if (E.mailable(ref)) E.stamp(p, { RT: today });
    });
  });
}
/* A year with us: on the anniversary of their start, a thank-you from the office. */
function anniversaryEmails() {
  return round_('Anniversary emails', 'anniversary_emails', function(E, today, send) {
    var md = today.slice(5), yr = parseInt(today.slice(0, 4), 10);
    E.people.forEach(function(p) {
      var n = String(p.crmnotes || ''); if (String(p.status) !== 'closed' || !E.mailable(p) || /\[(OS:1|SS:none|CM:1)\]/.test(n)) return;
      var cd = (n.match(/\[CD:(\d{4}-\d{2}-\d{2})\]/) || [])[1]; if (!cd || cd.slice(5) !== md) return;
      var years = yr - parseInt(cd.slice(0, 4), 10); if (years < 1 || n.indexOf('[AN:' + yr) >= 0) return;
      send(p, (years === 1 ? 'A year with us, ' : years + ' years with us, ') + E.first(p) + ' \u2014 thank you', 'Hi ' + E.first(p) + ',\n\n' + (years === 1 ? 'It has been a year today since we first came out to your yard.' : 'It has been ' + years + ' years today since we first came out to your yard.') + ' Thank you for having us every week; a small business runs on customers like you.\n\nAs a small thank-you, your next visit includes a free deodorizing and sanitizing treatment, on the house. Nothing to do on your end.\n\nIf there is anything we could be doing better, reply here and tell me straight. \u2014 Corey', { AN: yr + '@' + today });
    });
  });
}
/* The campaign calendar: four seasonal emails, each with a date and a
   switch (CONFIG campaigns), sent on the day to its audience, once a year. */
var CAMPAIGNS = {
  spring:  { date: '03-15', name: 'Spring cleanup', who: 'quotes', subject: '{first}, spring is here \u2014 your yard price still stands',
             body: 'Hi {first},\n\nIt\u2019s Corey with CL Professional Pet Services. The snow is gone and so is the excuse: everything the dog left all winter is out there now.\n\nYour price of {price} for {plan} still stands, the $40 initial clean is waived this month, and there is no contract \u2014 month to month, cancel any time.\n\nReply here or text (636) 375-4342 and we\u2019ll get the yard back to normal this week.' },
  deo:     { date: '05-01', name: 'Deodorize season', who: 'customers-no-deo', subject: '{first}, the warm months are coming: deodorize and sanitize',
             body: 'Hi {first},\n\nQuick one from Corey. Once it warms up, a clean yard can still smell like a dog yard. Our deodorizing and sanitizing treatment fixes that: $15 a visit, added to your regular service, and you can stop it any time in the fall.\n\nReply \u201cyes\u201d and we\u2019ll add it from your next visit.' },
  fall:    { date: '10-01', name: 'Fall leaves', who: 'quotes', subject: '{first}, your yard price is still good \u2014 and the leaves are coming',
             body: 'Hi {first},\n\nIt\u2019s Corey with CL Professional Pet Services. You asked us for a price a while back and I wanted to check in before the yard disappears under the leaves.\n\nYour price of {price} for {plan} still stands, the $40 initial clean is waived right now, and there is no contract \u2014 month to month, cancel any time.\n\nIf you\u2019d like us to take the yard off your plate this season, just reply or text me at (636) 375-4342.' },
  holiday: { date: '12-01', name: 'Holiday deep clean', who: 'quotes-and-former', subject: '{first}, a clean yard before the guests arrive',
             body: 'Hi {first},\n\nIt\u2019s Corey with CL Professional Pet Services. If family is coming for the holidays, we can do a one-time deep clean of the yard the week before \u2014 $75 covers the first half hour, and we haul everything away.\n\nReply here or text (636) 375-4342 with the week you want, and consider it done.' }
};
function campaignsDue() {
  var cfg = {}; try { cfg = JSON.parse(cfg_('campaigns') || '{}') || {}; } catch (e) {}
  var today = new Date(), md = ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2), year = String(today.getFullYear());
  var due = Object.keys(CAMPAIGNS).filter(function(k) { var c = cfg[k] || {}; return c.on && (c.date || CAMPAIGNS[k].date) === md; });
  if (!due.length) return { ok:true, due: [] };
  var out = {};
  due.forEach(function(k) {
    var C = CAMPAIGNS[k], tag = k + year;
    out[k] = round_('Campaign ' + C.name, null, function(E, todayStr, send) {
      E.people.forEach(function(p) {
        var st = String(p.status || 'new'), n = String(p.crmnotes || '');
        if (!E.mailable(p) || n.indexOf('[EM:' + tag + '@') >= 0) return;
        var ok = C.who === 'quotes' ? /^(new|called|lost)$/.test(st) && ageDays_(p.created) >= 7 && ageDays_(p.created) <= 400 && !/\[SGID:/.test(n)
               : C.who === 'customers-no-deo' ? st === 'closed' && !/every visit|\$15/.test(String(p.deodorize || '')) && !/\[(OS:1|SS:none|CM:1)\]/.test(n)
               : /^(new|called|lost|cancelled)$/.test(st) && ageDays_(p.created) >= 7 && ageDays_(p.created) <= 730 && !/\[SGID:/.test(n) || (st === 'cancelled' && ageDays_((n.match(/\[CX:(\d{4}-\d{2}-\d{2})\]/) || [])[1]) <= 365);
        if (!ok) return;
        var r = { first: E.first(p), price: String(p.price || '').trim() || 'your quoted price', plan: String(p.service || '').trim() || 'your plan' };
        send(p, fillBlast_(C.subject, r), fillBlast_(C.body, r), { EM: tag + '@' + todayStr });
      });
    });
  });
  return { ok:true, due: due, results: out };
}
function dailyEmails() {
  var out = {};
  [['followups', quoteFollowups], ['welcome', welcomeEmails], ['cards', cardFailedEmails], ['winback', winbackEmails], ['revival', leadRevival], ['referral', referralThanks], ['anniversary', anniversaryEmails], ['campaigns', campaignsDue]].forEach(function(j) {
    try { out[j[0]] = j[1](); } catch (e) { out[j[0]] = { ok:false, error: String(e && e.message || e).slice(0, 160) }; }
  });
  if (new Date().getDay() === 1) { try { out.reminders = paymentReminders(); } catch (e) { out.reminders = { ok:false, error: String(e && e.message || e) }; } }
  return out;
}
function setupFollowups() {
  ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'quoteFollowups' || t.getHandlerFunction() === 'dailyEmails') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyEmails').timeBased().everyDays(1).atHour(9).create();
  Logger.log('Daily emails scheduled for 9am: follow-ups for quiet quotes and the welcome sequence, each only while its switch in the tracker (under Email) is on. Follow-ups due right now: ' + JSON.stringify(followupsDue_(sheet_().getDataRange().getValues(), new Date()).map(function(d) { return d.first + ' step ' + d.step; })));
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
  var n = { active: 0, newCust: 0, left: 0, leftWhy: {}, leadsIn: 0, waiting: 0, reviews: '', toCheck: 0, owed30: 0 };
  Object.keys(latest).forEach(function(id) {
    var r = latest[id].r, st = String(r[H.status] || 'new'), notes = String(r[H.crmnotes] || '');
    if (st === 'deleted' || /\[TM:1\]/.test(notes)) return;
    var cd = (notes.match(/\[CD:(\d{4}-\d{2}-\d{2})\]/) || [])[1] || '', cx = (notes.match(/\[CX:(\d{4}-\d{2}-\d{2})\]/) || [])[1] || '';
    if (st === 'closed' && /\[(OS:1|SS:none)\]/.test(notes)) { n.toCheck++; return; }   // Sweep&Go calls them active, but off schedule or without a subscription
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
        if (r[BH.kind] === 'invoice') { if (st === 'voided') return; if (d >= cutD) n.billed += tot; if (st !== 'paid') { var rem = parseFloat(r[BH.remaining]); rem = rem > 0 ? rem : tot; n.owed += rem; if (d < new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10)) n.owed30 += rem; } }
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
  if (n.billed || n.collected) L.push(money(n.billed) + ' billed, ' + money(n.collected) + ' collected' + (n.owed ? ', ' + money(n.owed) + ' still owed' + (n.owed30 ? ' (' + money(n.owed30) + ' of it over 30 days)' : '') : ''));
  L.push(n.active + ' active' + (n.newCust ? ', +' + n.newCust + ' new' : '') + (n.left ? ', -' + n.left + ' left (' + why + ')' : '') + (!n.newCust && !n.left ? ', no comings or goings' : '') + (n.toCheck ? '; ' + n.toCheck + ' to check in Sweep&Go' : ''));
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
  try { setupFollowups(); } catch (e) { Logger.log('follow-ups not scheduled: ' + e); }
  try { setupNudge(); } catch (e) { Logger.log('evening nudge not scheduled: ' + e); }
  try { setupMonthly(); } catch (e) { Logger.log('month in review not scheduled: ' + e); }
  try { setupYearly(); } catch (e) { Logger.log('year in review not scheduled: ' + e); }
  // the first sync runs on its own a minute from now, so this call stays short
  ScriptApp.getProjectTriggers().forEach(function(t) { if (t.getHandlerFunction() === 'sgSyncOnce') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sgSyncOnce').timeBased().after(60 * 1000).create();
  Logger.log('First sync scheduled for a minute from now; the invoice history follows it a minute later. Run sgStatus in five minutes to read the result.');
  return { ok:true, who: who, scheduled: true };
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
  if (!officeMailReady_()) return { ok:false, error: NO_OFFICE_MAIL };
  var sent = [], failed = [], stamp = '[EM:' + tag + '@' + new Date().toISOString().slice(0, 10) + '] ';
  var sh = sheet_(), data = sh.getDataRange().getValues(), idCol = HEADERS.indexOf('id'), nCol = HEADERS.indexOf('crmnotes');
  for (var k = 0; k < to.length; k++) {
    var r = to[k] || {}, email = String(r.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { failed.push({ id:r.id, error:'bad email' }); continue; }
    try {
      sendCustomerMail_({ to: email, subject: fillBlast_(subject, r), body: fillBlast_(text, r) });
      sent.push(r.id);
      // stamp every row that carries the id, same as an update
      for (var i = 1; i < data.length; i++) {
        if (String(data[i][idCol]) !== String(r.id)) continue;
        var old = String(data[i][nCol] || '');
        if (old.indexOf('[EM:' + tag + '@') < 0) sh.getRange(i + 1, nCol + 1).setValue(safeCell_(stamp + old));
      }
    } catch (e) { failed.push({ id:r.id, error:String(e && e.message || e).slice(0, 80) }); }
  }
  return { ok:true, sent:sent, failed:failed, remaining: MS_DAILY_LIMIT, tag:tag };
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
    if (t.getHandlerFunction() === 'backupSheet' || t.getHandlerFunction() === 'weeklyHousekeeping') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('weeklyHousekeeping').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(23).create();
  backupSheet();
}
/* Sunday night: a backup, then the tidy. */
function weeklyHousekeeping() { var n = backupSheet(); var t = tidySheet(); Logger.log('Backups kept: ' + n + '. Tidy: ' + JSON.stringify(t)); return t; }
/* The sheet grows: every page view is a row, and over the months a customer
   can end up with several rows carrying the same id. The tracker and the
   sync both read "the newest row per id", so the older copies are dead
   weight that slows every load on the phone. This keeps, for each id, the
   row they would pick (the last one with the latest created), drops page
   views older than the tracker ever asks for, keeps the newest CONFIG row
   per setting, and leaves everything else alone. The row order stays. */
var TIDY_VIEW_DAYS = 400;
function tidySheet() {
  var lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) return { ok:false, error:'busy' };
  try {
    var sh = sheet_(), data = sh.getDataRange().getValues(), H = {}; HEADERS.forEach(function(h, i) { H[h] = i; });
    if (data.length < 2) return { ok:true, kept: 0, removed: 0 };
    var BULK = { VIEW:1, QVIEW:1, OUTAREA:1 }, KEEP_ALL = { AUTH:1, SPEND:1, WAITLIST:1 };
    var viewCut = new Date(Date.now() - TIDY_VIEW_DAYS * 86400000).toISOString();
    var best = {}, cfgBest = {};
    for (var i = 1; i < data.length; i++) {
      var t = String(data[i][H.type] || ''), id = String(data[i][H.id] || ''), key = String(data[i][H.created] || '');
      if (t === 'CONFIG') { var nm = String(data[i][H.name] || ''); if (!cfgBest[nm] || key >= cfgBest[nm].key) cfgBest[nm] = { row: i, key: key }; continue; }
      if (BULK[t] || KEEP_ALL[t]) continue;
      if (!best[id] || key >= best[id].key) best[id] = { row: i, key: key };
    }
    var keepRow = {}; Object.keys(best).forEach(function(k) { keepRow[best[k].row] = 1; }); Object.keys(cfgBest).forEach(function(k) { keepRow[cfgBest[k].row] = 1; });
    var out = [data[0]], removed = 0;
    for (var r = 1; r < data.length; r++) {
      var ty = String(data[r][H.type] || '');
      var keep = KEEP_ALL[ty] ? true : BULK[ty] ? String(data[r][H.created] || '') >= viewCut : !!keepRow[r];
      if (keep) out.push(data[r]); else removed++;
    }
    if (removed) {
      sh.getRange(1, 1, data.length, HEADERS.length).clearContent();
      sh.getRange(1, 1, out.length, HEADERS.length).setValues(out);
    }
    return { ok:true, kept: out.length - 1, removed: removed };
  } finally { lock.releaseLock(); }
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
