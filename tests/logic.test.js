"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../logic.js");

/* ---------- helpers ---------- */

// Deterministic PRNG for reproducible shuffles in tests.
function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function makeWord(word, level) {
  return { id: word, word: word, pos: "n.", level: level, zh: "測試" };
}

function makePool(count, level, prefix) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(makeWord(`${prefix || "w"}${i}`, level));
  return out;
}

// Plays out N attempts against a fresh history for a word.
function play(history, results) {
  let t = 1000;
  for (const r of results) {
    t += 1000;
    L.recordAttempt(history, {
      correct: r.correct,
      responseMs: r.responseMs,
      answer: r.answer,
      timestamp: t,
      level: 4,
      length: history.length,
    });
  }
  return history;
}

/* ================= Recording: correctness, response time, length, attempts, wrong answers ================= */

test("recordAttempt tracks correct/incorrect, response time, length, attempt number and the typed wrong answer", () => {
  const h = L.createEmptyWordHistory("extraordinary", 6, 13);
  L.recordAttempt(h, { correct: true, responseMs: 2200, timestamp: 5000, level: 6, length: 13 });
  assert.equal(h.attempts, 1);
  assert.equal(h.correct, 1);
  assert.equal(h.incorrect, 0);
  assert.equal(h.length, 13);
  assert.equal(h.level, 6);
  assert.equal(h.recentResponseMs, 2200);
  assert.equal(h.recentAttempts[0].attemptNumber, 1);
  assert.equal(h.recentAttempts[0].responseMs, 2200);
  assert.equal(h.lastResult, "correct");
  assert.equal(h.lastWrongAnswer, null);

  L.recordAttempt(h, { correct: false, responseMs: 900, timestamp: 6000, level: 6, length: 13, answer: "extrordinary" });
  assert.equal(h.attempts, 2);
  assert.equal(h.incorrect, 1);
  assert.equal(h.recentAttempts[1].attemptNumber, 2);
  assert.equal(h.lastResult, "incorrect");
  assert.equal(h.lastWrongAnswer, "extrordinary", "the exact mistyped answer should be recorded");
  assert.equal(h.recentAttempts[1].answer, "extrordinary");
});

test("a correct attempt does not store an 'answer' in the ring buffer (it's trivially the word itself)", () => {
  const h = L.createEmptyWordHistory("cat", 4, 3);
  L.recordAttempt(h, { correct: true, responseMs: 500, timestamp: 1000, answer: "cat" });
  assert.equal(h.recentAttempts[0].answer, undefined);
});

test("recordAttempt handles multiple attempts and caps the detailed ring buffer without losing aggregate counts", () => {
  const h = L.createEmptyWordHistory("run", 4, 3);
  for (let i = 0; i < 30; i++) {
    L.recordAttempt(h, { correct: i % 3 !== 0, responseMs: 800 + i, timestamp: 1000 + i, level: 4, length: 3, answer: i % 3 !== 0 ? undefined : "rnu" });
  }
  assert.equal(h.attempts, 30, "aggregate attempt count is never capped");
  assert.ok(h.recentAttempts.length <= L.CONFIG.maxRecentAttempts, "detailed history is capped for storage");
  assert.equal(h.recentAttempts[h.recentAttempts.length - 1].attemptNumber, 30, "ring buffer keeps the most recent attempts");
});

test("recordAttempt tracks incorrectStreak: grows on consecutive misses, resets to 0 on any correct answer", () => {
  const h = L.createEmptyWordHistory("miss", 4, 4);
  L.recordAttempt(h, { correct: false, timestamp: 1000, level: 4, length: 4 });
  assert.equal(h.incorrectStreak, 1);
  L.recordAttempt(h, { correct: false, timestamp: 2000, level: 4, length: 4 });
  assert.equal(h.incorrectStreak, 2);
  L.recordAttempt(h, { correct: false, timestamp: 3000, level: 4, length: 4 });
  assert.equal(h.incorrectStreak, 3);
  L.recordAttempt(h, { correct: true, timestamp: 4000, level: 4, length: 4 });
  assert.equal(h.incorrectStreak, 0, "a correct answer resets the miss streak, even after a long run of misses");
});

/* ================= State classification: simple streak model ================= */

test("brand new (unattempted) word is state 'new'", () => {
  const h = L.createEmptyWordHistory("never-tested", 4, 12);
  assert.equal(L.classifyState(h), "new");
});

test("a wrong answer is state 'incorrect'", () => {
  const h = L.createEmptyWordHistory("hard", 4, 4);
  L.recordAttempt(h, { correct: false, responseMs: 1000, timestamp: 1000 });
  assert.equal(L.classifyState(h), "incorrect");
});

test("one correct answer on a word with a clean record (never gotten wrong) is immediately 'memorized' - no fluke-guard needed when there's never been a mistake", () => {
  const h = L.createEmptyWordHistory("go", 4, 2);
  L.recordAttempt(h, { correct: true, responseMs: 400, timestamp: 1000 });
  assert.equal(L.classifyState(h), "memorized");
});

test("a word that HAS been gotten wrong needs memorizedStreak (2) correct answers in a row to be trusted as 'memorized' again - just the recovery answer alone (streak 1) is 'learning'", () => {
  const h = L.createEmptyWordHistory("bat", 4, 3);
  play(h, [{ correct: false }]);
  assert.equal(L.classifyState(h), "incorrect");
  play(h, [{ correct: true }]);
  assert.equal(L.classifyState(h), "learning", "one correct after a mistake is recovering, not yet re-confirmed");
  play(h, [{ correct: true }]);
  assert.equal(L.classifyState(h), "memorized", "two in a row since the mistake is enough to trust it again");
});

test("a broken streak resets: memorized -> wrong answer -> back to 'incorrect', not just knocked down a notch", () => {
  const h = L.createEmptyWordHistory("cup", 4, 3);
  play(h, [{ correct: true }, { correct: true }]);
  assert.equal(L.classifyState(h), "memorized");
  play(h, [{ correct: false }]);
  assert.equal(L.classifyState(h), "incorrect");
  assert.equal(h.correctStreak, 0);
});

test("recovering after a reset still needs a fresh 2-streak, not credit for old attempts", () => {
  const h = L.createEmptyWordHistory("dog", 4, 3);
  play(h, [{ correct: true }, { correct: true }, { correct: false }, { correct: true }]);
  assert.equal(L.classifyState(h), "learning", "only 1 correct since the reset - not memorized yet");
  play(h, [{ correct: true }]);
  assert.equal(L.classifyState(h), "memorized");
});

test("a long, slowly-typed word and a short, quickly-typed word both reach Memorized on the same 2-streak rule - the label is length/time independent", () => {
  const shortWord = L.createEmptyWordHistory("cat", 4, 3);
  play(shortWord, [{ correct: true, responseMs: 400 }, { correct: true, responseMs: 380 }]);

  const longWord = L.createEmptyWordHistory("internationalization", 6, 21);
  play(longWord, [{ correct: true, responseMs: 9000 }, { correct: true, responseMs: 9500 }]);

  assert.equal(L.classifyState(shortWord), "memorized");
  assert.equal(L.classifyState(longWord), "memorized");
});

/* ================= Reintroducing Memorized words (prediction-based, not a
   calendar; share is risk-driven, not a flat percentage - see
   scoreMemorizedForReintroduction/rankEligibleForReintroduction/computeReintroduceShare) ================= */

test("categorizeWords never auto-reclassifies a Memorized word - it stays 'memorized' regardless of how long ago it was last tested", () => {
  const historyStore = {};
  const h = L.createEmptyWordHistory("steady", 4, 6);
  play(h, [{ correct: true }]); // memorized immediately - clean record
  historyStore.steady = h;
  const pool = [makeWord("steady", 4)];

  const soon = L.categorizeWords(pool, historyStore, 2000);
  const muchLater = L.categorizeWords(pool, historyStore, 2000 + 365 * 24 * 60 * 60 * 1000);
  assert.equal(soon.memorized.length, 1);
  assert.equal(soon.learning.length, 0);
  assert.equal(muchLater.memorized.length, 1, "no calendar-based reroute - a Memorized word stays put no matter how much time passes");
  assert.equal(muchLater.learning.length, 0);
});

test("rankEligibleForReintroduction returns nothing when the Memorized pool is empty, or when nothing clears the minimum risk bar", () => {
  const models = L.buildPriorityModels({});
  assert.deepEqual(L.rankEligibleForReintroduction(L.scoreMemorizedForReintroduction([], {}, models, Math.random)), []);

  // A pool of Memorized words with a single clean correct answer each - own
  // decayed mastery (1.85/2.7 correct, risk ~0.31) sits comfortably under
  // autoBalanceReintroduceMinRisk, so nothing here should qualify.
  const historyStore = {};
  const pool = makePool(10, 4, "safe");
  for (const w of pool) {
    const h = L.createEmptyWordHistory(w.word, w.level, w.word.length);
    play(h, [{ correct: true }]);
    historyStore[w.word.toLowerCase()] = h;
  }
  const scored = L.scoreMemorizedForReintroduction(pool, historyStore, models, Math.random);
  assert.deepEqual(L.rankEligibleForReintroduction(scored), [], "nothing should qualify when nothing looks at-risk");
  assert.equal(L.computeReintroduceShare(scored), 0, "no share should be reserved when nothing qualifies");
});

test("rankEligibleForReintroduction ranks eligible Memorized words by OWN decayed mastery risk, highest first, and excludes ones below the minimum", () => {
  const models = L.buildPriorityModels({});
  const pool = [makeWord("risky", 4), makeWord("borderline", 4), makeWord("safe", 4)];
  // Risk is 1 - masteryMean, driven purely by each word's own masteryAlpha/
  // masteryBeta - not any generic baseline (there is none configured here).
  const mastery = { risky: { masteryAlpha: 1, masteryBeta: 9 }, borderline: { masteryAlpha: 6, masteryBeta: 4 }, safe: { masteryAlpha: 19, masteryBeta: 1 } };
  const historyStore = {};
  for (const w of pool) {
    const h = L.createEmptyWordHistory(w.word, 4, w.word.length);
    Object.assign(h, mastery[w.word]);
    historyStore[w.word.toLowerCase()] = h;
  }

  const scored = L.scoreMemorizedForReintroduction(pool, historyStore, models, Math.random);
  const candidates = L.rankEligibleForReintroduction(scored);
  assert.deepEqual(candidates.map((w) => w.word), ["risky", "borderline"], "only words at/above autoBalanceReintroduceMinRisk qualify, highest risk first");
});

test("computeReintroduceShare is always exactly 0 while autoBalanceReintroduceMaxShare is 0 (reintroduction currently disabled), regardless of how much risk exists", () => {
  assert.equal(L.CONFIG.autoBalanceReintroduceMaxShare, 0, "sanity check: reintroduction is currently switched off");
  const manyPool = makePool(30, 4, "severe");
  const models = L.buildPriorityModels({});
  const historyStore = {};
  for (const w of manyPool) {
    const h = L.createEmptyWordHistory(w.word, 4, w.word.length);
    h.masteryAlpha = 1;
    h.masteryBeta = 19; // own mastery mean 0.05 -> risk 0.95, severely at-risk
    historyStore[w.word.toLowerCase()] = h;
  }
  const scored = L.scoreMemorizedForReintroduction(manyPool, historyStore, models, Math.random);
  assert.equal(L.computeReintroduceShare(scored), 0, "even a large, severely at-risk pool must reserve nothing while the feature is off");
});

test("computeReintroduceShare's underlying math scales with total excess risk, not a flat percentage, whenever autoBalanceReintroduceMaxShare is turned back on", () => {
  const historyStoreWithRisk = (words, riskByWord) => {
    const store = {};
    for (const w of words) {
      const h = L.createEmptyWordHistory(w.word, 4, w.word.length);
      const risk = riskByWord[w.word] ?? 0.05;
      // Own decayed mastery mean = 1 - risk, split as alpha/beta out of a
      // fixed total of 10 - purely personal evidence, no baseline involved.
      h.masteryAlpha = (1 - risk) * 10;
      h.masteryBeta = risk * 10;
      store[w.word.toLowerCase()] = h;
    }
    return store;
  };
  const models = L.buildPriorityModels({});

  const originalMaxShare = L.CONFIG.autoBalanceReintroduceMaxShare;
  L.CONFIG.autoBalanceReintroduceMaxShare = 0.12;
  try {
    // One barely-qualifying word.
    const onePool = [makeWord("barely", 4)];
    const oneHistoryStore = historyStoreWithRisk(onePool, { barely: L.CONFIG.autoBalanceReintroduceMinRisk + 0.02 });
    const oneScore = L.scoreMemorizedForReintroduction(onePool, oneHistoryStore, models, Math.random);
    const oneShare = L.computeReintroduceShare(oneScore);
    assert.ok(oneShare > 0, "a single barely-qualifying word should still reserve SOME share");
    assert.ok(oneShare < L.CONFIG.autoBalanceReintroduceMaxShare, "but nowhere near the ceiling");

    // Many severely at-risk words - should saturate at (or very near) the ceiling.
    const manyPool = makePool(30, 4, "severe");
    const manyRisk = {};
    for (const w of manyPool) manyRisk[w.word] = 0.95;
    const manyHistoryStore = historyStoreWithRisk(manyPool, manyRisk);
    const manyScore = L.scoreMemorizedForReintroduction(manyPool, manyHistoryStore, models, Math.random);
    const manyShare = L.computeReintroduceShare(manyScore);
    assert.ok(manyShare > oneShare, "more/riskier eligible content should reserve a bigger share");
    assert.ok(Math.abs(manyShare - L.CONFIG.autoBalanceReintroduceMaxShare) < 1e-9, "a large, severely at-risk pool should saturate at the ceiling, not exceed it");
  } finally {
    L.CONFIG.autoBalanceReintroduceMaxShare = originalMaxShare;
  }
});

/* ================= Wrong-answer review data ================= */

test("recentWrongAnswersOf returns distinct past wrong answers, most recent first, capped", () => {
  const h = L.createEmptyWordHistory("weird", 4, 5);
  play(h, [
    { correct: false, answer: "wierd" },
    { correct: true },
    { correct: false, answer: "werid" },
    { correct: false, answer: "wierd" }, // repeat of the first mistake
    { correct: false, answer: "weerd" },
  ]);
  const recent = L.recentWrongAnswersOf(h, 3);
  assert.deepEqual(recent, ["weerd", "wierd", "werid"], "most recent first, de-duplicated, capped at 3");
});

test("recentWrongAnswersOf is empty for a word with no wrong answers yet", () => {
  const h = L.createEmptyWordHistory("easy", 4, 4);
  play(h, [{ correct: true }]);
  assert.deepEqual(L.recentWrongAnswersOf(h), []);
});

