'use strict';

const C3_OVER_24 = 10939058860032000n;

function bs(a, b) {
  if (b - a === 1) {
    if (a === 0) return [1n, 1n, 13591409n];

    const k = BigInt(a);
    const p = (6n * k - 5n) * (2n * k - 1n) * (6n * k - 1n);
    const q = k * k * k * C3_OVER_24;
    let t = p * (13591409n + 545140134n * k);
    if (a & 1) t = -t;
    return [p, q, t];
  }

  const m = (a + b) >> 1;
  const left = bs(a, m);
  const right = bs(m, b);
  return combine(left, right);
}

function combine(left, right) {
  const [p1, q1, t1] = left;
  const [p2, q2, t2] = right;
  return [p1 * p2, q1 * q2, t1 * q2 + p1 * t2];
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

function finalize(partials, digits, guard) {
  let acc = partials[0];
  for (let i = 1; i < partials.length; i++) acc = combine(acc, partials[i]);

  postMessage({ type: 'phase', progress: 94, label: 'Square root' });

  const scaleDigits = digits + guard;
  const scale = 10n ** BigInt(scaleDigits);
  const root = isqrt(10005n * scale * scale);

  postMessage({ type: 'phase', progress: 98, label: 'Final division' });

  const [, q, t] = acc;
  let raw = ((q * 426880n * root) / t).toString();
  raw = raw.padStart(scaleDigits + 1, '0').slice(0, digits + 1);
  return raw[0] + '.' + raw.slice(1);
}

onmessage = (event) => {
  const data = event.data;

  try {
    if (data.type === 'chunk') {
      const result = bs(data.a, data.b);
      postMessage({ type: 'chunkDone', id: data.id, result });
      return;
    }

    if (data.type === 'finalize') {
      const result = finalize(data.partials, data.digits, data.guard);
      postMessage({ type: 'done', result });
    }
  } catch (error) {
    postMessage({ type: 'error', message: error?.message || String(error) });
  }
};
