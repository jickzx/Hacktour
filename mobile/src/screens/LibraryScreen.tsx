/**
 * LibraryScreen — two sections: Clips (saved AI edits) and Photos (Gemini shoots)
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  SafeAreaView,
} from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";
import { COLORS, FONT_SIZES, RADII, SPACING, WEIGHTS } from "../constants/theme";
import ClipCard from "../components/ClipCard";
import { listClips, searchClips, listPhotos, photoUrl, Photo } from "../services/api";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = (SCREEN_WIDTH - SPACING.lg * 2 - SPACING.md) / 2;
const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

interface Clip {
  id: string;
  title: string;
  prompt: string;
  durationSeconds: number;
  createdAt: string;
  sourceVideoUrl?: string;
  thumbnailUrl?: string;
}

type Section = "clips" | "photos";

export default function LibraryScreen() {
  const [section, setSection] = useState<Section>("clips");

  const [clips, setClips] = useState<Clip[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedClip, setSelectedClip] = useState<Clip | null>(null);

  const loadClips = useCallback(async () => {
    try {
      setError(null);
      const data = await listClips();
      setClips(data);
    } catch (err: any) {
      setError(err.message || "Failed to load clips");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadPhotos = useCallback(async () => {
    try {
      setError(null);
      const data = await listPhotos();
      setPhotos(data);
    } catch (err: any) {
      setError(err.message || "Failed to load photos");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        loadClips();
        return;
      }
      try {
        setError(null);
        const results = await searchClips(query);
        setClips(results);
      } catch (err: any) {
        setError(err.message || "Search failed");
      }
    },
    [loadClips]
  );

  const onSearchChange = (text: string) => {
    setSearch(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleSearch(text), 300);
  };

  const refreshCurrent = useCallback(() => {
    setRefreshing(true);
    setSearch("");
    if (section === "clips") loadClips();
    else loadPhotos();
  }, [section, loadClips, loadPhotos]);

  useEffect(() => {
    setLoading(true);
    if (section === "clips") loadClips();
    else loadPhotos();
  }, [section, loadClips, loadPhotos]);

  return (
    <View style={styles.root}>
      {/* Fixed XHS-style top bar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn}>
          <Text style={styles.iconText}>☰</Text>
        </TouchableOpacity>
        <View style={styles.titleWrap}>
          <Text style={styles.title}>Library</Text>
          <View style={styles.titleUnderline} />
        </View>
        <TouchableOpacity style={styles.iconBtn}>
          <Text style={styles.iconText}>⌕</Text>
        </TouchableOpacity>
      </View>

      {/* Section tabs */}
      <View style={styles.sectionTabs}>
        {(["clips", "photos"] as Section[]).map((s) => {
          const active = s === section;
          return (
            <TouchableOpacity
              key={s}
              style={[styles.sectionTab, active && styles.sectionTabActive]}
              onPress={() => setSection(s)}
              activeOpacity={0.8}
            >
              <Text style={[styles.sectionTabText, active && styles.sectionTabTextActive]}>
                {s === "clips" ? "Clips" : "Photos"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={refreshCurrent}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : section === "clips" ? (
        <FlatList
          data={clips}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refreshCurrent}
              tintColor={COLORS.primary}
            />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search clips…"
                placeholderTextColor={COLORS.textMuted}
                value={search}
                onChangeText={onSearchChange}
                returnKeyType="search"
              />
              <Text style={styles.countText}>
                {clips.length} clip{clips.length !== 1 ? "s" : ""}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>▦</Text>
              <Text style={styles.emptyTitle}>No clips yet</Text>
              <Text style={styles.emptySubtitle}>
                Generate an edit to save your first clip
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{ width: CARD_WIDTH }}>
              <ClipCard
                title={item.title}
                prompt={item.prompt}
                durationSeconds={item.durationSeconds}
                createdAt={item.createdAt}
                sourceVideoUrl={item.sourceVideoUrl}
                thumbnailUrl={item.thumbnailUrl}
                onPress={() => setSelectedClip(item)}
              />
            </View>
          )}
        />
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshCurrent} tintColor={COLORS.primary} />}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={styles.countText}>
                {photos.length} photo{photos.length !== 1 ? "s" : ""}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📸</Text>
              <Text style={styles.emptyTitle}>No photos yet</Text>
              <Text style={styles.emptySubtitle}>Say "Gemini, take pictures of me" on the live tab</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isEdited = item.variant === "edited";
            return (
              <View style={[styles.photoCard, { width: CARD_WIDTH }, isEdited && styles.photoCardEdited]}>
                <Image source={{ uri: photoUrl(item.url) }} style={styles.photoImage} resizeMode="cover" />
                <View style={[styles.variantBadge, isEdited ? styles.variantBadgeEdited : styles.variantBadgeOriginal]}>
                  <Text style={styles.variantBadgeText}>{isEdited ? "✨ cinematic" : "original"}</Text>
                </View>
                <View style={styles.photoMeta}>
                  <Text style={styles.photoCaption} numberOfLines={1}>{item.caption || "photo"}</Text>
                  <Text style={styles.photoDate}>{new Date(item.createdAt).toLocaleDateString()}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
      {selectedClip && (
        <ClipPlayerModal clip={selectedClip} onClose={() => setSelectedClip(null)} />
      )}
    </View>
  );
}

