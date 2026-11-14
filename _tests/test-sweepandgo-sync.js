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
  const sh = { rows, writes: 0,
    getLastRow: () => rows.length, getMaxRows: () => rows.length + 50,
    appendRow: (r) => { rows.push(r.slice()); sh.writes++; },
    getDataRange: () => ({ getValues: () => rows.map(r => r.slice()) }),
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
  ], last_page: 1 } },
  '/api/v1/clients/active': { data: [
    client({ client:'rcl_D', first_name:'Dana', last_name:'Deo', email:'dana@gmail.com', cell_phone:'(636) 375-0001', address:'1 Oak St', zip_code:'63376', service_days:'Thursday', tracking_field:'utm_source=facebook&utm_medium=paid' }),
    client({ client:'rcl_K', first_name:'Kelly', last_name:'.', email:'', cell_phone:'6363750002', address:'14 Creekside Dr', zip_code:'63376', service_days:'Tuesday', cleanup_frequency:'once_a_week' }),
    client({ client:'rcl_N', first_name:'New', last_name:'Nancy', email:'nancy@gmail.com', cell_phone:'6363750009', address:'9 New St', zip_code:'63366', service_days:'Monday', cleanup_frequency:'bi_weekly', marketing_allowed:0 }),
    client({ client:'rcl_P', first_name:'Paused', last_name:'Pat', email:'pat@gmail.com', cell_phone:'6363750004', address:'4 Elm St', zip_code:'63376', service_days:'Thursday' }),
    client({ client:'rcl_T', first_name:'Twice', last_name:'Tom', email:'tom@gmail.com', cell_phone:'6363750005', address:'5 Fir St', zip_code:'63376', service_days:'Tuesday, Friday', cleanup_frequency:'two_times_a_week' }),
    client({ client:'rcl_L', first_name:'Lost', last_name:'Larry', email:'larry@gmail.com', cell_phone:'6363750006', address:'6 Birch St', zip_code:'63376' }),   // the office marked him Not interested: left alone
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
  ], last_page: 1 } },
  '/api/v2/invoices?type=one_time': 'ERR400',
  '/api/v2/invoices?type=onetime': { invoices: { data: [ { created_at: d(5) + ' 10:00:00', invoice_number:'768-3-3', client_name:'Once Olga', status:'paid', total:'75.00', paid:'75.00', remaining:'0.00', type:'one_time' } ], last_page: 1 } },
  '/api/v2/payments': { payments: { data: [
    { date: d(10), amount: 151, amount_refunded:'0.00', status:'succeeded', type:'credit_card', description:'Payment for invoice 768-1-1', client_name:'Dana Deo', tip_amount:'5.00' },
    { date: d(9), amount: 87, amount_refunded:'0.00', status:'failed', type:'credit_card', description:'Payment for invoice 768-2-1', client_name:'Kelly .', tip_amount:'0.00' },
  ], last_page: 1 } },
  '/api/v2/report/route_planning_report': { route_reports: [ { assigned_to_name:'Jesse Duncan', date: today, duration: 240, driving_time: 60, cleanup_time: 180, distance: 61.5, number_of_jobs: 18, price: 540 } ] },
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
const pushes = [], onboardings = [];
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
  if (/ntfy\.sh\//.test(url)){ pushes.push({ url, title: opts.headers && opts.headers.Title, body: opts.payload }); return { getResponseCode: () => 200, getContentText: () => '{}' }; }
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
    row({ id:'p6363750001', created:'2026-06-01T12:00:00Z', type:'ENQUIRY', name:'Dana D', phone:'6363750001', email:'dana@gmail.com', address:'1 Oak St, St. Peters, MO 63376', zip:'63376', service:'weekly', dogs:'2', price:'$91/mo', status:'closed', crmnotes:'[FU:2026-12-01] [CD:2026-06-01] [QA:a] gate 4321', updated:'' }),
    // matched by name only (no phone or email on the old row)
    row({ id:'sgkelly', created:'2026-03-01T12:00:00Z', type:'SAVED', name:'Kelly .', phone:'', email:'', address:'14 Creekside Dr, St Peters, MO 63376', zip:'63376', service:'weekly', dogs:'3', price:'$99/mo', status:'closed', crmnotes:'[CD:2026-03-01] [QA:a] ', updated:'' }),
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
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    Logger: { log: () => {} }, ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create: () => {} }) }) }) }) },
    MailApp: { sendEmail: () => {}, getRemainingDailyQuota: () => 100 }, Utilities: { getUuid: () => 'u', formatDate: () => '202611' }, Session: { getScriptTimeZone: () => 'America/Chicago' },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (txt) => ({ _t: txt, setMimeType(){ return this; } }) },
  };
  const F = new Function(...Object.keys(G), gs + '\nreturn { sgSync, sgHook_, sgBilling_, sgJobs_, setupSweepAndGo, weeklyPush, weeklyNumbers_, sgCreate_, sgSplitAddress_, sgQuotedBase_, doPost };')(...Object.values(G));
  return { F, sheets, props };
}

