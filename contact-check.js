/* ============================================================
   CONTACT DETAILS: what is impossible, what is merely suspicious.

   Jesse: "is there a way to stop people giving fake numbers and
   emails? Her number is an invalid number."

   You cannot stop a determined person putting rubbish in a public
   form without making every honest customer prove themselves, which
   costs more real leads than it saves. What you CAN do is three
   things, and this file is all three:

     1. Refuse numbers that cannot exist. North American numbers obey
        rules - an area code never starts 0 or 1, 911 is not an area
        code - so "1234567890" and "0000000000" are not unlucky
        guesses, they are impossible, and there is no honest customer
        to lose by turning them away.

     2. Catch EMAIL TYPOS and offer the fix. This is the part that
        makes money rather than just saving time: somebody typing
        @gmial.com is a real customer we would otherwise never reach.

     3. Flag what is possible but doubtful - a 555 number, a straight
        run of digits - WITHOUT blocking it, so the office knows
        before wasting a call, and a real customer with an odd number
        still gets through.

   What this cannot do: a number can be perfectly formed and still be
   disconnected, or belong to somebody else entirely. Knowing that
   needs a paid carrier lookup, or ringing it.
   ============================================================ */

/* North American Numbering Plan, the parts that are actually rules:
     area code (NPA)  first digit 2-9, and never N11 (211, 911, ...)
     exchange (NXX)   first digit 2-9, and never N11
   555-0100 to 555-0199 are reserved for fiction - that is the block
   films and TV are told to use, so a customer typing one is not a
   customer. */
function clppsPhoneCheck(v) {
  var d = String(v == null ? '' : v).replace(/[^0-9]/g, '');
  if (!d) return { ok: false, why: 'empty' };
  if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
  if (d.length !== 10) return { ok: false, why: 'length' };

  var npa = d.slice(0, 3), nxx = d.slice(3, 6), line = d.slice(6);

  if (/^[01]/.test(npa)) return { ok: false, why: 'area-code' };
  if (/^\d11$/.test(npa)) return { ok: false, why: 'area-code' };
  if (/^[01]/.test(nxx)) return { ok: false, why: 'exchange' };
  if (/^\d11$/.test(nxx)) return { ok: false, why: 'exchange' };
  if (/^(\d)\1{9}$/.test(d)) return { ok: false, why: 'all-same' };
  if (nxx === '555' && /^01\d\d$/.test(line)) return { ok: false, why: 'fictional' };

  /* Possible, but worth a second look. NOT blocked: somebody really can
     be on a 555 exchange, and a run of digits can be a real number. The
     tracker shows these with a note so nobody burns a morning on them. */
  var doubt = '';
  if (nxx === '555') doubt = 'a 555 number, which is usually made up';
  else if (clppsRun_(d) >= 7) doubt = 'the digits mostly just count up or down';
  else if (/^(\d)(\d)(\1\2){4}$/.test(d)) doubt = 'two digits alternating the whole way';
  else if (/^(\d{3})\1{2}\d$/.test(d)) doubt = 'the same three digits repeated';

  return { ok: true, digits: d, doubt: doubt };
}

/* The LONGEST run of digits each one step from the last, in either
   direction. Not "is the whole number a run" - it never can be: a full
   ten-digit run has to start 0 or 1, which the area-code rule already
   turns away. What gets through is the near miss, 2345678901, where the
   pattern is obvious to a human and only the wrap breaks the sequence. */
function clppsRun_(d) {
  var best = 1, cur = 1;
  for (var i = 1; i < d.length; i++) {
    var step = d.charCodeAt(i) - d.charCodeAt(i - 1);
    var prev = i > 1 ? d.charCodeAt(i - 1) - d.charCodeAt(i - 2) : step;
    if ((step === 1 || step === -1) && step === prev) cur++;
    else cur = (step === 1 || step === -1) ? 2 : 1;
    if (cur > best) best = cur;
  }
  return best;
}

/* Throwaway inboxes. Someone using one has decided in advance not to
   hear from us, so there is no lead to lose. Kept short and specific -
   a list that guesses costs real customers. */
