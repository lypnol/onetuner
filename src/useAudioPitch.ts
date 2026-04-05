import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { AudioRecorder, AudioManager } from 'react-native-audio-api';
import { detectPitch, hasSignal } from './pitchDetection';
import { frequencyToNote, NoteInfo, Notation } from './noteMapper';

const SAMPLE_RATE = 44100;
const BUFFER_SIZE = 2048;

// ── Smoothing pipeline constants ────────────────────────────────────

const MEDIAN_WINDOW = 5;             // larger window kills outlier spikes
const OUTLIER_SEMITONES = 3;         // jump > 3 semitones = suspect
const OUTLIER_CONFIRM_FRAMES = 3;    // need 3 consecutive frames to accept a jump
const CENTS_EMA_SLOW = 0.25;         // EMA factor during sustained note (smooth)
const CENTS_EMA_FAST = 0.7;          // EMA factor after confirmed note change (responsive)
const NOTE_LOCK_CENTS = 35;          // cents away from current note center before switching
const NOTE_LOCK_FRAMES = 3;          // frames the new note must persist before switching
const SILENCE_FRAMES_THRESHOLD = 10; // frames without pitch before going inactive

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function semitoneDist(f1: number, f2: number): number {
  return Math.abs(12 * Math.log2(f1 / f2));
}

export interface TunerState {
  note: NoteInfo | null;
  frequency: number | null;
  active: boolean;
}

