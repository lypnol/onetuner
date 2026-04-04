# PitchTune - Work Plan

## Overview
Single-page React Native (Expo) instrument tuner app.
- Microphone input → pitch detection → solfège note display with meter needle
- Dark minimalistic UI, fades on silence

## Architecture
- **Audio**: react-native-audio-api AudioRecorder + AudioManager (session setup) → raw PCM buffers via onAudioReady
- **Pitch detection**: YIN algorithm (industry standard autocorrelation-based)
- **Note mapping**: Frequency → nearest note using La4=440Hz, solfège names (Do, Reb, Re, Mib, Mi, Fa, Solb, Sol, Lab, La, Sib, Si)
- **UI**: Single screen, centered needle meter, Animated API for fade in/out

## Status
- [x] Step 1: Init Expo project + git
- [x] Step 2: Pitch detection engine (YIN + note mapper)
- [x] Step 3: Tuner UI (meter needle, dark theme, fade animations)
- [x] Step 4: Wire audio → UI via AudioRecorder + onAudioReady
- [x] Step 5: TypeScript compiles clean
- [x] Step 6: Test on device — requires dev build (`npx expo run:ios --device`), not Expo Go
- [x] Step 7: Fix mic permissions (AudioManager.requestRecordingPermissions + session setup)
- [x] Step 8: Auto-start listening on launch, remove start/stop button
- [x] Step 9: Brighten UI colors (keep dark background)

## Files
- `src/pitchDetection.ts` — YIN algorithm + signal energy check
- `src/noteMapper.ts` — frequency → solfège note with cents deviation
- `src/useAudioPitch.ts` — React hook: AudioRecorder → pitch → note state
- `App.tsx` — Main UI: meter needle, note display, fade animations

## Notes
- Uses `react-native-audio-api` (native module) — requires dev build, not Expo Go
- Run with: `npx expo run:ios --device` (physical) or `npx expo run:ios` (simulator)
- iOS audio session: category `playAndRecord`, mode `measurement` for accurate pitch input
- Mic permission requested at launch via AudioManager.requestRecordingPermissions()
- expo-dev-client added for development builds
