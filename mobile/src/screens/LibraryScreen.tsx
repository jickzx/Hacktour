/**
 * LibraryScreen — XHS dark 2-column grid of saved AI clips.
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
import { COLORS, FONT_SIZES, RADII, SPACING, WEIGHTS } from "../constants/theme";
import ClipCard from "../components/ClipCard";
import { listClips, searchClips } from "../services/api";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = (SCREEN_WIDTH - SPACING.sm * 2 - SPACING.sm) / 2;

interface Clip {
  id: string;
  title: string;
  prompt: string;
  durationSeconds: number;
  createdAt: string;
  sourceVideoUrl?: string;
}

export default function LibraryScreen() {
  const [clips, setClips] = useState<Clip[]>([]);
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

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setSearch("");
    loadClips();
  }, [loadClips]);

  useEffect(() => {
    loadClips();
  }, [loadClips]);

  return (
    <View style={styles.root}>
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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
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
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

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
  },
  errorText: { fontSize: FONT_SIZES.md, color: COLORS.error, textAlign: "center" },
  retryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
  },
  retryText: { color: "#FFFFFF", fontWeight: WEIGHTS.bold, fontSize: FONT_SIZES.md },
});
