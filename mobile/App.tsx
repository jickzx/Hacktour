/**
 * Root App component — custom tab navigator with floating bottom nav bar
 */
import { useState, useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";
import AIEditScreen from "./src/screens/AIEditScreen";
import LiveStreamScreen from "./src/screens/LiveStreamScreen";
import HomeScreen from "./src/screens/HomeScreen";
import LibraryScreen from "./src/screens/LibraryScreen";
import BottomNavBar, { Tab } from "./src/components/BottomNavBar";
import { COLORS } from "./src/constants/theme";

export type AssistantAction = {
  type: "navigate_tab" | "go_live" | "end_stream" | "mute" | "unmute" | "flip_camera" | "create_poll" | "close_poll" | "emoji_mode" | "hype" | "shoutout" | "countdown" | "none";
  tab?: Tab;
  poll?: { question: string; options: string[] };
  /** for shoutout: the username to shout out */
  user?: string;
  /** for countdown: seconds (default 5) */
  seconds?: number;
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
      <View style={[styles.screen, activeTab !== "library" && styles.hidden]}>
        <LibraryScreen />
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
