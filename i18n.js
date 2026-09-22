"use strict";

// ---- i18n.js ----
// Minimal, dependency-free UI translation layer for this app. Loaded as a
// plain <script> before logic.js/app.js/sync.js/vocab-ai.js (attaches
// everything to `window.I18n`), same pattern as logic.js's own UMD wrapper
// (also exported via `module.exports` so it can be `require()`d from a
// future Node test the same way tests/logic.test.js requires logic.js).
//
// Architecture: STRINGS is a flat { locale -> { key -> string } } map. Every
// UI-facing string in index.html/app.js/sync.js/vocab-ai.js is looked up
// through t(key) (optionally with a `{placeholder}` substitution object)
// instead of being hardcoded, so adding a third language later is just
// adding one more entry to STRINGS - no other code changes needed as long
// as every key that exists in 'zh-TW' also exists in the new locale (t()
// falls back to 'zh-TW' for anything missing, so a partial translation
// still renders correctly, just with a mix of languages, rather than
// crashing).
(function (root, factory) {
  const mod = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = mod;
  }
  if (root) {
    root.I18n = mod;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null, function () {

  // The locale this app shipped with before English support existed - every
  // existing installed user (localStorage, home screen bookmarks, etc.) must
  // keep seeing exactly this when detection is inconclusive, so this is also
  // detectLocale()'s fallback value, not just STRINGS' first entry.
  const DEFAULT_LOCALE = "zh-TW";

  // Locales offered in the language switcher, in display order - a third
  // locale is added here (its own {code, nativeName}) plus one more entry in
  // STRINGS below; nothing else in this file (or app.js/sync.js's own t()
  // calls) needs to change.
  const LOCALES = [
    { code: "zh-TW", nativeName: "繁體中文" },
    { code: "en", nativeName: "English" },
  ];

  const STRINGS = {
    "zh-TW": {
      // ---- App shell / tabs ----
      "app.title": "英單力",
      "app.subtitle": "高中英文單字 Level 4–6",
      "app.loadFailed": "應用程式載入失敗，請確認網路連線後重新整理頁面。",
      "app.vocabLoadFailed": "無法載入單字資料，請確認網路連線後重新整理頁面。",
      "app.reload": "🔄 重新整理",
      "tabs.home": "首頁",
      "tabs.review": "複習",
      "tabs.progress": "學習進度",

      // ---- Shared/common ----
      "common.confirm": "確定",
      "common.cancel": "取消",
      "common.end": "結束",
      "common.leave": "離開",
      "common.delete": "刪除",
      "common.clear": "清除",
      "common.import": "匯入",
      "common.gotIt": "知道了",
      "common.backToHome": "回首頁",
      "common.noChineseDefinition": "（無中文釋義）",
      "common.listSeparator": "、",
      "common.metaSeparator": "　・　",
      "common.dotSeparator": "・",
      "common.tooManyRequests": "請求過於頻繁，請稍後再試。",
      "common.yourAnswer": "你的答案：{answer}",
      "common.correctAnswer": "正確答案：{answer}",
      "common.youTyped": "你打的：{answer}",
      "common.blank": "(空白)",

      // ---- Storage warning banner ----
      "storage.warning":
        "⚠️ 無法儲存學習紀錄（裝置儲存空間可能已滿，或瀏覽器封鎖了本機儲存）。目前的練習結果可能不會被保留，建議立即到「設定」匯出備份檔，並清理裝置儲存空間。",

      // ---- Home / setup view ----
      "home.rateTitle": "語速設定",
      "home.rateLabel": "語速",
      "home.previewRateBtn": "🔊 試聽目前語速",
      "home.sampleWord": "範例單字：{word}",
      "home.durationTitle": "練習時間",
      "home.durationLabel": "時間長度",
      "home.minutesValue": "{minutes} 分鐘",
      "home.minutesRecommended": "10（建議）",
      "home.durationHint": "時間到會自動結束並顯示成績，不用自己抓題數。",
      "home.modeTitle": "測驗模式",
      "home.modeHint": "選擇這回合怎麼出題。已熟記的單字不會出現。",
      "home.modeAutoLabel": "⚖️ 自動平衡（預設）",
      "home.modeAutoDesc": "依你目前的學習狀況自動調整。",
      "home.modeNewLabel": "🆕 新字優先",
      "home.modeNewDesc": "大部分出新字，少量複習。",
      "home.modeReviewLabel": "🔁 只複習",
      "home.modeReviewDesc": "只複習舊字，不出新字。",
      "home.modeAdvancedLabel": "🛠️ 進階：自訂比例",
      "home.modeAdvancedDesc": "自己設定出題比例。",
      "home.ratioHint": "拖曳滑桿調整新字、答錯待複習、學習中各佔的比例。",
      "home.ratioNewLabel": "🆕 新字",
      "home.ratioIncorrectLabel": "❌ 答錯待複習",
      "home.ratioLearningLabel": "📖 學習中",
      "home.ratioPresetNew": "以新字為主",
      "home.ratioPresetReview": "只複習",
      "home.ratioPresetEven": "平均分配",
      "home.levelFoldSummary": "🛠️ 進階：單字等級範圍",
      "home.levelFoldHint":
        "預設會用全部等級。「⚖️ 自動平衡」模式會自動平衡各等級出現的比例，不需要手動調整；想限制只練習特定等級再到這裡調整。",
      "home.levelCountHint": "已選 {total} 個單字（{breakdown}）",
      "home.levelCountNone": "請至少選擇一個等級",
      "home.startTestBtn": "📝 開始測驗",
      "home.autoRatioHint": "目前配比：{parts}",
      "home.ratioPartNew": "新字 {pct}%",
      "home.ratioPartIncorrect": "答錯 {pct}%",
      "home.ratioPartLearning": "學習中 {pct}%",
      "home.ratioPartReintroduce": "複習已熟記 {pct}%",

      // ---- Vocabulary Test view ----
      "test.emptyTitle": "沒有符合條件的單字",
      "test.emptyHint": "目前沒有符合的單字可以出題，試試切換測驗模式，或回首頁勾選其他等級。",
      "test.exitBtnTitle": "提早結束這一回合，顯示目前的成績",
      "test.levelBadge": "Level {level}",
      "test.playBtnTitle": "播放發音 (Enter 重播)",
      "test.listenHint": "聽發音，輸入你聽到的單字",
      "test.inputPlaceholder": "輸入單字...",
      "test.replayBtn": "🔁 重播",
      "test.submitBtn": "送出",
      "test.nextBtn": "下一題 →",
      "test.resultBtn": "看結果 →",
      "test.finishedTitle": "本回合測驗結束！",
      "test.scoreLine": "答對 {correct} / {total} 題（{percent}%）",
      "test.noAnswers": "這回合時間到之前還沒作答任何一題。",
      "test.missedIntro": "拼錯的單字（點擊查看中文意思，已加入「答錯待複習」清單）：",
      "test.allCorrect": "全部答對，太厲害了！🎉",
      "test.allWordsIntro": "本回合全部單字（點擊查看中文意思）：",
      "test.againBtn": "再來一回合",
      "test.againFlashcardBtn": "🎴 開始新的卡片複習",
      "test.correctTitle": "✅ 正確！",
      "test.wrongTitle": "❌ 再加油",
      "test.speedFaster": "⚡ 比你這個字平常的速度快！",
      "test.speedSlower": "🐢 比這個字平常的速度慢一些，可能還沒完全記熟。",
      "test.progressCount": "第 {current} / {total} 題",
      "test.exitConfirm": "確定要提早結束這一回合嗎？會直接顯示目前的成績。",
      "test.leaveTestConfirm":
        "測驗還沒完成，確定要離開嗎？\n\n離開後這一回合會結束，下次按「開始測驗」會開始新的一回合（不會保留繼續作答）。",
      "test.leaveFlashcardConfirm":
        "卡片複習還沒完成，確定要離開嗎？\n\n離開後這次複習會結束，下次要重新選擇數量開始。",

      // ---- Review list tab ----
      "review.title": "複習",
      "review.tabIncorrect": "❌ 答錯",
      "review.tabLearning": "📖 學習中",
      "review.tabMarked": "⭐ 標記",
      "review.searchPlaceholder": "搜尋單字...",
      "review.flashcardTitle": "🎴 卡片複習模式",
      "review.flashcardIntro":
        "選擇要複習的單字集合與數量，開始後會進入專屬的複習畫面，可以像測驗一樣中途離開。",
      "review.flashcardCategoryIncorrect": "❌ 答錯待複習",
      "review.flashcardCategoryLearning": "📖 學習中",
      "review.flashcardAmountLabel": "數量（至少 20 個）",
      "review.flashcardStartBtn": "🎴 開始卡片複習模式",
      "review.sortLabel": "排序",
      "review.launchHintTooFew": "這個分類目前只有 {available} 個單字，至少需要 {min} 個才能開始卡片複習模式。",
      "review.launchHintReady": "這個分類目前有 {available} 個單字可複習。",
      "review.emptySearch": "沒有符合搜尋的單字。",
      "review.emptyMarked": "目前沒有標記的單字，瀏覽單字時點擊 ☆ 就能加進來，稍後再回來複習。",
      "review.emptyIncorrect": "目前沒有答錯待複習的單字，太厲害了！",
      "review.emptyLearning": "目前沒有學習中的單字，去做幾回合單字測驗吧！",
      "review.hintIncorrect": "顯示正確拼法與你打錯的地方。",
      "review.hintMarked": "點 ⭐ 可以取消標記；標記的單字可以是任何狀態，不會因為答對就自動移除。",
      "review.playAudioTitle": "播放發音",
      "review.toggleMeaningTitle": "顯示／隱藏中文意思",
      "review.markToggleTitle": "標記／取消標記，稍後想再複習",
      "review.attemptedCount": "已作答 {count} 次",
      "review.avgResponseTime": "平均反應時間 {time}",
      "review.correctStreak": "連續正確 {streak} / {total}",
      "review.pagerPrev": "‹ 上一頁",
      "review.pagerNext": "下一頁 ›",
      "review.pagerStatus": "第 {page} / {totalPages} 頁（共 {total} 筆）",
      "review.recentWrongTitle": "最近幾次打錯：{list}",
      "review.sortWrongCount": "答錯次數（多到少）",
      "review.sortRecent": "最近錯誤（新到舊）",
      "review.sortOldest": "最近錯誤（舊到新）",
      "review.sortSlow": "反應時間（慢到快）",
      "review.sortAz": "字母順序 A→Z",
      "review.sortTries": "嘗試次數（多到少）",
      "review.sortStreak": "連續正確次數（少到多）",
      "review.sortRecentPractice": "最近練習（新到舊）",
      "review.sortOldestPractice": "最近練習（舊到新）",
      "review.sortMarkedOld": "標記時間（舊到新）",
      "review.sortMarkedNew": "標記時間（新到舊）",

      // ---- Flashcard mode ----
      "flashcard.exitBtnTitle": "提早結束這次卡片複習",
      "flashcard.tapHintHidden": "點卡片可暫時隱藏意思",
      "flashcard.tapHintShow": "點卡片看意思",
      "flashcard.prevBtn": "‹ 上一個",
      "flashcard.nextBtn": "下一個 ›",
      "flashcard.doneBtn": "完成 →",
      "flashcard.testBtn": "📝 測驗這些單字",
      "flashcard.progressCount": "第 {current} / {total} 張",
      "flashcard.finishedTitle": "這批卡片複習完成！",
      "flashcard.finishedText": "已看完這 {count} 個單字的卡片複習。",
      "flashcard.finishExitBtn": "回複習列表",
      "flashcard.exitConfirm": "確定要提早結束這次卡片複習嗎？",
      "flashcard.testHintReady": "已看完這 {total} 個單字，可以開始測驗！",
      "flashcard.testHintProgress": "已看過 {count} / {total} 個，看完全部單字就能開始測驗。",

      // ---- Progress view ----
      "progress.overviewTitle": "學習總覽",
      "progress.trendNotEnough": "還沒有足夠的紀錄可以分析。",
      "progress.trendFaster": "最近反應變快了，越來越熟練！",
      "progress.trendSlower": "最近反應變慢了，可能需要多複習。",
      "progress.trendStable": "最近反應時間大致穩定。",
      "progress.levelsTitle": "各等級熟悉度",
      "progress.levelMemorized": "已熟記 {memorized} / {total}",
      "progress.syncTitle": "🔄 跨裝置同步",
      "progress.syncIntro": "把學習紀錄同步到你的其他裝置。先按「建立新同步」，再到其他裝置輸入密碼「加入同步」。",
      "progress.syncCreateBtn": "🔗 建立新同步",
      "progress.syncJoinFoldSummary": "已有同步密碼？加入同步",
      "progress.passcodeLabel": "密碼",
      "progress.syncJoinPlaceholder": "貼上同步密碼",
      "progress.syncJoinBtn": "加入同步",
      "progress.syncCreatedWarning": "請先複製保存這組密碼——之後不會再完整顯示第二次！",
      "progress.copyBtn": "複製",
      "progress.syncAckBtn": "已保存，關閉",
      "progress.showPasscodeBtn": "顯示密碼",
      "progress.hidePasscodeBtn": "隱藏密碼",
      "progress.syncNowBtn": "🔄 立即同步",
      "progress.syncUnlinkBtn": "解除同步",
      "progress.syncDeleteBtn": "整個刪除同步",
      "progress.backupTitle": "備份與還原（手動）",
      "progress.backupIntro": "也可以手動匯出備份檔，或匯入到其他裝置。",
      "progress.exportBtn": "📤 匯出學習紀錄",
      "progress.importBtn": "📥 匯入學習紀錄",
      "progress.resetBtn": "清除全部學習紀錄",
      "progress.detailTitle": "單字明細",
      "progress.filterAttempted": "已練習過",
      "progress.filterNew": "尚未測驗",
      "progress.filterIncorrect": "答錯待複習",
      "progress.filterLearning": "學習中",
      "progress.filterMemorized": "已熟記",
      "progress.filterAll": "全部單字",
      "progress.searchPlaceholder": "搜尋單字...",
      "progress.detailHint": "點擊單字可以顯示／隱藏中文意思，點擊 🔊 可以播放發音。",
      "progress.toggleMeaningTitle": "點擊顯示／隱藏中文意思",
      "progress.noMatchingWords": "沒有符合條件的單字。",
      "progress.tableExplainer":
        "從未答錯的字，答對一次就算「已熟記」；答錯過的字則需要連續答對 {streak} 次才會回到「已熟記」，答錯一次就歸零重算。已熟記的字理論上不會再出現，但 Auto 模式會依「風險預測」欄位不定期抽幾個風險較高的已熟記單字回來複習，確認沒有忘記。滑鼠移到「最近錯誤」可看更多紀錄。",
      "progress.tableRiskTitle":
        "系統預測此字現在被答錯的機率，僅供 Auto 模式判斷要不要把已熟記的字抽回來複習用，不影響「狀態」欄的已熟記／學習中判定",
      "progress.tableRiskHeaderTitle": "Auto 模式用來判斷是否該把已熟記的字抽回來複習的風險預測分數",
      "progress.colWord": "單字",
      "progress.colLevel": "等級",
      "progress.colCorrectIncorrect": "對／錯",
      "progress.colRisk": "風險預測",
      "progress.colAvgResponse": "平均反應時間",
      "progress.colRecentMistakes": "最近錯誤",
      "progress.colState": "狀態",
      "progress.statTotalWords": "總單字數",
      "progress.statAttempted": "已練習過",
      "progress.statMemorized": "已熟記",
      "progress.statLearning": "學習中",
      "progress.statIncorrect": "答錯待複習",
      "progress.statOverallAccuracy": "整體正確率",
      "progress.statMemorizationRate": "熟記率",
      "progress.statRecentAccuracy": "近期正確率",
      "progress.statAvgResponseTime": "平均反應時間",

      // ---- Word state labels (shared by test feedback / review / progress) ----
      "state.new": "尚未測驗",
      "state.incorrect": "答錯待複習",
      "state.learning": "學習中",
      "state.memorized": "已熟記",

      // ---- Backup / import / reset ----
      "backup.exportSuccess": "已匯出備份檔（共 {count} 個單字的紀錄）。",
      "backup.importInvalidJson": "匯入失敗：這不是有效的 JSON 備份檔。",
      "backup.importBadFormat": "匯入失敗：檔案格式不正確（找不到學習紀錄內容）。",
      "backup.importRegressionRefused":
        "匯入失敗：這份備份的練習紀錄比目前同步中的進度少，為了避免覆蓋掉其他裝置已經累積的進度，已取消匯入。如果你確定要用這份備份取代目前進度，請先到上面「跨裝置同步」按「解除同步」，再重新匯入一次。",
      "backup.importConfirm":
        "即將匯入備份檔（{count} 個單字的紀錄{exportedAt}）。\n\n這會「取代」目前這台裝置瀏覽器裡的全部學習紀錄，無法復原，確定要繼續嗎？",
      "backup.importConfirmExportedAt": "，匯出於 {date}",
      "backup.importSuccess": "已匯入 {count} 個單字的學習紀錄。",
      "backup.importReadError": "匯入失敗：無法讀取檔案。",
      "backup.resetConfirm": "確定要清除全部學習紀錄嗎？此動作無法復原。",

      // ---- Footer / update check ----
      "footer.source": "資料來源：大學入學考試中心「高中英文參考詞彙表」（108 課綱），Level 4–6，共 {total} 字。",
      "footer.updateCheckBtn": "🔄 檢查更新",
      "footer.checking": "檢查中...",
      "footer.upToDate": "✅ 目前已是最新版本",
      "footer.foundNewVersion": "🔄 發現新版本，正在重新整理...",
      "footer.checkFailed": "⚠️ 檢查失敗，請確認網路連線",
      "footer.updatedToVersion": "✅ 已更新到最新版本（{version}）",

      // ---- AI mnemonic feature (vocab-ai.js) ----
      "ai.notConfigured": "AI 功能尚未設定，請聯絡開發者。",
      "ai.offline": "目前沒有網路連線，無法使用 AI 功能。",
      "ai.networkErrorPrefix": "無法連線至 AI 服務：{message}",
      "ai.noMnemonic": "AI 沒有回傳有效的記憶法，請稍後再試一次。",
      "ai.generatingBtn": "生成中…",
      "ai.mnemonicBtn": "🪄 AI 記憶法",
      "ai.mnemonicResult": "💡 {mnemonic}",

      // ---- Cross-device sync (sync.js) ----
      "sync.notSupportedCompression": "此裝置不支援同步所需的壓縮功能。",
      "sync.notSupportedDecompression": "此裝置不支援同步所需的解壓縮功能。",
      "sync.notConfigured": "尚未設定同步。",
      "sync.createFailed": "建立同步失敗：{message}",
      "sync.uploadFailed": "同步上傳失敗：{message}",
      "sync.downloadFailed": "同步下載失敗：{message}",
      "sync.tooFrequentRetry": "同步請求過於頻繁，{seconds} 秒後自動重試（學習紀錄已存在本機，不會遺失）。",
      "sync.pulledInsteadOfPush":
        "其他裝置的練習次數比較多（{remote} 次，這台裝置 {local} 次），已改為抓取最新進度，避免覆蓋掉它。",
      "sync.syncedAt": "已同步（{time}）",
      "sync.updatedFromOtherDevice": "已從其他裝置更新學習紀錄（{time}）",
      "sync.pushedInsteadOfPull":
        "這台裝置的練習次數比較多（{local} 次，其他裝置 {remote} 次），已改為上傳最新進度，避免遺失。",
      "sync.offlineStatus":
        "目前離線，同步已暫時停用（學習紀錄仍正常存在這台裝置）。恢復網路連線後會自動繼續同步。",
      "sync.copiedFeedback": "已複製！",
      "sync.copyFailed": "複製失敗，請手動選取複製。",
      "sync.notSetUp": "跨裝置同步功能尚未設定，請聯絡開發者。",
      "sync.offlineCreate": "目前沒有網路連線，無法建立同步。",
      "sync.offlineJoin": "目前沒有網路連線，無法加入同步。",
      "sync.offlineSyncNow": "目前沒有網路連線，無法同步。",
      "sync.offlineDelete": "目前沒有網路連線，無法刪除同步。",
      "sync.createConfirm":
        "建立新同步會產生一組新的同步密碼，用來在你自己的其他裝置之間同步學習紀錄。\n\n已經有密碼的話請改用「加入同步」。要繼續嗎？",
      "sync.creating": "正在建立同步…",
      "sync.enterPasscode": "請輸入同步密碼。",
      "sync.checkingPasscode": "正在檢查同步密碼…",
      "sync.passcodeNotFound": "找不到這組同步密碼，請確認後再試一次。",
      "sync.joinConfirm":
        "加入同步會立刻用該密碼下的學習紀錄取代這台裝置目前的紀錄。\n\n這台裝置目前的紀錄會先備份起來，解除同步後可以選擇找回，但要繼續嗎？",
      "sync.joined": "已加入同步。",
      "sync.syncingNow": "正在同步…",
      "sync.synced": "已同步。",
      "sync.updatedToLatest": "已更新為最新的學習紀錄。",
      "sync.alreadyLatest": "已是最新。",
      "sync.restoreBackupPrompt": "要找回加入同步前的本機學習紀錄嗎？（取消則繼續使用目前的學習紀錄）",
      "sync.restoredBackup": "已還原加入同步前的學習紀錄。",
      "sync.deletedRemotelyAutoUnlinked":
        "同步已被刪除，這台裝置已自動解除同步（本機學習紀錄不受影響）。",
      "sync.unlinkConfirm":
        "解除同步後這台裝置會變回只在本機儲存進度，之後可用同一組代碼重新加入。其他裝置不受影響。要繼續嗎？",
      "sync.unlinked": "已解除同步（本機學習紀錄不受影響）。",
      "sync.clearedAndUnlinked": "已清除學習紀錄並解除同步（其他裝置與伺服器上的紀錄不受影響）。",
      "sync.deleteConfirm":
        "確定要整個刪除這組同步嗎？\n\n所有使用這組密碼的裝置都會斷開連結，此動作無法復原。",
      "sync.deleting": "正在刪除同步…",
      "sync.deleteFailed": "刪除失敗：{message}",
      "sync.deletedAllDisconnected": "已整個刪除同步，所有裝置都已斷開連結。",

      // ---- Language switcher ----
      "header.languageLabel": "語言",
    },

    en: {
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

      // ---- Language switcher ----
      "header.languageLabel": "Language",
    },
  };

  const LOCALE_KEY = "vocab_locale_v1";

  function readStoredLocale() {
    try {
      return localStorage.getItem(LOCALE_KEY) || "";
    } catch (e) {
      return "";
    }
  }

  function writeStoredLocale(locale) {
    try {
      localStorage.setItem(LOCALE_KEY, locale);
    } catch (e) {
      /* localStorage unavailable (private browsing, etc.) - the choice just
         won't survive a reload; nothing else to do about it here. */
    }
  }

  // Maps navigator.language/languages (e.g. "zh-Hant-TW", "zh-CN", "en-GB")
  // to one of this app's supported locales - only the primary subtag
  // ("zh"/"en") is examined, so any regional/script variant of a supported
  // language still matches. Falls back to DEFAULT_LOCALE for anything else
  // (French, Japanese, a browser reporting no language at all, etc.),
  // preserving this app's original zh-TW-only behavior for every user this
  // detection is inconclusive for.
  function localeForTag(tag) {
    if (!tag) return null;
    const primary = String(tag).toLowerCase().split("-")[0];
    if (primary === "zh") return "zh-TW";
    if (primary === "en") return "en";
    return null;
  }

  function detectLocale() {
    const candidates = [];
    try {
      if (typeof navigator !== "undefined") {
        if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages);
        if (navigator.language) candidates.push(navigator.language);
      }
    } catch (e) {
      /* navigator unavailable (non-browser test environment) - falls through
         to DEFAULT_LOCALE below */
    }
    for (const tag of candidates) {
      const matched = localeForTag(tag);
      if (matched) return matched;
    }
    return DEFAULT_LOCALE;
  }

  // A manual override (see setLocale) always wins over detection - once a
  // learner has actually picked a language, reopening the app must keep
  // showing that, not silently flip back the moment their OS/browser
  // language looks different.
  let currentLocale = (function () {
    const stored = readStoredLocale();
    if (stored && STRINGS[stored]) return stored;
    return detectLocale();
  })();

  function getLocale() {
    return currentLocale;
  }

  function setLocale(locale) {
    if (!STRINGS[locale]) return;
    currentLocale = locale;
    writeStoredLocale(locale);
  }

  // Substitutes {name}-style placeholders in `str` from `params` (e.g.
  // t("home.sampleWord", { word: "apple" }) -> "範例單字：apple"). A
  // placeholder with no matching key in `params` is left as-is rather than
  // silently becoming an empty string, which makes a missed interpolation
  // obvious instead of just producing subtly-wrong text.
  function interpolate(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, (match, name) =>
      Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
    );
  }

  function t(key, params) {
    const table = STRINGS[currentLocale] || {};
    const fallbackTable = STRINGS[DEFAULT_LOCALE] || {};
    const raw = key in table ? table[key] : key in fallbackTable ? fallbackTable[key] : key;
    return interpolate(raw, params);
  }

  return {
    STRINGS: STRINGS,
    LOCALES: LOCALES,
    DEFAULT_LOCALE: DEFAULT_LOCALE,
    t: t,
    detectLocale: detectLocale,
    getLocale: getLocale,
    setLocale: setLocale,
  };
});
