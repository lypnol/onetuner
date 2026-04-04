import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Animated,
  Dimensions,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAudioPitch } from './src/useAudioPitch';

const { width } = Dimensions.get('window');
const METER_RADIUS = width * 0.38;
const NEEDLE_LENGTH = METER_RADIUS * 0.85;
const TICK_COUNT = 25;
const IN_TUNE_ENTER = 4;
const IN_TUNE_EXIT = 8;
const TOLERANCE_DEG = (IN_TUNE_ENTER / 50) * 45;
const TOLERANCE_HEIGHT = 20;

const themes = {
  dark: {
    bg: '#0a0a0f',
    noteText: '#ffffff',
    freqText: '#eee',
    listeningText: '#f0f0f0',
    centsText: '#fff',
    tickMajor: '#fff',
    tickMinor: '#eee',
    toleranceIdle: 'rgba(255, 255, 255, 0.6)',
    needle: '#fff',
    accent: '#4ade80',
    accentMinor: 'rgba(74, 222, 128, 0.5)',
    errorText: '#ff6666',
    toggleIcon: '#ccc',
    statusBar: 'light' as const,
  },
  light: {
    bg: '#f5f5f7',
    noteText: '#000',
    freqText: '#333',
    listeningText: '#111',
    centsText: '#111',
    tickMajor: '#000',
    tickMinor: '#333',
    toleranceIdle: 'rgba(0, 0, 0, 0.4)',
    needle: '#000',
    accent: '#22c55e',
    accentMinor: 'rgba(34, 197, 94, 0.4)',
    errorText: '#dc2626',
    toggleIcon: '#666',
    statusBar: 'dark' as const,
  },
};