test("diffChars highlights a one-letter swap between the typed answer and the correct spelling", () => {
  const ops = L.diffChars("wierd", "weird");
  const correctChars = ops.map((o) => o.char).join("");
  assert.equal(correctChars, "weird", "diff is aligned against the correct word's letters");
  assert.ok(ops.some((o) => !o.match), "at least one letter should be flagged as not matched given the swap");
});

test("diffChars marks every letter matched for an exact match", () => {
  const ops = L.diffChars("weird", "weird");
  assert.ok(ops.every((o) => o.match));
});

test("diffCharsBoth flags the mismatched letters on BOTH sides for a one-letter swap, not just the correct spelling", () => {
  const { typed, correct } = L.diffCharsBoth("wierd", "weird");
  assert.equal(typed.map((o) => o.char).join(""), "wierd", "typed-side is aligned against what the user actually typed");
  assert.equal(correct.map((o) => o.char).join(""), "weird", "correct-side is aligned against the correct spelling");
  assert.ok(typed.some((o) => !o.match), "the misplaced letter in what was typed should be flagged");
  assert.ok(correct.some((o) => !o.match), "the letter missing from its expected spot should be flagged");
});

test("diffCharsBoth flags a trailing extra letter as unmatched on the typed side only", () => {
  const { typed, correct } = L.diffCharsBoth("catss", "cats");
  assert.equal(typed.map((o) => o.char).join(""), "catss");
  assert.equal(correct.map((o) => o.char).join(""), "cats");
  assert.ok(correct.every((o) => o.match), "every correct letter was in fact typed");
  assert.equal(typed.filter((o) => !o.match).length, 1, "only the one extra trailing letter should be flagged");
});

test("diffCharsBoth marks every letter matched on both sides for an exact match", () => {
  const { typed, correct } = L.diffCharsBoth("weird", "weird");
  assert.ok(typed.every((o) => o.match) && correct.every((o) => o.match));
});

/* ================= Review-priority weighting (time-based) ================= */

test("computeGlobalAverageResponseMs averages avgCorrectResponseMs across all words with timing data", () => {
  const historyStore = {};
  const a = L.createEmptyWordHistory("a", 4, 1);
  play(a, [{ correct: true, responseMs: 1000 }]);
  historyStore.a = a;
  const b = L.createEmptyWordHistory("b", 4, 1);
  play(b, [{ correct: true, responseMs: 2000 }]);
  historyStore.b = b;
  assert.equal(L.computeGlobalAverageResponseMs(historyStore), 1500);
});

test("computeGlobalAverageResponseMs is null when there is no timing data yet", () => {
  assert.equal(L.computeGlobalAverageResponseMs({}), null);
});

test("computeSelectionWeight gives a word slower than its length-expected baseline a higher weight than one faster than expected", () => {
  const now = 1000000;
  const models = { difficultyBaseline: null, interferenceModel: null, responseTimeBaseline: { predict: () => 1000 } };
  const slowWord = { word: "slow", level: 4 };
  const fastWord = { word: "fast", level: 4 };
  const slowHistory = { avgCorrectResponseMs: 2000, lastSeen: now - 5 * 24 * 60 * 60 * 1000 };
  const fastHistory = { avgCorrectResponseMs: 500, lastSeen: now - 5 * 24 * 60 * 60 * 1000 };
  const slowWeight = L.computeSelectionWeight(slowWord, slowHistory, models, now);
  const fastWeight = L.computeSelectionWeight(fastWord, fastHistory, models, now);
  assert.ok(slowWeight > fastWeight, `slower-than-expected word should weigh more (slow=${slowWeight}, fast=${fastWeight})`);
});

test("computeSelectionWeight temporarily suppresses a word tested moments ago vs the same word tested long ago", () => {
  const now = 1000000;
  const models = { difficultyBaseline: null, interferenceModel: null, responseTimeBaseline: { predict: () => 1000 } };
  const w = { word: "example", level: 4 };
  const justTested = L.computeSelectionWeight(w, { avgCorrectResponseMs: 2000, lastSeen: now - 1000 }, models, now);
  const testedDaysAgo = L.computeSelectionWeight(w, { avgCorrectResponseMs: 2000, lastSeen: now - 10 * 24 * 60 * 60 * 1000 }, models, now);
  assert.ok(testedDaysAgo > justTested, "a word tested moments ago should be less eager to repeat than the same word tested days ago");
});

test("computeSelectionWeight falls back to a neutral weight when there's no timing data yet for the word", () => {
  const models = { difficultyBaseline: null, interferenceModel: null, responseTimeBaseline: { predict: () => 1000 } };
  const weight = L.computeSelectionWeight({ word: "x", level: 4 }, { lastSeen: 0 }, models, 1000000);
  assert.ok(weight > 0);
});

test("computeSelectionWeight falls back to a neutral weight when there's no baseline at all yet (nobody has any timing data)", () => {
  const models = { difficultyBaseline: null, interferenceModel: null, responseTimeBaseline: null };
  const weight = L.computeSelectionWeight({ word: "x", level: 4 }, { avgCorrectResponseMs: 5000, lastSeen: 500000 }, models, 1000000);
  assert.ok(weight > 0);
});

test("computeSelectionWeight gives a word with a higher OWN empirical error rate a higher weight than one with a lower rate, all else equal", () => {
  const now = 1000000;
  const models = { difficultyBaseline: { predict: () => 0.2 }, interferenceModel: null, responseTimeBaseline: null };
  const w = { word: "example", level: 4 };
  const oftenWrong = L.computeSelectionWeight(w, { attempts: 10, incorrect: 9, lastSeen: now }, models, now);
  const rarelyWrong = L.computeSelectionWeight(w, { attempts: 10, incorrect: 1, lastSeen: now }, models, now);
  assert.ok(oftenWrong > rarelyWrong, "a word this user actually gets wrong most of the time should outweigh one they rarely miss");
});

/* ================= computeSelectionWeight's category-direction split: new words favor
   high predicted risk (surface likely-to-be-missed words early), incorrect/learning
   words favor LOW predicted risk (clear near-mastered backlog words fastest) ================= */

test("computeSelectionWeight with category 'new' (or omitted) gives a higher-risk word a HIGHER weight", () => {
  const now = 1000000;
  const models = { difficultyBaseline: { predict: (word) => (word === "hard" ? 0.9 : 0.1) }, interferenceModel: null, responseTimeBaseline: null };
  const hard = { word: "hard", level: 4 };
  const easy = { word: "easy", level: 4 };
  const weightHardOmitted = L.computeSelectionWeight(hard, null, models, now);
  const weightEasyOmitted = L.computeSelectionWeight(easy, null, models, now);
  assert.ok(weightHardOmitted > weightEasyOmitted, "omitted category should default to favoring the harder word (new-word behavior)");

  const weightHardNew = L.computeSelectionWeight(hard, null, models, now, "new");
  const weightEasyNew = L.computeSelectionWeight(easy, null, models, now, "new");
  assert.ok(weightHardNew > weightEasyNew, "category 'new' should favor the harder (higher-risk) word");
});

test("computeSelectionWeight with category 'learning' ranks purely by the word's OWN decayed mastery (masteryAlpha/masteryBeta) - NOT predictWordDifficulty's modeled risk at all - so a word the generic model calls 'hard' but personally has a rock-solid recovery record outranks one the model calls 'easy' but personally is still shaky", () => {
  const now = 1000000;
  // A baseline that says the OPPOSITE of what each word's own mastery says,
  // to prove the model's guess has zero influence here.
  const models = { difficultyBaseline: { predict: (word) => (word === "modelHard" ? 0.9 : 0.1) }, interferenceModel: null, responseTimeBaseline: null };
  const modelHard = { word: "modelHard", level: 4 };
  const modelEasy = { word: "modelEasy", level: 4 };

  const weightModelHardButReallySolid = L.computeSelectionWeight(modelHard, { masteryAlpha: 9, masteryBeta: 1 }, models, now, "learning");
  const weightModelEasyButReallyShaky = L.computeSelectionWeight(modelEasy, { masteryAlpha: 1, masteryBeta: 9 }, models, now, "learning");
  assert.ok(
    weightModelHardButReallySolid > weightModelEasyButReallyShaky,
    `a word with a solid personal recovery record should outrank a shaky one, regardless of what the generic model guesses about either (solid=${weightModelHardButReallySolid}, shaky=${weightModelEasyButReallyShaky})`
  );
});

test("computeSelectionWeight with category 'reintroduce' ranks purely by the word's OWN decayed mastery, opposite direction from 'learning' - a Memorized word whose personal track record has started slipping resurfaces before one that's still rock-solid, regardless of the generic model", () => {
  const now = 1000000;
  const models = { difficultyBaseline: { predict: (word) => (word === "modelHard" ? 0.9 : 0.1) }, interferenceModel: null, responseTimeBaseline: null };
  const modelHard = { word: "modelHard", level: 4 };
  const modelEasy = { word: "modelEasy", level: 4 };

  const weightSlipping = L.computeSelectionWeight(modelEasy, { masteryAlpha: 1, masteryBeta: 9 }, models, now, "reintroduce");
  const weightSolid = L.computeSelectionWeight(modelHard, { masteryAlpha: 9, masteryBeta: 1 }, models, now, "reintroduce");
  assert.ok(
    weightSlipping > weightSolid,
    `a slipping Memorized word should outrank a still-solid one under 'reintroduce', regardless of what the generic model guesses about either (slipping=${weightSlipping}, solid=${weightSolid})`
  );
});

test("computeSelectionWeight with category 'incorrect' ranks purely by the word's OWN incorrectStreak - NOT predictWordDifficulty's modeled risk at all - so a word the generic model calls 'hard' but has only been personally missed once outranks one the model calls 'easy' but has been missed many times in a row", () => {
  const now = 1000000;
  // A baseline that says the OPPOSITE of what incorrectStreak says, to prove
  // the model's guess has zero influence here: "modelHard" gets flagged
  // hard by the generic model but has only slipped once for this learner;
  // "modelEasy" gets flagged easy by the generic model but is this
  // learner's most entrenched miss.
  const models = { difficultyBaseline: { predict: (word) => (word === "modelHard" ? 0.9 : 0.1) }, interferenceModel: null, responseTimeBaseline: null };
  const modelHard = { word: "modelHard", level: 4 };
  const modelEasy = { word: "modelEasy", level: 4 };

  const weightModelHardButReallyOk = L.computeSelectionWeight(modelHard, { incorrectStreak: 1 }, models, now, "incorrect");
  const weightModelEasyButReallyStuck = L.computeSelectionWeight(modelEasy, { incorrectStreak: 5 }, models, now, "incorrect");
  assert.ok(
    weightModelHardButReallyOk > weightModelEasyButReallyStuck,
    `a word missed only once should outrank one missed 5 times running, regardless of what the generic model guesses about either (once=${weightModelHardButReallyOk}, entrenched=${weightModelEasyButReallyStuck})`
  );
});

test("computeSelectionWeight's category direction is purely about which way risk points - the response-time and recency adjustments still apply identically regardless of category", () => {
  const now = 1000000;
  const models = { difficultyBaseline: { predict: () => 0.5 }, interferenceModel: null, responseTimeBaseline: { predict: () => 1000 } };
  const w = { word: "example", level: 4 };
  const slowHistory = { avgCorrectResponseMs: 2000, lastSeen: now - 5 * 24 * 60 * 60 * 1000 };
  const fastHistory = { avgCorrectResponseMs: 500, lastSeen: now - 5 * 24 * 60 * 60 * 1000 };
  for (const category of ["incorrect", "learning"]) {
    const slow = L.computeSelectionWeight(w, slowHistory, models, now, category);
    const fast = L.computeSelectionWeight(w, fastHistory, models, now, category);
    assert.ok(slow > fast, `even with the review-direction risk flip, a slower-than-expected word should still weigh more under category '${category}'`);
  }
});

/* ================= computeLevelBalanceModel: keeps a multi-level auto-mode round from
   letting one selected level dominate just because it's been practiced more/less ================= */

test("computeLevelBalanceModel returns null for a single-level pool - nothing to balance", () => {
  const pool = makePool(20, 4, "w");
  assert.equal(L.computeLevelBalanceModel(pool, {}), null);
});

test("computeLevelBalanceModel returns null (a no-op) when there is no attempt data anywhere yet, even across levels", () => {
  const pool = makePool(10, 4, "a").concat(makePool(10, 6, "b"));
  const model = L.computeLevelBalanceModel(pool, {});
  assert.ok(model, "model should still exist (>1 level) even with no data");
  assert.equal(model.weightOf(4), 1);
  assert.equal(model.weightOf(6), 1);
});

test("computeLevelBalanceModel boosts a level that's been attempted far LESS than the others, and dampens one attempted far MORE", () => {
  const heavyLevel = makePool(20, 4, "heavy");
  const lightLevel = makePool(20, 6, "light");
  const pool = heavyLevel.concat(lightLevel);
  const historyStore = {};
  for (const w of heavyLevel) historyStore[w.word] = { attempts: 20 };
  for (const w of lightLevel) historyStore[w.word] = { attempts: 1 };

  const model = L.computeLevelBalanceModel(pool, historyStore);
  assert.ok(model.weightOf(4) < 1, `heavily-practiced level 4 should be dampened (got ${model.weightOf(4)})`);
  assert.ok(model.weightOf(6) > 1, `barely-practiced level 6 should be boosted (got ${model.weightOf(6)})`);
  assert.ok(model.weightOf(4) >= L.CONFIG.autoLevelBalanceWeightMin);
  assert.ok(model.weightOf(6) <= L.CONFIG.autoLevelBalanceWeightMax);
});

test("computeLevelBalanceModel's weightOf defaults to the exposure table (same as omitting category) for 'new' or an unrecognized category", () => {
  const heavyLevel = makePool(20, 4, "heavy");
  const lightLevel = makePool(20, 6, "light");
  const pool = heavyLevel.concat(lightLevel);
  const historyStore = {};
  for (const w of heavyLevel) historyStore[w.word] = { attempts: 20 };
  for (const w of lightLevel) historyStore[w.word] = { attempts: 1 };

  const model = L.computeLevelBalanceModel(pool, historyStore);
  assert.equal(model.weightOf(4, "new"), model.weightOf(4));
  assert.equal(model.weightOf(6, "new"), model.weightOf(6));
});

