/* Jesse: "is there a way to stop people giving fake numbers and emails?
   Her number is an invalid number."

   Three jobs, and this checks all three plus the thing that matters most -
   that NONE of it turns away a real customer.

     1. refuse numbers that cannot exist
     2. catch email typos and offer the fix (this one makes money)
     3. flag the doubtful without blocking it */
const { loadSiteScript, reporter } = require('./lib');
const { clppsPhoneCheck, clppsEmailCheck } = loadSiteScript('contact-check.js');
const { ok, done } = reporter();

/* ---- REAL numbers must all get through. This is the half that costs
        money if it is wrong, so it goes first and it is the longest. ---- */
const REAL = [
  '6363754342',        // the business's own number
  '(636) 375-4342',
  '636-375-4342',
  '636.375.4342',
  '+1 636 375 4342',
  '16363754342',
  '1 (636) 375-4342',
  '  6363754342  ',
  '314 555 9182'.replace('555','729'),   // a St Louis 314 number
  '6362223333',        // repeated digits but a real shape
  '9187654321',        // 918 area code, 765 exchange
  '2125551000'.replace('555','867'),     // Manhattan
];
REAL.forEach(n => {
  const r = clppsPhoneCheck(n);
  ok('accepts ' + JSON.stringify(n), r.ok === true, JSON.stringify(r));
});

/* ---- and these cannot exist, so nobody honest is lost ---- */
const FAKE = [
  ['1234567890', 'area code starts with 1'],
  ['0000000000', 'all zeros'],
  ['1111111111', 'all ones'],
  ['9999999999', 'all nines'],
  ['0123456789', 'area code starts with 0'],
  ['9115551234', '911 is not an area code'],
  ['4110001234', '411 is not an area code'],
  ['6361234567', 'exchange starts with 1'],
  ['6360234567', 'exchange starts with 0'],
  ['6369115555', '911 is not an exchange'],
  ['6365550100', 'reserved for fiction'],
  ['6365550199', 'reserved for fiction'],
  ['6365550143', 'reserved for fiction - the one I used in my own examples'],
  ['12345',      'too short'],
  ['636375434',  'nine digits'],
  ['63637543421','eleven digits not starting 1'],
  ['',           'empty'],
  ['abcdefghij', 'no digits at all'],
];
FAKE.forEach(([n, why]) => {
  const r = clppsPhoneCheck(n);
  ok('rejects ' + JSON.stringify(n) + ' (' + why + ')', r.ok === false, JSON.stringify(r));
});

/* ---- possible, but the office should look before dialling ---- */
ok('flags a 555 number without blocking it', (() => {
  const r = clppsPhoneCheck('6365551234');
  return r.ok === true && /555/.test(r.doubt);
})(), JSON.stringify(clppsPhoneCheck('6365551234')));
ok('flags digits that just count up', (() => {
  const r = clppsPhoneCheck('2345678901');
  return r.ok === true && /count/.test(r.doubt);
})(), JSON.stringify(clppsPhoneCheck('2345678901')));
ok('a normal number carries no doubt at all',
   clppsPhoneCheck('6363754342').doubt === '', JSON.stringify(clppsPhoneCheck('6363754342')));

/* ---- EMAIL: real ones through ---- */
const REALMAIL = [
  'jesse@gmail.com', 'info@clpropetservices.com', 'a.b-c+tag@sub.domain.co.uk',
  'JESSE@GMAIL.COM', '  jesse@gmail.com  ', 'first.last@yahoo.co.uk',
  'someone@charter.net', 'x@comcast.net', 'name@sbcglobal.net',
];
REALMAIL.forEach(e => ok('accepts ' + e.trim(), clppsEmailCheck(e).ok === true, JSON.stringify(clppsEmailCheck(e))));

/* ---- malformed and throwaway ---- */
[['', 'empty'], ['jesse', 'no @'], ['jesse@', 'nothing after @'], ['@gmail.com', 'nothing before @'],
 ['jesse@gmail', 'no dot in domain'], ['a b@gmail.com', 'a space in it'],
 ['jesse@@gmail.com', 'two @'], ['jesse@gmail.c', 'one-letter TLD'],
 ['x@mailinator.com', 'throwaway'], ['x@yopmail.com', 'throwaway'],
 ['x@10minutemail.com', 'throwaway'],
].forEach(([e, why]) => ok('rejects ' + JSON.stringify(e) + ' (' + why + ')',
  clppsEmailCheck(e).ok === false, JSON.stringify(clppsEmailCheck(e))));

/* ---- the money one: a typo is a customer, not a liar ---- */
[['jesse@gmial.com', 'jesse@gmail.com'],
 ['jesse@gmai.com',  'jesse@gmail.com'],
 ['jesse@gmail.con', 'jesse@gmail.com'],
 ['jesse@yaho.com',  'jesse@yahoo.com'],
 ['jesse@hotmial.com','jesse@hotmail.com'],
 ['jesse@outlok.com','jesse@outlook.com'],
 ['jesse@icloud.con','jesse@icloud.com'],
].forEach(([typed, meant]) => {
  const r = clppsEmailCheck(typed);
  ok(typed + ' offers ' + meant, r.why === 'typo' && r.suggest === meant, JSON.stringify(r));
});

/* ---- and must NOT "correct" real addresses into nonsense ---- */
ok('yahoo.co.uk is left alone - it is a real domain',
   clppsEmailCheck('someone@yahoo.co.uk').ok === true);
ok('a company domain nobody recognises is left alone',
   clppsEmailCheck('jesse@clpropetservices.com').ok === true);
ok('a domain one letter off something unknown is NOT guessed at',
   clppsEmailCheck('jesse@sometinycompany.com').ok === true);

/* ---- placeholder-looking addresses: flagged, not blocked. Somebody
        really could be na@ their own domain, and a lead we can ring is
        still a lead even if the email is junk. ---- */
ok('test@test.com gets through but is flagged', (() => {
  const r = clppsEmailCheck('test@test.com');
  return r.ok === true && !!r.doubt;
})(), JSON.stringify(clppsEmailCheck('test@test.com')));
ok('a normal address carries no doubt', clppsEmailCheck('jesse@gmail.com').doubt === '');

done();
