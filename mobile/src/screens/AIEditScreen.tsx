/** Main AI edit screen for Stream Mind. */
import { useState } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS, RADII, SPACING } from "../constants/theme";
import { generateEdit } from "../services/api";
import { ClipList, GenerateButton, Header, PromptSection, QuickPrompts, UploadZone } from "./AIEditComponents";
import type { VideoClip } from "./AIEditTypes";

/** Renders the main AI editing screen. */
export default function AIEditScreen() {
  const [prompt, setPrompt] = useState("");
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSavedBanner, setShowSavedBanner] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = () => {
    const mockClip: VideoClip = {
      id: Date.now().toString(),
      name: `clip_${clips.length + 1}.mp4`,
      duration: `${Math.floor(Math.random() * 10) + 1}:${String(Math.floor(Math.random() * 60)).padStart(2, "0")}`,
    };
    setClips((prev) => [...prev, mockClip]);
  };

  const handleRemoveClip = (id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || clips.length === 0) return;
    setIsGenerating(true);
    setError(null);
    try {
      const result = await generateEdit(prompt, clips.map((clip) => ({ name: clip.name, duration: Number.parseInt(clip.duration, 10) || 0 })));
      if (result.clipId) {
        setShowSavedBanner(true);
        setTimeout(() => setShowSavedBanner(false), 2500);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed");
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
        {error && <Text style={styles.errorText}>{error}</Text>}
        <GenerateButton
          onPress={handleGenerate}
          disabled={!prompt.trim() || clips.length === 0 || isGenerating}
          isGenerating={isGenerating}
        />
      </ScrollView>
    </View>
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
  errorText: { color: COLORS.error, marginBottom: SPACING.md, fontSize: 13, fontWeight: "600" },
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
    color: COLORS.white,
    fontWeight: "700",
    fontSize: 14,
  },
});