test("computeLevelBalanceModel's review weight is a SEPARATE signal from exposure - a heavily-practiced level with a severe backlog gets dampened for new words but boosted for incorrect/learning", () => {
  // Both levels equally, heavily practiced (identical average attempts) -
  // exposureWeight should be at parity for "new". But level 4's words are
  // all entrenched misses (severe backlog pressure) while level 6's are
  // all comfortably correct (near-zero backlog) - reviewWeight should
  // diverge sharply even though exposure alone sees no difference.
  const strugglingLevel = makePool(20, 4, "struggling");
  const thrivingLevel = makePool(20, 6, "thriving");
  const pool = strugglingLevel.concat(thrivingLevel);
  const historyStore = {};
  for (const w of strugglingLevel) {
    const h = L.createEmptyWordHistory(w.word, 4, w.word.length);
    for (let i = 0; i < 6; i++) L.recordAttempt(h, { correct: false, timestamp: 1000 + i * 1000, level: 4, length: w.word.length });
    historyStore[w.word.toLowerCase()] = h;
  }
  for (const w of thrivingLevel) {
    const h = L.createEmptyWordHistory(w.word, 6, w.word.length);
    for (let i = 0; i < 6; i++) L.recordAttempt(h, { correct: true, timestamp: 1000 + i * 1000, level: 6, length: w.word.length });
    historyStore[w.word.toLowerCase()] = h;
  }

  const model = L.computeLevelBalanceModel(pool, historyStore, 20000);
  const newWeightStruggling = model.weightOf(4, "new");
  const newWeightThriving = model.weightOf(6, "new");
  assert.ok(Math.abs(newWeightStruggling - newWeightThriving) < 1e-9, `equal exposure should mean equal "new" weight regardless of backlog (struggling=${newWeightStruggling}, thriving=${newWeightThriving})`);

  const reviewWeightStruggling = model.weightOf(4, "incorrect");
  const reviewWeightThriving = model.weightOf(6, "incorrect");
  assert.ok(reviewWeightStruggling > reviewWeightThriving, `the level with the severe backlog should get MORE review share than the thriving one (struggling=${reviewWeightStruggling}, thriving=${reviewWeightThriving})`);
  assert.equal(model.weightOf(4, "learning"), reviewWeightStruggling, "incorrect and learning share the same review weight table");
});

test("selectQuestions with levelBalance:true noticeably shifts the level mix toward an under-practiced level vs levelBalance omitted", () => {
  // Both pools' words are all in the SAME state ("learning": some attempts,
  // never wrong, streak not yet at Memorized) and all correct so far (0%
  // error rate everywhere - no difficulty-risk differences to confound the
  // result), differing ONLY in how many times each has been attempted:
  // level 4 heavily (30), level 6 barely (1) - exactly the per-level
  // exposure imbalance computeLevelBalanceModel measures. "heavy"/"light"
  // are the same length, so word-length-based difficulty effects wash out
  // evenly between the two levels too.
  const heavyLevel = makePool(150, 4, "heavy");
  const lightLevel = makePool(150, 6, "light");
  const pool = heavyLevel.concat(lightLevel);
  const historyStore = {};
  const learningHistory = (attempts) => ({
    // "learning" (see classifyState) needs a past mistake and a streak
    // under memorizedStreak - held constant here regardless of `attempts`
    // (this test varies EXPOSURE count only, not state).
    attempts: attempts, correct: Math.max(0, attempts - 1), incorrect: 1, correctStreak: 1,
    lastResult: "correct", lastSeen: 0, lastReviewedAt: 0, markedAt: 0,
  });
  for (const w of heavyLevel) historyStore[w.word.toLowerCase()] = learningHistory(30);
  for (const w of lightLevel) historyStore[w.word.toLowerCase()] = learningHistory(1);

  function level6Share(levelBalance) {
    let level6Count = 0;
    let total = 0;
    const trials = 200;
    for (let i = 0; i < trials; i++) {
      const selection = L.selectQuestions({
        pool: pool,
        historyStore: historyStore,
        size: 60,
        ratio: { new: 0, incorrect: 0, learning: 1 },
        random: seededRandom(1000 + i),
        levelBalance: levelBalance,
      });
      total += selection.length;
      level6Count += selection.filter((w) => w.level === 6).length;
    }
    return level6Count / total;
  }

  const shareWithout = level6Share(false);
  const shareWith = level6Share(true);
  assert.ok(
    shareWith > shareWithout + 0.05,
    `level balance should shift a meaningfully larger share toward the under-practiced level 6 (without=${shareWithout}, with=${shareWith})`
  );
});

/* ================= Length-aware response time baseline (fixes long words always reading as "slow") ================= */

test("computeResponseTimeBaseline is null with no timing data at all", () => {
  assert.equal(L.computeResponseTimeBaseline({}), null);
});

test("computeResponseTimeBaseline falls back to a flat overall average below the min-sample threshold, regardless of length", () => {
  const historyStore = {};
  // Only 3 points (well under CONFIG.minSamplesForLengthTrend) - too few to
  // trust a fitted length trend, so every length should predict the same
  // flat average.
  const words = [
    { word: "a", length: 2, ms: 800 },
    { word: "extraordinary", length: 13, ms: 2200 },
    { word: "cat", length: 3, ms: 1200 },
  ];
  for (const w of words) {
    const h = L.createEmptyWordHistory(w.word, 4, w.length);
    L.recordAttempt(h, { correct: true, responseMs: w.ms, timestamp: 1000, level: 4, length: w.length });
    historyStore[w.word] = h;
  }
  const baseline = L.computeResponseTimeBaseline(historyStore);
  assert.ok(baseline);
  const expectedFlatAvg = (800 + 2200 + 1200) / 3;
  assert.equal(baseline.predict(2), expectedFlatAvg);
  assert.equal(baseline.predict(13), expectedFlatAvg);
});

test("computeResponseTimeBaseline predicts a longer expected time for longer words once there's enough data to fit a trend", () => {
  const historyStore = {};
  // 10 synthetic words with response time scaling cleanly with length
  // (500ms base + 150ms per character) - well over minSamplesForLengthTrend
  // (8), so this should fit a real length trend instead of falling back to
  // one flat average.
  for (let len = 3; len <= 12; len++) {
    const word = "w".repeat(len);
    const h = L.createEmptyWordHistory(word, 4, len);
    const ms = 500 + len * 150;
    L.recordAttempt(h, { correct: true, responseMs: ms, timestamp: 1000, level: 4, length: len });
    historyStore[word] = h;
  }
  const baseline = L.computeResponseTimeBaseline(historyStore);
  assert.ok(baseline);
  assert.ok(
    baseline.predict(12) > baseline.predict(4),
    "a longer word should have a higher expected time than a shorter one once a trend is fitted"
  );
});

test("relativeResponseTime: a long word exactly on pace for its own length is neutral (~1), not flagged 'slow' just for being long", () => {
  const historyStore = {};
  // A range of word lengths, each answered in EXACTLY the length-scaled
  // "expected" time (500 + 150*len) - nobody here is actually struggling,
  // long or short, they're all equally well-practiced relative to their
  // own word's length.
  for (let len = 3; len <= 14; len++) {
    const word = "w".repeat(len);
    const h = L.createEmptyWordHistory(word, 4, len);
    const ms = 500 + len * 150;
    L.recordAttempt(h, { correct: true, responseMs: ms, timestamp: 1000, level: 4, length: len });
    historyStore[word] = h;
  }
  const baseline = L.computeResponseTimeBaseline(historyStore);
  const longWordHistory = historyStore["w".repeat(14)];
  const shortWordHistory = historyStore["w".repeat(3)];
  const longRel = L.relativeResponseTime(longWordHistory, baseline);
  const shortRel = L.relativeResponseTime(shortWordHistory, baseline);
  assert.ok(Math.abs(longRel - 1) < 0.05, `a long word right on pace for its length should be ~1, got ${longRel}`);
  assert.ok(Math.abs(shortRel - 1) < 0.05, `a short word right on pace for its length should be ~1, got ${shortRel}`);
});

test("selectQuestions no longer systematically favors long words for review just because they take longer to type", () => {
  const historyStore = {};
  const now = 1000;
  // 20 "learning" words of varying length, EVERY ONE answered exactly on
  // pace for its own length (500 + 150*len) - none of them is actually
  // weaker than any other. Under the old flat-global-average comparison,
  // every long word here would still be pegged as "slower than average"
  // (since the average is dominated by shorter/mid-length words) and long
  // words would dominate weighted selection; under the length-aware
  // baseline none of them should be systematically favored over another.
  const words = [];
  for (let len = 3; len <= 22; len++) {
    const word = "w".repeat(len);
    words.push({ word: word, pos: "n.", level: 4, zh: "測試" });
    const h = L.createEmptyWordHistory(word, 4, len);
    // "learning" (see classifyState) needs a past mistake - give each word
    // one, then the on-pace correct answer the test is actually about.
    L.recordAttempt(h, { correct: false, timestamp: now - 1000, level: 4, length: len });
    L.recordAttempt(h, { correct: true, responseMs: 500 + len * 150, timestamp: now, level: 4, length: len });
    historyStore[word.toLowerCase()] = h;
  }
  // Draw many independent weighted rankings and tally how often the
  // longest word (len=22) lands ahead of the shortest (len=3).
  let longFirstCount = 0;
  const trials = 300;
  for (let seed = 1; seed <= trials; seed++) {
    const ranked = L.selectQuestions({
      pool: words,
      historyStore,
      size: words.length,
      ratio: { new: 0, incorrect: 0, learning: 1 },
      random: seededRandom(seed),
      now,
    });
    const longIdx = ranked.findIndex((w) => w.word === "w".repeat(22));
    const shortIdx = ranked.findIndex((w) => w.word === "w".repeat(3));
    if (longIdx < shortIdx) longFirstCount += 1;
  }
  const rate = longFirstCount / trials;
  assert.ok(rate > 0.35 && rate < 0.65, `the long word should not dominate the front of the list just for being long (rate=${rate})`);
});

/* ================= Hard review cooldown: a just-tested word is EXCLUDED
   from a category's main ranking, not just down-weighted - see
   CONFIG.reviewCooldownDays/rankCandidates's splitByCooldown ================= */

test("selectQuestions excludes a just-tested incorrect word from the round while enough OTHER incorrect candidates exist to fill it", () => {
  const historyStore = {};
  const now = 100 * 24 * 60 * 60 * 1000;
  const justTested = makeWord("recent", 4);
  const hRecent = L.createEmptyWordHistory("recent", 4, 6);
  L.recordAttempt(hRecent, { correct: false, timestamp: now - 60 * 60 * 1000, level: 4, length: 6 }); // 1 hour ago
  historyStore.recent = hRecent;

  const others = makePool(5, 4, "stale");
  for (const w of others) {
    const h = L.createEmptyWordHistory(w.word, w.level, w.word.length);
    L.recordAttempt(h, { correct: false, timestamp: now - 10 * 24 * 60 * 60 * 1000, level: w.level, length: w.word.length }); // 10 days ago
    historyStore[w.word.toLowerCase()] = h;
  }

  const selection = L.selectQuestions({
    pool: [justTested].concat(others),
    historyStore: historyStore,
    size: 2,
    ratio: { new: 0, incorrect: 1, learning: 0 },
    now: now,
    random: seededRandom(1),
  });
  assert.ok(!selection.some((w) => w.word === "recent"), "a word tested an hour ago should not appear while 5 other eligible incorrect words exist");
});

test("selectQuestions still includes a just-tested incorrect word as a last-resort fallback once every other incorrect candidate is exhausted", () => {
  const historyStore = {};
  const now = 100 * 24 * 60 * 60 * 1000;
  const justTested = makeWord("recent", 4);
  const hRecent = L.createEmptyWordHistory("recent", 4, 6);
  L.recordAttempt(hRecent, { correct: false, timestamp: now - 60 * 60 * 1000, level: 4, length: 6 });
  historyStore.recent = hRecent;

  const others = makePool(2, 4, "stale");
  for (const w of others) {
    const h = L.createEmptyWordHistory(w.word, w.level, w.word.length);
    L.recordAttempt(h, { correct: false, timestamp: now - 10 * 24 * 60 * 60 * 1000, level: w.level, length: w.word.length });
    historyStore[w.word.toLowerCase()] = h;
  }

  // 3 incorrect words total, round needs all 3 - the just-tested one MUST be included.
  const selection = L.selectQuestions({
    pool: [justTested].concat(others),
    historyStore: historyStore,
    size: 3,
    ratio: { new: 0, incorrect: 1, learning: 0 },
    now: now,
    random: seededRandom(1),
  });
  assert.ok(selection.some((w) => w.word === "recent"), "with no other incorrect candidates left, the just-tested word must still fill the round rather than coming up short");
});

/* ================= Deterministic dominance: the prediction decides which
   candidates get chosen (a strict rank cut), not just their odds ================= */

test("selectQuestions deterministically fills a bucket from its clearly-higher-priority candidates every single trial, never passing one over for a clearly-lower-priority one", () => {
  const historyStore = {};
  const aiSignals = {};
  // 10 candidates with clearly distinct, non-tied priorDifficulty (0.05
  // apart - far more than the noise floor) so there is a single unambiguous
  // best-10-of-20 answer for category "new" (favors high risk).
  const pool = [];
  for (let i = 0; i < 20; i++) {
    const word = `word${i}`;
    pool.push(makeWord(word, 4));
    aiSignals[word] = { priorDifficulty: i * 0.04 }; // 0, 0.04, 0.08, ..., 0.76
  }
  const expectedTop10 = new Set(pool.slice(10, 20).map((w) => w.word)); // highest priorDifficulty = words 10..19

  for (let seed = 1; seed <= 50; seed++) {
    const selection = L.selectQuestions({
      pool,
      historyStore,
      size: 10,
      ratio: { new: 1, incorrect: 0, learning: 0 },
      random: seededRandom(seed),
      aiSignals,
    });
    const chosen = new Set(selection.map((w) => w.word));
    assert.deepEqual(chosen, expectedTop10, `trial seed=${seed} should pick exactly the 10 highest-risk words, got ${[...chosen].join(",")}`);
  }
});

test("selectQuestions with levelBalance never lets one level fully crowd out another that still has eligible candidates and weight", () => {
  // Reproduces a real scenario found while validating deterministic
  // dominance: many candidates within a bucket that are all near-identical
  // under the base difficulty model (the common case once a learner has a
  // sizeable, fairly uniform backlog) used to let level balance's own
  // multiplier (previously folded straight into computeSelectionWeight)
  // completely dominate a now-deterministic sort and zero out every level
  // but one - the opposite of "balance". mergeByLevelShare's proportional
  // interleave (see logic.js) is what fixed it.
  const levelA = makePool(60, 4, "a");
  const levelB = makePool(60, 5, "b");
  const levelC = makePool(60, 6, "c");
  const pool = levelA.concat(levelB).concat(levelC);
  const historyStore = {};
  // Every candidate gets the IDENTICAL attempt shape (near-tied under the
  // base model) except level A gets far more total attempts than B/C -
  // exactly the kind of skew that drove the level-balance weight far from
  // 1 for one level while everything else stayed near-tied.
  for (const w of levelA) historyStore[w.word.toLowerCase()] = { attempts: 20, correct: 19, incorrect: 1, correctStreak: 1, lastResult: "correct", lastSeen: 0, lastReviewedAt: 0, markedAt: 0 };
  for (const w of levelB.concat(levelC)) historyStore[w.word.toLowerCase()] = { attempts: 1, correct: 0, incorrect: 1, correctStreak: 1, lastResult: "correct", lastSeen: 0, lastReviewedAt: 0, markedAt: 0 };

  const selection = L.selectQuestions({
    pool,
    historyStore,
    size: 90,
    ratio: { new: 0, incorrect: 0, learning: 1 },
    random: seededRandom(3),
    levelBalance: true,
  });
  const byLevel = { 4: 0, 5: 0, 6: 0 };
  for (const w of selection) byLevel[w.level] += 1;
  assert.ok(byLevel[4] > 0 && byLevel[5] > 0 && byLevel[6] > 0, `every level should keep some representation, got ${JSON.stringify(byLevel)}`);
  // Not just "some" - a genuinely proportional share, not a token 1-2 words.
  assert.ok(byLevel[5] >= 15 && byLevel[6] >= 15, `under-practiced levels should get a real share, not a token amount (got ${JSON.stringify(byLevel)})`);
});

