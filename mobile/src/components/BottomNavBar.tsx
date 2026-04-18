/**
 * BottomNavBar — floating icon-only navbar with black gradient fade at bottom
 */
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, RADII } from "../constants/theme";

export type Tab = "edit" | "live" | "home" | "library" | "settings";

const NAV_ITEMS: { id: Tab; icon: string }[] = [
  { id: "home", icon: "⌂" },
  { id: "edit", icon: "✦" },
  { id: "live", icon: "◉" },
  { id: "library", icon: "▦" },
  { id: "settings", icon: "⚙" },
];

interface BottomNavBarProps {
  activeTab: Tab;
  onTabPress: (tab: Tab) => void;
}

export default function BottomNavBar({ activeTab, onTabPress }: BottomNavBarProps) {
  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Black fade gradient */}
      <LinearGradient
        colors={["transparent", "rgba(0,0,0,0.85)"]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Icons row */}
      <View style={styles.row}>
        {NAV_ITEMS.map(({ id, icon }) => {
          const isActive = activeTab === id;
          return (
            <TouchableOpacity
              key={id}
              style={styles.tab}
              onPress={() => onTabPress(id)}
              activeOpacity={0.6}
            >
              <Text style={[styles.icon, isActive && styles.iconActive]}>
                {icon}
              </Text>
              {isActive && <View style={styles.dot} />}
              {id === "live" && !isActive && <View style={styles.liveDot} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    justifyContent: "flex-end",
  },
  row: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingBottom: 24,
    gap: 44,
  },
  tab: {
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
  },
  icon: {
    fontSize: 22,
    color: "rgba(255,255,255,0.4)",
  },
  iconActive: {
    color: "#fff",
  },
  dot: {
    marginTop: 4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#fff",
  },
  liveDot: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.error,
  },
});
