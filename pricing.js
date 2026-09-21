/* ============================================================
   CLPPS PRICING — single source of truth.
   Loaded by the public quote wizard (index.html) and the staff
   phone-quote page (hq-8k3v51/quote/). Change numbers HERE only.

   Recurring:   weekly = base[dogs] × ZIP multiplier
                every other week = that customer's weekly price + $10
                  (fewer visits, but each one is a bigger job — and it
                   keeps weekly the obvious buy)
                twice a week = the weekly price × 1.80 (double, less 10%)
                all rounded to the nearest whole dollar, and no recurring
                plan is ever quoted below the monthly minimum
   Initial clean: $40 on a recurring customer's first invoice, currently
                WAIVED as a promotion - see waiveInitialClean below.
   One-time:    $75 for the first 30 minutes, +$20 per extra 15 minutes.
                ZIP multiplier NOT applied.
   Unlisted ZIP (inside the service area): priced as Value

   Monthly (one visit a month) was RETIRED on 8 Sep 2026 and is no longer
   sold. clppsQuote() returns a manual quote for it so an old link or an
   old record can never silently price itself.
   ============================================================ */

var CLPPS_PRICING = {
  base: { 1: 85, 2: 91, 3: 97, 4: 103 },     // weekly, $/month, Standard tier
  tiers: { Value: 0.90, Core: 0.95, Standard: 1.00, Premium: 1.10 },
  eowPremium: 10,            // every other week = that customer's weekly price + $10
  twiceWeeklyFactor: 1.80,   // weekly x2, less the 10% multi-visit discount
  minRecurring: 72,     // the cheapest price anywhere; nothing should reach it now, but it holds the line
  roundTwiceWeekly: true,    // false = keep the exact cents (e.g. $163.80)
  onetime: 75,          // first 30 minutes, any dog count, no ZIP multiplier
  onetimeMinutes: 30,   // what the $75 covers
  onetimeBlock: 15,     // each additional block, in minutes
  onetimeBlockPrice: 20,
  initialClean: 40,     // one-time, first invoice, recurring customers only
  /* PROMOTION: the initial clean fee is waived for new recurring customers.
     Set waiveInitialClean to false to end it and the $40 comes straight back
     everywhere - the wizard, the phone quote and the emailed quote. Leads
     taken while it is on are stamped [IC:w], so the revenue figures already
     know not to count a fee that was never charged. waiveInitialFrom is the
     day it started, used to compare sign-ups before and after. */
  waiveInitialClean: true,
  waiveInitialFrom: '2026-09-09',
  deodorize: 15,        // per treatment
  maxDogs: 4,           // 5+ is a custom quote
  zips: {
    '63376':'Standard','63301':'Standard','63303':'Standard','63304':'Premium',
    '63366':'Standard','63368':'Standard','63385':'Premium','63367':'Premium',
    '63017':'Premium','63011':'Standard','63021':'Standard','63031':'Value',
    '63033':'Value','63034':'Standard','62025':'Premium','62026':'Standard',
    '62034':'Standard','62062':'Standard','62294':'Premium','62234':'Core',
    '62002':'Value','62010':'Core','62040':'Value','62035':'Premium',
    '62095':'Core','62249':'Premium','63090':'Standard','63084':'Standard',
    '63069':'Standard','63010':'Core','63028':'Standard','63383':'Standard',
    /* 63304, 63385 and 63379 are Premium despite mid-range incomes
       ($114k, $112k, $91k). That is deliberate and Corey confirmed it:
       they are the furthest-out territory we run, so Premium there is
       paying for the drive, not the postcode. Do not "correct" them to
       match income - the tier carries two things, not one. */
    '63379':'Premium','62220':'Core','62269':'Standard','62236':'Premium',
    // Wildwood: 63038 and 63040 are Wildwood only; 63005 is shared with
    // Chesterfield, which is already Premium on 63017.
    '63038':'Premium','63040':'Premium','63005':'Premium',
    /* ---- West and central St. Louis County ----
       Set against median household income (ACS), calibrated to the line
       Corey's own picks already drew: 63017 Chesterfield is Premium at
       $127k, 63011 Ballwin is Standard at $124k. So Premium starts around
       $125k. Income is in the comment so the next person can check the
       reasoning instead of guessing at it. */
    '63141':'Premium',   // Creve Coeur          $133,851
    '63146':'Standard',  // Creve Coeur, west    $84,756 - NOT the same place
                         //                      as 63141; briefly Premium by
                         //                      mistake, it is the poorer half
    '63131':'Premium',   // Des Peres/Frontenac  $225,493 - richest in county
    '63124':'Premium',   // Ladue                $193,942
    '63122':'Premium',   // Kirkwood             $136,385
    '63127':'Premium',   // Sunset Hills         $122,663 - just under the line
                         //                      on income; Corey's call to
                         //                      price it up anyway

    /* ---- Filled in Sep 2026 against median household income ----
       These were all quoting Value simply because nobody had listed them,
       not because anyone decided they were cheap. Income beside each. */
    '63105':'Standard',  // Clayton              $116,439
    '63119':'Standard',  // Webster Groves       $106,183
    '63144':'Standard',  // Brentwood            $104,438
    '63126':'Standard',  // Crestwood            $98,852
    '63026':'Standard',  // Fenton               $97,553
    '63129':'Standard',  // Oakville             $94,888
    '63128':'Standard',  // South County         $92,359
    '63049':'Standard',  // High Ridge           $92,333
    '63043':'Standard',  // Maryland Heights     $91,509
    '63117':'Standard',  // Richmond Heights     $90,921
    '63132':'Standard',  // Olivette             $87,385
    '63130':'Standard'   // University City      $85,823
  },
  // Metro ZIP prefixes we run routes in. Anything outside is "no route yet".
  areaPrefixes: ['630','631','633','620','622']
};

