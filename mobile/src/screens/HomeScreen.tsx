/**
 * HomeScreen — XHS-inspired dark explore feed with masonry grid.
 * Real AI-edited clips interleaved with curated lifestyle posts.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ImageSourcePropType,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS, FONT_SIZES, RADII, SPACING, WEIGHTS, SHADOWS } from "../constants/theme";
import { listClips } from "../services/api";

const TOP_TABS = ["Following", "Explore", "Nearby"] as const;
type TopTab = (typeof TOP_TABS)[number];

const CATEGORIES = ["For You", "Video", "Live", "Career", "Cars"] as const;

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
  isClip?: boolean;
  imageSource?: ImageSourcePropType;
  imageOffsetY?: number;
  textCard?: {
    bg: string;
    textColor: string;
    cardText: string;
    secondaryText?: string;
  };
  gradientCard?: {
    topColor: string;
    bottomColor: string;
    label?: string;
    mainText: string;
    textColor?: string;
  };
}

interface ApiClip {
  id: string;
  prompt: string;
  durationSeconds?: number;
  createdAt: string;
}

const PALETTE: [string, string][] = [
  ["#B8C9D9", "#6B8BAA"], ["#E8D4B8", "#C89968"], ["#3A3028", "#1A1410"],
  ["#F0E8DC", "#D4C4A8"], ["#8B5A3C", "#3D2617"], ["#FFB8C8", "#FF2442"],
  ["#FF8A65", "#C04A1B"], ["#2E2E3A", "#0F0F14"], ["#C8E6C9", "#388E3C"],
  ["#E1BEE7", "#7B1FA2"], ["#FFF9C4", "#F9A825"], ["#B2EBF2", "#0097A7"],
];

const STATIC_POSTS: Post[] = [
  {
    id: "f1", title: "🇬🇧 伦敦😌市中心 £19.9 无限日料自助",
    author: "伦敦食记与小动物", likes: 401, ratio: 1.4,
    tintA: "#5C3D2E", tintB: "#3A1F0F", isVideo: true,
    gradientCard: {
      topColor: "#1A0F08", bottomColor: "#4A2010",
      label: "🇬🇧 伦敦探店", mainText: "£19.9\n随便吃\n日料自助 🍣", textColor: "#FFD580",
    },
  },
  {
    id: "f2", title: "4月可是 SummerIntern 捡漏黄金期！",
    author: "是个上岸栗子", likes: 21, ratio: 1.334,
    tintA: "#B8D4E8", tintB: "#A0C4E0",
    imageSource: require("../../assets/posts/summerintern.png"),
  },
  {
    id: "f3", title: "claude code 的团队模式真的赶快用！！！",
    author: "jesse-菲美信息", likes: 1276, ratio: 1.391,
    tintA: "#1A1A2E", tintB: "#0D0D1A",
    imageSource: require("../../assets/posts/claude-code.png"),
  },
  {
    id: "f4", title: "一眼认出🇭🇰香港男生❗揭秘3个超明显特征！",
    author: "钓仔沪上飘", likes: 1837, ratio: 1.45,
    tintA: "#C84820", tintB: "#801A00", isVideo: true,
    gradientCard: {
      topColor: "#0D0500", bottomColor: "#7A2008",
      label: "🇭🇰 香港人", mainText: "香港男生\n为什么\n一眼就认出？", textColor: "#FFE080",
    },
  },
  {
    id: "f5", title: "rag 已死", author: "李洛克", likes: 1489, ratio: 1.05,
    tintA: "#F8D0D0", tintB: "#E8A0A0",
    textCard: {
      bg: "#FFF0F0", textColor: "#8B2020",
      secondaryText: "MAR.31", cardText: "我宣布，\nRAG 已死\n😤",
    },
  },
  {
    id: "f6", title: "Title 越短，越大佬", author: "3 Sigma IBD...", likes: 2556, ratio: 1.25,
    tintA: "#1A2A3E", tintB: "#0A1828",
    gradientCard: {
      topColor: "#050D18", bottomColor: "#1A3058",
      label: "职场 · 大佬学", mainText: "Title 越短\n越大佬", textColor: "#A8C8FF",
    },
  },
  {
    id: "f7", title: "手抓拉塞尔F1真车 | 帝国理工造赛车年 vlog",
    author: "艾仔壳", likes: 4893, ratio: 1.323,
    tintA: "#1A3050", tintB: "#0A1828", isVideo: true,
    imageSource: require("../../assets/posts/imperial-f1.png"),
  },
  {
    id: "f8", title: "上海 00后 UCL 海归情侣 今天身价多少钱",
    author: "拜托了姐妹", likes: 1492, ratio: 1.355,
    tintA: "#E8D4C0", tintB: "#C4A882", isVideo: true,
    imageSource: require("../../assets/posts/ucl-couple.png"),
  },
  {
    id: "f9", title: "Cambridge · Harvard · Yale 大佬背景大赏",
    author: "又逢春", likes: 136, ratio: 1.340,
    tintA: "#B0C8E8", tintB: "#8AAAC8",
    imageSource: require("../../assets/posts/linkedin-dalao.png"),
  },
  {
    id: "f10", title: "求求了😭香港中学真的不是你想进就能进！",
    author: "欣益妈国际教育说", likes: 236, ratio: 1.339,
    tintA: "#E8D4D4", tintB: "#C8A0A0",
    imageSource: require("../../assets/posts/hk-school.png"),
  },
  {
    id: "f11", title: "剑桥 IC offer holder 被 UCL 拒绝",
    author: "乘一点耐心一点", likes: 131, ratio: 1.359,
    tintA: "#C8D8E8", tintB: "#98B0C8",
    imageSource: require("../../assets/posts/ucas-offers.png"),
  },
  {
    id: "f12", title: "港大生在 J.P. Morgan 被狠狠上了一课🥲",
    author: "11是伊伊", likes: 401, ratio: 1.337,
    tintA: "#1A1A2E", tintB: "#0D0D1A",
    imageSource: require("../../assets/posts/jpmorgan.png"),
  },
  {
    id: "f13", title: "港三本有任何机会进 Goldman Sachs 吗？",
    author: "港漂打工人", likes: 892, ratio: 1.312,
    tintA: "#C8D8E8", tintB: "#98B8D8",
    imageSource: require("../../assets/posts/goldman-question.png"),
  },
];

function clipToPost(clip: ApiClip): Post {
  const [tintA, tintB] = PALETTE[clip.id.charCodeAt(0) % PALETTE.length];
  return {
    id: `clip-${clip.id}`, title: clip.prompt || "AI Edit",
    author: "你 (Stream Mind)", likes: 0, ratio: 1.2,
    tintA, tintB, isVideo: true, isClip: true,
  };
}

export default function HomeScreen() {
  const [topTab, setTopTab] = useState<TopTab>("Explore");
  const [category, setCategory] = useState<string>("For You");
  const [clipPosts, setClipPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const clips = await listClips();
      setClipPosts(clips.map(clipToPost));
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  const onRefresh = useCallback(() => { setRefreshing(true); loadAll(); }, [loadAll]);

  const allPosts = useMemo(() => {
    if (clipPosts.length === 0) return STATIC_POSTS;
    const merged: Post[] = [...STATIC_POSTS];
    const step = Math.max(2, Math.floor(STATIC_POSTS.length / (clipPosts.length + 1)));
    clipPosts.forEach((clip, i) => {
      const insertAt = Math.min(step * (i + 1) + i, merged.length);
      merged.splice(insertAt, 0, clip);
    });
    return merged;
  }, [clipPosts]);

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

      {clipPosts.length > 0 && (
        <View style={styles.clipBanner}>
          <View style={styles.clipBannerDot} />
          <Text style={styles.clipBannerText}>
            {clipPosts.length} AI edit{clipPosts.length !== 1 ? "s" : ""} live in your feed
          </Text>
        </View>
      )}

      {loading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading…</Text>
        </View>
      )}

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
      <View style={[styles.thumbWrap, { aspectRatio: 1 / post.ratio }]}>
        {post.imageSource ? (
          <Image source={post.imageSource} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
        ) : post.gradientCard ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: post.gradientCard.topColor }]}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: post.gradientCard.bottomColor, opacity: 0.6 }]} />
            <View style={styles.gradientCardInner}>
              {post.gradientCard.label && (
                <Text style={[styles.gradientLabel, { color: post.gradientCard.textColor ?? "#FFF" }]}>
                  {post.gradientCard.label}
                </Text>
              )}
              <Text style={[styles.gradientMain, { color: post.gradientCard.textColor ?? "#FFF" }]}>
                {post.gradientCard.mainText}
              </Text>
            </View>
          </View>
        ) : post.textCard ? (
          <View style={[StyleSheet.absoluteFill, styles.textCardWrap, { backgroundColor: post.textCard.bg }]}>
            {post.textCard.secondaryText && (
              <Text style={[styles.textCardSecondary, { color: post.textCard.textColor }]}>
                {post.textCard.secondaryText}
              </Text>
            )}
            <Text style={[styles.textCardMain, { color: post.textCard.textColor }]}>
              {post.textCard.cardText}
            </Text>
          </View>
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: post.tintB }]}>
            <View style={[StyleSheet.absoluteFill, { backgroundColor: post.tintA, opacity: 0.35 }]} />
          </View>
        )}

        {post.isClip && (
          <View style={[styles.badge, styles.badgeClip]}>
            <Text style={styles.badgeText}>YOUR CLIP</Text>
          </View>
        )}
        {post.isLive && (
          <View style={[styles.badge, styles.badgeLive]}>
            <View style={styles.liveDot} />
            <Text style={styles.badgeText}>LIVE</Text>
          </View>
        )}
        {post.isVideo && (
          <View style={styles.playBtn}>
            <Text style={styles.playIcon}>▶</Text>
          </View>
        )}
      </View>

      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>{post.title}</Text>
        <View style={styles.cardMeta}>
          <View style={[styles.avatar, post.isClip && styles.avatarClip]} />
          <Text style={styles.cardAuthor} numberOfLines={1}>{post.author}</Text>
          <Text style={[styles.cardLike, post.isClip && styles.cardLikeClip]}>
            ♡ {fmtLikes(post.likes)}
          </Text>
        </View>
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
  searchIcon: { fontSize: 22, color: COLORS.text },

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
    backgroundColor: COLORS.primaryBg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,36,66,0.2)",
  },
  clipBannerDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.primary },
  clipBannerText: { fontSize: FONT_SIZES.sm, color: COLORS.primary, fontWeight: WEIGHTS.medium },

  loadingRow: {
    flexDirection: "row", alignItems: "center", gap: SPACING.sm,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
  },
  loadingText: { fontSize: FONT_SIZES.sm, color: COLORS.textMuted },

  feedScroll: { flex: 1 },
  feedContent: { paddingHorizontal: SPACING.sm, paddingTop: SPACING.sm, paddingBottom: 120 },
  grid: { flexDirection: "row", gap: SPACING.sm },
  col: { flex: 1, gap: SPACING.md },

  card: {
    width: "100%", alignSelf: "stretch",
    borderRadius: RADII.md, overflow: "hidden",
    backgroundColor: COLORS.surface,
    ...SHADOWS.card,
  },
  thumbWrap: { width: "100%", alignSelf: "stretch", borderRadius: RADII.md, overflow: "hidden" },
  cardBody: { paddingHorizontal: SPACING.xs, paddingTop: SPACING.sm, paddingBottom: SPACING.sm },

  gradientCardInner: {
    ...StyleSheet.absoluteFillObject,
    padding: SPACING.md, justifyContent: "flex-end", paddingBottom: SPACING.lg,
  },
  gradientLabel: {
    fontSize: 10, fontWeight: WEIGHTS.semibold, letterSpacing: 0.6,
    opacity: 0.8, marginBottom: SPACING.xs,
  },
  gradientMain: { fontSize: 18, fontWeight: WEIGHTS.bold, lineHeight: 26 },

  textCardWrap: { padding: SPACING.md, justifyContent: "center" },
  textCardSecondary: {
    fontSize: FONT_SIZES.xs, fontWeight: WEIGHTS.medium,
    opacity: 0.55, marginBottom: SPACING.xs, letterSpacing: 0.4,
  },
  textCardMain: { fontSize: 14, fontWeight: WEIGHTS.bold, lineHeight: 21 },

  badge: {
    position: "absolute", top: 8, left: 8,
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: RADII.full, gap: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  badgeClip: { backgroundColor: COLORS.primary },
  badgeLive: { left: undefined, right: 8, backgroundColor: COLORS.primary },
  badgeText: { fontSize: 9, color: "#FFFFFF", fontWeight: WEIGHTS.bold, letterSpacing: 0.6 },
  liveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: "#FFFFFF" },

  playBtn: {
    position: "absolute", bottom: SPACING.sm, right: SPACING.sm,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center", justifyContent: "center",
  },
  playIcon: { fontSize: 9, color: "#FFFFFF", marginLeft: 1 },

  cardTitle: {
    fontSize: FONT_SIZES.md, color: COLORS.text, fontWeight: WEIGHTS.medium,
    lineHeight: 18,
  },
  cardMeta: {
    flexDirection: "row", alignItems: "center",
    paddingTop: SPACING.xs, gap: 6,
  },
  avatar: { width: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.surfaceLight },
  avatarClip: { backgroundColor: COLORS.primary },
  cardAuthor: { flex: 1, fontSize: FONT_SIZES.xs + 1, color: COLORS.textSecondary, fontWeight: WEIGHTS.regular },
  cardLike: { fontSize: FONT_SIZES.xs + 1, color: COLORS.textSecondary, fontWeight: WEIGHTS.regular },
  cardLikeClip: { color: COLORS.primary, fontWeight: WEIGHTS.semibold },
});
