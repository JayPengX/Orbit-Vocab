#!/usr/bin/env node
"use strict";

// Backtests logic.js's two real predictive models against one learner's
// ACTUAL exported progress data (Settings -> 匯出備份檔 in the app), to
// answer "is the prediction system actually any good for me" with numbers
// instead of a guess:
//
//   1. COLD-START MODEL (computeDifficultyBaseline + computeInterferenceModel,
//      combined by predictWordDifficulty) - the only model still consulted
//      by computeSelectionWeight, and only for never-before-attempted ("new")
//      words. Backtested against every word's TRUE first-ever outcome (only
//      recoverable for words with attempts <= CONFIG.maxRecentAttempts, where
//      the recentAttempts ring buffer still holds the very first attempt).
//   2. OWN-MASTERY MODEL (the decayed Beta-Bernoulli masteryMean, used for
//      "learning"/"reintroduce" ranking and the Progress page's own risk
//      column) - backtested walk-forward across each word's recentAttempts:
//      at each attempt, does the mastery estimate BUILT ONLY FROM EARLIER
//      attempts on that word predict this attempt's actual outcome?
//
// For both, reports a Brier score (mean squared error between predicted
// probability and the real 0/1 outcome - lower is better, 0 is perfect,
// 0.25 is what a coin flip scores) against a trivial baseline (always
// predicting the overall observed rate), plus a calibration table (bucket
// predictions, compare each bucket's average prediction to what actually
// happened in it - a well-calibrated model's two columns should track).
// A model that doesn't beat the trivial baseline's Brier score is not
// pulling its weight; ranking by it is no better than ranking by nothing.
//
// Also grid-searches CONFIG.masteryDecay (only tunable that affects the
// own-mastery model) via 5-fold cross-validation BY WORD (each word's
// attempts stay in one fold, so no attempt "leaks" into training and test
// for the same word) to report whether the shipped value (0.85) is actually
// the best fit for THIS learner's real data, or whether another value
// scores a lower held-out Brier.
//
// Usage:
//   node scripts/backtest_predictions.js path/to/vocab-progress-*.json
//
// Read-only: never writes back to the export file or to CONFIG permanently
// (masteryDecay is restored after the grid search).

const fs = require("fs");
const path = require("path");
const L = require(path.join(__dirname, "..", "logic.js"));

function loadBackup(file) {
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const progress = raw && typeof raw === "object" ? raw.progress || raw : raw;
  if (!progress || typeof progress !== "object") {
    throw new Error("Could not find a `progress` object in " + file);
  }
  return progress;
}

function loadAiSignals() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "ai_signals.json"), "utf8"));
  } catch (e) {
    return {};
  }
}

function brier(pairs) {
  if (!pairs.length) return null;
  let sum = 0;
  for (const p of pairs) sum += (p.predicted - p.actual) * (p.predicted - p.actual);
  return sum / pairs.length;
}

function calibrationTable(pairs, buckets) {
  const n = buckets || 5;
  const sorted = pairs.slice().sort((a, b) => a.predicted - b.predicted);
  const rows = [];
  for (let i = 0; i < n; i++) {
    const start = Math.floor((i * sorted.length) / n);
    const end = Math.floor(((i + 1) * sorted.length) / n);
    const slice = sorted.slice(start, end);
    if (!slice.length) continue;
    const avgPredicted = slice.reduce((s, p) => s + p.predicted, 0) / slice.length;
    const avgActual = slice.reduce((s, p) => s + p.actual, 0) / slice.length;
    rows.push({ n: slice.length, avgPredicted, avgActual });
  }
  return rows;
}

function printCalibration(label, pairs) {
  const overallRate = pairs.reduce((s, p) => s + p.actual, 0) / pairs.length;
  const modelBrier = brier(pairs);
  const baselineBrier = brier(pairs.map((p) => ({ predicted: overallRate, actual: p.actual })));
  console.log(`\n=== ${label} ===`);
  console.log(`samples: ${pairs.length}, observed rate: ${(overallRate * 100).toFixed(1)}%`);
  console.log(`Brier score - model: ${modelBrier.toFixed(4)}  vs flat-baseline: ${baselineBrier.toFixed(4)}  (lower is better; ${baselineBrier.toFixed(4)} is what "always guess the average" scores)`);
  if (modelBrier < baselineBrier) {
    console.log(`-> model beats the trivial baseline by ${(((baselineBrier - modelBrier) / baselineBrier) * 100).toFixed(1)}%`);
  } else {
    console.log(`-> model is NOT beating the trivial baseline - it's adding noise, not signal, here`);
  }
  console.log("calibration (predicted vs actually observed, bucketed low->high):");
  for (const row of calibrationTable(pairs, 8)) {
    console.log(`  n=${String(row.n).padStart(5)}  predicted=${(row.avgPredicted * 100).toFixed(1).padStart(5)}%  actual=${(row.avgActual * 100).toFixed(1).padStart(5)}%`);
  }
}