test("weightedShuffle picks the higher-weight item first far more often than chance, but not every single time", () => {
  const items = ["slow", "fast"];
  const weights = [3.0, 0.3];
  // One generator reused across all trials (not reseeded per trial): a
  // freshly-seeded LCG's very first draw is biased toward 0 for small
  // sequential seeds, which would otherwise skew a test this sensitive.
  const rnd = seededRandom(42);
  let slowFirstCount = 0;
  const trials = 300;
  for (let i = 0; i < trials; i++) {
    const ordered = L.weightedShuffle(items, weights, rnd);
    if (ordered[0] === "slow") slowFirstCount += 1;
  }
  const rate = slowFirstCount / trials;
  assert.ok(rate > 0.7, `slower item should win the vast majority of draws (rate=${rate})`);
  assert.ok(rate < 1, "it should not be a rigid, deterministic guarantee every single trial");
});

/* ================= Question selection: one ratio-driven mode ================= */

test("computeQuestionTargets scales the default 80/10/10 ratio to arbitrary sizes, summing exactly to size", () => {
  assert.deepEqual(L.computeQuestionTargets(80, L.CONFIG.defaultQuestionRatio), { new: 64, incorrect: 8, learning: 8 });
  const t20 = L.computeQuestionTargets(20, L.CONFIG.defaultQuestionRatio);
  assert.equal(t20.new + t20.incorrect + t20.learning, 20);
  assert.equal(t20.new, 16);
});

test("computeQuestionTargets normalizes a ratio that doesn't sum to 1 and still sums exactly to size", () => {
  // A user-dragged slider ratio like {70,30,0} out of 100 - percentages,
  // not fractions - should normalize the same as a fractional one.
  const t = L.computeQuestionTargets(20, { new: 0, incorrect: 70, learning: 30 });
  assert.equal(t.new + t.incorrect + t.learning, 20);
  assert.equal(t.incorrect, 14);
  assert.equal(t.learning, 6);
});

test("selectQuestions hits the default 80/10/10 mix when all categories have ample supply", () => {
  const historyStore = {};
  const newWords = makePool(200, 4, "new");
  const incorrectWords = makePool(50, 5, "bad");
  const learningWords = makePool(50, 6, "mid");

  for (const w of incorrectWords) {
    const h = L.createEmptyWordHistory(w.word, w.level, w.word.length);
    L.recordAttempt(h, { correct: false, responseMs: 1200, timestamp: 1000, level: w.level, length: w.word.length });
    historyStore[w.word.toLowerCase()] = h;
  }
  for (const w of learningWords) {
    const h = L.createEmptyWordHistory(w.word, w.level, w.word.length);
    // "learning" (under the new rule - see classifyState) means recovering
    // from a PAST mistake: one wrong, then one right, streak still only 1.
    L.recordAttempt(h, { correct: false, responseMs: 1200, timestamp: 900, level: w.level, length: w.word.length });
    L.recordAttempt(h, { correct: true, responseMs: 1200, timestamp: 1000, level: w.level, length: w.word.length });
    historyStore[w.word.toLowerCase()] = h;
  }

  const pool = newWords.concat(incorrectWords, learningWords);
  const selection = L.selectQuestions({ pool, historyStore, size: 80, random: seededRandom(42) });

  assert.equal(selection.length, 80);
  const cats = L.categorizeWords(selection, historyStore);
  assert.equal(cats.unseen.length, 64);
  assert.equal(cats.incorrect.length, 8);
  assert.equal(cats.learning.length, 8);
});

test("selectQuestions honors a custom ratio - e.g. the old Review Test's 70/30 incorrect/learning, no new words", () => {
  const historyStore = {};
  const incorrectWords = makePool(50, 4, "bad");
  const learningWords = makePool(50, 5, "mid");
  const newWords = makePool(50, 6, "new");
  for (const w of incorrectWords) {
    const h = L.createEmptyWordHistory(w.word, w.level, w.word.length);
    L.recordAttempt(h, { correct: false, responseMs: 1000, timestamp: 1000, level: w.level, length: w.word.length });
    historyStore[w.word.toLowerCase()] = h;
  }
  for (const w of learningWords) {
    const h = L.createEmptyWordHistory(w.word, w.level, w.word.length);
    L.recordAttempt(h, { correct: false, responseMs: 1000, timestamp: 900, level: w.level, length: w.word.length });
    L.recordAttempt(h, { correct: true, responseMs: 1000, timestamp: 1000, level: w.level, length: w.word.length });
    historyStore[w.word.toLowerCase()] = h;
  }
  const pool = incorrectWords.concat(learningWords, newWords);
  const selection = L.selectQuestions({
    pool,
    historyStore,
    size: 20,
    ratio: { new: 0, incorrect: 0.7, learning: 0.3 },
    random: seededRandom(11),
  });
  assert.equal(selection.length, 20);
  const cats = L.categorizeWords(selection, historyStore);
  assert.equal(cats.incorrect.length, 14);
  assert.equal(cats.learning.length, 6);
  assert.equal(cats.unseen.length, 0, "new words must never appear when their ratio slider is 0%");
});

test("selectQuestions never duplicates a word within one round", () => {
  const historyStore = {};
  const pool = makePool(100, 4, "u");
  for (let i = 0; i < 30; i++) {
    const w = pool[i];
    const h = L.createEmptyWordHistory(w.word, w.level, w.word.length);
    L.recordAttempt(h, { correct: i % 2 === 0, responseMs: 900, timestamp: 1000, level: w.level, length: w.word.length });
    historyStore[w.word.toLowerCase()] = h;
  }
  const selection = L.selectQuestions({ pool, historyStore, size: 80, random: seededRandom(7) });
  const words = selection.map((w) => w.word.toLowerCase());
  assert.equal(new Set(words).size, words.length);
});

test("selectQuestions falls back intelligently (within non-zero-ratio categories) when one is short on candidates", () => {
  const historyStore = {};
  const pool = makePool(90, 4, "u");
  const incorrectFew = pool.slice(0, 2);
  const learningFew = pool.slice(2, 3);
  for (const w of incorrectFew) {
    const h = L.createEmptyWordHistory(w.word, w.level, w.word.length);
    L.recordAttempt(h, { correct: false, responseMs: 900, timestamp: 1000, level: w.level, length: w.word.length });
    historyStore[w.word.toLowerCase()] = h;
  }
  for (const w of learningFew) {
    const h = L.createEmptyWordHistory(w.word, w.level, w.word.length);
    L.recordAttempt(h, { correct: true, responseMs: 900, timestamp: 1000, level: w.level, length: w.word.length });
    historyStore[w.word.toLowerCase()] = h;
  }

  const selection = L.selectQuestions({ pool, historyStore, size: 80, random: seededRandom(3) });
  assert.equal(selection.length, 80, "shortfall in one category should be made up elsewhere, not shrink the round");
  const words = new Set(selection.map((w) => w.word.toLowerCase()));
  assert.equal(words.size, 80);
});

test("selectQuestions never redistributes a shortfall into a category whose ratio is 0%", () => {
  const historyStore = {};
  // Only 2 incorrect words exist, but incorrect's ratio is 100% and every
  // other category is 0% - it must NOT fall back to filling the rest from
  // new/learning just because they have supply; that would silently ignore
  // the user's explicit "review only" choice.
  const pool = makePool(90, 4, "u");
  const incorrectFew = pool.slice(0, 2);
  for (const w of incorrectFew) {
    const h = L.createEmptyWordHistory(w.word, w.level, w.word.length);
    L.recordAttempt(h, { correct: false, responseMs: 900, timestamp: 1000, level: w.level, length: w.word.length });
    historyStore[w.word.toLowerCase()] = h;
  }
  const selection = L.selectQuestions({
    pool,
    historyStore,
    size: 80,
    ratio: { new: 0, incorrect: 1, learning: 0 },
    random: seededRandom(3),
  });
  assert.equal(selection.length, 2, "only the 2 genuinely-incorrect words should come back, not padded from other categories");
});

test("selectQuestions returns at most the pool size when the pool itself is smaller than requested", () => {
  const pool = makePool(15, 4, "tiny");
  const selection = L.selectQuestions({ pool, historyStore: {}, size: 80, random: seededRandom(1) });
  assert.equal(selection.length, 15);
  assert.equal(new Set(selection.map((w) => w.word)).size, 15);
});

test("selectQuestions excludes a Memorized word that hasn't reached its spaced-repetition due date yet", () => {
  const historyStore = {};
  const memorizedWord = makeWord("done", 4);
  const h = L.createEmptyWordHistory("done", 4, 4);
  play(h, [{ correct: true }, { correct: true }]); // last attempt at t=3000, schedules a 3-day interval - see recordAttempt
  historyStore.done = h;

  const pool = [memorizedWord];
  const oneDayLater = 3000 + 1 * 24 * 60 * 60 * 1000; // well inside the 3-day interval
  const selection = L.selectQuestions({ pool, historyStore, size: 80, random: seededRandom(5), now: oneDayLater });
  assert.equal(selection.length, 0, "the only word in the pool is Memorized and not yet due, so there is nothing left to select");
});

test("selectQuestions never includes a Memorized word by default - opts.reintroduceMemorized is required", () => {
  const historyStore = {};
  const h = L.createEmptyWordHistory("done", 4, 4);
  play(h, [{ correct: true }]);
  historyStore.done = h;

  const selection = L.selectQuestions({ pool: [makeWord("done", 4)], historyStore, size: 80, random: seededRandom(5) });
  assert.deepEqual(selection, [], "a Memorized word must not resurface without opting into reintroduction");
});

// A Memorized word (classifyState needs h.incorrect > 0 and correctStreak
// >= memorizedStreak) whose own decayed mastery is set directly to a chosen
// risk level - real personal evidence, not a generic baseline guess.
function makeShakyMemorized(word, level, risk) {
  const h = L.createEmptyWordHistory(word, level, word.length);
  Object.assign(h, { attempts: 5, correct: 3, incorrect: 2, correctStreak: 2, lastResult: "correct" });
  h.masteryAlpha = (1 - risk) * 10;
  h.masteryBeta = risk * 10;
  return h;
}

test("selectQuestions with opts.reintroduceMemorized reintroduces nothing while autoBalanceReintroduceMaxShare is 0 (currently disabled)", () => {
  const historyStore = {};
  const riskyWords = [];
  for (let i = 0; i < 6; i++) {
    const word = "risky" + i;
    riskyWords.push(makeWord(word, 4));
    historyStore[word] = makeShakyMemorized(word, 4, 0.9);
  }
  const newWords = makePool(50, 4, "fresh");
  const pool = riskyWords.concat(newWords);
  const selection = L.selectQuestions({
    pool: pool,
    historyStore: historyStore,
    size: 100,
    ratio: { new: 1, incorrect: 0, learning: 0 },
    reintroduceMemorized: true,
    random: seededRandom(7),
  });
  assert.ok(
    !selection.some((w) => w.word.startsWith("risky")),
    "no Memorized word should be reintroduced while the feature is switched off, no matter how at-risk it looks"
  );
});

test("selectQuestions with opts.reintroduceMemorized carves Memorized words the learner's OWN decayed mastery rates at-risk into the round when autoBalanceReintroduceMaxShare is turned back on - a single barely-qualifying word is NOT guaranteed a slot (share is risk-driven, see computeReintroduceShare), but enough aggregate risk is", () => {
  const historyStore = {};
  const riskyWords = [];
  // Enough AGGREGATE excess-risk pressure across all 6 to clear a real share.
  for (let i = 0; i < 6; i++) {
    const word = "risky" + i;
    riskyWords.push(makeWord(word, 4));
    historyStore[word] = makeShakyMemorized(word, 4, 0.9);
  }
  const newWords = makePool(50, 4, "fresh");
  const pool = riskyWords.concat(newWords);

  const originalMaxShare = L.CONFIG.autoBalanceReintroduceMaxShare;
  L.CONFIG.autoBalanceReintroduceMaxShare = 0.12;
  try {
    const selection = L.selectQuestions({
      pool: pool,
      historyStore: historyStore,
      size: 100,
      ratio: { new: 1, incorrect: 0, learning: 0 },
      reintroduceMemorized: true,
      random: seededRandom(7),
    });
    assert.ok(
      selection.some((w) => w.word.startsWith("risky")),
      "with enough aggregate risk in the Memorized pool, at least one at-risk word should be reintroduced even though the ratio itself is 100% new"
    );
  } finally {
    L.CONFIG.autoBalanceReintroduceMaxShare = originalMaxShare;
  }
});

test("selectQuestions returns an empty list (not an error) when every ratio slider is 0%", () => {
  const selection = L.selectQuestions({
    pool: makePool(5, 4, "x"),
    historyStore: {},
    ratio: { new: 0, incorrect: 0, learning: 0 },
    random: seededRandom(1),
  });
  assert.deepEqual(selection, []);
});

/* ================= Auto-balance mode ratio ================= */

test("computeAutoBalanceRatio is all-new when there is no review backlog at all", () => {
  const ratio = L.computeAutoBalanceRatio({ new: 300, incorrect: 0, learning: 0 });
  assert.deepEqual(ratio, { new: 1, incorrect: 0, learning: 0 });
});

test("computeAutoBalanceRatio is all-review once there are no new words left to introduce", () => {
  const ratio = L.computeAutoBalanceRatio({ new: 0, incorrect: 10, learning: 5 });
  assert.equal(ratio.new, 0);
  assert.ok(ratio.incorrect > 0 && ratio.learning > 0);
  assert.ok(Math.abs(ratio.incorrect + ratio.learning - 1) < 1e-9);
});

test("computeAutoBalanceRatio never goes to a flat equal three-way split - review share scales with backlog size, not a fixed target", () => {
  const smallBacklog = L.computeAutoBalanceRatio({ new: 500, incorrect: 2, learning: 1 });
  const bigBacklog = L.computeAutoBalanceRatio({ new: 500, incorrect: 200, learning: 100 });
  assert.ok(smallBacklog.new > 0.8, "a tiny backlog against a huge new-word pool should stay mostly new words");
  assert.ok(bigBacklog.new < smallBacklog.new, "a much bigger backlog should pull review share up (and new share down)");
  // Never fully saturates to 0% new even under a very heavy backlog - some
  // new words should always keep trickling in.
  assert.ok(bigBacklog.new > 0);
});

