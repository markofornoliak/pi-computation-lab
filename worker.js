'use strict';

const BUILD = 'v6';
const GMP_URL = 'https://cdn.jsdelivr.net/npm/gmp-wasm@1.3.2/dist/index.umd.min.js';
const LOG2_10 = Math.log2(10);
let enginePromise = null;

async function loadEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      importScripts(GMP_URL);
      if (!self.gmp || typeof self.gmp.init !== 'function') {
        throw new Error('GMP WebAssembly engine failed to load.');
      }
      return self.gmp.init();
    })();
  }
  return enginePromise;
}

function precisionBitsForDigits(digits) {
  return Math.ceil((digits + 16) * LOG2_10);
}

async function calculatePi(digits) {
  postMessage({ type: 'progress', progress: 3, label: 'Loading GMP' });

  const { getContext } = await loadEngine();
  postMessage({ type: 'ready', engine: `GMP/MPFR ${BUILD}` });

  const precisionBits = precisionBitsForDigits(digits);
  const ctx = getContext({ precisionBits });

  try {
    postMessage({ type: 'progress', progress: 15, label: 'Computing π' });
    const pi = ctx.Pi();

    postMessage({ type: 'progress', progress: 82, label: 'Formatting' });
    const result = pi.toFixed(digits, 10);

    postMessage({ type: 'progress', progress: 98, label: 'Finalizing' });
    return result;
  } finally {
    ctx.destroy();
  }
}

onmessage = async (event) => {
  try {
    if (event.data?.type !== 'calculate') return;

    const digits = Number(event.data.digits);
    if (!Number.isSafeInteger(digits) || digits < 1) {
      throw new RangeError('Invalid precision.');
    }

    const result = await calculatePi(digits);
    postMessage({ type: 'done', result });
  } catch (error) {
    postMessage({ type: 'error', message: error?.message || String(error) });
  }
};
