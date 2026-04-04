import React, { useEffect, useRef } from 'react';
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
const IN_TUNE_CENTS = 5; // ±5 cents = in tune (green glow)

function isInTune(state: { active: boolean; note: { cents: number } | null }) {
  return state.active && state.note && Math.abs(state.note.cents) <= IN_TUNE_CENTS;
}

export default function App() {
  const { state, error } = useAudioPitch();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const needleAngle = useRef(new Animated.Value(0)).current;

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

  const inTune = isInTune(state);
  const accentColor = inTune ? '#4ade80' : '#888';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Note display */}
      <Animated.View style={[styles.noteContainer, { opacity: fadeAnim }]}>
        <Text style={state.active && state.note ? [styles.noteName, { color: inTune ? '#4ade80' : '#ffffff' }] : styles.listeningText}>
          {state.active && state.note ? state.note.name : 'listening...'}
        </Text>
        <Text style={styles.frequency}>
          {state.active && state.frequency
            ? `${state.frequency.toFixed(1)} Hz`
            : ''}
        </Text>
      </Animated.View>

      {/* Meter */}
      <Animated.View style={[styles.meterContainer, { opacity: fadeAnim }]}>
        {/* Arc ticks */}
        <View style={styles.arcContainer}>
          {Array.from({ length: TICK_COUNT }).map((_, i) => {
            const angle = ((i / (TICK_COUNT - 1)) * 90 - 45) * (Math.PI / 180);
            const isCenter = i === Math.floor(TICK_COUNT / 2);
            const isMajor = i % 6 === 0 || isCenter;
            const tickLen = isCenter ? 20 : isMajor ? 14 : 8;
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
                    width: isCenter ? 2 : isMajor ? 1.5 : 1,
                    height: tickLen,
                    left: width / 2 + (x1 + x2) / 2 - 1,
                    top: METER_RADIUS + (y1 + y2) / 2 - tickLen / 2,
                    backgroundColor: isCenter
                      ? (inTune ? '#4ade80' : '#888')
                      : isMajor
                      ? (inTune ? '#4ade80' : '#888')
                      : (inTune ? 'rgba(74, 222, 128, 0.4)' : '#555'),
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
  noteName: {
    fontSize: 64,
    fontWeight: '200',
    color: '#ffffff',
    letterSpacing: 4,
  },
  frequency: {
    fontSize: 16,
    color: '#999',
    marginTop: 4,
    height: 20,
    fontVariant: ['tabular-nums'],
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
