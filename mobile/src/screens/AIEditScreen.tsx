/**
 * AIEditScreen — XHS dark-mode edit screen with real video upload.
 * Flat black surfaces, coral accent, system font via WEIGHTS.
 * Uploads actual video files via processEdit → /api/process.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { LinearGradient } from "expo-linear-gradient";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { getThumbnailAsync } from "expo-video-thumbnails";
import { COLORS, FONT_SIZES, RADII, SPACING, WEIGHTS } from "../constants/theme";
import { processEdit } from "../services/api";

const QUICK_PROMPTS = [
  "Add subtitles",
  "Remove silence",
  "Add transitions",
  "Color grade",
  "Add music",
  "Zoom on action",
];

interface VideoClip {
  id: string;
  name: string;
  /** Formatted display string e.g. "3:47" */
  duration: string;
  /** Duration in seconds — backend /api/process expects a number */
  durationSecs: number;
  thumbnail: string | null;
  uri: string;
}

interface CompositionResult {
  fps: number;
  width: number;
  height: number;
  totalDurationFrames: number;
  clips: { id: string; name: string; duration: number; trimStart?: number; trimEnd?: number }[];
  transitions: { type: string; durationFrames: number }[];
  overlays: { content: string; startFrame: number; endFrame: number }[];
  audio: { volume: number };
}

/** Formats seconds into "m:ss" display string */
const fmtDuration = (secs: number) =>
  `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, "0")}`;

/** Reads a local thumbnail URI and returns a truncated base64 data URL for the API */
async function readThumbnailDataUrl(uri: string | null) {
  if (!uri) return undefined;
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
    return `data:image/jpeg;base64,${base64.slice(0, 120000)}`;
  } catch {
    return undefined;
  }
}

