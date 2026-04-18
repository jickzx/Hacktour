/**
 * AIEditScreen — main video editing screen for Stream Mind
 * Lets users upload clips, write a prompt, and trigger AI-powered editing
 */
import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, SPACING, RADII } from "../constants/theme";

/** Preset prompt suggestions the user can tap */
const QUICK_PROMPTS = [
  "Add subtitles",
  "Remove silence",
  "Add transitions",
  "Color grade",
  "Add music",
  "Zoom on action",
];

/** Single uploaded clip representation */
interface VideoClip {
  id: string;
  name: string;
  duration: string;
}

/**
 * Renders the main AI editing screen with upload zone,
 * prompt input, quick actions, and generate button
 */
export default function AIEditScreen() {
  const [prompt, setPrompt] = useState("");
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  // Controls the "Clip saved to library!" success banner visibility
  const [showSavedBanner, setShowSavedBanner] = useState(false);

  /** Simulates picking a video clip from device */
  const handleUpload = () => {
    const mockClip: VideoClip = {
      id: Date.now().toString(),
      name: `clip_${clips.length + 1}.mp4`,
      duration: `${Math.floor(Math.random() * 10) + 1}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`,
    };
    setClips((prev) => [...prev, mockClip]);
  };

  /** Removes a clip by id */
  const handleRemoveClip = (id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
  };

  /** Triggers the AI generation process and shows a saved-to-library banner on success */
  const handleGenerate = () => {
    if (!prompt.trim() || clips.length === 0) return;
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      // Show "Clip saved to library!" banner for 2.5 seconds
      setShowSavedBanner(true);
      setTimeout(() => setShowSavedBanner(false), 2500);
    }, 3000);
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[COLORS.background, "#0D0D1A", COLORS.background]}
        style={StyleSheet.absoluteFill}
      />

      {/* Success banner shown after clip is saved to library */}
      {showSavedBanner && (
        <View style={styles.savedBanner}>
          <Text style={styles.savedBannerText}>✓ Clip saved to library!</Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Header />
        <UploadZone
          clipCount={clips.length}
          onUpload={handleUpload}
        />
        {clips.length > 0 && (
          <ClipList clips={clips} onRemove={handleRemoveClip} />
        )}
        <PromptSection
          prompt={prompt}
          onPromptChange={setPrompt}
        />
        <QuickPrompts
          onSelect={(text) => setPrompt((p) => (p ? `${p}, ${text.toLowerCase()}` : text))}
        />
        <GenerateButton
          onPress={handleGenerate}
          disabled={!prompt.trim() || clips.length === 0 || isGenerating}
          isGenerating={isGenerating}
        />
      </ScrollView>
    </View>
  );
}

