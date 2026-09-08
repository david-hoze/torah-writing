#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Generate per-chapter narration MP3s for the taaluma site - free, no API key.

Uses edge-tts (Microsoft Edge's online neural voices, the same ones behind
Edge's "Read Aloud"). No account, no key, no character cap. Hebrew voices:
    he-IL-AvriNeural  (male)      <- default
    he-IL-HilaNeural  (female)

Run this LOCALLY (never in CI) whenever a chapter's text changes. The resulting
MP3s are committed to the repo under sites/taaluma-site/audio/ ; build.py copies
them into the deployed site and the chapter pages get a play button.

Install the one dependency once:
    python3 -m pip install --break-system-packages edge-tts

Usage:
    python3 gen-audio.py                  # generate/update only changed chapters
    python3 gen-audio.py --force          # regenerate every chapter
    python3 gen-audio.py --chapters 1,3   # only these chapters
    python3 gen-audio.py --sample         # short sample of ch.1 -> audio/sample.mp3
    python3 gen-audio.py --list-voices    # list Hebrew voices (--all for every voice)
    python3 gen-audio.py --voice he-IL-HilaNeural   # override the narration voice
"""
import os, re, sys, json, time, hashlib, argparse, asyncio
import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
# taaluma chapters live two levels up, in uman-rosh-hashana/taaluma
SRC = os.environ.get("TAALUMA_SRC") or os.path.normpath(
    os.path.join(HERE, "..", "..", "uman-rosh-hashana", "taaluma"))
AUDIO_DIR = os.path.join(HERE, "audio")
MANIFEST = os.path.join(AUDIO_DIR, "manifest.json")

# ---- narration settings (override via flags or env) ----
VOICE = os.environ.get("TAALUMA_VOICE", "he-IL-AvriNeural")
RATE = os.environ.get("TAALUMA_RATE", "+0%")   # e.g. "-10%" to slow the narration
MAX_CHARS = 2200          # per-chunk size; keeps progress granular and requests safe
# --------------------------------------------------------

BIDI = "".join(chr(c) for c in [0x200e, 0x200f, 0x202a, 0x202b, 0x202c,
                                0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069])
def strip_bidi(s): return s.translate({ord(c): None for c in BIDI}).strip()


# ---------- markdown -> spoken plain text ----------
def strip_md(raw):
    raw = raw.replace("﻿", "")
    lines = raw.splitlines()
    # pull the first "# " heading out as the spoken intro (label + title)
    intro, start = "", 0
    for i, ln in enumerate(lines):
        if ln.lstrip().startswith("# ") and not ln.lstrip().startswith("## "):
            t = strip_bidi(ln.lstrip()[2:])
            intro = re.sub(r"\s+[-–]\s+", ". ", t)  # "חלק א' - שם" -> "חלק א'. שם"
            start = i + 1
            break
    out = []
    for ln in lines[start:]:
        s = ln.rstrip()
        s = re.sub(r"^\s*>+\s?", "", s)        # blockquote markers
        s = re.sub(r"^\s*#{1,6}\s*", "", s)    # heading markers (keep the text)
        if re.fullmatch(r"\s*([-*_]\s*){3,}", s):  # horizontal rule
            out.append("")
            continue
        s = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", s)          # images
        s = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", s)      # links -> text
        s = s.replace("*", "").replace("_", "").replace("`", "")  # emphasis
        out.append(s.strip())
    body = "\n".join(out)
    body = re.sub(r"\n{3,}", "\n\n", body).strip()
    if intro:
        body = intro.strip().rstrip(".") + ".\n\n" + body
    return body


_SENT = re.compile(r"(?<=[.!?׃…])\s+")
def chunk(text, limit=MAX_CHARS):
    chunks, cur = [], ""
    for para in re.split(r"\n\s*\n", text):
        para = para.strip()
        if not para:
            continue
        if len(para) > limit:                      # split a huge paragraph on sentences
            for sent in _SENT.split(para):
                if len(cur) + len(sent) + 1 > limit and cur:
                    chunks.append(cur.strip()); cur = ""
                cur += sent + " "
            continue
        if len(cur) + len(para) + 2 > limit and cur:
            chunks.append(cur.strip()); cur = ""
        cur += para + "\n\n"
    if cur.strip():
        chunks.append(cur.strip())
    return chunks


async def tts(text, voice):
    """Synthesize one chunk and return the MP3 bytes."""
    comm = edge_tts.Communicate(text, voice, rate=RATE)
    audio = b""
    async for part in comm.stream():
        if part["type"] == "audio":
            audio += part["data"]
    return audio


def synth_chapters():
    out = []
    for name in os.listdir(SRC):
        m = re.match(r"^taaluma-(\d+)\.md$", strip_bidi(name))
        if m:
            out.append((int(m.group(1)), os.path.join(SRC, name)))
    out.sort(key=lambda t: t[0])
    return out


def load_manifest():
    if os.path.exists(MANIFEST):
        try:
            return json.load(open(MANIFEST, encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_manifest(man):
    json.dump(man, open(MANIFEST, "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)


async def gen_one(num, path, voice, man, force):
    text = strip_md(open(path, encoding="utf-8").read())
    sig = hashlib.sha256(f"{voice}|{RATE}|{text}".encode("utf-8")).hexdigest()
    key_name = f"chapter-{num:02d}"
    dest = os.path.join(AUDIO_DIR, key_name + ".mp3")
    if not force and os.path.exists(dest) and man.get(key_name, {}).get("sig") == sig:
        print(f"  ch.{num:>2}  up to date ({man[key_name]['chars']} chars) - skip")
        return
    pieces = chunk(text)
    print(f"  ch.{num:>2}  {len(text)} chars -> {len(pieces)} request(s) ...", end="", flush=True)
    audio = b""
    for piece in pieces:
        audio += await tts(piece, voice)
        print(".", end="", flush=True)
        time.sleep(0.1)
    with open(dest, "wb") as f:
        f.write(audio)
    man[key_name] = {"sig": sig, "chars": len(text), "voice": voice,
                     "rate": RATE, "bytes": len(audio)}
    save_manifest(man)
    print(f" done ({len(audio)//1024} KB)")


async def run(args):
    if args.list_voices:
        voices = await edge_tts.list_voices()
        for v in sorted(voices, key=lambda x: x["ShortName"]):
            if args.all or v["Locale"].startswith("he-"):
                tags = ", ".join(v.get("VoiceTag", {}).get("VoicePersonalities", []))
                print(f"{v['ShortName']:<28} {v['Gender']:<8} {tags}")
        return

    if not os.path.isdir(SRC):
        sys.exit(f"Source folder not found: {SRC}")
    chapters = synth_chapters()
    if not chapters:
        sys.exit(f"No taaluma-N.md files in {SRC}")
    os.makedirs(AUDIO_DIR, exist_ok=True)

    if args.sample:
        num, path = chapters[0]
        text = strip_md(open(path, encoding="utf-8").read())
        excerpt = chunk(text)[0]
        print(f"Sample: voice={args.voice} rate={RATE} ({len(excerpt)} chars)")
        with open(os.path.join(AUDIO_DIR, "sample.mp3"), "wb") as f:
            f.write(await tts(excerpt, args.voice))
        print(f"Wrote {os.path.join(AUDIO_DIR, 'sample.mp3')} - listen and approve the voice.")
        return

    only = {int(x) for x in args.chapters.split(",") if x.strip()} if args.chapters else None
    man = load_manifest()
    print(f"Voice {args.voice} · rate {RATE} · source {SRC}")
    for num, path in chapters:
        if only and num not in only:
            continue
        await gen_one(num, path, args.voice, man, args.force)
    print("Done. Commit sites/taaluma-site/audio/ and push to deploy.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--chapters", help="comma-separated chapter numbers, e.g. 1,3")
    ap.add_argument("--sample", action="store_true",
                    help="synth one short excerpt of ch.1 -> audio/sample.mp3")
    ap.add_argument("--list-voices", action="store_true", help="list Hebrew voices")
    ap.add_argument("--all", action="store_true", help="with --list-voices: show every voice")
    ap.add_argument("--voice", default=VOICE)
    args = ap.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