/* ---- a dry run writes nothing but says everything ---- */
{
  const { F, sheets } = build(seed());
  const before = JSON.stringify(sheets.leads.rows);
  const s = F.sgSync(true);
  ok('the preview reports what it would do', s.ok && s.dry && s.clients === 8 && s.added === 4 && s.updated === 2 && s.skippedNeverStarted === 1 && s.pinned === 2 && s.leads === 1 && s.errors.length === 0, JSON.stringify(s));
  ok('and names them', s.addedNames.join() === 'New Nancy,Paused Pat,Twice Tom,Gone Gus' && s.updatedNames.join() === 'Dana Deo,Kelly .', s.addedNames.join() + ' | ' + s.updatedNames.join());
  ok('an active client with no subscription is flagged for a look, not invented', s.noSubscription.join() === 'Lost Larry', s.noSubscription.join());
  ok('nothing was written', JSON.stringify(sheets.leads.rows) === before && sheets.leads.writes === 0 && !sheets.billing && !sheets.jobs);
}

/* ---- the real thing ---- */
{
  const { F, sheets } = build(seed());
  calls.length = 0;
  const s = F.sgSync(false);
  const rows = sheets.leads.rows.slice(1).map(r => { const o = {}; HEADERS.forEach((h, i) => { o[h] = r[i]; }); return o; });
  const by = (id) => rows.filter(r => r.id === id).slice(-1)[0];
  ok('the summary matches the preview', s.ok && !s.dry && s.added === 4 && s.updated === 2 && s.errors.length === 0, JSON.stringify(s));
  const dana = by('p6363750001');
  ok('Dana, matched by phone: price from both subscriptions, dogs, status, day, source; office notes kept', dana && dana.price === '$151/mo (includes $60 deodorize)' && dana.dogs === '2' && dana.status === 'closed' && dana.service === 'weekly' && dana.deodorize === 'every visit ($15/treatment)' && /\[DAY:thu\]/.test(dana.crmnotes) && /\[SGID:rcl_D\]/.test(dana.crmnotes) && /\[SRC:Meta Ads\]/.test(dana.crmnotes) && /\[FU:2026-12-01\]/.test(dana.crmnotes) && /gate 4321$/.test(dana.crmnotes) && /\[CD:2026-06-01\]/.test(dana.crmnotes), dana && JSON.stringify([dana.price, dana.crmnotes]));
  ok('her name on the card is not overwritten by Sweep&Go\'s spelling', dana.name === 'Dana D');
  ok('and she got Sweep&Go\'s pin and minutes', /\[LL:38\.79123,-90\.60111\]/.test(dana.crmnotes) && /\[ET:12\]/.test(dana.crmnotes), dana.crmnotes);
  const kelly = by('sgkelly');
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
  // the other sheets
  ok('invoices went into the billing sheet: the bad one-time word was retried until one worked', sheets.billing && sheets.billing.rows.length === 1 + 3 + 2 && calls.some(u => /type=one_time/.test(u)) && calls.some(u => /type=onetime/.test(u)), sheets.billing && String(sheets.billing.rows.length));
  const bill = F.sgBilling_();
  ok('the billing fold reads it back: Kelly owes $87 and her card is declining, Dana tipped $5', bill.unpaid.length === 1 && bill.unpaid[0].name === 'Kelly .' && bill.unpaid[0].owed === 87 && bill.declining.length === 1 && bill.declining[0].name === 'Kelly .' && Object.values(bill.months).reduce((a, m) => a + m.tips, 0) === 5, JSON.stringify(bill));
  const jobs = F.sgJobs_();
  ok('the jobs fold reads the visits: one done in 12 minutes for 2 dogs, one skipped for the gate', jobs.visits === 1 && jobs.skipped === 1 && jobs.byDogs['2'].median === 12 && jobs.skipReasons['Gate locked'] === 1, JSON.stringify(jobs));
  ok('who was skipped, and dollars an hour by plan, dogs and weekday', jobs.skippedBy['Kelly .'] === 1 && jobs.rate.byPlan.weekly.n === 1 && jobs.rate.byPlan.weekly.perHour === 175 && jobs.rate.byDogs['2'].perHour === 175 && Object.keys(jobs.rate.byWeekday).length === 1, JSON.stringify(jobs.rate));
  /* ---- the Monday push ---- */
  const n = F.weeklyNumbers_();
  ok('last week in numbers, from the sheets: customers, comings and goings, leads, money, work', n.active === 5 && n.newCust === 1 && n.left === 0 && n.leadsIn >= 1 && n.billed === 75 && n.collected === 0 && Math.round(n.owed) === 87   /* Dana's invoice and payment are ten days old: last week holds the one-time job only */ && n.visits === 1 && n.skipped === 1, JSON.stringify(n));
  const text = F.weeklyPush();
  ok('the push went to the topic with the week on four or five lines', pushes.length === 1 && pushes[0].title === 'CLPPS last week' && /\$75 billed, \$0 collected, \$87 still owed/.test(text) && /5 active, \+1 new/.test(text) && /1 visits done, 1 skipped/.test(text), JSON.stringify(pushes) + ' ' + text);
  const cfg = (n) => rows.filter(r => r.type === 'CONFIG' && r.name === n).slice(-1)[0];
  ok('the sync wrote its own status and the route report as settings', cfg('sg_last_sync') && JSON.parse(cfg('sg_last_sync').notes).clients === 8 && cfg('sg_routes') && JSON.parse(cfg('sg_routes').notes)[today][0].mi === 61.5);
  ok('writes are batched: well under one per row touched', sheets.leads.writes <= 12, String(sheets.leads.writes));
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
  ok('with everything the form knew: name, address split up, dogs, plan, phone, how she heard, the ad, the deodorize add-on, the terms', sent && sent.first_name === 'Ann' && sent.last_name === 'Accept' && sent.home_address === '12 Elm St' && sent.city === 'St. Peters' && sent.state === 'MO' && sent.zip_code === '63376' && sent.number_of_dogs === 2 && sent.clean_up_frequency === 'once_a_week' && sent.cell_phone_number === '6363751001' && sent.how_heard_answer === 'A friend or neighbor' && /utm_campaign=fall/.test(sent.tracking_field) && /utm_source=Meta Ads/.test(sent.tracking_field) && JSON.stringify(sent.cross_sells) === '[7]' && sent.terms_open_api === 1 && sent.initial_cleanup_required === 1 && /quoted \$151\/mo/.test(sent.additional_comment) && /Gate code 1234/.test(sent.additional_comment), JSON.stringify(sent));
  const annRow = sheets.leads.rows.find(r => r[0] === 'p6363751001');
  ok('and her row is stamped signed-up, closed, with a start date', /\[SGC:\d{4}-\d{2}-\d{2}\]/.test(annRow[HEADERS.indexOf('crmnotes')]) && /\[CD:\d{4}-\d{2}-\d{2}\]/.test(annRow[HEADERS.indexOf('crmnotes')]) && annRow[HEADERS.indexOf('status')] === 'closed' && /gate 1234$/.test(annRow[HEADERS.indexOf('crmnotes')]), annRow[HEADERS.indexOf('crmnotes')]);
  ok('asking again does nothing twice', F.sgCreate_('p6363751001', false).reason === 'done' && onboardings.length === 1);
  const b = F.sgCreate_('p6363751002', false);
  ok('Bob: Sweep&Go would bill $95 against an $85 quote, so nothing is created and it says so', !b.ok && b.reason === 'price' && b.sgPrice === 95 && b.quoted === 85 && onboardings.length === 1, JSON.stringify(b));
  const b2 = F.sgCreate_('p6363751002', true);
  ok('told to go ahead anyway, he is created and the result says it was forced', b2.ok && b2.forced && onboardings.length === 2);
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
  ok('a price that does not match is never created automatically; the lead still lands for the card button', r2.ok && onboardings.length === n0 + 1 && sheets.leads.rows.some(r => r[0] === 'p6363751008' && !/\[SGC:/.test(r[HEADERS.indexOf('crmnotes')])));
  // an authorization from the emailed quote link names the lead in its zip field
  sheets.leads.rows.push(row({ id:'p6363751009', created:'2026-11-01T12:00:00Z', type:'ENQUIRY', name:'Eve Emailed', phone:'6363751009', email:'eve@gmail.com', address:'10 Oak St, St. Peters, MO 63376', zip:'63376', service:'weekly', dogs:'2', price:'$91/mo', status:'called', crmnotes:'[QA:w] ', updated:'' }));
  const r3 = post({ id:'az123', created: new Date().toISOString(), type:'AUTH', name:'Eve Emailed', zip:'p6363751009', price:'$91/mo', service:'weekly', dogs:'2', email:'eve@gmail.com' });
  ok('an authorization through the emailed quote link signs up the lead it points at', r3.ok && onboardings.length === n0 + 2 && onboardings[n0 + 1].email === 'eve@gmail.com', JSON.stringify(onboardings.slice(-1)));
  sheets.leads.rows.find(r => r[0] === 'cfg_sg_auto_create')[HEADERS.indexOf('notes')] = 'off';
  const n1 = onboardings.length;
  post({ id:'p6363751010', created: new Date().toISOString(), type:'ACTIVATE', name:'Off Otto', phone:'6363751010', email:'otto@gmail.com', address:'11 Oak St, St. Peters, MO 63376', zip:'63376', service:'weekly', dogs:'2', price:'$91/mo', crmnotes:'[QA:a] ' });
  ok('with the switch off, nothing is created without a tap', onboardings.length === n1);
}
done();
