"use strict";

// ---- locales/en.js ----
// English UI strings. To add another language: copy this file to
// locales/<code>.js, translate every value (every key that exists in
// locales/zh-TW.js should exist here too - i18n.js falls back to zh-TW
// for anything missing), rename the registry key below, and add a
// <script> tag for it in index.html before i18n.js's own <script> tag.
//
// WARNING: this app's tab bar/chips/buttons (.tab-btn, .filter-chip,
// .level-chip - see style.css) use flexible widths and flex-wrap, not the
// fixed-column layout that bit the sibling Orbit project (see that repo's
// src/constants.js WEEKDAY_LABELS comment for what that bug actually
// looked like), so there's no known analogous bug here today. Still, no
// automated test renders this app's actual layout - always check a real
// screenshot after adding a language before calling it done, especially
// for anything short and buttonlike.
(function (root) {
  var strings = {
  // ---- App shell / tabs ----
  "app.title": "YingDanLi",
  "app.subtitle": "High School English Vocabulary Level 4–6",
  "app.loadFailed": "The app failed to load. Please check your network connection and refresh the page.",
  "app.vocabLoadFailed": "Couldn't load vocabulary data. Please check your network connection and refresh the page.",
  "app.reload": "🔄 Reload",
  "tabs.home": "Home",
  "tabs.review": "Review",
  "tabs.progress": "Progress",

  // ---- Shared/common ----
  "common.confirm": "OK",
  "common.cancel": "Cancel",
  "common.end": "End",
  "common.leave": "Leave",
  "common.delete": "Delete",
  "common.clear": "Clear",
  "common.import": "Import",
  "common.gotIt": "Got it",
  "common.backToHome": "Back to Home",
  "common.noChineseDefinition": "(No Chinese definition)",
  "common.listSeparator": ", ",
  "common.metaSeparator": " · ",
  "common.dotSeparator": " · ",
  "common.tooManyRequests": "Too many requests — please try again later.",
  "common.yourAnswer": "Your answer: {answer}",
  "common.correctAnswer": "Correct answer: {answer}",
  "common.youTyped": "You typed: {answer}",
  "common.blank": "(blank)",

  // ---- Storage warning banner ----
  "storage.warning":
    "⚠️ Unable to save your learning records (device storage may be full, or the browser has blocked local storage). Your current results may not be kept — export a backup right away and free up device storage.",

  // ---- Home / setup view ----
  "home.rateTitle": "Playback Speed",
  "home.rateLabel": "Speed",
  "home.previewRateBtn": "🔊 Preview Current Speed",
  "home.sampleWord": "Sample word: {word}",
  "home.durationTitle": "Practice Duration",
  "home.durationLabel": "Duration",
  "home.minutesValue": "{minutes} min",
  "home.minutesRecommended": "10 (Recommended)",
  "home.durationHint":
    "When time's up, the round ends automatically and shows your score — no need to track the number of questions yourself.",
  "home.modeTitle": "Test Mode",
  "home.modeHint": "Choose how this round picks questions. Words you've already mastered won't appear.",
  "home.modeAutoLabel": "⚖️ Auto Balance (Default)",
  "home.modeAutoDesc": "Automatically adjusts to your current progress.",
  "home.modeNewLabel": "🆕 New Words First",
  "home.modeNewDesc": "Mostly new words, with a little review.",
  "home.modeReviewLabel": "🔁 Review Only",
  "home.modeReviewDesc": "Reviews only past words, no new ones.",
  "home.modeAdvancedLabel": "🛠️ Advanced: Custom Ratio",
  "home.modeAdvancedDesc": "Set your own question mix.",
  "home.ratioHint": "Drag the sliders to adjust the share of New, Incorrect, and Learning words.",
  "home.ratioNewLabel": "🆕 New",
  "home.ratioIncorrectLabel": "❌ Incorrect (Pending Review)",
  "home.ratioLearningLabel": "📖 Learning",
  "home.ratioPresetNew": "Mostly New",
  "home.ratioPresetReview": "Review Only",
  "home.ratioPresetEven": "Even Split",
  "home.levelFoldSummary": "🛠️ Advanced: Word Level Range",
  "home.levelFoldHint":
    "By default, all levels are used. \"⚖️ Auto Balance\" mode automatically balances how often each level appears, so you don't need to adjust this manually — only change it here if you want to limit practice to specific levels.",
  "home.levelCountHint": "{total} words selected ({breakdown})",
  "home.levelCountNone": "Please select at least one level",
  "home.startTestBtn": "📝 Start Test",
  "home.autoRatioHint": "Current mix: {parts}",
  "home.ratioPartNew": "New {pct}%",
  "home.ratioPartIncorrect": "Incorrect {pct}%",
  "home.ratioPartLearning": "Learning {pct}%",
  "home.ratioPartReintroduce": "Review Mastered {pct}%",

  // ---- Vocabulary Test view ----
  "test.emptyTitle": "No Matching Words",
  "test.emptyHint":
    "There are currently no matching words to test. Try switching the test mode, or go back to Home and select different levels.",
  "test.exitBtnTitle": "End this round early and show your current score",
  "test.levelBadge": "Level {level}",
  "test.playBtnTitle": "Play pronunciation (Enter to replay)",
  "test.listenHint": "Listen to the pronunciation and type the word you hear",
  "test.inputPlaceholder": "Type the word...",
  "test.replayBtn": "🔁 Replay",
  "test.submitBtn": "Submit",
  "test.nextBtn": "Next →",
  "test.resultBtn": "See Results →",
  "test.finishedTitle": "Round Complete!",
  "test.scoreLine": "{correct} / {total} correct ({percent}%)",
  "test.noAnswers": "Time ran out before you answered any questions this round.",
  "test.missedIntro":
    "Words you misspelled (tap to see the meaning — added to the \"Incorrect (Pending Review)\" list):",
  "test.allCorrect": "All correct — amazing job! 🎉",
  "test.allWordsIntro": "All words from this round (tap to see the meaning):",
  "test.againBtn": "Another Round",
  "test.againFlashcardBtn": "🎴 Start New Flashcard Review",
  "test.correctTitle": "✅ Correct!",
  "test.wrongTitle": "❌ Keep Trying",
  "test.speedFaster": "⚡ Faster than your usual speed for this word!",
  "test.speedSlower":
    "🐢 A bit slower than usual for this word — you may not have fully memorized it yet.",
  "test.progressCount": "Question {current} / {total}",
  "test.exitConfirm": "End this round early? Your current score will be shown right away.",
  "test.leaveTestConfirm":
    "This test isn't finished yet — leave anyway?\n\nLeaving will end this round; next time you tap \"Start Test\" a new round will begin (it won't resume where you left off).",
  "test.leaveFlashcardConfirm":
    "This flashcard review isn't finished yet — leave anyway?\n\nLeaving will end this review; next time you'll need to choose the amount again to start.",

  // ---- Review list tab ----
  "review.title": "Review",
  "review.tabIncorrect": "❌ Incorrect",
  "review.tabLearning": "📖 Learning",
  "review.tabMarked": "⭐ Marked",
  "review.searchPlaceholder": "Search words...",
  "review.flashcardTitle": "🎴 Flashcard Mode",
  "review.flashcardIntro":
    "Choose the word set and amount to review. Once started, you'll enter a dedicated review screen, which you can leave mid-way just like a test.",
  "review.flashcardCategoryIncorrect": "❌ Incorrect (Pending Review)",
  "review.flashcardCategoryLearning": "📖 Learning",
  "review.flashcardAmountLabel": "Amount (at least 20)",
  "review.flashcardStartBtn": "🎴 Start Flashcard Mode",
  "review.sortLabel": "Sort",
  "review.launchHintTooFew":
    "This category currently only has {available} words — at least {min} are needed to start Flashcard Mode.",
  "review.launchHintReady": "This category currently has {available} words available to review.",
  "review.emptySearch": "No words match your search.",
  "review.emptyMarked":
    "No marked words yet. Tap ☆ while browsing words to add one, then come back to review it later.",
  "review.emptyIncorrect": "No words pending review right now — great job!",
  "review.emptyLearning": "No words currently in Learning — go do a few rounds of testing!",
  "review.hintIncorrect": "Shows the correct spelling and where you went wrong.",
  "review.hintMarked":
    "Tap ⭐ to unmark. A marked word can be in any state — it won't be automatically removed just because you got it right.",
  "review.playAudioTitle": "Play pronunciation",
  "review.toggleMeaningTitle": "Show/hide meaning",
  "review.markToggleTitle": "Mark/unmark for later review",
  "review.attemptedCount": "Answered {count} times",
  "review.avgResponseTime": "Avg. response time {time}",
  "review.correctStreak": "Correct streak {streak} / {total}",
  "review.pagerPrev": "‹ Prev",
  "review.pagerNext": "Next ›",
  "review.pagerStatus": "Page {page} / {totalPages} ({total} total)",
  "review.recentWrongTitle": "Recent mistakes: {list}",
  "review.sortWrongCount": "Times wrong (most to least)",
  "review.sortRecent": "Most recent mistake (newest to oldest)",
  "review.sortOldest": "Most recent mistake (oldest to newest)",
  "review.sortSlow": "Response time (slowest to fastest)",
  "review.sortAz": "Alphabetical A→Z",
  "review.sortTries": "Attempts (most to least)",
  "review.sortStreak": "Correct streak (fewest to most)",
  "review.sortRecentPractice": "Recent practice (newest to oldest)",
  "review.sortOldestPractice": "Recent practice (oldest to newest)",
  "review.sortMarkedOld": "Marked time (oldest to newest)",
  "review.sortMarkedNew": "Marked time (newest to oldest)",

  // ---- Flashcard mode ----
  "flashcard.exitBtnTitle": "End this flashcard review early",
  "flashcard.tapHintHidden": "Tap the card to temporarily hide the meaning",
  "flashcard.tapHintShow": "Tap the card to see the meaning",
  "flashcard.prevBtn": "‹ Previous",
  "flashcard.nextBtn": "Next ›",
  "flashcard.doneBtn": "Done →",
  "flashcard.testBtn": "📝 Test These Words",
  "flashcard.progressCount": "Card {current} / {total}",
  "flashcard.finishedTitle": "Flashcard Review Complete!",
  "flashcard.finishedText": "You've finished reviewing these {count} words.",
  "flashcard.finishExitBtn": "Back to Review List",
  "flashcard.exitConfirm": "End this flashcard review early?",
  "flashcard.testHintReady": "You've seen all {total} words — ready to start the test!",
  "flashcard.testHintProgress": "Seen {count} / {total} — view all words to unlock the test.",

  // ---- Progress view ----
  "progress.overviewTitle": "Overview",
  "progress.trendNotEnough": "Not enough records yet to analyze.",
  "progress.trendFaster": "Your recent responses are getting faster — great progress!",
  "progress.trendSlower": "Your recent responses have slowed down — you may want to review more.",
  "progress.trendStable": "Your recent response times have been stable.",
  "progress.levelsTitle": "Familiarity by Level",
  "progress.levelMemorized": "Mastered {memorized} / {total}",
  "progress.syncTitle": "🔄 Cross-Device Sync",
  "progress.syncIntro":
    "Sync your learning records to your other devices. First tap \"Create New Sync\", then enter the passcode on your other device and tap \"Join Sync\".",
  "progress.syncCreateBtn": "🔗 Create New Sync",
  "progress.syncJoinFoldSummary": "Already have a passcode? Join Sync",
  "progress.passcodeLabel": "Passcode",
  "progress.syncJoinPlaceholder": "Paste sync passcode",
  "progress.syncJoinBtn": "Join Sync",
  "progress.syncCreatedWarning": "Please copy and save this passcode now — it won't be shown in full again!",
  "progress.copyBtn": "Copy",
  "progress.syncAckBtn": "Saved, Close",
  "progress.showPasscodeBtn": "Show Passcode",
  "progress.hidePasscodeBtn": "Hide Passcode",
  "progress.syncNowBtn": "🔄 Sync Now",
  "progress.syncUnlinkBtn": "Unlink Sync",
  "progress.syncDeleteBtn": "Delete Sync Entirely",
  "progress.backupTitle": "Backup & Restore (Manual)",
  "progress.backupIntro": "You can also manually export a backup file, or import one on another device.",
  "progress.exportBtn": "📤 Export Learning Records",
  "progress.importBtn": "📥 Import Learning Records",
  "progress.resetBtn": "Clear All Learning Records",
  "progress.detailTitle": "Word Details",
  "progress.filterAttempted": "Attempted",
  "progress.filterNew": "Not Tested",
  "progress.filterIncorrect": "Incorrect (Pending Review)",
  "progress.filterLearning": "Learning",
  "progress.filterMemorized": "Mastered",
  "progress.filterAll": "All Words",
  "progress.searchPlaceholder": "Search words...",
  "progress.detailHint": "Tap a word to show/hide its meaning; tap 🔊 to play its pronunciation.",
  "progress.toggleMeaningTitle": "Tap to show/hide the Chinese meaning",
  "progress.noMatchingWords": "No matching words.",
  "progress.tableExplainer":
    "A word that's never been missed counts as \"Mastered\" after one correct answer; a word that's been missed needs {streak} correct answers in a row to return to \"Mastered\", and a single mistake resets that count. Mastered words shouldn't normally reappear, but Auto mode occasionally pulls back a few higher-risk mastered words (see the \"Risk\" column) to confirm they haven't been forgotten. Hover over \"Recent Mistakes\" for more history.",
  "progress.tableRiskTitle":
    "The system's predicted chance this word would be missed right now — used only by Auto mode to decide whether to pull a mastered word back for review; it doesn't affect the \"State\" column's Mastered/Learning classification.",
  "progress.tableRiskHeaderTitle":
    "The risk score Auto mode uses to decide whether to pull a mastered word back for review",
  "progress.colWord": "Word",
  "progress.colLevel": "Level",
  "progress.colCorrectIncorrect": "Correct/Incorrect",
  "progress.colRisk": "Risk",
  "progress.colAvgResponse": "Avg. Response Time",
  "progress.colRecentMistakes": "Recent Mistakes",
  "progress.colState": "State",
  "progress.statTotalWords": "Total Words",
  "progress.statAttempted": "Attempted",
  "progress.statMemorized": "Mastered",
  "progress.statLearning": "Learning",
  "progress.statIncorrect": "Incorrect (Pending Review)",
  "progress.statOverallAccuracy": "Overall Accuracy",
  "progress.statMemorizationRate": "Mastery Rate",
  "progress.statRecentAccuracy": "Recent Accuracy",
  "progress.statAvgResponseTime": "Avg. Response Time",

  // ---- Word state labels (shared by test feedback / review / progress) ----
  "state.new": "Not Tested",
  "state.incorrect": "Incorrect (Pending Review)",
  "state.learning": "Learning",
  "state.memorized": "Mastered",

  // ---- Backup / import / reset ----
  "backup.exportSuccess": "Backup exported ({count} words recorded).",
  "backup.importInvalidJson": "Import failed: this isn't a valid JSON backup file.",
  "backup.importBadFormat": "Import failed: the file format is invalid (no learning records found).",
  "backup.importRegressionRefused":
    "Import failed: this backup has less practice history than your currently synced progress. To avoid overwriting progress accumulated on other devices, the import was canceled. If you're sure you want to replace your current progress with this backup, first tap \"Unlink Sync\" above under \"Cross-Device Sync\", then import again.",
  "backup.importConfirm":
    "About to import a backup ({count} words recorded{exportedAt}).\n\nThis will REPLACE all learning records currently in this device's browser, and cannot be undone. Continue?",
  "backup.importConfirmExportedAt": ", exported on {date}",
  "backup.importSuccess": "Imported learning records for {count} words.",
  "backup.importReadError": "Import failed: couldn't read the file.",
  "backup.resetConfirm": "Clear all learning records? This cannot be undone.",

  // ---- Footer / update check ----
  "footer.source":
    "Source: College Entrance Examination Center's \"High School English Reference Vocabulary List\" (108 Curriculum), Level 4–6, {total} words total.",
  "footer.updateCheckBtn": "🔄 Check for Updates",
  "footer.checking": "Checking…",
  "footer.upToDate": "✅ You're on the latest version",
  "footer.foundNewVersion": "🔄 New version found, reloading…",
  "footer.checkFailed": "⚠️ Check failed — please check your network connection",
  "footer.updatedToVersion": "✅ Updated to the latest version ({version})",

  // ---- AI mnemonic feature (vocab-ai.js) ----
  "ai.notConfigured": "The AI feature hasn't been set up yet — please contact the developer.",
  "ai.offline": "No network connection right now — the AI feature is unavailable.",
  "ai.networkErrorPrefix": "Couldn't connect to the AI service: {message}",
  "ai.noMnemonic": "The AI didn't return a valid mnemonic — please try again later.",
  "ai.generatingBtn": "Generating…",
  "ai.mnemonicBtn": "🪄 AI Mnemonic",
  "ai.mnemonicResult": "💡 {mnemonic}",

  // ---- Cross-device sync (sync.js) ----
  "sync.notSupportedCompression": "This device doesn't support the compression feature sync requires.",
  "sync.notSupportedDecompression": "This device doesn't support the decompression feature sync requires.",
  "sync.notConfigured": "Sync hasn't been set up.",
  "sync.createFailed": "Failed to create sync: {message}",
  "sync.uploadFailed": "Sync upload failed: {message}",
  "sync.downloadFailed": "Sync download failed: {message}",
  "sync.tooFrequentRetry":
    "Too many sync requests — retrying automatically in {seconds}s (your learning records are safely stored locally and won't be lost).",
  "sync.pulledInsteadOfPush":
    "Another device has more practice recorded ({remote} vs. {local} on this device) — pulled the latest progress instead, to avoid overwriting it.",
  "sync.syncedAt": "Synced ({time})",
  "sync.updatedFromOtherDevice": "Updated learning records from another device ({time})",
  "sync.pushedInsteadOfPull":
    "This device has more practice recorded ({local} vs. {remote} on the other device) — uploaded the latest progress instead, to avoid losing it.",
  "sync.offlineStatus":
    "Currently offline — sync is temporarily disabled (your learning records are still safely stored on this device). Sync will resume automatically once you're back online.",
  "sync.copiedFeedback": "Copied!",
  "sync.copyFailed": "Copy failed — please select and copy manually.",
  "sync.notSetUp": "Cross-device sync hasn't been set up — please contact the developer.",
  "sync.offlineCreate": "No network connection — can't create sync.",
  "sync.offlineJoin": "No network connection — can't join sync.",
  "sync.offlineSyncNow": "No network connection — can't sync.",
  "sync.offlineDelete": "No network connection — can't delete sync.",
  "sync.createConfirm":
    "Creating a new sync generates a new passcode, used to sync your learning records across your own devices.\n\nIf you already have a passcode, use \"Join Sync\" instead. Continue?",
  "sync.creating": "Creating sync…",
  "sync.enterPasscode": "Please enter a sync passcode.",
  "sync.checkingPasscode": "Checking sync passcode…",
  "sync.passcodeNotFound": "That sync passcode wasn't found — please check it and try again.",
  "sync.joinConfirm":
    "Joining sync will immediately replace this device's current records with the learning records under that passcode.\n\nThis device's current records will be backed up first, and you can choose to restore them after unlinking — continue anyway?",
  "sync.joined": "Joined sync.",
  "sync.syncingNow": "Syncing…",
  "sync.synced": "Synced.",
  "sync.updatedToLatest": "Updated to the latest learning records.",
  "sync.alreadyLatest": "Already up to date.",
  "sync.restoreBackupPrompt":
    "Restore the local learning records from before you joined sync? (Cancel to keep using your current records)",
  "sync.restoredBackup": "Restored the learning records from before joining sync.",
  "sync.deletedRemotelyAutoUnlinked":
    "The sync was deleted — this device has been automatically unlinked (local learning records are unaffected).",
  "sync.unlinkConfirm":
    "After unlinking, this device will go back to storing progress locally only; you can rejoin later with the same passcode. Other devices are unaffected. Continue?",
  "sync.unlinked": "Sync unlinked (local learning records are unaffected).",
  "sync.clearedAndUnlinked":
    "Learning records cleared and sync unlinked (records on other devices and the server are unaffected).",
  "sync.deleteConfirm":
    "Delete this sync entirely?\n\nAll devices using this passcode will be disconnected. This cannot be undone.",
  "sync.deleting": "Deleting sync…",
  "sync.deleteFailed": "Delete failed: {message}",
  "sync.deletedAllDisconnected": "Sync deleted entirely — all devices have been disconnected.",
  };
  if (typeof module === "object" && module.exports) {
    module.exports = strings;
  }
  if (root) {
    root.I18N_LOCALES = root.I18N_LOCALES || {};
    root.I18N_LOCALES["en"] = strings;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null);
