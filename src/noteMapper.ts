/**
 * Maps a frequency to the nearest musical note using solfège naming.
 * La4 = A4 = 440 Hz
 */

const SOLFEGE_NOTES: { base: string; accidental: string }[] = [
  { base: 'Do',  accidental: '' },   // C
  { base: 'Re',  accidental: '\u266D' }, // Db  (♭)
  { base: 'Re',  accidental: '' },   // D
  { base: 'Mi',  accidental: '\u266D' }, // Eb  (♭)
  { base: 'Mi',  accidental: '' },   // E
  { base: 'Fa',  accidental: '' },   // F
  { base: 'Sol', accidental: '\u266D' }, // Gb  (♭)
  { base: 'Sol', accidental: '' },   // G
  { base: 'La',  accidental: '\u266D' }, // Ab  (♭)
  { base: 'La',  accidental: '' },   // A
  { base: 'Si',  accidental: '\u266D' }, // Bb  (♭)
  { base: 'Si',  accidental: '' },   // B
];

// A4 = 440 Hz is MIDI note 69, which is index 9 (La) in octave 4
const A4_FREQUENCY = 440;
const A4_MIDI = 69;

export interface NoteInfo {
  name: string;       // e.g. "La4"
  base: string;       // e.g. "Mi"
  accidental: string; // e.g. "♭" or ""
  frequency: number;  // exact frequency of the note
  cents: number;      // deviation from exact note (-50 to +50)
  octave: number;
}

export function frequencyToNote(freq: number): NoteInfo {
  // Number of semitones from A4
  const semitonesFromA4 = 12 * Math.log2(freq / A4_FREQUENCY);
  const midiNote = Math.round(semitonesFromA4) + A4_MIDI;

  // Cents deviation
  const exactMidi = semitonesFromA4 + A4_MIDI;
  const cents = Math.round((exactMidi - midiNote) * 100);

  // Note name and octave (MIDI 60 = C4 = Do4)
  const noteIndex = ((midiNote % 12) + 12) % 12; // 0=C, 1=C#, ..., 9=A
  const octave = Math.floor(midiNote / 12) - 1;
  const { base, accidental } = SOLFEGE_NOTES[noteIndex];

  // Exact frequency of the nearest note
  const noteFrequency = A4_FREQUENCY * Math.pow(2, (midiNote - A4_MIDI) / 12);

  return {
    name: `${base}${accidental}${octave}`,
    base,
    accidental,
    frequency: noteFrequency,
    cents,
    octave,
  };
}
