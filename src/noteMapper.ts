/**
 * Maps a frequency to the nearest musical note using solfège naming.
 * La4 = A4 = 440 Hz
 */

const SOLFEGE_NAMES = [
  'Do',  // C
  'Reb', // C# / Db
  'Re',  // D
  'Mib', // D# / Eb
  'Mi',  // E
  'Fa',  // F
  'Solb',// F# / Gb
  'Sol', // G
  'Lab', // G# / Ab
  'La',  // A
  'Sib', // A# / Bb
  'Si',  // B
];

// A4 = 440 Hz is MIDI note 69, which is index 9 (La) in octave 4
const A4_FREQUENCY = 440;
const A4_MIDI = 69;

export interface NoteInfo {
  name: string;       // e.g. "La4"
  frequency: number;  // exact frequency of the note
  cents: number;      // deviation from exact note (-50 to +50)
  octave: number;
  solfege: string;    // just the solfège name without octave
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
  const solfege = SOLFEGE_NAMES[noteIndex];

  // Exact frequency of the nearest note
  const noteFrequency = A4_FREQUENCY * Math.pow(2, (midiNote - A4_MIDI) / 12);

  return {
    name: `${solfege}${octave}`,
    frequency: noteFrequency,
    cents,
    octave,
    solfege,
  };
}
