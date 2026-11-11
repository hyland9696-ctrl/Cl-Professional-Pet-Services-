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
    sub({ client_name:'New Nancy', client_email:'nancy@gmail.com', price:75, number_of_dogs:'1', service_plan:'1d-bW', frequency:'bi_weekly', start_date:'2026-10-20' }),
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
function fakeFetch(url, opts){
  calls.push(url);
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
  const props = { SHEET_ID:'x', SG_TOKEN:'tok-123', SG_HOOK:'word' };
  const G = {
    UrlFetchApp: { fetch: fakeFetch },
    SpreadsheetApp: { openById: () => ss, create: () => ss },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
    Logger: { log: () => {} }, ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ create: () => {} }) }) }) }) },
    MailApp: { sendEmail: () => {}, getRemainingDailyQuota: () => 100 }, Utilities: { getUuid: () => 'u' },
  };
  const F = new Function(...Object.keys(G), gs + '\nreturn { sgSync, sgHook_, sgBilling_, sgJobs_, setupSweepAndGo };')(...Object.values(G));
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
  ok('New Nancy is added: every other week, Monday, created on her start date, opted out of marketing', nancy && nancy.status === 'closed' && nancy.service === 'every other week' && nancy.price === '$75/mo' && /\[DAY:mon\]/.test(nancy.crmnotes) && /\[NOEM:1\]/.test(nancy.crmnotes) && nancy.created.indexOf('2026-10-20') === 0 && /\[CD:2026-10-20\]/.test(nancy.crmnotes) && nancy.type === 'SAVED', nancy && JSON.stringify(nancy));
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
done();
