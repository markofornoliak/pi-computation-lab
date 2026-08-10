'use strict';

const PI_PREFIX = '3.14159265358979323846264338327950288419716939937510';

const $ = (id) => document.getElementById(id);
const digitsInput = $('digits');
const startButton = $('start');
const stopButton = $('stop');
const copyButton = $('copy');
const saveButton = $('save');
const bar = $('bar');
const status = $('status');
const percent = $('percent');
const time = $('time');
const speed = $('speed');
const threads = $('threads');
const terms = $('terms');
const output = $('output');

let worker = null;
let cancelled = false;
let started = 0;
let timer = 0;
let result = '';
let targetDigits = 0;

const format = (n) => Number(n).toLocaleString('en-US');

function updateProgress(value, label) {
  const p = Math.max(0, Math.min(100, Number(value) || 0));
  bar.style.width = `${p}%`;
  percent.textContent = `${p.toFixed(p < 10 ? 1 : 0)}%`;
  if (label) status.textContent = label;
}

function setBusy(busy) {
  startButton.disabled = busy;
  stopButton.disabled = !busy;
  digitsInput.disabled = busy;
}

function stopWorker() {
  if (worker) worker.terminate();
  worker = null;
  clearInterval(timer);
}

function fail(message) {
  stopWorker();
  setBusy(false);
  status.textContent = 'Error';
  output.textContent = message;
}

function preview(text) {
  if (text.length <= 16000) return text;
  return `${text.slice(0, 8000)}\n\n…\n\n${text.slice(-8000)}`;
}

function calculate(digits) {
  return new Promise((resolve, reject) => {
    worker = new Worker('worker.js');

    worker.onmessage = (event) => {
      if (cancelled) return;
      const data = event.data;

      if (data.type === 'progress') {
        updateProgress(data.progress, data.label);
        return;
      }

      if (data.type === 'done') {
        resolve(data.result);
        return;
      }

      if (data.type === 'error') {
        reject(new Error(data.message));
      }
    };

    worker.onerror = (event) => {
      reject(new Error(event.message || 'Calculation worker failed.'));
    };

    worker.postMessage({ type: 'calculate', digits });
  });
}

startButton.addEventListener('click', async () => {
  const digits = Number(digitsInput.value);

  if (!Number.isSafeInteger(digits) || digits < 1) {
    output.textContent = 'Enter a positive integer.';
    return;
  }

  if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
    output.textContent = 'This browser does not support the required WebAssembly features.';
    return;
  }

  cancelled = false;
  result = '';
  targetDigits = digits;
  setBusy(true);
  copyButton.disabled = true;
  saveButton.disabled = true;
  updateProgress(0, 'Starting');
  output.textContent = 'Computing…';
  speed.textContent = '0 digits/s';
  threads.textContent = '1';
  terms.textContent = 'GMP/MPFR';
  started = performance.now();

  clearInterval(timer);
  timer = setInterval(() => {
    const seconds = (performance.now() - started) / 1000;
    time.textContent = `${seconds.toFixed(3)} s`;
    const p = parseFloat(percent.textContent) || 0;
    const estimated = targetDigits * (p / 100);
    speed.textContent = `${format(Math.round(estimated / Math.max(seconds, 0.001)))} digits/s`;
  }, 100);

  try {
    const pi = await calculate(digits);
    if (cancelled) return;

    if (!pi.startsWith(PI_PREFIX.slice(0, Math.min(PI_PREFIX.length, pi.length)))) {
      throw new Error('Verification failed.');
    }

    result = pi;
    const seconds = (performance.now() - started) / 1000;
    stopWorker();
    time.textContent = `${seconds.toFixed(3)} s`;
    speed.textContent = `${format(Math.round(digits / Math.max(seconds, 0.001)))} digits/s`;
    updateProgress(100, 'Done');
    output.textContent = preview(pi);
    copyButton.disabled = false;
    saveButton.disabled = false;
    setBusy(false);
  } catch (error) {
    if (!cancelled) {
      const message = String(error?.message || error);
      if (/memory|allocation|out of bounds|grow/i.test(message)) {
        fail(`Browser memory limit reached at ${format(digits)} digits.`);
      } else {
        fail(message);
      }
    }
  }
});

stopButton.addEventListener('click', () => {
  cancelled = true;
  stopWorker();
  setBusy(false);
  status.textContent = 'Stopped';
  output.textContent = 'Stopped.';
});

copyButton.addEventListener('click', async () => {
  if (!result) return;
  try {
    await navigator.clipboard.writeText(result);
    copyButton.textContent = 'Copied';
    setTimeout(() => { copyButton.textContent = 'Copy'; }, 900);
  } catch {
    output.textContent = preview(result);
  }
});

saveButton.addEventListener('click', () => {
  if (!result) return;
  const blob = new Blob([result, '\n'], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pi-${targetDigits}-digits.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
