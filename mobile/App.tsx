/**
 * Root App component — custom tab navigator with floating bottom nav bar
 */
import { useState, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import AIEditScreen from "./src/screens/AIEditScreen";
import LiveStreamScreen from "./src/screens/LiveStreamScreen";
import HomeScreen from "./src/screens/HomeScreen";
import BottomNavBar, { Tab } from "./src/components/BottomNavBar";
import { COLORS } from "./src/constants/theme";

export type AssistantAction = {
  type: "navigate_tab" | "go_live" | "end_stream" | "mute" | "unmute" | "flip_camera" | "none";
  tab?: Tab;
};

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("edit");
  const [pendingAction, setPendingAction] = useState<AssistantAction | null>(null);

  const handleAssistantAction = useCallback((action: AssistantAction) => {
    if (action.type === "navigate_tab" && action.tab) {
      setActiveTab(action.tab);
    } else {
      // Pass non-navigation actions down to LiveStreamScreen
      setPendingAction(action);
    }
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={[styles.screen, activeTab !== "home" && styles.hidden]}>
        <HomeScreen />
      </View>
      <View style={[styles.screen, activeTab !== "edit" && styles.hidden]}>
        <AIEditScreen />
      </View>
      <View style={[styles.screen, activeTab !== "live" && styles.hidden]}>
        <LiveStreamScreen
          onAssistantAction={handleAssistantAction}
          pendingAction={pendingAction}
          onPendingActionConsumed={() => setPendingAction(null)}
        />
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
