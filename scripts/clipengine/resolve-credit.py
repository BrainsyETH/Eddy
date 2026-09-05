#!/usr/bin/env python3
"""resolve-credit.py — the creator credit for a clip, by ONE rule on both paths.

Usage:
    resolve-credit.py <heatmap-data.json> [channels.json] [--instagram HANDLE]

Prints one line — the credit that render-clip.yml stores as
clip_library.source_creator, draws in the reel's dock, and that the caption
pipeline (src/lib/social/clip-credit.ts) turns into "🎥 Clip via …":

    @handle        the creator's Instagram handle — the caption's @mention is
                   what actually TAGS the creator on Instagram
    Channel Name   the bare YouTube channel name when no Instagram is known

The rule, in order:
  1. --instagram HANDLE (a manual run naming the account) wins.
  2. Else the clipengine-local/channels.json entry for the video's channel —
     matched by YouTube @handle, channel id, or /c/ /user/ path against the
     entry's url — supplies its "instagram" field, when it has one.
  3. Else the channel name.

Only an Instagram handle ever carries the "@". The caption pipeline treats a
leading "@" as "this is an Instagram account we know", and a YouTube handle
guessed into an "@" would tag a stranger — so the YouTube handle is never
promoted to a mention here, even when it is right there in the channel URL.
Add the Instagram handle to channels.json and every future clip from that
channel tags them.

Reads channel_handle / channel_id / channel_url / channel from the heatmap
JSON scrape-heatmap.sh writes. Missing fields degrade to the next rule; a
missing or unparseable channels.json is treated as empty.
"""
import json
import re
import sys


def _clean_handle(value):
    """'@Foo' / 'foo' → 'foo' (lower-cased, no @); '' when unusable."""
    value = (value or "").strip().lstrip("@").strip()
    return value.lower()


def _channel_keys(url):
    """The ways a channels.json url can name a channel: (handle, channel_id, path_name)."""
    url = (url or "").strip()
    handle = channel_id = path_name = ""
    m = re.search(r"/@([^/?#]+)", url)
    if m:
        handle = _clean_handle(m.group(1))
    m = re.search(r"/channel/([^/?#]+)", url)
    if m:
        channel_id = m.group(1).strip()
    m = re.search(r"/(?:c|user)/([^/?#]+)", url)
    if m:
        path_name = m.group(1).strip().lower()
    return handle, channel_id, path_name


def load_channels(path):
    if not path:
        return []
    try:
        with open(path) as f:
            data = json.load(f)
    except Exception:
        return []
    entries = []
    for c in data if isinstance(data, list) else []:
        if isinstance(c, str):
            entries.append({"url": c, "instagram": ""})
        elif isinstance(c, dict):
            entries.append({"url": c.get("url") or "", "instagram": c.get("instagram") or ""})
    return entries


def match_instagram(video, channels):
    """The instagram handle of the channels.json entry that names this video's channel, or ''."""
    # The video's own url names the channel the same ways an entry's does; it
    # fills in whatever the scrape left blank.
    u_handle, u_id, v_path = _channel_keys(video.get("channel_url") or "")
    v_handle = _clean_handle(video.get("channel_handle") or "") or u_handle
    v_id = (video.get("channel_id") or "").strip() or u_id
    v_name = (video.get("channel") or "").strip().lower()
    for entry in channels:
        handle, channel_id, path_name = _channel_keys(entry["url"])
        hit = (
            (handle and v_handle and handle == v_handle)
            or (channel_id and v_id and channel_id == v_id)
            or (path_name and v_path and path_name == v_path)
            # A /c/Name or /user/Name url usually IS the display name.
            or (path_name and v_name and path_name == v_name.replace(" ", "").lower())
        )
        if hit:
            return _clean_handle(entry["instagram"])
    return ""


def resolve(video, channels, instagram_override=""):
    ig = _clean_handle(instagram_override) or match_instagram(video, channels)
    if ig:
        return "@" + ig
    return (video.get("channel") or "").strip()


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    instagram = ""
    if "--instagram" in argv:
        i = argv.index("--instagram")
        instagram = argv[i + 1] if i + 1 < len(argv) else ""
        args = [a for a in args if a != instagram]
    if not args:
        sys.stderr.write(__doc__)
        return 2
    try:
        with open(args[0]) as f:
            video = json.load(f)
    except Exception as e:
        sys.stderr.write(f"resolve-credit: cannot read {args[0]}: {e}\n")
        return 1
    channels = load_channels(args[1] if len(args) > 1 else "")
    print(resolve(video, channels, instagram))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
