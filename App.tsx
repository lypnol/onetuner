import React, { useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  Animated,
  Dimensions,
  Platform,
  TouchableOpacity,
  Modal,
  Switch,
  TextInput,
  Linking,
  Keyboard,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPitch } from "./src/useAudioPitch";
import { useSettings } from "./src/useSettings";

const { width } = Dimensions.get("window");
const METER_RADIUS = width * 0.38;
const NEEDLE_LENGTH = METER_RADIUS * 0.85;
const TICK_COUNT = 25;
const IN_TUNE_ENTER = 4;
const IN_TUNE_EXIT = 8;
const TOLERANCE_DEG = (IN_TUNE_ENTER / 50) * 45;
const TOLERANCE_HEIGHT = 20;

const themes = {
  dark: {
    bg: "#0a0a0f",
    // Active (sound detected) colors
    noteText: "#ffffff",
    freqText: "#eee",
    centsText: "#fff",
    tickMajor: "#fff",
    tickMinor: "rgba(255, 255, 255, 0.7)",
    toleranceActive: "rgba(255, 255, 255, 0.6)",
    needle: "#fff",
    // Idle (no sound) colors — same muted gray as the settings icon
    idleText: "#ccc",
    idleTick: "#ccc",
    idleTickMinor: "rgba(204, 204, 204, 0.5)",
    toleranceIdle: "rgba(204, 204, 204, 0.4)",
    idleNeedle: "#ccc",
    listeningText: "#ccc",
    accent: "#4ade80",
    accentMinor: "rgba(74, 222, 128, 0.5)",
    errorText: "#ff6666",
    iconColor: "#ccc",
    statusBar: "light" as const,
    modalBg: "#1a1a22",
    modalText: "#eee",
    modalSecondary: "#888",
    modalBorder: "#333",
    modalInputBg: "#0a0a0f",
  },
  light: {
    bg: "#f5f5f7",
    // Active (sound detected) colors
    noteText: "#000",
    freqText: "#333",
    centsText: "#111",
    tickMajor: "#000",
    tickMinor: "#333",
    toleranceActive: "rgba(0, 0, 0, 0.4)",
    needle: "#000",
    // Idle (no sound) colors
    idleText: "#999",
    idleTick: "#999",
    idleTickMinor: "rgba(153, 153, 153, 0.5)",
    toleranceIdle: "rgba(153, 153, 153, 0.3)",
    idleNeedle: "#999",
    listeningText: "#999",
    accent: "#22c55e",
    accentMinor: "rgba(34, 197, 94, 0.4)",
    errorText: "#dc2626",
    iconColor: "#666",
    statusBar: "dark" as const,
    modalBg: "#ffffff",
    modalText: "#111",
    modalSecondary: "#777",
    modalBorder: "#ddd",
    modalInputBg: "#f0f0f0",
  },
};

