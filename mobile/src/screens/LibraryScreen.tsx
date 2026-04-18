/**
 * LibraryScreen — browsable 2-per-row grid of saved AI-generated clips
 * Fetches from the backend API with search, loading, and error states
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
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, SPACING, RADII } from "../constants/theme";
import ClipCard from "../components/ClipCard";
import { listClips, searchClips } from "../services/api";

const SCREEN_WIDTH = Dimensions.get("window").width;
// Card width: screen minus outer padding (×2) and middle gap, split across 2 columns
const CARD_WIDTH = (SCREEN_WIDTH - SPACING.lg * 2 - SPACING.md) / 2;

/** Shape of a clip returned from the API */
interface Clip {
  id: string;
  title: string;
  prompt: string;
  durationSeconds: number;
  createdAt: string;
  sourceVideoUrl?: string;
}

/** LibraryScreen — fetches and displays saved clips in a 2-per-row grid */
export default function LibraryScreen() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Debounce timer ref — avoids hammering the API on every keystroke
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Loads all clips from the API */
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

  /** Searches clips by semantic query, reverts to full list when query is empty */
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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setSearch("");
    loadClips();
  }, [loadClips]);

  useEffect(() => { loadClips(); }, [loadClips]);

  return (
    <View style={styles.root}>
      <LinearGradient colors={[COLORS.background, "#0D0D1A", COLORS.background]} style={StyleSheet.absoluteFill} />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadClips}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={clips}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
          ListHeaderComponent={
            <View>
              <View style={styles.header}>
                <LinearGradient colors={[COLORS.gradientStart, COLORS.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.logoBar} />
                <Text style={styles.brand}>Clip Library</Text>
                <Text style={styles.tagline}>{clips.length} clip{clips.length !== 1 ? "s" : ""}</Text>
              </View>
              <TextInput
                style={styles.searchInput}
                placeholder="Search clips..."
                placeholderTextColor={COLORS.textMuted}
                value={search}
                onChangeText={onSearchChange}
                returnKeyType="search"
              />
            </View>
          }
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
  emptySubtitle: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center" },
  errorText: { fontSize: 15, color: COLORS.error, textAlign: "center" },
  retryButton: { backgroundColor: COLORS.primary, borderRadius: RADII.md, paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm },
  retryText: { color: COLORS.text, fontWeight: "700", fontSize: 14 },
});
