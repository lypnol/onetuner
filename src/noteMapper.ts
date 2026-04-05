/**
 * Maps a frequency to the nearest musical note.
 * Supports solfège (Do, Re, Mi...) and letter (C, D, E...) notation.
 * Configurable A4 reference frequency.
 */

const SOLFEGE_NOTES: { base: string; accidental: string }[] = [
  { base: 'Do',  accidental: '' },
  { base: 'Re',  accidental: '\u266D' },
  { base: 'Re',  accidental: '' },
  { base: 'Mi',  accidental: '\u266D' },
  { base: 'Mi',  accidental: '' },
  { base: 'Fa',  accidental: '' },
  { base: 'Sol', accidental: '\u266D' },
  { base: 'Sol', accidental: '' },
  { base: 'La',  accidental: '\u266D' },
  { base: 'La',  accidental: '' },
  { base: 'Si',  accidental: '\u266D' },
  { base: 'Si',  accidental: '' },
];

const LETTER_NOTES: { base: string; accidental: string }[] = [
  { base: 'C',  accidental: '' },
  { base: 'D',  accidental: '\u266D' },
  { base: 'D',  accidental: '' },
  { base: 'E',  accidental: '\u266D' },
  { base: 'E',  accidental: '' },
  { base: 'F',  accidental: '' },
  { base: 'G',  accidental: '\u266D' },
  { base: 'G',  accidental: '' },
  { base: 'A',  accidental: '\u266D' },
  { base: 'A',  accidental: '' },
  { base: 'B',  accidental: '\u266D' },
  { base: 'B',  accidental: '' },
];

const A4_MIDI = 69;

export type Notation = 'solfege' | 'letter';

export interface NoteInfo {
  name: string;
  base: string;
  accidental: string;
  frequency: number;
  cents: number;
  octave: number;
}

export function frequencyToNote(
  freq: number,
  a4Freq: number = 440,
  notation: Notation = 'solfege'
): NoteInfo {
  const semitonesFromA4 = 12 * Math.log2(freq / a4Freq);
  const midiNote = Math.round(semitonesFromA4) + A4_MIDI;

  const exactMidi = semitonesFromA4 + A4_MIDI;
  const cents = Math.round((exactMidi - midiNote) * 100);

  const noteIndex = ((midiNote % 12) + 12) % 12;
  const octave = Math.floor(midiNote / 12) - 1;
  const notes = notation === 'solfege' ? SOLFEGE_NOTES : LETTER_NOTES;
  const { base, accidental } = notes[noteIndex];

  const noteFrequency = a4Freq * Math.pow(2, (midiNote - A4_MIDI) / 12);

  return {
    name: `${base}${accidental}${octave}`,
    base,
    accidental,
    frequency: noteFrequency,
    cents,
    octave,
  };
}
