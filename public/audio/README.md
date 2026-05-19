# /public/audio/

This directory holds audio assets served by RateM8.

## greeting.mp3 (expected)

The orb's voice greeting. Played on the homepage when a visitor
taps the orb. If this file is missing, the site automatically
falls back to the browser's Web Speech API (robotic but functional).

**Script:** "G'day, mate. I'm M8."
**Duration:** ~1.5 seconds
**Format:** MP3, mono, 44.1kHz, 128kbps or higher
**File size target:** Under 30KB

### How to create greeting.mp3

**Option A — Record it yourself (recommended).**
1. Open QuickTime Player (Mac) or Voice Recorder (Windows).
2. Record a clean reading: "G'day, mate. I'm M8."
3. Light Aussie inflection, friendly but not theatrical.
4. Trim silence from both ends.
5. Export as MP3. Save here as `greeting.mp3`.

**Option B — ElevenLabs (production-quality, ~$0.02 per generation).**
1. Use the same voice you've selected for M8's chat agent
   (per the master strategy doc, ElevenLabs Turbo v2.5).
2. Generate "G'day, mate. I'm M8." with the chosen voice.
3. Download MP3. Save here as `greeting.mp3`.

**Option C — Browser Web Speech API (fallback, no file needed).**
Leave this directory empty. The `useGreeting` hook will detect
the missing file and use `SpeechSynthesisUtterance` to read the
greeting via the visitor's browser. Quality varies by browser
but it works everywhere. Good for initial deployment until you
record the real file.

## Why a static MP3 instead of generating per-visit

- **Cost:** ElevenLabs charges per character. A pre-recorded file
  costs $0 per visit after the initial generation.
- **Latency:** A 30KB MP3 plays instantly. An API round-trip to
  ElevenLabs takes 300-800ms which the visitor feels as awkward.
- **Consistency:** Same voice every time. Brand consistency matters
  more than dynamic variation for a 1.5-second hello.
- **Privacy:** No outbound API call on every page load. Cleaner
  privacy posture for a brand that says "your data stays yours."

When M8's full chat ships in Stage 2, that's when ElevenLabs runs
per-response. Greetings stay static.