test("computeAutoBalanceRatio leans the review share toward incorrect over learning at equal counts", () => {
  const ratio = L.computeAutoBalanceRatio({ new: 100, incorrect: 10, learning: 10 });
  assert.ok(ratio.incorrect > ratio.learning, "still-wrong words should get more of the review share than almost-there words");
});

test("computeAutoBalanceRatio at a fully saturated backlog approaches CONFIG.autoBalanceMaxReviewShare, not the old fixed 75% ceiling", () => {
  const ratio = L.computeAutoBalanceRatio({ new: 500, incorrect: 400, learning: 200 }); // backlog 600 >> autoBalanceBacklogSaturation (40) -> fully saturated
  assert.ok(
    Math.abs(ratio.incorrect + ratio.learning - L.CONFIG.autoBalanceMaxReviewShare) < 1e-9,
    `a fully saturated backlog should hit exactly the configured ceiling (${L.CONFIG.autoBalanceMaxReviewShare}), got ${ratio.incorrect + ratio.learning}`
  );
  assert.ok(ratio.new > 0, "some new-word share should always remain when new words are still available, however small");
  assert.ok(ratio.new < 0.25, "a saturated backlog should no longer be held back by anything resembling the old fixed 25% new-word floor");
});

test("computeAutoBalanceRatio at a tiny backlog against a huge new-word pool hits the configured floor, not more", () => {
  const ratio = L.computeAutoBalanceRatio({ new: 1000, incorrect: 1, learning: 0 }); // backlog 1, minimal pressure
  const reviewShare = ratio.incorrect + ratio.learning;
  assert.ok(reviewShare >= L.CONFIG.autoBalanceMinReviewShare - 1e-9, `review share should never drop below the configured floor (got ${reviewShare})`);
  assert.ok(reviewShare < L.CONFIG.autoBalanceMinReviewShare + 0.05, `a single-word backlog should sit right at the floor, not meaningfully above it (got ${reviewShare})`);
});

test("computeAutoBalanceRatio's three shares always sum to 1 across a range of counts", () => {
  const cases = [
    { new: 0, incorrect: 0, learning: 0 },
    { new: 50, incorrect: 0, learning: 0 },
    { new: 0, incorrect: 5, learning: 0 },
    { new: 0, incorrect: 0, learning: 5 },
    { new: 20, incorrect: 20, learning: 20 },
    { new: 1000, incorrect: 3, learning: 400 },
  ];
  for (const c of cases) {
    const r = L.computeAutoBalanceRatio(c);
    assert.ok(Math.abs(r.new + r.incorrect + r.learning - 1) < 1e-9, JSON.stringify(c));
  }
});

test("computeAutoBalanceRatioForPool derives counts from a pool + historyStore, matching computeAutoBalanceRatio on those counts", () => {
  const historyStore = {};
  const incorrectWords = makePool(10, 4, "bad");
  const learningWords = makePool(5, 5, "mid");
  const newWords = makePool(100, 6, "new");
  for (const w of incorrectWords) {
    const h = L.createEmptyWordHistory(w.word, w.level, w.word.length);
    L.recordAttempt(h, { correct: false, responseMs: 900, timestamp: 1000, level: w.level, length: w.word.length });
    historyStore[w.word.toLowerCase()] = h;
  }
  for (const w of learningWords) {
    const h = L.createEmptyWordHistory(w.word, w.level, w.word.length);
    L.recordAttempt(h, { correct: false, responseMs: 900, timestamp: 900, level: w.level, length: w.word.length });
    L.recordAttempt(h, { correct: true, responseMs: 900, timestamp: 1000, level: w.level, length: w.word.length });
    historyStore[w.word.toLowerCase()] = h;
  }
  const pool = incorrectWords.concat(learningWords, newWords);
  const fromPool = L.computeAutoBalanceRatioForPool(pool, historyStore);
  const direct = L.computeAutoBalanceRatio({ new: 100, incorrect: 10, learning: 5 });
  assert.deepEqual(fromPool, direct);
});

/* ================= Backlog pressure weighting: severity, not just headcount
   (computeBacklogPressure) ================= */

test("computeBacklogPressure gives a word missed once the same baseline weight as before (1 per word) - purely additive, no regression for the common case", () => {
  const historyStore = {};
  const words = makePool(5, 4, "once");
  for (const w of words) {
    const h = L.createEmptyWordHistory(w.word, w.level, w.word.length);
    L.recordAttempt(h, { correct: false, timestamp: 1000, level: w.level, length: w.word.length });
    historyStore[w.word.toLowerCase()] = h;
  }
  assert.equal(L.computeBacklogPressure(words, historyStore, 2000), 5);
});

test("computeBacklogPressure weighs a word missed several times in a row higher than one missed just once, capped so it can't dwarf the rest", () => {
  const historyStore = {};
  const onceWord = makeWord("slip", 4);
  const h1 = L.createEmptyWordHistory("slip", 4, 4);
  L.recordAttempt(h1, { correct: false, timestamp: 1000, level: 4, length: 4 });
  historyStore.slip = h1;

  const entrenchedWord = makeWord("stuck", 4);
  const h2 = L.createEmptyWordHistory("stuck", 4, 5);
  for (let i = 0; i < 8; i++) L.recordAttempt(h2, { correct: false, timestamp: 1000 + i * 1000, level: 4, length: 5 });
  historyStore.stuck = h2;

  const oncePressure = L.computeBacklogPressure([onceWord], historyStore, 20000);
  const entrenchedPressure = L.computeBacklogPressure([entrenchedWord], historyStore, 20000);
  assert.equal(oncePressure, 1);
  assert.ok(entrenchedPressure > oncePressure, "8 consecutive misses should weigh more than 1");
  const expectedCapped = 1 + L.CONFIG.backlogSeverityCap * L.CONFIG.backlogSeverityWeightPerMiss;
  assert.ok(Math.abs(entrenchedPressure - expectedCapped) < 1e-9, "severity weight should be capped, not grow unbounded with the streak");
});

test("computeBacklogPressure gives a plain 'learning' word (currently correct, no miss streak) the same baseline weight as a word missed just once", () => {
  const historyStore = {};
  const learningWord = makeWord("recovering", 4);
  const learningHistory = L.createEmptyWordHistory("recovering", 4, 10);
  play(learningHistory, [{ correct: false }, { correct: true }]); // "learning" - recovering from a mistake
  historyStore.recovering = learningHistory;

  assert.equal(L.classifyState(learningHistory), "learning");
  assert.equal(L.computeBacklogPressure([learningWord], historyStore, 20000), 1);
});

test("computeAutoBalanceRatioForPool gives a more severe backlog a higher review share than an equally-SIZED but mild one - the fix for 'balancing only looks at headcount'", () => {
  const mildStore = {};
  const severeStore = {};
  const mildWords = makePool(10, 4, "mild");
  const severeWords = makePool(10, 4, "severe");
  for (const w of mildWords) {
    const h = L.createEmptyWordHistory(w.word, w.level, w.word.length);
    L.recordAttempt(h, { correct: false, timestamp: 1000, level: w.level, length: w.word.length }); // missed once each
    mildStore[w.word.toLowerCase()] = h;
  }
  for (const w of severeWords) {
    const h = L.createEmptyWordHistory(w.word, w.level, w.word.length);
    for (let i = 0; i < 6; i++) L.recordAttempt(h, { correct: false, timestamp: 1000 + i * 1000, level: w.level, length: w.word.length }); // missed 6x running each
    severeStore[w.word.toLowerCase()] = h;
  }
  const newWords = makePool(200, 6, "new");
  const mildRatio = L.computeAutoBalanceRatioForPool(mildWords.concat(newWords), mildStore, 20000);
  const severeRatio = L.computeAutoBalanceRatioForPool(severeWords.concat(newWords), severeStore, 20000);
  assert.equal(mildWords.length, severeWords.length, "same backlog SIZE in both cases - only severity differs");
  assert.ok(severeRatio.incorrect > mildRatio.incorrect, `an equally-sized but more entrenched backlog should get a bigger review share (mild=${mildRatio.incorrect}, severe=${severeRatio.incorrect})`);
});

test("computeAutoBalanceRatioForPool: a large due-for-review backlog of already-known words must not drown out a much smaller genuinely-incorrect backlog - the fix for a big vocabulary flooding review with easy words instead of the ones actually still getting missed", () => {
  const historyStore = {};
  // 300 words the learner memorized long ago, all now due for their
  // periodic spaced-repetition check-in - the kind of large "learning"
  // bucket a heavy user with thousands of words accumulates over time.
  const dueWords = makePool(300, 4, "known");
  const now = 3000 + 3 * 24 * 60 * 60 * 1000;
  for (const w of dueWords) {
    const h = L.createEmptyWordHistory(w.word, w.level, w.word.length);
    play(h, [{ correct: true }, { correct: true }]); // memorized at t=3000, due at +3 days
    historyStore[w.word.toLowerCase()] = h;
  }
  // A much smaller set of words the learner is genuinely, currently wrong on.
  const strugglingWords = makePool(15, 4, "struggling");
  for (const w of strugglingWords) {
    const h = L.createEmptyWordHistory(w.word, w.level, w.word.length);
    L.recordAttempt(h, { correct: false, timestamp: 1000, level: w.level, length: w.word.length });
    historyStore[w.word.toLowerCase()] = h;
  }
  const newWords = makePool(2700, 6, "fresh");
  const ratio = L.computeAutoBalanceRatioForPool(dueWords.concat(strugglingWords, newWords), historyStore, now);
  assert.ok(
    ratio.incorrect > ratio.learning,
    `15 genuinely-wrong words should still outweigh 300 easy due-for-review words in review share (incorrect=${ratio.incorrect}, learning=${ratio.learning})`
  );
});

/* ================= Manual "review this again" marking ================= */

test("setMarked flags a word and isMarked reflects it; unmarking clears it back to 0", () => {
  const h = L.createEmptyWordHistory("cat", 4, 3);
  assert.equal(L.isMarked(h), false);
  L.setMarked(h, true, 5000);
  assert.equal(h.markedAt, 5000);
  assert.equal(L.isMarked(h), true);
  L.setMarked(h, false);
  assert.equal(h.markedAt, 0);
  assert.equal(L.isMarked(h), false);
});

test("setMarked defaults the timestamp to now when marking without one", () => {
  const h = L.createEmptyWordHistory("cat", 4, 3);
  const before = Date.now();
  L.setMarked(h, true);
  assert.ok(h.markedAt >= before);
});

test("marking is independent of state - answering a marked word correctly does not un-mark it", () => {
  const h = L.createEmptyWordHistory("cat", 4, 3);
  L.setMarked(h, true, 1000);
  L.recordAttempt(h, { correct: true, responseMs: 500, timestamp: 2000 });
  L.recordAttempt(h, { correct: true, responseMs: 500, timestamp: 3000 });
  assert.equal(L.classifyState(h), "memorized");
  assert.equal(L.isMarked(h), true, "reaching Memorized must not silently clear a manual mark");
});

test("filterMarked returns only marked words, regardless of their state", () => {
  const historyStore = {};
  const pool = makePool(5, 4, "w");
  // w0: marked + never attempted (still "new"). w2: marked + memorized. Rest: unmarked.
  const h0 = L.createEmptyWordHistory("w0", 4, 2);
  L.setMarked(h0, true, 1000);
  historyStore.w0 = h0;

  const h2 = L.createEmptyWordHistory("w2", 4, 2);
  L.recordAttempt(h2, { correct: true, responseMs: 500, timestamp: 1000 });
  L.recordAttempt(h2, { correct: true, responseMs: 500, timestamp: 2000 });
  L.setMarked(h2, true, 3000);
  historyStore.w2 = h2;

  const h3 = L.createEmptyWordHistory("w3", 4, 2);
  L.recordAttempt(h3, { correct: false, responseMs: 500, timestamp: 1000 });
  historyStore.w3 = h3; // incorrect but NOT marked

  const marked = L.filterMarked(pool, historyStore);
  assert.deepEqual(marked.map((w) => w.word).sort(), ["w0", "w2"]);
});

test("computeWordDetail exposes marked/markedAt so the UI can render a star toggle", () => {
  const historyStore = {};
  const h = L.createEmptyWordHistory("cat", 4, 3);
  L.setMarked(h, true, 7000);
  historyStore.cat = h;
  const detail = L.computeWordDetail({ word: "cat", level: 4, pos: "n.", zh: "貓" }, historyStore);
  assert.equal(detail.marked, true);
  assert.equal(detail.markedAt, 7000);

  const unmarkedDetail = L.computeWordDetail({ word: "dog", level: 4, pos: "n.", zh: "狗" }, {});
  assert.equal(unmarkedDetail.marked, false);
  assert.equal(unmarkedDetail.markedAt, 0);
});

/* ================= Review batching (large-backlog sessions) ================= */

test("recordAttempt also updates lastReviewedAt, same as lastSeen - a quiz attempt counts as reviewing the word", () => {
  const h = L.createEmptyWordHistory("cat", 4, 3);
  assert.equal(h.lastReviewedAt, 0);
  L.recordAttempt(h, { correct: true, responseMs: 500, timestamp: 5000 });
  assert.equal(h.lastReviewedAt, 5000);
});

test("markReviewed sets lastReviewedAt without touching attempts/correctness", () => {
  const h = L.createEmptyWordHistory("cat", 4, 3);
  L.recordAttempt(h, { correct: false, responseMs: 500, timestamp: 1000 });
  L.markReviewed(h, 9000);
  assert.equal(h.lastReviewedAt, 9000);
  assert.equal(h.attempts, 1, "browsing a flashcard must never count as an attempt");
  assert.equal(h.lastResult, "incorrect", "must not touch correctness state");
});

test("markReviewed defaults the timestamp to now when none is given", () => {
  const h = L.createEmptyWordHistory("cat", 4, 3);
  const before = Date.now();
  L.markReviewed(h);
  assert.ok(h.lastReviewedAt >= before);
});

test("selectReviewBatch surfaces never-reviewed words before ones reviewed at all, regardless of pool order", () => {
  const historyStore = {};
  const pool = makePool(10, 4, "w");
  // Every word EXCEPT w7 has been reviewed recently - w7 should always win
  // a 1-word batch.
  for (const w of pool) {
    if (w.word === "w7") continue;
    const h = L.createEmptyWordHistory(w.word, w.level, w.word.length);
    L.markReviewed(h, 500000);
    historyStore[w.word.toLowerCase()] = h;
  }
  const batch = L.selectReviewBatch(pool, historyStore, 1, seededRandom(1));
  assert.equal(batch.length, 1);
  assert.equal(batch[0].word, "w7");
});

