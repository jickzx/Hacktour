/**
 * HomeScreen — XHS dark explore feed.
 * Top: real AI-edited clips from the user (via /api/clips).
 * Body: AI-generated trending Chinese social posts (via /api/feed, Gemini-powered).
 * Falls back to static baseline cards if backend is unreachable.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS, FONT_SIZES, RADII, SPACING, WEIGHTS } from "../constants/theme";
import { listClips, fetchFeed } from "../services/api";

const TOP_TABS = ["Following", "Explore", "Nearby"] as const;
type TopTab = (typeof TOP_TABS)[number];

const CATEGORIES = ["For You", "Video", "Live", "Fashion", "Food", "Travel", "Beauty"] as const;

interface Post {
  id: string;
  title: string;
  author: string;
  likes: number;
  ratio: number;
  tintA: string;
  tintB: string;
  isLive?: boolean;
  isVideo?: boolean;
  tag?: string;
  isClip?: boolean;
}

interface ApiClip { id: string; prompt: string; durationSeconds?: number; createdAt: string }

const PALETTE: [string, string][] = [
  ["#B8C9D9", "#6B8BAA"], ["#E8D4B8", "#C89968"], ["#3A3028", "#1A1410"],
  ["#F0E8DC", "#D4C4A8"], ["#8B5A3C", "#3D2617"], ["#FFB8C8", "#FF2442"],
  ["#FF8A65", "#C04A1B"], ["#2E2E3A", "#0F0F14"], ["#C8E6C9", "#388E3C"],
  ["#E1BEE7", "#7B1FA2"], ["#FFF9C4", "#F9A825"], ["#B2EBF2", "#0097A7"],
];

/** Static fallback in case backend is offline */
const FALLBACK_POSTS: Post[] = [
  { id: "f1", title: "今日份穿搭 | 多巴胺色系 🌈✨", author: "穿搭博主_Lily", likes: 12840, ratio: 1.35, tintA: "#E1BEE7", tintB: "#7B1FA2", isVideo: true, tag: "穿搭" },
  { id: "f2", title: "伦敦留学生的一天 ☕ 学习vlog", author: "留英日记_Momo", likes: 3201, ratio: 0.95, tintA: "#B8C9D9", tintB: "#6B8BAA", tag: "留学" },
  { id: "f3", title: "好物种草！这个遮瑕真的绝了姐妹们冲🔥", author: "美妆小仙女99", likes: 8490, ratio: 1.45, tintA: "#FFB8C8", tintB: "#FF2442", tag: "美妆" },
  { id: "f4", title: "大厂offer来了！复盘我的春招经历", author: "互联网打工人", likes: 24356, ratio: 1.1, tintA: "#F0E8DC", tintB: "#D4C4A8", tag: "职场" },
  { id: "f5", title: "伦敦探店 | 这家奶茶比国内还好喝？！", author: "吃货在英国", likes: 6712, ratio: 1.2, tintA: "#8B5A3C", tintB: "#3D2617", isVideo: true, tag: "美食" },
  { id: "f6", title: "AI帮我剪了条片子 直接爆了 🤯", author: "科技宅Vince", likes: 41200, ratio: 1.05, tintA: "#2E2E3A", tintB: "#0F0F14", isLive: true, tag: "科技" },
  { id: "f7", title: "2026最火梗图合集😂 笑死我了", author: "表情包收集员", likes: 19083, ratio: 1.3, tintA: "#FFF9C4", tintB: "#F9A825", isVideo: true, tag: "梗图" },
  { id: "f8", title: "显瘦穿搭 | 微胖女生亲测有效 💕", author: "小红薯_XiaoMei", likes: 7540, ratio: 0.98, tintA: "#C8E6C9", tintB: "#388E3C", tag: "穿搭" },
];

function clipToPost(clip: ApiClip): Post {
  const [tintA, tintB] = PALETTE[clip.id.charCodeAt(0) % PALETTE.length];
  return {
    id: `clip-${clip.id}`,
    title: clip.prompt || "AI Edit",
    author: "你 (Stream Mind)",
    likes: 0,
    ratio: 1.2,
    tintA,
    tintB,
    isVideo: true,
    isClip: true,
    tag: "AI",
  };
}