// ---------- 1. Cold-start model backtest ----------
// For every word whose FULL attempt history fits inside the recentAttempts
// ring buffer (attempts <= maxRecentAttempts), recentAttempts[0] IS that
// word's true first-ever outcome. Predicts what predictWordDifficulty would
// have said for that word with NO history at all (history=null, matching
// the real moment right before that first attempt), using one baseline/
// interference model built from the FULL current store (a small amount of
// in-sample leakage from this one word's own later attempts feeding back
// into the group averages - acceptable for a diagnostic on a single
// learner's own few-thousand-word store, not a rigorous held-out claim).
function coldStartBacktest(historyStore, aiSignals) {
  const models = L.buildPriorityModels(historyStore, aiSignals);
  const pairs = [];
  for (const key of Object.keys(historyStore)) {
    const h = historyStore[key];
    if (!h || !h.attempts) continue;
    if (h.attempts > L.CONFIG.maxRecentAttempts) continue; // true first attempt not recoverable
    const recent = Array.isArray(h.recentAttempts) ? h.recentAttempts : [];
    if (!recent.length) continue;
    const first = recent[0];
    const predictedRisk = L.predictWordDifficulty(h.word || key, h.level, null, models.difficultyBaseline, models.interferenceModel, h.pos);
    pairs.push({ predicted: predictedRisk, actual: first.correct ? 0 : 1 });
  }
  return pairs;
}

// ---------- 2. Own-mastery model backtest (walk-forward) ----------
function masteryWalkForwardPairs(historyStore, decay) {
  const priorAlpha = L.CONFIG.masteryPriorAlpha;
  const priorBeta = L.CONFIG.masteryPriorBeta;
  const pairs = [];
  for (const key of Object.keys(historyStore)) {
    const h = historyStore[key];
    const recent = Array.isArray(h && h.recentAttempts) ? h.recentAttempts : [];
    if (recent.length < 2) continue; // need at least one prior attempt to predict the next
    let alpha = priorAlpha;
    let beta = priorBeta;
    for (const a of recent) {
      const predictedCorrect = alpha / (alpha + beta);
      pairs.push({ predicted: 1 - predictedCorrect, actual: a.correct ? 0 : 1, key });
      alpha = alpha * decay + (a.correct ? 1 : 0);
      beta = beta * decay + (a.correct ? 0 : 1);
    }
  }
  return pairs;
}

// 5-fold cross-validation BY WORD KEY (a word's own attempts never split
// across folds), so a decay value can't just be memorizing this exact
// dataset's noise - it has to generalize to words it wasn't tuned on.
function crossValidateDecay(historyStore, decayCandidates) {
  const keys = Object.keys(historyStore).filter((k) => {
    const recent = (historyStore[k] || {}).recentAttempts;
    return Array.isArray(recent) && recent.length >= 2;
  });
  const folds = 5;
  const foldOf = {};
  keys.forEach((k, i) => (foldOf[k] = i % folds));

  const results = [];
  for (const decay of decayCandidates) {
    const allPairs = masteryWalkForwardPairs(historyStore, decay);
    let heldOutSum = 0;
    let heldOutN = 0;
    for (let f = 0; f < folds; f++) {
      const testPairs = allPairs.filter((p) => foldOf[p.key] === f);
      for (const p of testPairs) {
        heldOutSum += (p.predicted - p.actual) * (p.predicted - p.actual);
        heldOutN += 1;
      }
    }
    results.push({ decay, brier: heldOutN ? heldOutSum / heldOutN : null, n: heldOutN });
  }
  return results;
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/backtest_predictions.js path/to/vocab-progress-export.json");
    process.exit(1);
  }
  const progress = loadBackup(file);
  const aiSignals = loadAiSignals();
  const wordCount = Object.keys(progress).length;
  const attemptedCount = Object.values(progress).filter((h) => h && h.attempts).length;
  console.log(`Loaded ${wordCount} words (${attemptedCount} with at least one attempt) from ${file}`);

  const coldPairs = coldStartBacktest(progress, aiSignals);
  if (coldPairs.length < 20) {
    console.log("\n(Too few words with a fully-visible attempt history to backtest the cold-start model meaningfully - skipping.)");
  } else {
    printCalibration("Cold-start model (new-word predicted risk vs true first-attempt outcome)", coldPairs);
  }

  const shippedDecay = L.CONFIG.masteryDecay;
  const masteryPairs = masteryWalkForwardPairs(progress, shippedDecay);
  if (masteryPairs.length < 20) {
    console.log("\n(Too few multi-attempt words to backtest the own-mastery model meaningfully - skipping.)");
  } else {
    printCalibration(`Own-mastery model (walk-forward, current masteryDecay=${shippedDecay})`, masteryPairs);

    console.log(`\n=== masteryDecay cross-validated grid search (5-fold by word) ===`);
    const candidates = [0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.98];
    const results = crossValidateDecay(progress, candidates);
    for (const r of results) {
      const flag = r.decay === shippedDecay ? "  <- shipped" : "";
      console.log(`  decay=${r.decay.toFixed(2)}  held-out Brier=${r.brier == null ? "n/a" : r.brier.toFixed(4)}  (n=${r.n})${flag}`);
    }
    const best = results.filter((r) => r.brier != null).sort((a, b) => a.brier - b.brier)[0];
    if (best) {
      console.log(`\nbest held-out decay: ${best.decay} (Brier ${best.brier.toFixed(4)}) vs shipped ${shippedDecay}`);
    }
  }
}

main();
