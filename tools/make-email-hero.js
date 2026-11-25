/* Builds the animated header for a designed email: frames drawn by the
   browser, stitched into a looping GIF by tools/frames-to-gif.py.
   Usage: node tools/make-email-hero.js thanksgiving-2026 <frames-dir>
   The FIRST frame is a complete picture, because classic Outlook on
   Windows shows only that one and never animates. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const W = 600, H = 300, FRAMES = 20, SCALE = Number(process.env.HERO_SCALE || 1.5);
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'images', 'logo.png')).toString('base64');

const SCENES = {
  'thanksgiving-2026': `
    <div class="sky"></div>
    <div id="fall"></div>
    <div class="hill h1"></div><div class="hill h2"></div>
    <div class="logo"><img src="${logo}"></div>
    <div class="txt"><div class="small">FROM ALL OF US AT CL PROFESSIONAL PET SERVICES</div><div class="big">Happy Thanksgiving</div><div class="rule"></div><div class="sub">Thankful for you, and for every wagging tail on our route</div></div>
    <div class="paws">🐾</div><div class="turkey">🦃</div>`
};
const CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{width:${W}px;height:${H}px;overflow:hidden;position:relative;font-family:'Bitstream Charter','Caladea','DejaVu Serif',Georgia,serif;background:#7a2e12}
  .sky{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 0%,#F6B25A 0%,#D9742B 38%,#8E3515 78%,#5d200c 100%)}
  #fall{position:absolute;inset:0;z-index:2}
  .hill{position:absolute;z-index:1;left:-10%;width:120%;border-radius:50% 50% 0 0/100% 100% 0 0;background:#fff}
  .h1{bottom:-62px;height:112px;background:#fdf6ec;opacity:.96}
  .h2{bottom:-78px;height:112px;left:22%;width:110%;background:#fff}
  .logo{position:absolute;z-index:3;left:50%;top:14px;width:74px;height:74px;margin-left:-37px;border-radius:50%;background:#fff;box-shadow:0 3px 12px rgba(60,20,0,.35);display:flex;align-items:center;justify-content:center;overflow:hidden}
  .logo img{width:66px;height:66px;object-fit:contain}
  .txt{position:absolute;z-index:3;left:0;right:0;top:98px;text-align:center;color:#fff}
  .small{font-family:'Inter',Arial,sans-serif;font-size:9.5px;letter-spacing:.2em;font-weight:700;opacity:.92}
  .big{font-size:55px;font-style:italic;font-weight:700;line-height:1.08;margin-top:5px;text-shadow:0 3px 14px rgba(70,20,0,.45)}
  .rule{width:64px;height:3px;border-radius:2px;background:#FFE3A6;margin:8px auto 8px}
  .sub{font-family:'Inter',Arial,sans-serif;font-size:13.5px;font-weight:500;color:#FFF1D6}
  .paws{position:absolute;z-index:4;left:34px;bottom:10px;font-size:26px;transform:rotate(-18deg);font-family:'Noto Color Emoji'}
  .turkey{position:absolute;z-index:4;right:30px;bottom:6px;font-size:40px;font-family:'Noto Color Emoji'}
  .p{position:absolute;font-family:'Noto Color Emoji';will-change:transform}
  .s{position:absolute;border-radius:50%;background:#fff}
`;
/* every particle travels a whole number of screen-heights per loop, so the
   last frame runs into the first with no jump */
const DRAW = `
  window.draw = function(t){
    var box = document.getElementById('fall'), h = '', rnd = function(i, k){ var x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); };
    for (var i = 0; i < 46; i++){
      var x0 = rnd(i, 1) * ${W}, loops = 1 + Math.floor(rnd(i, 2) * 2), y = ((rnd(i, 3) + t * loops) % 1) * (${H} + 30) - 15;
      var r = 1.2 + rnd(i, 4) * 2.6, x = x0 + Math.sin((t + rnd(i, 5)) * Math.PI * 2) * 9;
      h += '<div class="s" style="left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) + 'px;width:' + (r * 2).toFixed(1) + 'px;height:' + (r * 2).toFixed(1) + 'px;opacity:' + (0.55 + rnd(i, 6) * 0.45).toFixed(2) + '"></div>';
    }
    var L = ['🍂', '🍁', '🍂', '🍁', '🍂', '🍁', '🍂'];
    for (var j = 0; j < L.length; j++){
      var lx = 30 + rnd(j, 11) * (${W} - 60) + Math.sin((t + rnd(j, 12)) * Math.PI * 2) * 22, ly = ((rnd(j, 13) + t) % 1) * (${H} + 50) - 30, rot = (t * 360 * (j % 2 ? 1 : -1) + rnd(j, 14) * 360).toFixed(0);
      h += '<div class="p" style="left:' + lx.toFixed(1) + 'px;top:' + ly.toFixed(1) + 'px;font-size:' + (17 + rnd(j, 15) * 9).toFixed(0) + 'px;transform:rotate(' + rot + 'deg)">' + L[j] + '</div>';
    }
    box.innerHTML = h;
  };`;
(async () => {
  const name = process.argv[2], out = process.argv[3];
  if (!SCENES[name] || !out) { console.error('usage: make-email-hero.js <scene> <frames-dir>'); process.exit(1); }
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(), p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
  await p.setContent('<!doctype html><html><head><meta charset="utf-8"><style>' + CSS + '</style></head><body>' + SCENES[name] + '<script>' + DRAW + '</script></body></html>');
  await p.waitForTimeout(400);
  for (let f = 0; f < FRAMES; f++) { await p.evaluate(t => window.draw(t), f / FRAMES); await p.screenshot({ path: path.join(out, 'f' + String(f).padStart(2, '0') + '.png') }); }
  await b.close(); console.log(FRAMES + ' frames in ' + out);
})();
