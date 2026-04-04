import { useEffect, useRef, useState } from 'react';
import { AudioRecorder, AudioManager } from 'react-native-audio-api';
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
  const recorderRef = useRef<AudioRecorder | null>(null);

  useEffect(() => {
    let cancelled = false;

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
