"use strict";

// Pure, DOM-free logic for the Vocabulary Test app: per-word historical
// data, state classification, question-selection ratios, and progress
// aggregation. Nothing in this file touches localStorage, the DOM, or
// speech synthesis, so it can be unit-tested directly under Node and
// reused unchanged by both the regular Vocabulary Test and the Review
// Test (see app.js).
//
// Loaded as a plain <script> in the browser (attaches everything to
// `window.VocabLogic`) and via `require("./logic.js")` under Node tests
// (CommonJS export) - no bundler needed either way.
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.VocabLogic = mod;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null, function () {

  /* ---------- Centralized, tunable configuration ---------- */

  const CONFIG = {
    // How many recent attempts we keep per word for wrong-answer history
    // and response-time trend analysis. Aggregate counters (attempts/
    // correct/incorrect) are never capped - only this detailed ring
    // buffer is, to keep storage bounded across thousands of words.
    maxRecentAttempts: 12,

    // A word is Memorized the moment its current correct streak reaches
    // this many in a row; any single wrong answer resets the streak to 0
    // (and the word immediately reads as "incorrect" again). Deliberately
    // simple and purely correctness-driven - no score, no confidence
    // ramp, no timing gate on the label itself.
    memorizedStreak: 2,

    // Smoothing factor for the per-word running-average correct response
    // time (avgCorrectResponseMs). Used only for review-priority ranking
    // below, never for the Memorized label.
    emaAlpha: 0.25,

    // Default question-type mix for a round: mostly new words, with small
    // slices revisiting currently-wrong and currently-learning words.
    // Scaled proportionally to whatever size is requested. Memorized words
    // are deliberately excluded from selection entirely - they've already
    // graduated, so slots go to words that still need work. The user can
    // override this ratio via the home screen's three percentage sliders
    // (see selectQuestions's own `ratio` option) - this is only the
    // starting point shown there, not a fixed mode.
    defaultQuestionSize: 80,
    defaultQuestionRatio: { new: 0.8, incorrect: 0.1, learning: 0.1 },

    // Review-selection priority weighting, by response time: a word's own
    // average correct-response time is compared against the EXPECTED time
    // for a word of ITS OWN length (see computeResponseTimeBaseline) -
    // slower-than-expected-for-its-length words get a higher chance of
    // filling a review slot, faster-than-expected ones a lower chance.
    // Deliberately NOT compared against one flat overall average across
    // every word regardless of length - a flat average is dominated by
    // whatever length is most common, so a genuinely long word (more
    // characters to type, nothing to do with how well it's memorized)
    // would always read as "slow" and a short one always "fast", no matter
    // how well either is actually known. This only affects how often a
    // word gets picked for practice, never whether it counts as Memorized
    // (that's streak-only, see above), so it never mislabels a word just
    // for naturally taking longer to type.
    timeWeightMin: 0.3,
    timeWeightMax: 3,
    // Below this many (length, avgCorrectResponseMs) data points across the
    // whole store, there isn't enough signal to trust a fitted length trend
    // (see computeResponseTimeBaseline) - fall back to one flat expected
    // time (the plain overall average) for every length instead of
    // overfitting a line to a handful of points.
    minSamplesForLengthTrend: 8,
    // A word tested moments ago is temporarily de-prioritized (even if
    // it's slow/weak) so the same word or two don't monopolize every
    // round; its weight recovers back to normal over this many days.
    reviewRecencyFullRecoveryDays: 3,

    // Window (most-recent attempts, across all words) used for "recent
    // performance" / response-time-trend reporting in Progress.
    recentPerformanceWindow: 30,

    // How many distinct past wrong answers to surface per word in
    // Progress (most recent first), so a word's mistake pattern (e.g.
    // consistently swapping two letters) is visible before a review.
    maxRecentWrongAnswersShown: 3,

    // ---- Auto-balance mode (see computeAutoBalanceRatio) ----
    // The review "backlog" (incorrect + learning PRESSURE, not a raw word
    // count - see computeBacklogPressure) at which auto mode treats review
    // pressure as maxed out - a backlog at or above this gets the ceiling
    // review share below; a backlog of 0 always gets 0% review (nothing to
    // review yet, so it's 100% new words) regardless of this number. A
    // backlog entirely made of fresh, first-time misses saturates at
    // exactly this many WORDS, same as before computeBacklogPressure
    // existed - it only saturates FASTER (fewer, more severe words) once
    // entrenched or overdue backlog items are involved.
    autoBalanceBacklogSaturation: 40,
    // Review share never exceeds this even at a saturated backlog - a
    // sliver of new words always keeps trickling in rather than the round
    // ever going fully 100% review. Deliberately NOT a large fixed floor
    // (this used to be 0.75, guaranteeing new words at least 25% of every
    // auto-mode round regardless of how huge the backlog got) - a learner
    // who has fallen far behind on review needs the round to actually
    // prioritize clearing that backlog, not have a quarter of every round
    // spent on new words no matter what. Only a small floor remains, just
    // enough that new content never fully stops appearing.
    autoBalanceMaxReviewShare: 0.95,
    // Review share floor the moment there IS any backlog at all (jumps
    // straight from 0% at zero backlog to at least this much) - a single
    // incorrect word still deserves noticeable practice time, not a
    // rounding-error sliver of a huge round. Kept modest (lower than the
    // ceiling above is high) so a genuinely small backlog against a large
    // new-word pool still stays mostly new words - only a large,
    // saturated backlog should push review share up near the new, higher
    // ceiling.
    autoBalanceMinReviewShare: 0.1,
    // Within the review share, incorrect words are weighted this many times
    // more urgently than learning words per-word (still-wrong beats
    // almost-there) when splitting the share between the two categories.
    autoBalanceIncorrectWeight: 1.5,

    // ---- Backlog pressure weighting (see computeBacklogPressure) ----
    // The auto-balance ratio above used to treat every backlog word as
    // exactly one unit of "pressure", so two learners with equally-SIZED
    // backlogs of very different severity (20 words each missed once vs.
    // 20 words each missed five times running) got identical review share.
    // These let a backlog word's actual severity - not just its existence -
    // push the ratio, on top of the flat autoBalanceIncorrectWeight split
    // above (which is about category, not severity).
    //
    // How many EXTRA consecutive misses (beyond the first) add weight to an
    // incorrect word's pressure contribution, and how much each one adds -
    // capped so a word missed 20 times running doesn't dwarf the rest of
    // the backlog on its own.
    backlogSeverityCap: 4,
    backlogSeverityWeightPerMiss: 0.5,
    // How many days overdue a re-surfaced Memorized word (see
    // isDueForReview) needs to reach its full extra weight, and how much
    // extra weight a fully-overdue one adds - a word overdue by two weeks
    // is more at risk of genuinely being forgotten than one that only just
    // became due, even though categorizeWords treats both the same
    // ("learning") for selection purposes.
    backlogOverdueSaturationDays: 14,
    backlogOverdueMaxWeight: 1.5,

    // ---- Predicting word difficulty - one system for new, incorrect, and
    // learning words alike (see predictWordDifficulty/rankCandidates) ----
    // Shrinkage constant for the level/doubled-letter group effects in
    // computeDifficultyBaseline (empirical-Bayes style): a group's observed
    // deviation from the overall average error rate is scaled by
    // n/(n+K) before being trusted, so a group seen only once or twice
    // contributes almost nothing (avoiding the earlier per-letter model's
    // mistake of treating a handful of data points as a real pattern),
    // while a group with lots of data counts nearly at face value.
    difficultyShrinkageK: 6,
    // Minimum attempted words containing a doubled letter (or lacking one)
    // before that group's error-rate deviation is used at all - below this,
    // even a shrunk deviation is still too noisy to bother computing.
    minSamplesForDoubledLetterEffect: 4,
    // Minimum words currently in "incorrect" state before
    // computeInterferenceModel bothers comparing candidate words against
    // them - similarity to a single struggling word is a coincidence, not a
    // pattern, until there are a few to compare against.
    minStruggleWordsForInterference: 3,
    // Shrinkage constant for blending a word's OWN empirical error rate
    // (once it's actually been attempted) with the objective baseline (see
    // predictWordDifficulty) - attempts/(attempts+K) is how much its own
    // track record is trusted over the baseline prediction. Deliberately
    // much smaller than difficultyShrinkageK above: a handful of attempts
    // on THIS specific word is far more informative about it than a
    // handful of samples in a 2-3-way group bucket is about that group, so
    // it should earn trust faster.
    difficultyOwnDataShrinkageK: 3,
    // How much of a word's predicted difficulty comes from the objective
    // baseline (length + curriculum level + orthographic irregularity -
    // see computeDifficultyBaseline - blended with the word's own
    // empirical error rate once it has one) vs. how similar it looks to
    // words this learner is already struggling with (see
    // computeInterferenceModel), once there's enough data for the latter
    // at all (see predictWordDifficulty).
    difficultyBaselineWeight: 0.6,
    difficultyInterferenceWeight: 0.4,
    // How much weight computeInterferenceModel gives a word flagged as
    // commonly confused with a struggling word by the offline AI-generated
    // signals (see data/ai_signals.json's confusedWith), ADDED on top of
    // (never replacing) the existing bigram-based orthographic similarity -
    // semantic/visual confusion (e.g. affect/effect) is a real interference
    // source bigram overlap alone can miss entirely, but orthographic
    // similarity is still real signal on its own and shouldn't be discarded
    // just because AI signals are also available.
    difficultySemanticWeight: 0.3,
    // How much more heavily a MORE RECENT attempt counts than an older one
    // when computing a word's own empirical error rate (see
    // computeOwnRecencyWeightedErrorRate) - each attempt back through
    // history.recentAttempts (newest first) counts this fraction of the one
    // after it. A word the learner used to miss but has gotten right the
    // last several times in a row should read as LOW risk now, not still be
    // dragged down by mistakes from long ago just because the lifetime
    // ratio hasn't caught up - and the reverse: a word that used to be easy
    // but has recently started slipping should read as risky NOW, not hide
    // behind an old streak. 1 would weight every attempt equally (the old
    // flat lifetime-ratio behavior); lower values lean harder on the most
    // recent attempts.
    difficultyRecencyDecay: 0.85,

    // ---- Spaced-repetition scheduling (see recordAttempt's SM-2-style
    // interval/ease update, and isDueForReview) ----
    // A "Memorized" word (see classifyState) used to be retired from
    // selection FOREVER the moment its streak hit memorizedStreak - no
    // forgetting curve, no re-check that it actually stuck. These fields
    // give every word its own review schedule (a simplified SM-2: a
    // correct answer grows the interval before it's due again, scaled by
    // an ease factor that itself grows slightly with each success and
    // shrinks on a miss; an incorrect answer collapses the interval back to
    // due-now) so a Memorized word quietly re-enters the "learning"
    // selection pool once its interval elapses (see categorizeWords),
    // instead of never being asked again just because it was once answered
    // right twice in a row.
    srsDefaultEase: 2.3,
    srsMinEase: 1.3,
    srsMaxEase: 3.2,
    srsEaseGrowOnCorrect: 0.05,
    srsEaseShrinkOnIncorrect: 0.2,
    // The first two successful reviews use fixed intervals (spacing
    // research consistently finds a short initial gap - "did it survive
    // even one day" - is more informative than compounding ease from an
    // interval of 0); every graduation after that multiplies the previous
    // interval by the current ease factor, the standard SM-2 shape.
    srsFirstIntervalDays: 1,
    srsSecondIntervalDays: 3,
    // Interval growth is capped so a long-mastered word still resurfaces at
    // least this often, rather than a large ease factor pushing it out to
    // the point it's effectively never reviewed again.
    srsMaxIntervalDays: 120,

    // ---- Level balancing (auto mode - see computeLevelBalanceModel) ----
    // When a round spans more than one curriculum level, each level's fair
    // share is judged by TWO separate signals, not one:
    //   - for NEW words: a level attempted less on average than the others
    //     is "under-exposed" and gets boosted; one attempted more gets
    //     dampened - first exposure should rotate fairly across levels.
    //   - for INCORRECT/LEARNING words: a level whose own backlog is under
    //     more pressure than the others (see computeBacklogPressure) gets
    //     boosted instead - a level can be heavily drilled AND still be
    //     genuinely struggling, which raw exposure alone can't tell apart
    //     from a level that's heavily drilled and doing fine.
    // Both share the same clamp range below. This keeps auto mode from
    // letting whichever level happens to rank easiest/hardest (or simply
    // has the least backlog) quietly dominate every round - each selected
    // level gets its fair turn in both new AND review slots.
    autoLevelBalanceWeightMin: 0.6,
    autoLevelBalanceWeightMax: 1.8,
  };

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  /* ---------- Small numeric helpers ---------- */

  function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
  }

  function average(arr) {
    if (!arr.length) return 0;
    let sum = 0;
    for (const v of arr) sum += v;
    return sum / arr.length;
  }

  function stddev(arr, mean) {
    if (arr.length < 2) return 0;
    const m = typeof mean === "number" ? mean : average(arr);
    let sq = 0;
    for (const v of arr) sq += (v - m) * (v - m);
    return Math.sqrt(sq / arr.length);
  }

  // Ordinary least-squares fit of y = intercept + slope*x over `points`
  // ({x, y}[]) - used to model "expected response time as a function of
  // word length" (see computeResponseTimeBaseline). Returns null when
  // there's no meaningful slope to fit (fewer than 2 points, or every
  // point shares the same x - e.g. every attempted word so far happens to
  // be the same length), letting the caller fall back to a flat average.
  function linearRegression(points) {
    const n = points.length;
    if (n < 2) return null;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (const p of points) {
      sumX += p.x;
      sumY += p.y;
      sumXY += p.x * p.y;
      sumXX += p.x * p.x;
    }
    const denom = n * sumXX - sumX * sumX;
    if (denom === 0) return null;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return { slope: slope, intercept: intercept };
  }

  function shuffle(arr, random) {
    const rnd = random || Math.random;
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Weighted random ordering (Efraimidis-Spirakis A-ExpJ scheme): each item
  // gets a random key = u^(1/weight) for u in (0,1); sorting keys
  // descending yields a full permutation where higher-weight items tend to
  // land earlier, but never deterministically - a slow/weak word doesn't
  // always win the same slot every round, a faster one occasionally still
  // gets picked, and which specific word "wins" shifts as weights change
  // after each attempt.
  function weightedShuffle(items, weights, random) {
    const rnd = random || Math.random;
    return items
      .map((item, i) => {
        const w = Math.max(1e-6, weights[i]);
        const u = Math.min(1 - 1e-12, Math.max(1e-12, rnd()));
        return { item: item, key: Math.pow(u, 1 / w) };
      })
      .sort((a, b) => b.key - a.key)
      .map((x) => x.item);
  }

  /* ---------- Per-word historical data ---------- */

  function createEmptyWordHistory(word, level, length) {
    return {
      word: word,
      level: level != null ? level : null,
      length: length != null ? length : (word ? word.length : 0),
      // Part of speech (data/vocab.json's own v./n./adj./... field), set on
      // first recordAttempt - lets computeDifficultyBaseline group objective
      // difficulty by it, same as level/doubled-letter.
      pos: null,
      attempts: 0,
      correct: 0,
      incorrect: 0,
      correctStreak: 0,
      // Consecutive WRONG answers, mirroring correctStreak - reset to 0 by
      // any correct answer. Lets computeBacklogPressure tell an entrenched
      // miss (wrong several times running) apart from a one-off slip,
      // something a bare "state === incorrect" flag can't distinguish.
      incorrectStreak: 0,
      // ---- Spaced-repetition scheduling (see CONFIG's own comment and
      // recordAttempt) - dueAt 0 means "due now", same as a brand new word,
      // which is exactly right: nothing to schedule yet. ----
      easeFactor: CONFIG.srsDefaultEase,
      intervalDays: 0,
      dueAt: 0,
      avgCorrectResponseMs: null,
      recentResponseMs: null,
      lastWrongAnswer: null, // most recent incorrect answer the user typed
      recentAttempts: [], // capped ring buffer: {correct, responseMs, timestamp, attemptNumber, answer}
      firstSeen: 0,
      lastSeen: 0,
      lastResult: undefined,
      // Last time this word was engaged with in ANY way - a quiz attempt
      // (see recordAttempt below) or just being shown in 複習's flashcard
      // browsing view (see markReviewed) - never mind whether the answer
      // was right. Distinct from lastSeen (quiz attempts only, and used for
      // review-priority/state purposes) - this exists purely to drive
      // selectReviewBatch, so a large backlog surfaces neglected words
      // first instead of the same front-of-the-list words every session.
      lastReviewedAt: 0,
      // 0 = not marked; otherwise when the user explicitly flagged this
      // word "review this again" (see setMarked) - completely independent
      // of state (new/incorrect/learning/memorized) and of the automatic
      // lastReviewedAt rotation above. That rotation deliberately pushes a
      // just-viewed word to the back of the queue so a big backlog keeps
      // moving forward; marking is the escape hatch for "no, I specifically
      // want to see THIS one again soon" - a word stays marked until the
      // user unmarks it, it is never cleared automatically by browsing or
      // by answering it correctly.
      markedAt: 0,
      // Legacy fields from earlier schema versions, kept only so old
      // stored data doesn't break migration; not used by any logic below.
      box: 0,
      due: 0,
      inWrongList: false,
    };
  }

  // Upgrades one stored entry (any shape - brand new, legacy v1
  // `{box,due,correct,wrong,lastSeen}`, an intermediate score-based v2
  // shape, or already-current) to the current shape, filling in any
  // missing fields with safe defaults. Idempotent: running it again on an
  // already-current entry is a no-op merge, which is also what makes this
  // forward-compatible with future added fields.
  function migrateWordEntry(raw, word, level, length) {
    const base = createEmptyWordHistory(word, level, length);
    if (!raw) return base;

    if (typeof raw.attempts === "number") {
      // Already current-ish shape (v2 or later) - fill gaps only. Older
      // v2 entries may carry now-unused fields (e.g. inWrongList, a
      // score/confidence breakdown) - harmless to keep around unused.
      return Object.assign({}, base, raw);
    }

    // Legacy v1 shape from the original Leitner-box dictation/review modes.
    const correct = raw.correct || 0;
    const wrong = raw.wrong || 0;
    const attempts = correct + wrong;
    return Object.assign({}, base, {
      attempts: attempts,
      correct: correct,
      incorrect: wrong,
      // True streak history wasn't tracked before; a conservative estimate
      // (0 unless the word has never failed) avoids overstating mastery.
      correctStreak: wrong === 0 ? correct : 0,
      lastResult: attempts === 0 ? undefined : (raw.box === 0 && wrong > 0 ? "incorrect" : "correct"),
      lastSeen: raw.lastSeen || 0,
      firstSeen: raw.lastSeen || 0,
    });
  }

  // Migrates an entire stored progress map ({ word -> entry }) in one pass.
  // `vocabIndex` (optional, word.toLowerCase() -> {word, level}) lets a
  // migrated entry recover the canonical word/level even if the stored key
  // was already lowercased.
  function migrateProgressStore(rawStore, vocabIndex) {
    const migrated = {};
    const src = rawStore || {};
    for (const key of Object.keys(src)) {
      const info = vocabIndex ? vocabIndex[key] : null;
      migrated[key] = migrateWordEntry(
        src[key],
        info ? info.word : (src[key] && src[key].word) || key,
        info ? info.level : (src[key] && src[key].level),
        info ? info.word.length : (src[key] && src[key].length) || key.length
      );
    }
    return migrated;
  }

  // Positive = later timings are faster than earlier ones (improving).
  // Needs at least 4 samples to say anything; too few points is noise, not
  // a trend, so it reports neutral (0) instead of overreacting.
  function computeImprovementTrend(chronologicalTimes) {
    if (chronologicalTimes.length < 4) return 0;
    const mid = Math.floor(chronologicalTimes.length / 2);
    const firstAvg = average(chronologicalTimes.slice(0, mid));
    const secondAvg = average(chronologicalTimes.slice(mid));
    if (firstAvg <= 0) return 0;
    return clamp((firstAvg - secondAvg) / firstAvg, -1, 1);
  }

  // Records one answer into a word's history, in place, and returns it.
  // Used by BOTH the regular Vocabulary Test and the Review Test, so the
  // two modes share one system rather than drifting apart. `opts.answer`
  // is the raw text the user typed - stored (only for wrong answers, since
  // a correct one is trivially just the word itself) so mistakes can be
  // reviewed later instead of just a bare correct/incorrect flag.
  function recordAttempt(history, opts) {
    const correct = !!opts.correct;
    const responseMs = typeof opts.responseMs === "number" ? opts.responseMs : null;
    const timestamp = typeof opts.timestamp === "number" ? opts.timestamp : Date.now();
    const answer = typeof opts.answer === "string" ? opts.answer : null;

    history.attempts = (history.attempts || 0) + 1;
    const attemptNumber = history.attempts;

    if (correct) {
      history.correct = (history.correct || 0) + 1;
      history.correctStreak = (history.correctStreak || 0) + 1;
      history.incorrectStreak = 0;
    } else {
      history.incorrect = (history.incorrect || 0) + 1;
      history.correctStreak = 0;
      history.incorrectStreak = (history.incorrectStreak || 0) + 1;
      history.lastWrongAnswer = answer;
    }
    history.lastResult = correct ? "correct" : "incorrect";
    history.lastSeen = timestamp;
    history.lastReviewedAt = timestamp;
    if (!history.firstSeen) history.firstSeen = timestamp;
    if (opts.level != null) history.level = opts.level;
    if (opts.length != null) history.length = opts.length;
    if (opts.pos != null) history.pos = opts.pos;
    history.recentResponseMs = responseMs;

    // ---- Spaced-repetition interval/ease update (simplified SM-2 - see
    // CONFIG's own "Spaced-repetition scheduling" comment) - this is what
    // lets a Memorized word re-enter selection on a schedule instead of
    // being retired forever the moment its streak first crosses the
    // threshold (see classifyState/categorizeWords/isDueForReview). ----
    if (!history.easeFactor) history.easeFactor = CONFIG.srsDefaultEase;
    if (correct) {
      history.easeFactor = Math.min(CONFIG.srsMaxEase, history.easeFactor + CONFIG.srsEaseGrowOnCorrect);
      if (!history.intervalDays) {
        history.intervalDays = CONFIG.srsFirstIntervalDays;
      } else if (history.intervalDays < CONFIG.srsSecondIntervalDays) {
        history.intervalDays = CONFIG.srsSecondIntervalDays;
      } else {
        history.intervalDays = Math.min(CONFIG.srsMaxIntervalDays, Math.round(history.intervalDays * history.easeFactor));
      }
      history.dueAt = timestamp + history.intervalDays * ONE_DAY_MS;
    } else {
      history.easeFactor = Math.max(CONFIG.srsMinEase, history.easeFactor - CONFIG.srsEaseShrinkOnIncorrect);
      history.intervalDays = 0;
      history.dueAt = timestamp; // due again immediately - already selectable as "incorrect" anyway
    }

    if (correct && responseMs != null) {
      history.avgCorrectResponseMs =
        history.avgCorrectResponseMs == null
          ? responseMs
          : history.avgCorrectResponseMs * (1 - CONFIG.emaAlpha) + responseMs * CONFIG.emaAlpha;
    }

    const entry = {
      correct: correct,
      responseMs: responseMs,
      timestamp: timestamp,
      attemptNumber: attemptNumber,
      answer: correct ? undefined : answer,
    };
    const list = (history.recentAttempts || []).concat(entry);
    history.recentAttempts = list.length > CONFIG.maxRecentAttempts
      ? list.slice(list.length - CONFIG.maxRecentAttempts)
      : list;

    return history;
  }

  // Records the lighter-weight "just looked at this in 複習's flashcard
  // view" engagement, in place - no attempt/correctness involved (browsing
  // a card isn't being tested on it), just a timestamp so selectReviewBatch
  // can stop re-surfacing it every session. A real quiz attempt already
  // updates the same field via recordAttempt above.
  function markReviewed(history, timestamp) {
    history.lastReviewedAt = typeof timestamp === "number" ? timestamp : Date.now();
    return history;
  }

  // Toggles (or explicitly sets) a word's "review this again" flag - see
  // createEmptyWordHistory's own comment on markedAt for why this is
  // separate from lastReviewedAt/the automatic rotation. `marked` true
  // sets markedAt to `timestamp` (defaulting to now); false/omitted clears
  // it back to 0.
  function setMarked(history, marked, timestamp) {
    history.markedAt = marked ? (typeof timestamp === "number" ? timestamp : Date.now()) : 0;
    return history;
  }
  function isMarked(history) {
    return !!(history && history.markedAt > 0);
  }

  /* ---------- State classification (simple, streak-based) ---------- */

  // Four states: "new" (never attempted - not one of the three tracked
  // states, just bookkeeping for the pool that hasn't been touched yet),
  // "incorrect" (most recent answer was wrong), "learning" (correct, but
  // streak hasn't reached memorizedStreak yet), "memorized" (current
  // streak >= memorizedStreak). Any single wrong answer immediately drops
  // a word from "memorized" straight back to "incorrect".
  function classifyState(history) {
    const h = history || {};
    if (!h.attempts) return "new";
    if (h.lastResult === "incorrect") return "incorrect";
    return (h.correctStreak || 0) >= CONFIG.memorizedStreak ? "memorized" : "learning";
  }

  // Whether a word currently classified "memorized" (see classifyState
  // above) has reached its scheduled review point (see recordAttempt's
  // SM-2-style interval/ease update) and should re-enter the selectable
  // pool instead of staying retired - see categorizeWords, the only caller.
  // A word that has never been through the scheduler (dueAt still 0/unset -
  // e.g. progress data synced from before this existed) is treated as
  // already due rather than silently exempt from review forever.
  function isDueForReview(history, now) {
    const h = history || {};
    return (h.dueAt || 0) <= (typeof now === "number" ? now : Date.now());
  }

  // Most recent distinct wrong answers for a word, newest first - lets the
  // UI show e.g. "you've typed 'wierd' and 'werid' before" rather than
  // just the single latest slip.
  function recentWrongAnswersOf(history, limit) {
    const h = history || {};
    const cap = limit || CONFIG.maxRecentWrongAnswersShown;
    const chronological = (h.recentAttempts || []).filter((a) => !a.correct && a.answer);
    const seen = new Set();
    const out = [];
    for (let i = chronological.length - 1; i >= 0 && out.length < cap; i--) {
      const ans = chronological[i].answer;
      if (seen.has(ans)) continue;
      seen.add(ans);
      out.push(ans);
    }
    return out;
  }

  // Simple LCS-based character diff between what the user typed and the
  // correct spelling, aligned against the CORRECT word: each letter of the
  // correct word is marked matched (they typed it, in order) or missed
  // (they didn't) - enough to visually spot "swapped two letters" or "left
  // one out" mistakes without a heavyweight diff library.
  function diffChars(typed, correct) {
    const a = (typed || "").split("");
    const b = (correct || "").split("");
    const n = a.length;
    const m = b.length;
    const dp = [];
    for (let i = 0; i <= n; i++) dp.push(new Array(m + 1).fill(0));
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    let i = n;
    let j = m;
    const ops = [];
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        ops.push({ char: b[j - 1], match: true });
        i -= 1;
        j -= 1;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        i -= 1;
      } else {
        ops.push({ char: b[j - 1], match: false });
        j -= 1;
      }
    }
    while (j > 0) {
      ops.push({ char: b[j - 1], match: false });
      j -= 1;
    }
    ops.reverse();
    return ops;
  }

  // Same LCS backtrack as diffChars, but returns BOTH sides of the diff:
  // the correct spelling with letters the user never typed marked missed
  // (identical to diffChars's own result), and what the user actually
  // typed with the letters that threw the spelling off - extra letters,
  // or ones swapped out of place - marked wrong. Lets the UI show "this is
  // what you typed, and THIS specific part of it was the problem" rather
  // than only ever annotating the correct answer.
  function diffCharsBoth(typed, correct) {
    const a = (typed || "").split("");
    const b = (correct || "").split("");
    const n = a.length;
    const m = b.length;
    const dp = [];
    for (let i = 0; i <= n; i++) dp.push(new Array(m + 1).fill(0));
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
    let i = n;
    let j = m;
    const typedOps = [];
    const correctOps = [];
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) {
        typedOps.push({ char: a[i - 1], match: true });
        correctOps.push({ char: b[j - 1], match: true });
        i -= 1;
        j -= 1;
      } else if (dp[i - 1][j] >= dp[i][j - 1]) {
        typedOps.push({ char: a[i - 1], match: false });
        i -= 1;
      } else {
        correctOps.push({ char: b[j - 1], match: false });
        j -= 1;
      }
    }
    while (i > 0) {
      typedOps.push({ char: a[i - 1], match: false });
      i -= 1;
    }
    while (j > 0) {
      correctOps.push({ char: b[j - 1], match: false });
      j -= 1;
    }
    typedOps.reverse();
    correctOps.reverse();
    return { typed: typedOps, correct: correctOps };
  }

  /* ---------- Review-priority weighting (time-based) ---------- */

  function historyFor(historyStore, word) {
    return (historyStore || {})[word.toLowerCase()] || null;
  }

  // The user's own overall average correct-response time, across every
  // word they have timing data for - their general pace. Recomputed from
  // current data each time (not stored), so it always reflects reality.
  // Purely informational (the Progress screen's "平均反應時間" stat) -
  // NOT used for review-priority weighting, since a flat average mixes
  // together words of every length (see computeResponseTimeBaseline for
  // the length-aware figure that IS used for that).
  function computeGlobalAverageResponseMs(historyStore) {
    const store = historyStore || {};
    const times = [];
    for (const key of Object.keys(store)) {
      const h = store[key];
      if (h && typeof h.avgCorrectResponseMs === "number") times.push(h.avgCorrectResponseMs);
    }
    return times.length ? average(times) : null;
  }

  // Models "expected correct-response time as a function of word length"
  // from every word with timing data, via a simple linear fit (longer
  // words legitimately take longer to type - this bakes that in rather
  // than pretending every word "should" take the same time). Returns null
  // when there's no timing data at all yet. With too few data points to
  // trust a fitted trend (see CONFIG.minSamplesForLengthTrend), falls back
  // to one flat expected time for every length - the plain overall
  // average, same number computeGlobalAverageResponseMs reports - rather
  // than overfitting a line to a handful of points. A fitted NEGATIVE
  // slope (longer words predicted faster) is clamped to 0: that shape is
  // almost certainly noise this early, not a real effect, and left
  // uncorrected would perversely flag long words as needing LESS practice.
  function computeResponseTimeBaseline(historyStore) {
    const store = historyStore || {};
    const points = [];
    for (const key of Object.keys(store)) {
      const h = store[key];
      if (h && typeof h.avgCorrectResponseMs === "number" && typeof h.length === "number" && h.length > 0) {
        points.push({ x: h.length, y: h.avgCorrectResponseMs });
      }
    }
    if (!points.length) return null;

    const overallAvg = average(points.map((p) => p.y));
    if (points.length < CONFIG.minSamplesForLengthTrend) {
      return { predict: () => overallAvg };
    }
    const fit = linearRegression(points);
    if (!fit) return { predict: () => overallAvg };
    const slope = Math.max(0, fit.slope);
    return { predict: (length) => Math.max(1, fit.intercept + slope * (length || 0)) };
  }

  // A word's own average correct-response time relative to what's expected
  // for a word of ITS length (see computeResponseTimeBaseline) - 1.0 means
  // "right on pace for a word this long", >1 slower than expected, <1
  // faster. Returns null when there's nothing to compare (no baseline yet,
  // or this word itself has no timing data).
  function relativeResponseTime(history, baseline) {
    const h = history || {};
    if (!baseline || typeof h.avgCorrectResponseMs !== "number") return null;
    const expected = baseline.predict(h.length);
    if (!expected || expected <= 0) return null;
    return h.avgCorrectResponseMs / expected;
  }

  /* ---------- Predicting word difficulty - one system for new, incorrect,
     and learning words alike ----------
     The full pipeline organizes every signal this app has into four
     categories, each answering a different question about a candidate
     word, combined in computeSelectionWeight (see that function's own
     comment for exactly how):

       A. WHAT KIND OF WORD IS THIS, OBJECTIVELY? - computeDifficultyBaseline
          below: length, curriculum level, doubled letters, and (once
          data/ai_signals.json exists for the word) an LLM-estimated prior.
          True of the word for anyone, not just this learner.
       B. WHAT DOES THIS LEARNER SPECIFICALLY STRUGGLE WITH? -
          computeInterferenceModel below: orthographic (bigram-overlap) and
          AI-flagged semantic similarity to words THIS learner currently
          has wrong - a personalized risk signal no generic word-difficulty
          estimate could know.
       C. WHAT DOES THIS WORD'S OWN TRACK RECORD SAY? - folded in directly
          by predictWordDifficulty below once a word has real attempts: its
          own empirical error rate, shrunk toward (A)+(B) by how much data
          it has (CONFIG.difficultyOwnDataShrinkageK). The single most
          informative signal available once it exists at all.
       D. IS SELECTION ITSELF BALANCED? - two adjustments, one inside
          computeSelectionWeight and one alongside it in rankCandidates:
          which DIRECTION risk should push the weight depends on the
          category (new words favor high risk, to front-load likely-to-be-
          missed words while they're still being introduced; incorrect/
          learning words favor LOW risk, to clear near-mastered backlog
          words off the list fastest - see computeSelectionWeight's own
          comment); and, separately, rankCandidates interleaves per-level
          rankings by computeLevelBalanceModel's share weights (see
          mergeByLevelShare) so a multi-level auto-mode round can't let one
          selected level crowd out another just because its words score
          differently under (A)-(C) - kept as a proportional-allocation
          step rather than folded into the weight itself, precisely
          because rankCandidates now sorts deterministically (see its own
          comment): a per-level MULTIPLIER small enough to be a reasonable
          nudge under a weighted-random draw could otherwise zero out an
          entire level once nothing is left to chance.

     (A) and (B) are the two original, independent signals grounded in how
     word memorization is actually understood to work, not a single
     fragile heuristic:

     1. computeDifficultyBaseline - an OBJECTIVE difficulty estimate from
        properties of the word itself: length (more letters means more
        chances to slip - a serial-recall effect, not folklore), curriculum
        level (this vocabulary list is already tiered roughly by frequency,
        and word frequency is one of the most robust predictors of recall
        accuracy in the vocabulary-acquisition literature - rarer words are
        genuinely harder to encode and retain), and whether the word
        contains a doubled letter (a well-documented spelling trouble spot
        for learners - duplicated letters get dropped or added because nothing
        in the pronunciation cues the doubling). Level/doubled-letter effects
        are shrunk toward the overall average based on sample size (see
        CONFIG.difficultyShrinkageK) so a group seen only once or twice can't
        swing the estimate - the earlier design's mistake was trusting a
        26-way split (one bucket per letter) built from a handful of
        mistakes; this only ever splits into 2-3 buckets, each with far more
        data to actually estimate from.

     2. computeInterferenceModel - a PERSONALIZED signal grounded in
        interference theory (a well-replicated finding in verbal-learning
        research: items that look alike compete with each other in memory,
        so a word orthographically similar to one you already keep getting
        wrong is disproportionately likely to trip you up too, regardless of
        which specific letters are involved). Measured as bigram-overlap
        similarity to this learner's own currently-incorrect words, not a
        single-letter miss tally - so it reflects actual shared spelling
        patterns between two words, not a coincidence of one letter
        appearing in both.

     Both are cheap, defensible proxies built entirely from data already in
     progressStore, nothing external - and both degrade gracefully (return
     null / a neutral score) rather than pretending confidence they don't
     have.

     A never-attempted ("new") word has nothing but these two signals to go
     on. An already-attempted (incorrect/learning) word has something far
     better available: its OWN observed track record on THIS specific user
     - so predictWordDifficulty (below) blends that in too, once there's
     enough of it to trust over the general baseline. This is what makes it
     one system for new/incorrect/learning alike, not three - a review word
     isn't "predicted" difficult, its difficulty is directly measured, and
     that measurement only gets more trusted as more attempts accumulate. */

  // Consecutive-letter bigrams of a word, e.g. "quiet" -> ["qu","ui","ie","et"].
  function bigramsOf(word) {
    const w = (word || "").toLowerCase();
    const grams = [];
    for (let i = 0; i < w.length - 1; i++) grams.push(w.slice(i, i + 2));
    return grams;
  }

  // Jaccard similarity (intersection over union) between two ALREADY-BUILT
  // bigram sets - split out from bigramSimilarity below so a caller that
  // needs one side's set repeatedly (see computeInterferenceModel's risk())
  // can build it once instead of on every comparison.
  function bigramSetSimilarity(a, b) {
    if (!a.size || !b.size) return 0;
    let intersection = 0;
    for (const g of a) if (b.has(g)) intersection += 1;
    const union = a.size + b.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  // Jaccard similarity (intersection over union) between two words' bigram
  // sets - a standard, simple measure of orthographic similarity (the same
  // idea behind fuzzy-matching/spelling-suggestion tools): 1 for identical
  // spelling, 0 for nothing in common, scaling smoothly in between for
  // words that share some but not all of their letter-pairs.
  function bigramSimilarity(wordA, wordB) {
    return bigramSetSimilarity(new Set(bigramsOf(wordA)), new Set(bigramsOf(wordB)));
  }

  // Whether a word contains any letter immediately repeated (e.g.
  // "necessary", "occurred") - a well-documented spelling trouble spot,
  // since nothing in how the word sounds cues the doubling.
  function hasDoubledLetter(word) {
    const w = (word || "").toLowerCase();
    for (let i = 1; i < w.length; i++) {
      if (w[i] === w[i - 1] && w[i] >= "a" && w[i] <= "z") return true;
    }
    return false;
  }

  // Empirical-Bayes-style shrinkage: scales an observed group's deviation
  // from the overall average toward 0 based on how much data that group
  // actually has (n/(n+K)), so a group with just one or two samples barely
  // moves the estimate while a well-sampled group counts almost at face
  // value. Shared by both the level and doubled-letter group effects below.
  function shrunkDeviation(groupErrorRate, groupCount, overallAvg, k) {
    const trust = groupCount / (groupCount + k);
    return (groupErrorRate - overallAvg) * trust;
  }

  // Objective "expected error rate" for a word from properties anyone could
  // observe about it (not this learner's personal history beyond what
  // calibrates the model): a length trend (same regression technique as
  // computeResponseTimeBaseline), plus shrunk group effects for curriculum
  // level and doubled letters. Returns null with no attempted words at all
  // AND no `aiSignals` (see data/ai_signals.json) to fall back on either.
  //
  // `aiSignals`, when given, supplies each word's own priorDifficulty - an
  // AI-estimated cold-start guess, generated offline from word properties an
  // LLM can judge better than a length/level heuristic alone (irregularity,
  // rarity, etc). With NO attempted words anywhere yet, there is no group
  // average to shrink toward at all, so a word's prior is used as-is (or a
  // neutral 0.15 if even that's missing). Once real attempts start
  // accumulating, the prior is shrunk toward the (now real) length/level/
  // doubled-letter estimate above using the same n/(n+K) trust formula
  // already used for those group effects - the more data the group estimate
  // has, the more it's trusted over the one-off AI guess for this word.
  function computeDifficultyBaseline(historyStore, aiSignals) {
    const store = historyStore || {};
    const signals = aiSignals || {};
    const lengthPoints = [];
    const byLevel = {};
    const byPos = {};
    const byDoubled = { yes: [], no: [] };

    for (const key of Object.keys(store)) {
      const h = store[key];
      if (!h || !h.attempts) continue;
      const errorRate = (h.incorrect || 0) / h.attempts;
      if (typeof h.length === "number" && h.length > 0) lengthPoints.push({ x: h.length, y: errorRate });
      if (h.level != null) {
        (byLevel[h.level] = byLevel[h.level] || []).push(errorRate);
      }
      if (h.pos) {
        (byPos[h.pos] = byPos[h.pos] || []).push(errorRate);
      }
      if (h.word) (hasDoubledLetter(h.word) ? byDoubled.yes : byDoubled.no).push(errorRate);
    }

    function priorDifficultyOf(word) {
      const entry = signals[word];
      return entry && typeof entry.priorDifficulty === "number" ? clamp(entry.priorDifficulty, 0, 1) : null;
    }

    if (!lengthPoints.length) {
      if (!Object.keys(signals).length) return null;
      return {
        predict: (word) => {
          const prior = priorDifficultyOf(word || "");
          return prior != null ? prior : 0.15;
        },
      };
    }
    const overallAvg = clamp(average(lengthPoints.map((p) => p.y)), 0, 1);

    let lengthPredict;
    if (lengthPoints.length < CONFIG.minSamplesForLengthTrend) {
      lengthPredict = () => overallAvg;
    } else {
      const fit = linearRegression(lengthPoints);
      lengthPredict = fit ? (length) => clamp(fit.intercept + fit.slope * (length || 0), 0, 1) : () => overallAvg;
    }

    const levelDeviation = {};
    for (const level of Object.keys(byLevel)) {
      const rates = byLevel[level];
      levelDeviation[level] = shrunkDeviation(average(rates), rates.length, overallAvg, CONFIG.difficultyShrinkageK);
    }

    // Same shrinkage as level above (a nominal group, no binary-comparison
    // minimum needed the way doubled-letter's yes/no split does) - grouped
    // by data/vocab.json's own `pos` field (v./n./adj./...), which the
    // difficulty model didn't use at all before even though it's been
    // loaded and displayed this whole time.
    const posDeviation = {};
    for (const pos of Object.keys(byPos)) {
      const rates = byPos[pos];
      posDeviation[pos] = shrunkDeviation(average(rates), rates.length, overallAvg, CONFIG.difficultyShrinkageK);
    }

    let doubledDeviation = 0;
    if (byDoubled.yes.length >= CONFIG.minSamplesForDoubledLetterEffect && byDoubled.no.length >= CONFIG.minSamplesForDoubledLetterEffect) {
      doubledDeviation = shrunkDeviation(average(byDoubled.yes), byDoubled.yes.length, overallAvg, CONFIG.difficultyShrinkageK);
    }

    return {
      // `pos` is optional (appended, not inserted, to stay backward
      // compatible with any existing caller that only ever passed
      // word/level) - omitted or unrecognized, it's simply a no-op, same as
      // an unrecognized level.
      predict: (word, level, pos) => {
        const w = word || "";
        let risk = lengthPredict(w.length);
        if (level != null && levelDeviation[level] != null) risk += levelDeviation[level];
        if (pos != null && posDeviation[pos] != null) risk += posDeviation[pos];
        if (doubledDeviation && hasDoubledLetter(w)) risk += doubledDeviation;
        risk = clamp(risk, 0, 1);

        const prior = priorDifficultyOf(w);
        if (prior != null) {
          const trust = lengthPoints.length / (lengthPoints.length + CONFIG.difficultyShrinkageK);
          risk = risk * trust + prior * (1 - trust);
        }
        return clamp(risk, 0, 1);
      },
    };
  }

  // How similar a candidate word is to the words this learner is currently
  // getting wrong (see categorizeWords's "incorrect" bucket) - the highest
  // bigram similarity to any one struggling word, since interference from a
  // single close look-alike is what actually drives confusion (not a
  // diffuse average across every struggling word, most of which won't
  // resemble the candidate at all). Returns null below
  // CONFIG.minStruggleWordsForInterference words - similarity to only one or
  // two struggling words is too easily a coincidence to act on.
  //
  // `aiSignals` (optional - see data/ai_signals.json) adds a second,
  // semantic/visual interference source alongside the orthographic one
  // above: a word the offline AI generation flagged as commonly confused
  // with a struggling word (e.g. affect/effect, economic/economical) is
  // exactly the kind of confusion bigram overlap can't see at all, since the
  // two words may not share any letter pattern. Checked in both directions
  // (the struggling word's own confusedWith list, and any other word whose
  // confusedWith list names the struggling word) since either entry is
  // equally good evidence the two are confusable. Omitted entirely (no
  // second argument, or a word missing from the signals) degrades cleanly
  // back to the orthographic-only model above.
  function computeInterferenceModel(historyStore, aiSignals) {
    const store = historyStore || {};
    const strugglingWords = [];
    for (const key of Object.keys(store)) {
      const h = store[key];
      if (h && h.word && h.lastResult === "incorrect") strugglingWords.push(h.word);
    }
    if (strugglingWords.length < CONFIG.minStruggleWordsForInterference) return null;

    const signals = aiSignals || {};
    const strugglingLower = new Set(strugglingWords.map((w) => w.toLowerCase()));
    const semanticRiskWords = new Set();
    for (const struggling of strugglingWords) {
      const entry = signals[struggling];
      if (entry && Array.isArray(entry.confusedWith)) {
        for (const confused of entry.confusedWith) semanticRiskWords.add(confused.toLowerCase());
      }
    }
    for (const word of Object.keys(signals)) {
      const entry = signals[word];
      if (!entry || !Array.isArray(entry.confusedWith)) continue;
      for (const confused of entry.confusedWith) {
        if (strugglingLower.has(confused.toLowerCase())) semanticRiskWords.add(word.toLowerCase());
      }
    }

    // Built once per struggling word here rather than inside risk() below -
    // risk() is called once per pool candidate every time this model is
    // built (rankCandidates -> computeSelectionWeight -> predictWordDifficulty
    // -> here), so without this a struggling word's bigram set was being
    // rebuilt from scratch candidate-count times over. With a sizeable
    // struggling backlog and a large pool (auto mode's live mid-round
    // rebalance - see app.js's rebalanceAutoModeTail - runs this on every
    // single answer, over the WHOLE pool), that redundant rebuilding was
    // the dominant cost of the entire selection call, multiple seconds on a
    // large backlog: this is what actually fixes it, not just defers it.
    const strugglingBigramSets = strugglingWords.map((w) => new Set(bigramsOf(w)));

    return {
      risk: (word) => {
        const candidateBigrams = new Set(bigramsOf(word));
        let best = 0;
        if (candidateBigrams.size) {
          for (const strugglingBigrams of strugglingBigramSets) {
            const sim = bigramSetSimilarity(candidateBigrams, strugglingBigrams);
            if (sim > best) best = sim;
          }
        }
        const semanticRisk = semanticRiskWords.has((word || "").toLowerCase()) ? 1 : 0;
        return clamp(best + CONFIG.difficultySemanticWeight * semanticRisk, 0, 1);
      },
    };
  }

  // A word's own empirical error rate, weighting more RECENT attempts more
  // heavily than older ones (see CONFIG.difficultyRecencyDecay) instead of
  // one flat lifetime correct/incorrect ratio - a word the learner used to
  // miss but has gotten right the last several times in a row should read
  // as low risk NOW, and the reverse for a word that used to be easy but
  // has recently started slipping. Limited to whatever's still in
  // history.recentAttempts (see CONFIG.maxRecentAttempts) - older attempts
  // that already fell out of that ring buffer are simply gone rather than
  // down-weighted to near-zero, which is a fine approximation since the
  // decay would have made them negligible anyway. Returns null with no
  // attempts to weight at all (a brand new word), letting the caller fall
  // back to the flat lifetime ratio.
  function computeOwnRecencyWeightedErrorRate(history) {
    const attempts = (history && history.recentAttempts) || [];
    if (!attempts.length) return null;
    let weightedWrong = 0;
    let totalWeight = 0;
    let weight = 1;
    for (let i = attempts.length - 1; i >= 0; i--) {
      totalWeight += weight;
      if (!attempts[i].correct) weightedWrong += weight;
      weight *= CONFIG.difficultyRecencyDecay;
    }
    return totalWeight > 0 ? weightedWrong / totalWeight : null;
  }

  // One 0..1-ish predicted difficulty for a word, whether it's never been
  // attempted or has a full history: starts from the objective baseline
  // (or a neutral 0.15 with no baseline data at all yet), then - if this
  // word itself has been attempted - blends in its own empirical error
  // rate (recency-weighted - see computeOwnRecencyWeightedErrorRate above,
  // falling back to the flat lifetime ratio for a bare {attempts,incorrect}
  // history with no recentAttempts ring buffer) via the same
  // empirical-Bayes shrinkage idea used inside the baseline's own group
  // effects (CONFIG.difficultyOwnDataShrinkageK): a word tried once and
  // missed shouldn't swing straight to "certain risk", but as real attempts
  // accumulate on THIS word, its own track record increasingly dominates
  // the generic prediction. That blended objective risk is then combined
  // with the interference signal, same as before (see
  // CONFIG.difficultyBaselineWeight/difficultyInterferenceWeight). `pos` is
  // optional and only ever forwarded to the baseline (see its own comment).
  function predictWordDifficulty(word, level, history, baseline, interferenceModel, pos) {
    let objRisk = baseline ? baseline.predict(word, level, pos) : 0.15;
    if (history && history.attempts) {
      const recencyWeighted = computeOwnRecencyWeightedErrorRate(history);
      const ownErrorRate = clamp(recencyWeighted != null ? recencyWeighted : (history.incorrect || 0) / history.attempts, 0, 1);
      const trust = history.attempts / (history.attempts + CONFIG.difficultyOwnDataShrinkageK);
      objRisk = ownErrorRate * trust + objRisk * (1 - trust);
    }
    if (!interferenceModel) return objRisk;
    const interferenceRisk = interferenceModel.risk(word);
    return clamp(objRisk * CONFIG.difficultyBaselineWeight + interferenceRisk * CONFIG.difficultyInterferenceWeight, 0, 1);
  }

  // Every model predictWordDifficulty/computeSelectionWeight need, built
  // once per round from historyStore and shared across new/incorrect/
  // learning alike (see rankCandidates) rather than each category
  // recomputing its own copy. `aiSignals` (optional - see
  // data/ai_signals.json) is passed straight through to the two models that
  // use it; omitted, both degrade to their pre-AI-signals behavior.
  function buildPriorityModels(historyStore, aiSignals) {
    return {
      difficultyBaseline: computeDifficultyBaseline(historyStore, aiSignals),
      interferenceModel: computeInterferenceModel(historyStore, aiSignals),
      responseTimeBaseline: computeResponseTimeBaseline(historyStore),
    };
  }

  // Turns a word's predicted difficulty (see predictWordDifficulty) into a
  // full weightedShuffle weight - but which DIRECTION predicted difficulty
  // pulls the weight depends on `category`:
  //
  //   - "new" (or omitted): higher predicted risk -> higher weight. A
  //     never-seen word predicted hard is exactly the one worth spending a
  //     new-word slot on now, while attention is being allocated anyway -
  //     surfacing it early is more useful than a new word the learner would
  //     likely have gotten right regardless.
  //   - "incorrect"/"learning": LOWER predicted risk -> higher weight.
  //     These words are already in the review backlog; the goal here is to
  //     clear the ones closest to mastered off the list fastest (a correct
  //     answer moves them toward Memorized, a word not shown doesn't), so
  //     review slots preferentially go to backlog words most likely to be
  //     answered right. This leaves the genuinely hard backlog words - the
  //     ones that keep NOT clearing - relatively more prominent in what's
  //     left, which is what the learner actually needs to focus on.
  //
  // Beyond that baseline pull, two multiplicative adjustments layer on top
  // exactly as they always have for review words - a slower-than-expected
  // response time (still a meaningful signal beyond raw correctness:
  // hesitation on a technically-right answer) nudges the weight up further,
  // and a temporary dampener right after the word was last tested keeps the
  // same word or two from monopolizing every round. A never-attempted word
  // simply has no response time or last-seen data, so both adjustments are
  // no-ops for it.
  //
  // Level balance (see computeLevelBalanceModel) is DELIBERATELY not folded
  // in here as another multiplier, unlike the two adjustments above: now
  // that rankCandidates sorts candidates deterministically (prediction
  // dominates the outcome, not just its odds - see that function's own
  // comment), a per-level multiplier small enough to be a reasonable
  // "nudge" under the old weighted-random scheme could completely zero out
  // an entire level's representation under a deterministic sort the moment
  // that level's words happened to cluster with a slightly less-favorable
  // risk - the exact opposite of "balance". rankCandidates instead applies
  // level balance as a separate proportional-allocation step, guaranteeing
  // every level with candidates gets a fair share of any given prefix
  // regardless of how this weight alone would have ranked them.
  function computeSelectionWeight(w, history, models, now, category) {
    const risk = predictWordDifficulty(w.word, w.level, history, models.difficultyBaseline, models.interferenceModel, w.pos);
    const effectiveRisk = category === "incorrect" || category === "learning" ? 1 - risk : risk;
    let weight = 0.5 + effectiveRisk * 2;

    const rel = relativeResponseTime(history, models.responseTimeBaseline);
    if (rel != null) weight *= clamp(rel, CONFIG.timeWeightMin, CONFIG.timeWeightMax);

    const lastSeen = (history && history.lastSeen) || 0;
    const daysSince = lastSeen ? Math.max(0, (now - lastSeen) / ONE_DAY_MS) : Infinity;
    weight *= clamp(daysSince / CONFIG.reviewRecencyFullRecoveryDays, 0.15, 1);

    return weight;
  }

  // Per-level selection-weight multipliers for auto mode (see CONFIG's own
  // "Level balancing" comment above). `pool` is whatever set of levels the
  // round is drawn from - with only one level selected there is nothing to
  // balance, so this returns null (a no-op) rather than a model whose
  // single level would always resolve to a no-op weight of 1 anyway.
  //
  // Returns TWO weight tables, not one, because "which level needs a boost"
  // is a different question for new words than for review words:
  //
  //   - exposureWeight (used for the "new" category) - a level explored
  //     LESS than the others (fewer average attempts per word) gets
  //     boosted, so a multi-level round doesn't let whichever level's new
  //     words happen to rank easiest/hardest crowd out first exposure to
  //     the others.
  //   - reviewWeight (used for "incorrect"/"learning") - a level whose
  //     OWN review backlog is under more PRESSURE than the others (see
  //     computeBacklogPressure - severity-weighted, not just headcount)
  //     gets boosted. This used to reuse exposureWeight for review too,
  //     which conflated two different things: a level can be heavily
  //     drilled (high exposure -> exposureWeight dampens it) and STILL
  //     have a large, severe backlog if it's genuinely harder for this
  //     learner - exposure alone can't tell a level that's "practiced a
  //     lot and doing fine" apart from one that's "practiced a lot and
  //     still struggling", but backlog pressure can.
  function computeLevelBalanceModel(pool, historyStore, now) {
    const at = typeof now === "number" ? now : Date.now();
    const byLevel = {};
    for (const w of pool || []) {
      const lvl = w.level;
      if (lvl == null) continue;
      if (!byLevel[lvl]) byLevel[lvl] = { words: [], totalAttempts: 0 };
      byLevel[lvl].words.push(w);
      const h = historyFor(historyStore, w.word);
      byLevel[lvl].totalAttempts += (h && h.attempts) || 0;
    }
    const levels = Object.keys(byLevel);
    if (levels.length < 2) return null;

    const avgAttemptsPerLevel = levels.map((l) => (byLevel[l].words.length ? byLevel[l].totalAttempts / byLevel[l].words.length : 0));
    const overallAvgAttempts = average(avgAttemptsPerLevel);
    const exposureWeight = {};
    for (const l of levels) {
      const levelAvg = byLevel[l].words.length ? byLevel[l].totalAttempts / byLevel[l].words.length : 0;
      // Below-average exposure -> ratio < 1 -> weight > 1 (boost this
      // level); above-average -> ratio > 1 -> weight < 1 (dampen it). With
      // no attempts anywhere yet (overallAvg is 0), every level is exactly
      // at parity, so this is a no-op until real data exists to balance.
      const ratio = overallAvgAttempts > 0 ? levelAvg / overallAvgAttempts : 1;
      exposureWeight[l] = clamp(1 / Math.max(0.2, ratio), CONFIG.autoLevelBalanceWeightMin, CONFIG.autoLevelBalanceWeightMax);
    }

    const pressurePerWordByLevel = {};
    for (const l of levels) {
      const cats = categorizeWords(byLevel[l].words, historyStore, at);
      const pressure = computeBacklogPressure(cats.incorrect, historyStore, at) + computeBacklogPressure(cats.learning, historyStore, at);
      pressurePerWordByLevel[l] = byLevel[l].words.length ? pressure / byLevel[l].words.length : 0;
    }
    const overallAvgPressure = average(levels.map((l) => pressurePerWordByLevel[l]));
    const reviewWeight = {};
    for (const l of levels) {
      // Above-average backlog pressure -> ratio > 1 -> weight > 1 (boost
      // this level's share of review slots) - the OPPOSITE direction from
      // exposureWeight above, since here more pressure means it needs MORE
      // attention, not less. No pressure anywhere yet (overallAvgPressure
      // is 0) leaves every level at parity, same as exposureWeight.
      const ratio = overallAvgPressure > 0 ? pressurePerWordByLevel[l] / overallAvgPressure : 1;
      reviewWeight[l] = clamp(ratio, CONFIG.autoLevelBalanceWeightMin, CONFIG.autoLevelBalanceWeightMax);
    }

    return {
      weightOf: (level, category) => {
        if (level == null) return 1;
        const table = category === "incorrect" || category === "learning" ? reviewWeight : exposureWeight;
        return table[level] != null ? table[level] : 1;
      },
    };
  }

  /* ---------- Word categorization ---------- */

  // `now` (optional, defaults to Date.now()) only affects the
  // memorized/due-for-review split below - passed through by selectQuestions
  // (which already has its own `now`) and available to any other caller
  // that wants a specific moment (e.g. tests).
  function categorizeWords(pool, historyStore, now) {
    const at = typeof now === "number" ? now : Date.now();
    const unseen = [];
    const incorrect = [];
    const learning = [];
    const memorized = [];
    for (const w of pool) {
      const h = historyFor(historyStore, w.word);
      const state = classifyState(h);
      if (state === "new") unseen.push(w);
      else if (state === "incorrect") incorrect.push(w);
      else if (state === "memorized") {
        // A Memorized word whose spaced-repetition interval has elapsed
        // (see recordAttempt's SM-2-style scheduling / isDueForReview)
        // quietly re-enters the "learning" bucket instead of staying
        // retired forever - real retention needs a periodic check-in, not
        // a one-time streak. classifyState and the word's displayed
        // "Memorized" label/count (see computeProgressSummary, which uses
        // classifyState directly, not this function) are unaffected either
        // way - this only changes what's eligible for SELECTION and what
        // shows up in 複習's 學習中 list (see app.js's wordsInCategory).
        if (isDueForReview(h, at)) learning.push(w);
        else memorized.push(w);
      } else learning.push(w);
    }
    return { unseen: unseen, incorrect: incorrect, learning: learning, memorized: memorized };
  }

  // Words the user has explicitly marked "review this again" (see
  // setMarked) - orthogonal to categorizeWords's state buckets above, so
  // this can include a word of ANY state (even Memorized - marking it
  // doesn't change its state, and answering it right enough times doesn't
  // un-mark it either; only the user unmarking it does).
  function filterMarked(pool, historyStore) {
    return pool.filter((w) => isMarked(historyFor(historyStore, w.word)));
  }

  // Picks up to `size` words from `words`, ordered so the ones LEAST
  // recently engaged with (see lastReviewedAt - either a quiz attempt or a
  // flashcard view, whichever happened last) come first, with a random
  // tiebreak among equal timestamps (overwhelmingly words never reviewed at
  // all yet, which all sit at 0). This is what makes 複習's flashcard view
  // usable with a large backlog: instead of the same few hundred words in
  // the same order every session, each session surfaces whichever words
  // have gone the longest untouched, so a big backlog naturally spreads
  // itself across as many sessions as it takes - no manual bookkeeping, and
  // (since lastReviewedAt lives on the synced history entry, not separate
  // per-device state) the same rotation continues on any device the
  // learner's progress is synced to.
  function selectReviewBatch(words, historyStore, size, random) {
    const shuffled = shuffle(words, random);
    const withTimestamp = shuffled.map((w) => ({
      w: w,
      lastReviewedAt: (historyFor(historyStore, w.word) || {}).lastReviewedAt || 0,
    }));
    withTimestamp.sort((a, b) => a.lastReviewedAt - b.lastReviewedAt);
    return withTimestamp.slice(0, Math.max(0, size)).map((x) => x.w);
  }

  // Deterministically sorts one already-grouped list of {w, weight} by
  // weight descending - shared by rankCandidates's flat (single/no-balance)
  // path and its per-level path below. `items` must already be pre-shuffled
  // (see rankCandidates) so the guaranteed-stable Array#sort only ever
  // reorders genuinely tied weights, never overrides a real difference.
  function sortByWeightDesc(items) {
    return items.slice().sort((a, b) => b.weight - a.weight);
  }

  // Merges several already-best-first-sorted per-level candidate queues
  // into one list, honoring each level's `shareWeight` proportionally
  // across every prefix - not just the final total - via a divisor
  // (Sainte-Laguë-style) apportionment method: repeatedly award the next
  // pick to whichever level has the smallest (itemsTakenSoFar+1)/weight,
  // then pop that level's own next-best candidate. This is what lets level
  // balance guarantee every level with candidates and weight gets a fair
  // SHARE of any given prefix (the first `target` of a bucket, in
  // particular), rather than only influencing an eventual full-list
  // ordering that a deterministic per-word sort could otherwise let one
  // level dominate entirely (see computeSelectionWeight's own comment on
  // why level balance moved out of the per-word weight and into this
  // separate step). A level's OWN internal order (best-first by weight) is
  // always preserved - this only decides the INTERLEAVING between levels.
  function mergeByLevelShare(queuesByLevel, shareWeightOf) {
    const levels = Object.keys(queuesByLevel).filter((l) => queuesByLevel[l].length);
    const taken = {};
    for (const l of levels) taken[l] = 0;
    const merged = [];
    while (levels.some((l) => taken[l] < queuesByLevel[l].length)) {
      let bestLevel = null;
      let bestScore = Infinity;
      for (const l of levels) {
        if (taken[l] >= queuesByLevel[l].length) continue;
        const w = Math.max(1e-6, shareWeightOf(l));
        const score = (taken[l] + 1) / w;
        if (score < bestScore) {
          bestScore = score;
          bestLevel = l;
        }
      }
      merged.push(queuesByLevel[bestLevel][taken[bestLevel]]);
      taken[bestLevel] += 1;
    }
    return merged;
  }

  // Orders a bucket's candidates by predicted difficulty (see
  // computeSelectionWeight): a STRICT descending sort by weight, so the
  // prediction directly DECIDES which candidates make the cut, rather than
  // merely nudging a random draw's odds - a favored word is never edged
  // out by a disfavored one just because a weighted coin flip happened to
  // go the other way (the earlier weightedShuffle-based design's whole
  // point, deliberately reversed here on request: the model should
  // dominate the outcome, not just its probability). Only genuinely TIED
  // weights (the common case with no data anywhere yet - every word then
  // gets an identical weight) still vary round to round: `words` is
  // pre-shuffled before sorting, and JS's Array#sort is stable (ECMA-262
  // guarantees this), so equal-weight items keep whatever relative order
  // the pre-shuffle gave them instead of always falling back to array
  // order - real weight differences are never overridden by that
  // pre-shuffle, only ties are ever affected by it. `category`
  // ("new"/"incorrect"/"learning", forwarded straight to
  // computeSelectionWeight) is what decides WHICH direction "favored"
  // means for this particular bucket - see that function's own comment.
  //
  // When `models.levelBalance` is present (auto mode across 2+ levels -
  // see computeLevelBalanceModel), candidates are first grouped and
  // ranked PER LEVEL (still a strict, dominant sort within each level),
  // then interleaved via mergeByLevelShare so every level keeps a fair,
  // proportional share of the result instead of the highest-scoring level
  // crowding out the others entirely - see that function's own comment.
  function rankCandidates(words, historyStore, random, now, models, category) {
    const withMeta = shuffle(words, random).map((w) => {
      const h = historyFor(historyStore, w.word);
      return { w: w, weight: computeSelectionWeight(w, h, models, now, category) };
    });

    if (!models.levelBalance) return sortByWeightDesc(withMeta).map((x) => x.w);

    const byLevel = {};
    for (const item of withMeta) {
      const lvl = item.w.level;
      (byLevel[lvl] = byLevel[lvl] || []).push(item);
    }
    const sortedByLevel = {};
    for (const lvl of Object.keys(byLevel)) sortedByLevel[lvl] = sortByWeightDesc(byLevel[lvl]).map((x) => x.w);
    return mergeByLevelShare(sortedByLevel, (lvl) => models.levelBalance.weightOf(Number(lvl), category));
  }

  // Fills bucket targets from ranked candidate lists, then redistributes
  // any unmet targets (a category running short) into whichever buckets
  // still have unused candidates, trying `order` first-to-last, and
  // de-dupes defensively. Shared by both the regular test and Review Test
  // builders below since they only differ in their bucket set/ratio.
  function fillBucketsWithFallback(buckets, size, order) {
    const taken = {};
    for (const b of buckets) taken[b.key] = b.ranked.slice(0, b.target);

    let selectedCount = 0;
    for (const key of Object.keys(taken)) selectedCount += taken[key].length;
    let deficit = size - selectedCount;

    let safety = 0;
    while (deficit > 0 && safety < size + 10) {
      safety += 1;
      let progressed = false;
      for (const key of order) {
        if (deficit <= 0) break;
        const bucket = buckets.find((b) => b.key === key);
        const already = taken[key].length;
        if (bucket.ranked.length > already) {
          taken[key].push(bucket.ranked[already]);
          deficit -= 1;
          progressed = true;
        }
      }
      if (!progressed) break;
    }

    const combined = [];
    for (const key of order) combined.push.apply(combined, taken[key]);

    const seen = new Set();
    const deduped = [];
    for (const w of combined) {
      const key = w.word.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(w);
    }
    return deduped;
  }

  /* ---------- Auto-balance mode: a ratio derived from live word counts ---------- */

  // Turns raw category counts (unseen/incorrect/learning - memorized is
  // always excluded from selection, same as every other mode) into a
  // question-mix ratio, the same shape selectQuestions's `ratio` option
  // expects. Deliberately NOT an equal three-way split ("balance the
  // number of them" does not mean 33/33/33): a brand-new learner has
  // hundreds of unseen words and near-zero review backlog, so an equal
  // split would still bury them in review words they've never even seen
  // once. Instead the review SHARE (incorrect+learning combined) scales up
  // smoothly with how large the backlog actually is - small backlog, mostly
  // new words; large backlog, mostly review - between a floor and a
  // ceiling so neither ever goes fully 0% or 100%. The incorrect/learning
  // split within that share leans toward incorrect words (still wrong beats
  // almost-there), proportioned by how many of each currently exist.
  function computeAutoBalanceRatio(counts) {
    const newCount = Math.max(0, counts.new || 0);
    const incorrectCount = Math.max(0, counts.incorrect || 0);
    const learningCount = Math.max(0, counts.learning || 0);
    const backlog = incorrectCount + learningCount;

    if (backlog === 0) return { new: 1, incorrect: 0, learning: 0 };

    const backlogPressure = clamp(backlog / CONFIG.autoBalanceBacklogSaturation, 0, 1);
    let reviewShare =
      CONFIG.autoBalanceMinReviewShare +
      backlogPressure * (CONFIG.autoBalanceMaxReviewShare - CONFIG.autoBalanceMinReviewShare);

    // No new words left to show at all (every word in the selected levels
    // has been attempted at least once) - the round can only be review.
    if (newCount === 0) reviewShare = 1;

    const newShare = 1 - reviewShare;
    const incorrectWeight = incorrectCount * CONFIG.autoBalanceIncorrectWeight;
    const learningWeight = learningCount;
    const totalWeight = incorrectWeight + learningWeight;
    const incorrectShare = totalWeight > 0 ? reviewShare * (incorrectWeight / totalWeight) : 0;
    const learningShare = totalWeight > 0 ? reviewShare * (learningWeight / totalWeight) : 0;

    return { new: newShare, incorrect: incorrectShare, learning: learningShare };
  }

  // Sums a bucket's contribution to review PRESSURE - not a flat headcount
  // (see CONFIG's own "Backlog pressure weighting" comment). Every backlog
  // word starts at a baseline weight of 1 - identical to the old raw-count
  // behavior - then gets bumped up by whichever of two signals applies:
  //
  //   - an INCORRECT word gets extra weight the more consecutive times
  //     it's been missed (history.incorrectStreak) - an entrenched miss
  //     needs more attention than a one-off slip, even though
  //     categorizeWords buckets both identically as "incorrect".
  //   - a re-surfaced Memorized word due for review (see isDueForReview) -
  //     recognizable here as a "learning"-bucket word whose own
  //     classifyState is still "memorized" - gets extra weight the
  //     further PAST its due date it is. A word overdue by two weeks is
  //     more at risk of really being forgotten than one that only just
  //     became due, even though categorizeWords buckets both identically
  //     as "learning".
  //
  // A brand new "learning" word (streak 1, never yet Memorized) matches
  // neither signal, so it contributes exactly the baseline 1 - the whole
  // point is that severity ADDS pressure on top of existing, it never
  // takes any away.
  function computeBacklogPressure(words, historyStore, now) {
    const at = typeof now === "number" ? now : Date.now();
    let total = 0;
    for (const w of words) {
      const h = historyFor(historyStore, w.word);
      let weight = 1;
      if (h) {
        if ((h.incorrectStreak || 0) > 1) {
          weight += Math.min(CONFIG.backlogSeverityCap, h.incorrectStreak - 1) * CONFIG.backlogSeverityWeightPerMiss;
        }
        if (h.dueAt && classifyState(h) === "memorized") {
          const overdueDays = Math.max(0, (at - h.dueAt) / ONE_DAY_MS);
          weight += Math.min(1, overdueDays / CONFIG.backlogOverdueSaturationDays) * CONFIG.backlogOverdueMaxWeight;
        }
      }
      total += weight;
    }
    return total;
  }

  // Convenience wrapper: categorizes `pool` against `historyStore` itself,
  // so callers (the app's "auto" mode) don't need to call categorizeWords
  // separately just to get counts. Safe to call on every question/answer
  // in a round - it's just a counting/summing pass over the pool, no
  // randomness - which is what lets auto mode re-derive its ratio live as
  // words move between categories (or simply grow more/less severe) mid-
  // round. `incorrect`/`learning` are now PRESSURE sums (see
  // computeBacklogPressure), not raw bucket lengths - two learners with
  // equally-sized backlogs of very different severity now get different
  // review share instead of being treated identically.
  function computeAutoBalanceRatioForPool(pool, historyStore, now) {
    const at = typeof now === "number" ? now : Date.now();
    const cats = categorizeWords(pool, historyStore, at);
    return computeAutoBalanceRatio({
      new: cats.unseen.length,
      incorrect: computeBacklogPressure(cats.incorrect, historyStore, at),
      learning: computeBacklogPressure(cats.learning, historyStore, at),
    });
  }

  /* ---------- Question selection: ratio-driven, one mode ---------- */

  // Target counts for each of the three selectable categories, scaled from
  // `ratio` (need not sum to exactly 1 - normalized here) proportionally to
  // `size`. The LAST category (learning) absorbs whatever rounding leaves
  // over, so the three targets always sum to exactly `size` - not just
  // approximately, the way three independently-rounded numbers could drift
  // by one.
  function computeQuestionTargets(size, ratio) {
    const r = ratio || CONFIG.defaultQuestionRatio;
    const raw = { new: Math.max(0, r.new || 0), incorrect: Math.max(0, r.incorrect || 0), learning: Math.max(0, r.learning || 0) };
    const total = raw.new + raw.incorrect + raw.learning || 1;
    const newTarget = Math.round((size * raw.new) / total);
    const incorrectTarget = Math.round((size * raw.incorrect) / total);
    const learningTarget = Math.max(0, size - newTarget - incorrectTarget);
    return { new: newTarget, incorrect: incorrectTarget, learning: learningTarget };
  }

  // Builds one round's question list, mixing new/unseen, currently-incorrect,
  // and currently-learning words according to `opts.ratio` (each 0..1, need
  // not sum to exactly 1; defaults to CONFIG.defaultQuestionRatio, the old
  // 80/10/10 "mostly new words" shape) - this is the one selection function
  // for the app's one practice mode: what used to be two fixed modes
  // (Vocabulary Test's 80/10/10, Review Test's 70/30-with-no-new-words) are
  // now just two points on the same ratio the user can set anywhere via the
  // home screen's sliders (0% on a category simply excludes it, including
  // from the fallback redistribution below - a slider set to 0 means never
  // show that category, not "only as a last resort"). Redistributes a
  // shortfall in one category into the other non-zero categories (in ratio
  // order) rather than ever duplicating a word; memorized words are always
  // excluded - they've graduated.
  function selectQuestions(opts) {
    const o = opts || {};
    const pool = o.pool || [];
    const historyStore = o.historyStore || {};
    const random = o.random || Math.random;
    const now = typeof o.now === "number" ? o.now : Date.now();
    const ratio = o.ratio || CONFIG.defaultQuestionRatio;
    const totalAvailable = pool.length;
    let size = typeof o.size === "number" && o.size > 0 ? o.size : CONFIG.defaultQuestionSize;
    size = Math.min(size, totalAvailable);
    if (size <= 0) return [];

    const { unseen, incorrect, learning } = categorizeWords(pool, historyStore, now);
    const models = buildPriorityModels(historyStore, o.aiSignals);
    // Level balancing (see computeLevelBalanceModel/CONFIG's own comment)
    // only makes sense to apply when the caller opts in (auto mode - see
    // app.js's currentModeRatioFraction/rebalanceAutoModeTail) - the fixed
    // 新字優先/只複習 presets and the user's own 進階 sliders are a
    // deliberate manual choice that shouldn't be second-guessed by an
    // automatic per-level boost/dampen underneath it.
    if (o.levelBalance) models.levelBalance = computeLevelBalanceModel(pool, historyStore, now);
    const targets = computeQuestionTargets(size, ratio);
    const categoryWords = { new: unseen, incorrect: incorrect, learning: learning };

    const order = ["new", "incorrect", "learning"].filter((key) => (ratio[key] || 0) > 0);
    if (!order.length) return [];

    const buckets = order.map((key) => ({
      key: key,
      ranked: rankCandidates(categoryWords[key], historyStore, random, now, models, key),
      target: targets[key],
    }));

    const deduped = fillBucketsWithFallback(buckets, size, order);
    return shuffle(deduped, random);
  }

  /* ---------- Progress aggregation ---------- */

  function computeProgressSummary(pool, historyStore) {
    const counts = { new: 0, incorrect: 0, learning: 0, memorized: 0 };
    const byLevel = {};
    let totalEncountered = 0;
    let totalAttempts = 0;
    let totalCorrect = 0;
    const allRecentAttempts = [];

    for (const w of pool) {
      const h = historyFor(historyStore, w.word);
      const state = classifyState(h);
      counts[state] += 1;

      const lvl = w.level;
      if (!byLevel[lvl]) byLevel[lvl] = { total: 0, new: 0, incorrect: 0, learning: 0, memorized: 0 };
      byLevel[lvl].total += 1;
      byLevel[lvl][state] += 1;

      if (h && h.attempts) {
        totalEncountered += 1;
        totalAttempts += h.attempts;
        totalCorrect += h.correct || 0;
        for (const a of h.recentAttempts || []) allRecentAttempts.push(a);
      }
    }

    allRecentAttempts.sort((a, b) => a.timestamp - b.timestamp);
    const recentWindow = allRecentAttempts.slice(-CONFIG.recentPerformanceWindow);
    let recentAccuracy = null;
    let responseTimeTrend = 0;
    if (recentWindow.length) {
      recentAccuracy = recentWindow.filter((a) => a.correct).length / recentWindow.length;
      const timed = recentWindow.filter((a) => a.correct && typeof a.responseMs === "number").map((a) => a.responseMs);
      responseTimeTrend = computeImprovementTrend(timed);
    }

    return {
      totalWords: pool.length,
      totalEncountered: totalEncountered,
      counts: counts,
      overallAccuracy: totalAttempts ? totalCorrect / totalAttempts : null,
      memorizationRate: pool.length ? counts.memorized / pool.length : 0,
      recentAccuracy: recentAccuracy,
      responseTimeTrend: responseTimeTrend,
      globalAverageResponseMs: computeGlobalAverageResponseMs(historyStore),
      byLevel: byLevel,
    };
  }

  // `baseline` (see computeResponseTimeBaseline) is optional - pass it when
  // the caller needs relativeResponseTime (e.g. sorting the 複習 lists by
  // "which words are slow FOR THEIR LENGTH"); omit it and that field is
  // just null, same as before this existed. Callers rendering many words
  // at once should compute the baseline ONCE up front and pass the same
  // one into every call here, rather than recomputing it per word.
  function computeWordDetail(w, historyStore, baseline) {
    const h = historyFor(historyStore, w.word);
    const state = classifyState(h);
    return {
      word: w.word,
      level: w.level,
      pos: w.pos,
      zh: w.zh,
      attempts: h ? h.attempts : 0,
      correct: h ? h.correct : 0,
      incorrect: h ? h.incorrect : 0,
      correctStreak: h ? h.correctStreak : 0,
      avgCorrectResponseMs: h ? h.avgCorrectResponseMs : null,
      recentResponseMs: h ? h.recentResponseMs : null,
      lastWrongAnswer: h ? h.lastWrongAnswer : null,
      recentWrongAnswers: recentWrongAnswersOf(h),
      state: state,
      relativeResponseTime: baseline ? relativeResponseTime(h, baseline) : null,
      marked: isMarked(h),
      markedAt: h ? h.markedAt || 0 : 0,
    };
  }

  return {
    CONFIG: CONFIG,
    clamp: clamp,
    average: average,
    stddev: stddev,
    shuffle: shuffle,
    weightedShuffle: weightedShuffle,
    createEmptyWordHistory: createEmptyWordHistory,
    migrateWordEntry: migrateWordEntry,
    migrateProgressStore: migrateProgressStore,
    computeImprovementTrend: computeImprovementTrend,
    recordAttempt: recordAttempt,
    markReviewed: markReviewed,
    setMarked: setMarked,
    isMarked: isMarked,
    classifyState: classifyState,
    isDueForReview: isDueForReview,
    recentWrongAnswersOf: recentWrongAnswersOf,
    diffChars: diffChars,
    diffCharsBoth: diffCharsBoth,
    computeGlobalAverageResponseMs: computeGlobalAverageResponseMs,
    computeResponseTimeBaseline: computeResponseTimeBaseline,
    relativeResponseTime: relativeResponseTime,
    bigramsOf: bigramsOf,
    bigramSimilarity: bigramSimilarity,
    hasDoubledLetter: hasDoubledLetter,
    computeDifficultyBaseline: computeDifficultyBaseline,
    computeInterferenceModel: computeInterferenceModel,
    computeOwnRecencyWeightedErrorRate: computeOwnRecencyWeightedErrorRate,
    predictWordDifficulty: predictWordDifficulty,
    buildPriorityModels: buildPriorityModels,
    computeSelectionWeight: computeSelectionWeight,
    computeLevelBalanceModel: computeLevelBalanceModel,
    categorizeWords: categorizeWords,
    filterMarked: filterMarked,
    selectReviewBatch: selectReviewBatch,
    computeQuestionTargets: computeQuestionTargets,
    computeAutoBalanceRatio: computeAutoBalanceRatio,
    computeBacklogPressure: computeBacklogPressure,
    computeAutoBalanceRatioForPool: computeAutoBalanceRatioForPool,
    selectQuestions: selectQuestions,
    computeProgressSummary: computeProgressSummary,
    computeWordDetail: computeWordDetail,
  };
});
