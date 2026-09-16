#!/usr/bin/env python3
"""Pre-generates one MP3 pronunciation clip per vocabulary word.

The app used to rely on the browser's Web Speech API (speechSynthesis),
whose quality depends entirely on whatever voices happen to be installed
on the user's OS/browser - often robotic or inconsistent. This script
instead renders every word once, offline, using a single high-quality
neural voice (Microsoft Edge's online TTS service via the open-source
`edge-tts` package - no API key required), and commits the resulting
clips as static files the app fetches on demand. See app.js's speak()
for the playback side (falls back to speechSynthesis if a clip is
missing, e.g. for a word added before its audio was (re)generated).

Most words are synthesized bare (just the word itself) - fine, since most
English words only have one reasonable pronunciation regardless of context.
A real minority - heteronyms, e.g. "record" (a NOUN, front-stressed, vs. to
"record", a VERB, back-stressed) or "estimate" (a schwa-ending NOUN/ADJ vs.
a long-A-ending VERB) - have no such single answer, and a bare isolated word
gives a neural TTS model no grammatical context to pick the right one from,
unlike a normal sentence. HETERONYM_OVERRIDES (below) lists every such word
actually present in data/vocab.json, each mapped to a short carrier sentence
that puts it in the grammatical position matching this vocab entry's own
primary listed part of speech (see that dict's own comment for exactly how
each sentence was chosen) - the model reads real running text correctly
almost all the time, so embedding the word in one clean sentence and cutting
just its own span back out (via edge-tts's WordBoundary timing metadata) is
far more reliable than hoping the bare word defaults to the right reading.

Usage:
    pip install edge-tts pydub
    (also needs ffmpeg on PATH, for the heteronym slicing path - apt/brew
    install ffmpeg)
    python3 scripts/generate_audio.py [--voice VOICE_NAME] [--concurrency N]

Safe to re-run: existing files are skipped, so interrupting and resuming
(or regenerating after adding new words to data/vocab.json) only fills in
what's missing. A word added to HETERONYM_OVERRIDES after its bare-word
clip already exists needs that one file deleted manually first, once - this
script only ever fills in a MISSING file, it never re-decides an existing
one's synthesis path on its own.
"""

import argparse
import asyncio
import io
import json
import os
import ssl
import sys
from pathlib import Path

import aiohttp
import edge_tts

ROOT = Path(__file__).resolve().parent.parent
VOCAB_PATH = ROOT / "data" / "vocab.json"
AUDIO_DIR = ROOT / "data" / "audio"

DEFAULT_VOICE = "en-US-JennyNeural"
MAX_RETRIES = 4

