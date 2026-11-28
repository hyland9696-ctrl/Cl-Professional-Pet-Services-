/* The gift page, /gift/: the Cyber Monday flyer's sign-up. 12 months for
   the price of 11, or a gift certificate; the price comes from the shared
   price list; the order goes to the tracker as a card for the yard. No
   card is taken here. */
const { ORIGIN, launch, reporter, stubNetwork } = require('./lib');
const { ok, done } = reporter();

(async () => {
  const b = await launch();
  const open = async (when) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.clock.install({ time: new Date(when) });
    const posts = [], mails = []; let fail = false;
    stubNetwork(p, {});
    await p.route('**/script.google.com/**', r => { let body = {}; try { body = JSON.parse(r.request().postData() || '{}'); } catch (e) {} if (body.lead) posts.push(body.lead); return fail ? r.abort() : r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) }); });
    await p.route('**/formsubmit.co/**', r => { try { mails.push(JSON.parse(r.request().postData() || '{}')); } catch (e) {} r.fulfill({ contentType: 'application/json', body: '{"success":"true"}' }); });
    await p.goto(ORIGIN + '/gift/?utm_source=email&utm_campaign=gift2026'); await p.waitForTimeout(700);
    return { ctx, p, errs, posts, mails, setFail: v => { fail = v; } };
  };
  const sum = async (p) => (await p.textContent('#g-sum')).replace(/\s+/g, ' ');

  /* ---- during the deal: Sunday before Cyber Monday ---- */
  {
    const { ctx, p, errs, posts, mails, setFail } = await open('2026-11-29T18:00:00Z');
    ok('the flyer is the top of the page and the deadline is stated', (await p.getAttribute('img.hero', 'src')) === '/email/gift-2026.jpg' && /order by midnight Monday, November 30/.test(await p.textContent('#dead')));
    ok('no price until there is a ZIP', /Enter the yard’s ZIP code/.test(await sum(p)));
    await p.fill('#g-zip', '63376'); await p.waitForTimeout(200);
    ok('1 dog weekly in St. Peters: $85 a month, so 11 months is $935 against $1,020, the 12th month free and the initial clean waived', /\$935 for the year/.test(await sum(p)) && /\$1,020/.test(await sum(p)) && /12th month free\s*−\$85/.test(await sum(p)) && /\$40\s*waived/.test(await sum(p)), await sum(p));
    await p.click('#g-dogs [data-v="2"]'); await p.click('#g-freq [data-v="biweekly"]'); await p.waitForTimeout(200);
    const q = await p.evaluate(() => clppsQuote({ zip: '63376', dogs: 2, freq: 'biweekly', deo: 'none' }).total);
    ok('dogs and frequency change it, always eleven times the price list\'s monthly figure', new RegExp('\\$' + (q * 11).toLocaleString('en-US') + ' for the year').test(await sum(p)), q + ' | ' + await sum(p));
    await p.click('#g-dogs [data-v="5"]'); await p.waitForTimeout(150);
    ok('5 or more dogs is priced by hand, and can still be ordered', /price from us by hand \(5 or more dogs\)/.test(await sum(p)));
    await p.fill('#g-zip', '90210'); await p.waitForTimeout(150);
    ok('a ZIP outside the routes says so', /don’t have a route in 90210/.test(await sum(p)));
    await p.click('#g-go'); await p.waitForTimeout(150);
    ok('and cannot be ordered', /outside our routes/.test(await p.textContent('#g-err')) && posts.length === 0);
    await p.fill('#g-zip', '63376'); await p.click('#g-dogs [data-v="1"]'); await p.click('#g-freq [data-v="weekly"]');
    await p.click('#g-go'); await p.waitForTimeout(150);
    ok('nothing is sent with blanks: it asks for what is missing, one thing at a time', /who the gift is for/.test(await p.textContent('#g-err')) && posts.length === 0);
    await p.fill('#g-rname', 'Grandma Jo'); await p.fill('#g-addr', '12 Elm St, St. Peters'); await p.fill('#g-name', 'Sam Buyer'); await p.fill('#g-phone', '(636) 375-0199'); await p.fill('#g-email', 'not-an-email');
    await p.click('#g-go'); await p.waitForTimeout(150);
    ok('a bad email is caught, since that is where the invoice goes', /where the invoice goes/.test(await p.textContent('#g-err')) && posts.length === 0);
    await p.fill('#g-email', 'sam@gmail.com'); await p.fill('#g-note', 'Start after Christmas');
    setFail(true); await p.click('#g-go'); await p.waitForTimeout(700);
    ok('if the order cannot be filed it says so and can be sent again; no false thank-you', /did not go through/.test(await p.textContent('#g-err')) && !(await p.isVisible('#thanks')) && !(await p.$eval('#g-go', e => e.disabled)));
    setFail(false); posts.length = 0; await p.click('#g-go'); await p.waitForTimeout(800);
    const L = posts[0];
    ok('the order is one card for the yard: the person being serviced, the address, the plan and the monthly price with the prepaid total', posts.length === 1 && L.type === 'ACTIVATE' && L.name === 'Grandma Jo (gift from Sam Buyer)' && L.address === '12 Elm St, St. Peters' && L.zip === '63376' && L.dogs === '1' && L.service === 'weekly' && L.price === '$85/mo, weekly service, prepaid $935 for 12 months' && L.phone === '6363750199' && L.email === 'sam@gmail.com', JSON.stringify(L));
    ok('the notes say what to do: a gift order, what was bought, who pays, where the invoice goes', /^GIFT ORDER \(Cyber Monday\): a year of weekly service: pay \$935 for 12 months \(\$85\/mo, 12th month free, normally \$1,020\), initial clean waived\. It is a gift for Grandma Jo\. Buyer: Sam Buyer\. Send the invoice to sam@gmail\.com\. Note: Start after Christmas$/.test(L.notes), L.notes);
    ok('it is marked as accepted, initial clean waived, from the email campaign; and never sets a status itself', /\[SRC:email\]/.test(L.crmnotes) && /\[CAMP:gift2026\]/.test(L.crmnotes) && /\[IC:w\]/.test(L.crmnotes) && /\[QA:a\]/.test(L.crmnotes) && L.status === undefined && /^g[a-z0-9]{6,}$/.test(L.id), L.crmnotes);
    ok('the office gets a copy by email with the invoice amount; the buyer is not sent anything from this page', mails.length >= 1 && /GIFT ORDER: Sam Buyer, a year of weekly/.test(mails[mails.length - 1]._subject) && mails[mails.length - 1].Invoice_Amount === '$935' && mails.every(m => !m._autoresponse), JSON.stringify(mails[mails.length - 1]));
    const th = (await p.textContent('#thanks')).replace(/\s+/g, ' ');
    ok('the thank-you says what happens next: invoice within a business day, gift card once paid', await p.isVisible('#thanks') && !(await p.isVisible('#order')) && /Thank you, Sam\. We have your order for a year of weekly service\./.test(th) && /email your invoice within one business day/.test(th) && /gift card to hand over/.test(th), th);
    ok('the page fits a phone and has no errors', await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth) && errs.length === 0, errs.join('; '));
    await ctx.close();
  }

  /* ---- a certificate, for a gift, with no yard address ---- */
  {
    const { ctx, p, posts } = await open('2026-11-29T18:00:00Z');
    await p.click('#pk-cert'); await p.waitForTimeout(150); await p.click('#g-amt [data-v="150"]'); await p.waitForTimeout(150);
    ok('a certificate shows its amount and that it never expires', /\$150/.test(await sum(p)) && /toward any service/.test(await sum(p)) && /Never expires/.test(await sum(p)));
    await p.fill('#g-rname', 'Neighbor Ned'); await p.fill('#g-name', 'Sam Buyer'); await p.fill('#g-phone', '6363750199'); await p.fill('#g-email', 'sam@gmail.com');
    await p.click('#g-go'); await p.waitForTimeout(800);
    ok('a gifted certificate needs no address or ZIP, and files as a one-time amount, not a monthly customer', posts.length === 1 && posts[0].price === '$150 one-time gift certificate' && posts[0].service === 'gift certificate' && !/\[IC:w\]/.test(posts[0].crmnotes) && /\$150 gift certificate\. It is a gift for Neighbor Ned/.test(posts[0].notes), JSON.stringify(posts[0]));
    await ctx.close();
  }

  /* ---- Tuesday: the deal is over, the page says so and charges the full year ---- */
  {
    const { ctx, p, posts } = await open('2026-12-01T15:00:00Z');
    await p.fill('#g-zip', '63376'); await p.waitForTimeout(200);
    ok('after midnight Monday the 12-for-11 price is gone: the banner says ended and the year is twelve months', /Cyber Monday price has ended/.test(await p.textContent('#dead')) && /\$1,020 for the year/.test(await sum(p)) && !/12th month free/.test(await sum(p)) && !/pay for 11/.test(await p.textContent('#pk-year')), await sum(p));
    await p.click('#g-who [data-v="me"]'); await p.fill('#g-addr', '5 Oak St'); await p.fill('#g-name', 'Late Larry'); await p.fill('#g-phone', '6363750188'); await p.fill('#g-email', 'larry@gmail.com');
    await p.click('#g-go'); await p.waitForTimeout(800);
    ok('an order then is filed at the full price, for their own yard, with no deal named', posts.length === 1 && posts[0].name === 'Late Larry' && /prepaid \$1,020 for 12 months/.test(posts[0].price) && /^GIFT ORDER \(gift page\)/.test(posts[0].notes) && /their own yard/.test(posts[0].notes) && !/12th month free/.test(posts[0].notes), JSON.stringify(posts[0]));
    await ctx.close();
  }
  await b.close();
  done();
})();
