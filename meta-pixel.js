/* ============================================================
   META (FACEBOOK / INSTAGRAM) PIXEL  —  CL Professional Pet Services

   TO TURN ON: put your Pixel ID between the quotes on the next line,
   save, and that's it. Every page already loads this file.

   Where to find the ID:
     business.facebook.com -> Events Manager -> Data sources ->
     click the pixel -> the number under its name (15-16 digits).

   Until an ID is filled in, this file does nothing at all — no
   Facebook code loads and no data leaves the site.
   ============================================================ */

var META_PIXEL_ID = "2545784085939784";

/* ---- nothing below here needs editing ---- */
(function(){
  if (!META_PIXEL_ID) return;
  !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
  n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
  (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', META_PIXEL_ID);
  fbq('track', 'PageView');
})();

/* Called from the quote wizard and the quote page. Safe to call any
   time — it simply does nothing when the pixel isn't configured. */
window.clppsTrack = function(event, params){
  try {
    if (!META_PIXEL_ID || !window.fbq) return;
    fbq('track', event, params || {});
  } catch (e) {}
};
