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
import { COLORS, FONT_SIZES, RADII, SPACING, WEIGHTS } from "../constants/theme";
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
    <View style={s.stepperRow}>
      <Text style={s.stepperLabel}>{label}</Text>
      <View style={s.stepperCtrl}>
        <TouchableOpacity
          style={s.stepBtn}
          onPress={() => onChange(Math.max(min, +(value - step).toFixed(2)))}
          activeOpacity={0.7}
        >
          <Text style={s.stepBtnMinus}>−</Text>
        </TouchableOpacity>
        <View style={s.valuePill}>
          <Text style={s.stepperValue}>{value.toFixed(2)}×</Text>
        </View>
        <TouchableOpacity
          style={s.stepBtn}
          onPress={() => onChange(Math.min(max, +(value + step).toFixed(2)))}
          activeOpacity={0.7}
        >
          <Text style={s.stepBtnPlus}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const voiceOptions = voices
    .filter((v) => v.language?.toLowerCase().startsWith(settings.language.slice(0, 2).toLowerCase()))
    .slice(0, 12);

  return (
    <View style={s.root}>
      <LinearGradient
        colors={["#0A0A0C", COLORS.background, "#0A0A0C"]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* ── Gradient header ── */}
        <View style={s.headerWrap}>
          <LinearGradient
            colors={["#1A0A0E", COLORS.primaryDark, "#1A0A0E"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.headerGrad}
          >
            <LinearGradient
              colors={[COLORS.gradientStart, COLORS.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.logoBar}
            />
            <Text style={s.brand}>Settings</Text>
            <Text style={s.tagline}>Gemini Voice</Text>
          </LinearGradient>
        </View>

        {/* ── Presets ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Presets</Text>
          <View style={s.chipWrap}>
            {VOICE_PRESETS.map((p) => (
              <TouchableOpacity
                key={p.label}
                style={s.presetChip}
                onPress={() => patch(p.patch)}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={[COLORS.primaryDark, COLORS.primary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={s.presetGrad}
                >
                  <Text style={s.presetText}>{p.label}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Speech ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Speech</Text>
          {stepper("Rate", settings.rate, 0.5, 2.0, 0.05, (v) => patch({ rate: v }))}
          <View style={s.divider} />
          {stepper("Pitch", settings.pitch, 0.5, 2.0, 0.05, (v) => patch({ pitch: v }))}
        </View>

        {/* ── Language ── */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Language</Text>
          <View style={s.chipWrap}>
            {LANGUAGES.map((l) => {
              const active = settings.language === l.code;
              return (
                <TouchableOpacity
                  key={l.code}
                  style={[s.chip, active && s.chipActive]}
                  onPress={() => patch({ language: l.code, voiceId: undefined })}
                  activeOpacity={0.8}
                >
                  {active && (
                    <LinearGradient
                      colors={[COLORS.gradientStart, COLORS.gradientEnd]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <Text style={[s.chipText, active && s.chipTextActive]}>{l.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Voice ── */}
        {voiceOptions.length > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Voice</Text>
            <View style={s.chipWrap}>
              <TouchableOpacity
                style={[s.chip, !settings.voiceId && s.chipActive]}
                onPress={() => patch({ voiceId: undefined })}
                activeOpacity={0.8}
              >
                {!settings.voiceId && (
                  <LinearGradient
                    colors={[COLORS.gradientStart, COLORS.gradientEnd]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={StyleSheet.absoluteFill}
                  />
                )}
                <Text style={[s.chipText, !settings.voiceId && s.chipTextActive]}>System default</Text>
              </TouchableOpacity>
              {voiceOptions.map((v) => {
                const active = settings.voiceId === v.identifier;
                return (
                  <TouchableOpacity
                    key={v.identifier}
                    style={[s.chip, active && s.chipActive]}
                    onPress={() => patch({ voiceId: v.identifier })}
                    activeOpacity={0.8}
                  >
                    {active && (
                      <LinearGradient
                        colors={[COLORS.gradientStart, COLORS.gradientEnd]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={StyleSheet.absoluteFill}
                      />
                    )}
                    <Text style={[s.chipText, active && s.chipTextActive]}>
                      {v.name || v.identifier.slice(-14)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* ── Preview ── */}
        <TouchableOpacity style={s.previewBtn} onPress={preview} activeOpacity={0.85}>
          <LinearGradient
            colors={["#FF2442", "#FF6B81"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={s.previewGrad}
          >
            <Text style={s.previewIcon}>▶</Text>
            <Text style={s.previewText}>Preview Voice</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* ── Reset ── */}
        <TouchableOpacity
          style={s.resetBtn}
          onPress={() => patch(DEFAULT_VOICE_SETTINGS)}
          activeOpacity={0.7}
        >
          <Text style={s.resetText}>Reset to defaults</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },

  content: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xxl + 8,
    paddingBottom: 120,
  },

  /* ── Header ── */
  headerWrap: {
    borderRadius: RADII.xl,
    overflow: "hidden",
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: "#2A2A2E",
  },
  headerGrad: {
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    alignItems: "center",
  },
  logoBar: {
    width: 48,
    height: 4,
    borderRadius: 2,
    marginBottom: SPACING.md,
  },
  brand: {
    fontSize: FONT_SIZES.hero,
    fontWeight: WEIGHTS.heavy,
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: FONT_SIZES.sm,
    fontWeight: WEIGHTS.medium,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    letterSpacing: 3,
    textTransform: "uppercase",
  },

  /* ── Card ── */
  card: {
    backgroundColor: "#111113",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2A2A2E",
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  cardTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: WEIGHTS.bold,
    letterSpacing: 2.5,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    marginBottom: SPACING.sm + 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#2A2A2E",
    marginVertical: SPACING.sm - 2,
  },

  /* ── Stepper ── */
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: SPACING.sm,
  },
  stepperLabel: {
    fontSize: FONT_SIZES.lg,
    fontWeight: WEIGHTS.semibold,
    color: COLORS.text,
  },
  stepperCtrl: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
  },
  stepBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.surfaceElevated,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#2A2A2E",
  },
  stepBtnMinus: {
    color: COLORS.textSecondary,
    fontSize: 20,
    fontWeight: WEIGHTS.heavy,
    marginTop: -1,
  },
  stepBtnPlus: {
    color: COLORS.gradientEnd,
    fontSize: 18,
    fontWeight: WEIGHTS.heavy,
  },
  valuePill: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: RADII.full,
    paddingVertical: SPACING.xs + 1,
    paddingHorizontal: SPACING.md,
    borderWidth: 1,
    borderColor: "#2A2A2E",
    minWidth: 68,
    alignItems: "center",
  },
  stepperValue: {
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: WEIGHTS.bold,
  },

  /* ── Chips ── */
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  chip: {
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.sm,
    borderRadius: RADII.full,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: "#2A2A2E",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  chipActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  chipText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: WEIGHTS.semibold,
  },
  chipTextActive: {
    color: "#fff",
    fontWeight: WEIGHTS.bold,
  },

  /* ── Preset chips ── */
  presetChip: {
    borderRadius: RADII.full,
    overflow: "hidden",
  },
  presetGrad: {
    paddingHorizontal: SPACING.md + 2,
    paddingVertical: SPACING.sm + 1,
    borderRadius: RADII.full,
  },
  presetText: {
    color: "#fff",
    fontSize: FONT_SIZES.sm,
    fontWeight: WEIGHTS.bold,
  },

  /* ── Preview button ── */
  previewBtn: {
    marginTop: SPACING.sm,
    borderRadius: RADII.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,107,129,0.3)",
  },
  previewGrad: {
    paddingVertical: SPACING.md + 4,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: SPACING.sm,
  },
  previewIcon: {
    color: "#fff",
    fontSize: FONT_SIZES.lg,
  },
  previewText: {
    color: "#fff",
    fontWeight: WEIGHTS.heavy,
    fontSize: FONT_SIZES.lg,
    letterSpacing: 0.5,
  },

  /* ── Reset ── */
  resetBtn: {
    marginTop: SPACING.md,
    alignItems: "center",
    paddingVertical: SPACING.sm,
  },
  resetText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.sm,
    textDecorationLine: "underline",
  },
});
