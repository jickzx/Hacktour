/**
 * PollOverlay — live poll that floats over the stream, auto-votes via AI reactions
 */
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, SPACING, RADII, WEIGHTS } from "../constants/theme";

interface Props {
  question: string;
  options: string[];
  onClose: () => void;
  latestComment?: string;
}

export default function PollOverlay({ question, options, onClose, latestComment }: Props) {
  const [votes, setVotes] = useState<number[]>(() => options.map(() => 0));
  const slideAnim = useRef(new Animated.Value(-300)).current;
  const totalVotes = votes.reduce((a, b) => a + b, 0);

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => handleClose(), 30_000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!latestComment) return;
    const lower = latestComment.toLowerCase();
    options.forEach((opt, i) => {
      if (lower.includes(opt.toLowerCase())) {
        setVotes(prev => {
          const next = [...prev];
          next[i] += 1;
          return next;
        });
      }
    });
  }, [latestComment]);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: -300,
      duration: 250,
      useNativeDriver: true,
    }).start(onClose);
  };

  const pct = (i: number) =>
    totalVotes === 0 ? 0 : Math.round((votes[i] / totalVotes) * 100);

  const winnerIdx = votes.indexOf(Math.max(...votes));

  return (
    <Animated.View style={[styles.container, { transform: [{ translateX: slideAnim }] }]}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.pollBadge}>
            <Text style={styles.pollBadgeText}>📊 POLL</Text>
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="close" size={16} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        <Text style={styles.question}>{question}</Text>

        {options.map((opt, i) => {
          const p = pct(i);
          const isWinning = totalVotes > 0 && i === winnerIdx;
          return (
            <View key={opt} style={styles.optionWrap}>
              <View style={styles.optionRow}>
                <Text style={[styles.optionLabel, isWinning && styles.optionLabelWinning]}>
                  {opt}
                </Text>
                <Text style={[styles.optionPct, isWinning && styles.optionPctWinning]}>
                  {p}%
                </Text>
              </View>
              <View style={styles.barBg}>
                <Animated.View
                  style={[
                    styles.barFill,
                    { width: `${p}%` as any },
                    isWinning && styles.barFillWinning,
                  ]}
                />
              </View>
            </View>
          );
        })}

        <Text style={styles.footer}>
          {totalVotes} vote{totalVotes !== 1 ? "s" : ""} · reacting live
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 110,
    left: SPACING.md,
    width: 240,
    zIndex: 100,
  },
  card: {
    borderRadius: RADII.xl,
    padding: SPACING.lg,
    backgroundColor: COLORS.glassDark,
    borderWidth: 1,
    borderColor: COLORS.glassBorder,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  pollBadge: {
    backgroundColor: COLORS.accent,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm + 2,
    paddingVertical: 3,
  },
  pollBadgeText: {
    fontSize: 10,
    fontWeight: WEIGHTS.heavy,
    color: "#fff",
    letterSpacing: 1.2,
  },
  closeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnText: {
    fontSize: 12,
    color: "rgba(255,255,255,0.5)",
    fontWeight: WEIGHTS.bold,
  },
  question: {
    fontSize: 14,
    fontWeight: WEIGHTS.bold,
    color: "#fff",
    marginBottom: SPACING.lg,
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  optionWrap: {
    marginBottom: SPACING.md,
  },
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  optionLabel: {
    fontSize: 12,
    fontWeight: WEIGHTS.semibold,
    color: "rgba(255,255,255,0.7)",
  },
  optionLabelWinning: {
    color: "#fff",
  },
  optionPct: {
    fontSize: 12,
    fontWeight: WEIGHTS.bold,
    color: "rgba(255,255,255,0.45)",
  },
  optionPctWinning: {
    color: COLORS.accent,
  },
  barBg: {
    height: 7,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: RADII.full,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: COLORS.surfaceLight,
    borderRadius: RADII.full,
  },
  barFillWinning: {
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 2,
  },
  footer: {
    fontSize: 10,
    color: "rgba(255,255,255,0.3)",
    marginTop: SPACING.sm,
    textAlign: "right",
    letterSpacing: 0.3,
  },
});