export default function HomeScreen() {
  const [topTab, setTopTab] = useState<TopTab>("Explore");
  const [category, setCategory] = useState<string>("For You");
  const [clipPosts, setClipPosts] = useState<Post[]>([]);
  const [feedPosts, setFeedPosts] = useState<Post[]>(FALLBACK_POSTS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [clips, feed] = await Promise.allSettled([listClips(), fetchFeed()]);
      if (clips.status === "fulfilled") setClipPosts(clips.value.map(clipToPost));
      if (feed.status === "fulfilled") setFeedPosts(feed.value as Post[]);
    } catch {
      // silently fall back
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRefresh = useCallback(() => { setRefreshing(true); loadAll(); }, [loadAll]);

  const allPosts = useMemo(() => [...clipPosts, ...feedPosts], [clipPosts, feedPosts]);

  const { leftCol, rightCol } = useMemo(() => {
    const left: Post[] = [], right: Post[] = [];
    let lH = 0, rH = 0;
    allPosts.forEach((p) => {
      if (lH <= rH) { left.push(p); lH += p.ratio; }
      else { right.push(p); rH += p.ratio; }
    });
    return { leftCol: left, rightCol: right };
  }, [allPosts]);

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn}>
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>
        <View style={styles.tabRow}>
          {TOP_TABS.map((t) => (
            <TouchableOpacity key={t} onPress={() => setTopTab(t)} style={styles.tabBtn}>
              <Text style={[styles.tabText, topTab === t && styles.tabTextActive]}>{t}</Text>
              {topTab === t && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.iconBtn}>
          <Text style={styles.searchIcon}>⌕</Text>
        </TouchableOpacity>
      </View>

      {/* Category chips */}
      <View style={styles.categoryWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryContent}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity key={c} onPress={() => setCategory(c)} style={styles.chip}>
              <Text style={[styles.chipText, category === c && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.chipChevron}>
          <Text style={styles.chipChevronText}>⌄</Text>
        </TouchableOpacity>
      </View>

      {/* Clip banner */}
      {clipPosts.length > 0 && (
        <View style={styles.clipBanner}>
          <View style={styles.clipBannerDot} />
          <Text style={styles.clipBannerText}>
            {clipPosts.length} AI edit{clipPosts.length !== 1 ? "s" : ""} you created are live in your feed
          </Text>
        </View>
      )}

      {/* AI feed source indicator */}
      {!loading && feedPosts !== FALLBACK_POSTS && (
        <View style={styles.aiTag}>
          <Text style={styles.aiTagText}>✦ AI · Trending now in 中国</Text>
        </View>
      )}

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading trending content…</Text>
        </View>
      )}

      {/* Masonry feed */}
      <ScrollView
        style={styles.feedScroll}
        contentContainerStyle={styles.feedContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      >
        <View style={styles.grid}>
          <View style={styles.col}>{leftCol.map((p) => <PostCard key={p.id} post={p} />)}</View>
          <View style={styles.col}>{rightCol.map((p) => <PostCard key={p.id} post={p} />)}</View>
        </View>
      </ScrollView>
    </View>
  );
}

function PostCard({ post }: { post: Post }) {
  const fmtLikes = (n: number) =>
    n === 0 ? "new" : n >= 10000 ? `${(n / 10000).toFixed(1)}w` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85}>
      <View style={[styles.thumb, { aspectRatio: 1 / post.ratio, backgroundColor: post.tintB }]}>
        <View style={[styles.thumbTint, { backgroundColor: post.tintA, opacity: 0.35 }]} />

        {/* Tag pill top-left */}
        {post.tag && !post.isClip && (
          <View style={styles.tagPill}>
            <Text style={styles.tagText}>{post.tag}</Text>
          </View>
        )}
        {post.isClip && (
          <View style={[styles.tagPill, styles.tagPillClip]}>
            <Text style={styles.tagText}>YOUR CLIP</Text>
          </View>
        )}

        {post.isLive && (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
        )}
        {post.isVideo && (
          <View style={styles.playBadge}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        )}
      </View>

      <Text style={styles.cardTitle} numberOfLines={2}>{post.title}</Text>
      <View style={styles.cardMeta}>
        <View style={[styles.avatar, post.isClip && styles.avatarClip]} />
        <Text style={styles.cardAuthor} numberOfLines={1}>{post.author}</Text>
        <Text style={[styles.cardLike, post.isClip && styles.cardLikeClip]}>
          ♡ {fmtLikes(post.likes)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  header: {
    flexDirection: "row", alignItems: "center",
    paddingTop: SPACING.xxl + 16, paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md, gap: SPACING.md,
  },
  iconBtn: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  menuIcon: { fontSize: 20, color: COLORS.text, fontWeight: WEIGHTS.regular },
  tabRow: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.xl },
  tabBtn: { alignItems: "center", paddingVertical: 4 },
  tabText: { fontSize: FONT_SIZES.lg, color: COLORS.textMuted, fontWeight: WEIGHTS.semibold },
  tabTextActive: { color: COLORS.text, fontWeight: WEIGHTS.bold },
  tabUnderline: { marginTop: 4, width: 20, height: 2, borderRadius: 1, backgroundColor: COLORS.primary },
  searchIcon: { fontSize: 22, color: COLORS.text, fontWeight: WEIGHTS.regular },

  categoryWrap: {
    flexDirection: "row", alignItems: "center",
    paddingLeft: SPACING.lg, paddingBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.borderLight,
  },
  categoryContent: { gap: SPACING.lg, paddingRight: SPACING.md, alignItems: "center" },
  chip: { paddingVertical: SPACING.xs },
  chipText: { fontSize: FONT_SIZES.md, color: COLORS.textMuted, fontWeight: WEIGHTS.medium },
  chipTextActive: { color: COLORS.text, fontWeight: WEIGHTS.bold },
  chipChevron: { width: 40, height: 28, alignItems: "center", justifyContent: "center" },
  chipChevronText: { fontSize: 14, color: COLORS.textMuted },

  clipBanner: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    backgroundColor: "rgba(255,36,66,0.08)",
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,36,66,0.2)",
  },
  clipBannerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary },
  clipBannerText: { fontSize: FONT_SIZES.sm, color: COLORS.primary, fontWeight: WEIGHTS.medium },

  aiTag: {
    paddingHorizontal: SPACING.lg, paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  aiTagText: { fontSize: 10, color: COLORS.textMuted, fontWeight: WEIGHTS.medium, letterSpacing: 0.4 },

  loadingRow: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
  },
  loadingText: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted },

  feedScroll: { flex: 1 },
  feedContent: { paddingHorizontal: SPACING.sm, paddingTop: SPACING.sm, paddingBottom: 120 },
  grid: { flexDirection: "row", gap: SPACING.sm },
  col: { flex: 1, gap: SPACING.md },

  card: { borderRadius: RADII.md, overflow: "hidden" },
  thumb: {
    width: "100%", borderRadius: RADII.md, overflow: "hidden",
    justifyContent: "flex-end", padding: SPACING.sm,
  },
  thumbTint: { ...StyleSheet.absoluteFillObject },

  tagPill: {
    position: "absolute", top: 8, left: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: RADII.full,
  },
  tagPillClip: { backgroundColor: COLORS.primary },
  tagText: { fontSize: 9, color: "#FFFFFF", fontWeight: WEIGHTS.bold, letterSpacing: 0.6 },

  liveBadge: {
    position: "absolute", top: 8, right: 8,
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: RADII.full, gap: 4,
  },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#FFFFFF" },
  liveBadgeText: { fontSize: 9, color: "#FFFFFF", fontWeight: WEIGHTS.bold, letterSpacing: 0.8 },

  playBadge: {
    position: "absolute", bottom: SPACING.sm, right: SPACING.sm,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center",
  },
  playIcon: { fontSize: 9, color: "#FFFFFF", marginLeft: 1 },

  cardTitle: {
    fontSize: FONT_SIZES.md, color: COLORS.text, fontWeight: WEIGHTS.medium,
    paddingHorizontal: SPACING.xs, paddingTop: SPACING.sm, lineHeight: 18,
  },
  cardMeta: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: SPACING.xs, paddingTop: SPACING.xs, paddingBottom: SPACING.sm, gap: 6,
  },
  avatar: { width: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.surfaceLight },
  avatarClip: { backgroundColor: COLORS.primary },
  cardAuthor: { flex: 1, fontSize: FONT_SIZES.xs + 1, color: COLORS.textSecondary, fontWeight: WEIGHTS.regular },
  cardLike: { fontSize: FONT_SIZES.xs + 1, color: COLORS.textSecondary, fontWeight: WEIGHTS.regular },
  cardLikeClip: { color: COLORS.primary, fontWeight: WEIGHTS.semibold },
});
