/* ============================================================
   GOOGLE ADS CONVERSION TRACKING  -  CL Professional Pet Services

   TO TURN ON: fill in the ID and the labels below, save, and that's it.
   Every page already loads this file.

   Where to find them:
     Google Ads -> Goals -> Conversions -> Summary -> click the action ->
     Tag setup -> "Install the tag yourself". The snippet shows
       send_to: 'AW-123456789/AbCdEfGhIjK'
     The part before the slash is the ID (the same for every action).
     The part after the slash is that action's label.

   Leave a label blank and that action is simply not sent. Until the ID
   is filled in, this file does nothing at all - no Google code loads
   and no data leaves the site.
   ============================================================ */

var GOOGLE_ADS_ID = "";          // e.g. "AW-123456789"

var GOOGLE_ADS_LABELS = {
  quote:      "",   // someone gave their name and phone for a quote (the main one: most volume)
  activated:  "",   // someone said yes to their price, on the site or on their emailed quote
  call:       "",   // tapped a phone number
  text:       "",   // tapped the text-us button
  email:      "",   // tapped an email address
  commercial: ""    // sent the commercial / HOA form
};

/* ---- nothing below here needs editing ---- */
(function(){
  if (!/^AW-\d+$/.test(GOOGLE_ADS_ID)) return;
  // the Google tag, once per page
  var s = document.createElement('script'); s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GOOGLE_ADS_ID);
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function(){ dataLayer.push(arguments); };
  gtag('js', new Date());
  gtag('config', GOOGLE_ADS_ID);

  // phone, text and email taps, anywhere on the site
  document.addEventListener('click', function(e){
    var el = e.target && e.target.closest ? e.target.closest('a') : null; if (!el) return;
    var href = String(el.getAttribute('href') || '');
    if (href.indexOf('tel:') === 0) clppsAds('call');
    else if (href.indexOf('sms:') === 0) clppsAds('text');
    else if (href.indexOf('mailto:') === 0) clppsAds('email');
  }, true);
})();

/* One conversion, by name. Each name is sent once per page view at most, so
   a double tap or a re-render cannot count twice. Safe to call any time:
   it does nothing when the ID or that label is blank. */
window.clppsAds = function(name, value){
  try {
    if (!/^AW-\d+$/.test(GOOGLE_ADS_ID) || !window.gtag) return;
    var label = GOOGLE_ADS_LABELS[name]; if (!label) return;
    window.clppsAdsSent = window.clppsAdsSent || {};
    if (window.clppsAdsSent[name]) return; window.clppsAdsSent[name] = 1;
    var p = { send_to: GOOGLE_ADS_ID + '/' + label };
    if (value > 0){ p.value = Math.round(value * 100) / 100; p.currency = 'USD'; }
    gtag('event', 'conversion', p);
  } catch (e) {}
};