export default function App() {
  const { state, error } = useAudioPitch();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [inTune, setInTune] = useState(false);
  const [dark, setDark] = useState(true);
  const needleAngle = useRef(new Animated.Value(0)).current;
  const recordingPulse = useRef(new Animated.Value(0.3)).current;

  const t = dark ? themes.dark : themes.light;

  // Recording dot pulse — restart each time we go inactive
  useEffect(() => {
    if (state.active) return;
    recordingPulse.setValue(0.3);
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(recordingPulse, {
          toValue: 1,
          duration: 900,
          useNativeDriver: false,
        }),
        Animated.timing(recordingPulse, {
          toValue: 0.3,
          duration: 900,
          useNativeDriver: false,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [state.active]);

  // Fade in/out based on active state
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: state.active ? 1 : 0.4,
      duration: state.active ? 150 : 800,
      useNativeDriver: true,
    }).start();
  }, [state.active]);

  // Animate needle based on cents deviation
  useEffect(() => {
    const targetAngle = state.note ? (state.note.cents / 50) * 45 : 0;
    Animated.spring(needleAngle, {
      toValue: targetAngle,
      damping: 15,
      stiffness: 120,
      useNativeDriver: true,
    }).start();
  }, [state.note?.cents]);

  // Hysteresis: tighter threshold to enter green, wider to leave
  useEffect(() => {
    if (!state.active || !state.note) {
      setInTune(false);
      return;
    }
    const absCents = Math.abs(state.note.cents);
    setInTune((prev) =>
      prev ? absCents <= IN_TUNE_EXIT : absCents <= IN_TUNE_ENTER
    );
  }, [state.active, state.note?.cents]);

  const needleRotation = needleAngle.interpolate({
    inputRange: [-45, 45],
    outputRange: ['-45deg', '45deg'],
  });

  const centsText =
    state.note && state.active
      ? state.note.cents > 0
        ? `+${state.note.cents}`
        : `${state.note.cents}`
      : '';

  const accentColor = inTune ? t.accent : t.needle;

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <StatusBar style={t.statusBar} />

      {/* Theme toggle */}
      <TouchableOpacity
        style={styles.themeToggle}
        onPress={() => setDark((d) => !d)}
        activeOpacity={0.6}
      >
        <View style={[styles.toggleCircle, { borderColor: t.toggleIcon }]}>
          {dark ? null : (
            <View style={[styles.toggleCrescent, { backgroundColor: t.bg }]} />
          )}
        </View>
      </TouchableOpacity>

      {/* Note display */}
      <Animated.View style={[styles.noteContainer, { opacity: fadeAnim }]}>
        {state.active && state.note ? (
          <>
            <View style={styles.noteRow}>
              <Text style={[styles.noteBase, { color: inTune ? t.accent : t.noteText }]}>
                {state.note.base}
              </Text>
              <View style={styles.noteSubscripts}>
                <Text style={[styles.noteOctave, { color: inTune ? t.accent : t.noteText }]}>
                  {state.note.octave}
                </Text>
                {state.note.accidental ? (
                  <Text style={[styles.noteAccidental, { color: inTune ? t.accent : t.noteText }]}>
                    {state.note.accidental}
                  </Text>
                ) : null}
              </View>
            </View>
            <Text style={[styles.frequency, { color: t.freqText }]}>
              {state.frequency ? `${state.frequency.toFixed(1)} Hz` : ''}
            </Text>
          </>
        ) : (
          <View style={styles.listeningRow}>
            <Animated.View style={[styles.recordingDot, { opacity: recordingPulse, backgroundColor: '#ff0000' }]} />
            <Text style={[styles.listeningText, { color: t.listeningText }]}>listening...</Text>
          </View>
        )}
      </Animated.View>

      {/* Meter */}
      <Animated.View style={[styles.meterContainer, { opacity: fadeAnim }]}>
        {/* Arc ticks */}
        <View style={styles.arcContainer}>
          {/* Tolerance arc band — overlapping strips for solid fill */}
          {Array.from({ length: 40 }).map((_, i) => {
            const angle = ((i / 39) * 2 * TOLERANCE_DEG - TOLERANCE_DEG) * (Math.PI / 180);
            const outerR = METER_RADIUS;
            const midR = outerR - TOLERANCE_HEIGHT / 2;
            const x = Math.sin(angle) * midR;
            const y = -Math.cos(angle) * midR;

            return (
              <View
                key={`tol-${i}`}
                style={{
                  position: 'absolute',
                  width: 4,
                  height: TOLERANCE_HEIGHT,
                  borderRadius: 1,
                  left: width / 2 + x - 2,
                  top: METER_RADIUS + y - TOLERANCE_HEIGHT / 2,
                  backgroundColor: inTune ? t.accent : t.toleranceIdle,
                  transform: [{ rotate: `${(angle * 180) / Math.PI}deg` }],
                }}
              />
            );
          })}
          {/* Regular ticks (skip center) */}
          {Array.from({ length: TICK_COUNT }).map((_, i) => {
            const isCenter = i === Math.floor(TICK_COUNT / 2);
            if (isCenter) return null;
            const angle = ((i / (TICK_COUNT - 1)) * 90 - 45) * (Math.PI / 180);
            const isMajor = i % 6 === 0;
            const tickLen = isMajor ? 14 : 8;
            const outerR = METER_RADIUS;
            const innerR = outerR - tickLen;
            const x1 = Math.sin(angle) * outerR;
            const y1 = -Math.cos(angle) * outerR;
            const x2 = Math.sin(angle) * innerR;
            const y2 = -Math.cos(angle) * innerR;

            return (
              <View
                key={i}
                style={[
                  styles.tick,
                  {
                    width: isMajor ? 1.5 : 1,
                    height: tickLen,
                    left: width / 2 + (x1 + x2) / 2 - 1,
                    top: METER_RADIUS + (y1 + y2) / 2 - tickLen / 2,
                    backgroundColor: isMajor
                      ? (inTune ? t.accent : t.tickMajor)
                      : (inTune ? t.accentMinor : t.tickMinor),
                    transform: [
                      { rotate: `${(angle * 180) / Math.PI}deg` },
                    ],
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Needle */}
        <Animated.View
          style={[
            styles.needleWrapper,
            {
              transform: [{ rotate: needleRotation }],
            },
          ]}
        >
          <View style={[styles.needle, { backgroundColor: accentColor }]} />
          <View style={[styles.needleDot, { backgroundColor: accentColor }]} />
        </Animated.View>

        {/* Cents label */}
        <Text style={[styles.centsText, { color: t.centsText }]}>{centsText}</Text>
      </Animated.View>

      {error && <Text style={[styles.errorText, { color: t.errorText }]}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  themeToggle: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    left: 20,
    padding: 8,
  },
  toggleCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
  },
  toggleCrescent: {
    position: 'absolute',
    width: 12,
    height: 18,
    borderRadius: 9,
    right: -2,
    top: -1.5,
  },
  noteContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
    height: 100,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  noteBase: {
    fontSize: 64,
    fontWeight: '200',
    letterSpacing: 2,
  },
  noteSubscripts: {
    marginLeft: 2,
    marginTop: 8,
  },
  noteOctave: {
    fontSize: 24,
    fontWeight: '300',
  },
  noteAccidental: {
    fontSize: 28,
    fontWeight: '300',
    marginTop: -4,
  },
  frequency: {
    fontSize: 16,
    marginTop: 4,
    height: 20,
    fontVariant: ['tabular-nums'],
  },
  listeningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ff4444',
  },
  listeningText: {
    fontSize: 24,
    fontWeight: '300',
    letterSpacing: 2,
  },
  meterContainer: {
    width: width,
    height: METER_RADIUS + 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arcContainer: {
    position: 'absolute',
    width: width,
    height: METER_RADIUS * 2,
    top: 0,
  },
  tick: {
    position: 'absolute',
    borderRadius: 1,
  },
  needleWrapper: {
    alignItems: 'center',
    width: 4,
    height: NEEDLE_LENGTH + 5,
    transformOrigin: 'center bottom',
  },
  needle: {
    width: 2,
    height: NEEDLE_LENGTH,
    borderRadius: 1,
  },
  needleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: -5,
  },
  centsText: {
    fontSize: 14,
    marginTop: 20,
    fontVariant: ['tabular-nums'],
  },
  errorText: {
    fontSize: 12,
    marginTop: 16,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
});
