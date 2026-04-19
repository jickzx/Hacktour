/**
 * SettingsScreen — customise the Gemini assistant voice (rate, pitch, language, voice)
 */
import { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Speech from "expo-speech";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, RADII, SPACING } from "../constants/theme";
import {
  DEFAULT_VOICE_SETTINGS,
  loadVoiceSettings,
  updateVoiceSettings,
  VoiceSettings,
  VOICE_PRESETS,
} from "../services/voiceSettings";

const LANGUAGES: { code: string; label: string }[] = [
  { code: "en-US", label: "English (US)" },
  { code: "en-GB", label: "English (UK)" },
  { code: "en-AU", label: "English (AU)" },
  { code: "es-ES", label: "Spanish" },
  { code: "fr-FR", label: "French" },
  { code: "de-DE", label: "German" },
  { code: "ja-JP", label: "Japanese" },
];

export default function SettingsScreen() {
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
  const [voices, setVoices] = useState<Speech.Voice[]>([]);

  useEffect(() => {
    loadVoiceSettings().then(setSettings);
    Speech.getAvailableVoicesAsync().then(setVoices).catch(() => setVoices([]));
  }, []);

  const patch = async (p: Partial<VoiceSettings>) => {
    const next = await updateVoiceSettings(p);
    setSettings(next);
  };

  const preview = () => {
    Speech.stop();
    Speech.speak("Hey, I'm Gemini. This is how I'll sound on your stream.", {
      language: settings.language,
      rate: settings.rate,
      pitch: settings.pitch,
      voice: settings.voiceId,
    });
  };

  const stepper = (label: string, value: number, min: number, max: number, step: number, onChange: (n: number) => void) => (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperCtrl}>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
          activeOpacity={0.7}
        >
          <Text style={styles.stepBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={styles.stepperValue}>{value.toFixed(2)}×</Text>
        <TouchableOpacity
          style={styles.stepBtn}
          onPress={() => onChange(Math.min(max, +(value + step).toFixed(2)))}
          activeOpacity={0.7}
        >
          <Text style={styles.stepBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const voiceOptions = voices
    .filter((v) => v.language?.toLowerCase().startsWith(settings.language.slice(0, 2).toLowerCase()))
    .slice(0, 12);

  return (
    <View style={styles.root}>
      <LinearGradient colors={[COLORS.background, COLORS.uploadBg, COLORS.background]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.logoBar} />
          <Text style={styles.brand}>Settings</Text>
          <Text style={styles.tagline}>Gemini Voice</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Presets</Text>
          <View style={styles.presetRow}>
            {VOICE_PRESETS.map((p) => (
              <TouchableOpacity
                key={p.label}
                style={styles.presetChip}
                onPress={() => patch(p.patch)}
                activeOpacity={0.8}
              >
                <Text style={styles.presetText}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Speech</Text>
          {stepper("Rate", settings.rate, 0.5, 2.0, 0.05, (v) => patch({ rate: v }))}
          {stepper("Pitch", settings.pitch, 0.5, 2.0, 0.05, (v) => patch({ pitch: v }))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Language</Text>
          <View style={styles.chipWrap}>
            {LANGUAGES.map((l) => {
              const active = settings.language === l.code;
              return (
                <TouchableOpacity
                  key={l.code}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => patch({ language: l.code, voiceId: undefined })}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{l.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {voiceOptions.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Voice</Text>
            <View style={styles.chipWrap}>
              <TouchableOpacity
                style={[styles.chip, !settings.voiceId && styles.chipActive]}
                onPress={() => patch({ voiceId: undefined })}
                activeOpacity={0.8}
              >
                <Text style={[styles.chipText, !settings.voiceId && styles.chipTextActive]}>System default</Text>
              </TouchableOpacity>
              {voiceOptions.map((v) => {
                const active = settings.voiceId === v.identifier;
                return (
                  <TouchableOpacity
                    key={v.identifier}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => patch({ voiceId: v.identifier })}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {v.name || v.identifier.slice(-14)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        <TouchableOpacity style={styles.previewBtn} onPress={preview} activeOpacity={0.85}>
          <LinearGradient
            colors={[COLORS.gradientStart, COLORS.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.previewGrad}
          >
            <Text style={styles.previewText}>▶ Preview Voice</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resetBtn}
          onPress={() => patch(DEFAULT_VOICE_SETTINGS)}
          activeOpacity={0.7}
        >
          <Text style={styles.resetText}>Reset to defaults</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xxl + 16, paddingBottom: 120 },
  header: { alignItems: "center", marginBottom: SPACING.lg },
  logoBar: { width: 40, height: 4, borderRadius: 2, marginBottom: SPACING.md },
  brand: { fontSize: 28, fontWeight: "800", color: COLORS.text, letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: COLORS.textSecondary, marginTop: SPACING.xs, letterSpacing: 2, textTransform: "uppercase" },
  card: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.surfaceBorder,
    borderWidth: 1,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 2,
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    marginBottom: SPACING.sm,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.sm,
  },
  stepperLabel: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  stepperCtrl: { flexDirection: "row", alignItems: "center", gap: SPACING.sm },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
  },
  stepBtnText: { color: COLORS.text, fontSize: 18, fontWeight: "800" },
  stepperValue: { color: COLORS.text, fontSize: 15, fontWeight: "700", minWidth: 60, textAlign: "center" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.full,
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
  },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primaryLight },
  chipText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  presetChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.full,
    backgroundColor: COLORS.primaryDark,
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  presetText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  previewBtn: { marginTop: SPACING.sm, borderRadius: RADII.lg, overflow: "hidden" },
  previewGrad: { paddingVertical: SPACING.md, alignItems: "center" },
  previewText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  resetBtn: { marginTop: SPACING.md, alignItems: "center", padding: SPACING.sm },
  resetText: { color: COLORS.textMuted, fontSize: 13, textDecorationLine: "underline" },
});
