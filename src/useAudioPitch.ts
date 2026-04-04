import { useEffect, useRef, useState, useCallback } from 'react';
import { AudioRecorder } from 'react-native-audio-api';
import { detectPitch, hasSignal } from './pitchDetection';
import { frequencyToNote, NoteInfo } from './noteMapper';

const SAMPLE_RATE = 44100;
const BUFFER_SIZE = 2048;

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
  const [listening, setListening] = useState(false);
  const recorderRef = useRef<AudioRecorder | null>(null);

  const start = useCallback(async () => {
    try {
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
            setState({ note: null, frequency: null, active: false });
            return;
          }

          const freq = detectPitch(buffer, SAMPLE_RATE);
          if (freq) {
            const note = frequencyToNote(freq);
            setState({ note, frequency: freq, active: true });
          } else {
            setState((prev) => ({ ...prev, active: false }));
          }
        }
      );

      recorder.start();
      setListening(true);
    } catch (e: any) {
      setError(e.message || 'Failed to access microphone');
    }
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current) {
      recorderRef.current.clearOnAudioReady();
      recorderRef.current.stop();
      recorderRef.current = null;
    }
    setListening(false);
    setState({ note: null, frequency: null, active: false });
  }, []);

  useEffect(() => {
    return () => {
      if (recorderRef.current) {
        recorderRef.current.clearOnAudioReady();
        recorderRef.current.stop();
      }
    };
  }, []);

  return { state, error, listening, start, stop };
}