export default function AIEditScreen() {
  const [prompt, setPrompt] = useState("");
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [composition, setComposition] = useState<CompositionResult | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSavedBanner, setShowSavedBanner] = useState(false);
  const [activeQuick, setActiveQuick] = useState<string | null>(null);
  const [trimStart, setTrimStart] = useState("");
  const [trimEnd, setTrimEnd] = useState("");

  const handleUpload = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission required", "Please allow access to your photo library to upload clips.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (result.canceled) return;

    const newClips: VideoClip[] = [];
    for (let i = 0; i < result.assets.length; i += 1) {
      const asset = result.assets[i];
      const secs = (asset.duration ?? 0) / 1000;
      let thumbnail: string | null = null;

      try {
        const thumbResult = await getThumbnailAsync(asset.uri, { quality: 0.25, time: secs * 500 });
        thumbnail = thumbResult.uri;
      } catch {}

      newClips.push({
        id: asset.assetId ?? `${Date.now()}-${i}`,
        name: asset.fileName ?? `clip_${clips.length + i + 1}.mp4`,
        duration: fmtDuration(secs),
        durationSecs: secs,
        thumbnail,
        uri: asset.uri,
      });
    }

    setClips((prev) => [...prev, ...newClips]);
    setComposition(null);
    setError(null);
  };

  const handleRemoveClip = (id: string) => {
    setClips((prev) => prev.filter((clip) => clip.id !== id));
    setComposition(null);
  };

  const handleGenerate = async () => {
    const canClip = activeQuick === "Clip" && (trimStart !== "" || trimEnd !== "");
    if ((!prompt.trim() && !canClip) || clips.length === 0) return;

    setIsGenerating(true);
    setComposition(null);
    setError(null);

    try {
      const trimStartSec = activeQuick === "Clip" && trimStart !== "" ? parseFloat(trimStart) : undefined;
      const trimEndSec = activeQuick === "Clip" && trimEnd !== "" ? parseFloat(trimEnd) : undefined;

      const effectivePrompt = activeQuick === "Clip"
        ? `Clip the video${trimStartSec !== undefined ? ` from ${trimStartSec}s` : ""}${trimEndSec !== undefined ? ` to ${trimEndSec}s` : ""}${prompt.trim() ? `, ${prompt.trim()}` : ""}`
        : prompt;

      const clipPayload = await Promise.all(
        clips.map(async (clip) => ({
          name: clip.name,
          duration: clip.durationSecs,
          uri: clip.uri,
          thumbnail: await readThumbnailDataUrl(clip.thumbnail),
          trimStart: trimStartSec,
          trimEnd: trimEndSec !== undefined ? trimEndSec : (trimStartSec !== undefined ? clip.durationSecs : undefined),
        }))
      );

      const result = await processEdit(effectivePrompt, clipPayload);
      setComposition(result.composition as CompositionResult);
      setPreviewUri(result.videoUrl);
      if (result.clipId) {
        setShowSavedBanner(true);
        setTimeout(() => setShowSavedBanner(false), 2500);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not generate edit";
      setError(message);
      Alert.alert("Edit failed", message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleQuickPress = (label: string) => {
    setActiveQuick(label);
    if (label === "Clip") {
      // Don't append to prompt — trim range will be injected at generate time
      return;
    }
    setPrompt((p) => (p ? `${p}, ${label.toLowerCase()}` : label));
  };

  return (
    <View style={styles.root}>
      {/* "Clip saved" toast */}
      {showSavedBanner && (
        <View style={styles.savedBanner}>
          <Text style={styles.savedBannerText}>Clip saved to library</Text>
        </View>
      )}

      {/* Header — mirrors HomeScreen layout */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn}>
          <Text style={styles.iconText}>☰</Text>
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>Edit</Text>
          <View style={styles.titleUnderline} />
        </View>
        <TouchableOpacity style={styles.iconBtn}>
          <Text style={styles.iconText}>⌕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Upload zone — flat dark card */}
        <TouchableOpacity onPress={handleUpload} activeOpacity={0.85} style={styles.uploadCard}>
          <View style={styles.uploadPlus}>
            <Text style={styles.uploadPlusText}>+</Text>
          </View>
          <Text style={styles.uploadTitle}>Upload Video Clips</Text>
          <Text style={styles.uploadSub}>MP4, MOV, AVI — up to 2GB per clip</Text>
          {clips.length > 0 && (
            <View style={styles.clipBadge}>
              <Text style={styles.clipBadgeText}>
                {clips.length} clip{clips.length !== 1 ? "s" : ""} selected
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Horizontal clip strip with thumbnails */}
        {clips.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.clipRow}
            contentContainerStyle={styles.clipRowContent}
          >
            {clips.map((clip) => (
              <View key={clip.id} style={styles.clipCard}>
                <View style={styles.clipThumb}>
                  {clip.thumbnail ? (
                    <Image
                      source={{ uri: clip.thumbnail }}
                      style={styles.clipThumbImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.clipThumbIcon}>▶</Text>
                  )}
                </View>
                <Text style={styles.clipName} numberOfLines={1}>{clip.name}</Text>
                <Text style={styles.clipDuration}>{clip.duration}</Text>
                <TouchableOpacity style={styles.clipRemove} onPress={() => handleRemoveClip(clip.id)}>
                  <Text style={styles.clipRemoveText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Prompt input */}
        <Text style={styles.sectionLabel}>Describe your edit</Text>
        <TextInput
          style={styles.promptInput}
          value={prompt}
          onChangeText={setPrompt}
          placeholder="e.g. Add cinematic transitions, remove dead air, add subtitles…"
          placeholderTextColor={COLORS.textMuted}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        <Text style={styles.promptHint}>{prompt.length}/500 characters</Text>

        {/* Quick prompt chips — XHS flat style, weight-only active state */}
        <Text style={styles.sectionLabel}>Quick prompts</Text>
        <View style={styles.chipWrap}>
          {QUICK_PROMPTS.map((label) => (
            <TouchableOpacity
              key={label}
              style={styles.chip}
              onPress={() => handleQuickPress(label)}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, activeQuick === label && styles.chipTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Trim range inputs — shown when "Clip" quick prompt is active */}
        {activeQuick === "Clip" && (
          <View style={styles.trimWrap}>
            <Text style={styles.sectionLabel}>Trim range (seconds)</Text>
            <View style={styles.trimRow}>
              <View style={styles.trimField}>
                <Text style={styles.trimLabel}>Start</Text>
                <TextInput
                  style={styles.trimInput}
                  value={trimStart}
                  onChangeText={setTrimStart}
                  placeholder="0"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>
              <Text style={styles.trimDash}>→</Text>
              <View style={styles.trimField}>
                <Text style={styles.trimLabel}>End</Text>
                <TextInput
                  style={styles.trimInput}
                  value={trimEnd}
                  onChangeText={setTrimEnd}
                  placeholder={clips[0] ? String(Math.floor(clips[0].durationSecs)) : "end"}
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </View>
        )}

        {/* Generate button — solid coral pill */}
        <TouchableOpacity
          style={[
            styles.generateBtn,
            ((!prompt.trim() && !(activeQuick === "Clip" && (trimStart !== "" || trimEnd !== ""))) || clips.length === 0 || isGenerating) && styles.generateBtnDisabled,
          ]}
          onPress={handleGenerate}
          disabled={(!prompt.trim() && !(activeQuick === "Clip" && (trimStart !== "" || trimEnd !== ""))) || clips.length === 0 || isGenerating}
          activeOpacity={0.85}
        >
          <Text style={styles.generateText}>
            {isGenerating ? "Generating…" : "Generate Edit"}
          </Text>
        </TouchableOpacity>

        {isGenerating && (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Processing video — this may take a moment…</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {composition && <CompositionCard composition={composition} previewUri={previewUri} />}
      </ScrollView>
    </View>
  );
}

/** Shows generated edit metadata and optional video preview */
function CompositionCard({
  composition,
  previewUri,
}: {
  composition: CompositionResult;
  previewUri: string | null;
}) {
  const totalSecs = Math.round(composition.totalDurationFrames / composition.fps);
  const player = useVideoPlayer(previewUri);

  return (
    <View style={styles.resultWrap}>
      {previewUri && (
        <VideoView
          player={player}
          style={styles.videoPreview}
          contentFit="contain"
          nativeControls
        />
      )}
      <LinearGradient colors={[COLORS.surface, COLORS.surfaceLight]} style={styles.resultCard}>
        <Text style={styles.resultTitle}>Edit Generated</Text>
        <ResultRow label="Resolution" value={`${composition.width}×${composition.height}`} />
        <ResultRow label="FPS" value={String(composition.fps)} />
        <ResultRow label="Duration" value={`${totalSecs}s`} />
        <ResultRow label="Clips" value={String(composition.clips.length)} />
        <ResultRow
          label="Transitions"
          value={composition.transitions.length ? composition.transitions.map((t) => t.type).join(", ") : "None"}
        />
        <ResultRow label="Overlays" value={String(composition.overlays.length)} />
      </LinearGradient>
    </View>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.resultRow}>
      <Text style={styles.resultLabel}>{label}</Text>
      <Text style={styles.resultValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  savedBanner: {
    position: "absolute",
    top: 60,
    alignSelf: "center",
    backgroundColor: COLORS.primary,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    zIndex: 100,
  },
  savedBannerText: { color: "#FFFFFF", fontWeight: WEIGHTS.bold, fontSize: FONT_SIZES.sm },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: SPACING.xxl + 16,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    gap: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
  },
  iconBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  iconText: { fontSize: 20, color: COLORS.text, fontWeight: WEIGHTS.regular },
  titleWrap: { flex: 1, alignItems: "center" },
  title: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: WEIGHTS.bold },
  titleUnderline: { marginTop: 4, width: 20, height: 2, borderRadius: 1, backgroundColor: COLORS.primary },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: 140 },

  uploadCard: {
    borderRadius: RADII.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingVertical: SPACING.xl + 8,
    paddingHorizontal: SPACING.lg,
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  uploadPlus: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.md,
  },
  uploadPlusText: { fontSize: 28, color: COLORS.primary, fontWeight: WEIGHTS.light, lineHeight: 32 },
  uploadTitle: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: WEIGHTS.semibold, marginBottom: 4 },
  uploadSub: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, fontWeight: WEIGHTS.regular },
  clipBadge: {
    marginTop: SPACING.md,
    backgroundColor: COLORS.primary,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
  },
  clipBadgeText: { fontSize: FONT_SIZES.xs + 1, color: "#FFFFFF", fontWeight: WEIGHTS.bold, letterSpacing: 0.4 },

  clipRow: { marginBottom: SPACING.lg },
  clipRowContent: { gap: SPACING.sm },
  clipCard: {
    width: 110,
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    padding: SPACING.sm,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  clipThumb: {
    width: "100%",
    height: 64,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: RADII.sm,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.sm,
    overflow: "hidden",
  },
  clipThumbImg: { width: "100%", height: "100%", borderRadius: RADII.sm },
  clipThumbIcon: { fontSize: 18, color: COLORS.primary },
  clipName: { fontSize: 11, color: COLORS.text, fontWeight: WEIGHTS.medium, width: "100%" },
  clipDuration: { fontSize: 10, color: COLORS.textMuted, fontWeight: WEIGHTS.regular, marginTop: 2 },
  clipRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  clipRemoveText: { color: "#FFFFFF", fontSize: 14, fontWeight: WEIGHTS.bold, lineHeight: 16 },

  sectionLabel: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: WEIGHTS.bold,
    marginBottom: SPACING.sm,
    marginTop: SPACING.sm,
  },

  promptInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: WEIGHTS.regular,
    minHeight: 110,
  },
  promptHint: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontWeight: WEIGHTS.regular,
    textAlign: "right",
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
  },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.md, marginBottom: SPACING.xl },
  chip: { paddingVertical: SPACING.xs },
  chipText: { fontSize: FONT_SIZES.md, color: COLORS.textMuted, fontWeight: WEIGHTS.medium },
  chipTextActive: { color: COLORS.text, fontWeight: WEIGHTS.bold },

  trimWrap: { marginBottom: SPACING.lg },
  trimRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md },
  trimField: { flex: 1 },
  trimLabel: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginBottom: 4 },
  trimInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    padding: SPACING.md,
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    textAlign: "center",
  },
  trimDash: { fontSize: FONT_SIZES.lg, color: COLORS.textMuted, marginTop: 18 },

  generateBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADII.full,
    paddingVertical: SPACING.md + 2,
    alignItems: "center",
    marginTop: SPACING.sm,
  },
  generateBtnDisabled: { backgroundColor: COLORS.surfaceLight },
  generateText: { fontSize: FONT_SIZES.lg, color: "#FFFFFF", fontWeight: WEIGHTS.bold, letterSpacing: 0.3 },

  loadingWrap: { alignItems: "center", marginTop: SPACING.xl },
  loadingText: { color: COLORS.textSecondary, marginTop: SPACING.md, fontSize: FONT_SIZES.sm },

  errorWrap: {
    backgroundColor: "rgba(255,36,66,0.13)",
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginTop: SPACING.lg,
    borderWidth: 1,
    borderColor: "rgba(255,36,66,0.3)",
  },
  errorText: { color: COLORS.error, fontSize: FONT_SIZES.md },

  videoPreview: { width: "100%", height: 220, borderRadius: RADII.lg, backgroundColor: "#000", marginBottom: SPACING.md },
  resultWrap: { marginTop: SPACING.xl },
  resultCard: { borderRadius: RADII.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.primaryDark },
  resultTitle: { fontSize: FONT_SIZES.xl, fontWeight: WEIGHTS.heavy, color: COLORS.primary, marginBottom: SPACING.md },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: SPACING.xs,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  resultLabel: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary },
  resultValue: { fontSize: FONT_SIZES.md, color: COLORS.text, fontWeight: WEIGHTS.semibold },
});
