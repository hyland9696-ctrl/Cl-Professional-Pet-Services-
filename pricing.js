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
  /* Deodorize & sanitize is a warm-weather service: once it drops below
     about 50F people shut off their outdoor taps and it stops. That is a
     weather call, not a date, so the switch lives in the lead tracker
     (Deodorize season: ON/OFF) and the website reads it. This is only the
     answer when the website cannot reach the tracker's backend. */
  deoSeasonDefault: 'off',
  maxDogs: 4,           // 5+ is a custom quote
  zips: {
    '63376':'Standard','63301':'Standard','63303':'Standard','63304':'Premium',
    '63366':'Standard','63368':'Standard','63385':'Premium','63367':'Premium',
    '63017':'Premium','63011':'Standard','63021':'Standard','63031':'Value',
    '63033':'Value','63034':'Standard','62025':'Premium','62026':'Standard',
    '62034':'Standard','62062':'Standard','62294':'Premium','62234':'Core',
    '62002':'Value','62010':'Core','62040':'Value','62035':'Premium',
    '62095':'Core','62249':'Premium','63010':'Core','63028':'Standard','63383':'Standard',
    /* 63090 Washington, 63084 Union and 63069 Pacific were Standard. Jesse
       asked for the whole of Franklin County at Value, and these three are
       the only Franklin ZIPs that were not - the county's three towns, sat
       at Standard while every field around them was Value. The income
       figures agree with him: all three come in under the cheapest ZIP on
       our Standard list. Changing the tier only moves what NEW quotes say;
       anyone already on the books keeps the price they signed at. To put
       them back, change these three to 'Standard' - nothing else depends
       on it. */
    '63090':'Value','63084':'Value','63069':'Value',
    /* 63304 and 63385 are Premium despite mid-range incomes ($114k,
       $112k). That is deliberate and Corey confirmed it: they are far-out
       territory, so Premium there is paying for the drive, not the
       postcode. 63379 Troy sat with them until Oct 2026, when Jesse asked
       for Lincoln County to follow the income data instead: Troy is
       $86,844, Standard. To put the drive premium back, make it 'Premium'. */
    '63379':'Standard','62220':'Core','62269':'Standard','62236':'Premium',
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
    '63130':'Standard',  // University City      $85,823

    /* ---- Franklin County ----
       Rural, long drives, low density. Value across the board, decided
       deliberately rather than by falling through the default.
       NOT 63005: the Post Office counts it as Franklin because it crosses
       the county line, but it is Chesterfield/Wildwood at $198,469 and
       stays Premium. Do not sweep it in with the rest of the county. */
    '63013':'Value','63014':'Value','63015':'Value','63037':'Value',
    '63039':'Value','63041':'Value','63055':'Value','63056':'Value',
    '63060':'Value','63061':'Value','63068':'Value','63072':'Value',
    '63073':'Value','63077':'Value','63079':'Value','63080':'Value',
    '63089':'Value','63091':'Value',

    /* ---- Filled in Oct 2026: every county we now get leads from ----
       Jesse: "make sure that we have all the zip codes and that they're
       all in the correct tiers by what that kind of area makes." Set
       against median household income (ACS, via zip-codes.com, Data
       Commons, incomebyzipcode.com) on the same line Corey's own picks
       drew: Premium from about $125k, Standard from about $85k, Core
       from about $65k, Value below. Two adjustments, both already in
       use above: the furthest-out St. Charles towns are Premium for the
       drive (as 63385 Wentzville-west and 63348 Foristell are), and
       sparse rural ZIPs with long drives and few houses sit one tier
       down (as Franklin does). Lincoln County is on the data alone.
       Income beside each where a figure was found; "est." where none
       was and the tier is a judgement from the neighbours. Anything
       already listed above was left exactly as decided. */

    // Jefferson County - the I-55 and Highway 30 corridors by income
    '63012':'Standard',  // Barnhart             $96,099
    '63052':'Standard',  // Imperial             $92,922
    '63019':'Core',      // Crystal City         $72,569
    '63048':'Core',      // Herculaneum          est. ~$70k
    '63070':'Core',      // Pevely               $65,211
    '63051':'Core',      // House Springs        $79,940
    '63053':'Core',      // Kimmswick            est., next to Imperial
    '63057':'Core',      // Liguori              est., next to Barnhart
    '63050':'Core',      // Hillsboro            $87,371 but sparse, far
    '63016':'Core',      // Cedar Hill           $86,359 but sparse, far
    '63020':'Value',     // De Soto              $70,824, far south
    '63023':'Value',     // Dittmer              rural
    '63066':'Value',     // Morse Mill           rural
    '63065':'Value',     // Mapaville            rural
    '63087':'Value',     // Valles Mines         rural

    // St. Louis County - the rest of it
    '63025':'Standard',  // Eureka               est. ~$110k
    '63088':'Core',      // Valley Park          est. ~$80k
    '63123':'Core',      // Affton               $77,055
    '63044':'Core',      // Bridgeton            $77,819
    '63143':'Core',      // Maplewood            est. ~$65k
    '63125':'Value',     // Lemay                $61,624
    '63114':'Value',     // Overland             $55,870
    '63042':'Value',     // Hazelwood            $49,453
    '63074':'Value',     // St. Ann              $51,610
    '63135':'Value',     // Ferguson             $55,179
    '63134':'Value',     // Berkeley             est.
    '63121':'Value',     // Normandy             est.
    '63133':'Value',     // Wellston             est.
    '63136':'Value',     // Jennings / north     est.
    '63137':'Value',     // Moline Acres         est.
    '63138':'Value',     // Spanish Lake         est.
    '63140':'Value',     // Riverview            est.
    '63045':'Value',     // Earth City           industrial

    // St. Louis City - the neighbourhoods with yards
    '63139':'Core',      // St. Louis Hills      est. ~$70k
    '63109':'Core',      // Lindenwood/Princeton Hts  $64,741
    '63110':'Core',      // The Hill / Shaw      $62,732
    '63104':'Core',      // Soulard / Lafayette Sq  $65,011
    '63108':'Core',      // Central West End     $51,092 but house values high
    '63116':'Value',     // Tower Grove South    $53,003
    '63118':'Value',     // Benton Park / Cherokee  $46,537
    '63111':'Value',     // Carondelet           $32,283
    '63112':'Value',     // West End             $41,806
    '63101':'Value','63102':'Value','63103':'Value',   // downtown, no yards
    '63106':'Value','63107':'Value','63113':'Value',   // north city
    '63115':'Value','63120':'Value','63147':'Value',

    // St. Charles County - the far west and the river bottoms
    '63348':'Premium',   // Foristell            $115,661, past Wentzville: the drive
    '63365':'Premium',   // New Melle            est. ~$120k, far out
    '63332':'Premium',   // Augusta              $146,146
    '63341':'Premium',   // Defiance             $170,598
    '63373':'Value',     // Portage des Sioux    rural, floodplain
    '63386':'Value',     // West Alton           rural, floodplain

    // Lincoln County - on the income data, as Jesse asked (Oct 2026):
    // the Highway 61 towns are Standard, the rural rest Core
    '63362':'Standard',  // Moscow Mills         $85,300
    '63389':'Standard',  // Winfield             $92,646
    '63369':'Standard',  // Old Monroe           est., between the two
    '63343':'Core',      // Elsberry             $71,523
    '63347':'Core',      // Foley                rural, est. ~$70k
    '63349':'Core',      // Hawk Point           rural, est. ~$70k
    '63377':'Core',      // Silex                rural, est. ~$70k

    // Warren County
    '63390':'Standard',  // Wright City          $80,152
    '63381':'Standard',  // Truesdale            est., next to Warrenton
    '63357':'Value',     // Marthasville         rural, far

    /* ---- Illinois, Oct 2026: priced off the table now ----
       Enough Illinois leads were landing in "we'll email you a price"
       that the hand-quote queue became the bottleneck. The 15 ZIPs above
       (Alton, Edwardsville, Granite City, Collinsville, Belleville ...)
       keep the tiers they were given; these fill in the rest of Madison,
       St. Clair and Monroe counties. To go back to hand-pricing the whole
       state, put '620','622' back in manualPrefixes below. */

    // Madison County
    '62281':'Premium',   // St. Jacob            $132,000
    '62097':'Standard',  // Worden               $91,011
    '62067':'Core',      // Moro                 $72,431
    '62001':'Core',      // Alhambra             est. ~$75k
    '62061':'Core',      // Marine               est. ~$80k
    '62046':'Core',      // Hamel                est. ~$80k
    '62021':'Core',      // Dorsey               rural
    '62024':'Value',     // East Alton           $56,761
    '62018':'Value',     // Cottage Hills        $40,438
    '62048':'Value',     // Hartford             est. ~$45k
    '62084':'Value',     // Roxana               est. ~$55k
    '62087':'Value',     // South Roxana         est.
    '62060':'Value',     // Madison              est.
    '62090':'Value',     // Venice               est.
    '62058':'Value',     // Livingston           rural
    '62074':'Value',     // New Douglas          rural

    // St. Clair County
    '62243':'Standard',  // Freeburg             $103,342
    '62258':'Standard',  // Mascoutah            $94,655
    '62260':'Standard',  // Millstadt            $91,039
    '62285':'Standard',  // Smithton             est. ~$95k
    '62221':'Core',      // Belleville east      $82,271
    '62208':'Core',      // Fairview Heights     $80,205
    '62223':'Core',      // Belleville / Swansea $73,700
    '62226':'Core',      // Belleville west      $70,797
    '62225':'Core',      // Scott AFB            military housing
    '62254':'Core',      // Lebanon              est. ~$75k
    '62264':'Core',      // New Athens           est. ~$65k
    '62289':'Core',      // Summerfield          est.
    '62232':'Value',     // Caseyville           $64,269
    '62239':'Value',     // Dupo                 $61,191
    '62240':'Value',     // East Carondelet      est.
    '62257':'Value',     // Marissa              est. ~$55k
    '62255':'Value',     // Lenzburg             rural
    '62282':'Value',     // St. Libory           rural
    '62206':'Value',     // Cahokia              $33,838
    '62201':'Value','62203':'Value','62204':'Value','62205':'Value','62207':'Value',   // East St. Louis / Centreville

    // Monroe County
    '62298':'Standard',  // Waterloo             $101,155
    '62295':'Standard',  // Valmeyer             $87,989
    '62244':'Core',      // Fults                rural
    '62248':'Core',      // Hecker               rural
    '62256':'Core',      // Maeystown            rural
    '62279':'Core'       // Renault              rural
  },
  // Metro ZIP prefixes we run routes in. Anything outside is "no route yet".
  areaPrefixes: ['630','631','633','620','622'],
  /* ZIP prefixes that get a hand-built quote instead of a table price.
     Illinois ('620','622') lived here from Sep to Oct 2026, when the
     routes over there were thin; it came out when the hand-quote queue
     became the bottleneck. Empty means everything in the area prices off
     the table. The hand-quote path itself still works - put a prefix back
     here and those leads say "we'll email you a price" again. */
  manualPrefixes: []
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

/* Is deodorize being done right now? 'on' or 'off'. The tracker's switch,
   fetched by reviews.js and remembered for an hour, wins; otherwise the
   default above. */
function clppsDeoSeason(){
  try {
    if (typeof window !== 'undefined'){
      if (window.CLPPS_DEO_SEASON === 'on' || window.CLPPS_DEO_SEASON === 'off') return window.CLPPS_DEO_SEASON;
      var c = JSON.parse(localStorage.getItem('clpps_public') || 'null');
      if (c && (c.deo === 'on' || c.deo === 'off')) return c.deo;
    }
  } catch (e) {}
  return CLPPS_PRICING.deoSeasonDefault === 'on' ? 'on' : 'off';
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

  // Illinois before anything else: no automatic price, whatever they picked.
  var zp = String(opts.zip || '').trim().substring(0, 3);
  if (P.manualPrefixes && P.manualPrefixes.indexOf(zp) >= 0){
    return { manual:true, reason:'illinois', tier:tier, mult:mult, dogs:dogs, freq:freq };
  }
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
