"use strict";

// ---- vocab-ai.js ----
// Thin client for this app's live, per-learner AI feature - Orbit's shared
// Cloudflare Worker's /vocab-ai path (see that repo's
// cloudflare-worker/orbit-worker.js). An on-demand, per-request feature
// that needs to know THIS learner's own current data, unlike the offline
// batch-generated data/ai_signals.json (scripts/generate_ai_signals.py)
// already loaded once at startup and shown in the quiz feedback panel
// (app.js's renderAnswerFeedback):
//   - a personalized mnemonic targeted at a word's own recorded
//     wrong-answer pattern (kind: "mnemonic") - see app.js's 複習
//     word-card "🪄 AI 記憶法" button.
//
// This module only talks to the Worker - it has no DOM of its own. Unlike
// sync.js (a self-contained feature with its own fixed panel in
// index.html), the button that calls this lives inside app.js's own
// re-rendered 複習 list, which already owns event delegation for its
// dynamically-rebuilt HTML - there is nothing here for a fixed
// getElementById wiring pass to attach to, so app.js calls straight into
// the function exposed below.
//
// Same PROXY_URL placeholder mechanism as sync.js - see that file's
// top-of-file comment for the full explanation. Reuses the exact same
// deployed Worker and GitHub Actions variable (PROXY_URL) as sync.js's own
// VOCAB_SYNC_PROXY_URL; only the path differs. .github/workflows/pages.yml
// substitutes this placeholder in both files at build time.
//
// Named differently from sync.js's own raw placeholder constant (not just
// PROXY_URL) on purpose: both files load as plain classic <script> tags in
// the same page, sharing one global lexical scope - two `const PROXY_URL`
// top-level declarations across sibling scripts throws a page-breaking
// SyntaxError ("has already been declared") the moment the second script
// evaluates, silently killing every feature after it, not just this one.
const VOCAB_AI_PROXY_BASE = "__PROXY_URL__";
const VOCAB_AI_URL =
  VOCAB_AI_PROXY_BASE && !VOCAB_AI_PROXY_BASE.startsWith("__")
    ? `${VOCAB_AI_PROXY_BASE.replace(/\/+$/, "")}/vocab-ai`
    : VOCAB_AI_PROXY_BASE;

function isVocabAiConfigured() {
  return !!VOCAB_AI_URL && !VOCAB_AI_URL.startsWith("__");
}

// Same shape as sync.js's own proxyErrorMessage - a 429 here means this
// app's own vocab-ai:* rate-limit bucket (see the Worker's
// VOCAB_AI_RATE_LIMIT), independent of /gemini's or /vocab-sync's own.
async function vocabAiErrorMessage(response) {
  if (response.status === 429) return "請求過於頻繁，請稍後再試。";
  const errorJson = await response.json().catch(() => ({}));
  return errorJson.error?.message || response.statusText || `HTTP ${response.status}`;
}

async function callVocabAi(body) {
  if (!isVocabAiConfigured()) return { ok: false, error: "AI 功能尚未設定，請聯絡開發者。" };
  if (!navigator.onLine) return { ok: false, error: "目前沒有網路連線，無法使用 AI 功能。" };
  let response;
  try {
    response = await fetch(VOCAB_AI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (networkError) {
    return { ok: false, error: `無法連線至 AI 服務：${networkError.message}` };
  }
  if (!response.ok) return { ok: false, error: await vocabAiErrorMessage(response) };
  return { ok: true, data: await response.json() };
}

// `wrongAnswers` should be the word's own recently-recorded incorrect
// attempts (see Logic.computeWordDetail's recentWrongAnswers) - this is
// what makes the hook "personalized": built from what THIS learner actually
// typed wrong, not a generic hint every learner sees the same way (see
// data/ai_signals.json's offline-generated one for that).
async function generateMnemonic({ word, pos, meaning, wrongAnswers }) {
  const result = await callVocabAi({
    kind: "mnemonic",
    word: word,
    pos: pos || "",
    meaning: meaning || "",
    wrongAnswers: Array.isArray(wrongAnswers) ? wrongAnswers : [],
  });
  if (!result.ok) return result;
  const mnemonic = typeof result.data?.mnemonic === "string" ? result.data.mnemonic.trim() : "";
  if (!mnemonic) return { ok: false, error: "AI 沒有回傳有效的記憶法，請稍後再試一次。" };
  return { ok: true, mnemonic };
}

window.VocabAi = {
  isConfigured: isVocabAiConfigured,
  generateMnemonic: generateMnemonic,
};
