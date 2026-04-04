import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAudioPitch } from './src/useAudioPitch';

const { width } = Dimensions.get('window');
const METER_RADIUS = width * 0.38;
const NEEDLE_LENGTH = METER_RADIUS * 0.85;
const TICK_COUNT = 25; // ticks across the arc (-50 to +50 cents)
const IN_TUNE_ENTER = 4;  // must be within ±4 cents to turn green
const IN_TUNE_EXIT = 8;   // must exceed ±8 cents to turn back to gray
const TOLERANCE_ARC_STEPS = 20; // segments to draw the tolerance arc band
const TOLERANCE_DEG = (IN_TUNE_ENTER / 50) * 45; // ±degrees for tolerance zone

export default function App() {
  const { state, error } = useAudioPitch();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [inTune, setInTune] = useState(false);
  const needleAngle = useRef(new Animated.Value(0)).current;
  const recordingPulse = useRef(new Animated.Value(0.3)).current;

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

  const accentColor = inTune ? '#4ade80' : '#ccc';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Note display */}
      <Animated.View style={[styles.noteContainer, { opacity: fadeAnim }]}>
        {state.active && state.note ? (
          <>
            <View style={styles.noteRow}>
              <Text style={[styles.noteBase, { color: inTune ? '#4ade80' : '#ffffff' }]}>
                {state.note.base}
              </Text>
              <View style={styles.noteSubscripts}>
                <Text style={[styles.noteOctave, { color: inTune ? '#4ade80' : '#ffffff' }]}>
                  {state.note.octave}
                </Text>
                {state.note.accidental ? (
                  <Text style={[styles.noteAccidental, { color: inTune ? '#4ade80' : '#ffffff' }]}>
                    {state.note.accidental}
                  </Text>
                ) : null}
              </View>
            </View>
            <Text style={styles.frequency}>
              {state.frequency ? `${state.frequency.toFixed(1)} Hz` : ''}
            </Text>
          </>
        ) : (
          <View style={styles.listeningRow}>
            <Animated.View style={[styles.recordingDot, { opacity: recordingPulse }]} />
            <Text style={styles.listeningText}>listening...</Text>
          </View>
        )}
      </Animated.View>

      {/* Meter */}
      <Animated.View style={[styles.meterContainer, { opacity: fadeAnim }]}>
        {/* Arc ticks */}
        <View style={styles.arcContainer}>
          {/* Tolerance arc band */}
          {Array.from({ length: TOLERANCE_ARC_STEPS }).map((_, i) => {
            const angle = ((i / (TOLERANCE_ARC_STEPS - 1)) * 2 * TOLERANCE_DEG - TOLERANCE_DEG) * (Math.PI / 180);
            const tickLen = 20;
            const outerR = METER_RADIUS;
            const innerR = outerR - tickLen;
            const x1 = Math.sin(angle) * outerR;
            const y1 = -Math.cos(angle) * outerR;
            const x2 = Math.sin(angle) * innerR;
            const y2 = -Math.cos(angle) * innerR;

            return (
              <View
                key={`tol-${i}`}
                style={[
                  styles.tick,
                  {
                    width: 2,
                    height: tickLen,
                    left: width / 2 + (x1 + x2) / 2 - 1,
                    top: METER_RADIUS + (y1 + y2) / 2 - tickLen / 2,
                    backgroundColor: inTune ? '#4ade80' : 'rgba(204, 204, 204, 0.3)',
                    transform: [
                      { rotate: `${(angle * 180) / Math.PI}deg` },
                    ],
                  },
                ]}
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
                      ? (inTune ? '#4ade80' : '#ccc')
                      : (inTune ? 'rgba(74, 222, 128, 0.5)' : '#999'),
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
        <Text style={styles.centsText}>{centsText}</Text>
      </Animated.View>

      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0f',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
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
    color: '#999',
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
  listeningText: {
    fontSize: 24,
    fontWeight: '300',
    color: '#666',
    letterSpacing: 2,
  },
  centsText: {
    fontSize: 14,
    color: '#aaa',
    marginTop: 20,
    fontVariant: ['tabular-nums'],
  },
  errorText: {
    color: '#ff4444',
    fontSize: 12,
    marginTop: 16,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
});
