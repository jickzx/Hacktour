/**
 * HomeScreen — XHS dark explore feed.
 * Top tabs (Following / Explore / Nearby) + category strip + 2-col masonry.
 * Mock data for now — wire to backend later.
 */
import { useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS, FONT_SIZES, RADII, SPACING, WEIGHTS } from "../constants/theme";

const TOP_TABS = ["Following", "Explore", "Nearby"] as const;
type TopTab = (typeof TOP_TABS)[number];

const CATEGORIES = [
  "For You",
  "Video",
  "Live",
  "Fashion",
  "Food",
  "Travel",
  "Beauty",
] as const;

interface Post {
  id: string;
  title: string;
  author: string;
  likes: number;
  /** Aspect-ratio height multiplier — creates masonry effect */
  ratio: number;
  tintA: string;
  tintB: string;
  isLive?: boolean;
  isVideo?: boolean;
  overlay?: string;
}

const MOCK_POSTS: Post[] = [
  { id: "p1", title: "Tap to read", author: "JessGuan", likes: 4902, ratio: 1.35, tintA: "#B8C9D9", tintB: "#6B8BAA", overlay: "🇹🇷 🤍" },
  { id: "p2", title: "Anthropic Onsite 面试已回 👉 聊聊真实体验", author: "Dreamer 妍妍", likes: 1032, ratio: 0.95, tintA: "#E8D4B8", tintB: "#C89968" },
  { id: "p3", title: "四月一号伦敦逛逛", author: "小红薯 69D9F0A1", likes: 161, ratio: 1.45, tintA: "#3A3028", tintB: "#1A1410", isVideo: true, overlay: "伦敦逛逛" },
  { id: "p4", title: "纪念第一个暑期实习 offer", author: "ASTRI内推", likes: 2156, ratio: 1.1, tintA: "#F0E8DC", tintB: "#D4C4A8" },
  { id: "p5", title: "London coffee guide — best flat whites", author: "coffeelvr", likes: 842, ratio: 1.2, tintA: "#8B5A3C", tintB: "#3D2617", isVideo: true },
  { id: "p6", title: "面试准备 | 从简历到 offer", author: "techgirl", likes: 3244, ratio: 1.05, tintA: "#FFB8C8", tintB: "#FF2442", isLive: true },
  { id: "p7", title: "Istanbul Bosphorus sunset 🌅", author: "traveldiaries", likes: 567, ratio: 1.3, tintA: "#FF8A65", tintB: "#C04A1B" },
  { id: "p8", title: "Hackathon weekend recap", author: "builderlife", likes: 1890, ratio: 0.98, tintA: "#2E2E3A", tintB: "#0F0F14" },
];

