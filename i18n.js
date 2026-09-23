"use strict";

// ---- i18n.js ----
// Minimal, dependency-free UI translation layer for this app. Loaded as a
// plain <script> after locales/zh-TW.js and locales/en.js but before
// logic.js/app.js/sync.js/vocab-ai.js (attaches everything to
// `window.I18n`), same pattern as logic.js's own UMD wrapper (also
// exported via `module.exports` so it can be `require()`d from a future
// Node test the same way tests/logic.test.js requires logic.js).
//
// Architecture: each locale's own flat { key -> string } map lives in its
// own file under locales/ (see locales/zh-TW.js, locales/en.js), which
// registers itself into the shared I18N_LOCALES table on load. STRINGS
// below is just that table. Every UI-facing string in
// index.html/app.js/sync.js/vocab-ai.js is looked up through t(key)
// (optionally with a `{placeholder}` substitution object) instead of
// being hardcoded, so adding a third language later needs no changes in
// this file at all: copy locales/en.js to locales/<code>.js, translate
// its values, register it under a new key, and add a <script> tag for it
// in index.html before this file's own <script> tag (t() falls back to
// 'zh-TW' for anything missing, so a partial translation still renders
// correctly, just with a mix of languages, rather than crashing).
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

  // Populated by locales/zh-TW.js and locales/en.js, each loaded as a plain
  // <script> before this file (see index.html) and registering itself here.
  const GLOBAL_OBJ = typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : null;
  const STRINGS = (GLOBAL_OBJ && GLOBAL_OBJ.I18N_LOCALES) || {};

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

  // No manual override - always follows the device/browser language live,
  // the same as orbit and match-find. Re-evaluated fresh on every page
  // load (detectLocale() reads navigator.language at call time), so
  // changing the device's language and reopening the app just works,
  // with nothing to get "stuck" on an old choice.
  const currentLocale = detectLocale();

  function getLocale() {
    return currentLocale;
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
    DEFAULT_LOCALE: DEFAULT_LOCALE,
    t: t,
    detectLocale: detectLocale,
    getLocale: getLocale,
  };
});
