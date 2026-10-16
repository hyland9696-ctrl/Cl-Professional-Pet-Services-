/* ============================================================
   CLPPS LEAD SOURCE — single source of truth for "where did
   this visitor come from?". Loaded by the public site
   (index.html) and by every city page via city-view.js.

   Yard signs: each city's signs carry their own QR code
   pointing at a short path (/stp, /ofa, ...). That path tags
   the visit and forwards to the city's own page, so a scan in
   St. Peters reads "Yard sign QR (St. Peters)".

   Add a city here AND create its short path folder.
   ============================================================ */

var CLPPS_SIGN_CITIES = {
  /* code  = the short path printed on the sign. Kept to three letters so the
             QR stays at 29 modules; a longer path makes the printed squares
             smaller and harder to scan from a few feet away.
     campaign = what shows up in the tracker and in any utm link.
     NOTE: a code must never match a city landing page folder (ofallon,
     wentzville, chesterfield ...) or the redirect would point at itself. */
  stp: { campaign:'stpeters',     city:'St. Peters',     covers:'St. Peters, Cottleville, Weldon Spring', page:'/st-peters/'    },
  ofa: { campaign:'ofallon',      city:"O'Fallon",       covers:"O'Fallon, Dardenne Prairie",             page:'/ofallon/'      },
  stc: { campaign:'stcharles',    city:'St. Charles',    covers:'St. Charles',                            page:'/st-charles/'   },
  wnz: { campaign:'wentzville',   city:'Wentzville',     covers:'Wentzville',                             page:'/wentzville/'   },
  lsl: { campaign:'lakestlouis',  city:'Lake St. Louis', covers:'Lake St. Louis',                          page:'/'              },
  wld: { campaign:'wildwood',     city:'Wildwood',       covers:'Wildwood, Eureka',                       page:'/'              },
  che: { campaign:'chesterfield', city:'Chesterfield',   covers:'Chesterfield, Des Peres',                page:'/chesterfield/' }
};
/* Campaign names resolve too, so a utm_campaign=stpeters link tags correctly
   even though the printed path is /stp. */
var CLPPS_SIGN_ALIASES = (function(){
  var m = {};
  for (var k in CLPPS_SIGN_CITIES) m[CLPPS_SIGN_CITIES[k].campaign] = k;
  m.cot = 'stp';   // Cottleville folded into St. Peters
  return m;
})();
var CLPPS_SIGN_LABEL = 'Yard sign QR';

/* Storage that never throws. A browser with site data blocked (private
   windows, some locked-down phones) used to take the whole tracking
   block down with it, so those visitors landed with no source at all. */
function clppsStore(key, val){
  try {
    if (arguments.length > 1){ sessionStorage.setItem(key, val); return val; }
    return sessionStorage.getItem(key);
  } catch (e) { return null; }
}

function clppsParam(k, search){
  /* The hash is searched too. An ad built as /#quote?fbclid=... puts the
     tag after the # where location.search cannot see it, and the visit
     used to read as Direct. */
  var s = search || (location.search + ' ' + location.hash);
  var m = s.match(new RegExp('[?&]' + k + '=([^&# ]*)'));
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
}

/* Is this page open inside the Facebook or Instagram app's own browser?
   Those browsers often send no referrer at all, so a tap on a post or an
   ad with no tag on the link used to land as Direct. The app names
   itself in the user agent (FBAN, FBAV, Instagram). */
function clppsInMetaApp(){
  try { return /FBAN|FBAV|FB_IAB|Instagram/i.test(navigator.userAgent || ''); } catch (e) { return false; }
}

/* How the source was decided, for the tracker: fbclid, gclid, utm:<x>,
   ref:<host>, app:meta, none. Lets a doubtful "Direct" be checked instead
   of argued about. */
var clppsSourceHow = '';

/* The label a yard sign scan should carry, or '' if this is not one. */
function clppsSignSource(code){
  var c = String(code || '').toLowerCase().trim();
  if (!CLPPS_SIGN_CITIES[c] && CLPPS_SIGN_ALIASES[c]) c = CLPPS_SIGN_ALIASES[c];
  var hit = CLPPS_SIGN_CITIES[c];
  return hit ? CLPPS_SIGN_LABEL + ' (' + hit.city + ')' : '';
}