# word -> a short carrier sentence that forces the correct heteronym reading
# by putting the word in the right grammatical slot, built from each word's
# OWN data/vocab.json `pos` entry (the first-listed part of speech there is
# treated as this vocab card's primary sense - matching how the rest of the
# app already treats `pos` as the authoritative field, e.g.
# computeDifficultyBaseline's own POS grouping): "n." -> "I need the {w}.",
# "v." -> "I will {w} it.", "adj." -> "The {w} one." (a pre-nominal frame
# rather than "very {w}" - many of these adjectives, e.g. "associate",
# "subordinate", don't naturally take degree modification, but ALL
# adjectives take this position). "bass" is the one genuine exception: its
# ambiguity isn't grammatical (its vocab entry's adj./n. senses share one
# pronunciation) but semantic - bare "bass" can default to the unrelated
# fish reading - so it gets a bespoke, semantically unambiguous sentence
# instead of a templated one.
HETERONYM_OVERRIDES = {
    "content": "The content one.",
    "conduct": "I need the conduct.",
    "contrast": "I need the contrast.",
    "convict": "I need the convict.",
    "combat": "I need the combat.",
    "compact": "The compact one.",
    "compound": "The compound one.",
    "console": "I need the console.",
    "construct": "I will construct it.",
    "contest": "I need the contest.",
    "convert": "I will convert it.",
    "defect": "I need the defect.",
    "digest": "I need the digest.",
    "discard": "I need the discard.",
    "discharge": "I need the discharge.",
    "escort": "I need the escort.",
    "excerpt": "I need the excerpt.",
    "exploit": "I need the exploit.",
    "extract": "I need the extract.",
    "impact": "I need the impact.",
    "incline": "I need the incline.",
    "insert": "I need the insert.",
    "insult": "I need the insult.",
    "mandate": "I need the mandate.",
    "output": "I need the output.",
    "overflow": "I need the overflow.",
    "overlap": "I need the overlap.",
    "perfume": "I need the perfume.",
    "protest": "I need the protest.",
    "rebel": "I need the rebel.",
    "recall": "I need the recall.",
    "refund": "I need the refund.",
    "retreat": "I need the retreat.",
    "segment": "I need the segment.",
    "torment": "I need the torment.",
    "transfer": "I need the transfer.",
    "transform": "I will transform it.",
    "transplant": "I need the transplant.",
    "upgrade": "I need the upgrade.",
    "estimate": "I need the estimate.",
    "moderate": "The moderate one.",
    "advocate": "I need the advocate.",
    "associate": "The associate one.",
    "appropriate": "The appropriate one.",
    "articulate": "The articulate one.",
    "delegate": "I need the delegate.",
    "deliberate": "The deliberate one.",
    "elaborate": "The elaborate one.",
    "intimate": "The intimate one.",
    "alternate": "The alternate one.",
    "coordinate": "The coordinate one.",
    "subordinate": "The subordinate one.",
    "certificate": "I need the certificate.",
    "affiliate": "I need the affiliate.",
    "approximate": "The approximate one.",
    "initiate": "The initiate one.",
    "legitimate": "The legitimate one.",
    "animate": "The animate one.",
    "sow": "I will sow it.",
    "resume": "I need the resume.",
    "bass": "His voice has a deep bass tone.",
}

# Maximum padding added around the target word's own [offset, offset+duration]
# span (from WordBoundary metadata) before slicing, and fade lengths applied
# to the cut edges - a hard cut exactly on the boundary clips the very
# start/end of the word's own sound and can leave an audible click; a little
# of the surrounding silence plus a short fade avoids both. This is a CAP,
# not a fixed amount - see synthesize_heteronym's own comment on why it gets
# clamped per-word against the neighboring words' own reported boundaries
# (a carrier sentence's target word is usually preceded/followed directly by
# an unstressed function word - "the", "I will", "...one" - with little or no
# real silence gap between them in fluent speech, so blindly applying the
# full cap could reach backward/forward into the NEIGHBOR's own sound
# instead of just padding silence, corrupting the very word being isolated).
SLICE_PAD_MS = 40
FADE_IN_MS = 15
FADE_OUT_MS = 25


def audio_filename(word):
    return f"{word.lower()}.mp3"


def _edge_tts_kwargs():
    # Most environments need neither of these (aiohttp talks straight to
    # Microsoft's endpoint over the system's normal trust store) - both are
    # only for a sandboxed dev environment whose outbound HTTPS is routed
    # through a local TLS-terminating proxy (see /root/.ccr/README.md):
    # aiohttp doesn't pick that proxy up on its own (it ignores HTTPS_PROXY
    # unless told to), and won't trust the proxy's re-signed certificate
    # without being pointed at its CA bundle explicitly.
    kwargs = {}
    ca_bundle = Path("/root/.ccr/ca-bundle.crt")
    if ca_bundle.exists():
        kwargs["connector"] = aiohttp.TCPConnector(ssl=ssl.create_default_context(cafile=str(ca_bundle)))
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
    if proxy:
        kwargs["proxy"] = proxy
    return kwargs


