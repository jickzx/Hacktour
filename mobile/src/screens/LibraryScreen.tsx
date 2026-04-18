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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, SPACING, RADII } from "../constants/theme";
import ClipCard from "../components/ClipCard";
import { listClips, searchClips, listPhotos, photoUrl, Photo } from "../services/api";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = (SCREEN_WIDTH - SPACING.lg * 2 - SPACING.md) / 2;

interface Clip {
  id: string;
  title: string;
  prompt: string;
  durationSeconds: number;
  createdAt: string;
  sourceVideoUrl?: string;
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

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim()) { loadClips(); return; }
    try {
      setError(null);
      const results = await searchClips(query);
      setClips(results);
    } catch (err: any) {
      setError(err.message || "Search failed");
    }
  }, [loadClips]);

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

  const sectionTabs = (
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
  );

  const count = section === "clips" ? clips.length : photos.length;
  const header = (
    <View>
      <View style={styles.header}>
        <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.logoBar} />
        <Text style={styles.brand}>Library</Text>
        <Text style={styles.tagline}>{count} {section === "clips" ? "clip" : "photo"}{count !== 1 ? "s" : ""}</Text>
      </View>
      {sectionTabs}
      {section === "clips" && (
        <TextInput
          style={styles.searchInput}
          placeholder="Search clips..."
          placeholderTextColor={COLORS.textMuted}
          value={search}
          onChangeText={onSearchChange}
          returnKeyType="search"
        />
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <LinearGradient colors={[COLORS.background, COLORS.uploadBg, COLORS.background]} style={StyleSheet.absoluteFill} />

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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshCurrent} tintColor={COLORS.primary} />}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>▦</Text>
              <Text style={styles.emptyTitle}>No clips yet</Text>
              <Text style={styles.emptySubtitle}>Generate an edit to save your first clip</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={{ width: CARD_WIDTH }}>
              <ClipCard title={item.title} prompt={item.prompt} durationSeconds={item.durationSeconds} createdAt={item.createdAt} sourceVideoUrl={item.sourceVideoUrl} />
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
          ListHeaderComponent={header}
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: SPACING.md },
  listContent: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.xxl + 16, paddingBottom: 100 },
  row: { justifyContent: "space-between", marginBottom: SPACING.md },
  header: { alignItems: "center", marginBottom: SPACING.lg },
  logoBar: { width: 40, height: 4, borderRadius: 2, marginBottom: SPACING.md },
  brand: { fontSize: 28, fontWeight: "800", color: COLORS.text, letterSpacing: -0.5 },
  tagline: { fontSize: 14, color: COLORS.textSecondary, marginTop: SPACING.xs, letterSpacing: 2, textTransform: "uppercase" },
  sectionTabs: {
    flexDirection: "row",
    backgroundColor: COLORS.surface,
    borderRadius: RADII.full,
    padding: 4,
    marginBottom: SPACING.md,
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
  sectionTabText: { fontSize: 14, fontWeight: "700", color: COLORS.textSecondary, letterSpacing: 0.5 },
  sectionTabTextActive: { color: "#fff" },
  searchInput: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: COLORS.surfaceBorder,
    color: COLORS.text,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    fontSize: 15,
    marginBottom: SPACING.lg,
  },
  empty: { alignItems: "center", paddingTop: SPACING.xxl, gap: SPACING.sm },
  emptyIcon: { fontSize: 48, color: COLORS.textMuted },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  emptySubtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center", paddingHorizontal: SPACING.lg },
  errorText: { fontSize: 15, color: COLORS.error, textAlign: "center" },
  retryButton: { backgroundColor: COLORS.primary, borderRadius: RADII.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  retryText: { color: COLORS.text, fontWeight: "700", fontSize: 14 },

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
  photoCaption: { fontSize: 13, fontWeight: "700", color: COLORS.text },
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
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.5,
  },
});