/** Top header with app branding */
function Header() {
  return (
    <View style={styles.header}>
      <LinearGradient
        colors={[COLORS.gradientStart, COLORS.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.logoBar}
      />
      <Text style={styles.brand}>Stream Mind</Text>
      <Text style={styles.tagline}>AI Video Editor</Text>
    </View>
  );
}

/** Upload drop zone for video clips */
function UploadZone({
  clipCount,
  onUpload,
}: {
  clipCount: number;
  onUpload: () => void;
}) {
  return (
    <TouchableOpacity style={styles.uploadZone} onPress={onUpload} activeOpacity={0.7}>
      <View style={styles.uploadIconWrap}>
        <Text style={styles.uploadIcon}>+</Text>
      </View>
      <Text style={styles.uploadTitle}>Upload Video Clips</Text>
      <Text style={styles.uploadSubtext}>
        MP4, MOV, AVI — up to 2GB per clip
      </Text>
      {clipCount > 0 && (
        <View style={styles.clipBadge}>
          <Text style={styles.clipBadgeText}>{clipCount} clip{clipCount !== 1 ? "s" : ""} selected</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

/** Horizontal scroll list of uploaded clips */
function ClipList({
  clips,
  onRemove,
}: {
  clips: VideoClip[];
  onRemove: (id: string) => void;
}) {
  return (
    <View style={styles.clipListWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {clips.map((clip) => (
          <View key={clip.id} style={styles.clipCard}>
            <View style={styles.clipThumb}>
              <Text style={styles.clipThumbIcon}>▶</Text>
            </View>
            <Text style={styles.clipName} numberOfLines={1}>{clip.name}</Text>
            <Text style={styles.clipDuration}>{clip.duration}</Text>
            <TouchableOpacity
              style={styles.clipRemove}
              onPress={() => onRemove(clip.id)}
            >
              <Text style={styles.clipRemoveText}>×</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/** Prompt text input area */
function PromptSection({
  prompt,
  onPromptChange,
}: {
  prompt: string;
  onPromptChange: (text: string) => void;
}) {
  return (
    <View style={styles.promptWrap}>
      <Text style={styles.sectionLabel}>Describe your edit</Text>
      <TextInput
        style={styles.promptInput}
        value={prompt}
        onChangeText={onPromptChange}
        placeholder="e.g. Add cinematic transitions, remove dead air, add subtitles with white text..."
        placeholderTextColor={COLORS.textMuted}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
      />
      <Text style={styles.promptHint}>
        {prompt.length}/500 characters
      </Text>
    </View>
  );
}

/** Quick prompt suggestion pills */
function QuickPrompts({ onSelect }: { onSelect: (text: string) => void }) {
  return (
    <View style={styles.quickWrap}>
      <Text style={styles.sectionLabel}>Quick prompts</Text>
      <View style={styles.pillRow}>
        {QUICK_PROMPTS.map((label) => (
          <TouchableOpacity
            key={label}
            style={styles.pill}
            onPress={() => onSelect(label)}
            activeOpacity={0.7}
          >
            <Text style={styles.pillText}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

/** Gradient generate button */
function GenerateButton({
  onPress,
  disabled,
  isGenerating,
}: {
  onPress: () => void;
  disabled: boolean;
  isGenerating: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={styles.generateWrap}
    >
      <LinearGradient
        colors={
          disabled
            ? [COLORS.surface, COLORS.surfaceBorder]
            : [COLORS.gradientStart, COLORS.gradientEnd]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.generateBtn}
      >
        <Text style={[styles.generateText, disabled && styles.generateTextDisabled]}>
          {isGenerating ? "Generating..." : "✦  Generate Edit"}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xxl + 16,
    paddingBottom: 100, // clear floating navbar
  },

  // Header
  header: {
    alignItems: "center",
    marginBottom: SPACING.xl,
  },
  logoBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: SPACING.md,
  },
  brand: {
    fontSize: 28,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
    letterSpacing: 2,
    textTransform: "uppercase",
  },

  // Upload zone
  uploadZone: {
    borderWidth: 2,
    borderColor: COLORS.surfaceBorder,
    borderStyle: "dashed",
    borderRadius: RADII.lg,
    backgroundColor: COLORS.uploadBg,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: SPACING.xl,
    marginBottom: SPACING.lg,
  },
  uploadIconWrap: {
    width: 56,
    height: 56,
    borderRadius: RADII.full,
    backgroundColor: COLORS.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  uploadIcon: {
    fontSize: 28,
    fontWeight: "300",
    color: COLORS.primaryLight,
  },
  uploadTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  uploadSubtext: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  clipBadge: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.accentDim,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
  },
  clipBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.accent,
  },

  // Clip list
  clipListWrap: {
    marginBottom: SPACING.lg,
  },
  clipCard: {
    width: 110,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    padding: SPACING.sm,
    marginRight: SPACING.sm,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
  },
  clipThumb: {
    width: "100%",
    height: 60,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: RADII.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
  },
  clipThumbIcon: {
    fontSize: 18,
    color: COLORS.primaryLight,
  },
  clipName: {
    fontSize: 11,
    color: COLORS.text,
    fontWeight: "500",
    width: "100%",
  },
  clipDuration: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  clipRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.error,
    alignItems: "center",
    justifyContent: "center",
  },
  clipRemoveText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },

  // Prompt
  promptWrap: {
    marginBottom: SPACING.lg,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.textSecondary,
    marginBottom: SPACING.sm,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  promptInput: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    borderRadius: RADII.md,
    padding: SPACING.md,
    fontSize: 15,
    color: COLORS.text,
    minHeight: 110,
  },
  promptHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: "right",
    marginTop: SPACING.xs,
  },

  // Quick prompts
  quickWrap: {
    marginBottom: SPACING.xl,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
  },
  pill: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  pillText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: "500",
  },

  // Generate
  generateWrap: {
    marginTop: SPACING.sm,
  },
  generateBtn: {
    borderRadius: RADII.lg,
    paddingVertical: SPACING.lg,
    alignItems: "center",
  },
  generateText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.3,
  },
  generateTextDisabled: {
    color: COLORS.textMuted,
  },

  // Saved-to-library success banner
  savedBanner: {
    position: "absolute",
    top: 60,
    alignSelf: "center",
    backgroundColor: COLORS.accent,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    zIndex: 100,
  },
  savedBannerText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
});
