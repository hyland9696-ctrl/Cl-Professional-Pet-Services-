/* The Sweep&Go sync, end to end, outside Apps Script.

   The script's Google services are stood in for here: a sheet that is an
   array, a fetch that answers from the shapes in Sweep&Go's own API docs.
   So the first real run against the live account is not the first run. */
const { ROOT, reporter } = require('./lib');
const fs = require('fs');
const path = require('path');
const { ok, done } = reporter();

const gs = fs.readFileSync(path.join(ROOT, 'hq-8k3v51', 'apps-script.gs'), 'utf8');
const HEADERS = ['id','created','type','name','phone','email','address','zip','service','dogs','yard','deodorize','hero','price','manual','honored','notes','status','crmnotes','updated'];
const today = new Date().toISOString().slice(0, 10);
const d = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

/* ---- a spreadsheet made of arrays ---- */
function fakeSheet(rows){
  const live = () => { let n = rows.length; while (n > 0 && rows[n - 1].every(v => v === '' || v == null)) n--; return n; };
  const sh = { rows, writes: 0,
    getLastRow: () => live(), getLastColumn: () => (rows[0] || []).length, getMaxRows: () => rows.length + 50,
    appendRow: (r) => { rows.length = live(); rows.push(r.slice()); sh.writes++; },
    getDataRange: () => ({ getValues: () => rows.slice(0, live()).map(r => r.slice()) }),
    getRange: (r, c, nr, nc) => ({
      getValues: () => { const out = []; for (let i = 0; i < (nr || 1); i++) out.push((rows[r - 1 + i] || []).slice(c - 1, c - 1 + (nc || 1))); return out; },
      setValues: (vals) => { sh.writes++; vals.forEach((v, i) => { while (rows.length < r + i) rows.push(new Array(HEADERS.length).fill('')); const row = rows[r - 1 + i]; v.forEach((x, j) => { row[c - 1 + j] = x; }); }); },
      setValue: (v) => { sh.writes++; while (rows.length < r) rows.push([]); rows[r - 1][c - 1] = v; },
      clearContent: () => { for (let i = 0; i < (nr || 1); i++) if (rows[r - 1 + i]) for (let j = 0; j < (nc || 1); j++) rows[r - 1 + i][c - 1 + j] = ''; },
      setNumberFormat: () => {},
    }) };
  return sh;
}
function fakeSpreadsheet(leadRows){
  const sheets = { leads: fakeSheet(leadRows) };
  const ss = { getId: () => 'x', getSheets: () => [sheets.leads], getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => { sheets[n] = fakeSheet([]); return sheets[n]; } };
  sheets.leads.getParent = () => ss;
  Object.keys(sheets).forEach(k => { sheets[k].getParent = () => ss; });
  const origInsert = ss.insertSheet; ss.insertSheet = (n) => { const s = origInsert(n); s.getParent = () => ss; return s; };
  return { ss, sheets };
}

/* ---- what Sweep&Go answers, per the docs ---- */
const client = (o) => Object.assign({ client:'rcl_X', status:'active', type:'employee_portal', email:'', first_name:'', last_name:'', address:'', zip_code:'', home_phone:null, cell_phone:'', marketing_allowed:1, subscription_names:'2d-1xW', one_time_client:false, tracking_field:'', service_days:'Thursday', assigned_to:'Jesse Duncan', cleanup_frequency:'once_a_week' }, o);
const sub = (o) => Object.assign({ status:'active', category:'cleanup', billing_interval:'monthly', start_date:'2026-06-01', end_date:null, current_period_end:null, canceled_at:null, client_name:'', client_email:'', client_address:'', name:null, price:85, pricing_plan:'Regular Plan', service_plan:'1d-1xW', frequency:'once_a_week', number_of_dogs:'1', zip_code:'63376', termination_reason:null, termination_comment:null, pause_start_date:null, pause_end_date:null }, o);
const API = {
  '/api/v2/welcome': { message: 'hi' },
  '/api/v2/subscriptions': { subscriptions: { data: [
    sub({ client_name:'Dana Deo', client_email:'dana@gmail.com', price:91, number_of_dogs:'2', service_plan:'2d-1xW' }),
    sub({ client_name:'Dana Deo', client_email:'dana@gmail.com', price:60, name:'Deodorizing and Sanitizing Spray', service_plan:'' }),   // the add-on
    sub({ client_name:'Kelly .', client_email:'', price:20, billing_interval:'per_cleanup', number_of_dogs:'3', service_plan:'3d-1xW' }),  // per visit, no email: matched by name
    sub({ client_name:'New Nancy', client_email:'nancy@gmail.com', price:75, number_of_dogs:'1', service_plan:'1d-bW', frequency:'bi_weekly', start_date: d(3) }),
    sub({ client_name:'Gone Gus', client_email:'gus@gmail.com', status:'canceled', price:85, start_date:'2026-01-10', canceled_at:'2026-09-02 10:00:00', termination_reason:'Moving out of state' }),
    sub({ client_name:'Paused Pat', client_email:'pat@gmail.com', status:'paused', pause_start_date:'2026-11-01', pause_end_date:'2026-12-15', service_plan:'1d-1xW' }),
    sub({ client_name:'Twice Tom', client_email:'tom@gmail.com', price:153, number_of_dogs:'1', service_plan:'1d-2xW', frequency:'two_times_a_week' }),
    sub({ client_name:'Off Olly', client_email:'olly@gmail.com', price:85, number_of_dogs:'1', service_plan:'1d-1xW' }),          // a live subscription, but Sweep&Go has him off the schedule
    sub({ client_name:'Per Visit Pete', client_email:'pete@gmail.com', price:15, number_of_dogs:'1', service_plan:'1d-1xW' }),   // an old record: $15 a visit, invoiced $65 a month
  ], last_page: 1 } },
  '/api/v2/commercial/subscriptions': { subscriptions: { data: [
    { status:'active', billing_interval:'monthly', start_date:'2024-11-18', commercial_client:'Greens of Broadmoor', commercial_location:'Main', client_name:'Greens of Broadmoor', frequency:'1xW', price: 60 },
  ], last_page: 1 } },
  '/api/v2/commercial_clients/active': { data: [
    { client:'cc_G', name:'Greens of Broadmoor', status:'active', locations_count: 1, locations: [ { location:'cl_G1', name:'Main', status:'active', email:'hoa@greens.com', billing_address:'14995 Green Cir Dr', billing_city:'St. Peters', billing_zip:'63376', service_days:'Wednesday', cleanup_frequency:'Once a week' } ] },
  ], paginate: { total_pages: 1 } },
  '/api/v2/commercial_clients/inactive': { data: [], paginate: { total_pages: 1 } },
  '/api/v2/old_list': { data: [ { date:'2024-01-02' }, { date:'2024-01-01' } ], last_page: 3 },
  '/api/v1/clients/active': { data: [
    client({ client:'rcl_D', first_name:'Dana', last_name:'Deo', email:'dana@gmail.com', cell_phone:'(636) 375-0001', address:'1 Oak St', zip_code:'63376', service_days:'Thursday', tracking_field:'utm_source=facebook&utm_medium=paid' }),
    client({ client:'rcl_K', first_name:'Kelly', last_name:'.', email:'', cell_phone:'6363750002', address:'14 Creekside Dr', zip_code:'63376', service_days:'Tuesday', cleanup_frequency:'once_a_week' }),
    client({ client:'rcl_N', first_name:'New', last_name:'Nancy', email:'nancy@gmail.com', cell_phone:'6363750009', address:'9 New St', zip_code:'63366', service_days:'Monday', cleanup_frequency:'bi_weekly', marketing_allowed:0 }),
    client({ client:'rcl_P', first_name:'Paused', last_name:'Pat', email:'pat@gmail.com', cell_phone:'6363750004', address:'4 Elm St', zip_code:'63376', service_days:'Thursday' }),
    client({ client:'rcl_T', first_name:'Twice', last_name:'Tom', email:'tom@gmail.com', cell_phone:'6363750005', address:'5 Fir St', zip_code:'63376', service_days:'Tuesday, Friday', cleanup_frequency:'two_times_a_week' }),
    client({ client:'rcl_L', first_name:'Lost', last_name:'Larry', email:'larry@gmail.com', cell_phone:'6363750006', address:'6 Birch St', zip_code:'63376' }),   // the office marked him Not interested: left alone
    client({ client:'rcl_O', first_name:'Off', last_name:'Olly', email:'olly@gmail.com', cell_phone:'6363750011', address:'11 Off St', zip_code:'63376', service_days:'', off_schedule: true }),
    client({ client:'rcl_S', first_name:'Sub', last_name:'Sally', email:'sally@gmail.com', cell_phone:'6363750012', address:'12 Sub St', zip_code:'63376', service_days:'Monday', subscription_names:'' }),
    client({ client:'rcl_V', first_name:'Per Visit', last_name:'Pete', email:'pete@gmail.com', cell_phone:'6363750013', address:'13 Visit St', zip_code:'63376', service_days:'Friday' }),
  ], paginate: { total_pages: 1 } },
  '/api/v1/clients/active_no_subscription': { data: [
    client({ client:'rcl_S', first_name:'Sub', last_name:'Sally', email:'sally@gmail.com', cell_phone:'6363750012' }),
  ], paginate: { total_pages: 1 } },
  '/api/v1/clients/inactive': { data: [
    client({ client:'rcl_G', status:'inactive', first_name:'Gone', last_name:'Gus', email:'gus@gmail.com', cell_phone:'6363750003', address:'3 Ash St', zip_code:'63376', service_days:'' }),
    client({ client:'rcl_Z', status:'inactive', first_name:'Never', last_name:'Started', email:'never@gmail.com', cell_phone:'6363750099', address:'99 Nowhere', zip_code:'63376', subscription_names:'' }),
  ], paginate: { total_pages: 1 } },
  '/api/v1/dispatch_board/jobs_for_date': { data: [
    { full_name:'Dana Deo', lat: 38.79123, lng: -90.60111, estimate_time:'00:12', cell_phone:'6363750001', number_of_dogs: 2 },
    { full_name:'Kelly .', lat: 38.77, lng: -90.61, estimate_time:'00:20', cell_phone:'6363750002' },
  ] },
  '/api/v2/invoices?type=recurring': { invoices: { data: [
    { created_at: d(10) + ' 00:03:23', invoice_number:'768-1-1', client_name:'Dana Deo', status:'paid', total:'151.00', paid:'151.00', remaining:'0.00', type:'subscription', billing_interval:'monthly', pay_method:'credit_card' },
    { created_at: d(9) + ' 00:03:23', invoice_number:'768-2-1', client_name:'Kelly .', status:'overdue', total:'87.00', paid:'0.00', remaining:'87.00', type:'subscription', billing_interval:'monthly' },
    { created_at: d(8) + ' 00:03:23', invoice_number:'768-4-1', client_name:'Per Visit Pete', status:'paid', total:'65.00', paid:'65.00', remaining:'0.00', type:'subscription', billing_interval:'monthly' },
    { created_at: d(20) + ' 00:03:23', invoice_number:'768-5-1', client_name:'New Nancy', status:'overdue', total:'75.00', paid:'0.00', remaining:'75.00', type:'subscription', billing_interval:'monthly', pay_method:'credit_card', period_start: d(20) + ' 00:03:23', period_end: d(-10) + ' 00:03:23', next_try_charging: d(-3) + ' 00:00:00' },
    { created_at: d(12) + ' 00:03:23', invoice_number:'768-6-1', client_name:'Off Olly', status:'paid', total:'85.00', paid:'85.00', remaining:'0.00', type:'subscription', billing_interval:'monthly' },
  ], last_page: 1 } },
  '/api/v2/invoices?type=one_time': { invoices: { data: [ { created_at: d(5) + ' 10:00:00', invoice_number:'768-3-3', client_name:'Once Olga', status:'paid', total:'75.00', paid:'75.00', remaining:'0.00', type:'one_time' } ], last_page: 1 } },
  '/api/v2/payments': { payments: { data: [
    { date: d(10), amount: 151, amount_refunded:'0.00', status:'succeeded', type:'credit_card', description:'Payment for invoice 768-1-1', client_name:'Dana Deo', tip_amount:'5.00' },
    { date: d(9), amount: 87, amount_refunded:'0.00', status:'failed', type:'credit_card', description:'Payment for invoice 768-2-1', client_name:'Kelly .', tip_amount:'0.00' },
  ], last_page: 1 } },
  '/api/v2/report/route_planning_report': { route_reports: [ { assigned_to_name:'Jesse Duncan', date: today, duration: 240, driving_time: 60, cleanup_time: 180, distance: 61.5, number_of_jobs: 18, price: 540 } ] },
  '/api/v2/old_list_unused': {},
  '/api/v2/report/completed_jobs_report': { job_list: [
    { first_name:'Dana', last_name:'Deo', zip:'63376', status_name:'completed', start_time: d(1) + ' 09:00:00', end_time: d(1) + ' 09:12:00', service_plan_name:'2d-1xW', service_plan_slug:'once_a_week', date: d(1), price:'35.00', duration:'12:00', assigned_to_name:'Jesse Duncan' },
    { first_name:'Kelly', last_name:'.', zip:'63376', status_name:'skipped', skip_reason_title:'Gate locked', date: d(1), service_plan_name:'3d-1xW', duration:'-' },
  ] },
  '/api/v1/leads/list': { data: [
    { lead:'rld_1', status:'active', type:'onboarding_form', email:'newlead@gmail.com', name:'Form Fiona', address:'7 Lead Ln', zip_code:'63376', cell_phone:'6363750007' },
    { lead:'rld_2', status:'active', type:'onboarding_form', email:'dana@gmail.com', name:'Dana Deo', address:'1 Oak St', zip_code:'63376', cell_phone:'6363750001' },   // already a customer
  ], paginate: { total_pages: 1 } },
};
const calls = [];
const pushes = [], onboardings = [], mails = [];
const msCalls = [], logs = [], triggers = [], sleeps = [], photoFetches = [];
const MS = { MS_TENANT:'ten-1', MS_CLIENT:'cli-1', MS_SECRET:'sec-1', MAIL_FROM:'info@clpropetservices.com' };
/* what went out through Microsoft, as the customer sees it */
const sentMs = () => msCalls.filter(c => c.body && c.body.message).map(c => ({ to: c.body.message.toRecipients[0].emailAddress.address, subject: c.body.message.subject, body: c.body.message.body.content, replyTo: c.body.message.replyTo[0].emailAddress.address }));
let throttle = 0;   // how many times in a row Sweep&Go answers 429
let googleReviews = 40;   // what Google says the review count is
function fakeFetch(url, opts){
  calls.push(url);
  if (/residential\/onboarding$/.test(url)){
    const b = JSON.parse(opts.payload || '{}'); onboardings.push(b);
    if (b.email === 'taken@gmail.com') return { getResponseCode: () => 409, getContentText: () => '{"errors":["exists"]}' };
    return { getResponseCode: () => 200, getContentText: () => '{"success":"success"}' };
  }
  if (/check_zip_code_exists$/.test(url)){ const b = JSON.parse(opts.payload || '{}'); return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ exists: /^63/.test(b.value) ? 'exists' : 'not_exists' }) }; }
  if (/check_client_email_exists/.test(url)) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ exists: /already(%40|@)/.test(url) }) };
  if (/price_registration_form/.test(url)){
    // Sweep&Go's own table: 2 dogs weekly $91, 1 dog weekly $95 (deliberately not the site's $85), 1 dog bi-weekly $70
    const dogs = (url.match(/number_of_dogs=(\d)/) || [])[1], freq = (url.match(/clean_up_frequency=([a-z_]+)/) || [])[1];
    const price = freq === 'bi_weekly' ? 70 : dogs === '2' ? 91 : 95;
    return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ price: { value: String(price), category: 'prepaid', billing_interval: 'monthly' }, cross_sells: [ { id: 7, name: 'Deodorizing and Sanitizing', unit_amount: '15.00' } ] }) };
  }
  if (/maps\.googleapis\.com\//.test(url)) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ result: { rating: 4.9, user_ratings_total: googleReviews } }) };
  if (/login\.microsoftonline\.com\//.test(url)){ msCalls.push({ url, payload: opts.payload }); return { getResponseCode: () => opts.payload && opts.payload.client_secret === 'sec-1' ? 200 : 401, getContentText: () => JSON.stringify(opts.payload && opts.payload.client_secret === 'sec-1' ? { access_token: 'ms-tok' } : { error: 'invalid_client' }) }; }
  if (/graph\.microsoft\.com\//.test(url)){ const b = JSON.parse(opts.payload || '{}'); msCalls.push({ url, auth: opts.headers && opts.headers.Authorization, body: b }); const to = b.message && b.message.toRecipients[0].emailAddress.address; return to === 'bounce@gmail.com' ? { getResponseCode: () => 500, getContentText: () => '{"error":{"code":"ErrorInternalServerError"}}' } : { getResponseCode: () => 202, getContentText: () => '' }; }
  if (/ntfy\.sh\//.test(url)){ pushes.push({ url, title: opts.headers && opts.headers.Title, body: opts.payload }); return { getResponseCode: () => 200, getContentText: () => '{}' }; }
  // the statement's look-ups: Nancy's visits in her service period, the dispatch board for the photo, the photo itself
  if (url.indexOf('completed_jobs_report?date_from=' + d(20)) > 0) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ job_list: [
    { first_name:'New', last_name:'Nancy', date: d(15), status_name:'completed', start_time: d(15) + ' 09:03:00', end_time: d(15) + ' 09:12:00', assigned_to_name:'Jesse Duncan', duration:'9:00' },
    { first_name:'New', last_name:'Nancy', date: d(8), status_name:'skipped', skip_reason_title:'Gate locked', duration:'-' },
    { first_name:'Dana', last_name:'Deo', date: d(15), status_name:'completed', start_time: d(15) + ' 10:00:00', end_time: d(15) + ' 10:10:00', assigned_to_name:'Jesse Duncan', duration:'10:00' } ] }) };
  if (url.indexOf('jobs_for_date?date=' + d(15)) > 0) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ data: [ { full_name:'New Nancy', image_for_client:'https://img.sweepandgo.test/nancy-1.jpg' }, { full_name:'Dana Deo', image_for_client:'https://img.sweepandgo.test/dana.jpg' } ] }) };
  if (/img\.sweepandgo\.test\//.test(url)) { photoFetches.push(url); return { getResponseCode: () => 200, getBlob: () => ({ getBytes: () => [255, 216, 255, 224], getContentType: () => 'image/jpeg' }) }; }
  if (throttle > 0 && /openapi\.sweepandgo\.com/.test(url)) { throttle--; return { getResponseCode: () => 429, getAllHeaders: () => ({ 'Retry-After': '7' }), getContentText: () => '{"message":"Too Many Attempts."}' }; }
  const p = url.replace('https://openapi.sweepandgo.com', '').replace(/([?&])(page|length)=\d+/g, '$1').replace(/[?&]+$/, '').replace(/\?&/, '?').replace(/&&/g, '&');
  const key = Object.keys(API).find(k => p === k || p.startsWith(k + '?') || p.startsWith(k + '&') || (k.indexOf('?') > 0 && p.startsWith(k)));
  if (!key) return { getResponseCode: () => 404, getContentText: () => '{"errors":["no such route ' + p + '"]}' };
  if (API[key] === 'ERR400') return { getResponseCode: () => 400, getContentText: () => '{"errors":["bad type"]}' };
  if (!opts.headers || opts.headers.Authorization !== 'Bearer tok-123') return { getResponseCode: () => 403, getContentText: () => '{"errors":["Authorization failed"]}' };
  return { getResponseCode: () => 200, getContentText: () => JSON.stringify(API[key]) };
}

