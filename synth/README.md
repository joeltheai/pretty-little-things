# Petal

A browser sound garden. Open `index.html` and press **play**. Audio starts after a click; there are no dependencies or build steps.

- **Chords:** the outer circle selects major chords; the inner circle selects minor chords. Add sevenths, ninths or suspended voicings and choose an inversion. Click **audition chord** to hear it while stopped.
- **Arpeggiator:** draw note, gate, velocity, octave and harmony steps. Each lane has its own length (1–16) and clock division (÷1–÷4). Different loop lengths create polymeters; clock divisions slow individual lanes. The polyrhythm selector layers an independent 3:4, 5:4 or 7:8 pulse that follows the same lanes, one chord degree above the main pulse. Tap a note step to mute it, or use Enter/Space on a focused step. Arrow keys edit values. Randomize edits the selected lane. Bypass sends the full held chord to the synth.
- **Synth:** four oscillator shapes blend toward sine with position. Unison, detune and a sine sub oscillator feed a resonant low-pass filter. Drag the ADSR points or use the sliders. Knobs support vertical dragging, Shift for fine adjustment, arrow keys, and double-click to reset. Timbre and filter changes affect sounding notes; unison count, sub level and ADSR settings apply to new notes.
- **Keyboard:** A W S E D F T G Y H U J K play chromatic notes. Z/X shift octave. Space starts/stops the arp. Keyboard notes sustain until released. Controls retain their own keyboard behavior while focused.
- **Workspace:** drag panel title bars on desktop. Smaller screens stack the panels and scroll.

## Visual mappings

| Sound                              | Garden                                         |
| ---------------------------------- | ---------------------------------------------- |
| Unison                             | Petal count                                    |
| Detune                             | Petal spread and sway                          |
| Wavetable position                 | Petal curvature                                |
| Sub oscillator                     | Stem height                                    |
| Attack / decay / sustain / release | Opening, settling, held bloom size and closing |
| Filter cutoff                      | Leaf opening                                   |
| Resonance                          | Ground ripples                                 |
| Output level                       | Line brightness                                |
| Pitch                              | Which flower responds and where rain falls     |
| Note timing / velocity / gate      | Rain timing, speed and trail length            |

The output scope measures the actual audio signal. The oscillator graph shows the selected waveform blend, the filter graph shows its frequency response, and the envelope graph shows the ADSR settings. Motion can be disabled independently of audio and follows the system reduced-motion preference. Leaving the tab stops playback.

The arp's independent graph lengths and clock divisions are informed by the local ArpStick research. Its browser interface is a focused subset, not a port of the complete JSFX plugin. Oscillator and envelope displays take visual inspiration from Serum and Vital.
