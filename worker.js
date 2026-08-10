'use strict';

const C3_OVER_24 = 10939058860032000n;
const DIGITS_PER_TERM = 14.181647462725477;
const GUARD = 20;

let totalTerms = 0;
let completedTerms = 0;
let reportStep = 1;
let nextReport = 1;

function report() {
  completedTerms++;
  if (completedTerms < nextReport && completedTerms !== totalTerms) return;
  nextReport = completedTerms + reportStep;
  const progress = Math.min(92, (completedTerms / totalTerms) * 92);
  postMessage({ type: 'progress', progress, label: 'Calculating' });
}

function combine(left, right) {
  const p = left[0] * right[0];
  const q = left[1] * right[1];
  const t = left[2] * right[1] + left[0] * right[2];
  return [p, q, t];
}

function bs(a, b) {
  if (b - a === 1) {
    let p;
    let q;
    let t;

    if (a === 0) {
      p = 1n;
      q = 1n;
      t = 13591409n;
    } else {
      const k = BigInt(a);
      p = (6n * k - 5n) * (2n * k - 1n) * (6n * k - 1n);
      q = k * k * k * C3_OVER_24;
      t = p * (13591409n + 545140134n * k);
      if (a & 1) t = -t;
    }

    report();
    return [p, q, t];
  }

  const m = Math.floor((a + b) / 2);
  return combine(bs(a, m), bs(m, b));
}

function isqrt(n) {
  if (n < 0n) throw new RangeError('negative square root');
  if (n < 2n) return n;

  const bits = n.toString(2).length;
  let x = 1n << BigInt(Math.ceil(bits / 2));
  let y = (x + n / x) >> 1n;

  while (y < x) {
    x = y;
    y = (x + n / x) >> 1n;
  }
  return x;
}

function calculatePi(digits) {
  totalTerms = Math.floor((digits + GUARD) / DIGITS_PER_TERM) + 1;
  completedTerms = 0;
  reportStep = Math.max(1, Math.floor(totalTerms / 100));
  nextReport = reportStep;

  const result = bs(0, totalTerms);
  const q = result[1];
  const t = result[2];

  postMessage({ type: 'progress', progress: 94, label: 'Square root' });

  const scaleDigits = digits + GUARD;
  const scale = 10n ** BigInt(scaleDigits);
  const root = isqrt(10005n * scale * scale);

  postMessage({ type: 'progress', progress: 98, label: 'Final division' });

  let raw = ((q * 426880n * root) / t).toString();
  raw = raw.padStart(scaleDigits + 1, '0');
  raw = raw.slice(0, digits + 1);
  return `${raw[0]}.${raw.slice(1)}`;
}

onmessage = (event) => {
  try {
    if (event.data?.type !== 'calculate') return;
    const digits = Number(event.data.digits);
    if (!Number.isSafeInteger(digits) || digits < 1) throw new RangeError('Invalid precision.');
    const result = calculatePi(digits);
    postMessage({ type: 'done', result });
  } catch (error) {
    postMessage({ type: 'error', message: error?.message || String(error) });
  }
};