/* ---- the sheet as it stands before the sync: three people the office already has ---- */
function seed(){
  const row = (o) => HEADERS.map(h => o[h] == null ? '' : o[h]);
  return [HEADERS.slice(),
    // matched by phone; office notes and a follow-up to keep; the site's old price
    row({ id:'p6363750001', created:'2026-06-01T12:00:00Z', type:'ENQUIRY', name:'Dana D', phone:'6363750001', email:'dana@gmail.com', address:'1 Oak St, St. Peters, MO 63376', zip:'63376', service:'weekly', dogs:'2', price:'$91/mo', status:'closed', crmnotes:'[FU:2026-12-01] [CD:2026-06-01] [PM:91@2026-11-01] [QA:a] gate 4321', updated:'' }),
    // matched by name only (no phone or email on the old row)
    row({ id:'sgkelly', created:'2026-03-01T12:00:00Z', type:'SAVED', name:'Kelly .', phone:'', email:'', address:'14 Creekside Dr, St Peters, MO 63376', zip:'63376', service:'weekly', dogs:'3', price:'$99/mo', status:'closed', crmnotes:'[SGC:2026-03-01] [QP:87] [CD:2026-03-01] [QA:a] ', updated:'' }),
    // left six weeks ago over price: the win-back's customer
    row({ id:'p6363750040', created:'2026-01-05T12:00:00Z', type:'SAVED', name:'Price Pam', phone:'6363750040', email:'pricepam@gmail.com', zip:'63376', service:'weekly', dogs:'1', price:'$85/mo', status:'cancelled', crmnotes:'[CD:2026-01-05] [CX:' + d(40) + '] [CXR:price] [QA:a] ', updated:'' }),
    // asked for a price six weeks ago and went quiet: the revival's
    row({ id:'q_old', created: new Date(Date.now() - 45 * 864e5).toISOString(), type:'ENQUIRY', name:'Old Quote', phone:'6363750045', email:'oldq@gmail.com', zip:'63376', service:'weekly', dogs:'1', price:'$85/mo', status:'new', crmnotes:'[QA:w] ', updated:'' }),
    // typed by hand before the commercial side was synced: matched by its name
    row({ id:'greens', created:'2024-11-18T12:00:00Z', type:'SAVED', name:'Greens of Broadmoor - 14995 Green Cir Dr.', phone:'', email:'', zip:'63376', service:'commercial', dogs:'', price:'$60/mo (billed $60 per visit)', status:'closed', crmnotes:'[CD:2024-11-18] [QA:a] ', updated:'' }),
    // the office said no to this one: Sweep&Go must not reopen him
    row({ id:'p6363750006', created:'2026-04-01T12:00:00Z', type:'ENQUIRY', name:'Lost Larry', phone:'6363750006', email:'larry@gmail.com', zip:'63376', service:'weekly', dogs:'1', price:'$85/mo', status:'lost', crmnotes:'[QA:d] went elsewhere', updated:'' }),
    row({ id:'v1', created:'2026-11-01T12:00:00Z', type:'VIEW', name:'home', service:'Direct', notes:'how=none', status:'', crmnotes:'' }),
  ];
}
function build(leadRows){
  const { ss, sheets } = fakeSpreadsheet(leadRows);
  const props = { SHEET_ID:'x', SG_TOKEN:'tok-123', SG_HOOK:'word', NTFY_TOPIC:'clpps-test-topic' };
  const G = {
    UrlFetchApp: { fetch: fakeFetch },
    SpreadsheetApp: { openById: () => ss, create: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    DriveApp: { getFileById: () => ({ makeCopy: () => {} }), getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => ({ getFiles: () => ({ hasNext: () => false }) }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    Logger: { log: (m) => { logs.push(String(m)); } },
    ScriptApp: { WeekDay: { MONDAY:'mon', SUNDAY:'sun' }, getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/XYZ/exec' }), getProjectTriggers: () => [], deleteTrigger: () => {},
      newTrigger: (fn) => { const chain = { everyDays: () => chain, everyHours: () => chain, onWeekDay: () => chain, onMonthDay: () => chain, after: () => chain, atHour: () => chain, create: () => { triggers.push(fn); } }; return { timeBased: () => chain }; } },
    MailApp: { sendEmail: (o) => { mails.push(o); }, getRemainingDailyQuota: () => 100 }, Utilities: { getUuid: () => require('crypto').randomUUID(), formatDate: (d, tz, f) => f === 'yyyy-MM-dd' ? new Date(d).toISOString().slice(0, 10) : f === 'H' ? '12' : '202611', sleep: (ms) => { sleeps.push(ms); }, base64Encode: (s) => Buffer.from(String(s), 'utf8').toString('base64'), Charset: { UTF_8: 'utf8' }, newBlob: (c, type, name) => ({ c, type, name }), computeHmacSha256Signature: (v, k) => Array.from(require('crypto').createHmac('sha256', k).update(String(v)).digest()).map(b => b > 127 ? b - 256 : b) }, Session: { getScriptTimeZone: () => 'America/Chicago' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (txt) => ({ _t: txt, setMimeType(){ return this; } }) },
  };
  const F = new Function(...Object.keys(G), gs + '\nreturn { sgSync, sgHook_, sgBilling_, sgJobs_, setupSweepAndGo, weeklyPush, weeklyNumbers_, sgCreate_, sgSplitAddress_, sgQuotedBase_, doPost, followupsDue_, quoteFollowups, FU_STEPS, welcomeDue_, welcomeEmails, priceMove_, billingCsv_, sendCustomerMail_, testOfficeMail, dailyEmails, setupFollowups, install, INSTALL, sgBillingSync, sgSyncOnce, sgStatus, sgAllUntil_, tidySheet, payRemind_, paymentReminders, monthlyReport, eveningNudge, weeklyHousekeeping, publicDays_, cardFailedEmails, winbackEmails, leadRevival, referralThanks, campaignsDue, yearlyReport, yearlyReportText_, refCode_, doGet, pin_, sgRoutesBackfill, mileage_, hourlyNudge, anniversaryEmails, refreshReviews, monthlyReportText_, list_, ROUTES_BACK_TO, outreach_, springRestart, account_, acctToken_, refInvite_, ladderStep_, prepayText_, prepayInvite_, prepayRenewals, ownerReportText_, ownerReport, users_, who_, can_, checkin_, activity_, priceMove_ };')(...Object.values(G));
  return { F, sheets, props };
}

/* ---- a dry run writes nothing but says everything ---- */
{
  const { F, sheets } = build(seed());
  const before = JSON.stringify(sheets.leads.rows);
  const s = F.sgSync(true);
  ok('the preview reports what it would do', s.ok && s.dry && s.clients === 11 && s.added === 7 && s.updated === 2 && s.skippedNeverStarted === 1 && s.pinned === 2 && s.leads === 1 && s.commercial === 1 && s.errors.length === 0, JSON.stringify(s));
  ok('and names them', s.addedNames.join() === 'New Nancy,Paused Pat,Twice Tom,Off Olly,Sub Sally,Per Visit Pete,Gone Gus' && s.updatedNames.join() === 'Dana Deo,Kelly .', s.addedNames.join() + ' | ' + s.updatedNames.join());
  ok('an active client with no subscription is flagged for a look, not invented', s.noSubscription.join() === 'Lost Larry,Sub Sally', s.noSubscription.join());
  ok('nothing was written', JSON.stringify(sheets.leads.rows) === before && sheets.leads.writes === 0 && !sheets.billing && !sheets.jobs);
}

/* ---- the real thing ---- */
{
  const { F, sheets } = build(seed());
  calls.length = 0;
  const s = F.sgSync(false);
  const firstWrites = sheets.leads.writes;
  const rows = sheets.leads.rows.slice(1).map(r => { const o = {}; HEADERS.forEach((h, i) => { o[h] = r[i]; }); return o; });
  const by = (id) => rows.filter(r => r.id === id).slice(-1)[0];
  ok('the summary matches the preview', s.ok && !s.dry && s.added === 7 && s.updated === 2 && s.errors.length === 0, JSON.stringify(s));
  const dana = by('p6363750001');
  ok('Dana, matched by phone: price from both subscriptions, dogs, status, day, source; office notes kept', dana && dana.price === '$151/mo (includes $60 deodorize)' && dana.dogs === '2' && dana.status === 'closed' && dana.service === 'weekly' && dana.deodorize === 'every visit ($15/treatment)' && /\[DAY:thu\]/.test(dana.crmnotes) && /\[SGID:rcl_D\]/.test(dana.crmnotes) && /\[SRC:Meta Ads\]/.test(dana.crmnotes) && /\[FU:2026-12-01\]/.test(dana.crmnotes) && /gate 4321$/.test(dana.crmnotes) && /\[CD:2026-06-01\]/.test(dana.crmnotes), dana && JSON.stringify([dana.price, dana.crmnotes]));
  ok('her name on the card is not overwritten by Sweep&Go\'s spelling', dana.name === 'Dana D');
  ok('and she got Sweep&Go\'s pin and minutes', /\[LL:38\.79123,-90\.60111\]/.test(dana.crmnotes) && /\[ET:12\]/.test(dana.crmnotes), dana.crmnotes);
  const kelly = by('sgkelly');
  ok('Kelly\'s price reminder clears once Sweep&Go\'s price matches the quote', !/\[QP:/.test(kelly.crmnotes) && /\[SGC:2026-03-01\]/.test(kelly.crmnotes), kelly.crmnotes);
  ok('Kelly, matched by name: per-cleanup $20 x 4.33 = $87/mo, Tuesday, phone filled in, pinned', kelly && kelly.price === '$87/mo' && /\[DAY:tue\]/.test(kelly.crmnotes) && kelly.phone === '6363750002' && /\[LL:38\.77000,-90\.61000\]/.test(kelly.crmnotes) && /\[ET:20\]/.test(kelly.crmnotes), kelly && JSON.stringify([kelly.price, kelly.phone, kelly.crmnotes]));
  const larry = by('p6363750006');
  ok('Lost Larry stays Not interested whatever Sweep&Go says', larry.status === 'lost' && !/SGID/.test(larry.crmnotes));
  const nancy = by('p6363750009');
  ok('New Nancy is added: every other week, Monday, created on her start date, opted out of marketing', nancy && nancy.status === 'closed' && nancy.service === 'every other week' && nancy.price === '$75/mo' && /\[DAY:mon\]/.test(nancy.crmnotes) && /\[NOEM:1\]/.test(nancy.crmnotes) && nancy.created.indexOf(d(3)) === 0 && nancy.crmnotes.indexOf('[CD:' + d(3) + ']') >= 0 && nancy.type === 'SAVED', nancy && JSON.stringify(nancy));
  const gus = by('p6363750003');
  ok('Gone Gus is a former customer with the leaving date and reason', gus && gus.status === 'cancelled' && /\[CX:2026-09-02\]/.test(gus.crmnotes) && /\[CXR:moved\]/.test(gus.crmnotes) && /\[CD:2026-01-10\]/.test(gus.crmnotes), gus && gus.crmnotes);
  ok('Never Started is not added at all', !by('p6363750099'));
  const pat = by('p6363750004');
  ok('Paused Pat carries the pause window', pat && /\[PZ:2026-11-01~2026-12-15\]/.test(pat.crmnotes), pat && pat.crmnotes);
  const tom = by('p6363750005');
  ok('Twice Tom has both days and the twice-a-week plan', tom && /\[DAY:tue,fri\]/.test(tom.crmnotes) && tom.service === 'twice a week', tom && JSON.stringify([tom.crmnotes, tom.service]));
  const fiona = by('p6363750007');
  ok('a lead from Sweep&Go\'s form arrives as a new lead; Dana\'s own form entry does not duplicate her', fiona && fiona.type === 'ENQUIRY' && fiona.status === 'new' && /\[SRC:Sweep&Go form\]/.test(fiona.crmnotes) && rows.filter(r => r.phone === '6363750001').length === 1, fiona && JSON.stringify(fiona));
  /* ---- Sweep&Go's own flags, and the alias ---- */
  const olly = by('p6363750011'), sally = by('p6363750012'), pete = by('p6363750013');
  ok('a client Sweep&Go has off the schedule carries the flag, and one with no live subscription carries that', olly && /\[OS:1\]/.test(olly.crmnotes) && !/\[SS:/.test(olly.crmnotes) && sally && /\[SS:none\]/.test(sally.crmnotes) && !/\[OS:/.test(sally.crmnotes) && !/\[(OS|SS):/.test(dana.crmnotes), JSON.stringify([olly && olly.crmnotes, sally && sally.crmnotes]));
  ok('matched by phone under another spelling, Dana\'s card keeps Sweep&Go\'s name as an alias so invoices and visits still find her', /\[AKA:Dana Deo\]/.test(dana.crmnotes) && !/\[AKA:/.test(kelly.crmnotes), dana.crmnotes);
  ok('before the first billing pull Pete\'s price is whatever the subscription record says', pete && pete.price === '$15/mo', pete && pete.price);
  /* ---- the commercial side ---- */
  const greens = by('greens');
  ok('the hand-typed commercial row is recognised by name: Sweep&Go\'s id, the commercial mark, the day, the price from the commercial subscription, the company name as an alias; the name as the office wrote it', greens && /\[SGID:cl_G1\]/.test(greens.crmnotes) && /\[CM:1\]/.test(greens.crmnotes) && /\[DAY:wed\]/.test(greens.crmnotes) && /\[AKA:Greens of Broadmoor\]/.test(greens.crmnotes) && greens.price === '$60/mo' && greens.status === 'closed' && greens.name === 'Greens of Broadmoor - 14995 Green Cir Dr.' && s.commercial === 1, greens && JSON.stringify([greens.price, greens.crmnotes]));
  // the other sheets
  ok('the sync itself leaves the invoice history to a run of its own a minute later, so it stays well inside the six-minute limit', s.billing === 'scheduled' && !sheets.billing && triggers.includes('sgBillingSync') && !calls.some(u => /invoices|payments/.test(u)), JSON.stringify({ billing: s.billing, triggers }));
  triggers.length = 0;
  const bs = F.sgBillingSync();
  ok('that run pulls recurring and one-time invoices and the payments into the billing sheet, whole the first time, and records itself', bs.ok && bs.full === true && sheets.billing && sheets.billing.rows.length === 1 + 6 + 2 && calls.some(u => /type=one_time/.test(u)) && !calls.some(u => /type=onetime/.test(u)) && /sg_last_billing/.test(JSON.stringify(sheets.leads.rows.slice(-3))), JSON.stringify(bs) + ' ' + (sheets.billing && sheets.billing.rows.length));
  const bill = F.sgBilling_();
  ok('the billing fold reads it back: Kelly owes $87 and her card is declining, Nancy owes $75, Dana tipped $5', bill.unpaid.length === 2 && bill.unpaid[0].name === 'Kelly .' && bill.unpaid[0].owed === 87 && bill.unpaid[1].name === 'New Nancy' && bill.declining.length === 1 && bill.declining[0].name === 'Kelly .' && Object.values(bill.months).reduce((a, m) => a + m.tips, 0) === 5, JSON.stringify(bill));
  /* ---- the invoice is the truth for the price ---- */
  calls.length = 0;
  F.sgSync(false);
  const pete2 = sheets.leads.rows.filter(r => r[0] === 'p6363750013').pop();
  ok('on the next sync Pete\'s $15 record is read against his $65 monthly invoice: $15 x 4.33 is $65, so the price is $65/mo', pete2 && pete2[HEADERS.indexOf('price')] === '$65/mo', pete2 && pete2[HEADERS.indexOf('price')]);
  ok('Dana\'s price, which matches her invoice, stays', sheets.leads.rows.filter(r => r[0] === 'p6363750001').pop()[HEADERS.indexOf('price')] === '$151/mo (includes $60 deodorize)');
  const jobs = F.sgJobs_();
  ok('the jobs fold reads the visits: one done in 12 minutes for 2 dogs, one skipped for the gate', jobs.visits === 1 && jobs.skipped === 1 && jobs.byDogs['2'].median === 12 && jobs.skipReasons['Gate locked'] === 1, JSON.stringify(jobs));
  ok('and the last visits at each house, newest first, with minutes, who, and a skip reason', jobs.recent['Dana Deo'] && jobs.recent['Dana Deo'][0].min === 12 && jobs.recent['Dana Deo'][0].who === 'Jesse' && jobs.recent['Kelly .'][0].skip === 'Gate locked', JSON.stringify(jobs.recent));
  ok('who was skipped, and dollars an hour by plan, dogs and weekday', jobs.skippedBy['Kelly .'] === 1 && jobs.rate.byPlan.weekly.n === 1 && jobs.rate.byPlan.weekly.perHour === 175 && jobs.rate.byDogs['2'].perHour === 175 && Object.keys(jobs.rate.byWeekday).length === 1, JSON.stringify(jobs.rate));
  /* ---- the Monday push ---- */
  const n = F.weeklyNumbers_();
  ok('last week in numbers, from the sheets: customers, comings and goings, leads, money, work; Olly, off the schedule but invoiced this month, counts, Sally with no subscription and no money does not', n.active === 8 && n.toCheck === 1 && n.newCust === 1 && n.left === 0 && n.leadsIn >= 1 && n.billed === 75 && n.collected === 0 && n.owed === 162 && n.owed30 === 0 && n.visits === 1 && n.skipped === 1, JSON.stringify(n));
  const text = F.weeklyPush();
  ok('the push went to the topic with the week on four or five lines', pushes.length === 1 && pushes[0].title === 'CLPPS last week' && /\$75 billed, \$0 collected, \$162 still owed/.test(text) && /; 1 to check in Sweep&Go/.test(text) && /8 active, \+1 new/.test(text) && /1 visits done, 1 skipped/.test(text), JSON.stringify(pushes) + ' ' + text);
  const cfg = (n) => rows.filter(r => r.type === 'CONFIG' && r.name === n).slice(-1)[0];
  ok('the sync wrote its own status and the route report as settings', cfg('sg_last_sync') && JSON.parse(cfg('sg_last_sync').notes).clients === 11 && cfg('sg_routes') && JSON.parse(cfg('sg_routes').notes)[today][0].mi === 61.5);
  ok('writes are batched: well under one per row touched', firstWrites <= 12, String(firstWrites));
  // a second run changes nothing
  const w = sheets.leads.writes, s2 = F.sgSync(false);
  ok('running it again adds nothing and updates nothing', s2.added === 0 && s2.updated === 0 && s2.pinned === 0 && s2.leads === 0, JSON.stringify(s2));
  ok('and writes only its status rows', sheets.leads.writes - w <= 4, String(sheets.leads.writes - w));
  // the webhook
  const hooks = () => sheets.hooks ? sheets.hooks.rows.length - 1 : 0;
  ok('a webhook with the wrong word is refused', F.sgHook_('nope', { postData: { contents: '{"event":"client:changed_status"}' } }).ok === false && hooks() === 0);
  const h = F.sgHook_('word', { postData: { contents: '{"event":"client:changed_status","client":"rcl_D"}' } });
  ok('with the right word it is logged and answered', h.ok && h.event === 'client:changed_status' && hooks() === 1);
  ok('a staff event is logged but does not sync', F.sgHook_('word', { postData: { contents: '{"event":"staff:staff_clock_in"}' } }).ok && hooks() === 2);
}

/* ---- sign-up straight into Sweep&Go ---- */
{
  const row = (o) => HEADERS.map(h => o[h] == null ? '' : o[h]);
  const leadRows = [HEADERS.slice(),
    // accepted on the website: 2 dogs weekly at $151 with $60 deodorize -> base $91, which is Sweep&Go's price too
    row({ id:'p6363751001', created:'2026-11-10T12:00:00Z', type:'ACTIVATE', name:'Ann Accept', phone:'6363751001', email:'ann@gmail.com', address:'12 Elm St, St. Peters, MO 63376', zip:'63376', service:'weekly', dogs:'2', deodorize:'every visit ($15/treatment)', price:'$151/mo (includes $60 deodorize)', status:'new', crmnotes:'[SRC:Meta Ads] [CAMP:fall] [HH:A friend or neighbor] [QA:a] gate 1234', notes:'Gate code 1234', updated:'' }),
    // 1 dog weekly quoted $85; Sweep&Go's table says $95
    row({ id:'p6363751002', created:'2026-11-10T12:00:00Z', type:'ACTIVATE', name:'Bob Base', phone:'6363751002', email:'bob@gmail.com', address:'3 Ash St, St. Peters, MO 63376', zip:'63376', service:'weekly', dogs:'1', price:'$85/mo', status:'new', crmnotes:'[QA:a] ', updated:'' }),
    row({ id:'p6363751003', created:'2026-11-10T12:00:00Z', type:'ACTIVATE', name:'No Email', phone:'6363751003', email:'', zip:'63376', service:'weekly', dogs:'1', price:'$85/mo', status:'new', crmnotes:'[QA:a] ', updated:'' }),
    row({ id:'p6363751004', created:'2026-11-10T12:00:00Z', type:'ACTIVATE', name:'Already There', phone:'6363751004', email:'already@gmail.com', zip:'63376', service:'every other week', dogs:'1', price:'$70/mo', status:'new', crmnotes:'[QA:a] ', updated:'' }),
    row({ id:'p6363751005', created:'2026-11-10T12:00:00Z', type:'ACTIVATE', name:'Taken Tina', phone:'6363751005', email:'taken@gmail.com', zip:'63376', service:'every other week', dogs:'1', price:'$70/mo', status:'new', crmnotes:'[QA:a] ', updated:'' }),
    row({ id:'p6363751006', created:'2026-11-10T12:00:00Z', type:'ACTIVATE', name:'Out Olly', phone:'6363751006', email:'olly@gmail.com', zip:'62002', service:'weekly', dogs:'1', price:'$77/mo', status:'new', crmnotes:'[QA:a] ', updated:'' }),
  ];
  const { F, sheets } = build(leadRows);
  ok('an address splits into street, city and state', JSON.stringify(F.sgSplitAddress_('316 Old Forester Dr., Lake St. Louis, MO 63367', '63367')) === '{"street":"316 Old Forester Dr.","city":"Lake St. Louis","state":"MO"}' && F.sgSplitAddress_('2300 Oakhurst Dr, Alton, Illinois 62002', '62002').state === 'IL');
  ok('the quoted base is the price without deodorize', JSON.stringify(F.sgQuotedBase_('$151/mo (includes $60 deodorize)')) === '{"total":151,"base":91,"deo":60,"monthly":true}');
  onboardings.length = 0;
  const a = F.sgCreate_('p6363751001', false);
  const sent = onboardings[0];
  ok('Ann: Sweep&Go\'s $91 matches the $91 quote, so she is created', a.ok && a.created && !a.forced && a.sgPrice === 91 && onboardings.length === 1, JSON.stringify(a));
  ok('with everything the form knew: name, address split up, dogs, plan, phone, how she heard, the ad, the deodorize add-on, the terms', sent && sent.first_name === 'Ann' && sent.last_name === 'Accept' && sent.home_address === '12 Elm St' && sent.city === 'St. Peters' && sent.state === 'MO' && sent.zip_code === '63376' && sent.number_of_dogs === 2 && sent.clean_up_frequency === 'once_a_week' && sent.cell_phone_number === '6363751001' && sent.how_heard_answer === 'A friend or neighbor' && /utm_campaign=fall/.test(sent.tracking_field) && /utm_source=Meta Ads/.test(sent.tracking_field) && JSON.stringify(sent.cross_sells) === '[7]' && sent.terms_open_api === 1 && sent.initial_cleanup_required === 1 && /QUOTED PRICE: \$91\/mo for the cleanup plus \$60\/mo deodorize/.test(sent.additional_comment) && /Gate code 1234/.test(sent.additional_comment), JSON.stringify(sent));
  const annRow = sheets.leads.rows.find(r => r[0] === 'p6363751001');
  ok('and her row is stamped signed-up, closed, with a start date', /\[SGC:\d{4}-\d{2}-\d{2}\]/.test(annRow[HEADERS.indexOf('crmnotes')]) && /\[CD:\d{4}-\d{2}-\d{2}\]/.test(annRow[HEADERS.indexOf('crmnotes')]) && annRow[HEADERS.indexOf('status')] === 'closed' && /gate 1234$/.test(annRow[HEADERS.indexOf('crmnotes')]), annRow[HEADERS.indexOf('crmnotes')]);
  ok('asking again does nothing twice', F.sgCreate_('p6363751001', false).reason === 'done' && onboardings.length === 1);
  const b = F.sgCreate_('p6363751002', false);
  const bobRow = sheets.leads.rows.find(r => r[0] === 'p6363751002');
  ok('Bob: Sweep&Go\'s default is $95 against an $85 quote; he is created anyway, the quote goes in his Sweep&Go notes, and the card carries the reminder', b.ok && !b.priceOk && b.sgPrice === 95 && b.quoted === 85 && onboardings.length === 2 && /QUOTED PRICE: \$85\/mo for the cleanup - set the subscription price to this/.test(onboardings[1].additional_comment) && /\[QP:85\]/.test(bobRow[HEADERS.indexOf('crmnotes')]), JSON.stringify(b) + ' ' + bobRow[HEADERS.indexOf('crmnotes')]);
  ok('Ann, whose price matched, carries no reminder', !/\[QP:/.test(annRow[HEADERS.indexOf('crmnotes')]));
  ok('no email: refused before any call', F.sgCreate_('p6363751003', false).reason === 'no email');
  ok('an email Sweep&Go already has: refused before creating', F.sgCreate_('p6363751004', false).reason === 'exists' && onboardings.length === 2);
  ok('Sweep&Go answering 409 is also "exists"', F.sgCreate_('p6363751005', false).reason === 'exists');
  ok('a ZIP Sweep&Go does not cover: refused with the ZIP', F.sgCreate_('p6363751006', false).reason === 'zip');
  /* ---- the automatic switch: an acceptance posted by the website goes straight in ---- */
  sheets.leads.rows.push(row({ id:'cfg_sg_auto_create', created:'2026-11-10T12:00:00Z', type:'CONFIG', name:'sg_auto_create', notes:'on', status:'config', crmnotes:'' }));
  const post = (lead) => { const body = JSON.stringify({ action:'lead', lead }); return JSON.parse(F.doPost({ postData: { contents: body, length: body.length }, parameter: {} })._t); };
  const n0 = onboardings.length;
  const r1 = post({ id:'p6363751007', created: new Date().toISOString(), type:'ACTIVATE', name:'Cara Click', phone:'6363751007', email:'cara@gmail.com', address:'8 Oak St, St. Peters, MO 63376', zip:'63376', service:'weekly', dogs:'2', deodorize:'no', price:'$91/mo', crmnotes:'[QA:a] ' });
  ok('with the switch on, an acceptance from the website is created in Sweep&Go on the spot', r1.ok && onboardings.length === n0 + 1 && onboardings[n0].email === 'cara@gmail.com' && sheets.leads.rows.some(r => r[0] === 'p6363751007' && /\[SGC:/.test(r[HEADERS.indexOf('crmnotes')]) && r[HEADERS.indexOf('status')] === 'closed'), JSON.stringify(r1));
  const r2 = post({ id:'p6363751008', created: new Date().toISOString(), type:'ACTIVATE', name:'Dan Differs', phone:'6363751008', email:'dan@gmail.com', address:'9 Oak St, St. Peters, MO 63376', zip:'63376', service:'weekly', dogs:'1', price:'$85/mo', crmnotes:'[QA:a] ' });
  ok('a price that does not match is created too, with the reminder on the row', r2.ok && onboardings.length === n0 + 2 && sheets.leads.rows.some(r => r[0] === 'p6363751008' && /\[SGC:/.test(r[HEADERS.indexOf('crmnotes')]) && /\[QP:85\]/.test(r[HEADERS.indexOf('crmnotes')])));
  // an authorization from the emailed quote link names the lead in its zip field
  sheets.leads.rows.push(row({ id:'p6363751009', created:'2026-11-01T12:00:00Z', type:'ENQUIRY', name:'Eve Emailed', phone:'6363751009', email:'eve@gmail.com', address:'10 Oak St, St. Peters, MO 63376', zip:'63376', service:'weekly', dogs:'2', price:'$91/mo', status:'called', crmnotes:'[QA:w] ', updated:'' }));
  const r3 = post({ id:'az123', created: new Date().toISOString(), type:'AUTH', name:'Eve Emailed', zip:'p6363751009', price:'$91/mo', service:'weekly', dogs:'2', email:'eve@gmail.com' });
  ok('an authorization through the emailed quote link signs up the lead it points at', r3.ok && onboardings.length === n0 + 3 && onboardings[n0 + 2].email === 'eve@gmail.com', JSON.stringify(onboardings.slice(-1)));
  sheets.leads.rows.find(r => r[0] === 'cfg_sg_auto_create')[HEADERS.indexOf('notes')] = 'off';
  const n1 = onboardings.length;
  post({ id:'p6363751010', created: new Date().toISOString(), type:'ACTIVATE', name:'Off Otto', phone:'6363751010', email:'otto@gmail.com', address:'11 Oak St, St. Peters, MO 63376', zip:'63376', service:'weekly', dogs:'2', price:'$91/mo', crmnotes:'[QA:a] ' });
  ok('with the switch off, nothing is created without a tap', onboardings.length === n1);
}

/* ---- follow-up emails for quotes that went quiet ---- */
{
  const row = (o) => HEADERS.map(h => o[h] == null ? '' : o[h]);
  const ago = (days) => new Date(Date.now() - days * 864e5).toISOString();
  const q = (id, o) => row(Object.assign({ id, created: ago(3), type:'ENQUIRY', name:'Quiet ' + id, phone:'63637' + id.padStart(5, '0'), email: id + '@gmail.com', zip:'63376', service:'weekly', dogs:'1', price:'$85/mo', status:'new', crmnotes:'[QA:w] ' }, o));
  const leadRows = [HEADERS.slice(),
    q('a1'),                                                       // 3 days, no answer: step 1 due
    q('a2', { created: ago(1) }),                                  // too soon
    q('a3', { status:'called' }),                                  // somebody called
    q('a4', { crmnotes:'[TX:1@' + ago(1).slice(0, 10) + '] [QA:w] ' }),   // texted
    q('a5', { crmnotes:'[NOEM:1] [QA:w] ' }),                      // asked to be left alone
    q('a6', { crmnotes:'[QA:d] too much' }),                       // said no: the win-back email's job
    q('a7', { email:'' }),                                         // no email
    q('a8', { price:'', manual:'YES' }),                           // no price to remind them of
    q('a9', { created: ago(8), crmnotes:'[FE:1@' + ago(5).slice(0, 10) + '] [QA:w] ' }),   // step 1 went five days ago: step 2 due
    q('b1', { created: ago(8), crmnotes:'[FE:1@' + ago(1).slice(0, 10) + '] [QA:w] ' }),   // step 1 yesterday: wait
    q('b2', { created: ago(12), crmnotes:'[FE:1@' + ago(9).slice(0, 10) + '] [FE:2@' + ago(5).slice(0, 10) + '] [QA:w] ' }),   // both sent: done
    q('b3', { created: ago(25) }),                                 // too old
    q('b4', { status:'closed', crmnotes:'[CD:2026-11-01] [QA:a] ' }),
    q('b5'), row({ id:'azx', created: ago(1), type:'AUTH', zip:'b5', name:'Quiet b5', price:'$85/mo' }),   // authorized through the emailed link
    q('b6', { crmnotes:'[TM:1] [QA:w] ' }),                        // a team phone's test
  ];
  const { F, sheets, props } = build(leadRows);
  const due = F.followupsDue_(sheets.leads.rows, new Date());
  ok('exactly the right quotes are due, with the right step', due.map(d => d.id + ':' + d.step).sort().join(',') === 'a1:1,a9:2', JSON.stringify(due.map(d => d.id + ':' + d.step)));
  ok('each carries the first name, price and plan for the words', due[0].first === 'Quiet' && due[0].price === '$85/mo' && due[0].plan === 'weekly');
  mails.length = 0; msCalls.length = 0;
  const off = F.quoteFollowups();
  ok('with the switch off nothing is sent', off.off && mails.length === 0 && msCalls.length === 0);
  sheets.leads.rows.push(row({ id:'cfg_fu_emails', created: ago(0), type:'CONFIG', name:'fu_emails', notes:'on', status:'config', crmnotes:'' }));
  const noOffice = F.quoteFollowups();
  ok('with it on but no office mailbox, still nothing: not from Google, not from anywhere, and the rows are not stamped', noOffice.off && noOffice.reason === 'office mailbox not set up' && mails.length === 0 && msCalls.length === 0 && !/\[FE:/.test(sheets.leads.rows.find(r => r[0] === 'a1')[HEADERS.indexOf('crmnotes')]));
  Object.assign(props, MS);
  const on = F.quoteFollowups(), got = sentMs();
  ok('with the office mailbox connected, the two due emails go out as info@ through Microsoft, with the words filled in and the opt-out footer, and never through Google', on.sent === 2 && mails.length === 0 && got.length === 2 && got[0].to === 'a1@gmail.com' && /Quiet, your yard price is saved/.test(got[0].subject) && /Your price of \$85\/mo is saved for six months/.test(got[0].body) && /Reply STOP/.test(got[0].body) && got[0].replyTo === 'info@clpropetservices.com' && got[1].to === 'a9@gmail.com' && /Last note from me, Quiet/.test(got[1].subject), JSON.stringify(got.map(m => [m.to, m.subject])));
  ok('and each row is stamped, so tomorrow sends nothing twice', /\[FE:1@\d{4}-\d{2}-\d{2}\]/.test(sheets.leads.rows.find(r => r[0] === 'a1')[HEADERS.indexOf('crmnotes')]) && /\[FE:2@/.test(sheets.leads.rows.find(r => r[0] === 'a9')[HEADERS.indexOf('crmnotes')]) && F.followupsDue_(sheets.leads.rows, new Date()).length === 0);
}

/* ---- the sync clears a price-move stamp once Sweep&Go carries the new price ---- */
{
  const { F, sheets } = build(seed());
  F.sgSync(false);
  const dana = sheets.leads.rows.filter(r => r[0] === 'p6363750001').pop()[HEADERS.indexOf('crmnotes')];
  ok('Dana was told $91 and now pays $91: the stamp goes, the office notes stay', !/\[PM:/.test(dana) && /gate 4321/.test(dana) && /\[FU:2026-12-01\]/.test(dana), dana);
}

/* ---- the office mailbox: Microsoft or nothing, never Gmail ---- */
{
  const { F, props } = build(seed());
  mails.length = 0; msCalls.length = 0;
  let threw = '';
  try { F.sendCustomerMail_({ to:'x@gmail.com', subject:'s', body:'b' }); } catch (e) { threw = e.message; }
  ok('with nothing set up a customer email is refused outright: nothing goes from the Google account', threw === 'office mailbox not set up' && mails.length === 0 && msCalls.length === 0);
  ok('and testOfficeMail says so instead of pretending', F.testOfficeMail() === 'not configured');
  Object.assign(props, MS);
  mails.length = 0; msCalls.length = 0;
  const how = F.sendCustomerMail_({ to:'x@gmail.com', subject:'Hello', body:'Line one\nline two' });
  const tok = msCalls[0], send = msCalls[1];
  ok('with the four properties set, the script signs in to Microsoft as the app and sends as the office mailbox', how === 'microsoft' && mails.length === 0 && msCalls.length === 2 && /login\.microsoftonline\.com\/ten-1\/oauth2\/v2\.0\/token$/.test(tok.url) && tok.payload.client_id === 'cli-1' && tok.payload.grant_type === 'client_credentials' && /graph\.microsoft\.com\/v1\.0\/users\/info%40clpropetservices\.com\/sendMail$/.test(send.url) && send.auth === 'Bearer ms-tok', JSON.stringify(msCalls));
  ok('the message is plain text to the customer, reply-to the office, and kept in Outlook\'s Sent folder', send.body.message.subject === 'Hello' && send.body.message.body.contentType === 'Text' && send.body.message.body.content === 'Line one\nline two' && send.body.message.toRecipients[0].emailAddress.address === 'x@gmail.com' && send.body.message.replyTo[0].emailAddress.address === 'info@clpropetservices.com' && send.body.saveToSentItems === true, JSON.stringify(send.body));
  mails.length = 0; msCalls.length = 0; threw = '';
  try { F.sendCustomerMail_({ to:'bounce@gmail.com', subject:'s', body:'b' }); } catch (e) { threw = e.message; }
  ok('if Microsoft refuses, the email is reported as not sent; it does not go out another way', /Microsoft would not send \(500\)/.test(threw) && mails.length === 0);
  msCalls.length = 0;
  ok('the test button sends the office a note from itself', F.testOfficeMail() === 'ok' && msCalls.some(c => c.body && c.body.message.toRecipients[0].emailAddress.address === 'info@clpropetservices.com' && /came from the office mailbox/.test(c.body.message.subject)));
  props.MS_SECRET = 'wrong';
  mails.length = 0; threw = '';
  try { F.sendCustomerMail_({ to:'x@gmail.com', subject:'s', body:'b' }); } catch (e) { threw = e.message; }
  ok('a bad secret is reported too, and still nothing goes from Google', /Microsoft sign-in failed/.test(threw) && mails.length === 0 && F.testOfficeMail() !== 'ok');
  ok('the script never sends a customer email through MailApp any more', !/MailApp\.sendEmail\(\{ to: o\.to/.test(gs) && !/getRemainingDailyQuota/.test(gs));
}

/* ---- the welcome sequence: day 1 and day 30 for new customers ---- */
{
  const row = (o) => HEADERS.map(h => o[h] == null ? '' : o[h]);
  const ago = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  const c = (id, cdDaysAgo, extra) => row(Object.assign({ id, created: '2026-01-01T12:00:00Z', type:'SAVED', name: 'New ' + id.toUpperCase(), phone:'636375' + id.replace(/\D/g, '').padStart(4, '0'), email: id + '@gmail.com', zip:'63376', service:'weekly', dogs:'1', price:'$85/mo', status:'closed', crmnotes:'[CD:' + ago(cdDaysAgo) + '] [DAY:thu] [QA:a] ' }, extra || {}));
  const leadRows = [HEADERS.slice(),
    c('w1', 2),                                                            // started two days ago: the welcome
    c('w2', 35),                                                           // a month in: how are we doing, with the review link
    c('w3', 35, { crmnotes:'[CD:' + ago(35) + '] [RV:' + ago(3) + '] [QA:a] ' }),   // Jesse already asked for a review by hand
    c('w4', 35, { crmnotes:'[CD:' + ago(35) + '] [WE:1@' + ago(34) + '] [DAY:tue,fri] [QA:a] ' }),   // got the welcome, due the check-in
    c('w5', 2, { crmnotes:'[CD:' + ago(2) + '] [NOEM:1] [QA:a] ' }),      // no marketing emails
    c('w6', 2, { crmnotes:'[CD:' + ago(2) + '] [PZ:2026-11-01~2026-12-15] [QA:a] ' }),   // paused
    c('w7', 2, { status:'called' }),                                       // not a customer yet
    c('w8', 2, { email:'' }),                                              // no email
    c('w9', 12),                                                           // between the two windows
    c('x1', 60),                                                           // too late for either
    c('x2', 0),                                                            // started today: tomorrow
    c('x3', 2, { crmnotes:'[CD:' + ago(2) + '] [WE:1@' + ago(1) + '] [QA:a] ' }),   // already welcomed
    row({ id:'cfg_rl', created: ago(0), type:'CONFIG', name:'review_link', notes:'https://g.page/r/abc/review', status:'config', crmnotes:'' }),
  ];
  const { F, sheets, props } = build(leadRows);
  const due = F.welcomeDue_(sheets.leads.rows, new Date(), 'https://g.page/r/abc/review');
  ok('exactly the right customers are due, with the right step', due.map(d => d.id + ':' + d.step).sort().join(',') === 'w1:1,w2:2,w4:2', JSON.stringify(due.map(d => d.id + ':' + d.step)));
  const w1 = due.find(d => d.id === 'w1'), w4 = due.find(d => d.id === 'w4');
  ok('each carries the first name, their day in words and the review link', w1.first === 'New' && w1.day === 'Thursday' && w4.day === 'Tuesday' && w1.review === 'https://g.page/r/abc/review');
  mails.length = 0; msCalls.length = 0;
  const off = F.welcomeEmails();
  ok('with the switch off nothing is sent', off.off && mails.length === 0 && msCalls.length === 0);
  sheets.leads.rows.push(row({ id:'cfg_we', created: ago(0), type:'CONFIG', name:'welcome_emails', notes:'on', status:'config', crmnotes:'' }));
  const noOffice = F.welcomeEmails();
  ok('on, but no office mailbox yet: nothing goes and nothing is stamped', noOffice.off && noOffice.reason === 'office mailbox not set up' && mails.length === 0 && msCalls.length === 0 && F.welcomeDue_(sheets.leads.rows, new Date(), '').length === 3);
  Object.assign(props, MS);
  const on = F.welcomeEmails(), got = sentMs();
  const m1 = got.find(m => m.to === 'w1@gmail.com'), m2 = got.find(m => m.to === 'w2@gmail.com');
  ok('with the office mailbox connected the three go out as info@: the welcome names the day, the check-in carries the review link, both end with Corey and the opt-out', on.sent === 3 && mails.length === 0 && got.length === 3 && /Welcome aboard, New/.test(m1.subject) && /See you on Thursday!/.test(m1.body) && /How are we doing, New\?/.test(m2.subject) && /https:\/\/g\.page\/r\/abc\/review/.test(m2.body) && /— Corey/.test(m1.body) && /Reply STOP/.test(m2.body) && m1.replyTo === 'info@clpropetservices.com', JSON.stringify(got.map(m => [m.to, m.subject])));
  const notes = (id) => sheets.leads.rows.filter(r => r[0] === id).pop()[HEADERS.indexOf('crmnotes')];
  ok('each row is stamped; the day-30 email also counts as the review ask', /\[WE:1@/.test(notes('w1')) && !/\[RV:/.test(notes('w1')) && /\[WE:2@/.test(notes('w2')) && /\[RV:\d{4}-\d{2}-\d{2}\]/.test(notes('w2')) && /\[WE:1@/.test(notes('w4')) && /\[WE:2@/.test(notes('w4')), notes('w2'));
  ok('so tomorrow nothing goes twice', F.welcomeDue_(sheets.leads.rows, new Date(), '').length === 0);
  ok('the one 9am job runs both the quote follow-ups and the welcome sequence', (() => { const r = F.dailyEmails(); return r && r.followups && r.welcome && r.welcome.sent === 0; })());
}

/* ---- price notices ---- */
{
  const { F, sheets, props } = build(seed());
  mails.length = 0; msCalls.length = 0;
  const bad = F.priceMove_({ items: [], date: '2026-12-15' });
  ok('nothing ticked, nothing sent', bad.ok === false);
  const noOffice = F.priceMove_({ items: [{ id:'p6363750001', oldPrice: 91, newPrice: 99 }], date: '2026-12-15' });
  ok('no office mailbox: refused before anything is sent or stamped', noOffice.ok === false && noOffice.error === 'office mailbox not set up' && mails.length === 0 && msCalls.length === 0 && !/\[PM:99/.test(sheets.leads.rows.filter(r => r[0] === 'p6363750001').pop()[HEADERS.indexOf('crmnotes')]));
  Object.assign(props, MS);
  const r = F.priceMove_({ items: [{ id:'p6363750001', oldPrice: 91, newPrice: 99 }, { id:'nobody', oldPrice: 1, newPrice: 2 }, { id:'sgkelly', oldPrice: 99, newPrice: 105 }], date: '2026-12-15', reason: 'Fuel and supply costs have gone up this year.' });
  ok('Dana gets hers, the unknown id and the customer with no email are reported, not dropped silently', r.ok && r.sent.join() === 'p6363750001' && r.failed.length === 2 && r.failed[0].error === 'not found' && r.failed[1].error === 'no email' && r.date === '2026-12-15', JSON.stringify(r));
  const got = sentMs();
  ok('the notice goes as info@ and says the old price, the new price, the date in words and the reason, from Corey', mails.length === 0 && got.length === 1 && got[0].to === 'dana@gmail.com' && /price from December 15, 2026/.test(got[0].subject) && /Your price has been \$91 a month, and on December 15, 2026 it moves to \$99 a month\. Fuel and supply costs have gone up this year\./.test(got[0].body) && /— Corey/.test(got[0].body), got[0] && got[0].body);
  const dana = sheets.leads.rows.filter(r => r[0] === 'p6363750001').pop()[HEADERS.indexOf('crmnotes')];
  ok('and her row carries the move, next to the office notes', /\[PM:99@2026-12-15\]/.test(dana) && /gate 4321/.test(dana), dana);
}

/* ---- the accountant's two files ---- */
{
  const { F, sheets } = build(seed());
  F.sgSync(false); F.sgBillingSync();
  const x = F.billingCsv_();
  const lines = x.csv.trim().split('\n');
  ok('every invoice and payment, one a line, under the sheet\'s own headers', x.ok && lines[0] === 'kind,number,date,client,type,status,total,paid,remaining,interval,period_start,pay_type,description,period_end,next_try' && lines.length === x.rows + 1 && x.rows === sheets.billing.rows.length - 1 && x.rows > 3, lines[0] + ' | ' + lines.length + ' vs ' + x.rows);
  const ml = x.months.trim().split('\n');
  ok('and the months beside it: billed, one-time, collected, unpaid, tips, failed payments, customers', ml[0] === 'month,billed,one_time,collected,unpaid,tips,failed_payments,customers_invoiced' && ml.length >= 2 && /^\d{4}-\d{2},\d+,\d+,\d+,\d+,\d+,\d+,\d+$/.test(ml[1]), x.months);
}

/* ---- the one-time install: fill in, press Run ---- */
{
  ok('the committed file has every INSTALL value blank, so no secret ever reaches the repository', /var INSTALL = \{[^}]*\}/.test(gs) && !/INSTALL = \{[^}]*:\s*'[^']+'/.test(gs.match(/var INSTALL = \{[^}]*\}/)[0]));
  const { F, sheets, props } = build(seed());
  delete props.SG_TOKEN; delete props.SG_HOOK; delete props.NTFY_TOPIC;
  logs.length = 0; triggers.length = 0;
  const stop = F.install();
  ok('with no token it stops before touching anything, and says what to do', stop.ok === false && stop.step === 'token' && logs.some(l => /STOP: there is no Sweep&Go token/.test(l)) && sheets.leads.writes === 0 && triggers.length === 0);
  Object.assign(F.INSTALL, { SG_TOKEN: 'tok-123', SG_HOOK: 'word', TRACKER_KEY: 'NxcT-test', NTFY_TOPIC: 'clpps-test-topic', MAIL_FROM: 'info@clpropetservices.com', MS_TENANT: 'PASTE-HERE' });
  logs.length = 0; triggers.length = 0; pushes.length = 0; calls.length = 0;
  const r = F.install();
  ok('filled in, it saves the real values and skips the placeholder', r.ok && props.SG_TOKEN === 'tok-123' && props.SG_HOOK === 'word' && props.TRACKER_KEY === 'NxcT-test' && props.NTFY_TOPIC === 'clpps-test-topic' && props.MAIL_FROM === 'info@clpropetservices.com' && !props.MS_TENANT && r.saved.join() === 'SG_TOKEN,SG_HOOK,TRACKER_KEY,NTFY_TOPIC,MAIL_FROM', JSON.stringify(r));
  ok('checks the token with one call and leaves the heavy lifting to runs of their own, so install itself is quick', /2\. Sweep&Go accepts the token/.test(logs.join('\n')) && /3\. Jobs scheduled/.test(logs.join('\n')) && /FIRST sync starts by itself in about a minute/.test(logs.join('\n')) && calls.filter(u => /sweepandgo/.test(u)).length <= 2 && !sheets.billing, logs.join(' | ').slice(0, 600));
  ok('every job is scheduled: the first sync in a minute, the nightly sync, the Monday push, the 9am emails, the 5pm nudge, the month in review, the Sunday backup and tidy', ['sgSyncOnce', 'sgSync', 'weeklyPush', 'dailyEmails', 'eveningNudge', 'monthlyReport', 'weeklyHousekeeping'].every(fn => triggers.includes(fn)), triggers.join());
  ok('the backup ran and the sheet was tidied', logs.some(l => /4\. Backups: every Sunday night .* tidied/.test(l)), logs.filter(l => /^4\./.test(l)).join());
  triggers.length = 0; calls.length = 0;
  const first = F.sgSyncOnce();
  ok('the first sync then runs on its own, writes the customers and lines up the invoice pull', first.ok && first.added === 7 && sheets.leads.writes > 0 && triggers.includes('sgBillingSync'), JSON.stringify({ added: first.added, triggers }));
  ok('sgStatus reads back what happened', /"added":7/.test(F.sgStatus().sync));
  ok('the office mailbox is reported as not set up rather than failing', logs.some(l => /6\. Office mailbox: not set up yet/.test(l)));
  ok('a test push goes to the phones', pushes.some(x => /clpps-test-topic/.test(x.url) && /installed/.test(x.body)));
  ok('and the log ends with the two hand steps, with the webhook address filled in', logs.some(l => /A\. Publish: Deploy > Manage deployments > pencil/.test(l)) && logs.some(l => l.trim() === 'https://script.google.com/macros/s/XYZ/exec?hook=word') && r.webhook === 'https://script.google.com/macros/s/XYZ/exec?hook=word', logs.slice(-5).join(' | '));
  // a later paste of the blank repository file over this one must not undo anything
  Object.keys(F.INSTALL).forEach(k => { F.INSTALL[k] = ''; });
  logs.length = 0;
  const again = F.install();
  ok('run again with everything blank, nothing saved is lost', again.ok && props.SG_TOKEN === 'tok-123' && props.TRACKER_KEY === 'NxcT-test' && logs.some(l => /nothing new \(blank lines keep what was already saved\)/.test(l)));
}

/* ---- Sweep&Go's rate limit: wait, then ask again ---- */
{
  const { F } = build(seed());
  const retryWaits = () => sleeps.filter(x => [15000, 30000, 60000].includes(x));
  throttle = 2; sleeps.length = 0;
  const s = F.sgSync(true);
  ok('two "Too Many Attempts" in a row are waited out and the preview still comes back whole', s.ok && s.clients === 11 && s.errors.length === 0 && retryWaits().length === 2 && retryWaits()[0] === 15000 && retryWaits()[1] === 30000, JSON.stringify({ errors: s.errors, sleeps }));
  throttle = 4; sleeps.length = 0;
  const s2 = F.sgSync(true);
  ok('a limit that never lifts is reported as an error after three waits, not an endless loop', s2.errors.length >= 1 && /429/.test(s2.errors[0]) && retryWaits().length === 3 && retryWaits()[2] === 60000, JSON.stringify({ errors: s2.errors.slice(0, 1), sleeps }));
  throttle = 0;
  // pacing: past forty calls in a minute the script holds back before each further one
  sleeps.length = 0; calls.length = 0;
  const { F: F2 } = build(seed());
  F2.sgSync(false); F2.sgBillingSync(); F2.sgSync(false);
  const made = calls.filter(u => /sweepandgo/.test(u)).length;
  ok('a full sync, the billing pull and another sync are paced: more than forty calls, and a hold before each one past the fortieth', made > 40 && sleeps.filter(x => ![15000, 30000, 60000].includes(x)).length >= made - 40, JSON.stringify({ made, holds: sleeps.length }));
}

/* ---- only the recent pages each night ---- */
{
  const { F, sheets } = build(seed());
  calls.length = 0;
  ok('a list that comes newest first stops as soon as a whole page is older than wanted', F.sgAllUntil_('/api/v2/old_list', null, (v) => v.date < '2025-01-01').length === 2 && calls.filter(u => /old_list/.test(u)).length === 1);
  calls.length = 0;
  ok('without a stop every page is read', F.sgAllUntil_('/api/v2/old_list', null, null).length === 6 && calls.filter(u => /old_list/.test(u)).length === 3);
  F.sgSync(false); F.sgBillingSync();
  const n1 = sheets.billing.rows.filter(r => r[0]).length;
  const again = F.sgBillingSync();
  const sunday = new Date().getDay() === 0;
  ok('the second pull is partial on a weekday (the whole history again on Sundays), and the sheet ends up the same', again.ok && again.full === sunday && sheets.billing.rows.filter(r => r[0]).length === n1, JSON.stringify(again));
}

/* ---- the tidy: one row per person, old page views gone, nothing else touched ---- */
{
  const row = (o) => HEADERS.map(h => o[h] == null ? '' : o[h]);
  const rows = [HEADERS.slice(),
    row({ id:'dup1', created:'2026-05-01T12:00:00Z', type:'ENQUIRY', name:'Dup Old', status:'new', crmnotes:'old copy' }),
    row({ id:'dup1', created:'2026-05-01T12:00:00Z', type:'ENQUIRY', name:'Dup New', status:'closed', crmnotes:'[CD:2026-05-01] the one everybody reads' }),
    row({ id:'v_old', created:'2024-01-01T12:00:00Z', type:'VIEW', name:'home' }),
    row({ id:'v_new', created: new Date().toISOString(), type:'VIEW', name:'home' }),
    row({ id:'cfg_a', created:'2026-01-01T12:00:00Z', type:'CONFIG', name:'review_link', notes:'old', status:'config' }),
    row({ id:'cfg_a', created:'2026-02-01T12:00:00Z', type:'CONFIG', name:'review_link', notes:'new', status:'config' }),
    row({ id:'auth1', created:'2026-03-01T12:00:00Z', type:'AUTH', name:'x', zip:'dup1' }),
    row({ id:'solo', created:'2026-04-01T12:00:00Z', type:'SAVED', name:'Solo Sam', status:'closed' }),
  ];
  const { F, sheets } = build(rows);
  const t = F.tidySheet();
  const left = sheets.leads.rows.filter(r => r[0]).map(r => r[HEADERS.indexOf('id')] + ':' + r[HEADERS.indexOf('name')] + ':' + (r[HEADERS.indexOf('notes')] || ''));
  ok('duplicates fold to the row the tracker and the sync already use, the stale page view goes, the newest setting stays, authorizations and everyone else are untouched, in order', t.ok && t.removed === 3 && t.kept === 5 && left.join('|') === 'id:name:notes|dup1:Dup New:|v_new:home:|cfg_a:review_link:new|auth1:x:|solo:Solo Sam:', JSON.stringify({ t, left }));
  ok('run again, nothing more to do', F.tidySheet().removed === 0);
  ok('Sunday night does the backup and then the tidy', !!F.weeklyHousekeeping());
}

/* ---- payment reminders, the month in review, the evening nudge ---- */
{
  const { F, sheets, props } = build(seed());
  F.sgSync(false); F.sgBillingSync();
  mails.length = 0; msCalls.length = 0;
  ok('a payment reminder is refused until the office mailbox is connected', F.payRemind_({ id:'p6363750001', amount: 50, since: d(20) }).ok === false);
  Object.assign(props, MS);
  const noMail = F.payRemind_({ id:'sgkelly', amount: 87, since: d(9) });
  ok('Kelly has no email: said so, nothing sent', noMail.ok === false && noMail.error === 'no email' && sentMs().length === 0);
  const pv = F.payRemind_({ id:'p6363750009', amount: 75, since: d(20), preview: true });
  ok('a preview draws up the statement without sending: the invoice number and date, the service period, billed / paid / open, why it is open and the next card try, the total, no link yet', pv.ok && pv.preview && pv.to === 'nancy@gmail.com' && pv.items.length === 1 && pv.total === 75 && pv.link === false && /One invoice is open, \$75\.00 in all/.test(pv.body) && /Invoice 768-5-1 · issued /.test(pv.body) && /Service \w{3} \d+ – \w{3} \d+, 20\d\d \(monthly service\)/.test(pv.body) && /\$75\.00 billed · \$0\.00 paid · \$75\.00 open/.test(pv.body) && /Overdue · the card on file has not gone through · next card try /.test(pv.body) && /Total open: \$75\.00/.test(pv.body) && !/Pay now:/.test(pv.body) && /Pay button too/.test(pv.body) && sentMs().length === 0, pv.body);
  ok('the visits the invoice covers come from Sweep&Go for that period, with the tech, the minutes and the skip; the photo is found on the dispatch board and counted, not yet downloaded', pv.visits === 2 && pv.photos === 1 && /Visits: \w{3} \d+ 09:03 \(Jesse, 9 min, photo attached\) · \w{3} \d+ skipped, gate locked/.test(pv.body) && /One photo from the visits is attached, named by date/.test(pv.body) && photoFetches.length === 0 && !pv.attachments, pv.body);
  sheets.leads.rows.push(HEADERS.map(h => ({ id:'cfg_pl', created: new Date().toISOString(), type:'CONFIG', name:'pay_link', notes:'https://clpps.sweepandgo.com/portal', status:'config' })[h] || ''));
  const r = F.payRemind_({ id:'p6363750009', amount: 75, since: d(20) });
  const got = sentMs();
  const att = msCalls.filter(c => c.body && c.body.message).slice(-1)[0].body.message.attachments || [];
  ok('the send downloads the photo and attaches it, named by the visit date', photoFetches.length === 1 && att.length === 1 && att[0].name === 'visit-' + d(15) + '.jpg' && att[0].contentType === 'image/jpeg' && att[0].contentBytes.length > 0, JSON.stringify(att.map(a => [a.name, a.contentType])));
  ok('Nancy gets the statement from the office with the invoice, the total and the Pay now link once it is set, and her row is stamped', r.ok && got.length === 1 && got[0].to === 'nancy@gmail.com' && /Your account with CL Professional Pet Services/.test(got[0].subject) && /Pay now: https:\/\/clpps\.sweepandgo\.com\/portal/.test(got[0].body) && /Invoice 768-5-1/.test(got[0].body) && /— Corey/.test(got[0].body) && /\[PR:75@\d{4}-\d{2}-\d{2}\]/.test(sheets.leads.rows.filter(x => x[0] === 'p6363750009').pop()[HEADERS.indexOf('crmnotes')]), JSON.stringify(got));
  msCalls.length = 0;
  ok('the Monday round is off by default', F.paymentReminders().off === true && sentMs().length === 0);
  sheets.leads.rows.push(HEADERS.map(h => ({ id:'cfg_pr', created: new Date().toISOString(), type:'CONFIG', name:'pay_reminders', notes:'on', status:'config' })[h] || ''));
  const round = F.paymentReminders();
  ok('switched on: Nancy was reminded today so she is skipped, Kelly has no email; nobody is nagged twice inside 14 days', round.ok && round.sent === 0 && sentMs().length === 0, JSON.stringify(round));
  // the month in review
  msCalls.length = 0; mails.length = 0;
  const mr = F.monthlyReport();
  const sent = msCalls.filter(c => c.body && c.body.message).pop();
  ok('on the 1st the month in review goes to the office from the office, with the three files attached', mr.ok && mr.how === 'microsoft' && sent && sent.body.message.toRecipients.map(x => x.emailAddress.address).join() === 'info@clpropetservices.com,clpropetservices@gmail.com' && /in review$/.test(sent.body.message.subject) && sent.body.message.attachments.length === 3 && sent.body.message.attachments[0].name === 'clpps-billing-by-month.csv' && Buffer.from(sent.body.message.attachments[1].contentBytes, 'base64').toString('utf8').indexOf('kind,number,date') === 0, JSON.stringify(sent && sent.body.message.subject));
  ok('and it reads like a note, not a dump: money, customers with the one to check, work, leads', /Money: \$/.test(sent.body.message.body.content) && /Customers: \d+ active \(plus 1 Sweep&Go still calls active/.test(sent.body.message.body.content) && /Work: \d+ visits done/.test(sent.body.message.body.content) && /Leads: \d+ came in/.test(sent.body.message.body.content), sent.body.message.body.content);
  delete props.MS_TENANT;
  ok('without the office mailbox the report still reaches the office, from Google, since it is not a customer email', F.monthlyReport().how === 'google' && mails.length === 1 && mails[0].attachments.length === 3);
  // the evening nudge
  pushes.length = 0;
  const nudge = F.eveningNudge();
  ok('at 5pm, the lead that came in today and was never called is pushed to the phones by name', nudge.waiting === 1 && pushes.length === 1 && pushes[0].title === 'Before you clock off' && /1 lead from today still not called: Form Fiona/.test(pushes[0].body), JSON.stringify({ nudge, pushes }));
  sheets.leads.rows.forEach(r => { if (r[0] === 'p6363750007') r[HEADERS.indexOf('status')] = 'called'; });
  pushes.length = 0;
  ok('once she is called, nothing is sent', F.eveningNudge().waiting === 0 && pushes.length === 0);
}

/* ---- the quote page's question: which days are we already on this ZIP ---- */
{
  const { F } = build(seed());
  F.sgSync(false);
  const d1 = F.publicDays_();
  ok('a ZIP with three or more customers answers with its days, two or more customers each, busiest first; a ZIP with one customer, and anyone off schedule, without a subscription, commercial or a test phone, say nothing', d1.ok && d1.zips['63376'] && d1.zips['63376'].slice().sort().join() === 'fri,thu,tue' && !d1.zips['63366'], JSON.stringify(d1));
  const viaGet = JSON.parse(F.doGet({ parameter: { action: 'days' } })._t);
  ok('and it is public, by GET, with no key: there is nothing in it about anyone', viaGet.ok && viaGet.zips['63376'] && Object.keys(viaGet).join() === 'ok,zips');
}

/* ---- no key, no entry ---- */
{
  const { F, props } = build(seed());
  delete props.TRACKER_KEY;
  const r = JSON.parse(F.doPost({ postData: { length: 40, contents: JSON.stringify({ action:'list', key:'' }) }, parameter: {} })._t);
  ok('with no TRACKER_KEY set, an empty key is refused too: the old built-in password is gone', r.ok === false && r.error === 'bad pin' && /no-key-set/.test(F.pin_()));
}

/* ---- the other automatic rounds: card failed, win-back, revival, referral thanks, the calendar ---- */
{
  const { F, sheets, props } = build(seed());
  F.sgSync(false); F.sgBillingSync();
  Object.assign(props, MS);
  const on = (k) => sheets.leads.rows.push(HEADERS.map(h => ({ id:'cfg_' + k, created: new Date().toISOString(), type:'CONFIG', name: k, notes:'on', status:'config' })[h] || ''));
  const notes = (id) => sheets.leads.rows.filter(r => r[0] === id).pop()[HEADERS.indexOf('crmnotes')];
  // a card that failed last night
  const BH = ['kind','number','date','client','type','status','total','paid','remaining','interval','period_start','pay_type','description'];
  sheets.billing.rows.push(BH.map(h => ({ kind:'payment', date: d(1), client:'Dana Deo', type:'credit_card', status:'failed', total:'151', paid:'151' })[h] || ''));
  msCalls.length = 0;
  ok('every round is off until its switch is on', F.cardFailedEmails().off && F.winbackEmails().off && F.leadRevival().off && F.referralThanks().off && sentMs().length === 0);
  on('card_emails'); on('winback_emails'); on('revival_emails'); on('referral_emails');
  const cf = F.cardFailedEmails(), cfMail = sentMs().pop();
  ok('Dana, whose card failed last night, gets the note the same day, from the office, and her row is stamped', cf.sent === 1 && cfMail.to === 'dana@gmail.com' && /Your card did not go through/.test(cfMail.subject) && new RegExp('\\$151 on ' + d(1)).test(cfMail.body) && /\[CF:151@/.test(notes('p6363750001')), JSON.stringify(cf) + ' ' + (cfMail && cfMail.body));
  ok('run again the same week, nothing more', F.cardFailedEmails().sent === 0);
  msCalls.length = 0;
  const wb = F.winbackEmails(), wbMail = sentMs().pop();
  ok('Pam, gone six weeks over price, gets the come-back note; Gus, who moved, does not', wb.sent === 1 && wbMail.to === 'pricepam@gmail.com' && /love to have you back/.test(wbMail.subject) && /no restart fee, and you get 10% off today’s price for your first 6 months back/.test(wbMail.body) && /\[WK:/.test(notes('p6363750040')) && !/\[WK:/.test(notes('p6363750003')), JSON.stringify(wb));
  msCalls.length = 0;
  const lr = F.leadRevival(), lrMail = sentMs().filter(m => m.to === 'oldq@gmail.com')[0];
  ok('the quote that went quiet six weeks ago is revived, and so is the one who said no: the price still stands, with no waiver promised; the lead that came in today is left alone', lr.sent === 2 && sentMs().some(m => m.to === 'larry@gmail.com') && lrMail && /is the yard still on the list/.test(lrMail.subject) && /Your price of \$85\/mo for weekly still stands/.test(lrMail.body) && /\[LR:/.test(notes('q_old')) && !/\[LR:/.test(notes('p6363750007')), JSON.stringify(lr) + ' ' + (lrMail && lrMail.body));
  ok('and only once, ever', F.leadRevival().sent === 0);
  // a referral: Rita came through Dana's link and started this week
  const code = F.refCode_('p6363750001', 'Dana D');
  sheets.leads.rows.push(HEADERS.map(h => ({ id:'p6363750050', created: new Date().toISOString(), type:'ACTIVATE', name:'Ref Rita', phone:'6363750050', email:'rita@gmail.com', zip:'63376', service:'weekly', dogs:'1', price:'$85/mo', status:'closed', crmnotes:'[CD:' + d(3) + '] [RF:' + code + '] [QA:a] ' })[h] || ''));
  msCalls.length = 0; pushes.length = 0;
  const rt = F.referralThanks(), rtMail = sentMs().pop();
  ok('Dana is thanked from the office, told the free deodorize is on her next visit; the phones are told to add it in Sweep&Go; Rita\'s row is stamped', rt.sent === 1 && rtMail.to === 'dana@gmail.com' && /your free deodorize is on the way/.test(rtMail.subject) && /Ref just started with us/.test(rtMail.body) && pushes.some(p => p.title === 'Referral reward owed' && /Dana D referred Ref Rita/.test(p.body)) && /\[RT:/.test(notes('p6363750050')), JSON.stringify({ rt, pushes }));
  ok('and not twice', F.referralThanks().sent === 0);
  // the calendar: the fall email, dated today for the test
  const md = ('0' + (new Date().getMonth() + 1)).slice(-2) + '-' + ('0' + new Date().getDate()).slice(-2);
  ok('with nothing ticked the calendar sends nothing', F.campaignsDue().due.length === 0);
  sheets.leads.rows.push(HEADERS.map(h => ({ id:'cfg_campaigns', created: new Date().toISOString(), type:'CONFIG', name:'campaigns', notes: JSON.stringify({ fall: { on: true, date: md }, deo: { on: false } }), status:'config' })[h] || ''));
  msCalls.length = 0;
  const cd = F.campaignsDue(), cMail = sentMs().filter(m => m.to === 'oldq@gmail.com')[0], year = new Date().getFullYear();
  ok('on its day the fall email goes to the quotes that never went ahead and the one who said no, filled in, stamped with the year, and not to today\'s lead or to customers', cd.due.join() === 'fall' && cd.results.fall.sent === 2 && cMail && !sentMs().some(m => m.to === 'newlead@gmail.com' || m.to === 'dana@gmail.com') && /the leaves are coming/.test(cMail.subject) && /Your price of \$85\/mo for weekly/.test(cMail.body) && new RegExp('\\[EM:fall' + year + '@').test(notes('q_old')), JSON.stringify(cd));
  ok('and not again this year', F.campaignsDue().results.fall.sent === 0);
  // the year in review
  msCalls.length = 0;
  const yr = F.yearlyReport(), ySent = msCalls.filter(c => c.body && c.body.message).pop();
  ok('the year in review goes to the office with the three files, and reads: money, customers and how long they stay, leads', yr.ok && yr.how === 'microsoft' && ySent.body.message.attachments.length === 3 && /in review$/.test(ySent.body.message.subject) && /Money: \$/.test(ySent.body.message.body.content) && /Customers: \d+ active at year end/.test(ySent.body.message.body.content) && /Leads: \d+ came in/.test(ySent.body.message.body.content), ySent && ySent.body.message.body.content);
  // the daily job runs them all and reports each
  const daily = F.dailyEmails();
  ok('the 9am job runs every round and reports each by name', ['followups', 'welcome', 'cards', 'winback', 'revival', 'referral', 'anniversary', 'campaigns'].every(k => daily[k] && daily[k].ok), JSON.stringify(Object.keys(daily)));
  // the anniversary: Dana started this day last year
  const mdToday = new Date().toISOString().slice(5, 10), lastYear = new Date().getFullYear() - 1;
  sheets.leads.rows.forEach(r => { if (r[0] === 'p6363750001') r[HEADERS.indexOf('crmnotes')] = r[HEADERS.indexOf('crmnotes')].replace(/\[CD:[^\]]*\]/, '[CD:' + lastYear + '-' + mdToday + ']'); });
  on('anniversary_emails');
  msCalls.length = 0;
  const an = F.anniversaryEmails(), anMail = sentMs().pop();
  ok('on the anniversary of her start Dana is thanked from the office, with the free deodorize, and the year is stamped so it is once a year', an.sent === 1 && anMail.to === 'dana@gmail.com' && /A year with us, Dana/.test(anMail.subject) && /free deodorizing and sanitizing treatment/.test(anMail.body) && new RegExp('\\[AN:' + new Date().getFullYear() + '@').test(notes('p6363750001')) && F.anniversaryEmails().sent === 0, JSON.stringify(an));
}

/* ---- the mileage log, the delta list, the pings ---- */
{
  const { F, sheets, props } = build(seed());
  Object.assign(props, MS);
  F.sgSync(false);
  ok('the sync keeps every day\'s route report in the routes sheet: date, who, miles, minutes, driving, stops, price', sheets.routes && sheets.routes.rows.length >= 2 && sheets.routes.rows[1][1] === 'Jesse Duncan' && Number(sheets.routes.rows[1][2]) === 61.5, JSON.stringify(sheets.routes && sheets.routes.rows.slice(0, 3)));
  const n1 = sheets.routes.rows.filter(r => r[0]).length;
  F.sgSync(false);
  ok('a second sync replaces the same days rather than doubling them', sheets.routes.rows.filter(r => r[0]).length === n1);
  triggers.length = 0;
  const bs = F.sgBillingSync();
  ok('the first billing pull lines up the mileage backfill', bs.backfill === 'scheduled' && triggers.includes('sgRoutesBackfill'));
  triggers.length = 0; calls.length = 0;
  const bf = F.sgRoutesBackfill();
  ok('the backfill reads a hundred days back in one run, keeps them, and books itself again for the rest', bf.ok && bf.rows >= 100 && !bf.done && triggers.includes('sgRoutesBackfill') && calls.filter(u => /route_planning_report/.test(u)).length === 100, JSON.stringify(bf));
  const mi = F.mileage_();
  ok('miles by month come out of it, with the days driven', Object.keys(mi).length >= 3 && Object.values(mi).every(m => m.miles > 0 && m.days > 0), JSON.stringify(mi).slice(0, 200));
  const files = F.billingCsv_();
  ok('and the accountant\'s files carry a third one, miles by month', /^month,miles,days_driven\n/.test(files.miles) && files.miles.split('\n').length >= 4, files.miles.slice(0, 120));
  const mk = new Date().toISOString().slice(0, 7);
  const mtext = F.monthlyReportText_(mk);
  ok('the month review says what moved the number, and the miles', /On the books: \$[\d,]+ a month at the start, \+\$[\d,]+ from \d+ new, -\$[\d,]+ from \d+ who left/.test(mtext) && /Miles: [\d,]+ driven over \d+ days/.test(mtext) && /Three files attached/.test(mtext), mtext);
  msCalls.length = 0;
  F.monthlyReport();
  ok('and sends three files', msCalls.filter(c => c.body && c.body.message).pop().body.message.attachments.map(a => a.name).join() === 'clpps-billing-by-month.csv,clpps-invoices-and-payments.csv,clpps-miles-by-month.csv');
  // the list, only what changed
  props.TRACKER_KEY = 'NxcT-test';
  const full = JSON.parse(F.list_({ key: 'NxcT-test', days: 1 })._t);
  const sinceAll = JSON.parse(F.list_({ key: 'NxcT-test', days: 1, since: new Date(Date.now() + 60000).toISOString() })._t);
  const sinceOld = JSON.parse(F.list_({ key: 'NxcT-test', days: 1, since: '2020-01-01T00:00:00.000Z' })._t);
  ok('asked for changes since a minute from now, the list is empty and marked as a delta; since 2020, it is the whole list', sinceAll.ok && sinceAll.delta === true && sinceAll.leads.length === 0 && sinceOld.delta === true && sinceOld.leads.length === full.leads.length && full.delta === false, JSON.stringify([sinceAll.leads.length, sinceOld.leads.length, full.leads.length]));
  // the pings
  pushes.length = 0;
  F.sgHook_('word', { postData: { contents: JSON.stringify({ event: 'client:onboarding_recurring', first_name: 'Sue', last_name: 'Signup' }) } });
  ok('somebody signing up straight in Sweep&Go reaches the phones within minutes', pushes.some(p => p.title === 'New sign-up in Sweep&Go' && /Sue Signup just signed up/.test(p.body)), JSON.stringify(pushes));
  pushes.length = 0;
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  sheets.leads.rows.forEach(r => { if (r[0] === 'p6363750004') r[HEADERS.indexOf('crmnotes')] = r[HEADERS.indexOf('crmnotes')].replace(/\[PZ:[^\]]*\]/, '[PZ:2026-11-01~' + tomorrow + ']'); });
  const ev = F.eveningNudge();
  ok('the evening round also says who is back from a pause tomorrow', ev.back.join() === 'Paused Pat' && pushes.some(p => p.title === 'Back tomorrow' && /Paused Pat is back on the route tomorrow/.test(p.body)), JSON.stringify({ ev, pushes }));
  pushes.length = 0;
  sheets.leads.rows.push(HEADERS.map(h => ({ id:'q_hour', created: new Date(Date.now() - 70 * 60000).toISOString(), type:'ENQUIRY', name:'Hour Hal', phone:'6363750070', email:'hal@gmail.com', zip:'63376', service:'weekly', dogs:'1', price:'$85/mo', status:'new', crmnotes:'[QA:w] ' })[h] || ''));
  const hn = F.hourlyNudge();
  ok('a lead not called an hour on gets one more push, by name, and is marked so it is once', hn.waiting === 1 && pushes.some(p => p.title === 'Lead waiting an hour' && /Hour Hal \(70 min\)/.test(p.body)) && /\[NG:1\]/.test(sheets.leads.rows.filter(r => r[0] === 'q_hour').pop()[HEADERS.indexOf('crmnotes')]) && F.hourlyNudge().waiting === 0, JSON.stringify({ hn, pushes }));
  // a new Google review
  Object.assign(props, { PLACES_KEY: 'k', PLACE_ID: 'p' });
  sheets.leads.rows.push(HEADERS.map(h => ({ id:'cfg_rc', created: new Date(Date.now() - 864e5).toISOString(), type:'CONFIG', name:'review_count', notes:'39', status:'config' })[h] || ''));
  pushes.length = 0;
  F.refreshReviews();
  ok('when Google shows one more review than last time, the phones are told to go and reply', pushes.some(p => p.title === 'New Google review' && /1 new Google review: 40 now at 4.9 stars/.test(p.body)), JSON.stringify(pushes));
  pushes.length = 0;
  F.refreshReviews();
  ok('and not when the count is unchanged', pushes.length === 0);
}
/* ---- win back and grow: the notes by reason, the ladder, the customer page, the referral links ---- */
{
  const R = (o) => HEADERS.map(h => o[h] == null ? '' : o[h]);
  const rows = seed();
  rows.push(R({ id:'dogless', created:'2025-01-01T12:00:00Z', type:'SAVED', name:'Dogless Dan', phone:'6363750051', email:'dan@gmail.com', zip:'63376', price:'$85/mo', status:'cancelled', crmnotes:'[CX:' + d(50) + '] [CXR:nodog] ' }));
  rows.push(R({ id:'grumpy', created:'2025-01-01T12:00:00Z', type:'SAVED', name:'Grumpy Gail', phone:'6363750052', email:'gail@gmail.com', zip:'63376', price:'$85/mo', status:'cancelled', crmnotes:'[CX:' + d(50) + '] [CXR:service] ' }));
  rows.push(R({ id:'snowbird', created:'2025-01-01T12:00:00Z', type:'SAVED', name:'Snowbird Sue', phone:'6363750053', email:'sue@gmail.com', zip:'63376', price:'$70/mo', status:'cancelled', crmnotes:'[CX:' + d(120) + '] [CXR:season] [DAY:tue] ' }));
  rows.push(R({ id:'latelou', created:'2025-01-01T12:00:00Z', type:'SAVED', name:'Late Lou', phone:'6363750054', email:'lou@gmail.com', zip:'63376', price:'$80/mo', status:'closed', crmnotes:'[CD:2025-01-01] ' }));
  rows.push(R({ id:'newnell', created: new Date().toISOString(), type:'SAVED', name:'New Nell', phone:'6363750056', email:'nell@gmail.com', zip:'63376', price:'$100/mo', status:'closed', crmnotes:'[CD:' + new Date().toISOString().slice(0, 10) + '] ' }));
  rows.push(R({ id:'midmo', created:'2025-01-01T12:00:00Z', type:'SAVED', name:'Mid Mo', phone:'6363750055', email:'mo@gmail.com', zip:'63376', price:'$80/mo', status:'closed', crmnotes:'[CD:2025-01-01] ' }));
  const { F, sheets, props } = build(rows);
  F.sgSync(false); F.sgBillingSync();
  const B = (o) => ['kind','number','date','client','type','status','total','paid','remaining','interval','period_start','pay_type','description','period_end','next_try'].map(h => o[h] == null ? '' : o[h]);
  sheets.billing.rows.push(B({ kind:'invoice', number:'L-1', date: d(40), client:'Late Lou', type:'subscription', status:'overdue', total:'80.00', paid:'0.00', remaining:'80.00', interval:'monthly', pay_type:'credit_card' }));
  sheets.billing.rows.push(B({ kind:'invoice', number:'N-1', date: d(65), client:'New Nell', type:'subscription', status:'overdue', total:'100.00', paid:'0.00', remaining:'100.00', interval:'monthly', pay_type:'credit_card' }));
  sheets.billing.rows.push(B({ kind:'invoice', number:'M-1', date: d(25), client:'Mid Mo', type:'subscription', status:'overdue', total:'80.00', paid:'0.00', remaining:'80.00', interval:'monthly', pay_type:'check' }));
  Object.assign(props, MS); msCalls.length = 0;
  const today = new Date().toISOString().slice(0, 10);
  const pam = F.outreach_({ id:'p6363750040', kind:'winback', preview:true });
  ok('win back: Pam left over price, so her note offers today\'s price with 10% off her first 6 months and no restart fee, never her old price; a preview sends nothing', pam.ok && pam.sub === 'price' && /a welcome-back price for your yard/.test(pam.subject) && /you get 10% off today’s price for your first 6 months back, and there is no restart fee/.test(pam.body) && !/\$85/.test(pam.body) && /today’s price for your yard is \$95 a month, and you get 10% off your first 6 months back \(\$86 a month\)/.test(F.outreach_({ id:'p6363750040', kind:'winback', preview:true, now: 95 }).body) && /— Corey/.test(pam.body) && sentMs().length === 0, JSON.stringify(pam).slice(0, 400));
  ok('an unhappy customer gets a call, not an email; nobody who lost the dog is written to', F.outreach_({ id:'grumpy', kind:'winback', preview:true }).error === 'call' && F.outreach_({ id:'dogless', kind:'winback', preview:true }).error === 'leave alone');
  const sb = F.outreach_({ id:'snowbird', kind:'winback', preview:true });
  ok('the one who left for the winter gets the spring note with her day', sb.ok && /back on your street for spring/.test(sb.subject) && /back on your street on Tuesdays/.test(sb.body), sb.body);
  const larry = F.outreach_({ id:'p6363750006', kind:'winback', sub:'elsewhere', preview:true });
  ok('a quote that went elsewhere: the note the tracker picked, the quote still stands', larry.ok && /how is the yard going/.test(larry.subject) && /\$85\/mo for weekly still stands/.test(larry.body), larry.body);
  ok('an unknown reason is refused', F.outreach_({ id:'p6363750006', kind:'winback', sub:'nonsense', preview:true }).ok === false);
  const sent = F.outreach_({ id:'p6363750040', kind:'winback', sub:'price', subject:'Pam, come back', text:'Hi Pam,\n\nMy own words.' });
  const got = sentMs().slice(-1)[0];
  ok('the send uses the office\'s edited words, adds the signature, and stamps her row', sent.ok && got.subject === 'Pam, come back' && /^Hi Pam,\n\nMy own words\.\n\n— Corey/.test(got.body) && sheets.leads.rows.some(r => r[HEADERS.indexOf('id')] === 'p6363750040' && r[HEADERS.indexOf('crmnotes')].indexOf('[OU:winback-price@' + today + ']') >= 0), JSON.stringify(got).slice(0, 300));
  ok('the spring round is off until switched on', F.springRestart().off === true);
  ok('someone billed elsewhere is never counted out for having no Sweep&Go money', new Function(gs + '\nreturn sgOutOfCount_;')()('[SS:none] [BE:qbo] ', 'Anyone', {}) === false && new Function(gs + '\nreturn sgOutOfCount_;')()('[SS:none] ', 'Anyone', {}) === true);
  // the collections ladder
  ok('the ladder: a week overdue is notice 1, three weeks notice 2, five weeks notice 3', F.ladderStep_(d(10)) === 1 && F.ladderStep_(d(25)) === 2 && F.ladderStep_(d(40)) === 3);
  const lou = F.payRemind_({ id:'latelou', amount: 80, since: d(40), preview: true });
  ok('Lou, five weeks behind, gets notice 3: service pauses a week from today unless the account is brought up to date', lou.ok && lou.step === 3 && /Your service pauses .* unless the account is brought up to date/.test(lou.subject) && /This is our third note about the balance on your account, \$90\.00\. .*service will pause on/.test(lou.body) && lou.lateFees === 10 && /Late fee: \$10\.00 \(\$10 for each month past due\)/.test(lou.body) && /Invoices open: \$80\.00\n  Late fees: \$10\.00\n  Total due: \$90\.00/.test(lou.body) && /Terms of Service/.test(lou.body), lou.subject + ' | ' + lou.body.slice(0, 300));
  const nell = F.payRemind_({ id:'newnell', amount: 100, since: d(65), preview: true });
  ok('a customer on the new terms pays 10% of the invoice for each month past due, not compounded: two months on $100 is $20', nell.lateFees === 20 && /Late fee: \$20\.00 \(10% of the invoice for each month past due, 2 months\)/.test(nell.body) && /Total due: \$120\.00/.test(nell.body), nell.body.slice(0, 700));
  const mo = F.payRemind_({ id:'midmo', amount: 80, since: d(25), preview: true });
  ok('Mo, three weeks behind, gets notice 2, the firmer one; every statement carries the account page link', mo.step === 2 && /Second notice/.test(mo.subject) && /This is our second note/.test(mo.body) && /Your account page, with every visit, photo and invoice: https:\/\/clpropetservices\.com\/account\/\?t=midmo\./.test(mo.body), mo.body.slice(0, 500));
  ok('under a month past due there is no fee', mo.lateFees === 0 && !/Late fee/.test(mo.body));
  sheets.leads.rows.push(HEADERS.map(h => ({ id:'cfg_pr2', created: new Date().toISOString(), type:'CONFIG', name:'pay_reminders', notes:'on', status:'config' })[h] || ''));
  msCalls.length = 0;
  const r1 = F.paymentReminders();
  const louRow = () => sheets.leads.rows.filter(r => r[HEADERS.indexOf('id')] === 'latelou').slice(-1)[0][HEADERS.indexOf('crmnotes')];
  ok('the Monday round climbs the ladder and stamps the notice sent', r1.sent >= 2 && /\[PL:3@/.test(louRow()) && sentMs().some(m => m.to === 'lou@gmail.com' && /service pauses/i.test(m.subject)), JSON.stringify(r1) + ' ' + louRow());
  msCalls.length = 0;
  const r2 = F.paymentReminders();
  ok('and never sends the same notice twice', !sentMs().some(m => m.to === 'lou@gmail.com' || m.to === 'mo@gmail.com'), JSON.stringify(r2));
  // the customer page
  const tok = F.acctToken_('latelou');
  const acct = F.account_(tok);
  ok('the customer page answers only to the signed link: name, status, balance, invoices, the referral link', acct.ok && acct.first === 'Late' && acct.status === 'active' && acct.openTotal === 80 && acct.open[0].number === 'L-1' && /\?ref=late-/.test(acct.refLink) && !!props.ACCOUNT_SECRET, JSON.stringify(acct).slice(0, 400));
  ok('a link with the signature changed, or another customer\'s id on it, finds nothing', F.account_(tok.slice(0, -1) + (tok.slice(-1) === 'a' ? 'b' : 'a')).ok === false && F.account_('midmo.' + tok.split('.')[1]).ok === false && F.account_('').ok === false);
  ok('a quote that never became a customer has no page', F.account_(F.acctToken_('q_old')).ok === false);
  const viaGet = JSON.parse(F.doGet({ parameter: { action:'account', t: tok } })._t);
  ok('the page reaches it through the public address', viaGet.ok && viaGet.first === 'Late');
  // referral links
  const pv = F.refInvite_({ preview: true });
  ok('the referral links: a preview counts who gets one and shows the email with their own link and their account page', pv.ok && pv.count >= 2 && /your own referral link/.test(pv.subject) && /https:\/\/clpropetservices\.com\/\?ref=/.test(pv.body) && /account\/\?t=/.test(pv.body), JSON.stringify(pv).slice(0, 300));
  msCalls.length = 0;
  const rs = F.refInvite_({});
  ok('sending stamps each one, so the next tap skips them', rs.ok && rs.sent === pv.count && sentMs().length === pv.count && F.refInvite_({ preview: true }).count === 0, JSON.stringify(rs));
}
/* ---- prepay, the Monday owner email, and team logins ---- */
{
  const R = (o) => HEADERS.map(h => o[h] == null ? '' : o[h]);
  const today = new Date().toISOString().slice(0, 10), ahead = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  const rows = seed();
  rows.push(R({ id:'goodgreg', created:'2025-01-01T12:00:00Z', type:'SAVED', name:'Good Greg', phone:'6363750071', email:'greg@gmail.com', zip:'63376', price:'$80/mo', status:'closed', crmnotes:'[CD:2025-01-01] [SGID:cl_GREG] [DAY:tue] gate 1234' }));
  rows.push(R({ id:'prepam', created:'2025-01-01T12:00:00Z', type:'SAVED', name:'Prepaid Patty', phone:'6363750072', email:'patty@gmail.com', zip:'63376', price:'$100/mo', status:'closed', crmnotes:'[CD:2025-01-01] [PP:6@' + d(160) + '~' + ahead(20) + '@570.00] ' }));
  rows.push(R({ id:'owingowen', created:'2025-01-01T12:00:00Z', type:'SAVED', name:'Owing Owen', phone:'6363750073', email:'owen@gmail.com', zip:'63376', price:'$80/mo', status:'closed', crmnotes:'[CD:2025-01-01] ' }));
  const { F, sheets, props } = build(rows);
  F.sgSync(false); F.sgBillingSync();
  const B = (o) => ['kind','number','date','client','type','status','total','paid','remaining','interval','period_start','pay_type','description','period_end','next_try'].map(h => o[h] == null ? '' : o[h]);
  sheets.billing.rows.push(B({ kind:'invoice', number:'O-1', date: d(40), client:'Owing Owen', type:'subscription', status:'overdue', total:'80.00', paid:'0.00', remaining:'80.00', interval:'monthly' }));
  sheets.billing.rows.push(B({ kind:'invoice', number:'P-1', date: d(40), client:'Prepaid Patty', type:'subscription', status:'overdue', total:'100.00', paid:'0.00', remaining:'100.00', interval:'monthly' }));
  Object.assign(props, MS); msCalls.length = 0;
  // ---- prepay ----
  const greg = F.outreach_({ id:'goodgreg', kind:'prepay', preview:true });
  ok('prepay: the offer lists 3, 6 and 12 months at their own price, with the saving', greg.ok && /3 months: \$232\.80 \(save \$7\.20, 3% off\)/.test(greg.body) && /6 months: \$456\.00 \(save \$24\.00, 5% off\)/.test(greg.body) && /12 months: \$864\.00 \(save \$96\.00, 10% off\)/.test(greg.body) && /price is locked/.test(greg.body), JSON.stringify(greg));
  ok('somebody already prepaid is not offered it again', F.outreach_({ id:'prepam', kind:'prepay', preview:true }).error === 'already prepaid', JSON.stringify(F.outreach_({ id:'prepam', kind:'prepay', preview:true })));
  ok('a prepaid customer gets no statement while it runs, with the reason', /^prepaid through /.test(F.payRemind_({ id:'prepam', amount: 100, since: d(40), preview:true }).error || ''));
  const pv = F.prepayInvite_({ preview: true });
  ok('the pay-ahead round goes to good payers only: Greg yes; Patty (prepaid) and Owen (owes) no', pv.ok && pv.count >= 1 && pv.first && !/Patty|Owen/.test(pv.first), JSON.stringify(pv).slice(0, 200));
  msCalls.length = 0;
  const ps = F.prepayInvite_({});
  ok('sending it stamps them so they wait four months', ps.sent === pv.count && F.prepayInvite_({ preview: true }).count === 0);
  ok('the renewal note is off until switched on', F.prepayRenewals().off === true);
  sheets.leads.rows.push(HEADERS.map(h => ({ id:'cfg_ppr', created: new Date().toISOString(), type:'CONFIG', name:'prepay_renewals', notes:'on', status:'config' })[h] || ''));
  msCalls.length = 0; const ren = F.prepayRenewals();
  ok('switched on: Patty, 20 days from the end, gets the renewal offer, once', ren.sent === 1 && sentMs()[0].to === 'patty@gmail.com' && /your prepaid yard service ends/.test(sentMs()[0].subject) && F.prepayRenewals().sent === 0, JSON.stringify(ren));
  const pm = F.priceMove_({ items: [{ id:'prepam', oldPrice: 100, newPrice: 110 }], date: ahead(10) });
  ok('a price move leaves a prepaid customer alone until the stretch ends', pm.failed.length === 1 && /prepaid, price locked through/.test(pm.failed[0].error), JSON.stringify(pm));
  const acc = F.account_(F.acctToken_('goodgreg')), accP = F.account_(F.acctToken_('prepam'));
  ok('the customer page offers the three amounts, or says prepaid through', acc.prepay && acc.prepay.length === 3 && acc.prepay[2].total === 864 && accP.prepaid && accP.prepaid.to === ahead(20) && !accP.prepay);
  // ---- the Monday owner email ----
  const txt = F.ownerReportText_();
  ok('the owner email: money, customers, work and a to-do list, with the late fees and prepaid money', /MONEY/.test(txt) && /CUSTOMERS/.test(txt) && /WORK/.test(txt) && /THIS WEEK/.test(txt) && /Late fees on it: \$\d+/.test(txt) && /Prepaid: 1 customer, \$570 collected ahead/.test(txt) && /notice 3 not sent yet: .*Owing Owen/.test(txt) && /Prepaid stretch ending within a month: Prepaid Patty/.test(txt) && /Emails the office sent: .*prepay note/.test(txt), txt);
  ok('it is off until switched on', F.ownerReport().off === true);
  sheets.leads.rows.push(HEADERS.map(h => ({ id:'cfg_or', created: new Date().toISOString(), type:'CONFIG', name:'owner_report', notes:'on', status:'config' })[h] || ''));
  sheets.leads.rows.push(HEADERS.map(h => ({ id:'cfg_oe', created: new Date().toISOString(), type:'CONFIG', name:'owner_email', notes:'corey@example.com', status:'config' })[h] || ''));
  msCalls.length = 0; const orr = F.ownerReport();
  ok('switched on, it goes to the address set in the tracker', orr.ok && orr.to === 'corey@example.com' && sentMs()[0].to === 'corey@example.com' && /CLPPS last week/.test(sentMs()[0].subject));
  // ---- team logins ----
  props.TRACKER_KEY = 'owner-secret-123';
  const P = (body) => { const s = JSON.stringify(body); return JSON.parse(F.doPost({ postData: { contents: s, length: s.length }, parameter: {} })._t); };
  ok('the original password is the owner', F.who_('owner-secret-123').role === 'owner' && F.who_('nope') === null && F.who_('') === null);
  const addT = P({ action:'users', key:'owner-secret-123', op:'add', name:'Mike', role:'tech' }), addO = P({ action:'users', key:'owner-secret-123', op:'add', name:'Olivia', role:'office' });
  ok('the owner adds people: each gets a password once, and only a hash is kept', addT.ok && addT.password.length >= 10 && addO.ok && !JSON.stringify(props.USERS).includes(addT.password) && addO.users.length === 2, JSON.stringify(addT));
  ok('the same name twice is refused', P({ action:'users', key:'owner-secret-123', op:'add', name:'mike', role:'office' }).ok === false);
  ok('nobody but the owner can manage the team', P({ action:'users', key: addO.password, op:'list' }).ok === false && P({ action:'users', key: addT.password, op:'list' }).ok === false);
  ok('each password is its person and role', F.who_(addT.password).name === 'Mike' && F.who_(addT.password).role === 'tech' && F.who_(addO.password).role === 'office');
  ok('the office can do the day\'s work but not settings or the accountant\'s file', !!F.can_(addO.password, 'billing') && !!F.can_(addO.password, 'payremind') && !F.can_(addO.password, 'billingcsv') && !F.can_(addO.password, 'pricemove') && P({ action:'lead', key: addO.password, lead: { id:'cfgx', type:'CONFIG', name:'fu_emails', notes:'on' } }).ok === false);
  ok('a tech can only read the route and check in', !!F.can_(addT.password, 'list') && !!F.can_(addT.password, 'checkin') && !F.can_(addT.password, 'billing') && !F.can_(addT.password, 'update') && !F.can_(addT.password, 'payremind') && P({ action:'update', key: addT.password, id:'goodgreg', status:'cancelled' }).ok === false);
  const techList = JSON.parse(F.list_({ key: addT.password })._t);
  const tg = techList.leads.find(l => l.id === 'goodgreg');
  ok('the tech\'s list is cut down in the script: customers on the route only, no emails or prices, office markers gone, gate code kept', techList.ok && techList.me.role === 'tech' && techList.me.name === 'Mike' && tg && !tg.email && !tg.price && /\[DAY:tue\]/.test(tg.crmnotes) && /gate 1234/.test(tg.crmnotes) && !/\[(PP|PR|PL|OU|EM|QA|FU):/.test(techList.leads.map(l => l.crmnotes || '').join(' ')) && !techList.leads.some(l => /^(new|called|lost|cancelled)$/.test(l.status) || l.id === 'q_old') && techList.leads.every(l => l.type !== 'CONFIG' || /^(route_base|deo_season)$/.test(l.name)), JSON.stringify(techList.leads.slice(0, 3)));
  ok('the owner\'s list says who is signed in, everything included', JSON.parse(F.list_({ key: 'owner-secret-123' })._t).me.role === 'owner' && JSON.parse(F.list_({ key: 'owner-secret-123' })._t).leads.some(l => l.id === 'q_old'));
  const up = P({ action:'update', key: addO.password, id:'goodgreg', notes:'[CD:2025-01-01] [SGID:cl_GREG] [DAY:tue] [BY:Somebody~2020-01-01] gate 1234' });
  const gregNotes = sheets.leads.rows.filter(r => r[HEADERS.indexOf('id')] === 'goodgreg').slice(-1)[0][HEADERS.indexOf('crmnotes')];
  ok('an office change is signed by the script with the real name, whatever the phone says', up.ok && gregNotes.indexOf('[BY:Olivia~' + today + ']') >= 0 && gregNotes.indexOf('Somebody') < 0, gregNotes);
  ok('a tech\'s start and end of day are logged with what they ticked', P({ action:'checkin', key: addT.password, kind:'start', items:['Truck fueled and checked', 'Phone charged'], note:'running 10 min late' }).ok);
  const act = P({ action:'activity', key:'owner-secret-123' });
  ok('the activity log: newest first, who, what and on which card', act.ok && act.rows[0].who === 'Mike' && act.rows[0].action === 'check-start' && /Truck fueled.*Phone charged \| running 10 min late/.test(act.rows[0].detail) && act.rows.some(r => r.who === 'Olivia' && r.action === 'update' && r.id === 'goodgreg') && act.rows.some(r => r.action === 'user-add'), JSON.stringify(act.rows.slice(0, 4)));
  ok('only the owner reads the log', P({ action:'activity', key: addO.password }).ok === false);
  const mikeId = addT.id;
  P({ action:'users', key:'owner-secret-123', op:'off', id: mikeId });
  ok('turning a login off locks it out at once', F.who_(addT.password) === null && JSON.parse(F.list_({ key: addT.password })._t).ok === false);
  const rs = P({ action:'users', key:'owner-secret-123', op:'reset', id: mikeId });
  ok('a new password works, the old one does not', rs.ok && F.who_(rs.password).name === 'Mike' && F.who_(addT.password) === null);
  P({ action:'users', key:'owner-secret-123', op:'role', id: mikeId, role:'office' });
  ok('a role can change', F.who_(rs.password).role === 'office');
}
done();