export default function App() {
  const { settings, update, loaded } = useSettings();
  const { state, error } = useAudioPitch(settings.a4Freq, settings.notation);
  const [inTune, setInTune] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [a4Input, setA4Input] = useState(String(settings.a4Freq));
  const needleAngle = useRef(new Animated.Value(0)).current;
  const recordingPulse = useRef(new Animated.Value(0.3)).current;

  const t = settings.dark ? themes.dark : themes.light;

  // Sync a4Input when settings load
  useEffect(() => {
    if (loaded) setA4Input(String(settings.a4Freq));
  }, [loaded, settings.a4Freq]);

  // Recording dot pulse
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
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [state.active]);


  // Needle animation
  useEffect(() => {
    const targetAngle = state.note ? (state.note.cents / 50) * 45 : 0;
    Animated.spring(needleAngle, {
      toValue: targetAngle,
      damping: 15,
      stiffness: 120,
      useNativeDriver: true,
    }).start();
  }, [state.note?.cents]);

  // Hysteresis
  useEffect(() => {
    if (!state.active || !state.note) {
      setInTune(false);
      return;
    }
    const absCents = Math.abs(state.note.cents);
    setInTune((prev) =>
      prev ? absCents <= IN_TUNE_EXIT : absCents <= IN_TUNE_ENTER,
    );
  }, [state.active, state.note?.cents]);

  const needleRotation = needleAngle.interpolate({
    inputRange: [-45, 45],
    outputRange: ["-45deg", "45deg"],
  });

  const centsText =
    state.note && state.active
      ? state.note.cents > 0
        ? `+${state.note.cents}`
        : `${state.note.cents}`
      : "";

  const isActive = state.active;
  const accentColor = inTune ? t.accent : isActive ? t.needle : t.idleNeedle;
  const majorTickColor = inTune ? t.accent : isActive ? t.tickMajor : t.idleTick;
  const minorTickColor = inTune ? t.accentMinor : isActive ? t.tickMinor : t.idleTickMinor;
  const toleranceColor = inTune ? t.accent : isActive ? t.toleranceActive : t.toleranceIdle;

  const handleA4Change = (text: string) => {
    setA4Input(text);
    const val = parseInt(text, 10);
    if (val > 0 && !isNaN(val)) {
      update({ a4Freq: val });
    }
  };

  const resetA4 = () => {
    setA4Input("440");
    update({ a4Freq: 440 });
  };

  return (
    <View style={[styles.container, { backgroundColor: t.bg }]}>
      <StatusBar style={t.statusBar} />

      {/* Settings button */}
      <TouchableOpacity
        style={styles.settingsButton}
        onPress={() => setShowSettings(true)}
        activeOpacity={0.6}
      >
        <Ionicons name="settings-outline" size={22} color={t.iconColor} />
      </TouchableOpacity>

      {/* Note display */}
      <View style={styles.noteContainer}>
        {state.active && state.note ? (
          <>
            <View style={styles.noteRow}>
              <Text
                style={[
                  styles.noteBase,
                  { color: inTune ? t.accent : t.noteText },
                ]}
              >
                {state.note.base}
              </Text>
              <View style={styles.noteSubscripts}>
                <Text
                  style={[
                    styles.noteOctave,
                    { color: inTune ? t.accent : t.noteText },
                  ]}
                >
                  {state.note.octave}
                </Text>
                {state.note.accidental ? (
                  <Text
                    style={[
                      styles.noteAccidental,
                      { color: inTune ? t.accent : t.noteText },
                    ]}
                  >
                    {state.note.accidental}
                  </Text>
                ) : null}
              </View>
            </View>
            <Text style={[styles.frequency, { color: inTune ? t.accent : t.freqText }]}>
              {state.frequency ? `${state.frequency.toFixed(1)} Hz` : ""}
            </Text>
          </>
        ) : (
          <View style={styles.listeningRow}>
            <Animated.View
              style={[
                styles.recordingDot,
                { opacity: recordingPulse, backgroundColor: "#ff0000" },
              ]}
            />
            <Text style={[styles.listeningText, { color: t.listeningText }]}>
              listening...
            </Text>
          </View>
        )}
      </View>

      {/* Meter */}
      <View style={styles.meterContainer}>
        <View style={styles.arcContainer}>
          {/* Tolerance arc band */}
          {Array.from({ length: 40 }).map((_, i) => {
            const angle =
              ((i / 39) * 2 * TOLERANCE_DEG - TOLERANCE_DEG) * (Math.PI / 180);
            const midR = METER_RADIUS - TOLERANCE_HEIGHT / 2;
            const x = Math.sin(angle) * midR;
            const y = -Math.cos(angle) * midR;
            return (
              <View
                key={`tol-${i}`}
                style={{
                  position: "absolute",
                  width: 4,
                  height: TOLERANCE_HEIGHT,
                  borderRadius: 1,
                  left: width / 2 + x - 2,
                  top: METER_RADIUS + y - TOLERANCE_HEIGHT / 2,
                  backgroundColor: toleranceColor,
                  transform: [{ rotate: `${(angle * 180) / Math.PI}deg` }],
                }}
              />
            );
          })}
          {/* Regular ticks */}
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
                    backgroundColor: isMajor ? majorTickColor : minorTickColor,
                    transform: [{ rotate: `${(angle * 180) / Math.PI}deg` }],
                  },
                ]}
              />
            );
          })}
        </View>

        <Animated.View
          style={[
            styles.needleWrapper,
            { transform: [{ rotate: needleRotation }] },
          ]}
        >
          <View style={[styles.needle, { backgroundColor: accentColor }]} />
          <View style={[styles.needleDot, { backgroundColor: accentColor }]} />
        </Animated.View>

        <Text style={[styles.centsText, { color: isActive ? t.centsText : t.idleText }]}>
          {centsText}
        </Text>
      </View>

      {error && (
        <Text style={[styles.errorText, { color: t.errorText }]}>{error}</Text>
      )}

      {/* Settings Modal */}
      <Modal
        visible={showSettings}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSettings(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={Keyboard.dismiss}
        >
          <View style={[styles.modalCard, { backgroundColor: t.modalBg }]}>
            {/* Header */}
            <View
              style={[styles.modalHeader, { borderBottomColor: t.modalBorder }]}
            >
              <Text style={[styles.modalTitle, { color: t.modalText }]}>
                Settings
              </Text>
              <TouchableOpacity
                onPress={() => setShowSettings(false)}
                activeOpacity={0.6}
              >
                <Ionicons name="close" size={24} color={t.modalSecondary} />
              </TouchableOpacity>
            </View>

            {/* Notation */}
            <View
              style={[styles.settingRow, { borderBottomColor: t.modalBorder }]}
            >
              <View>
                <Text style={[styles.settingLabel, { color: t.modalText }]}>
                  Notation
                </Text>
                <Text style={[styles.settingHint, { color: t.modalSecondary }]}>
                  {settings.notation === "solfege"
                    ? "Do, Re, Mi..."
                    : "C, D, E..."}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.notationToggle, { borderColor: t.modalBorder }]}
                onPress={() =>
                  update({
                    notation:
                      settings.notation === "solfege" ? "letter" : "solfege",
                  })
                }
                activeOpacity={0.6}
              >
                <View
                  style={[
                    styles.notationOption,
                    settings.notation === "solfege" && {
                      backgroundColor: t.accent,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.notationOptionText,
                      {
                        color:
                          settings.notation === "solfege"
                            ? "#000"
                            : t.modalSecondary,
                      },
                    ]}
                  >
                    Do
                  </Text>
                </View>
                <View
                  style={[
                    styles.notationOption,
                    settings.notation === "letter" && {
                      backgroundColor: t.accent,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.notationOptionText,
                      {
                        color:
                          settings.notation === "letter"
                            ? "#000"
                            : t.modalSecondary,
                      },
                    ]}
                  >
                    C
                  </Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Calibration */}
            <View
              style={[styles.settingRow, { borderBottomColor: t.modalBorder }]}
            >
              <View>
                <Text style={[styles.settingLabel, { color: t.modalText }]}>
                  {settings.notation === "solfege" ? "La" : "A"}4 =
                </Text>
                <Text style={[styles.settingHint, { color: t.modalSecondary }]}>
                  Standard 440 Hz
                </Text>
              </View>
              <View style={styles.calibrationRow}>
                {settings.a4Freq !== 440 && (
                  <TouchableOpacity
                    onPress={resetA4}
                    activeOpacity={0.6}
                    style={styles.resetButton}
                  >
                    <Ionicons
                      name="refresh"
                      size={18}
                      color={t.modalSecondary}
                    />
                  </TouchableOpacity>
                )}
                <TextInput
                  style={[
                    styles.calibrationInput,
                    {
                      color: t.modalText,
                      backgroundColor: t.modalInputBg,
                      borderColor: t.modalBorder,
                    },
                  ]}
                  value={a4Input}
                  onChangeText={handleA4Change}
                  keyboardType="number-pad"
                  maxLength={3}
                  selectTextOnFocus
                />
                <Text style={[styles.hzLabel, { color: t.modalSecondary }]}>
                  Hz
                </Text>
              </View>
            </View>

            {/* Dark mode */}
            <View
              style={[styles.settingRow, { borderBottomColor: t.modalBorder }]}
            >
              <Text style={[styles.settingLabel, { color: t.modalText }]}>
                Dark mode
              </Text>
              <Switch
                value={settings.dark}
                onValueChange={(val) => update({ dark: val })}
                trackColor={{
                  false: settings.dark ? "#555" : "#999",
                  true: t.accent,
                }}
                thumbColor="#fff"
                ios_backgroundColor={settings.dark ? "#555" : "#999"}
              />
            </View>

            {/* Footer */}
            <View style={styles.modalFooter}>
              <Text style={[styles.footerText, { color: t.modalSecondary }]}>
                open source app —{" "}
                <Text
                  style={styles.footerLink}
                  onPress={() =>
                    Linking.openURL("https://github.com/lypnol/onetuner")
                  }
                >
                  code
                </Text>
              </Text>
              <Text style={[styles.footerText, { color: t.modalSecondary }]}>
                by{" "}
                <Text
                  style={styles.footerLink}
                  onPress={() =>
                    Linking.openURL("https://www.instagram.com/ayoub.v2.0")
                  }
                >
                  Ayoub SBAI
                </Text>
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: Platform.OS === "ios" ? 60 : 40,
  },
  settingsButton: {
    position: "absolute",
    top: Platform.OS === "ios" ? 60 : 40,
    right: 20,
    padding: 8,
  },
  noteContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 30,
    height: 100,
  },
  noteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  noteBase: {
    fontSize: 64,
    fontWeight: "200",
    letterSpacing: 2,
  },
  noteSubscripts: {
    marginLeft: 2,
    marginTop: 8,
  },
  noteOctave: {
    fontSize: 24,
    fontWeight: "300",
  },
  noteAccidental: {
    fontSize: 28,
    fontWeight: "300",
    marginTop: -4,
  },
  frequency: {
    fontSize: 16,
    marginTop: 4,
    height: 20,
    fontVariant: ["tabular-nums"],
  },
  listeningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  listeningText: {
    fontSize: 24,
    fontWeight: "300",
    letterSpacing: 2,
  },
  meterContainer: {
    width: width,
    height: METER_RADIUS + 60,
    alignItems: "center",
    justifyContent: "center",
  },
  arcContainer: {
    position: "absolute",
    width: width,
    height: METER_RADIUS * 2,
    top: 0,
  },
  tick: {
    position: "absolute",
    borderRadius: 1,
  },
  needleWrapper: {
    alignItems: "center",
    width: 4,
    height: NEEDLE_LENGTH + 5,
    transformOrigin: "center bottom",
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
    fontVariant: ["tabular-nums"],
  },
  errorText: {
    fontSize: 12,
    marginTop: 16,
    textAlign: "center",
    paddingHorizontal: 30,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalCard: {
    width: width * 0.82,
    borderRadius: 16,
    overflow: "hidden",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
  },
  settingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: "500",
  },
  settingHint: {
    fontSize: 12,
    marginTop: 2,
  },
  notationToggle: {
    flexDirection: "row",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  notationOption: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  notationOptionText: {
    fontSize: 14,
    fontWeight: "600",
  },
  calibrationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  calibrationInput: {
    width: 52,
    fontSize: 16,
    fontWeight: "500",
    textAlign: "center",
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    fontVariant: ["tabular-nums"],
  },
  hzLabel: {
    fontSize: 14,
  },
  resetButton: {
    padding: 4,
  },
  modalFooter: {
    alignItems: "center",
    paddingVertical: 14,
    gap: 2,
  },
  footerText: {
    fontSize: 11,
  },
  footerLink: {
    textDecorationLine: "underline",
  },
});