test("selectReviewBatch orders strictly by lastReviewedAt ascending (oldest/never-reviewed first)", () => {
  const historyStore = {};
  const pool = makePool(6, 4, "w");
  const timestamps = [5000, 1000, 4000, 0, 3000, 2000]; // w0..w5
  pool.forEach((w, i) => {
    if (timestamps[i] === 0) return; // leave w3 at the default 0 (never reviewed)
    const h = L.createEmptyWordHistory(w.word, w.level, w.word.length);
    L.markReviewed(h, timestamps[i]);
    historyStore[w.word.toLowerCase()] = h;
  });
  const batch = L.selectReviewBatch(pool, historyStore, 6, seededRandom(3));
  const order = batch.map((w) => w.word);
  assert.deepEqual(order, ["w3", "w1", "w5", "w4", "w2", "w0"]);
});

test("selectReviewBatch caps at the requested size and never duplicates a word", () => {
  const pool = makePool(50, 4, "w");
  const batch = L.selectReviewBatch(pool, {}, 20, seededRandom(7));
  assert.equal(batch.length, 20);
  assert.equal(new Set(batch.map((w) => w.word)).size, 20);
});

test("selectReviewBatch returns the whole pool (not padded/duplicated) when size exceeds it", () => {
  const pool = makePool(5, 4, "w");
  const batch = L.selectReviewBatch(pool, {}, 20, seededRandom(2));
  assert.equal(batch.length, 5);
  assert.equal(new Set(batch.map((w) => w.word)).size, 5);
});

test("selectReviewBatch randomizes order among words with the same lastReviewedAt (e.g. all never-reviewed) rather than always returning pool order", () => {
  const pool = makePool(30, 4, "w"); // none reviewed - all tied at 0
  const first = L.selectReviewBatch(pool, {}, 30, seededRandom(11)).map((w) => w.word);
  const second = L.selectReviewBatch(pool, {}, 30, seededRandom(12)).map((w) => w.word);
  assert.notDeepEqual(first, second, "two different random seeds should not produce the identical order every time");
});

/* ================= Predicting difficulty of never-attempted words ================= */

test("bigramsOf splits a word into consecutive letter pairs", () => {
  assert.deepEqual(L.bigramsOf("quiet"), ["qu", "ui", "ie", "et"]);
  assert.deepEqual(L.bigramsOf("a"), []);
});

test("bigramSimilarity is 1 for identical spelling, 0 for no shared letter-pairs, and in between for partial overlap", () => {
  assert.equal(L.bigramSimilarity("cat", "cat"), 1);
  assert.equal(L.bigramSimilarity("cat", "dog"), 0);
  // quiet=[qu,ui,ie,et], quiz=[qu,ui,iz] - share "qu","ui" (2 of a 5-bigram union)
  assert.ok(Math.abs(L.bigramSimilarity("quiet", "quiz") - 0.4) < 1e-9);
});

test("hasDoubledLetter finds an immediately-repeated letter, ignoring words without one", () => {
  assert.equal(L.hasDoubledLetter("occurred"), true);
  assert.equal(L.hasDoubledLetter("necessary"), true);
  assert.equal(L.hasDoubledLetter("cat"), false);
  assert.equal(L.hasDoubledLetter(""), false);
});

test("computeDifficultyBaseline is null with no attempted words at all", () => {
  assert.equal(L.computeDifficultyBaseline({}), null);
});

test("computeDifficultyBaseline falls back to a flat average below the min-sample threshold, regardless of length", () => {
  const historyStore = {};
  const rows = [
    { word: "ab", length: 2, attempts: 4, incorrect: 1, level: 4 }, // 25% error
    { word: "abcdefghij", length: 10, attempts: 4, incorrect: 3, level: 4 }, // 75% error
  ];
  for (const r of rows) {
    const h = L.createEmptyWordHistory(r.word, r.level, r.length);
    h.attempts = r.attempts;
    h.incorrect = r.incorrect;
    h.correct = r.attempts - r.incorrect;
    historyStore[r.word] = h;
  }
  const baseline = L.computeDifficultyBaseline(historyStore);
  assert.ok(baseline);
  const expectedFlat = (0.25 + 0.75) / 2;
  // Both rows share the same level, so the level-group average equals the
  // overall average and its shrunk deviation is exactly 0 either way.
  assert.ok(Math.abs(baseline.predict("ab", 4) - expectedFlat) < 1e-9);
  assert.ok(Math.abs(baseline.predict("abcdefghij", 4) - expectedFlat) < 1e-9);
});

test("computeDifficultyBaseline predicts a higher error rate for longer words once there's enough data to fit a real trend", () => {
  const historyStore = {};
  for (let len = 3; len <= 14; len++) {
    const word = "w".repeat(len);
    const h = L.createEmptyWordHistory(word, 4, len);
    h.attempts = 10;
    const errorRate = Math.min(1, 0.05 + len * 0.05); // scales cleanly with length
    h.incorrect = Math.round(errorRate * 10);
    h.correct = 10 - h.incorrect;
    historyStore[word] = h;
  }
  const baseline = L.computeDifficultyBaseline(historyStore);
  assert.ok(baseline.predict("w".repeat(14), 4) > baseline.predict("w".repeat(4), 4));
});

test("computeDifficultyBaseline predicts a higher error rate for a curriculum level this user actually struggles with more", () => {
  const historyStore = {};
  // 3 easy-level words always right, 3 hard-level words always wrong -
  // enough samples per group for the shrinkage factor to trust the gap,
  // but too few total points (6 < minSamplesForLengthTrend) to also fit a
  // length trend, isolating the level effect being tested here.
  for (let i = 0; i < 3; i++) {
    const easyWord = "ez" + i;
    const h = L.createEmptyWordHistory(easyWord, 4, easyWord.length);
    h.attempts = 1; h.correct = 1; h.incorrect = 0;
    historyStore[easyWord] = h;
  }
  for (let i = 0; i < 3; i++) {
    const hardWord = "hd" + i;
    const h = L.createEmptyWordHistory(hardWord, 6, hardWord.length);
    h.attempts = 1; h.correct = 0; h.incorrect = 1;
    historyStore[hardWord] = h;
  }
  const baseline = L.computeDifficultyBaseline(historyStore);
  assert.ok(baseline.predict("newword", 6) > baseline.predict("newword", 4));
});

test("computeDifficultyBaseline shrinks a level's deviation toward the average when that level has barely any data, unlike a well-sampled level with the same observed gap", () => {
  const historyStore = {};
  // Level 6: only 1 sample, 100% wrong. Level 5: 20 samples, 100% wrong.
  // Both observe the identical (extreme) local error rate, but the
  // single-sample level should barely move away from the overall average
  // while the well-sampled one moves close to its full observed rate.
  // Every entry is forced to the same length (6) so there's no length
  // trend to fit either (identical x values make the regression
  // denominator 0), isolating the level effect being tested here.
  const sparse = L.createEmptyWordHistory("sparse", 6, 6);
  sparse.attempts = 1; sparse.correct = 0; sparse.incorrect = 1;
  historyStore.sparse = sparse;
  for (let i = 0; i < 20; i++) {
    const w = "rich" + i;
    const h = L.createEmptyWordHistory(w, 5, 6);
    h.attempts = 1; h.correct = 0; h.incorrect = 1;
    historyStore[w] = h;
  }
  // A few correct words too, so the overall average isn't just 1.0 (which
  // would make every deviation collapse to 0 regardless of shrinkage).
  for (let i = 0; i < 5; i++) {
    const w = "ok" + i;
    const h = L.createEmptyWordHistory(w, 4, 6);
    h.attempts = 1; h.correct = 1; h.incorrect = 0;
    historyStore[w] = h;
  }
  const baseline = L.computeDifficultyBaseline(historyStore);
  const overallAvg = 21 / 26; // 1 sparse wrong + 20 rich wrong + 5 ok right, all out of 26
  const sparseGap = Math.abs(baseline.predict("xxxxxx", 6) - overallAvg);
  const richGap = Math.abs(baseline.predict("xxxxxx", 5) - overallAvg);
  assert.ok(sparseGap < richGap, `a 1-sample level should sit closer to the average than a 20-sample level with the same observed rate (sparseGap=${sparseGap}, richGap=${richGap})`);
});

test("computeDifficultyBaseline predicts a higher error rate for words with a doubled letter once there's enough data in both groups", () => {
  const historyStore = {};
  // Every entry forced to the same length (8) so there's no length trend
  // to fit (identical x values make the regression denominator 0),
  // isolating the doubled-letter effect being tested here. "accurate"
  // deliberately excluded from the single-letter group - it contains "cc"
  // and would otherwise get bucketed as doubled by the code regardless of
  // which list it's typed into here.
  const doubled = ["occurred", "necessary", "possess", "recommend"];
  const single = ["absolute", "abstract", "academic", "adequate"];
  for (const w of doubled) {
    const h = L.createEmptyWordHistory(w, 4, 8);
    h.attempts = 1; h.correct = 0; h.incorrect = 1;
    historyStore[w] = h;
  }
  for (const w of single) {
    const h = L.createEmptyWordHistory(w, 4, 8);
    h.attempts = 1; h.correct = 1; h.incorrect = 0;
    historyStore[w] = h;
  }
  const baseline = L.computeDifficultyBaseline(historyStore);
  assert.ok(baseline.predict("committee", 4) > baseline.predict("elephant", 4));
});

test("computeDifficultyBaseline predicts a higher error rate for a part of speech this user actually struggles with more, and is a no-op when pos is omitted or unrecognized", () => {
  const historyStore = {};
  for (let i = 0; i < 6; i++) {
    const w = `verb${i}`;
    const h = L.createEmptyWordHistory(w, 4, 6);
    h.attempts = 1; h.correct = 0; h.incorrect = 1; h.pos = "v.";
    historyStore[w] = h;
  }
  for (let i = 0; i < 6; i++) {
    const w = `noun${i}`;
    const h = L.createEmptyWordHistory(w, 4, 6);
    h.attempts = 1; h.correct = 1; h.incorrect = 0; h.pos = "n.";
    historyStore[w] = h;
  }
  const baseline = L.computeDifficultyBaseline(historyStore);
  assert.ok(baseline.predict("newverb", 4, "v.") > baseline.predict("newnoun", 4, "n."), "a pos this user consistently misses should predict higher risk than one they consistently get right");
  // Omitted/unrecognized pos should fall back to the same risk as no pos effect at all - never throw, never apply a bogus deviation.
  const noPos = baseline.predict("newword", 4);
  const unknownPos = baseline.predict("newword", 4, "interjection");
  assert.equal(noPos, unknownPos);
});

test("computeInterferenceModel is null below the minimum struggling-word count", () => {
  const historyStore = {};
  for (const w of ["light", "might"]) { // only 2, below minStruggleWordsForInterference (3)
    const h = L.createEmptyWordHistory(w, 4, w.length);
    h.attempts = 1; h.incorrect = 1; h.lastResult = "incorrect";
    historyStore[w] = h;
  }
  assert.equal(L.computeInterferenceModel(historyStore), null);
});

test("computeInterferenceModel scores a word orthographically similar to the user's struggling words higher than a dissimilar one", () => {
  const historyStore = {};
  for (const w of ["light", "might", "right"]) {
    const h = L.createEmptyWordHistory(w, 4, w.length);
    h.attempts = 1; h.incorrect = 1; h.lastResult = "incorrect";
    historyStore[w] = h;
  }
  const model = L.computeInterferenceModel(historyStore);
  assert.ok(model);
  assert.ok(model.risk("fight") > model.risk("orange"), "\"fight\" shares -ight with every struggling word; \"orange\" shares nothing");
});

test("predictWordDifficulty falls back to the baseline alone when there's no history or interference model yet", () => {
  const baseline = { predict: () => 0.3 };
  assert.equal(L.predictWordDifficulty("anything", 4, null, baseline, null), 0.3);
});

test("predictWordDifficulty blends the baseline and interference signal using CONFIG's own weights", () => {
  const baseline = { predict: () => 0.2 };
  const interferenceModel = { risk: () => 1 };
  const risk = L.predictWordDifficulty("word", 4, null, baseline, interferenceModel);
  const expected = 0.2 * L.CONFIG.difficultyBaselineWeight + 1 * L.CONFIG.difficultyInterferenceWeight;
  assert.ok(Math.abs(risk - expected) < 1e-9);
});

test("predictWordDifficulty leans toward a word's OWN empirical error rate as real attempts accumulate on it, rather than the generic baseline alone", () => {
  const baseline = { predict: () => 0.1 }; // generic prediction: low risk
  // This exact word, though, has actually been gotten wrong every time.
  const risk1 = L.predictWordDifficulty("word", 4, { attempts: 1, incorrect: 1 }, baseline, null);
  const risk20 = L.predictWordDifficulty("word", 4, { attempts: 20, incorrect: 20 }, baseline, null);
  assert.ok(risk20 > risk1, "20 confirmed wrong attempts should move the estimate further than just 1");
  assert.ok(risk20 > baseline.predict(), "with plenty of its own (bad) data, the word's own record should dominate the generic 0.1 baseline");
});

/* ================= Decayed Bayesian mastery (computeWordMastery/masteryMean) -
   replaces the old raw "2 correct in a row" streak as classifyState's
   memorized/learning boundary; see CONFIG's own "masteryDecay" comment for why. ================= */

test("computeWordMastery falls back to a Laplace-smoothed lifetime ratio when there's no recentAttempts ring buffer, deriving 'correct' from 'incorrect' if that's all a fixture sets", () => {
  assert.deepEqual(L.computeWordMastery(null), { alpha: L.CONFIG.masteryPriorAlpha, beta: L.CONFIG.masteryPriorBeta });
  assert.deepEqual(L.computeWordMastery({ attempts: 0 }), { alpha: L.CONFIG.masteryPriorAlpha, beta: L.CONFIG.masteryPriorBeta });

  const oftenWrong = L.computeWordMastery({ attempts: 10, incorrect: 9 });
  const rarelyWrong = L.computeWordMastery({ attempts: 10, incorrect: 1 });
  assert.ok(oftenWrong.alpha / (oftenWrong.alpha + oftenWrong.beta) < rarelyWrong.alpha / (rarelyWrong.alpha + rarelyWrong.beta));
});

test("computeWordMastery replays a recentAttempts ring buffer through the same decay recurrence as recordAttempt, so recency still matters without a cached masteryAlpha/masteryBeta", () => {
  const improving = { recentAttempts: [
    { correct: false }, { correct: false }, { correct: false }, { correct: false },
    { correct: true }, { correct: true }, { correct: true }, { correct: true },
  ] };
  const slipping = { recentAttempts: [
    { correct: true }, { correct: true }, { correct: true }, { correct: true },
    { correct: false }, { correct: false }, { correct: false }, { correct: false },
  ] };
  const improvingMean = L.masteryMean(improving);
  const slippingMean = L.masteryMean(slipping);
  assert.ok(improvingMean > 0.5, `recently-improved word should read as HIGHER mastery than a flat 50% lifetime rate (got ${improvingMean})`);
  assert.ok(slippingMean < 0.5, `recently-slipping word should read as LOWER mastery than a flat 50% lifetime rate (got ${slippingMean})`);
});