/* An unlisted ZIP inside the service area prices as Value. That is a
   deliberate floor, NOT a judgement that the area is cheap - Ladue and
   Des Peres both sat there for months purely because nobody had typed
   them in. If a ZIP starts showing up in the leads and is not on the
   list above, check what it should be rather than assuming Value was
   chosen on purpose. */
function clppsZipTier(zip){
  var z = String(zip || '').trim();
  return CLPPS_PRICING.zips[z] || 'Value';
}
function clppsInArea(zip){
  var z = String(zip || '').trim();
  return /^\d{5}$/.test(z) && CLPPS_PRICING.areaPrefixes.indexOf(z.substring(0, 3)) >= 0;
}
function clppsRound(v){ return Math.round(v + 1e-9); }

/* One-time labour price for a given number of minutes on site. */
function clppsOnetime(minutes){
  var P = CLPPS_PRICING;
  var m = parseInt(minutes, 10);
  if (!m || m < P.onetimeMinutes) m = P.onetimeMinutes;
  var extra = Math.ceil((m - P.onetimeMinutes) / P.onetimeBlock);
  return { minutes: m, blocks: extra, price: P.onetime + extra * P.onetimeBlockPrice };
}

/* opts: { zip, dogs (1-4, or 5 = custom), freq: 'twiceweekly'|'weekly'|'biweekly'|'onetime',
           deo: 'none'|'every'|'eo', waiveInitial: bool, minutes: one-time job length }
   Returns the full breakdown, or { manual:true, reason } for custom quotes. */
function clppsQuote(opts){
  var P = CLPPS_PRICING;
  var dogs = parseInt(opts.dogs, 10) || 1;
  var freq = opts.freq || 'weekly';
  var deo  = opts.deo || 'none';
  var tier = clppsZipTier(opts.zip);
  var mult = P.tiers[tier];

  if (freq === 'onetime'){
    var job = clppsOnetime(opts.minutes);
    var deoOnce = deo !== 'none' ? P.deodorize : 0;
    var ot = job.price + deoOnce;
    return { manual:false, freq:freq, tier:tier, mult:1, dogs:dogs,
             base:P.onetime, service:job.price, minutes:job.minutes, blocks:job.blocks,
             deoAmt:deoOnce, deoMo:deoOnce, treatments: deoOnce ? 1 : 0,
             total:ot, per:'', first:ot, initial:0,
             agree:'$' + ot + ' one-time cleanup' +
               (job.blocks ? ' (' + job.minutes + " minutes: $" + P.onetime + ' for the first ' + P.onetimeMinutes +
                             ' plus ' + job.blocks + ' \u00d7 $' + P.onetimeBlockPrice + ')'
                           : ' (up to ' + P.onetimeMinutes + ' minutes on site)') +
               (deoOnce ? ' (includes $15 deodorize & sanitize)' : '') };
  }
  if (dogs > P.maxDogs){
    return { manual:true, reason:'5+ dogs', tier:tier, mult:mult, dogs:dogs, freq:freq };
  }
  if (freq === 'monthly'){
    // Retired plan. Never guess a number for it.
    return { manual:true, reason:'monthly plan retired', tier:tier, mult:mult, dogs:dogs, freq:freq };
  }
  var base = P.base[dogs], service, visits;
  var weekly = clppsRound(base * mult);     // every plan is priced off the weekly number
  if (freq === 'twiceweekly'){
    var tw = weekly * P.twiceWeeklyFactor;  // double it, less the 10% discount
    service = P.roundTwiceWeekly ? clppsRound(tw) : Math.round(tw * 100) / 100;
    visits = 8;
  } else if (freq === 'biweekly'){
    service = weekly + P.eowPremium;
    visits = 2;
  } else {
    service = weekly;
    visits = 4;
  }
  // Floor applies to every recurring plan, not just one dog: flooring only the
  // single-dog price would leave two dogs cheaper than one.
  if (P.minRecurring && service < P.minRecurring) service = P.minRecurring;
  var treatments = deo === 'every' ? visits : (deo === 'eo' ? Math.round(visits / 2) : 0);
  var deoMo = treatments * P.deodorize;
  var total = service + deoMo;
  var initial = (opts.waiveInitial || P.waiveInitialClean) ? 0 : P.initialClean;
  var first = total + initial;
  var agree = '$' + total + '/mo' +
    (deoMo ? ' (includes ' + treatments + ' deodorize treatments at $15 each)' : '') +
    (initial ? ', with a first invoice of $' + first + ' including the one-time $' + initial + ' initial clean'
             : ', with the $' + P.initialClean + ' initial clean fee waived');
  return { manual:false, freq:freq, tier:tier, mult:mult, dogs:dogs,
           base:base, service:service, visits:visits, treatments:treatments, deoMo:deoMo,
           total:total, per:'/mo', initial:initial, first:first, agree:agree };
}