export default function HomeScreen() {
  const [topTab, setTopTab] = useState<TopTab>("Explore");
  const [category, setCategory] = useState<string>("For You");

  const { leftCol, rightCol } = useMemo(() => {
    const left: Post[] = [];
    const right: Post[] = [];
    let leftH = 0;
    let rightH = 0;
    MOCK_POSTS.forEach((p) => {
      if (leftH <= rightH) {
        left.push(p);
        leftH += p.ratio;
      } else {
        right.push(p);
        rightH += p.ratio;
      }
    });
    return { leftCol: left, rightCol: right };
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.menuBtn}>
          <Text style={styles.menuIcon}>☰</Text>
        </TouchableOpacity>

        <View style={styles.tabRow}>
          {TOP_TABS.map((t) => (
            <TouchableOpacity key={t} onPress={() => setTopTab(t)} style={styles.tabBtn}>
              <Text style={[styles.tabText, topTab === t && styles.tabTextActive]}>
                {t}
              </Text>
              {topTab === t && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.searchBtn}>
          <Text style={styles.searchIcon}>⌕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.categoryWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryContent}
        >
          {CATEGORIES.map((c) => (
            <TouchableOpacity key={c} onPress={() => setCategory(c)} style={styles.chip}>
              <Text style={[styles.chipText, category === c && styles.chipTextActive]}>
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.chipChevron}>
          <Text style={styles.chipChevronText}>⌄</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.feedScroll}
        contentContainerStyle={styles.feedContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          <View style={styles.col}>
            {leftCol.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </View>
          <View style={styles.col}>
            {rightCol.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function PostCard({ post }: { post: Post }) {
  const formatLikes = (n: number) =>
    n >= 10000 ? `${(n / 10000).toFixed(1)}w` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.85}>
      <View style={[styles.thumb, { aspectRatio: 1 / post.ratio, backgroundColor: post.tintB }]}>
        <View style={[styles.thumbTint, { backgroundColor: post.tintA, opacity: 0.35 }]} />
        {post.overlay && <Text style={styles.thumbOverlay}>{post.overlay}</Text>}
        {post.isLive && (
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
        )}
        {post.isVideo && !post.isLive && (
          <View style={styles.videoBadge}>
            <Text style={styles.videoBadgeIcon}>▶</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardTitle} numberOfLines={2}>
        {post.title}
      </Text>
      <View style={styles.cardMeta}>
        <View style={styles.avatar} />
        <Text style={styles.cardAuthor} numberOfLines={1}>
          {post.author}
        </Text>
        <Text style={styles.cardLike}>♡ {formatLikes(post.likes)}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Header row
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: SPACING.xxl + 16,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.md,
    gap: SPACING.md,
  },
  menuBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  menuIcon: {
    fontSize: 20,
    color: COLORS.text,
    fontWeight: WEIGHTS.regular,
  },
  tabRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xl,
  },
  tabBtn: {
    alignItems: "center",
    paddingVertical: 4,
  },
  tabText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textMuted,
    fontWeight: WEIGHTS.semibold,
  },
  tabTextActive: {
    color: COLORS.text,
    fontWeight: WEIGHTS.bold,
  },
  tabUnderline: {
    marginTop: 4,
    width: 20,
    height: 2,
    borderRadius: 1,
    backgroundColor: COLORS.primary,
  },
  searchBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  searchIcon: {
    fontSize: 22,
    color: COLORS.text,
    fontWeight: WEIGHTS.regular,
  },

  // Category chip strip
  categoryWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: SPACING.lg,
    paddingBottom: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
  },
  categoryContent: {
    gap: SPACING.lg,
    paddingRight: SPACING.md,
    alignItems: "center",
  },
  chip: {
    paddingVertical: SPACING.xs,
  },
  chipText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textMuted,
    fontWeight: WEIGHTS.medium,
  },
  chipTextActive: {
    color: COLORS.text,
    fontWeight: WEIGHTS.bold,
  },
  chipChevron: {
    width: 40,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.background,
  },
  chipChevronText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },

  // Feed grid
  feedScroll: { flex: 1 },
  feedContent: {
    paddingHorizontal: SPACING.sm,
    paddingTop: SPACING.sm,
    paddingBottom: 120, // clear bottom nav
  },
  grid: {
    flexDirection: "row",
    gap: SPACING.sm,
  },
  col: {
    flex: 1,
    gap: SPACING.md,
  },

  // Card
  card: {
    borderRadius: RADII.md,
    overflow: "hidden",
  },
  thumb: {
    width: "100%",
    borderRadius: RADII.md,
    overflow: "hidden",
    justifyContent: "flex-end",
    padding: SPACING.sm,
  },
  thumbTint: {
    ...StyleSheet.absoluteFillObject,
  },
  thumbOverlay: {
    color: "#FFFFFF",
    fontSize: FONT_SIZES.xl,
    fontWeight: WEIGHTS.bold,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  liveBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADII.full,
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FFFFFF",
  },
  liveBadgeText: {
    fontSize: 10,
    color: "#FFFFFF",
    fontWeight: WEIGHTS.bold,
    letterSpacing: 0.8,
  },
  videoBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  videoBadgeIcon: {
    fontSize: 10,
    color: "#FFFFFF",
    marginLeft: 2,
  },
  cardTitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.text,
    fontWeight: WEIGHTS.medium,
    paddingHorizontal: SPACING.xs,
    paddingTop: SPACING.sm,
    lineHeight: 18,
  },
  cardMeta: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.xs,
    paddingTop: SPACING.xs,
    paddingBottom: SPACING.sm,
    gap: 6,
  },
  avatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.surfaceLight,
  },
  cardAuthor: {
    flex: 1,
    fontSize: FONT_SIZES.xs + 1,
    color: COLORS.textSecondary,
    fontWeight: WEIGHTS.regular,
  },
  cardLike: {
    fontSize: FONT_SIZES.xs + 1,
    color: COLORS.textSecondary,
    fontWeight: WEIGHTS.regular,
  },
});