var CLPPS_BURNER = [
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', '10minutemail.com',
  'tempmail.com', 'temp-mail.org', 'throwawaymail.com', 'yopmail.com',
  'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com',
  'maildrop.cc', 'fakeinbox.com', 'mailnesia.com', 'spamgourmet.com',
  'discard.email', 'mintemail.com', 'emailondeck.com', 'moakt.com'
];

/* Typos we can be sure about, because the corrected version is one of
   the handful of providers nearly everyone uses. Only exact matches -
   guessing at a domain we do not recognise would "correct" real company
   addresses into nonsense. Note yahoo.co is NOT here: yahoo.co.uk is a
   real domain and we must not mangle it. */
var CLPPS_TYPOS = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com', 'gmail.con': 'gmail.com', 'gmaill.com': 'gmail.com',
  'gnail.com': 'gmail.com', 'gmali.com': 'gmail.com', 'gamil.com': 'gmail.com',
  'gmail.om': 'gmail.com', 'gmail.vom': 'gmail.com', 'gmail.comm': 'gmail.com',
  'yahoo.con': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com',
  'yahoo.cm': 'yahoo.com', 'yhaoo.com': 'yahoo.com', 'yahoo.om': 'yahoo.com',
  'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmail.con': 'hotmail.com',
  'hotmail.co': 'hotmail.com', 'hotmial.co': 'hotmail.com', 'homail.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outloo.com': 'outlook.com', 'outlook.con': 'outlook.com',
  'outlook.co': 'outlook.com', 'oulook.com': 'outlook.com',
  'aol.con': 'aol.com', 'ao.com': 'aol.com', 'aol.co': 'aol.com',
  'icloud.con': 'icloud.com', 'iclould.com': 'icloud.com', 'icoud.com': 'icloud.com',
  'comcast.net.com': 'comcast.net', 'sbcglobal.com': 'sbcglobal.net',
  'charter.com': 'charter.net', 'att.com': 'att.net'
};

function clppsEmailCheck(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s) return { ok: false, why: 'empty' };
  // one @, something either side, a dot in the domain, a plausible TLD
  if (!/^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(s)) return { ok: false, why: 'shape' };

  var at = s.lastIndexOf('@');
  var local = s.slice(0, at), domain = s.slice(at + 1).toLowerCase();
  if (!/^[a-z]{2,}$/.test(domain.split('.').pop())) return { ok: false, why: 'tld' };
  if (CLPPS_BURNER.indexOf(domain) >= 0) return { ok: false, why: 'burner' };

  var fix = CLPPS_TYPOS[domain];
  if (fix) return { ok: false, why: 'typo', suggest: local + '@' + fix };

  var doubt = '';
  if (/^(test|asdf|qwerty|aaa+|abc|xxx+|noemail|none|na|nope|fake)$/i.test(local)) {
    doubt = 'the address looks like a placeholder';
  } else if (domain === 'example.com' || domain === 'test.com') {
    doubt = 'that is a made-up domain';
  }
  return { ok: true, email: s, doubt: doubt };
}

/* One line for the tracker card: what is doubtful about this person's
   details, or '' when nothing is. Works on leads taken long before any
   of this existed, because it reads the stored values rather than
   needing a marker on the row. */
function clppsContactDoubt(phone, email) {
  var bits = [];
  var p = clppsPhoneCheck(phone);
  if (phone && !p.ok && p.why !== 'empty') bits.push('the phone number cannot be a real one');
  else if (p.ok && p.doubt) bits.push(p.doubt);
  var e = clppsEmailCheck(email);
  if (email && !e.ok && e.why !== 'empty') {
    bits.push(e.why === 'typo' ? 'the email looks mistyped' : 'the email address will not work');
  } else if (e.ok && e.doubt) bits.push(e.doubt);
  return bits.join(', and ');
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { clppsPhoneCheck: clppsPhoneCheck, clppsEmailCheck: clppsEmailCheck,
                     clppsContactDoubt: clppsContactDoubt };
}
