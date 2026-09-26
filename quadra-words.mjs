// Quadra Words (四方單字): what this app does in the Quadra ecosystem, apart
// from its own sync (sync.js). Loaded as a module after the classic scripts.
//
//   - Home-screen only on phones, and always the newest deploy (quadra.mjs).
//   - Study rewards: every right answer and every word mastered for the
//     first time earns play money for the Quadra Pass's shared pool, where
//     Quadra Securities and Quadra Sportsbook can spend it
//     (ECONOMY.vocab: NT$2 a right answer, NT$20 a newly mastered word, at
//     most NT$800 a Taiwan day). Earned money waits on this device until it
//     reaches the pass (or until there is one), then goes as one entry per
//     batch with a fixed id, so it's never paid twice.
//   - The pass box on the progress tab: the pool, today's rewards, the
//     other apps, upgrading an old passcode, the merge tool.
import { APPS, ECONOMY, formatPass, installGate, watchUpdates, poolBalance, randomId } from './quadra.mjs';

const zh = () => (window.I18n?.getLocale?.() || document.documentElement.lang || 'zh').startsWith('zh');
const lang = () => (zh() ? 'zh' : 'en');

installGate('vocab', lang());
watchUpdates({ current: document.querySelector('meta[name="build-version"]')?.content, key: 'vocab', busy: () => Boolean(document.querySelector('#view-test.active') && !document.getElementById('test-form')?.classList.contains('hidden')) });

const KEY = 'quadra.words.rewards';
const TPE = 8 * 3_600_000;
const today = () => new Date(Date.now() + TPE).toISOString().slice(0, 10);

function load() {
  try {
    const r = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (r && typeof r === 'object') return { day: r.day || today(), earned: r.earned || 0, pending: Array.isArray(r.pending) ? r.pending : [], open: r.open || null, mastered: r.mastered || {}, total: r.total || 0 };
  } catch {}
  return { day: today(), earned: 0, pending: [], open: null, mastered: {}, total: 0 };
}
let rewards = load();
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(rewards));
  } catch {}
}

// This device's words mastered before rewards existed don't pay (only a
// first mastery from now on does): recorded once, the first time.
function seedMastered() {
  if (rewards.seeded) return;
  const progress = window.VocabState?.getProgress?.() || {};
  for (const [key, h] of Object.entries(progress)) if (window.Logic?.classifyState?.(h) === 'memorized') rewards.mastered[key] = 1;
  rewards.seeded = true;
  save();
}

// One answer: `before` and `after` are the word's state around it.
function onAnswer(word, correct, before, after) {
  seedMastered();
  if (rewards.day !== today()) rewards = { ...rewards, day: today(), earned: 0 };
  const cap = ECONOMY.vocab.dailyCap;
  let amount = correct ? ECONOMY.vocab.perCorrect : 0;
  const key = String(word || '').toLowerCase();
  if (after === 'memorized' && before !== 'memorized' && !rewards.mastered[key]) {
    rewards.mastered[key] = 1;
    amount += ECONOMY.vocab.perMastered;
  }
  amount = Math.max(0, Math.min(amount, cap - rewards.earned));
  if (!amount) return save();
  rewards.earned += amount;
  rewards.total += amount;
  // Answers add up in an open batch; it's closed (and sent) at the end of a
  // round, after 25 answers' worth, or when the app goes to the background.
  rewards.open = rewards.open || { id: `vocab:${randomId()}`, t: Date.now(), amount: 0, n: 0 };
  rewards.open.amount += amount;
  rewards.open.n++;
  save();
  if (rewards.open.n >= 25) flush();
  else renderBox();
}

function closeBatch() {
  if (!rewards.open?.amount) return;
  const b = rewards.open;
  rewards.pending.push({ id: b.id, t: b.t, app: 'vocab', kind: 'reward', amount: b.amount, note: zh() ? `${b.n} 題` : `${b.n} answers` });
  rewards.open = null;
  save();
}

let wallet = null;
let sending = false;
async function flush() {
  closeBatch();
  const pass = window.VocabSync?.getPasscode?.();
  const base = window.VocabSync?.proxyBase?.();
  if (sending || !base || !window.VocabSync?.isQuadraPass?.(pass) || !navigator.onLine) return renderBox();
  sending = true;
  try {
    const entries = rewards.pending.slice(0, 500);
    const res = await fetch(`${base}/eco?passcode=${encodeURIComponent(pass)}&app=vocab`, {
      method: entries.length ? 'PATCH' : 'GET',
      headers: entries.length ? { 'Content-Type': 'application/json' } : {},
      body: entries.length ? JSON.stringify({ wallet: { entries } }) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && (data.wallet || data.exists === false)) {
      wallet = data.wallet || null;
      const sent = new Set(entries.map(e => e.id));
      rewards.pending = rewards.pending.filter(e => !sent.has(e.id));
      save();
    }
  } catch {
  } finally {
    sending = false;
    renderBox();
  }
}

const money = v => `NT$${Math.round(v).toLocaleString('en-US')}`;
const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of children) if (c) node.append(c);
  return node;
};

