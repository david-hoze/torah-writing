#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Turn one chapter of the taaluma book into a narrated MP3 with Gemini TTS.

Reads a local chapter Markdown file (preferred) or scrapes a live chapter URL,
strips the markup while keeping the nikud, expands a few abbreviations for
speech, splits the text at "##" headings (and long chunks at paragraphs), sends
each chunk to the Gemini TTS API with a single narrator voice and a Hebrew style
preamble, caches each chunk's audio, then concatenates and encodes a 64k mono MP3.

  python3 make-chapter.py                         # -> chapter 1 from local .md
  python3 make-chapter.py ../../uman-rosh-hashana/taaluma/taaluma-3.md --chapter 3
  python3 make-chapter.py https://taaluma.pages.dev/chapter-01/ --chapter 1
  python3 make-chapter.py taaluma-1.md --voice Kore   # different narrator voice

Env:  GEMINI_API_KEY   (required)
Deps: ffmpeg on PATH (for MP3 encode); Gemini REST is called via stdlib urllib.

Note: we call the Gemini REST endpoint directly (urllib) instead of the
google-genai package, which currently has no wheel for Python 3.14. Same models,
same result. Primary model gemini-2.5-pro-preview-tts falls back to
gemini-3.1-flash-tts-preview on quota/5xx errors.
"""
import os, re, sys, json, time, wave, base64, hashlib, argparse
import subprocess, tempfile, unicodedata, html as htmllib
import urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIO_DIR = os.path.join(HERE, "audio")
CACHE_DIR = os.path.join(AUDIO_DIR, ".cache")
API = "https://generativelanguage.googleapis.com/v1beta/models"

# ---- narration settings ----
DEFAULT_VOICE = "Charon"
PRIMARY_MODEL = "gemini-2.5-pro-preview-tts"
FALLBACK_MODEL = "gemini-3.1-flash-tts-preview"
STYLE = ("קרא בקול רך ומהורהר, כקריין של ספר שמע. "
         "את הציטוטים מהספרים קרא מעט לאט יותר.")
MAX_CHARS = 3000          # sub-split chunks longer than this at paragraph breaks
SAMPLE_RATE = 24000       # Gemini TTS returns 24kHz 16-bit mono PCM (audio/L16)

# ---- abbreviation expansion for speech (extend freely) ----
# Applied in order; put multi-word / more-specific entries first.
ABBREV = [
    ("רבינו ז\"ל", "רבינו זכרונו לברכה"),
    ("מוהרנ\"ת", "מוהרנת"),
    ("ז\"ל", "זכרונו לברכה"),
]
# -----------------------------

BIDI = "".join(chr(c) for c in [0x200e, 0x200f, 0x202a, 0x202b, 0x202c,
                                0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069])
def strip_bidi(s): return s.translate({ord(c): None for c in BIDI}).strip()


def ffmpeg_exe():
    for cand in ("ffmpeg", "/ucrt64/bin/ffmpeg", "/usr/bin/ffmpeg"):
        try:
            subprocess.run([cand, "-version"], capture_output=True, check=True)
            return cand
        except Exception:
            continue
    sys.exit("ffmpeg not found. Install it (pacman -S mingw-w64-ucrt-x86_64-ffmpeg).")


def expand_abbrev(text):
    for src, dst in ABBREV:
        text = text.replace(src, dst)
    return text


# ---------- source -> spoken plain text ----------
def from_markdown(raw):
    raw = raw.replace("﻿", "")
    lines = raw.splitlines()
    intro, start = "", 0
    for i, ln in enumerate(lines):
        if ln.lstrip().startswith("# ") and not ln.lstrip().startswith("## "):
            t = strip_bidi(ln.lstrip()[2:])
            intro = re.sub(r"\s+[-–]\s+", ". ", t)
            start = i + 1
            break
    out = []
    for ln in lines[start:]:
        s = ln.rstrip()
        # keep the ## marker so we can split on headings, but drop deeper hashes
        if re.match(r"^\s*##\s+", s):
            out.append("## " + re.sub(r"^\s*#{2,6}\s*", "", s))
            continue
        s = re.sub(r"^\s*>+\s?", "", s)
        s = re.sub(r"^\s*#{1,6}\s*", "", s)
        if re.fullmatch(r"\s*([-*_]\s*){3,}", s):
            out.append(""); continue
        s = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", s)
        s = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", s)
        s = s.replace("*", "").replace("_", "").replace("`", "")
        out.append(s.strip())
    body = "\n".join(out)
    body = re.sub(r"\n{3,}", "\n\n", body).strip()
    if intro:
        body = intro.strip().rstrip(".") + ".\n\n" + body
    return body


def from_html(page):
    # pull the <article> if present, else the whole body
    m = re.search(r"<article[^>]*>(.*?)</article>", page, re.S | re.I)
    frag = m.group(1) if m else page
    frag = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", "", frag)
    # mark headings so the splitter can see them
    frag = re.sub(r"(?is)<h2[^>]*>(.*?)</h2>", r"\n\n## \1\n\n", frag)
    frag = re.sub(r"(?is)</p\s*>", "\n\n", frag)
    frag = re.sub(r"(?is)<br\s*/?>", "\n", frag)
    text = re.sub(r"(?s)<[^>]+>", "", frag)
    text = htmllib.unescape(text)
    text = re.sub(r"[ \t]+\n", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def load_source(arg):
    if arg.startswith("http://") or arg.startswith("https://"):
        with urllib.request.urlopen(arg, timeout=60) as r:
            return from_html(r.read().decode("utf-8", "replace"))
    with open(arg, encoding="utf-8") as f:
        return from_markdown(f.read())


# ---------- chunking: split on ## headings, then long paragraphs ----------
_SENT = re.compile(r"(?<=[.!?׃…])\s+")
def split_paragraphs(block, limit):
    if len(block) <= limit:
        return [block]
    out, cur = [], ""
    for para in re.split(r"\n\s*\n", block):
        para = para.strip()
        if not para:
            continue
        if len(para) > limit:
            for sent in _SENT.split(para):
                if len(cur) + len(sent) + 1 > limit and cur:
                    out.append(cur.strip()); cur = ""
                cur += sent + " "
            continue
        if len(cur) + len(para) + 2 > limit and cur:
            out.append(cur.strip()); cur = ""
        cur += para + "\n\n"
    if cur.strip():
        out.append(cur.strip())
    return out


def chunk(text, limit=MAX_CHARS):
    # split at each "## heading", keeping the heading with its section
    blocks, cur = [], ""
    for line in text.splitlines():
        if line.startswith("## ") and cur.strip():
            blocks.append(cur.strip()); cur = ""
        cur += line + "\n"
    if cur.strip():
        blocks.append(cur.strip())
    chunks = []
    for b in blocks:
        b = b.replace("## ", "")           # heading text stays, marker goes
        chunks.extend(split_paragraphs(b, limit))
    return [c for c in chunks if c.strip()]


# ---------- Gemini TTS ----------
def tts_pcm(text, voice, model, key, retries=4):
    url = f"{API}/{model}:generateContent?key={key}"
    body = {
        "contents": [{"parts": [{"text": f"{STYLE}\n\n{text}"}]}],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {"voiceConfig": {
                "prebuiltVoiceConfig": {"voiceName": voice}}},
        },
    }
    data = json.dumps(body).encode("utf-8")
    for attempt in range(retries):
        req = urllib.request.Request(url, data=data,
              headers={"Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                resp = json.loads(r.read())
            part = resp["candidates"][0]["content"]["parts"][0]
            return base64.b64decode(part["inlineData"]["data"])
        except urllib.error.HTTPError as e:
            code = e.code
            msg = e.read().decode("utf-8", "replace")[:160]
            # 429 = quota; it won't clear in seconds, so fail fast and let the
            # caller fall back to the other model. Retry only transient 5xx.
            if code in (500, 503) and attempt < retries - 1:
                wait = 2 ** attempt
                print(f" [{code} retry in {wait}s]", end="", flush=True)
                time.sleep(wait)
                continue
            raise RuntimeError(f"HTTP {code}: {msg}")
    raise RuntimeError("exhausted retries")


def synth_chunk(text, voice, key):
    """Return PCM bytes for a chunk, trying the primary model then the fallback."""
    try:
        return tts_pcm(text, voice, PRIMARY_MODEL, key), PRIMARY_MODEL
    except RuntimeError as e:
        print(f" [primary failed: {e}; falling back]", end="", flush=True)
        return tts_pcm(text, voice, FALLBACK_MODEL, key), FALLBACK_MODEL


def write_wav(path, pcm):
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SAMPLE_RATE)
        w.writeframes(pcm)


def wav_seconds(path):
    with wave.open(path, "rb") as w:
        return w.getnframes() / float(w.getframerate())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source", nargs="?",
                    default=os.path.join(HERE, "..", "..",
                            "uman-rosh-hashana", "taaluma", "taaluma-1.md"),
                    help="local .md path or a chapter URL")
    ap.add_argument("--chapter", type=int, default=1, help="chapter number for output name")
    ap.add_argument("--voice", default=DEFAULT_VOICE)
    ap.add_argument("--out", help="output mp3 path (default audio/chapter-NN.mp3)")
    ap.add_argument("--force", action="store_true", help="ignore chunk cache")
    args = ap.parse_args()

    key = os.environ.get("GEMINI_API_KEY")
    if not key:
        sys.exit("GEMINI_API_KEY is not set. Run:  export GEMINI_API_KEY=...")
    ff = ffmpeg_exe()

    text = expand_abbrev(load_source(args.source))
    pieces = chunk(text)
    print(f"chapter {args.chapter}: {len(text)} chars -> {len(pieces)} chunk(s) · "
          f"voice {args.voice}")

    ch_cache = os.path.join(CACHE_DIR, f"chapter-{args.chapter:02d}")
    os.makedirs(ch_cache, exist_ok=True)
    wav_paths = []
    for i, piece in enumerate(pieces):
        sig = hashlib.sha256(f"{args.voice}|{STYLE}|{piece}".encode()).hexdigest()[:16]
        wpath = os.path.join(ch_cache, f"chunk-{i:03d}-{sig}.wav")
        # drop any stale wav for this index whose signature changed
        for old in [p for p in os.listdir(ch_cache)
                    if p.startswith(f"chunk-{i:03d}-") and p != os.path.basename(wpath)]:
            os.remove(os.path.join(ch_cache, old))
        if args.force or not os.path.exists(wpath):
            print(f"  chunk {i+1}/{len(pieces)} ({len(piece)} chars) ...", end="", flush=True)
            pcm, used = synth_chunk(piece, args.voice, key)
            write_wav(wpath, pcm)
            print(f" {len(pcm)//1024} KB [{used.split('-')[-1]}]")
            time.sleep(0.3)
        else:
            print(f"  chunk {i+1}/{len(pieces)} cached")
        wav_paths.append(wpath)

    out = args.out or os.path.join(AUDIO_DIR, f"chapter-{args.chapter:02d}.mp3")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    total_sec = sum(wav_seconds(p) for p in wav_paths)
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as lst:
        for p in wav_paths:
            lst.write(f"file '{os.path.abspath(p)}'\n")
        list_file = lst.name
    try:
        subprocess.run([ff, "-y", "-f", "concat", "-safe", "0", "-i", list_file,
                        "-ac", "1", "-b:a", "64k", out],
                       capture_output=True, check=True)
    finally:
        os.remove(list_file)

    size = os.path.getsize(out)
    mm, ss = divmod(int(round(total_sec)), 60)
    print(f"\nWrote {out}\n  size: {size/1024/1024:.2f} MB   duration: {mm}:{ss:02d}")


if __name__ == "__main__":
    main()
