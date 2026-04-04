import React, { useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Animated,
  Dimensions,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useAudioPitch } from './src/useAudioPitch';

const { width } = Dimensions.get('window');
const METER_RADIUS = width * 0.38;
const NEEDLE_LENGTH = METER_RADIUS * 0.85;
const TICK_COUNT = 25; // ticks across the arc (-50 to +50 cents)

export default function App() {
  const { state, error, listening, start, stop } = useAudioPitch();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const needleAngle = useRef(new Animated.Value(0)).current;

  // Fade in/out based on active state
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: state.active ? 1 : 0.15,
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

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Note display */}
      <Animated.View style={[styles.noteContainer, { opacity: fadeAnim }]}>
        <Text style={styles.noteName}>
          {state.active && state.note ? state.note.name : '—'}
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
                    width: isCenter ? 2.5 : isMajor ? 1.5 : 1,
                    height: tickLen,
                    left: width / 2 + (x1 + x2) / 2 - 1,
                    top: METER_RADIUS + (y1 + y2) / 2 - tickLen / 2,
                    backgroundColor: isCenter
                      ? '#4ade80'
                      : isMajor
                      ? '#555'
                      : '#333',
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
          <View style={styles.needle} />
          <View style={styles.needleDot} />
        </Animated.View>

        {/* Cents label */}
        <Text style={styles.centsText}>{centsText}</Text>
      </Animated.View>

      {/* Start/Stop button */}
      <TouchableOpacity
        style={[styles.button, listening && styles.buttonActive]}
        onPress={listening ? stop : start}
        activeOpacity={0.7}
      >
        <Text style={styles.buttonText}>
          {listening ? 'STOP' : 'START'}
        </Text>
      </TouchableOpacity>

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
    marginBottom: 30,
  },
  noteName: {
    fontSize: 64,
    fontWeight: '200',
    color: '#e0e0e0',
    letterSpacing: 4,
  },
  frequency: {
    fontSize: 16,
    color: '#555',
    marginTop: 4,
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
    justifyContent: 'flex-end',
    width: 4,
    height: NEEDLE_LENGTH,
    marginTop: -20,
  },
  needle: {
    width: 2,
    height: NEEDLE_LENGTH,
    backgroundColor: '#e74c3c',
    borderRadius: 1,
  },
  needleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#c0392b',
    position: 'absolute',
    bottom: -5,
  },
  centsText: {
    fontSize: 14,
    color: '#666',
    marginTop: 20,
    fontVariant: ['tabular-nums'],
  },
  button: {
    marginTop: 50,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: 'transparent',
  },
  buttonActive: {
    borderColor: '#e74c3c',
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
  },
  buttonText: {
    fontSize: 14,
    color: '#888',
    letterSpacing: 6,
    fontWeight: '300',
  },
  errorText: {
    color: '#e74c3c',
    fontSize: 12,
    marginTop: 16,
    textAlign: 'center',
    paddingHorizontal: 30,
  },
});