function renderBox() {
  const box = document.getElementById('quadra-words');
  if (!box) return;
  const z = zh();
  const pass = window.VocabSync?.getPasscode?.() || '';
  const onPass = window.VocabSync?.isQuadraPass?.(pass);
  const waiting = rewards.pending.reduce((s, e) => s + e.amount, 0) + (rewards.open?.amount || 0);
  const earnedToday = rewards.day === today() ? rewards.earned : 0;
  const rows = [
    el('p', { className: 'quadra-words-lede', textContent: z ? `答對一題 ${money(ECONOMY.vocab.perCorrect)}、第一次熟記一個字 ${money(ECONOMY.vocab.perMastered)}，每天最多 ${money(ECONOMY.vocab.dailyCap)}，存進四方通行碼的共用資金池：在四方證券買股票、在四方運彩下注都能用。` : `${money(ECONOMY.vocab.perCorrect)} a right answer and ${money(ECONOMY.vocab.perMastered)} for each word mastered the first time, up to ${money(ECONOMY.vocab.dailyCap)} a day, into your Quadra Pass's shared money pool: spend it on stocks in Quadra Securities or bets in Quadra Sportsbook.` }),
    el('div', { className: 'quadra-words-stats' }, [
      el('div', {}, [el('small', { textContent: z ? '今天的獎勵' : 'Today' }), el('strong', { textContent: `${money(earnedToday)} / ${money(ECONOMY.vocab.dailyCap)}` })]),
      el('div', {}, [el('small', { textContent: z ? '累計獎勵' : 'All time' }), el('strong', { textContent: money(rewards.total) })]),
      onPass && wallet ? el('div', {}, [el('small', { textContent: z ? '資金池' : 'Money pool' }), el('strong', { textContent: money(poolBalance(wallet)) })]) : null
    ]),
    waiting > 0 ? el('p', { className: 'hint', textContent: onPass ? (z ? `${money(waiting)} 等待送出…` : `${money(waiting)} on its way…`) : z ? `${money(waiting)} 的獎勵存在這台裝置，建立或輸入四方通行碼後就會存進資金池。` : `${money(waiting)} of rewards is kept on this device until you create or enter a Quadra Pass.` }) : null,
    onPass ? el('p', { className: 'hint', textContent: `${z ? '四方通行碼' : 'Quadra Pass'}：${formatPass(pass)}` }) : null
  ];
  if (pass && !onPass) {
    const up = el('button', { className: 'btn primary', type: 'button', textContent: z ? '升級成四方通行碼' : 'Upgrade to a Quadra Pass' });
    up.onclick = async () => {
      up.disabled = true;
      const r = await window.VocabSync.upgradeToPass();
      up.disabled = false;
      alert(r.ok ? (z ? `新的四方通行碼：${formatPass(r.passcode)}。舊密碼已作廢，請在其他裝置改用新碼。` : `Your new Quadra Pass: ${formatPass(r.passcode)}. The old passcode no longer works; use the new one on your other devices.`) : `${z ? '升級失敗' : 'Upgrade failed'}: ${r.error || ''}`);
      flush();
    };
    rows.push(el('p', { className: 'hint', textContent: z ? '你用的是舊的 16 碼同步密碼，只有這個 App 能用，也收不到學習獎勵。升級後四個 App 都能用。' : 'This is an old 16-character passcode: it only works here and can\'t receive rewards. Upgrade to use it in all four apps.' }), el('div', { className: 'row actions' }, [up]));
  }
  rows.push(
    el('div', { className: 'quadra-apps' }, Object.entries(APPS).filter(([id]) => id !== 'vocab').map(([, app]) => el('a', { className: 'quadra-app', href: app.path }, [el('img', { src: `${app.path}favicon.svg`, alt: '' }), el('span', { textContent: z ? app.zh : app.en })]))),
    el('p', { className: 'hint' }, [el('a', { href: `${APPS.stock.path}merge.html`, textContent: z ? '合併工具（把所有舊代碼合成一組四方通行碼）' : 'Merge tool (all your old codes into one Quadra Pass)' })])
  );
  box.replaceChildren(el('h3', { className: 'quadra-words-title', textContent: z ? '💰 學習獎勵' : '💰 Study rewards' }), ...rows.filter(Boolean));
}

window.QuadraWords = { onAnswer, flush, render: renderBox };
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
  else flush();
});
window.addEventListener('online', flush);
renderBox();
setTimeout(flush, 3000);