test("computeWordMastery/masteryMean (used for risk PREDICTION, not the memorized label) credits lifetime evidence OUTSIDE the ring buffer before replaying it, so a word attempted many more times than maxRecentAttempts holds doesn't have its whole established record wiped by one old miss still sitting in that window", () => {
  // 15 lifetime attempts, 14 correct: 3 corrects aged out of the 12-slot
  // ring buffer, then 1 wrong, then 11 more corrects - so the ring buffer
  // (last 12) holds exactly 1 wrong + 11 correct, but the word's REAL
  // record is 14/15 (93%), not the ~92% the ring buffer alone would show
  // either - the point is the older 3 corrects must still count.
  const recentAttempts = [{ correct: false }];
  for (let i = 0; i < 11; i++) recentAttempts.push({ correct: true });
  const staleImport = { attempts: 15, correct: 14, incorrect: 1, recentAttempts: recentAttempts, lastResult: "correct" };

  // Sanity check the fix is actually doing something: crediting ZERO older
  // evidence (the ring buffer alone) would understate this word's real
  // reliability - which matters because masteryMean is what
  // predictWordDifficulty (and, through it, auto mode's Memorized-word
  // reintroduction ranking) uses to judge how at-risk a word really is.
  const ringBufferAlone = { recentAttempts: recentAttempts };
  assert.ok(L.masteryMean(staleImport) > L.masteryMean(ringBufferAlone), "crediting the older evidence should read as more confident than the ring buffer alone");
  assert.ok(L.masteryMean(staleImport) > 0.85, `a genuinely 14/15 word should read as high-confidence, not just barely above the ring-buffer-only estimate (got ${L.masteryMean(staleImport)})`);
});

/* ================= recalibrateAllMasteryFromEvidence - the full (both-
   directions) catch-up pass used when CONFIG.masteryDecay/masteryPriorAlpha/
   masteryPriorBeta change, as opposed to recalibrateWordMastery's permanent,
   upward-only safety net ================= */

test("recalibrateAllMasteryFromEvidence moves a cached mastery value DOWN, not just up, unlike recalibrateWordMastery - proving it actually re-syncs to the CURRENT config rather than only ever correcting under-seeding", () => {
  const h = L.createEmptyWordHistory("shifted", 4, 7);
  Object.assign(h, {
    attempts: 3, correct: 3, incorrect: 0, lastResult: "correct",
    recentAttempts: [{ correct: true }, { correct: true }, { correct: true }],
    // Cached value far more confident than deriveMasteryFromEvidence would
    // ever compute from this history under the CURRENT config - simulating
    // a value seeded under some very different old decay/prior.
    masteryAlpha: 50, masteryBeta: 0.01,
  });
  const beforeMean = L.masteryMean(h);

  // Sanity check recalibrateWordMastery's own contrasting behavior first:
  // it must refuse to touch this (recomputing from evidence reads as LESS
  // confident than the inflated cached value, and it only ever moves up).
  assert.equal(L.recalibrateWordMastery(h), null, "the upward-only safety net must not touch an over-confident cached value");

  const store = { shifted: h };
  L.recalibrateAllMasteryFromEvidence(store);
  assert.ok(L.masteryMean(store.shifted) < beforeMean, "the full recompute should pull an over-confident cached value back down to match real evidence");
});

test("recalibrateAllMasteryFromEvidence leaves never-attempted words alone and only touches entries with real attempts", () => {
  const store = {
    fresh: L.createEmptyWordHistory("fresh", 4, 5),
    seen: Object.assign(L.createEmptyWordHistory("seen", 4, 4), {
      attempts: 1, correct: 1, incorrect: 0, lastResult: "correct",
      recentAttempts: [{ correct: true }],
      masteryAlpha: 1, masteryBeta: 1, // stale/neutral, should move toward the real evidence
    }),
  };
  L.recalibrateAllMasteryFromEvidence(store);
  assert.equal(store.fresh.masteryAlpha, null, "a never-attempted word must not be seeded by this pass");
  assert.equal(store.fresh.masteryBeta, null);
  assert.notEqual(store.seen.masteryAlpha, 1, "an attempted word's stale cached value should be replaced by the fresh recompute");
});

test("classifyState: a word with a long, strong track record still needs a fresh 2-in-a-row after a single slip, same as any other word with a mistake in its history - no shortcut via the risk-prediction estimate", () => {
  const h = L.createEmptyWordHistory("steady", 4, 6);
  const results = [];
  for (let i = 0; i < 10; i++) results.push({ correct: true });
  play(h, results);
  assert.equal(L.classifyState(h), "memorized", "10 straight corrects on a clean-record word is solidly memorized");

  play(h, [{ correct: false }]);
  assert.equal(L.classifyState(h), "incorrect", "the miss itself is still immediately flagged incorrect");

  play(h, [{ correct: true }]);
  assert.equal(L.classifyState(h), "learning", "this word now has a mistake in its history, so it needs 2 in a row like any other - just 1 isn't enough");

  play(h, [{ correct: true }]);
  assert.equal(L.classifyState(h), "memorized", "2 in a row since the slip restores Memorized");
});

test("classifyState: 2 fresh correct answers in a row are UNCONDITIONALLY memorized even with older mistakes in the word's history - the streak requirement never grows past 2 no matter how many past mistakes there were", () => {
  const h = L.createEmptyWordHistory("recovering", 4, 10);
  play(h, [{ correct: false }, { correct: false }]);
  assert.equal(L.classifyState(h), "incorrect");

  play(h, [{ correct: true }, { correct: true }]);
  assert.equal(L.classifyState(h), "memorized", "2 fresh correct answers in a row must be Memorized regardless of the 2 earlier misses");
});

test("classifyState: a word answered correctly ~55% of the time, never two-in-a-row, stays 'learning' the whole time (once it's ever been wrong, it takes a real 2-streak, not partial credit)", () => {
  const h = L.createEmptyWordHistory("middling", 4, 8);
  // Deterministic ~55% pattern (9/16), alternating enough that
  // correctStreak never reaches 2.
  const pattern = [true, true, false, true, false, true, false, true, false, true, false, true, false, true, false, true];
  for (const correct of pattern) play(h, [{ correct: correct }]);
  assert.ok(h.correctStreak < L.CONFIG.memorizedStreak, "sanity check: this pattern must never let the streak path fire on its own");
  assert.equal(L.classifyState(h), "learning");
});

test("predictWordDifficulty uses the recency-weighted rate (not the flat lifetime ratio) once a history has a recentAttempts ring buffer", () => {
  const baseline = { predict: () => 0.1 };
  // Same lifetime 50/50 split either way - only the ORDER of recent attempts differs.
  const stillStruggling = {
    attempts: 8, incorrect: 4,
    recentAttempts: [{ correct: true }, { correct: true }, { correct: true }, { correct: true }, { correct: false }, { correct: false }, { correct: false }, { correct: false }],
  };
  const recovered = {
    attempts: 8, incorrect: 4,
    recentAttempts: [{ correct: false }, { correct: false }, { correct: false }, { correct: false }, { correct: true }, { correct: true }, { correct: true }, { correct: true }],
  };
  const riskStillStruggling = L.predictWordDifficulty("word", 4, stillStruggling, baseline, null);
  const riskRecovered = L.predictWordDifficulty("word", 4, recovered, baseline, null);
  assert.ok(riskStillStruggling > riskRecovered, "identical lifetime ratios should still diverge once recency is taken into account");
});

test("the unified priority pipeline (buildPriorityModels + computeSelectionWeight) falls back to an effectively uniform shuffle (still a full, non-duplicated permutation) with no data at all", () => {
  const pool = makePool(10, 4, "w");
  const models = L.buildPriorityModels({});
  const weights = pool.map((w) => L.computeSelectionWeight(w, null, models, Date.now()));
  const ranked = L.weightedShuffle(pool, weights, seededRandom(1));
  assert.equal(ranked.length, 10);
  assert.equal(new Set(ranked.map((w) => w.word)).size, 10);
});

test("the unified priority pipeline surfaces a never-attempted word similar to the user's struggling words first far more often than a dissimilar one, but not every single time", () => {
  const historyStore = {};
  // Struggling (interference-eligible) but error-rate-neutral, so this
  // scenario isolates the interference signal from the baseline one.
  for (const w of ["light", "might", "right"]) {
    const h = L.createEmptyWordHistory(w, 4, w.length);
    h.attempts = 1; h.incorrect = 0; h.correct = 1; h.lastResult = "incorrect";
    historyStore[w] = h;
  }
  const hardWord = makeWord("fight", 4); // shares "-ight" with every struggling word
  const easyWord = makeWord("orange", 4); // shares nothing
  const pool = [hardWord, easyWord];
  const models = L.buildPriorityModels(historyStore);
  const now = Date.now();
  const weights = pool.map((w) => L.computeSelectionWeight(w, null, models, now));

  // One generator reused across all trials (not reseeded per trial): a
  // freshly-seeded LCG's consecutive draws are correlated for small
  // sequential seeds, which would otherwise skew a test this sensitive.
  const rnd = seededRandom(42);
  let hardFirstCount = 0;
  const trials = 300;
  for (let i = 0; i < trials; i++) {
    const ranked = L.weightedShuffle(pool, weights, rnd);
    if (ranked[0].word === "fight") hardFirstCount += 1;
  }
  const rate = hardFirstCount / trials;
  assert.ok(rate > 0.6, `predicted-harder word should lead the majority of the time (rate=${rate})`);
  assert.ok(rate < 1, "should not be rigidly deterministic every single trial");
});

test("the unified priority pipeline surfaces an ALREADY-ATTEMPTED word the user keeps getting wrong first far more often than one they usually get right, but not every single time", () => {
  const historyStore = {};
  const oftenWrong = L.createEmptyWordHistory("stubborn", 5, 8);
  oftenWrong.attempts = 8; oftenWrong.incorrect = 7; oftenWrong.correct = 1; oftenWrong.lastResult = "incorrect";
  historyStore.stubborn = oftenWrong;
  const usuallyRight = L.createEmptyWordHistory("simple", 4, 6);
  usuallyRight.attempts = 8; usuallyRight.incorrect = 1; usuallyRight.correct = 7; usuallyRight.lastResult = "learning";
  historyStore.simple = usuallyRight;

  const pool = [makeWord("stubborn", 5), makeWord("simple", 4)];
  const models = L.buildPriorityModels(historyStore);
  const now = Date.now();
  const weights = pool.map((w) => L.computeSelectionWeight(w, historyStore[w.word], models, now));

  const rnd = seededRandom(7);
  let wrongFirstCount = 0;
  const trials = 300;
  for (let i = 0; i < trials; i++) {
    const ranked = L.weightedShuffle(pool, weights, rnd);
    if (ranked[0].word === "stubborn") wrongFirstCount += 1;
  }
  const rate = wrongFirstCount / trials;
  assert.ok(rate > 0.6, `the word this user actually keeps missing should lead the majority of the time (rate=${rate})`);
  assert.ok(rate < 1, "should not be rigidly deterministic every single trial");
});

/* ================= AI-generated signals (data/ai_signals.json) ================= */

test("computeInterferenceModel adds an AI-flagged semantic-confusion signal on top of (not instead of) the existing orthographic one", () => {
  const historyStore = {};
  for (const w of ["big", "cat", "dog"]) { // 3 struggling words, meets the minimum
    const h = L.createEmptyWordHistory(w, 4, w.length);
    h.attempts = 1; h.incorrect = 1; h.lastResult = "incorrect";
    historyStore[w] = h;
  }
  // "large" shares no bigrams at all with any struggling word - isolates the
  // semantic signal from the orthographic one (independently confirmed via
  // bigramSimilarity, not assumed).
  assert.equal(L.bigramSimilarity("large", "big"), 0);
  assert.equal(L.bigramSimilarity("large", "cat"), 0);
  assert.equal(L.bigramSimilarity("large", "dog"), 0);

  const aiSignals = { big: { confusedWith: ["large"], mnemonic: "", priorDifficulty: 0.5 } };
  const model = L.computeInterferenceModel(historyStore, aiSignals);
  assert.ok(model);
  // Zero orthographic overlap + the semantic flag -> exactly the semantic weight.
  assert.ok(Math.abs(model.risk("large") - L.CONFIG.difficultySemanticWeight) < 1e-9);
  // A word with neither orthographic nor semantic linkage stays at 0.
  assert.equal(model.risk("zebra"), 0);
});

test("computeInterferenceModel also catches the reverse direction: a word whose OWN confusedWith list names a struggling word", () => {
  const historyStore = {};
  for (const w of ["big", "cat", "dog"]) {
    const h = L.createEmptyWordHistory(w, 4, w.length);
    h.attempts = 1; h.incorrect = 1; h.lastResult = "incorrect";
    historyStore[w] = h;
  }
  // "large" (not "big") carries the confusedWith entry here, naming "big".
  const aiSignals = { large: { confusedWith: ["big"], mnemonic: "", priorDifficulty: 0.5 } };
  const model = L.computeInterferenceModel(historyStore, aiSignals);
  assert.ok(Math.abs(model.risk("large") - L.CONFIG.difficultySemanticWeight) < 1e-9);
});

test("computeInterferenceModel without an aiSignals argument behaves exactly as before (orthographic only)", () => {
  const historyStore = {};
  for (const w of ["light", "might", "right"]) {
    const h = L.createEmptyWordHistory(w, 4, w.length);
    h.attempts = 1; h.incorrect = 1; h.lastResult = "incorrect";
    historyStore[w] = h;
  }
  const model = L.computeInterferenceModel(historyStore);
  assert.ok(model);
  assert.equal(model.risk("orange"), 0);
});

test("computeInterferenceModel's risk() stays fast across a large pool with a realistic struggling backlog (regression guard: risk() used to rebuild every struggling word's bigram set from scratch on every single call, making selectQuestions multiple seconds on a large pool - see rankCandidates/computeSelectionWeight and app.js's rebalanceAutoModeTail, which calls this on every answer in auto mode)", () => {
  const historyStore = {};
  const strugglingWords = makePool(300, 4, "bad").map((w) => w.word);
  for (const w of strugglingWords) {
    const h = L.createEmptyWordHistory(w, 4, w.length);
    h.attempts = 1; h.incorrect = 1; h.lastResult = "incorrect";
    historyStore[w] = h;
  }
  const model = L.computeInterferenceModel(historyStore);
  assert.ok(model);

  const candidates = makePool(3000, 4, "cand").map((w) => w.word);
  const start = Date.now();
  for (const w of candidates) model.risk(w);
  const elapsedMs = Date.now() - start;
  assert.ok(elapsedMs < 300, `risk() over ${candidates.length} candidates x ${strugglingWords.length} struggling words took ${elapsedMs}ms - should stay well under half a second (rebuilding every struggling word's bigram set per call took 500ms+ here)`);
});

