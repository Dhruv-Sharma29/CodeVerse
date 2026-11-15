// Ambient music generated live with Web Audio: slow pad chords and a soft arpeggio. No recordings.

/** Am – F – C – G, as MIDI note numbers, four seconds each. */
export const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
export const BAR = 4; // seconds per chord
export const midiHz = (n: number) => 440 * 2 ** ((n - 69) / 12);

/** Notes of the arpeggio over one bar: the chord climbing an octave, eight steps. */
export function arpeggio(chord: number[]): number[] {
  return [0, 1, 2, 1, 0, 1, 2, 1].map((k, i) => chord[k] + (i >= 4 ? 12 : 0) + 12);
}

/** Start the music into `out`; returns a function that fades it out and stops it. */
export function startMusic(ac: AudioContext, out: AudioNode, volume = .045): () => void {
  const bus = ac.createGain(), tone = ac.createBiquadFilter();
  tone.type = "lowpass"; tone.frequency.value = 1100; tone.Q.value = .6;
  tone.connect(bus); bus.connect(out);
  bus.gain.setValueAtTime(0, ac.currentTime); bus.gain.linearRampToValueAtTime(volume, ac.currentTime + 4);
  const voice = (freq: number, at: number, dur: number, type: OscillatorType, gain: number, detune = 0) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + Math.min(1.2, dur / 3));
    g.gain.linearRampToValueAtTime(0, at + dur);
    o.connect(g).connect(tone); o.start(at); o.stop(at + dur + .05);
  };
  let bar = 0, next = ac.currentTime + .2;
  const schedule = () => {
    while (next < ac.currentTime + 1.5) {
      const chord = CHORDS[bar++ % CHORDS.length];
      for (const n of chord) { voice(midiHz(n), next, BAR + .6, "sawtooth", .12, -7); voice(midiHz(n), next, BAR + .6, "triangle", .14, 6); }
      voice(midiHz(chord[0] - 12), next, BAR, "sine", .25);
      arpeggio(chord).forEach((n, i) => voice(midiHz(n), next + i * BAR / 8, .45, "triangle", .07));
      next += BAR;
    }
  };
  schedule();
  const timer = setInterval(schedule, 400);
  return () => {
    clearInterval(timer);
    bus.gain.cancelScheduledValues(ac.currentTime); bus.gain.setValueAtTime(bus.gain.value, ac.currentTime);
    bus.gain.linearRampToValueAtTime(0, ac.currentTime + 1.2);
    setTimeout(() => bus.disconnect(), 1500);
  };
}
