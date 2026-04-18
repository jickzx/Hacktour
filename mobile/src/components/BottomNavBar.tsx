/**
 * BottomNavBar — XHS-style 5-slot tab bar.
 * Slots: Home | Library | [Live FAB] | Edit | Profile
 */
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { COLORS, RADII, SPACING, WEIGHTS } from "../constants/theme";

export type Tab = "home" | "library" | "edit" | "live";

interface BottomNavBarProps {
  activeTab: Tab;
  onTabPress: (tab: Tab) => void;
}

export default function BottomNavBar({ activeTab, onTabPress }: BottomNavBarProps) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        <NavItem icon="⌂" label="Home" active={activeTab === "home"} onPress={() => onTabPress("home")} />
        <NavItem icon="▦" label="Library" active={activeTab === "library"} onPress={() => onTabPress("library")} />

        {/* Centre FAB — always navigates to Live */}
        <TouchableOpacity style={styles.fab} onPress={() => onTabPress("live")} activeOpacity={0.85}>
          <Text style={styles.fabIcon}>+</Text>
        </TouchableOpacity>

        <NavItem icon="✂" label="Edit" active={activeTab === "edit"} onPress={() => onTabPress("edit")} />
        <NavItem icon="◔" label="Profile" active={false} onPress={() => onTabPress("home")} />
      </View>
    </View>
  );
}

function NavItem({
  icon, label, active, onPress,
}: {
  icon: string; label: string; active: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.tab} onPress={onPress} activeOpacity={0.7}>
      <Text style={[styles.icon, active && styles.iconActive]}>{icon}</Text>
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", bottom: 0, left: 0, right: 0 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: SPACING.xs },
  icon: { fontSize: 22, color: COLORS.textMuted, fontWeight: WEIGHTS.medium },
  iconActive: { color: COLORS.text },
  label: { fontSize: 11, color: COLORS.textMuted, fontWeight: WEIGHTS.medium, marginTop: 2, letterSpacing: 0.2 },
  labelActive: { color: COLORS.text, fontWeight: WEIGHTS.semibold },
  fab: {
    width: 56,
    height: 40,
    borderRadius: RADII.md,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: SPACING.sm,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  fabIcon: { fontSize: 28, color: "#FFFFFF", fontWeight: WEIGHTS.light, lineHeight: 30 },
});
