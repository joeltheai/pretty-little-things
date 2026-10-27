# Synth

Open `index.html`. Click the play icon or press Space. The slider beside it controls BPM. No dependencies or build step.

- **Chords:** major chords on the outer ring, minor chords on the inner ring. The selectors choose extension and inversion. Click the chord name to audition it.
- **Arp:** note, gate, velocity and octave are tabs over one graph. Draw values in the graph; the small buttons below the note view mute individual steps. The playhead column and active marker follow the selected lane's own clock. Each tab retains its own length and division. `len` changes the current lane's length; `÷` changes its clock division. The link icon synchronizes lengths. Randomize affects the selected lane. The power icon bypasses the arp and holds the full chord.
- **Synth:** waveform buttons select the oscillator shape. Position blends toward sine. Unison, detune and a sine sub feed a resonant low-pass filter. Drag ADSR points or use the A/D/S/R sliders. Knob values appear on hover or focus. Drag knobs vertically, hold Shift for fine adjustment, or double-click to reset. Waveform, position, detune, cutoff and resonance update sounding notes; unison count, sub level and ADSR settings apply to new notes.
- **Keyboard:** A W S E D F T G Y H U J K play chromatic notes. Z/X shift octave. Notes sustain until released. Focused controls retain their own keyboard behavior. Tabs support Left/Right and Home/End; graph values support arrow keys and Home/End, with Enter/Space to mute.
- **Layout:** drag empty panel padding on desktop. Smaller screens stack and scroll. The small dotted-circle button toggles animation. The system reduced-motion preference is respected. Leaving the tab stops playback.

Unison controls petal count, detune controls spread, position controls curvature, sub controls stem height, ADSR shapes blooms, cutoff opens leaves, resonance adds ripples, and output level controls brightness. Notes trigger rain; pitch selects the flower, velocity controls rain speed, and gate controls trail length.

The scope reads actual audio output. The oscillator graph shows the selected waveform blend, the filter graph shows its frequency response, and the envelope shows ADSR settings. The compact tabbed arp and its independent lane playheads follow the local ArpStick research and Caligo's arp UI.
