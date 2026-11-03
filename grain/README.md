# Grain

A granular synthesizer that lives in a floating window over a night garden of moths and flowers. Open `index.html`, then press the power button or Space. Click the garden to play a note. No build step, no npm, no external assets.

## Sound

Four sample sources are synthesized in the browser when audio starts, and an `own` source appears when you load a local audio file with the arrow button beside the source buttons. The grain engine scans whichever source is selected:

- **choir** — a slow, detuned vocal cluster
- **harp** — overlapping plucked pentatonic notes
- **rain** — filtered noise with short droplet pings
- **glass** — inharmonic bell partials with long decays
- **own** — a local file, mixed to mono and trimmed to 24 seconds

Each grain is a short window into the selected buffer, with its own playback rate, stereo position and amplitude envelope. Grains are scheduled with a 120 ms lookahead so timing stays steady while parameters move. The grain shape control selects the envelope window (the default soft shape is a Tukey window), and a voice-level ADSR shapes the whole note, so the texture is smooth instead of clicky.

| Control | Range | What it does |
| --- | --- | --- |
| position | 0–100 | read head through the sample |
| size | 24–480 ms | grain length |
| density | 2–60 /s | grains per second per voice |
| spray | 0–100% | random spread around the read head |
| pitch | ±24 st | transposition of the grain playback rate |
| scatter | 0–100 cents | random pitch offset per grain |
| speed | 0.25–2× | tape speed, which also drives the garden |
| tone | 0–100% | filter cutoff |
| space | 0–100% | convolution reverb mix |
| width | 0–100% | stereo spread |
| level | 0–100% | output level |
| attack | 5–2000 ms | voice attack |
| decay | 10–2000 ms | voice decay |
| sustain | 0–100% | voice sustain level |
| release | 20–4000 ms | voice release |
| shape | soft / perc / swell / tri / gate / sine / sine² / ramp↑ / ramp↓ / rect | grain envelope |
| direction | forward / reverse / random / play dir / inv dir | per-grain read direction |
| scale | off / minor / major / dorian / chromatic | grain pitch quantization |
| motion target | position / pitch / tone / width / space | LFO destination |
| rate | 0.02–8 Hz | motion LFO rate |
| depth | 0–100% | motion LFO amount |
| filter | LP / HP / BP | filter mode |
| resonance | 0.1–20 | filter Q |
| drive | 0–100% | saturation |
| echo | 0–100% | delay send |

`hold` locks the read head in place and removes spray jitter. `rev` switches the grain direction between forward and reverse; the direction menu also offers random, play-direction and inverted play-direction modes. Play-direction modes follow the read-head motion, so pair them with a position-targeted motion LFO or move the position control. `drift` plays a slow generative melody from the current scale. The arrow button beside the source buttons loads an audio file (up to 24 seconds, mixed to mono) and adds it as the `own` source. The shuffle button in the header randomizes the patch. Dragging a knob vertically changes it; hold Shift for fine control; double-click a knob to restore its default. Arrow keys and Home/End also work when a knob is focused.

The `more` toggle opens the extra grain, motion and tone rows. It is open by default on desktop and closed on small screens.

The motion LFO moves the read head, pitch, tone, stereo width or reverb amount. Its target is reflected in the cloud and the garden: the read head and beam drift with it, glow follows tone, moth orbits follow width, and haze follows space.

The cloud display zooms around the read head. The lower strip shows the whole sample, and the bracket marks the visible window. Each grain is drawn as a slice with a moving playhead and a faint window arch; the arch changes with the selected grain shape, and random direction flips individual playheads.

## Keyboard

`A W S E D F T G Y H U J K` play a chromatic octave. `Z` and `X` shift the octave. Space starts or stops audio. The on-screen keys mirror the computer keyboard and support touch.

## The garden

The canvas behind the panel is a procedural scene of flower silhouettes, drifting pollen, stars and moths. It reads the synth parameters directly:

- **density** decides how many moths are in the air, how much pollen drifts, and how strongly the flowers sway
- **speed** sets the flight, wingbeat and wind rate
- **size** scales moths and pollen
- **position** moves a soft vertical light beam; flowers and dust near it brighten, and moths drift toward it
- **spray** widens the beam and adds path wobble
- **pitch** lifts the moths' flight band
- **width** spreads their orbits
- **scatter** makes wingbeats less even
- **tone** and **level** control glow
- **space** adds low haze
- **motion** moves the beam, glow, orbits or haze depending on its target
- **hold** nearly stops the scene's clock

Every scheduled grain can throw a small spark of dust from the read head, so the air visibly thickens with the grain cloud. Notes pulse the flowers. Clicking the garden bursts pollen and plays a note chosen from the click position.

## Files

- `index.html` — panel markup and canvases
- `grain.css` — monochrome panel, knobs, keyboard and responsive layout
- `audio.js` — sample synthesis, granular scheduler, reverb and voices
- `garden.js` — moths, flowers, pollen, beam and sparks
- `app.js` — state, knobs, keyboard, transport, cloud and scope views

The only APIs used are Canvas 2D, Web Audio, Pointer Events, `requestAnimationFrame` and `localStorage`. Audio runs on its own scheduler, independently of the animation loop, and the scene respects `prefers-reduced-motion`.
