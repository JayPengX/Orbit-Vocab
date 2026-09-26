# 四方單字 Quadra Words (Orbit Vocab / 英單力)

A front-end-only high-school English vocabulary dictation and spaced-review trainer.

## Quadra 四方

This app is part of **Quadra 四方**, four apps sharing one account:

| App | Was | Part it plays |
| --- | --- | --- |
| **四方證券 Quadra Securities** | Stock Study 股市研究室 | The base: a play-money brokerage where the money lives and grows |
| **四方運彩 Quadra Sportsbook** | Odds Study 賠率研究室 | A side play: sports lottery odds and betting |
| **四方賽程 Quadra Fixtures** | Match Find | A schedule tool: what's worth watching |
| **四方單字 Quadra Words** | Orbit Vocab 英單力 | A big mini game with real benefit: English words that pay |

- **The Quadra Pass 四方通行碼**: one 10-character code for all four apps and
  every device (Shared-Proxy's `/eco` route). New syncs are passes only; an
  old app-only code still works until it's upgraded or merged.
- **One money pool**: Securities' NT$ cash and Sportsbook's balance are the
  same money. Sportsbook's bets and winnings, Words' study rewards and
  transfers between passes all land in it, with records on every side.
- **The economy**: every account opens with NT$100,000 in Securities, which
  pays NT$3,000 on the 1st of each month; Sportsbook adds NT$10,000 once and
  NT$1,000 each week; both only when that app is opened. Words pays NT$2 a
  right answer and NT$20 a newly mastered word (NT$800 a day at most);
  Securities' and Sportsbook's mini games pay for skill, up to NT$1,000 and
  NT$1,500 a day. Sportsbook has a weekly betting limit you can set.
- **Merge tool** (`/Stock-Study/merge.html`): every old code in, one new
  pass out; the old codes and their data are removed.
- **Installed only** on phones and tablets (added to the home screen), and
  every app checks for a new deploy on opening, on coming back and every
  five minutes, clearing old cached files before it reloads.
- `quadra.mjs` and `quadra.css` are the same file in all four apps; the
  icons and link cards come from Shared-Proxy's `brand/generate.mjs`.

> **Try it now — Live site: [jaypengx.github.io/Orbit-Vocab](https://jaypengx.github.io/Orbit-Vocab/)**
> No install, no login, no server required. Add it to your home screen for a native-app-like, installable, offline-capable experience (see [Install to Home Screen & Offline Use](#install-to-home-screen--offline-use-pwa)).

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Review Modes — List View & Flip-Card Mode](#review-modes--list-view--flip-card-mode)
- [Cross-Device Sync](#cross-device-sync)
- [AI Mnemonic Generation](#ai-mnemonic-generation)
- [Architecture](#architecture)
- [Install to Home Screen & Offline Use (PWA)](#install-to-home-screen--offline-use-pwa)
- [Word Pronunciation](#word-pronunciation)
- [Getting Started](#getting-started)
- [Data Sources](#data-sources)
- [Deployment](#deployment)
- [Related Projects](#related-projects)

## Overview

**YingDanLi** is a purely client-side (no install, no backend server required) English
vocabulary dictation and review tool built for Taiwanese high-school students. It ships
with the official Taiwanese college-entrance-exam ("大考中心" / College Entrance
Examination Center) **"High School English Reference Vocabulary List"** (108 curriculum),
covering **Levels 4, 5, and 6 — 3,060 words in total**.

The app can be "added to the home screen" on mobile and desktop browsers, after which it
behaves like a native app: its own icon, full-screen launch, and the ability to keep using
already-practiced content while fully offline (see
[Install to Home Screen & Offline Use](#install-to-home-screen--offline-use-pwa)).

## Key Features

- **Vocabulary dictation quizzes**: the app plays a pre-recorded, high-quality pronunciation
  for each word (see [Word Pronunciation](#word-pronunciation)); you type the spelling
  after listening, and get immediate feedback plus the word's Chinese meaning.
  **Sessions are time-based, not question-count-based**: on the home screen you drag a
  slider (or pick a quick preset) to choose how many minutes to practice (default 10
  minutes, adjustable 2–30 minutes). The session ends automatically and shows your score
  when time is up; exactly how many questions you get through depends entirely on your own
  answering speed — there's no need to estimate a question count yourself. The quiz screen
  has an "End" button next to the timer so you can stop the session early at any point and
  see your current score immediately, without waiting for the timer or switching tabs first
  to confirm you want to leave. No word repeats within the same session, and words you've
  already mastered won't reappear.
- **Four quiz modes** (selectable in the "Quiz Mode" section on the home screen):
  - **⚖️ Auto-Balance** (default): computes the session's question ratio live, based on how
    many words are currently in each of your three states (needs review / learning /
    new). It is not a fixed three-way split — the more words you have needing review
    (wrong-answer + learning), the higher the review share (ranging from **10% to 95%**) —
    but it never goes fully to 100% review; some new words keep appearing unless there are
    genuinely no new words left in the selected level range, in which case it does become
    100% review. Within the review pool, wrong-answer words are prioritized over
    learning-state words. When multiple levels are selected at once, the algorithm also
    automatically balances practice frequency across levels, so one level doesn't dominate
    the whole session just because its words happen to score higher or lower on
    difficulty. **This ratio is continuously recomputed live during the session**: after
    every answer, the system recalculates from the latest word states and swaps the ratio
    for any questions not yet shown — you don't need to finish a whole session before the
    balance adjusts. **New words and review words (wrong-answer/learning) use opposite
    selection priorities**: new-word selection favors words predicted to be *harder* to get
    right, surfacing the words that actually deserve your time sooner; review selection
    (wrong-answer/learning) favors words predicted to be *easier* to get right, so words
    that are close to being mastered get cleared off the list faster, leaving more review
    time for words you genuinely don't know yet.
  - **🆕 New-Word-First**: a fixed 80% new words / 10% wrong-answer / 10% learning split.
  - **🔁 Review-Only**: a fixed 70% wrong-answer / 30% learning split; no new words.
  - **🛠️ Advanced: Custom Ratio**: drag three sliders to set your own ratio (dragging one
    automatically adjusts the other two so the three always sum to 100%). If the selected
    level range doesn't have enough words in some category, the system automatically fills
    the gap from the other non-zero categories — but a category set to 0% will never
    appear. If the chosen level + mode combination yields no matching words at all, a
    friendly prompt is shown instead of an error, letting you go back and adjust.
  - Manually selecting which levels to practice (4, 5, 6) lives in a collapsed "🛠️
    Advanced: Word Level Range" section on the home screen, defaulting to all levels
    checked. Since Auto-Balance already balances ratios across levels automatically, this
    is normally unnecessary — expand it only when you want to restrict practice to
    specific levels.
- **Three-state word-mastery model**: just three states — **needs review** (missed last
  time), **learning** (answered correctly but not yet two correct answers in a row), and
  **mastered** (two correct answers in a row). A single wrong answer immediately sends a
  mastered word straight back to needs-review, requiring the streak to build up again from
  zero. States update in real time with no manual confirmation or cleanup needed. **You see
  the result immediately after every answer**: a wrong answer shows the correct spelling
  and highlights exactly where you went wrong (letter-by-letter diff, see below); a correct
  answer shows the word's updated state (learning / mastered) right there, without needing
  to jump to the Learning Progress tab to see how far you've come.
- **Fairness-aware review-time model for prioritizing review order**: the app fits a simple
  linear regression of "word length vs. response time" across all of your timed answers, to
  estimate "how long a word of this length is expected to take" (falling back to a plain
  overall average when there isn't enough data — fewer than 8 timed words). Each word's
  actual response time is then compared against *its own length-appropriate expected time*
  — rather than against the overall average across all words, which would unfairly flag
  long words as "slow / not mastered" just because they require typing more letters, and
  unfairly flag short words as "well known" regardless of whether you actually remember
  them. The Review tab's "sort by response time" option uses this same fairness-normalized
  comparison, so it never degenerates into simply listing the longest words first.
  Question selection within "needs review" / "learning" **is driven directly by the
  prediction model, not by probability**: the most-prioritized words by prediction (new
  words most likely to be missed, review words most likely to be answered correctly — see
  Auto-Balance above) are guaranteed to be picked for the session; a lower-scoring word
  never gets lucky and jumps ahead of a higher-scoring one by chance. Random tie-breaking
  only kicks in when prediction scores are genuinely equal (e.g. no data yet to
  differentiate two words), so truly indistinguishable words still rotate through — but
  once scores differ, ranking always wins; it's never overturned by randomness. When
  multiple levels are selected, each level's quota is allocated using the same Auto-Balance
  ratio logic (see above), ensuring every level gets its fair share rather than being
  crowded out entirely by a level whose words happen to score higher overall.
- **Per-answer feedback with recorded mistakes**: when you answer incorrectly, the app
  records exactly what you actually typed. Both the Review tab and the Learning Progress
  tab display the correct spelling with the letters that differ from your input highlighted
  (e.g. *wierd* vs. *weird*), so you can see your own common mistake patterns before your
  next attempt.
- **Next-question audio prefetching**: while you're listening to and answering the current
  question, the app is already loading and decoding the next question's audio in the
  background (re-prefetched again whenever Auto-Balance recomputes the ratio mid-session
  and swaps in a different upcoming word), reducing playback delay when you move to the
  next question.
- **Chinese meanings**: every word includes its Chinese meaning with part of speech,
  viewable both in per-answer feedback and in the end-of-session word list.
- **Learning-progress dashboard**: an overview of how many words you've practiced /
  mastered / are learning / need review, overall accuracy, mastery rate, recent accuracy,
  and average response time, broken down by Level 4/5/6; also filterable by state or
  keyword, with per-word detail (attempt count, current correct streak, response time,
  recently typed wrong answers).
- Freely selectable practice levels (4, 5, 6, multi-select), adjustable speech rate, and a
  slider to set each session's practice duration.
- **Local-only by default**: all learning records are stored in the browser's
  `localStorage`. Refreshing or closing the tab does not lose progress (on the same
  device/browser); older data formats are automatically migrated to the current format
  without data loss.
- **Cross-device sync (optional)**: automatically syncs learning records to your other
  devices without manual export/import — see [Cross-Device Sync](#cross-device-sync) below.

## Review Modes — List View & Flip-Card Mode

The **Review** tab splits **needs-review**, **learning**, and **bookmarked** words into
three separate sub-tabs, showing only one category at a time for a cleaner view. This tab
itself is **always** a searchable, sortable, paginated card list — needs-review cards show
the correct spelling with a letter-by-letter diff of your mistake, learning cards show the
current correct-answer streak — useful for quickly scanning or searching by keyword.
Leaving and returning to the tab always shows this list view; it never gets stuck on
another screen.

**🎴 Flip-Card Review Mode** is a separate, independent mode (much like the main quiz mode,
not a sub-screen of the Review tab): below the review list, choose whether to review
**needs-review** or **learning** words and how many words to include (at least 20,
customizable), then press "Start Flip-Card Review" to enter its own dedicated screen. It
shows one word at a time in a larger font with larger buttons, suited to focused
one-at-a-time memorization. Tapping a card plays its pronunciation and flips it to reveal
the Chinese meaning (needs-review cards also show the mistake diff on the back). Swipe
left/right (or use the ‹ › buttons) to move to the previous/next word; the next card's
audio is prefetched the same way as in the quiz. Leaving mid-session via the "End" button
in the top-right corner (or switching to another tab) triggers the same confirmation dialog
as the main quiz, so progress is never silently discarded.

After finishing a full batch, a **"📝 Test these words"** button appears, which opens a
real dictation quiz using **exactly the word set selected for that flip-card session**
(reusing the same quiz engine and UI as the home screen). **Correct and incorrect answers
here count toward your learning records and word states exactly like a normal quiz** —
flip-card review itself is browsing only and doesn't count as an attempt, but testing
yourself afterward through this button does: a correct answer increments the correct
streak, which can genuinely move a word from "learning" to "mastered." This bridge back
into the real quiz engine is the entire point of the review feature — if the test results
didn't actually count, review would have no practical spaced-repetition value.

## Cross-Device Sync

The Learning Progress tab has a **"🔄 Cross-Device Sync"** section: pressing "Create New
Sync" on any device generates a **sync passcode**; entering that same passcode on another
device and pressing "Join Sync" links the two. Once linked, learning records sync
automatically:

- **Every completed quiz or review session triggers a sync.** For longer sessions (e.g. a
  30-minute quiz), the app doesn't wait for the whole session to finish — a sync is forced
  every **40 answered questions**, so a closed tab or a dead battery can't wipe out a large
  chunk of unsynced progress.
- Beyond that, an actual tap on the screen, a page refresh, or switching back to the tab
  also checks for updates (throttled to at most once every **20 seconds** per device — a
  deliberately relaxed interval so long continuous-use sessions don't accumulate an
  excessive number of sync requests).
- Pressing "Start Quiz" always shows questions immediately from local data (the phone
  keyboard and audio playback are never delayed waiting on the network), while a background
  fetch checks for newer progress; if newer data from another device is actually found,
  **only the questions not yet shown in this session** get swapped for the updated data —
  questions already seen or answered are never affected.
- "Sync Now" is also available for a manual trigger at any time.

**Automatic retry on app startup**: if the app happens to be offline right when it opens,
or (especially for home-screen-installed instances) the tab is briefly misjudged by the
system as "not in the foreground" at the moment of launch, the very first automatic sync
attempt can silently fail to actually run. The app now retries at **1.5, 4, and 9 seconds**
after startup, plus immediately again whenever network connectivity is restored — so you're
never left thinking local data is empty when it's actually safely stored on the server; no
manual "Sync Now" tap is needed to discover that.

**Offline handling — sync auto-pauses, then auto-resumes**: the entire app (see
[Install to Home Screen & Offline Use](#install-to-home-screen--offline-use-pwa)) works
fully offline for quizzes, review, and the progress dashboard — all answers are still saved
to local `localStorage` as usual. The *only* thing that pauses is cross-device sync itself.
While offline, the UI clearly shows "Currently offline, sync is temporarily disabled" so you
know this is a deliberate pause, not a failure; the app does not keep retrying failed
connection attempts in the background, and it does not surface a barrage of error messages.
The instant connectivity is restored, syncing resumes automatically and catches up on
whatever accumulated while offline — no manual "Sync Now" tap or page refresh required.

**Automatic backoff on rate limiting**: during long continuous-use sessions (e.g. one to two
hours of practice in a row), if the shared proxy server's own request-rate limit is
triggered, the UI shows "Sync requests too frequent, retrying automatically in N seconds"
and stops sending sync requests entirely for that cooldown window (each subsequent rate
limit doubles the cooldown, up to a **10-minute** cap), avoiding a rate-limit → retry →
rate-limit feedback loop. Once the cooldown ends, syncing resumes automatically with no
manual intervention needed — and since learning records always remain safely stored in
local `localStorage` throughout, nothing is lost while sync is temporarily unavailable.

**Security posture**: this feature has no dedicated backend of its own. It reuses the
Cloudflare Worker already deployed by the standalone
[JayPengX/shared-proxy](https://github.com/JayPengX/shared-proxy) repo (see
that repo's `worker.js`, the `/vocab-sync` route — the same Worker also serves the sibling
[Orbit Class](https://github.com/JayPengX/Orbit-Class) project's own schedule sync) as a shared
server-side proxy, storing into a separate Firestore collection that doesn't touch Orbit's
own data. Unlike Orbit's schedule sync, there is no "admin / receive-only" role split and no
separate, less-sensitive code meant for public sharing here — a single sync passcode always
corresponds to **the same learner's own multiple devices**, with no read-only broadcast
scenario, so every device that has joined a sync can both read and write. Reads (not just
writes) also require the passcode to succeed, preventing someone who merely glimpses the
screen — without knowing the passcode — from reading someone else's learning records. The
server only stores a **hash of the passcode**, never the plaintext (see shared-proxy's
`worker.js`, the `VOCAB_SYNC_APP` config and its `singleCredential` design) — so even a
Firestore data leak can't be reversed back into the original passcode. The passcode length
was also increased from an earlier 8 characters to **16 characters** (roughly 80 bits of
entropy over the same alphabet), keeping the "single passcode, no second factor" model
adequately secure.

**Payload compaction**: uploaded data is deliberately minimized, to avoid wasting the
deployment site's shared free-tier quota. The full `localStorage` learning-record format
(named fields, full millisecond timestamps) is first converted to only the fields actually
needed, using fixed-order arrays instead of named fields, with timestamps stored as
"seconds before this sync" rather than absolute time (see the comments on
`compactProgressForSync` in `sync.js`); each word's recent wrong-answer history is also
trimmed to a shorter length (the full, untrimmed history stays intact locally and is
unaffected — it's only the sync payload that's trimmed). The compacted payload is then
`gzip`-compressed and base64-encoded before upload. In testing (500 words across a mix of
realistic scenarios), this compaction step alone reduced the compressed payload size by
roughly **80%**; even in the worst case of having practiced all 3,060 words once, the
estimated upload size is only around **40 KB**, well under the cap configured on the
Cloudflare Worker side (see `VOCAB_MAX_PAYLOAD_LENGTH` in shared-proxy's `worker.js`),
keeping impact on the deployment site's Firestore/Workers usage low.

The first time you "Join Sync," the shared record **replaces** the current device's
learning records (the device's original records are automatically backed up first, and can
optionally be restored after leaving or fully deleting the sync). "Leave Sync" only affects
the current device — other joined devices are unaffected. Any joined device can "Delete
Entire Sync," disconnecting all devices from it; this action cannot be undone.

**Conflict resolution**: rather than simply comparing "which save happened more recently" —
save timestamps aren't reliable (a device could have been offline a long time, have an
inaccurate clock, or simply have been opened later than another). Before every upload, the
app compares **total attempt count** between this device and the server's current record
(the sum of attempts across every word, *not* the number of distinct words practiced —
distinct-word count caps out once all 3,060 words have been practiced at least once, and
practicing the same word again and again doesn't move that number further; total attempt
count never caps, making it the only number that keeps reflecting "how much total practice
has actually gone into this record"). If the server's total attempt count is higher, the
app downloads the server's newer record instead of overwriting it with this device's
smaller one; only if this device's total attempt count is greater than or equal to the
server's does an upload actually happen. "Clear All Learning Records" is bundled together
with **leaving sync on this device**: clearing would otherwise reset the total attempt
count to 0, and if the device stayed in sync, the very next automatic sync would be judged
as "behind" and silently pull the server's old record back down — effectively undoing the
clear. Leaving sync avoids this: the device simply exits the sync group, leaving the
server's shared record and every other joined device completely untouched; you can rejoin
later with the same passcode to resume.

The same logic applies to the manual **"📥 Import Learning Records"** action on the Learning
Progress tab: **while a device is in sync, importing an older backup file with a lower
total attempt count than the current record is rejected outright**, with a clear
explanation — rather than silently succeeding and then getting silently overwritten by the
server's more complete record on the next automatic sync (the same underlying scenario as
the "Clear All" case above, just reached through a different entry point). If you're
genuinely certain you want to replace current progress with that older backup, the message
suggests leaving sync first and then re-importing — once out of sync, importing is purely a
local-device operation with no restrictions on which backup you choose. Devices that were
never set up for sync are unaffected by this restriction and import normally.

**Deploying your own fork**: if the deployment site has no `/vocab-sync` proxy configured
(the `PROXY_URL` GitHub Actions repository variable is left blank), the sync panel shows
"Cross-device sync is not configured yet," with no effect on any other local functionality.
Deployer setup steps: deploy the Worker following the
[JayPengX/shared-proxy](https://github.com/JayPengX/shared-proxy) repo's
README (full steps for the Firebase project, service account key, etc. are documented
there), copy the Worker's URL (**without a path suffix** — `/vocab-sync` is appended by
`sync.js` itself; the configured value should be just the Worker's base URL), and set it in
this repo's **Settings → Secrets and variables → Actions → Variables → `PROXY_URL`** (a
Variable, not a Secret, since this value is meant to end up in the public front-end code
anyway — it's the same value used by the Orbit project, since both share the same Worker).
After pushing to `main`, `.github/workflows/pages.yml` writes it into `sync.js` at build
time.

## AI Mnemonic Generation

An optional feature that, like cross-device sync, reuses the Cloudflare Worker already
deployed in [JayPengX/shared-proxy](https://github.com/JayPengX/shared-proxy)
(see that repo's `worker.js`, the `/vocab-ai` route). It requires no Firebase project of its
own and no additional secrets — as long as `PROXY_URL` is already configured for
[Cross-Device Sync](#cross-device-sync), this feature becomes available automatically (when
`PROXY_URL` is unset, the entry point simply doesn't appear, rather than showing a button
that would fail if pressed):

- **🪄 AI Mnemonic** (on the "needs-review" list in the Review tab, shown only on cards with
  an actual recorded wrong answer): based on the word's **own recorded wrong spellings you
  actually typed** (`recentWrongAnswers`), an AI generates a mnemonic hint tailored to that
  specific mistake pattern. This is a distinct feature from the static hint shown on the
  same card at the moment you get an answer wrong (`data/ai_signals.json`, generated offline
  at build time by `scripts/generate_ai_signals.py`, identical for every user viewing that
  word) — this one is a live, on-demand call that looks specifically at **your own** mistake
  history as a learner. It only generates once per button press (no automatic triggering),
  shows "Generating…" while in progress, and shows a clear error message on failure (e.g.
  too many requests).

This is a purely text-generation feature — it never touches the `/vocab-sync` Firestore
data, and doesn't need to know whether you've set up cross-device sync at all; devices used
purely locally, without sync, can use it just the same. Implementation lives in
`vocab-ai.js` (Worker-calling logic only, no UI of its own) and the button-handling logic
that invokes it in `app.js`.

## Architecture

- **`logic.js`** — DOM-independent, unit-testable core logic: word-state determination;
  review-priority ranking driven by the word-length-vs-response-time regression model
  (`computeResponseTimeBaseline` / `relativeResponseTime`, replacing a simple comparison
  against one fixed overall average); `selectQuestions`'s ratio-based question selection
  (new / needs-review / learning, in any ratio combination); `computeAutoBalanceRatio`,
  which computes the Auto-Balance mode's live question ratio from current word-state
  counts; progress statistics; and data-format migration.
- **`app.js`** — screen rendering, event handling, `localStorage` read/write, audio
  playback (including Web Audio API `AudioContext` management, automatic fallback to
  browser speech synthesis on timeout, and next-question audio prefetching — see
  [Word Pronunciation](#word-pronunciation)); the four quiz modes plus Auto-Balance's live
  mid-session recomputation (`rebalanceAutoModeTail`); the Review tab's list view and the
  independent flip-card review mode (including swipe gestures via Pointer Events);
  `showConfirmDialog`, a custom confirmation dialog replacing `window.confirm()`; calls into
  the functions exposed by `logic.js`; and exposes `progressStore`/`settings` to `sync.js`
  via `window.VocabState`, plus the confirmation dialog to `sync.js` via `window.VocabUI`.
- **`sync.js`** — cross-device sync: reads and writes through the shared Cloudflare Worker
  proxy, throttled polling, automatic retry on app startup, and automatic backoff-and-retry
  on server-side rate limiting (HTTP 429) — see [Cross-Device Sync](#cross-device-sync).
- **`vocab-ai.js`** — personalized mnemonic generation: calls a live Gemini-backed function
  through the same Cloudflare Worker (see [AI Mnemonic Generation](#ai-mnemonic-generation)).
  Has no UI of its own; invoked only by button logic in `app.js`.
- **`sw.js`** — the Service Worker enabling offline use once the app is added to the home
  screen — see [Install to Home Screen & Offline Use](#install-to-home-screen--offline-use-pwa).
- **`manifest.json` / `icons/`** — PWA manifest and icon assets, also covered below.
- **`tests/logic.test.js`** — 50 tests covering: attempt recording; state determination
  (including correct-streak reset on a wrong answer); length-normalized, fairness-aware
  response-time priority; question-selection ratios and fallback behavior (including
  single-category selection and the rule that a 0%-ratio category is never used as a
  fallback); Auto-Balance ratio computation; wrong-answer recording; and data-format
  migration. Run with `npm test` (requires Node.js).

## Install to Home Screen & Offline Use (PWA)

On mobile browsers (iOS Safari's "Add to Home Screen," Android Chrome's "Install app" /
"Add to Home Screen"), YingDanLi can be installed as a standalone icon that opens full
screen with no address bar, just like a native app. Desktop browsers (Chrome/Edge) show an
install icon in the address bar with the same effect.

Under the hood this is a standard three-part PWA setup: `manifest.json` supplies the name,
icons, and launch configuration; `icons/` contains `icon-192.png` / `icon-512.png` (for
Android/desktop) and `apple-touch-icon.png` (for iOS, 180×180, without pre-rounded corners
— iOS applies its own mask, and pre-rounding the corners would visually conflict with that
system mask); and `sw.js` is the Service Worker that lets the already-loaded app shell
(`index.html` / `style.css` / `app.js` / `logic.js` / `sync.js` / `data/vocab.json`) and all
word audio files work offline. On startup, the app automatically begins downloading and
caching all **3,060** word audio files into Cache Storage in the background (no manual
action, no way to opt out — see [Word Pronunciation](#word-pronunciation)).

`sw.js` uses a **"network first" policy for HTML**: it only falls back to the cached version
if the network request genuinely fails or times out (**4 seconds**), so the app normally
never gets stuck on a stale version. The Learning Progress tab's "🔄 Check for Updates"
button, when it detects a new version, also clears the Service Worker's cache and reloads,
avoiding a scenario where a freshly-updated app still loads stale cached files.

**Once opened online for the first time, the entire app works fully offline**: quizzes,
review, flip-card review mode, and the progress dashboard all rely only on local
`localStorage` and this caching layer, with no live network requirement. The only thing that
pauses is cross-device sync (see [Cross-Device Sync](#cross-device-sync)), and it clearly
shows a "paused" state rather than hanging or failing silently. If something does fail to
load (e.g. the vocabulary data itself), a clear error banner appears at the top of the
screen with a "Reload" button, and the app automatically reloads as soon as it detects
connectivity has returned — avoiding a blank, confusing screen.

## Word Pronunciation

The browser's built-in speech synthesis (Web Speech API) has audio quality entirely
dependent on which voices happen to be installed on the user's OS/browser — often robotic,
and inconsistent across devices. To avoid this, every word's pronunciation is instead
**pre-recorded**: the open-source tool [`edge-tts`](https://github.com/rany2/edge-tts)
(calling Microsoft Edge's online neural text-to-speech service, no API key required)
generates one MP3 per word for all **3,060** words, stored at
`data/audio/<lowercase-word>.mp3`, and the web page plays these files directly. The app
falls back to browser speech synthesis only if an audio file fails to load (e.g. a newly
added word whose audio hasn't been generated yet).

**Why Web Audio API instead of `<audio>`**: playback uses the Web Audio API
(`AudioContext` + `AudioBufferSourceNode`) rather than an `<audio>` element — see the
comment in `app.js` for the reasoning (avoiding triggering iOS's "Now Playing" media
notification).

**The iOS Safari `AudioContext` suspend/close bug and its fix**: when an iOS Safari
home-screen PWA is backgrounded (swiped away, or another app is switched to), the
`AudioContext` is sometimes entirely **closed** by the system to reclaim audio resources —
in that case `state` honestly becomes `"closed"` and can never be `resume()`-d again. More
troublesome, and harder to detect, is a second failure mode: sometimes the system merely
leaves the context **stuck**, with `state` still reporting the normal `"suspended"` value
that looks resumable — but it never actually recovers, and **whether this happens at all is
inconsistent**, seemingly related to how long the app was backgrounded and how many other
apps were switched between in the meantime. Since there's no reliable way to distinguish
this stuck case from `state` alone, `app.js`'s fix is: as soon as the tab is detected to
have been backgrounded at any point (via `visibilitychange` / `pagehide`), the next actual
playback attempt discards the old `AudioContext` entirely and creates a brand-new one,
regardless of what `state` the old one currently reports — rather than gambling on whether
it will actually resume. As a result, pressing play/replay after returning to the page works
reliably without needing a page reload.

**Prefetching**: while you're listening to the current question (or the current flip card),
the app is already fetching and decoding the audio for the next question/card in the
background, so switching questions typically doesn't require waiting on the network or
decoding again, meaningfully reducing the delay before sound plays. Audio downloads also
have their own timeout (**3 seconds**): under poor network conditions, playback doesn't hang
indefinitely — on timeout it falls back directly to the browser's built-in speech synthesis
to avoid long stretches of silence.

**Why pronunciation can be slow or lower-quality on a poor connection**: playing any given
word's pronunciation first requires fetching that word's MP3 from the server before it can
play. Once fetched, the browser stores it in local Cache Storage (see
[Install to Home Screen & Offline Use](#install-to-home-screen--offline-use-pwa)), so every
subsequent playback — regardless of network conditions — reads directly from the device and
is unaffected by the network. The only thing a poor connection actually slows down is
**words this device hasn't cached yet** — fetching those genuinely takes longer, and after
the 3-second timeout they fall back directly to the lower-quality browser speech synthesis.

**Background pre-caching of all 3,060 audio files on startup**: this problem is now solved
automatically, with no manual action required and nothing visible happening on screen. On
startup, the app begins downloading all **3,060** words' pronunciation audio (roughly
**30 MB total**, based on a measured average of about **9.8 KB per word**) in the
background into the same Cache Storage described above — no button, no toggle, no status
indicator taking up screen space. Once downloaded, every word is already "cached": no
matter where you are, regardless of network quality, or even fully offline, pronunciation
plays instantly from the device with no network delay or quality degradation. Already-cached
words are automatically skipped (no redundant bandwidth use), and if there's no network at
startup, downloading automatically resumes once connectivity returns — no reload or manual
action needed.

Because each audio file is tiny (about 10 KB on average), what actually slows the download
down is the **round-trip overhead of thousands of small individual requests**, not the total
data volume — so downloads fire **multiple requests concurrently** (rather than queuing them
one at a time), which is what makes it possible to download all 3,060 files in a matter of
seconds to roughly ten-odd seconds (depending on network conditions) instead of being
stretched to one or two minutes by per-request latency.

**Regenerating audio** (e.g. after a voice change, or after new words are added to
`data/vocab.json`):

```bash
pip install edge-tts
python3 scripts/generate_audio.py        # already-existing files are skipped automatically; safe to interrupt and re-run
```

(The official College Entrance Examination Center vocabulary list is text-only and does not
come with official pronunciation audio — most commercial vocabulary apps also either
outsource recording or use TTS, which is why this project uses a free, reproducible TTS
pipeline.)

## Getting Started

### Online use

Just open the [live site](https://jaypengx.github.io/Orbit-Vocab/) — no login, no
installation required. Chrome, Edge, or Safari are recommended for the most natural-sounding
speech.

### Local development

Because the page uses `fetch` to load `data/vocab.json`, opening `index.html` directly in a
browser (`file://`) will be blocked by CORS rules. Run a simple local server instead, for
example:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

### Running tests

Requires Node.js 18+:

```bash
npm test
```

## Data Sources

Vocabulary and part-of-speech data is compiled from the College Entrance Examination
Center's (大考中心) official **"High School English Reference Vocabulary List"** (108
curriculum), Levels 4–6, totaling 3,060 words. Chinese meanings are sourced from the
open-source English-Chinese dictionary [ECDICT](https://github.com/skywind3000/ECDICT) and
converted to Traditional Chinese.

## Deployment

A `.github/workflows/pages.yml` workflow is included. Pushing to the `main` branch
automatically builds and deploys the site to GitHub Pages (requires setting the repository's
**Settings → Pages → Source** to "GitHub Actions").

## Related Projects

- [JayPengX/Shared-Proxy](https://github.com/JayPengX/Shared-Proxy) — the
  shared Cloudflare Worker backend that powers cross-device sync and AI mnemonic generation
  for this project.
- [JayPengX/Orbit-Class](https://github.com/JayPengX/Orbit-Class) and
  [JayPengX/Match-Find](https://github.com/JayPengX/Match-Find) — sibling
  sites that share the same Worker infrastructure.

---

**Live site: [jaypengx.github.io/Orbit-Vocab](https://jaypengx.github.io/Orbit-Vocab/)**