/* Where did this visit come from? Cached for the whole browser session,
   so the answer does not change when they click through to another page. */
function clppsLeadSource(){
  var cached = clppsStore('lead_src');
  if (cached){ clppsSourceHow = clppsStore('lead_how') || ''; return cached; }
  var src = '', how = 'none';
  var utm = clppsParam('utm_source').toLowerCase();

  if (clppsParam('gclid')){ src = 'Google Ads'; how = 'gclid'; }
  else if (clppsParam('fbclid')){ src = 'Meta Ads'; how = 'fbclid'; }
  else if (utm){
    how = 'utm:' + utm;
    if (utm.indexOf('yardsign') >= 0 || utm.indexOf('yard-sign') >= 0 ||
        utm.indexOf('yard_sign') >= 0 || utm === 'qr'){
      // utm_campaign carries the city code; without it we still know it
      // was a sign, just not which town.
      src = clppsSignSource(clppsParam('utm_campaign')) || CLPPS_SIGN_LABEL;
    }
    else if (utm.indexOf('face') >= 0 || utm === 'fb' || utm === 'ig' || utm.indexOf('meta') >= 0 || utm.indexOf('insta') >= 0) src = 'Meta Ads';
    else if (utm.indexOf('goog') >= 0) src = 'Google Ads';
    else src = clppsParam('utm_source');
  } else {
    var r = '', raw = '';
    try { raw = String(document.referrer || '').toLowerCase(); } catch (e) {}
    // the hostname when it parses; the raw string otherwise, so an
    // android-app://m.facebook.com referrer still says facebook
    try { r = raw ? new URL(raw).hostname.replace(/^www\./, '') : ''; } catch (e) { r = raw; }
    if (r) how = 'ref:' + r;
    if (r.indexOf('google') >= 0) src = 'Google (organic)';
    else if (r.indexOf('facebook') >= 0 || r.indexOf('instagram') >= 0 || r === 'fb.me' || r.indexOf('fb.me') >= 0) src = 'Meta (organic)';
    else if (r.indexOf('nextdoor') >= 0) src = 'Nextdoor';
    else if (r.indexOf('bing') >= 0 || r.indexOf('duckduckgo') >= 0) src = 'Other search';
    else if (r && r.indexOf('clpropetservices') < 0) src = r;
    else if (clppsInMetaApp()){ src = 'Meta (organic)'; how = 'app:meta'; }
    else src = 'Direct';
  }
  clppsSourceHow = how;
  clppsStore('lead_src', src);
  clppsStore('lead_how', how);
  return src;
}

/* ============================================================
   TEAM PHONES.

   Corey tested the Facebook funnel for an afternoon and the tracker counted
   him as a day of visitors. Anyone on the team who opens the site to check
   something is a "visitor" and any form they submit is a "lead", and the
   numbers everyone reads - speed to lead, close rate, ad return - all drift
   a little further from true each time.

   A phone is marked as a team phone ONCE, either by opening
   clpropetservices.com/?team=1 on it, or with the switch in the tracker
   (same site, so the same storage). From then on, from that phone:
     - page views and price views are never sent;
     - a submitted form still goes through - that is the point of testing -
       but lands as a labelled TEST lead, kept out of every figure, with no
       email or push to the office.
   ?team=0 undoes it. The flag lives in localStorage, so it survives closing
   the browser; sessionStorage would have forgotten by the next test.
   ============================================================ */
function clppsIsTeam(){
  try {
    var q = clppsParam('team');
    if (q === '1' || q === 'yes'){ localStorage.setItem('clpps_team', '1'); }
    else if (q === '0' || q === 'no'){ localStorage.removeItem('clpps_team'); }
    return localStorage.getItem('clpps_team') === '1';
  } catch (e) { return false; }
}

/* A short id for this visit, so several page views can be tied together. */
function clppsVisitId(){
  var s = clppsStore('v_sid');
  if (s) return s;
  s = Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 8);
  clppsStore('v_sid', s);
  return s;
}