export function useAudioPitch(a4Freq: number = 440, notation: Notation = 'solfege') {
  const [state, setState] = useState<TunerState>({
    note: null,
    frequency: null,
    active: false,
  });
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);

  // Smoothing state refs
  const freqHistoryRef = useRef<number[]>([]);
  const smoothedCentsRef = useRef(0);
  const smoothedFreqRef = useRef(0);
  const silenceCountRef = useRef(0);

  // Outlier rejection
  const outlierStreakRef = useRef<number[]>([]); // consecutive suspect readings

  // Note-lock hysteresis
  const lockedNoteRef = useRef<{ base: string; accidental: string; octave: number } | null>(null);
  const candidateNoteRef = useRef<{ base: string; accidental: string; octave: number; count: number } | null>(null);

  // Settings refs (readable from audio callback)
  const a4FreqRef = useRef(a4Freq);
  const notationRef = useRef(notation);
  a4FreqRef.current = a4Freq;
  notationRef.current = notation;

  const resetSmoothing = () => {
    freqHistoryRef.current.length = 0;
    smoothedCentsRef.current = 0;
    smoothedFreqRef.current = 0;
    silenceCountRef.current = 0;
    outlierStreakRef.current.length = 0;
    lockedNoteRef.current = null;
    candidateNoteRef.current = null;
  };

  const stopRecorder = () => {
    if (recorderRef.current) {
      recorderRef.current.clearOnAudioReady();
      recorderRef.current.stop();
      recorderRef.current = null;
    }
    resetSmoothing();
    setState({ note: null, frequency: null, active: false });
  };

  const startRecorder = async () => {
    if (recorderRef.current) return;

    try {
      const permission = await AudioManager.requestRecordingPermissions();
      if (permission !== 'Granted') {
        setError('Microphone permission denied. Go to Settings > onetuner and enable Microphone access.');
        return;
      }

      AudioManager.setAudioSessionOptions({
        iosCategory: 'playAndRecord',
        iosMode: 'measurement',
        iosOptions: ['defaultToSpeaker', 'mixWithOthers'],
      });

      await AudioManager.setAudioSessionActivity(true);

      const recorder = new AudioRecorder();
      recorderRef.current = recorder;

      recorder.onAudioReady(
        {
          sampleRate: SAMPLE_RATE,
          bufferLength: BUFFER_SIZE,
          channelCount: 1,
        },
        (event) => {
          const buffer = event.buffer.getChannelData(0);

          if (!hasSignal(buffer)) {
            silenceCountRef.current++;
            if (silenceCountRef.current >= SILENCE_FRAMES_THRESHOLD) {
              resetSmoothing();
              setState({ note: null, frequency: null, active: false });
            }
            return;
          }

          const rawFreq = detectPitch(buffer, SAMPLE_RATE);
          if (!rawFreq) {
            silenceCountRef.current++;
            if (silenceCountRef.current >= SILENCE_FRAMES_THRESHOLD) {
              resetSmoothing();
              setState({ note: null, frequency: null, active: false });
            }
            return;
          }

          silenceCountRef.current = 0;
          const history = freqHistoryRef.current;

          // ── Outlier rejection ─────────────────────────────────
          // If we have a running average and the new reading jumps
          // more than OUTLIER_SEMITONES, require consecutive confirmation.
          if (smoothedFreqRef.current > 0) {
            const jump = semitoneDist(rawFreq, smoothedFreqRef.current);
            if (jump > OUTLIER_SEMITONES) {
              const streak = outlierStreakRef.current;
              streak.push(rawFreq);
              if (streak.length < OUTLIER_CONFIRM_FRAMES) {
                return; // not enough confirmation yet — skip this frame
              }
              // Check that the streak readings agree with each other
              const streakMedian = median(streak);
              const allAgree = streak.every(
                (f) => semitoneDist(f, streakMedian) < 1.5
              );
              if (!allAgree) {
                streak.length = 0; // incoherent — reset
                return;
              }
              // Confirmed jump — accept it and reset smoothing for new note
              history.length = 0;
              smoothedCentsRef.current = 0;
              smoothedFreqRef.current = 0;
              lockedNoteRef.current = null;
              candidateNoteRef.current = null;
              outlierStreakRef.current.length = 0;
            } else {
              outlierStreakRef.current.length = 0;
            }
          }

          // ── Median filter ─────────────────────────────────────
          history.push(rawFreq);
          if (history.length > MEDIAN_WINDOW) {
            history.shift();
          }
          const medianFreq = history.length >= 3 ? median(history) : rawFreq;

          // ── Frequency EMA ─────────────────────────────────────
          if (smoothedFreqRef.current === 0) {
            smoothedFreqRef.current = medianFreq;
          } else {
            const alpha = 0.3;
            smoothedFreqRef.current += alpha * (medianFreq - smoothedFreqRef.current);
          }

          const freq = smoothedFreqRef.current;
          const note = frequencyToNote(freq, a4FreqRef.current, notationRef.current);

          // ── Note-lock hysteresis ──────────────────────────────
          // Don't switch displayed note name unless the new note persists
          const locked = lockedNoteRef.current;
          const noteId = { base: note.base, accidental: note.accidental, octave: note.octave };

          if (!locked) {
            // No lock yet — accept immediately
            lockedNoteRef.current = noteId;
            candidateNoteRef.current = null;
          } else {
            const sameNote =
              locked.base === noteId.base &&
              locked.accidental === noteId.accidental &&
              locked.octave === noteId.octave;

            if (sameNote) {
              candidateNoteRef.current = null; // still on same note
            } else if (Math.abs(note.cents) > NOTE_LOCK_CENTS) {
              // Far enough from current note center — count candidate frames
              const cand = candidateNoteRef.current;
              if (
                cand &&
                cand.base === noteId.base &&
                cand.accidental === noteId.accidental &&
                cand.octave === noteId.octave
              ) {
                cand.count++;
                if (cand.count >= NOTE_LOCK_FRAMES) {
                  lockedNoteRef.current = noteId;
                  candidateNoteRef.current = null;
                  smoothedCentsRef.current = note.cents; // snap cents to new note
                }
              } else {
                candidateNoteRef.current = { ...noteId, count: 1 };
              }
            } else {
              candidateNoteRef.current = null; // close to locked note, don't switch
            }
          }

          // ── Cents EMA (adaptive) ──────────────────────────────
          // Use fast EMA right after a note change, slow during sustain
          const justChanged = lockedNoteRef.current !== locked;
          const emaFactor = justChanged ? CENTS_EMA_FAST : CENTS_EMA_SLOW;

          // Compute cents relative to the locked note's exact frequency
          const lockedNote = lockedNoteRef.current!;

          smoothedCentsRef.current += emaFactor * (note.cents - smoothedCentsRef.current);

          const finalNote: NoteInfo = {
            name: `${lockedNote.base}${lockedNote.accidental}${lockedNote.octave}`,
            base: lockedNote.base,
            accidental: lockedNote.accidental,
            octave: lockedNote.octave,
            frequency: note.frequency,
            cents: Math.round(smoothedCentsRef.current),
          };

          setState({ note: finalNote, frequency: freq, active: true });
        }
      );

      recorder.start();
    } catch (e: any) {
      setError(e.message || 'Failed to access microphone');
    }
  };

  // Start on mount, cleanup on unmount
  useEffect(() => {
    startRecorder();
    return stopRecorder;
  }, []);

  // Stop/restart on background/foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        startRecorder();
      } else {
        stopRecorder();
      }
    });
    return () => sub.remove();
  }, []);

  return { state, error };
}
