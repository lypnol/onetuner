import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
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
  const freqHistoryRef = useRef<number[]>([]);
  const smoothedCentsRef = useRef(0);
  const silenceCountRef = useRef(0);

  const stopRecorder = () => {
    if (recorderRef.current) {
      recorderRef.current.clearOnAudioReady();
      recorderRef.current.stop();
      recorderRef.current = null;
    }
    freqHistoryRef.current.length = 0;
    smoothedCentsRef.current = 0;
    silenceCountRef.current = 0;
    setState({ note: null, frequency: null, active: false });
  };

  const startRecorder = async () => {
    if (recorderRef.current) return; // already running

    try {
      const permission = await AudioManager.requestRecordingPermissions();
      if (permission !== 'Granted') {
        setError('Microphone permission denied. Go to Settings > pitchtuner and enable Microphone access.');
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
              freqHistoryRef.current.length = 0;
              smoothedCentsRef.current = 0;
              setState({ note: null, frequency: null, active: false });
            }
            return;
          }

          const freq = detectPitch(buffer, SAMPLE_RATE);
          if (freq) {
            silenceCountRef.current = 0;
            const history = freqHistoryRef.current;
            history.push(freq);
            if (history.length > MEDIAN_WINDOW) {
              history.shift();
            }

            const smoothedFreq = history.length >= 3 ? median(history) : freq;
            const note = frequencyToNote(smoothedFreq);

            smoothedCentsRef.current += CENTS_SMOOTHING * (note.cents - smoothedCentsRef.current);
            const displayNote: NoteInfo = {
              ...note,
              cents: Math.round(smoothedCentsRef.current),
            };

            setState({ note: displayNote, frequency: smoothedFreq, active: true });
          } else {
            silenceCountRef.current++;
            if (silenceCountRef.current >= SILENCE_FRAMES_THRESHOLD) {
              freqHistoryRef.current.length = 0;
              smoothedCentsRef.current = 0;
              setState({ note: null, frequency: null, active: false });
            }
          }
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
