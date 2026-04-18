/**
 * AIEditScreen — upload clips, describe the edit, and generate a Remotion plan.
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
import { Video, ResizeMode } from "expo-av";
import { LinearGradient } from "expo-linear-gradient";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { getThumbnailAsync } from "expo-video-thumbnails";
import { COLORS, RADII, SPACING } from "../constants/theme";
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
  duration: string;
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

export default function AIEditScreen() {
  const [prompt, setPrompt] = useState("");
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [composition, setComposition] = useState<CompositionResult | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSavedBanner, setShowSavedBanner] = useState(false);

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
        const thumbResult = await getThumbnailAsync(asset.uri, {
          quality: 0.25,
          time: secs * 500,
        });
        thumbnail = thumbResult.uri;
      } catch {}

      newClips.push({
        id: asset.assetId ?? `${Date.now()}-${i}`,
        name: asset.fileName ?? `clip_${clips.length + i + 1}.mp4`,
        duration: formatDuration(secs),
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
    if (!prompt.trim() || clips.length === 0) return;

    setIsGenerating(true);
    setComposition(null);
    setError(null);

    try {
      const clipPayload = await Promise.all(
        clips.map(async (clip) => ({
          name: clip.name,
          duration: clip.durationSecs,
          uri: clip.uri,
          thumbnail: await readThumbnailDataUrl(clip.thumbnail),
        }))
      );

      const result = await processEdit(prompt, clipPayload);
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

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[COLORS.background, COLORS.uploadBg, COLORS.background]}
        style={StyleSheet.absoluteFill}
      />

      {showSavedBanner && (
        <View style={styles.savedBanner}>
          <Text style={styles.savedBannerText}>Clip saved to library</Text>
        </View>
      )}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Header />
        <UploadZone clipCount={clips.length} onUpload={handleUpload} />
        {clips.length > 0 && <ClipList clips={clips} onRemove={handleRemoveClip} />}
        <PromptSection prompt={prompt} onPromptChange={setPrompt} />
        <QuickPrompts
          onSelect={(text) => setPrompt((value) => (value ? `${value}, ${text.toLowerCase()}` : text))}
        />
        <GenerateButton
          onPress={handleGenerate}
          disabled={!prompt.trim() || clips.length === 0 || isGenerating}
          isGenerating={isGenerating}
        />
        {isGenerating && <LoadingIndicator />}
        {error && <ErrorBanner message={error} />}
        {composition && <CompositionCard composition={composition} previewUri={previewUri} />}
      </ScrollView>
    </View>
  );
}

async function readThumbnailDataUrl(uri: string | null) {
  if (!uri) return undefined;

  try {
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: "base64" });
    return `data:image/jpeg;base64,${base64.slice(0, 120000)}`;
  } catch {
    return undefined;
  }
}

function formatDuration(secs: number) {
  const minutes = Math.floor(secs / 60);
  const seconds = Math.floor(secs % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function Header() {
  return (
    <View style={styles.header}>
      <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientEnd]} style={styles.logoBar} />
      <Text style={styles.brand}>Stream Mind</Text>
      <Text style={styles.tagline}>AI Video Editor</Text>
    </View>
  );
}

function UploadZone({ clipCount, onUpload }: { clipCount: number; onUpload: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onUpload} style={styles.uploadZone}>
      <View style={styles.uploadIconWrap}>
        <Text style={styles.uploadIcon}>+</Text>
      </View>
      <Text style={styles.uploadTitle}>Upload Video Clips</Text>
      <Text style={styles.uploadSubtext}>MP4, MOV, AVI — up to 2GB per clip</Text>
      {clipCount > 0 && (
        <View style={styles.clipBadge}>
          <Text style={styles.clipBadgeText}>{clipCount} clip{clipCount !== 1 ? "s" : ""} selected</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function ClipList({ clips, onRemove }: { clips: VideoClip[]; onRemove: (id: string) => void }) {
  return (
    <View style={styles.clipListWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {clips.map((clip) => (
          <View key={clip.id} style={styles.clipCard}>
            <View style={styles.clipThumb}>
              {clip.thumbnail ? (
                <Image source={{ uri: clip.thumbnail }} style={styles.clipThumbImg} resizeMode="cover" />
              ) : (
                <Text style={styles.clipThumbIcon}>▶</Text>
              )}
            </View>
            <Text numberOfLines={1} style={styles.clipName}>{clip.name}</Text>
            <Text style={styles.clipDuration}>{clip.duration}</Text>
            <TouchableOpacity onPress={() => onRemove(clip.id)} style={styles.clipRemove}>
              <Text style={styles.clipRemoveText}>×</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function PromptSection({ prompt, onPromptChange }: { prompt: string; onPromptChange: (text: string) => void }) {
  return (
    <View style={styles.promptWrap}>
      <Text style={styles.sectionLabel}>Describe your edit</Text>
      <TextInput
        multiline
        numberOfLines={4}
        onChangeText={onPromptChange}
        placeholder="e.g. Add cinematic transitions, remove dead air, add subtitles..."
        placeholderTextColor={COLORS.textMuted}
        style={styles.promptInput}
        textAlignVertical="top"
        value={prompt}
      />
      <Text style={styles.promptHint}>{prompt.length}/500 characters</Text>
    </View>
  );
}

function QuickPrompts({ onSelect }: { onSelect: (text: string) => void }) {
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
    <TouchableOpacity activeOpacity={0.8} disabled={disabled} onPress={onPress} style={styles.generateWrap}>
      <LinearGradient
        colors={disabled ? [COLORS.surface, COLORS.surfaceBorder] : [COLORS.gradientStart, COLORS.gradientEnd]}
        style={styles.generateBtn}
      >
        <Text style={[styles.generateText, disabled && styles.generateTextDisabled]}>
          {isGenerating ? "Generating..." : "Generate Edit"}
        </Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

function LoadingIndicator() {
  return (
    <View style={styles.loadingWrap}>
      <ActivityIndicator size="large" color={COLORS.primaryLight} />
      <Text style={styles.loadingText}>Processing video — this may take a moment...</Text>
    </View>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.errorWrap}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

function CompositionCard({ composition, previewUri }: { composition: CompositionResult; previewUri: string | null }) {
  const totalSecs = Math.round(composition.totalDurationFrames / composition.fps);

  return (
    <View style={styles.resultWrap}>
      {previewUri && (
        <Video
          source={{ uri: previewUri }}
          style={styles.videoPreview}
          resizeMode={ResizeMode.CONTAIN}
          useNativeControls
          shouldPlay={false}
        />
      )}
      <LinearGradient colors={[COLORS.surface, COLORS.surfaceLight]} style={styles.resultCard}>
        <Text style={styles.resultTitle}>Edit Generated</Text>
        <Row label="Resolution" value={`${composition.width}×${composition.height}`} />
        <Row label="FPS" value={String(composition.fps)} />
        <Row label="Duration" value={`${totalSecs}s`} />
        <Row label="Clips" value={String(composition.clips.length)} />
        <Row
          label="Transitions"
          value={composition.transitions.length ? composition.transitions.map((item) => item.type).join(", ") : "None"}
        />
        <Row label="Overlays" value={String(composition.overlays.length)} />
      </LinearGradient>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.resultRow}>
      <Text style={styles.resultLabel}>{label}</Text>
      <Text style={styles.resultValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xxl + 16,
    paddingBottom: 100,
  },
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
  savedBannerText: { color: COLORS.white, fontWeight: "700", fontSize: 14 },
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
  clipThumb: { width: "100%", height: 60, backgroundColor: COLORS.surfaceLight, borderRadius: RADII.sm, alignItems: "center", justifyContent: "center", marginBottom: SPACING.sm, overflow: "hidden" },
  clipThumbImg: { width: "100%", height: "100%", borderRadius: RADII.sm },
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
  loadingWrap: { alignItems: "center", marginTop: SPACING.xl },
  loadingText: { color: COLORS.textSecondary, marginTop: SPACING.md, fontSize: 14 },
  errorWrap: { backgroundColor: "#EF444422", borderRadius: RADII.md, padding: SPACING.md, marginTop: SPACING.lg, borderWidth: 1, borderColor: "#EF444444" },
  errorText: { color: COLORS.error, fontSize: 14 },
  videoPreview: { width: "100%", height: 220, borderRadius: RADII.lg, backgroundColor: "#000", marginBottom: SPACING.md },
  resultWrap: { marginTop: SPACING.xl },
  resultCard: { borderRadius: RADII.lg, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.primaryDark },
  resultTitle: { fontSize: 18, fontWeight: "700", color: COLORS.accent, marginBottom: SPACING.md },
  resultRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: SPACING.xs, borderBottomWidth: 1, borderBottomColor: COLORS.surfaceBorder },
  resultLabel: { fontSize: 14, color: COLORS.textSecondary },
  resultValue: { fontSize: 14, color: COLORS.text, fontWeight: "600" },
});