async def synthesize_heteronym(word, sentence, voice):
    """Renders `sentence`, locates `word`'s own span via WordBoundary
    timing metadata, and returns just that slice as MP3 bytes (pydub/
    ffmpeg) - see HETERONYM_OVERRIDES's own comment for why this exists.

    Regression note: an earlier version padded a flat SLICE_PAD_MS on both
    sides of the target word's own reported span with no regard for where
    the NEIGHBORING words actually are. In fluent speech a function word
    right before/after the target (these carrier sentences are built
    entirely of them - "the", "I will", "...one") often has little to no
    real silence gap before it, so a flat pad routinely reached backward/
    forward far enough to catch the tail or head of that OTHER word's own
    sound - the target word's clip came out with an audible fragment of a
    different word stitched onto it. Fixed by capping the padding on each
    side to at most half the actual gap to that neighbor's own reported
    boundary (0 if the words are back-to-back with no gap at all) - the
    padding can now only ever eat into real silence, never into another
    word's own reported span, whatever SLICE_PAD_MS is set to.
    """
    from pydub import AudioSegment  # local import: only needed on this path

    communicate = edge_tts.Communicate(sentence, voice, boundary="WordBoundary", **_edge_tts_kwargs())
    audio_bytes = bytearray()
    boundaries = []
    target_index = None
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_bytes.extend(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            boundaries.append(chunk)
            if chunk["text"].lower() == word.lower():
                target_index = len(boundaries) - 1  # last match wins if the word repeats
    if target_index is None:
        raise RuntimeError(f"word boundary for {word!r} not found in synthesized sentence {sentence!r}")

    full = AudioSegment.from_mp3(io.BytesIO(bytes(audio_bytes)))
    target = boundaries[target_index]
    # WordBoundary offsets/durations are in 100-nanosecond ticks.
    target_start = target["offset"]
    target_end = target["offset"] + target["duration"]
    prev_end = boundaries[target_index - 1]["offset"] + boundaries[target_index - 1]["duration"] if target_index > 0 else 0
    next_start = boundaries[target_index + 1]["offset"] if target_index + 1 < len(boundaries) else len(full) * 10_000

    pad_before_ticks = max(0, min(SLICE_PAD_MS * 10_000, (target_start - prev_end) // 2))
    pad_after_ticks = max(0, min(SLICE_PAD_MS * 10_000, (next_start - target_end) // 2))

    start_ms = (target_start - pad_before_ticks) / 10_000
    end_ms = (target_end + pad_after_ticks) / 10_000
    clip = full[max(0, start_ms) : min(len(full), end_ms)]
    clip = clip.fade_in(min(FADE_IN_MS, len(clip) // 4)).fade_out(min(FADE_OUT_MS, len(clip) // 4))
    buf = io.BytesIO()
    clip.export(buf, format="mp3", bitrate="64k")
    return buf.getvalue()


async def generate_one(word, voice, semaphore):
    out_path = AUDIO_DIR / audio_filename(word)
    if out_path.exists() and out_path.stat().st_size > 0:
        return "skip"

    override_sentence = HETERONYM_OVERRIDES.get(word.lower())

    async with semaphore:
        for attempt in range(1, MAX_RETRIES + 1):
            try:
                tmp_path = out_path.with_suffix(".mp3.tmp")
                if override_sentence:
                    tmp_path.write_bytes(await synthesize_heteronym(word, override_sentence, voice))
                else:
                    communicate = edge_tts.Communicate(word, voice, **_edge_tts_kwargs())
                    await communicate.save(str(tmp_path))
                if tmp_path.stat().st_size == 0:
                    raise RuntimeError("empty audio output")
                tmp_path.rename(out_path)
                return "ok"
            except Exception as exc:  # noqa: BLE001 - retry any transient failure
                if attempt == MAX_RETRIES:
                    print(f"FAILED: {word!r}: {exc}", file=sys.stderr)
                    return "fail"
                await asyncio.sleep(1.5 * attempt)
    return "fail"


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--voice", default=DEFAULT_VOICE)
    parser.add_argument("--concurrency", type=int, default=6)
    parser.add_argument("--limit", type=int, default=None, help="only process the first N words (for testing)")
    args = parser.parse_args()

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    vocab = json.loads(VOCAB_PATH.read_text(encoding="utf-8"))
    words = [w["word"] for w in vocab]
    if args.limit:
        words = words[: args.limit]

    semaphore = asyncio.Semaphore(args.concurrency)
    tasks = [generate_one(w, args.voice, semaphore) for w in words]

    results = {"ok": 0, "skip": 0, "fail": 0}
    done = 0
    for coro in asyncio.as_completed(tasks):
        outcome = await coro
        results[outcome] += 1
        done += 1
        if done % 100 == 0 or done == len(words):
            print(f"[{done}/{len(words)}] ok={results['ok']} skip={results['skip']} fail={results['fail']}")

    print(f"Done. ok={results['ok']} skip={results['skip']} fail={results['fail']} voice={args.voice}")
    if results["fail"]:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
