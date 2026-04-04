import { useEffect, useRef, useState } from 'react';
import { AudioRecorder, AudioManager } from 'react-native-audio-api';
import { detectPitch, hasSignal } from './pitchDetection';
import { frequencyToNote, NoteInfo } from './noteMapper';

const SAMPLE_RATE = 44100;
const BUFFER_SIZE = 2048;
const MEDIAN_WINDOW = 3;
const CENTS_SMOOTHING = 0.5; // EMA factor (0 = no change, 1 = instant)
const SILENCE_FRAMES_THRESHOLD = 8; // frames without pitch before going inactive

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export interface TunerState {
  note: NoteInfo | null;
  frequency: number | null;
  active: boolean;
}

export function useAudioPitch() {
  const [state, setState] = useState<TunerState>({
    note: null,
    frequency: null,
    active: false,
  });
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);

  useEffect(() => {
    let cancelled = false;
    const freqHistory: number[] = [];
    let smoothedCents = 0;
    let silenceCount = 0;

    async function startListening() {
      try {
        const permission = await AudioManager.requestRecordingPermissions();
        if (permission !== 'Granted') {
          setError('Microphone permission denied. Go to Settings > pitchtune and enable Microphone access.');
          return;
        }

        if (cancelled) return;

        AudioManager.setAudioSessionOptions({
          iosCategory: 'playAndRecord',
          iosMode: 'measurement',
          iosOptions: ['defaultToSpeaker', 'mixWithOthers'],
        });

        await AudioManager.setAudioSessionActivity(true);

        if (cancelled) return;

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
              silenceCount++;
              if (silenceCount >= SILENCE_FRAMES_THRESHOLD) {
                freqHistory.length = 0;
                smoothedCents = 0;
                setState({ note: null, frequency: null, active: false });
              }
              return;
            }

            const freq = detectPitch(buffer, SAMPLE_RATE);
            if (freq) {
              silenceCount = 0;
              freqHistory.push(freq);
              if (freqHistory.length > MEDIAN_WINDOW) {
                freqHistory.shift();
              }

              const smoothedFreq = freqHistory.length >= 3 ? median(freqHistory) : freq;
              const note = frequencyToNote(smoothedFreq);

              smoothedCents = smoothedCents + CENTS_SMOOTHING * (note.cents - smoothedCents);
              const displayNote: NoteInfo = {
                ...note,
                cents: Math.round(smoothedCents),
              };

              setState({ note: displayNote, frequency: smoothedFreq, active: true });
            } else {
              silenceCount++;
              if (silenceCount >= SILENCE_FRAMES_THRESHOLD) {
                freqHistory.length = 0;
                smoothedCents = 0;
                setState({ note: null, frequency: null, active: false });
              }
            }
          }
        );

        recorder.start();
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || 'Failed to access microphone');
        }
      }
    }

    startListening();

    return () => {
      cancelled = true;
      if (recorderRef.current) {
        recorderRef.current.clearOnAudioReady();
        recorderRef.current.stop();
        recorderRef.current = null;
      }
    };
  }, []);

  return { state, error };
}
