/** UI pieces for the AI edit screen. */
import { LinearGradient } from "expo-linear-gradient";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS, RADII, SPACING } from "../constants/theme";
import { QUICK_PROMPTS, type VideoClip } from "./AIEditTypes";

type UploadZoneProps = { clipCount: number; onUpload: () => void };
type ClipListProps = { clips: VideoClip[]; onRemove: (id: string) => void };
type PromptSectionProps = { prompt: string; onPromptChange: (text: string) => void };
type QuickPromptsProps = { onSelect: (text: string) => void };
type GenerateButtonProps = { onPress: () => void; disabled: boolean; isGenerating: boolean };

/** Top header with app branding. */
export function Header() {
  return (
    <View style={styles.header}>
      <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientEnd]} style={styles.logoBar} />
      <Text style={styles.brand}>Stream Mind</Text>
      <Text style={styles.tagline}>AI Video Editor</Text>
    </View>
  );
}

/** Upload drop zone for video clips. */
export function UploadZone({ clipCount, onUpload }: UploadZoneProps) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onUpload} style={styles.uploadZone}>
      <View style={styles.uploadIconWrap}><Text style={styles.uploadIcon}>+</Text></View>
      <Text style={styles.uploadTitle}>Upload Video Clips</Text>
      <Text style={styles.uploadSubtext}>MP4, MOV, AVI — up to 2GB per clip</Text>
      {clipCount > 0 && (
        <View style={styles.clipBadge}><Text style={styles.clipBadgeText}>{clipCount} clip{clipCount !== 1 ? "s" : ""} selected</Text></View>
      )}
    </TouchableOpacity>
  );
}

/** Horizontal list of uploaded clips. */
export function ClipList({ clips, onRemove }: ClipListProps) {
  return (
    <View style={styles.clipListWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {clips.map((clip) => (
          <View key={clip.id} style={styles.clipCard}>
            <View style={styles.clipThumb}><Text style={styles.clipThumbIcon}>▶</Text></View>
            <Text numberOfLines={1} style={styles.clipName}>{clip.name}</Text>
            <Text style={styles.clipDuration}>{clip.duration}</Text>
            <TouchableOpacity onPress={() => onRemove(clip.id)} style={styles.clipRemove}><Text style={styles.clipRemoveText}>×</Text></TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** Prompt text input area. */
export function PromptSection({ prompt, onPromptChange }: PromptSectionProps) {
  return (
    <View style={styles.promptWrap}>
      <Text style={styles.sectionLabel}>Describe your edit</Text>
      <TextInput
        multiline
        numberOfLines={4}
        onChangeText={onPromptChange}
        placeholder="e.g. Add cinematic transitions, remove dead air, add subtitles with white text..."
        placeholderTextColor={COLORS.textMuted}
        style={styles.promptInput}
        textAlignVertical="top"
        value={prompt}
      />
      <Text style={styles.promptHint}>{prompt.length}/500 characters</Text>
    </View>
  );
}

/** Quick prompt suggestion pills. */
export function QuickPrompts({ onSelect }: QuickPromptsProps) {
  return (
    <View style={styles.quickWrap}>
      <Text style={styles.sectionLabel}>Quick prompts</Text>
      <View style={styles.pillRow}>
        {QUICK_PROMPTS.map((label) => (
          <TouchableOpacity key={label} activeOpacity={0.7} onPress={() => onSelect(label)} style={styles.pill}>
            <Text style={styles.pillText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

/** Gradient generate button. */
export function GenerateButton({ onPress, disabled, isGenerating }: GenerateButtonProps) {
  return (
    <TouchableOpacity activeOpacity={0.8} disabled={disabled} onPress={onPress} style={styles.generateWrap}>
      <LinearGradient colors={disabled ? [COLORS.surface, COLORS.surfaceBorder] : [COLORS.gradientStart, COLORS.gradientEnd]} style={styles.generateBtn}>
        <Text style={[styles.generateText, disabled && styles.generateTextDisabled]}>{isGenerating ? "Generating..." : "✦  Generate Edit"}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: "center", marginBottom: SPACING.xl },
  logoBar: { width: 40, height: 4, borderRadius: 2, marginBottom: SPACING.md },
  brand: { fontSize: 28, fontWeight: "800", color: COLORS.text, letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: COLORS.textSecondary, marginTop: SPACING.xs, letterSpacing: 2, textTransform: "uppercase" },
  uploadZone: { borderWidth: 2, borderColor: COLORS.surfaceBorder, borderStyle: "dashed", borderRadius: RADII.lg, backgroundColor: COLORS.uploadBg, alignItems: "center", justifyContent: "center", paddingVertical: SPACING.xl, marginBottom: SPACING.lg },
  uploadIconWrap: { width: 56, height: 56, borderRadius: RADII.full, backgroundColor: COLORS.surfaceLight, alignItems: "center", justifyContent: "center", marginBottom: SPACING.md },
  uploadIcon: { fontSize: 28, fontWeight: "300", color: COLORS.primaryLight },
  uploadTitle: { fontSize: 16, fontWeight: "600", color: COLORS.text, marginBottom: SPACING.xs },
  uploadSubtext: { fontSize: 12, color: COLORS.textMuted },
  clipBadge: { marginTop: SPACING.md, backgroundColor: COLORS.accentDim, borderRadius: RADII.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs },
  clipBadgeText: { fontSize: 12, fontWeight: "600", color: COLORS.accent },
  clipListWrap: { marginBottom: SPACING.lg },
  clipCard: { width: 110, backgroundColor: COLORS.surface, borderRadius: RADII.md, padding: SPACING.sm, marginRight: SPACING.sm, alignItems: "center", borderWidth: 1, borderColor: COLORS.surfaceBorder },
  clipThumb: { width: "100%", height: 60, backgroundColor: COLORS.surfaceLight, borderRadius: RADII.sm, alignItems: "center", justifyContent: "center", marginBottom: SPACING.sm },
  clipThumbIcon: { fontSize: 18, color: COLORS.primaryLight },
  clipName: { fontSize: 11, color: COLORS.text, fontWeight: "500", width: "100%" },
  clipDuration: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  clipRemove: { position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.error, alignItems: "center", justifyContent: "center" },
  clipRemoveText: { color: COLORS.white, fontSize: 12, fontWeight: "700", lineHeight: 16 },
  promptWrap: { marginBottom: SPACING.lg },
  sectionLabel: { fontSize: 13, fontWeight: "600", color: COLORS.textSecondary, marginBottom: SPACING.sm, textTransform: "uppercase", letterSpacing: 1 },
  promptInput: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.surfaceBorder, borderRadius: RADII.md, padding: SPACING.md, fontSize: 15, color: COLORS.text, minHeight: 110 },
  promptHint: { fontSize: 11, color: COLORS.textMuted, textAlign: "right", marginTop: SPACING.xs },
  quickWrap: { marginBottom: SPACING.xl },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm },
  pill: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.surfaceBorder, borderRadius: RADII.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  pillText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: "500" },
  generateWrap: { marginTop: SPACING.sm },
  generateBtn: { borderRadius: RADII.lg, paddingVertical: SPACING.lg, alignItems: "center" },
  generateText: { fontSize: 16, fontWeight: "700", color: COLORS.white, letterSpacing: 0.3 },
  generateTextDisabled: { color: COLORS.textMuted },
});
