/* Print-ready business cards for a commercial printer.

   TO REGENERATE (after a phone number or title changes):
     1. Download Manrope 400/700/800 as .ttf into a ./fonts folder beside
        this script, naming them Manrope-400.ttf, Manrope-700.ttf,
        Manrope-800.ttf. They come from fonts.google.com/specimen/Manrope
        and are not committed here, to avoid redistributing the font files.
     2. node make-cards.js
   The fonts are embedded into the PDFs as subsets, which the SIL Open Font
   Licence permits, so the printer needs nothing installed.

   US business card: 3.5 x 2in trim, 0.125in bleed on every edge, so the
   artwork is 3.75 x 2.25in. Anything that must not be cut off stays
   0.125in inside the trim (the "safe area").

   Manrope is embedded from a real font file rather than linked, so the
   PDF carries the brand typeface wherever it is opened. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const SITE = '/workspace/cl-professional-pet-services-';
const OUT = SITE + '/brand/print';
const FONTS = __dirname + '/fonts';

const BLEED = 0.125, TRIM_W = 3.5, TRIM_H = 2;
const W = TRIM_W + BLEED * 2, H = TRIM_H + BLEED * 2;

const PEOPLE = [
  { slug:'jesse', name:'Jesse Duncan', title:'Operations Manager', phone:'(636) 388-5069' },
  { slug:'corey', name:'Corey Casey',  title:'Owner',              phone:'(636) 375-4342' },
];
const EMAIL = 'info@clpropetservices.com';
const SITEURL = 'clpropetservices.com';

const b64 = f => fs.readFileSync(f).toString('base64');
const fontCss = [400, 700, 800].map(w =>
  `@font-face{font-family:'Manrope';font-style:normal;font-weight:${w};` +
  `src:url(data:font/ttf;base64,${b64(FONTS + '/Manrope-' + w + '.ttf')}) format('truetype');}`
).join('\n');
const logo = 'data:image/png;base64,' + b64(SITE + '/brand/CLPPS-logo-dogs-TRANSPARENT.png');

const shell = (inner, extra) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
${fontCss}
@page{ size:${W}in ${H}in; margin:0; }
*{box-sizing:border-box;margin:0;padding:0;}
html,body{width:${W}in;height:${H}in;}
body{font-family:'Manrope',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.bleed{width:${W}in;height:${H}in;position:relative;overflow:hidden;display:flex;}
/* the trim-sized artwork sits inside the bleed area */
.trim{position:absolute;left:${BLEED}in;top:${BLEED}in;width:${TRIM_W}in;height:${TRIM_H}in;display:flex;}
${extra || ''}
</style></head><body>${inner}</body></html>`;

const front = p => shell(`
  <div class="bleed" style="background:#fff;">
    <div class="trim">
      <div class="face">
        <div>
          <div class="nm">${p.name}</div>
          <div class="ti">${p.title}</div>
          <div class="rule"></div>
        </div>
        <div class="stack">
          <span class="big">${p.phone}</span>
          ${EMAIL}<br>${SITEURL}
        </div>
      </div>
    </div>
  </div>`, `
  .face{background:#fff;padding:0.26in 0.28in 0.22in;display:flex;flex-direction:column;
        justify-content:space-between;width:100%;}
  .nm{font-size:15pt;font-weight:800;letter-spacing:-0.45pt;line-height:1;color:#141C19;}
  .ti{font-size:6.4pt;font-weight:700;letter-spacing:1.7pt;text-transform:uppercase;color:#1D8A68;margin-top:6pt;}
  .rule{width:0.34in;height:1.6pt;background:#1D8A68;margin-top:9pt;}
  .stack{font-size:8.2pt;line-height:1.7;color:#3A4A44;}
  .stack .big{font-size:10.5pt;font-weight:800;color:#141C19;letter-spacing:-0.2pt;display:block;}`);

// The green runs to the bleed edge so the trim can wander without showing white.
const back = () => shell(`
  <div class="bleed" style="background:#0E4B3B;">
    <div class="trim" style="flex-direction:column;align-items:center;justify-content:center;gap:0.11in;">
      <div class="disc"><img src="${logo}" alt=""></div>
      <div>
        <div class="mark-name">CL Professional Pet Services</div>
        <div class="mark-sub">Pet Waste Removal</div>
      </div>
    </div>
  </div>`, `
  .disc{width:1.02in;height:1.02in;border-radius:50%;background:#fff;display:flex;
        align-items:center;justify-content:center;}
  .disc img{width:0.82in;height:0.82in;object-fit:contain;}
  .mark-name{font-size:6.4pt;font-weight:700;letter-spacing:2.4pt;text-transform:uppercase;
             color:#fff;text-align:center;line-height:1.3;}
  .mark-sub{font-size:5.4pt;letter-spacing:1.9pt;text-transform:uppercase;color:#7FBFA6;
            text-align:center;margin-top:4pt;}`);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const made = [];

  for (const p of PEOPLE) {
    for (const [side, html] of [['front', front(p)], ['back', back()]]) {
      // the page is exactly one card: 3.75 x 2.25in = 360 x 216 CSS px at 96dpi.
      // 600dpi / 96dpi = 6.25, so that scale factor gives a true 600dpi raster.
      const CSS_W = Math.round(W * 96), CSS_H = Math.round(H * 96);
      const page = await b.newPage({ viewport:{ width: CSS_W, height: CSS_H }, deviceScaleFactor: 600 / 96 });
      await page.setContent(html, { waitUntil:'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);

      const pdf = `${OUT}/CLPPS-card-${p.slug}-${side}.pdf`;
      await page.pdf({ path: pdf, width: W + 'in', height: H + 'in',
                       printBackground: true, pageRanges: '1' });
      // 600dpi raster too, for printers who ask for images
      const png = `${OUT}/CLPPS-card-${p.slug}-${side}-600dpi.png`;
      await page.screenshot({ path: png, scale: 'device',
                              clip: { x:0, y:0, width: CSS_W, height: CSS_H } });
      made.push(pdf, png);
      await page.close();
    }

    // Most printers would rather have one file: page 1 front, page 2 back.
    const both = await b.newPage({ viewport:{ width: Math.round(W*96), height: Math.round(H*96) },
                                   deviceScaleFactor: 2 });
    const strip = h => h.replace(/^[\s\S]*?<body>/, '').replace(/<\/body>[\s\S]*$/, '');
    await both.setContent(front(p).replace('</body>',
      '<div style="break-before:page;page-break-before:always;"></div>' + strip(back()) + '</body>')
      .replace('</style>', `
        .disc{width:1.02in;height:1.02in;border-radius:50%;background:#fff;display:flex;
              align-items:center;justify-content:center;}
        .disc img{width:0.82in;height:0.82in;object-fit:contain;}
        .mark-name{font-size:6.4pt;font-weight:700;letter-spacing:2.4pt;text-transform:uppercase;
                   color:#fff;text-align:center;line-height:1.3;}
        .mark-sub{font-size:5.4pt;letter-spacing:1.9pt;text-transform:uppercase;color:#7FBFA6;
                  text-align:center;margin-top:4pt;}
        html,body{height:auto;}
      </style>`), { waitUntil:'load' });
    await both.evaluate(() => document.fonts.ready);
    await both.waitForTimeout(250);
    const combo = `${OUT}/CLPPS-card-${p.slug}-BOTH-SIDES.pdf`;
    await both.pdf({ path: combo, width: W + 'in', height: H + 'in', printBackground: true });
    made.push(combo);
    await both.close();
  }
  await b.close();
  made.forEach(f => console.log(path.basename(f).padEnd(38), (fs.statSync(f).size/1024).toFixed(0) + ' KB'));
})();