function ClipPlayerModal({ clip, onClose }: { clip: { title: string; sourceVideoUrl?: string; durationSeconds: number }; onClose: () => void }) {
  const videoUrl = clip.sourceVideoUrl
    ? (clip.sourceVideoUrl.startsWith("http") ? clip.sourceVideoUrl : `${API_BASE}${clip.sourceVideoUrl}`)
    : null;
  const player = useVideoPlayer(videoUrl, (p) => { p.play(); });

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={modalStyles.root}>
        <View style={modalStyles.header}>
          <Text style={modalStyles.title} numberOfLines={2}>{clip.title}</Text>
          <TouchableOpacity style={modalStyles.closeBtn} onPress={onClose}>
            <Text style={modalStyles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>
        {videoUrl ? (
          <VideoView
            player={player}
            style={modalStyles.video}
            contentFit="contain"
            nativeControls
          />
        ) : (
          <View style={modalStyles.noVideo}>
            <Text style={modalStyles.noVideoText}>No video available</Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
  },
  title: { flex: 1, color: "#fff", fontSize: FONT_SIZES.md, fontWeight: WEIGHTS.bold },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  closeText: { color: "#fff", fontSize: 16, fontWeight: WEIGHTS.bold },
  video: { flex: 1, width: "100%" },
  noVideo: { flex: 1, alignItems: "center", justifyContent: "center" },
  noVideoText: { color: "rgba(255,255,255,0.5)", fontSize: FONT_SIZES.md },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

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
  titleUnderline: {
    marginTop: 4,
    width: 20,
    height: 2,
    borderRadius: 1,
    backgroundColor: COLORS.primary,
  },

  sectionTabs: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: RADII.full,
    padding: 4,
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
  },
  sectionTab: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADII.full,
    alignItems: "center",
  },
  sectionTabActive: { backgroundColor: COLORS.primary },
  sectionTabText: { fontSize: 14, fontWeight: WEIGHTS.bold, color: COLORS.textSecondary, letterSpacing: 0.5 },
  sectionTabTextActive: { color: "#fff" },

  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: SPACING.md },
  listContent: {
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.sm,
    paddingBottom: 120,
  },
  row: { gap: SPACING.sm, marginBottom: SPACING.md },

  listHeader: {
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
  },
  searchInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    color: COLORS.text,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    fontSize: FONT_SIZES.md,
    fontWeight: WEIGHTS.regular,
    marginBottom: SPACING.sm,
  },
  countText: {
    fontSize: FONT_SIZES.xs + 1,
    color: COLORS.textMuted,
    fontWeight: WEIGHTS.regular,
  },

  empty: {
    alignItems: "center",
    paddingTop: SPACING.xxl,
    gap: SPACING.sm,
  },
  emptyIcon: { fontSize: 48, color: COLORS.textMuted },
  emptyTitle: { fontSize: FONT_SIZES.xl, color: COLORS.text, fontWeight: WEIGHTS.bold },
  emptySubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    fontWeight: WEIGHTS.regular,
    textAlign: "center",
    paddingHorizontal: SPACING.lg,
  },
  errorText: { fontSize: FONT_SIZES.md, color: COLORS.error, textAlign: "center" },
  retryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  retryText: { color: "#FFFFFF", fontWeight: WEIGHTS.bold, fontSize: FONT_SIZES.md },

  photoCard: {
    borderRadius: RADII.md,
    overflow: "hidden",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    position: "relative",
  },
  photoCardEdited: {
    borderColor: COLORS.primaryLight,
  },
  photoImage: { width: "100%", aspectRatio: 3 / 4, backgroundColor: COLORS.surfaceLight },
  photoMeta: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 2 },
  photoCaption: { fontSize: 13, fontWeight: WEIGHTS.bold, color: COLORS.text },
  photoDate: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  variantBadge: {
    position: "absolute",
    top: SPACING.xs,
    left: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: RADII.full,
    borderWidth: 1,
  },
  variantBadgeOriginal: {
    backgroundColor: "rgba(0,0,0,0.6)",
    borderColor: "rgba(255,255,255,0.15)",
  },
  variantBadgeEdited: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primaryLight,
  },
  variantBadgeText: {
    fontSize: 10,
    fontWeight: WEIGHTS.heavy,
    color: "#fff",
    letterSpacing: 0.5,
  },
});
