/**
 * Root App component — custom tab navigator with floating bottom nav bar
 */
import { useState } from "react";
import { View, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import AIEditScreen from "./src/screens/AIEditScreen";
import LiveStreamScreen from "./src/screens/LiveStreamScreen";
import HomeScreen from "./src/screens/HomeScreen";
import BottomNavBar, { Tab } from "./src/components/BottomNavBar";
import { COLORS } from "./src/constants/theme";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("edit");

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Screens fill entire space — navbar floats above */}
      <View style={[styles.screen, activeTab !== "home" && styles.hidden]}>
        <HomeScreen />
      </View>
      <View style={[styles.screen, activeTab !== "edit" && styles.hidden]}>
        <AIEditScreen />
      </View>
      <View style={[styles.screen, activeTab !== "live" && styles.hidden]}>
        <LiveStreamScreen />
      </View>

      <BottomNavBar activeTab={activeTab} onTabPress={setActiveTab} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  screen: {
    ...StyleSheet.absoluteFillObject,
  },
  hidden: {
    display: "none",
  },
});
