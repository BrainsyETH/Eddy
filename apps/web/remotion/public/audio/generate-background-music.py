#!/usr/bin/env python3
"""
Generate a 12-second acoustic-folk loop as background-music.wav.

Pure Python stdlib (wave + math + struct) — no external deps. Output is
44.1 kHz 16-bit stereo PCM. Run this script to regenerate the file after
tweaking the melody.

Design notes:
  - Progression: D major → G major → B minor → A major (I-IV-vi-V in D).
    Classic folk/pop loop, 3s per chord = 12s total — matches the
    GaugeAnimation composition duration exactly.
  - Each chord plays as an arpeggio (fingerpicked feel) over 3 seconds.
  - Each note is additive synthesis: fundamental + harmonics, enveloped
    to sound pluckier than a pure sine.
  - Stereo widens slightly by offsetting arpeggio phase between channels.
"""

import math
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 44100
DURATION_S = 12.0
CHANNELS = 2
BYTES_PER_SAMPLE = 2  # 16-bit
MAX_AMPLITUDE = 0.55  # headroom so the volume=0.9 step in the workflow doesn't clip


def note_hz(semitones_from_a4: int) -> float:
    return 440.0 * (2 ** (semitones_from_a4 / 12.0))


# Frequencies (semitones from A4).
#   A4 = 0, D4 = -7, F#4 = -4, A4 = 0, G3 = -14, B3 = -10, D4 = -7
#   Bm: B3=-10 D4=-7 F#4=-4 ; A: A3=-12 C#4=-8 E4=-5
CHORDS = [
    {  # D major (I)
        "bass": note_hz(-14 - 12),  # D2
        "arp": [note_hz(-7), note_hz(-4), note_hz(0), note_hz(-4)],  # D4 F#4 A4 F#4
    },
    {  # G major (IV)
        "bass": note_hz(-14),  # G3 (bass is an octave up because G2 is too muddy)
        "arp": [note_hz(-10), note_hz(-7), note_hz(-3), note_hz(-7)],  # B3 D4 E4… actually G4 pattern below
    },
    {  # B minor (vi)
        "bass": note_hz(-10 - 12),  # B2
        "arp": [note_hz(-10), note_hz(-7), note_hz(-4), note_hz(-7)],  # B3 D4 F#4 D4
    },
    {  # A major (V)
        "bass": note_hz(-12 - 12),  # A2
        "arp": [note_hz(-12), note_hz(-8), note_hz(-5), note_hz(-8)],  # A3 C#4 E4 C#4
    },
]
# Fix G major arpeggio (G B D cycle) — overriding the short-form above:
CHORDS[1]["arp"] = [note_hz(-14), note_hz(-10), note_hz(-7), note_hz(-10)]  # G3 B3 D4 B3


def pluck_envelope(t: float, note_duration: float) -> float:
    """Fast attack, gentle exponential decay — plucked string."""
    if t < 0 or t > note_duration:
        return 0.0
    attack = 0.01
    if t < attack:
        return t / attack
    decay_tau = note_duration * 0.55
    return math.exp(-(t - attack) / decay_tau)


def synth_note(freq: float, t: float, note_duration: float) -> float:
    """Additive synthesis: fundamental + a few odd/even harmonics."""
    env = pluck_envelope(t, note_duration)
    if env == 0.0:
        return 0.0
    phase = 2 * math.pi * freq * t
    sample = (
        math.sin(phase) * 1.0
        + math.sin(phase * 2) * 0.35
        + math.sin(phase * 3) * 0.18
        + math.sin(phase * 4) * 0.08
    )
    return env * sample


def render() -> tuple[list[int], list[int]]:
    total_samples = int(SAMPLE_RATE * DURATION_S)
    left = [0.0] * total_samples
    right = [0.0] * total_samples

    chord_duration = DURATION_S / len(CHORDS)
    arp_notes_per_chord = 6  # 6 plucks over 3s = 0.5s per pluck
    note_duration = chord_duration / arp_notes_per_chord * 1.6  # slight overlap → legato

    for chord_idx, chord in enumerate(CHORDS):
        chord_start = chord_idx * chord_duration

        # Bass: one long note held across the chord
        bass_len = chord_duration * 1.05
        bass_samples = int(bass_len * SAMPLE_RATE)
        bass_start_sample = int(chord_start * SAMPLE_RATE)
        for i in range(bass_samples):
            s_idx = bass_start_sample + i
            if s_idx >= total_samples:
                break
            t_local = i / SAMPLE_RATE
            v = synth_note(chord["bass"], t_local, bass_len) * 0.45
            left[s_idx] += v
            right[s_idx] += v

        # Arpeggio pattern — cycles through the arp notes
        arp_step = chord_duration / arp_notes_per_chord
        for step in range(arp_notes_per_chord):
            freq = chord["arp"][step % len(chord["arp"])]
            note_start = chord_start + step * arp_step
            note_start_sample = int(note_start * SAMPLE_RATE)
            note_samples = int(note_duration * SAMPLE_RATE)
            # Slight stereo spread: right channel 3ms late for width
            spread = int(0.003 * SAMPLE_RATE)
            for i in range(note_samples):
                t_local = i / SAMPLE_RATE
                v = synth_note(freq, t_local, note_duration) * 0.5
                l_idx = note_start_sample + i
                r_idx = note_start_sample + i + spread
                if 0 <= l_idx < total_samples:
                    left[l_idx] += v
                if 0 <= r_idx < total_samples:
                    right[r_idx] += v * 0.9  # slightly quieter on right

    # Global fade-in (0.5s) and fade-out (1.5s) to avoid clicks on loop points.
    fade_in = int(0.5 * SAMPLE_RATE)
    fade_out = int(1.5 * SAMPLE_RATE)
    for i in range(fade_in):
        g = i / fade_in
        left[i] *= g
        right[i] *= g
    for i in range(fade_out):
        g = i / fade_out
        left[total_samples - 1 - i] *= g
        right[total_samples - 1 - i] *= g

    # Normalize: find peak across both channels, then scale to MAX_AMPLITUDE.
    peak = max(max(abs(s) for s in left), max(abs(s) for s in right))
    if peak == 0:
        raise RuntimeError("Rendered silence — synth math is broken.")
    scale = MAX_AMPLITUDE / peak

    left_int = [int(max(-32768, min(32767, s * scale * 32767))) for s in left]
    right_int = [int(max(-32768, min(32767, s * scale * 32767))) for s in right]
    return left_int, right_int


def write_wav(path: Path, left: list[int], right: list[int]) -> None:
    frames = bytearray()
    for l, r in zip(left, right):
        frames += struct.pack("<hh", l, r)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(CHANNELS)
        wf.setsampwidth(BYTES_PER_SAMPLE)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(bytes(frames))


if __name__ == "__main__":
    out = Path(__file__).parent / "background-music.wav"
    print(f"Rendering {DURATION_S}s tune → {out}")
    left, right = render()
    write_wav(out, left, right)
    print(f"Wrote {out.stat().st_size:,} bytes")
