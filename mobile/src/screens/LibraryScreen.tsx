/**
 * LibraryScreen — premium two-section library for Clips and Images.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Alert,
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
import { Ionicons } from "@expo/vector-icons";
import { COLORS, FONT_SIZES, RADII, SPACING, WEIGHTS, SHADOWS } from "../constants/theme";
import ClipCard from "../components/ClipCard";
import { listClips, searchClips, deleteClip, listPhotos, photoUrl, Photo } from "../services/api";
import { useLanguage } from "../context/LanguageContext";

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

type Section = "clips" | "images";

export default function LibraryScreen({ isFocused }: { isFocused?: boolean }) {
  const { t } = useLanguage();
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

  const handleDeleteClip = useCallback((clip: Clip) => {
    Alert.alert("Delete clip?", `"${clip.title}" will be removed from your library.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive", onPress: async () => {
          try {
            await deleteClip(clip.id);
            setClips((prev) => prev.filter((c) => c.id !== clip.id));
          } catch (err: any) {
            Alert.alert("Error", err.message || "Failed to delete clip");
          }
        },
      },
    ]);
  }, []);

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

  useEffect(() => {
    if (isFocused) {
      if (section === "clips") loadClips();
      else loadPhotos();
    }
  }, [isFocused]); // eslint-disable-line

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="menu" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("libraryTitle")}</Text>
        <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7}>
          <Ionicons name="search" size={22} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.pillTabsWrap}>
        {(["clips", "images"] as Section[]).map((s) => {
          const active = s === section;
          return (
            <TouchableOpacity
              key={s}
              style={[styles.pillTab, active && styles.pillTabActive]}
              onPress={() => setSection(s)}
              activeOpacity={0.7}
            >
              <Text style={[styles.pillTabText, active && styles.pillTabTextActive]}>
                {s === "clips" ? `🎬 ${t("clips")}` : `🖼 ${t("photos")}`}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading your library…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={refreshCurrent} activeOpacity={0.7}>
            <Text style={styles.retryBtnText}>Try Again</Text>
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
              <View style={styles.searchWrap}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  style={styles.searchInput}
                  placeholder={t("searchClips")}
                  placeholderTextColor={COLORS.textMuted}
                  value={search}
                  onChangeText={onSearchChange}
                  returnKeyType="search"
                />
              </View>
              <Text style={styles.countText}>
                {clips.length} clip{clips.length !== 1 ? "s" : ""}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🎬</Text>
              <Text style={styles.emptyTitle}>{t("noClipsTitle")}</Text>
              <Text style={styles.emptySubtitle}>{t("noClipsSubtitle")}</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.clipCardWrap}>
              <ClipCard
                title={item.title}
                prompt={item.prompt}
                durationSeconds={item.durationSeconds}
                createdAt={item.createdAt}
                sourceVideoUrl={item.sourceVideoUrl}
                thumbnailUrl={item.thumbnailUrl}
                onPress={() => setSelectedClip(item)}
                onLongPress={() => handleDeleteClip(item)}
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refreshCurrent}
              tintColor={COLORS.primary}
            />
          }
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <Text style={styles.countText}>
                {photos.length} photo{photos.length !== 1 ? "s" : ""}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="images-outline" size={40} color={COLORS.textMuted} style={{ marginBottom: SPACING.md }} />
              <Text style={styles.emptyTitle}>{t("noPhotosTitle")}</Text>
              <Text style={styles.emptySubtitle}>{t("noPhotosSubtitle")}</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isEdited = item.variant === "edited";
            return (
              <View style={[styles.photoCard, isEdited && styles.photoCardEdited]}>
                <View style={styles.photoThumbWrap}>
                  <Image
                    source={{ uri: photoUrl(item.url) }}
                    style={styles.photoImage}
                    resizeMode="cover"
                  />
                  <View
                    style={[
                      styles.variantBadge,
                      isEdited ? styles.variantBadgeEdited : styles.variantBadgeOriginal,
                    ]}
                  >
                    <View style={styles.variantBadgeInner}>
                      <Ionicons
                        name={isEdited ? "sparkles" : "camera"}
                        size={10}
                        color="#FFFFFF"
                      />
                      <Text style={styles.variantBadgeText}>
                        {isEdited ? "cinematic" : "original"}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.photoMeta}>
                  <Text style={styles.photoCaption} numberOfLines={1}>
                    {item.caption || "photo"}
                  </Text>
                  <Text style={styles.photoDate}>
                    {new Date(item.createdAt).toLocaleDateString()}
                  </Text>
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

function ClipPlayerModal({
  clip,
  onClose,
}: {
  clip: { title: string; sourceVideoUrl?: string; durationSeconds: number };
  onClose: () => void;
}) {
  const videoUrl = clip.sourceVideoUrl
    ? clip.sourceVideoUrl.startsWith("http")
      ? clip.sourceVideoUrl
      : `${API_BASE}${clip.sourceVideoUrl}`
    : null;
  const player = useVideoPlayer(videoUrl, (p) => {
    p.play();
  });

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={modalStyles.root}>
        <View style={modalStyles.header}>
          <Text style={modalStyles.title} numberOfLines={2}>
            {clip.title}
          </Text>
          <TouchableOpacity style={modalStyles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <Ionicons name="close" size={22} color={COLORS.text} />
          </TouchableOpacity>
        </View>
        {videoUrl ? (
          <VideoView player={player} style={modalStyles.video} contentFit="contain" nativeControls />
        ) : (
          <View style={modalStyles.noVideo}>
            <Ionicons name="videocam-off-outline" size={44} color={COLORS.textMuted} style={{ marginBottom: SPACING.md }} />
            <Text style={modalStyles.noVideoText}>No video available</Text>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
  },
  title: {
    flex: 1,
    color: COLORS.text,
    fontSize: FONT_SIZES.lg,
    fontWeight: WEIGHTS.bold,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: RADII.full,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
  },
  closeText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: WEIGHTS.bold,
  },
  video: { flex: 1, width: "100%", backgroundColor: COLORS.background },
  noVideo: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
  },
  noVideoEmoji: { fontSize: 48 },
  noVideoText: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.md,
    fontWeight: WEIGHTS.medium,
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: SPACING.xxl + 16,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADII.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
  },
  iconText: {
    fontSize: 18,
    color: COLORS.text,
    fontWeight: WEIGHTS.regular,
  },
  headerTitle: {
    fontSize: FONT_SIZES.xxl,
    color: COLORS.text,
    fontWeight: WEIGHTS.heavy,
    letterSpacing: 0.5,
  },

  pillTabsWrap: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: RADII.full,
    padding: 4,
    marginHorizontal: SPACING.lg,
    marginVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
  },
  pillTab: {
    flex: 1,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADII.full,
    alignItems: "center",
  },
  pillTabActive: {
    backgroundColor: COLORS.primary,
    ...SHADOWS.fab,
  },
  pillTabText: {
    fontSize: 13,
    fontWeight: WEIGHTS.semibold,
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
  },
  pillTabTextActive: {
    color: COLORS.textOnPrimary,
    fontWeight: WEIGHTS.bold,
  },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  loadingText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
    fontWeight: WEIGHTS.medium,
  },

  listContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: 120,
  },
  row: {
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },

  listHeader: {
    paddingBottom: SPACING.md,
    gap: SPACING.sm,
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    paddingHorizontal: SPACING.md,
    height: 44,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: SPACING.sm,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: FONT_SIZES.md,
    fontWeight: WEIGHTS.regular,
    paddingVertical: 0,
  },
  countText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    fontWeight: WEIGHTS.medium,
    letterSpacing: 0.3,
  },

  empty: {
    alignItems: "center",
    paddingTop: SPACING.xxl * 2,
    gap: SPACING.sm,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: SPACING.sm,
  },
  emptyTitle: {
    fontSize: FONT_SIZES.xl,
    color: COLORS.text,
    fontWeight: WEIGHTS.bold,
  },
  emptySubtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    fontWeight: WEIGHTS.regular,
    textAlign: "center",
    paddingHorizontal: SPACING.xl,
    lineHeight: 20,
  },

  errorEmoji: {
    fontSize: 48,
    marginBottom: SPACING.xs,
  },
  errorText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.error,
    textAlign: "center",
    fontWeight: WEIGHTS.medium,
  },
  retryBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.sm + 2,
    marginTop: SPACING.sm,
    ...SHADOWS.fab,
  },
  retryBtnText: {
    color: COLORS.textOnPrimary,
    fontWeight: WEIGHTS.bold,
    fontSize: FONT_SIZES.md,
    letterSpacing: 0.3,
  },

  clipCardWrap: {
    width: CARD_WIDTH,
    borderRadius: RADII.md,
    overflow: "hidden",
  },

  photoCard: {
    width: CARD_WIDTH,
    borderRadius: RADII.md,
    overflow: "hidden",
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    ...SHADOWS.card,
  },
  photoCardEdited: {
    borderColor: COLORS.primary,
    borderWidth: 1.5,
  },
  photoThumbWrap: {
    position: "relative",
    backgroundColor: COLORS.surfaceLight,
  },
  photoImage: {
    width: "100%",
    aspectRatio: 3 / 4,
  },
  variantBadge: {
    position: "absolute",
    top: SPACING.sm,
    left: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    borderRadius: RADII.full,
  },
  variantBadgeOriginal: {
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  variantBadgeEdited: {
    backgroundColor: COLORS.primary,
    ...SHADOWS.fab,
  },
  variantBadgeInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  variantBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: WEIGHTS.heavy,
    color: "#fff",
    letterSpacing: 0.5,
  },
  photoMeta: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.sm,
    gap: 2,
  },
  photoCaption: {
    fontSize: 13,
    fontWeight: WEIGHTS.semibold,
    color: COLORS.text,
  },
  photoDate: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: WEIGHTS.regular,
  },
});