test("computeDifficultyBaseline is still null with no attempted words and no usable aiSignals (unchanged pre-AI-signals behavior)", () => {
  assert.equal(L.computeDifficultyBaseline({}), null);
  assert.equal(L.computeDifficultyBaseline({}, {}), null);
});

test("computeDifficultyBaseline uses each word's AI priorDifficulty as a cold-start guess when there's no attempt data anywhere yet", () => {
  const aiSignals = {
    hard: { priorDifficulty: 0.9 },
    easy: { priorDifficulty: 0.1 },
  };
  const baseline = L.computeDifficultyBaseline({}, aiSignals);
  assert.ok(baseline);
  assert.equal(baseline.predict("hard"), 0.9);
  assert.equal(baseline.predict("easy"), 0.1);
  // A word missing from aiSignals falls back to the same flat neutral guess
  // predictWordDifficulty itself uses with no baseline at all.
  assert.equal(baseline.predict("unknown"), 0.15);
});

test("computeDifficultyBaseline shrinks a word's AI priorDifficulty toward the real group average as attempt data accumulates, rather than trusting it forever", () => {
  // n=2 attempted words overall, both level 4, overall/group average error
  // rate exactly 0.5 (same fixture as the "falls back to a flat average"
  // baseline test, so the group-based estimate for "newword" is a known,
  // hand-verified 0.5 with no prior involved).
  const store2 = {};
  const rows2 = [
    { word: "ab", length: 2, attempts: 4, incorrect: 1, level: 4 },
    { word: "abcdefghij", length: 10, attempts: 4, incorrect: 3, level: 4 },
  ];
  for (const r of rows2) {
    const h = L.createEmptyWordHistory(r.word, r.level, r.length);
    h.attempts = r.attempts; h.incorrect = r.incorrect; h.correct = r.attempts - r.incorrect;
    store2[r.word] = h;
  }
  // n=6 attempted words, still level 4 throughout and still a 0.5 overall/
  // group average (3 always-right, 3 always-wrong) - more real data behind
  // the same group estimate.
  const store6 = {};
  for (let i = 0; i < 3; i++) {
    const h = L.createEmptyWordHistory("z" + i, 4, 5);
    h.attempts = 1; h.correct = 1; h.incorrect = 0;
    store6["z" + i] = h;
  }
  for (let i = 0; i < 3; i++) {
    const h = L.createEmptyWordHistory("y" + i, 4, 5);
    h.attempts = 1; h.correct = 0; h.incorrect = 1;
    store6["y" + i] = h;
  }

  const aiSignals = { newword: { priorDifficulty: 1.0 } };
  const baseline2 = L.computeDifficultyBaseline(store2, aiSignals);
  const baseline6 = L.computeDifficultyBaseline(store6, aiSignals);

  // Group estimate (with no prior at all) is exactly 0.5 in both cases -
  // confirms the two fixtures really do isolate sample size as the only
  // difference (hand-verified: shrunk level deviation is 0 either way,
  // since the level-4 group average always equals the overall average).
  assert.equal(L.computeDifficultyBaseline(store2).predict("newword", 4), 0.5);
  assert.equal(L.computeDifficultyBaseline(store6).predict("newword", 4), 0.5);

  // trust = n/(n+K), K = CONFIG.difficultyShrinkageK (6): n=2 -> 0.25,
  // n=6 -> 0.5. blended = groupEstimate*trust + prior*(1-trust).
  assert.ok(Math.abs(baseline2.predict("newword", 4) - 0.875) < 1e-9);
  assert.ok(Math.abs(baseline6.predict("newword", 4) - 0.75) < 1e-9);

  const gapWithLessData = Math.abs(baseline2.predict("newword", 4) - 0.5);
  const gapWithMoreData = Math.abs(baseline6.predict("newword", 4) - 0.5);
  assert.ok(
    gapWithMoreData < gapWithLessData,
    `more accumulated attempt data should pull the AI prior closer to the group average (gapWithLessData=${gapWithLessData}, gapWithMoreData=${gapWithMoreData})`
  );
});

test("the unified priority pipeline (buildPriorityModels + computeSelectionWeight) surfaces a never-attempted word AI-flagged as confused with a struggling word, even with zero orthographic overlap", () => {
  const historyStore = {};
  // Error-rate-neutral (always correct) but still "incorrect"-state, same
  // trick as the earlier orthographic-interference pipeline test, so this
  // isolates the semantic interference signal from the baseline one.
  for (const w of ["big", "cat", "dog"]) {
    const h = L.createEmptyWordHistory(w, 4, w.length);
    h.attempts = 1; h.incorrect = 0; h.correct = 1; h.lastResult = "incorrect";
    historyStore[w] = h;
  }
  const aiSignals = { big: { confusedWith: ["large"], mnemonic: "", priorDifficulty: 0.5 } };
  const confusedWord = makeWord("large", 4); // AI-flagged confusion with "big"; shares no bigrams with it
  const unrelatedWord = makeWord("zebra", 4); // neither orthographically nor semantically linked
  const pool = [confusedWord, unrelatedWord];
  const models = L.buildPriorityModels(historyStore, aiSignals);
  const now = Date.now();
  const weights = pool.map((w) => L.computeSelectionWeight(w, null, models, now));

  const rnd = seededRandom(42);
  let confusedFirstCount = 0;
  const trials = 1000; // more trials than the bigram-only pipeline tests use, since this signal's effect size is smaller (semantic weight 0.3 vs a bigram similarity that can reach 1)
  for (let i = 0; i < trials; i++) {
    const ranked = L.weightedShuffle(pool, weights, rnd);
    if (ranked[0].word === "large") confusedFirstCount += 1;
  }
  const rate = confusedFirstCount / trials;
  assert.ok(rate > 0.55, `the AI-flagged confused word should lead the majority of the time (rate=${rate})`);
  assert.ok(rate < 1, "should not be rigidly deterministic every single trial");
});

/* ================= Persistence / migration / backward compatibility ================= */

test("migrateWordEntry upgrades legacy v1 {box,due,correct,wrong,lastSeen} shape without losing progress", () => {
  const legacy = { box: 3, due: 123456, correct: 5, wrong: 2, lastSeen: 999000 };
  const migrated = L.migrateWordEntry(legacy, "legacy", 5, 6);
  assert.equal(migrated.attempts, 7);
  assert.equal(migrated.correct, 5);
  assert.equal(migrated.incorrect, 2);
  assert.equal(migrated.lastSeen, 999000);
  assert.equal(migrated.word, "legacy");
  assert.equal(migrated.level, 5);
  assert.equal(migrated.lastWrongAnswer, null);
  assert.ok(Array.isArray(migrated.recentAttempts));
});

test("migrateWordEntry upgrades an intermediate score-based v2 entry, dropping unused fields harmlessly", () => {
  const scoreEraEntry = {
    word: "keep", level: 4, length: 4, attempts: 3, correct: 2, incorrect: 1, correctStreak: 0,
    avgCorrectResponseMs: 1200, recentResponseMs: 1300, recentAttempts: [], firstSeen: 100, lastSeen: 200,
    lastResult: "incorrect", inWrongList: true, box: 0, due: 0,
  };
  const migrated = L.migrateWordEntry(scoreEraEntry, "keep", 4, 4);
  assert.equal(migrated.attempts, 3);
  assert.equal(migrated.correct, 2);
  assert.equal(L.classifyState(migrated), "incorrect");
});

test("migrateWordEntry is idempotent on an already-current entry and fills any newly-added defaults", () => {
  const current = L.createEmptyWordHistory("keepme", 4, 6);
  L.recordAttempt(current, { correct: true, responseMs: 1000, timestamp: 1000, level: 4, length: 6 });
  const remigrated = L.migrateWordEntry(current, "keepme", 4, 6);
  assert.equal(remigrated.attempts, current.attempts);
  assert.equal(remigrated.correct, current.correct);
  assert.deepEqual(remigrated.recentAttempts, current.recentAttempts);
});

test("migrateWordEntry actually writes masteryAlpha/masteryBeta (not stray top-level alpha/beta keys) when seeding a pre-mastery entry (regression: applyMastery exists specifically because a bare Object.assign of computeWordMastery's {alpha,beta} result silently missed the real fields)", () => {
  const preMasteryEntry = {
    word: "seedme", level: 4, length: 6, attempts: 2, correct: 2, incorrect: 0,
    recentAttempts: [{ correct: true }, { correct: true }], lastResult: "correct",
  };
  const migrated = L.migrateWordEntry(preMasteryEntry, "seedme", 4, 6);
  assert.equal(typeof migrated.masteryAlpha, "number");
  assert.equal(typeof migrated.masteryBeta, "number");
  assert.equal(migrated.alpha, undefined, "must not leave a stray top-level 'alpha' key behind");
  assert.equal(migrated.beta, undefined, "must not leave a stray top-level 'beta' key behind");
  assert.equal(L.classifyState(migrated), "memorized");
});

test("migrateWordEntry recalibrates an already-cached but under-seeded mastery value upward on every load, without touching a legitimately low one (this feeds risk PREDICTION/reintroduction ranking, not the memorized label, which is streak-only - see classifyState)", () => {
  // An entry whose CACHED masteryAlpha/masteryBeta under-reports its real
  // 4/5 lifetime record (the exact under-seeding scenario computeWordMastery's
  // older-evidence fix addresses) - simulates data that got the old, buggy
  // seed before that fix shipped and has not been re-answered since.
  const underSeeded = {
    word: "recalme", level: 4, length: 7, attempts: 5, correct: 4, incorrect: 1,
    recentAttempts: [{ correct: false }, { correct: true }, { correct: true }],
    lastResult: "correct",
    masteryAlpha: 1.924, masteryBeta: 0.468, // pure ring-buffer replay, no older-evidence credit
  };
  const recalibrated = L.migrateWordEntry(underSeeded, "recalme", 4, 7);
  assert.ok(recalibrated.masteryAlpha > underSeeded.masteryAlpha, "recalibration should raise the under-seeded value");
  assert.ok(L.masteryMean(recalibrated) > 0.8, `with the older evidence credited, this word's real 4/5 record should read as high-confidence (got ${L.masteryMean(recalibrated)})`);

  // A word whose cached value is ALREADY more confident than a coarse
  // reconstruction from just the raw counts would suggest (e.g. real,
  // ongoing recordAttempt use this test fixture doesn't fully replay) must
  // not get pulled DOWN to match the reconstruction - recalibration only
  // ever corrects an under-seed upward, never the reverse.
  const alreadyConfident = {
    word: "stillhard", level: 4, length: 7, attempts: 5, correct: 4, incorrect: 1,
    recentAttempts: [{ correct: true }, { correct: true }, { correct: false }],
    lastResult: "incorrect",
    masteryAlpha: 9, masteryBeta: 1, // mean 0.9 - higher than the raw-evidence reconstruction would give
  };
  const untouched = L.migrateWordEntry(alreadyConfident, "stillhard", 4, 7);
  assert.equal(untouched.masteryAlpha, 9, "a cached value the raw evidence doesn't exceed must be left exactly as-is");
  assert.equal(untouched.masteryBeta, 1);
});

test("migrateProgressStore migrates an entire legacy store and preserves per-word data", () => {
  const legacyStore = {
    abandon: { box: 5, due: 111, correct: 4, wrong: 0, lastSeen: 5000 },
    zebra: { box: 0, due: 0, correct: 0, wrong: 1, lastSeen: 6000 },
  };
  const vocabIndex = {
    abandon: { word: "abandon", level: 4 },
    zebra: { word: "zebra", level: 6 },
  };
  const migrated = L.migrateProgressStore(legacyStore, vocabIndex);
  assert.equal(migrated.abandon.attempts, 4);
  assert.equal(migrated.abandon.level, 4);
  assert.equal(migrated.zebra.incorrect, 1);
  assert.equal(L.classifyState(migrated.zebra), "incorrect");
});

test("migrateProgressStore on an empty/missing store returns an empty object, not an error", () => {
  assert.deepEqual(L.migrateProgressStore(null, {}), {});
  assert.deepEqual(L.migrateProgressStore(undefined, {}), {});
});

test("a word's history survives a JSON save/reload round-trip with identical state classification", () => {
  const h = L.createEmptyWordHistory("persist", 4, 7);
  play(h, [{ correct: true }, { correct: false, answer: "persits" }, { correct: true }]);
  const reloaded = JSON.parse(JSON.stringify(h));
  assert.equal(L.classifyState(reloaded), L.classifyState(h));
  assert.equal(reloaded.lastWrongAnswer, "persits");
});

/* ================= Progress summary ================= */

test("computeProgressSummary reports counts by state and by level, plus overall accuracy", () => {
  const historyStore = {};
  const pool = [makeWord("a", 4), makeWord("b", 4), makeWord("c", 5)];

  const ha = L.createEmptyWordHistory("a", 4, 1);
  play(ha, [{ correct: true }, { correct: true }]);
  historyStore.a = ha;

  const hb = L.createEmptyWordHistory("b", 4, 1);
  L.recordAttempt(hb, { correct: false, responseMs: 1000, timestamp: 1000, level: 4, length: 1 });
  historyStore.b = hb;
  // "c" stays unattempted -> new

  const summary = L.computeProgressSummary(pool, historyStore);
  assert.equal(summary.totalWords, 3);
  assert.equal(summary.totalEncountered, 2);
  assert.equal(summary.counts.new, 1);
  assert.equal(summary.counts.memorized, 1);
  assert.equal(summary.counts.incorrect, 1);
  assert.equal(summary.byLevel[4].total, 2);
  assert.equal(summary.byLevel[5].total, 1);
  assert.ok(summary.overallAccuracy > 0 && summary.overallAccuracy < 1);
});

test("computeWordDetail exposes streak, wrong-answer history, and state for the Progress word list", () => {
  const historyStore = {};
  const w = makeWord("detail", 5);
  const h = L.createEmptyWordHistory("detail", 5, 6);
  play(h, [{ correct: false, answer: "detial" }, { correct: true, responseMs: 1500 }]);
  historyStore.detail = h;

  const detail = L.computeWordDetail(w, historyStore);
  assert.equal(detail.word, "detail");
  assert.equal(detail.level, 5);
  assert.equal(detail.attempts, 2);
  assert.equal(detail.correct, 1);
  assert.equal(detail.correctStreak, 1);
  assert.equal(detail.lastWrongAnswer, "detial");
  assert.deepEqual(detail.recentWrongAnswers, ["detial"]);
  assert.equal(detail.state, "learning");
});
