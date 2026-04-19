/**
 * AIEditScreen — Premium XHS dark-mode video editing interface.
 * Flat cards, gradient CTA, pill chips, shimmer loading.
 * Uploads actual video files via processEdit → /api/process.
 */
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { LinearGradient } from "expo-linear-gradient";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { getThumbnailAsync } from "expo-video-thumbnails";
import { COLORS, FONT_SIZES, RADII, SPACING, WEIGHTS, SHADOWS } from "../constants/theme";
import { processEdit } from "../services/api";

const QUICK_PROMPTS = ["Add subtitles", "Remove silence", "Add transitions", "Color grade", "Add music", "Zoom on action"];
interface VideoClip { id: string; name: string; duration: string; durationSecs: number; thumbnail: string | null; uri: string }
interface CompositionResult {
  fps: number; width: number; height: number; totalDurationFrames: number;
  clips: { id: string; name: string; duration: number; trimStart?: number; trimEnd?: number }[];
  transitions: { type: string; durationFrames: number }[];
  overlays: { content: string; startFrame: number; endFrame: number }[];
  audio: { volume: number };
}
const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
async function readThumbnailDataUrl(uri: string | null) {
  if (!uri) return undefined;
  try { return `data:image/jpeg;base64,${(await FileSystem.readAsStringAsync(uri, { encoding: "base64" })).slice(0, 120000)}`; }
  catch { return undefined; }
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
  const shimmer = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    if (!isGenerating) return;
    const a = Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { toValue: 1, duration: 900, useNativeDriver: true }),
      Animated.timing(shimmer, { toValue: 0.3, duration: 900, useNativeDriver: true }),
    ]));
    a.start(); return () => a.stop();
  }, [isGenerating]);

  const handleUpload = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission required", "Please allow photo library access."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["videos"], allowsMultipleSelection: true, quality: 1 });
    if (result.canceled) return;
    const nc: VideoClip[] = [];
    for (let i = 0; i < result.assets.length; i += 1) {
      const a = result.assets[i], secs = (a.duration ?? 0) / 1000;
      let thumb: string | null = null;
      try { thumb = (await getThumbnailAsync(a.uri, { quality: 0.25, time: secs * 500 })).uri; } catch {}
      nc.push({ id: a.assetId ?? `${Date.now()}-${i}`, name: a.fileName ?? `clip_${clips.length + i + 1}.mp4`, duration: fmtDuration(secs), durationSecs: secs, thumbnail: thumb, uri: a.uri });
    }
    setClips((p) => [...p, ...nc]); setComposition(null); setError(null);
  };
  const handleRemoveClip = (id: string) => { setClips((p) => p.filter((c) => c.id !== id)); setComposition(null); };
  const handleGenerate = async () => {
    const canClip = activeQuick === "Clip" && (trimStart !== "" || trimEnd !== "");
    if ((!prompt.trim() && !canClip) || clips.length === 0) return;
    setIsGenerating(true); setComposition(null); setError(null);
    try {
      const ts = activeQuick === "Clip" && trimStart !== "" ? parseFloat(trimStart) : undefined;
      const te = activeQuick === "Clip" && trimEnd !== "" ? parseFloat(trimEnd) : undefined;
      const ep = activeQuick === "Clip" ? `Clip the video${ts !== undefined ? ` from ${ts}s` : ""}${te !== undefined ? ` to ${te}s` : ""}${prompt.trim() ? `, ${prompt.trim()}` : ""}` : prompt;
      const cp = await Promise.all(clips.map(async (c) => ({ name: c.name, duration: c.durationSecs, uri: c.uri, thumbnail: await readThumbnailDataUrl(c.thumbnail), trimStart: ts, trimEnd: te ?? (ts !== undefined ? c.durationSecs : undefined) })));
      const r = await processEdit(ep, cp);
      setComposition(r.composition as CompositionResult); setPreviewUri(r.videoUrl);
      if (r.clipId) { setShowSavedBanner(true); setTimeout(() => setShowSavedBanner(false), 2500); }
    } catch (e: unknown) { const m = e instanceof Error ? e.message : "Could not generate edit"; setError(m); Alert.alert("Edit failed", m); }
    finally { setIsGenerating(false); }
  };
  const handleQuickPress = (label: string) => { setActiveQuick(label); if (label !== "Clip") setPrompt((p) => (p ? `${p}, ${label.toLowerCase()}` : label)); };
  const disabled = (!prompt.trim() && !(activeQuick === "Clip" && (trimStart !== "" || trimEnd !== ""))) || clips.length === 0 || isGenerating;

  return (
    <View style={s.root}>
      {showSavedBanner && <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientEnd]} style={s.banner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}><Text style={s.bannerText}>Clip saved to library</Text></LinearGradient>}
      <View style={s.header}>
        <TouchableOpacity style={s.iconBtn}><Text style={s.iconText}>☰</Text></TouchableOpacity>
        <View style={s.titleWrap}><Text style={s.title}>Edit</Text><View style={s.titleDot} /></View>
        <TouchableOpacity style={s.iconBtn}><Text style={s.iconText}>⌕</Text></TouchableOpacity>
      </View>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={handleUpload} activeOpacity={0.85} style={s.uploadCard}>
          <View style={s.uploadPlus}><Text style={s.uploadPlusText}>+</Text></View>
          <Text style={s.uploadTitle}>Upload Video Clips</Text>
          <Text style={s.uploadSub}>MP4, MOV, AVI — up to 2GB per clip</Text>
          {clips.length > 0 && <View style={s.clipBadge}><Text style={s.clipBadgeText}>{clips.length} clip{clips.length !== 1 ? "s" : ""} selected</Text></View>}
        </TouchableOpacity>
        {clips.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.clipRow} contentContainerStyle={s.clipRowContent}>
            {clips.map((clip) => (
              <View key={clip.id} style={s.clipCard}>
                <View style={s.clipThumb}>{clip.thumbnail ? <Image source={{ uri: clip.thumbnail }} style={s.clipThumbImg} resizeMode="cover" /> : <Text style={s.clipThumbIcon}>▶</Text>}</View>
                <Text style={s.clipName} numberOfLines={1}>{clip.name}</Text><Text style={s.clipDur}>{clip.duration}</Text>
                <TouchableOpacity style={s.clipRm} onPress={() => handleRemoveClip(clip.id)}><Text style={s.clipRmText}>×</Text></TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
        <Text style={s.sectionLabel}>DESCRIBE YOUR EDIT</Text>
        <TextInput style={s.promptInput} value={prompt} onChangeText={setPrompt} placeholder="e.g. Add cinematic transitions, remove dead air, add subtitles…" placeholderTextColor={COLORS.textMuted} multiline numberOfLines={4} textAlignVertical="top" />
        <Text style={s.promptHint}>{prompt.length}/500</Text>
        <Text style={s.sectionLabel}>QUICK PROMPTS</Text>
        <View style={s.chipWrap}>{QUICK_PROMPTS.map((label) => (
          <TouchableOpacity key={label} style={[s.chip, activeQuick === label && s.chipActive]} onPress={() => handleQuickPress(label)} activeOpacity={0.7}>
            <Text style={[s.chipText, activeQuick === label && s.chipTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}</View>
        {activeQuick === "Clip" && <View style={s.trimWrap}><Text style={s.sectionLabel}>TRIM RANGE (SECONDS)</Text>
          <View style={s.trimRow}>
            <View style={s.trimField}><Text style={s.trimLabel}>Start</Text><TextInput style={s.trimInput} value={trimStart} onChangeText={setTrimStart} placeholder="0" placeholderTextColor={COLORS.textMuted} keyboardType="decimal-pad" /></View>
            <Text style={s.trimDash}>→</Text>
            <View style={s.trimField}><Text style={s.trimLabel}>End</Text><TextInput style={s.trimInput} value={trimEnd} onChangeText={setTrimEnd} placeholder={clips[0] ? String(Math.floor(clips[0].durationSecs)) : "end"} placeholderTextColor={COLORS.textMuted} keyboardType="decimal-pad" /></View>
          </View></View>}
        <TouchableOpacity onPress={handleGenerate} disabled={disabled} activeOpacity={0.85}>
          <LinearGradient colors={disabled ? [COLORS.surfaceLight, COLORS.surfaceLight] : [COLORS.gradientStart, COLORS.gradientEnd]} style={s.genBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Text style={s.genText}>{isGenerating ? "Generating…" : "Generate Edit"}</Text></LinearGradient>
        </TouchableOpacity>
        {isGenerating && <View style={s.loadingWrap}><Animated.View style={[s.shimmerBar, { opacity: shimmer }]} /><ActivityIndicator size="large" color={COLORS.primary} /><Text style={s.loadingText}>Processing video — this may take a moment…</Text></View>}
        {error && <View style={s.errorWrap}><Text style={s.errorText}>{error}</Text></View>}
        {composition && <CompositionCard composition={composition} previewUri={previewUri} />}
      </ScrollView>
    </View>
  );
}

function CompositionCard({ composition, previewUri }: { composition: CompositionResult; previewUri: string | null }) {
  const totalSecs = Math.round(composition.totalDurationFrames / composition.fps);
  const player = useVideoPlayer(previewUri);
  return (
    <View style={s.resultWrap}>
      {previewUri && <VideoView player={player} style={s.videoPreview} contentFit="contain" nativeControls />}
      <LinearGradient colors={[COLORS.surface, COLORS.surfaceElevated]} style={s.resultCard}>
        <Text style={s.resultTitle}>Edit Generated</Text>
        <ResultRow label="Resolution" value={`${composition.width}×${composition.height}`} />
        <ResultRow label="FPS" value={String(composition.fps)} /> <ResultRow label="Duration" value={`${totalSecs}s`} />
        <ResultRow label="Clips" value={String(composition.clips.length)} />
        <ResultRow label="Transitions" value={composition.transitions.length ? composition.transitions.map((t) => t.type).join(", ") : "None"} />
        <ResultRow label="Overlays" value={String(composition.overlays.length)} />
      </LinearGradient>
    </View>
  );
}
function ResultRow({ label, value }: { label: string; value: string }) {
  return <View style={s.resultRow}><Text style={s.resultLabel}>{label}</Text><Text style={s.resultValue}>{value}</Text></View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  banner: { position: "absolute", top: 60, alignSelf: "center", borderRadius: RADII.full, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, zIndex: 100 },
  bannerText: { color: "#FFF", fontWeight: "700", fontSize: FONT_SIZES.sm },
  header: { flexDirection: "row", alignItems: "center", paddingTop: SPACING.xxl + 16, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, gap: SPACING.md },
  iconBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" }, iconText: { fontSize: 20, color: COLORS.text },
  titleWrap: { flex: 1, alignItems: "center" }, title: { fontSize: FONT_SIZES.hero, color: COLORS.text, fontWeight: "700" },
  titleDot: { marginTop: 4, width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary },
  scroll: { flex: 1 }, scrollContent: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: 140 },
  uploadCard: { borderRadius: RADII.md, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLight, paddingVertical: SPACING.xl + 8, paddingHorizontal: SPACING.lg, alignItems: "center", marginBottom: SPACING.lg, ...SHADOWS.card },
  uploadPlus: { width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.surfaceLight, alignItems: "center", justifyContent: "center", marginBottom: SPACING.md },
  uploadPlusText: { fontSize: 28, color: COLORS.primary, fontWeight: "300", lineHeight: 32 },
  uploadTitle: { fontSize: FONT_SIZES.lg, color: COLORS.text, fontWeight: "600", marginBottom: 4 }, uploadSub: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted },
  clipBadge: { marginTop: SPACING.md, backgroundColor: COLORS.primary, borderRadius: RADII.full, paddingHorizontal: SPACING.md, paddingVertical: 4 }, clipBadgeText: { fontSize: FONT_SIZES.xs + 1, color: "#FFF", fontWeight: "700", letterSpacing: 0.4 },
  clipRow: { marginBottom: SPACING.lg }, clipRowContent: { gap: SPACING.sm },
  clipCard: { width: 110, backgroundColor: COLORS.surface, borderRadius: RADII.md, padding: SPACING.sm, alignItems: "center", ...SHADOWS.card },
  clipThumb: { width: "100%", height: 64, backgroundColor: COLORS.surfaceLight, borderRadius: RADII.sm, alignItems: "center", justifyContent: "center", marginBottom: SPACING.sm, overflow: "hidden" },
  clipThumbImg: { width: "100%", height: "100%", borderRadius: RADII.sm }, clipThumbIcon: { fontSize: 18, color: COLORS.primary },
  clipName: { fontSize: 11, color: COLORS.text, fontWeight: "500", width: "100%" }, clipDur: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  clipRm: { position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" }, clipRmText: { color: "#FFF", fontSize: 14, fontWeight: "700", lineHeight: 16 },
  sectionLabel: { fontSize: FONT_SIZES.xs, color: COLORS.textMuted, fontWeight: "700", letterSpacing: 1.5, marginBottom: SPACING.sm, marginTop: SPACING.lg },
  promptInput: { backgroundColor: COLORS.surface, borderRadius: RADII.md, padding: SPACING.md, fontSize: FONT_SIZES.md, color: COLORS.text, minHeight: 110 },
  promptHint: { fontSize: 11, color: COLORS.textMuted, textAlign: "right", marginTop: SPACING.xs, marginBottom: SPACING.md },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: SPACING.sm, marginBottom: SPACING.lg },
  chip: { backgroundColor: COLORS.surface, borderRadius: RADII.full, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderWidth: 1, borderColor: COLORS.borderLight },
  chipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryBg },
  chipText: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, fontWeight: "500" }, chipTextActive: { color: COLORS.primary, fontWeight: "700" },
  trimWrap: { marginBottom: SPACING.lg }, trimRow: { flexDirection: "row", alignItems: "center", gap: SPACING.md }, trimField: { flex: 1 },
  trimLabel: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted, marginBottom: 4 },
  trimInput: { backgroundColor: COLORS.surface, borderRadius: RADII.md, padding: SPACING.md, fontSize: FONT_SIZES.md, color: COLORS.text, borderWidth: 1, borderColor: COLORS.borderLight, textAlign: "center" }, trimDash: { fontSize: FONT_SIZES.lg, color: COLORS.textMuted, marginTop: 18 },
  genBtn: { borderRadius: RADII.full, paddingVertical: SPACING.md + 4, alignItems: "center", marginTop: SPACING.md, ...SHADOWS.fab },
  genText: { fontSize: FONT_SIZES.lg, color: "#FFF", fontWeight: "700", letterSpacing: 0.3 },
  loadingWrap: { alignItems: "center", marginTop: SPACING.xl }, shimmerBar: { width: "60%", height: 3, borderRadius: 2, backgroundColor: COLORS.primary, marginBottom: SPACING.md },
  loadingText: { color: COLORS.textSecondary, marginTop: SPACING.md, fontSize: FONT_SIZES.sm },
  errorWrap: { backgroundColor: "rgba(255,36,66,0.13)", borderRadius: RADII.md, padding: SPACING.md, marginTop: SPACING.lg, borderWidth: 1, borderColor: "rgba(255,36,66,0.3)" }, errorText: { color: COLORS.error, fontSize: FONT_SIZES.md },
  videoPreview: { width: "100%", height: 220, borderRadius: RADII.lg, backgroundColor: "#000", marginBottom: SPACING.md },
  resultWrap: { marginTop: SPACING.xl }, resultCard: { borderRadius: RADII.md, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.primaryBg, ...SHADOWS.card },
  resultTitle: { fontSize: FONT_SIZES.xl, fontWeight: "800", color: COLORS.primary, marginBottom: SPACING.md, letterSpacing: 0.5 },
  resultRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: SPACING.xs, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  resultLabel: { fontSize: FONT_SIZES.md, color: COLORS.textSecondary }, resultValue: { fontSize: FONT_SIZES.md, color: COLORS.text, fontWeight: "600" },
});
