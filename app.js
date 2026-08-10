'use strict';

const DIGITS_PER_TERM = 14.181647462725477;
const GUARD = 24;
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

let workers = [];
let finalizer = null;
let cancelled = false;
let started = 0;
let timer = 0;
let result = '';
let targetDigits = 0;

const format = (n) => Number(n).toLocaleString('en-US');

function chooseWorkers(termCount) {
  const hardware = Math.max(1, navigator.hardwareConcurrency || 2);
  const cap = Math.min(8, hardware);
  if (termCount < 200) return 1;
  if (termCount < 2000) return Math.min(2, cap);
  if (termCount < 10000) return Math.min(4, cap);
  return cap;
}

function ranges(total, count) {
  const result = [];
  let a = 0;
  for (let i = 0; i < count; i++) {
    const b = Math.floor((total * (i + 1)) / count);
    if (b > a) result.push([a, b]);
    a = b;
  }
  return result;
}

function updateProgress(value, label) {
  const p = Math.max(0, Math.min(100, value));
  bar.style.width = `${p}%`;
  percent.textContent = `${p.toFixed(p < 10 ? 1 : 0)}%`;
  if (label) status.textContent = label;
}

function setBusy(busy) {
  startButton.disabled = busy;
  stopButton.disabled = !busy;
  digitsInput.disabled = busy;
}

function stopAll() {
  workers.forEach((worker) => worker.terminate());
  workers = [];
  if (finalizer) finalizer.terminate();
  finalizer = null;
  clearInterval(timer);
}

function fail(message) {
  stopAll();
  setBusy(false);
  status.textContent = 'Error';
  output.textContent = message;
}

function preview(text) {
  if (text.length <= 16000) return text;
  return `${text.slice(0, 8000)}\n\n…\n\n${text.slice(-8000)}`;
}

async function calculate(digits) {
  if (typeof Worker === 'undefined' || typeof BigInt === 'undefined') {
    throw new Error('This browser does not support the required JavaScript features.');
  }

  const termCount = Math.floor((digits + GUARD) / DIGITS_PER_TERM) + 1;
  const workerCount = Math.min(chooseWorkers(termCount), termCount);
  const taskCount = Math.min(termCount, Math.max(workerCount, workerCount * 8));
  const chunks = ranges(termCount, taskCount);
  const partials = new Array(chunks.length);
  let completed = 0;
  let nextTask = 0;
  let settled = false;

  threads.textContent = workerCount;
  terms.textContent = format(termCount);

  return new Promise((resolve, reject) => {
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const finish = () => {
      workers.forEach((item) => item.terminate());
      workers = [];

      finalizer = new Worker('worker.js');
      finalizer.onmessage = (event) => {
        if (cancelled || settled) return;
        const data = event.data;

        if (data.type === 'phase') {
          updateProgress(data.progress, data.label);
          return;
        }

        if (data.type === 'done') {
          settled = true;
          resolve(data.result);
          return;
        }

        if (data.type === 'error') rejectOnce(new Error(data.message));
      };

      finalizer.onerror = () => rejectOnce(new Error('Final worker failed.'));
      finalizer.postMessage({ type: 'finalize', partials, digits, guard: GUARD });
    };

    const dispatch = (worker) => {
      if (nextTask >= chunks.length) return;
      const id = nextTask++;
      const [a, b] = chunks[id];
      worker.postMessage({ type: 'chunk', id, a, b });
    };

    for (let i = 0; i < workerCount; i++) {
      const worker = new Worker('worker.js');
      workers.push(worker);

      worker.onmessage = (event) => {
        if (cancelled || settled) return;
        const data = event.data;

        if (data.type === 'error') {
          rejectOnce(new Error(data.message));
          return;
        }

        if (data.type !== 'chunkDone') return;

        partials[data.id] = data.result;
        completed++;
        updateProgress((completed / chunks.length) * 90, 'Calculating');

        if (completed === chunks.length) finish();
        else dispatch(worker);
      };

      worker.onerror = () => rejectOnce(new Error('Worker failed.'));
      dispatch(worker);
    }
  });
}

startButton.addEventListener('click', async () => {
  const digits = Number(digitsInput.value);
  if (!Number.isSafeInteger(digits) || digits < 1) {
    output.textContent = 'Enter a positive integer.';
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
  started = performance.now();

  clearInterval(timer);
  timer = setInterval(() => {
    const seconds = (performance.now() - started) / 1000;
    time.textContent = `${seconds.toFixed(3)} s`;
    const p = parseFloat(percent.textContent) || 0;
    const estimated = digits * (p / 100);
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
    stopAll();
    time.textContent = `${seconds.toFixed(3)} s`;
    speed.textContent = `${format(Math.round(digits / Math.max(seconds, 0.001)))} digits/s`;
    updateProgress(100, 'Done');
    output.textContent = preview(pi);
    copyButton.disabled = false;
    saveButton.disabled = false;
    setBusy(false);
  } catch (error) {
    if (!cancelled) fail(error?.message || String(error));
  }
});

stopButton.addEventListener('click', () => {
  cancelled = true;
  stopAll();
  setBusy(false);
  status.textContent = 'Stopped';
  output.textContent = 'Stopped.';
});

copyButton.addEventListener('click', async () => {
  if (!result) return;
  await navigator.clipboard.writeText(result);
  copyButton.textContent = 'Copied';
  setTimeout(() => { copyButton.textContent = 'Copy'; }, 900);
});

saveButton.addEventListener('click', () => {
  if (!result) return;
  const blob = new Blob([result + '\n'], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pi-${targetDigits}-digits.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
