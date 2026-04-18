/**
 * LiveStreamScreen — fullscreen camera, translucent overlay UI.
 * Records audio via expo-av, sends to backend /api/transcribe (Gemini),
 * console.logs the transcript and surfaces it in chat.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Alert,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Animated,
  KeyboardAvoidingView,
} from "react-native";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import * as Speech from "expo-speech";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, SPACING, RADII } from "../constants/theme";
import type { AssistantAction } from "../../App";

// ─── Config ───────────────────────────────────────────────────────────────────

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://100.80.219.114:3001";

// Record in ~5s chunks for rolling transcription
const CHUNK_MS = 5000;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Comment {
  id: string;
  user: string;
  text: string;
  avatar: string;
  isTranscript?: boolean;
}


// ─── Component ────────────────────────────────────────────────────────────────

const { height: SCREEN_H } = Dimensions.get("window");

// Wake word variants — "zee", "z", "zy", "zed", "hey z", "hey zee"
const WAKE_WORDS = /\b(zee|zed|zy|hey\s*z(?:ee|ed)?)\b/i;

interface Props {
  onAssistantAction: (action: AssistantAction) => void;
  pendingAction: AssistantAction | null;
  onPendingActionConsumed: () => void;
}

export default function LiveStreamScreen({ onAssistantAction, pendingAction, onPendingActionConsumed }: Props) {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [isLive, setIsLive] = useState(false);
  const [viewers, setViewers] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [facing, setFacing] = useState<"front" | "back">("front");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeStatus, setTranscribeStatus] = useState("");

  const scrollRef = useRef<ScrollView>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const cameraRef = useRef<CameraView>(null);
  const isRecordingRef = useRef(false);
  const isLiveRef = useRef(false);
  const isTranscribingRef = useRef(false);
  const transcriptContextRef = useRef<string[]>([]);
  const [assistantActive, setAssistantActive] = useState(false);
  isLiveRef.current = isLive;
  isTranscribingRef.current = isTranscribing;

  const granted = cameraPermission?.granted && micPermission?.granted;

  // ── Pulse animation ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isLive) { pulseAnim.setValue(1); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.6, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isLive]);

  // ── Timers ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isLive) return;
    const t = setInterval(() => setDuration((d) => d + 1), 1000);
    return () => clearInterval(t);
  }, [isLive]);

  useEffect(() => {
    if (!isLive) return;
    const t = setInterval(() => {
      setViewers((v) => Math.max(1, v + Math.floor((Math.random() - 0.25) * 12)));
    }, 2000);
    return () => clearInterval(t);
  }, [isLive]);

  // ── Comments ─────────────────────────────────────────────────────────────────

  const pushComment = useCallback((c: Comment) => {
    setComments((prev) => [...prev.slice(-80), c]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
  }, []);

  const pushCommentsWithDelay = useCallback((
    newComments: Array<{ user: string; text: string; avatar: string }>
  ) => {
    // Drip them in one at a time with random delays so it feels live
    newComments.forEach((c, i) => {
      setTimeout(() => {
        pushComment({ id: `ai-${Date.now()}-${i}`, ...c });
      }, i * (400 + Math.random() * 300));
    });
  }, [pushComment]);


  // ── Assistant: handle pendingAction from App.tsx ─────────────────────────────

  useEffect(() => {
    if (!pendingAction || pendingAction.type === "none") return;
    switch (pendingAction.type) {
      case "go_live":      if (!isLive) handleGoLive(); break;
      case "end_stream":   if (isLive) handleEndStream(); break;
      case "mute":         setIsMuted(true); break;
      case "unmute":       setIsMuted(false); break;
      case "flip_camera":  setFacing(f => f === "front" ? "back" : "front"); break;
    }
    onPendingActionConsumed();
  }, [pendingAction]); // eslint-disable-line

  // ── Assistant: detect wake word in transcript ─────────────────────────────────

  const triggerAssistant = useCallback(async (fullTranscript: string) => {
    const match = fullTranscript.match(WAKE_WORDS);
    if (!match) return;

    // Extract everything after the wake word as the command
    const afterWake = fullTranscript.slice(fullTranscript.indexOf(match[0]) + match[0].length).trim();
    const command = afterWake || "hello";

    console.log(`[Zee] Wake word detected, command: "${command}"`);
    setAssistantActive(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, context: transcriptContextRef.current }),
      });
      const data = await res.json();
      console.log(`[Zee] Response: "${data.response}", Action:`, data.action);

      // Speak the response
      if (data.response) {
        Speech.speak(data.response, { language: "en", rate: 1.1, pitch: 1.0 });
      }

      // Show as a special comment
      pushComment({
        id: `zee-${Date.now()}`,
        user: "⚡ Zee",
        text: data.response ?? "...",
        avatar: "🤖",
        isTranscript: false,
      });

      // Fire the action
      if (data.action && data.action.type !== "none") {
        onAssistantAction(data.action as AssistantAction);
      }
    } catch (err) {
      console.warn("[Zee] Error:", err);
    } finally {
      setAssistantActive(false);
    }
  }, [pushComment, onAssistantAction]);

  // ── Video+audio chunk → Gemini transcribe + react ────────────────────────────

  const processChunk = useCallback(async (uri: string) => {
    try {
      setTranscribeStatus("uploading…");
      console.log("[Chunk] Uploading:", uri, "to", BACKEND_URL);

      // Upload as multipart form — avoids huge JSON base64 payload
      const form = new FormData();
      form.append("video", { uri, name: "chunk.mov", type: "video/quicktime" } as any);
      // Pass rolling context as JSON string
      form.append("context", JSON.stringify(transcriptContextRef.current.slice(-4)));

      const res = await fetch(`${BACKEND_URL}/api/analyse`, {
        method: "POST",
        body: form,
      });

      console.log("[Chunk] Response status:", res.status);
      const data = await res.json();
      console.log("[Chunk] Response:", JSON.stringify(data).slice(0, 200));

      const transcript: string = data.transcript ?? "";
      if (transcript) {
        console.log(`[Streamer] ${transcript}`);
        pushComment({
          id: `transcript-${Date.now()}`,
          user: "🎙 you (live)",
          text: transcript,
          avatar: "🎤",
          isTranscript: true,
        });
        transcriptContextRef.current = [...transcriptContextRef.current.slice(-4), transcript];

        // Check for wake word — if detected, assistant handles this chunk, skip viewer reactions
        if (WAKE_WORDS.test(transcript)) {
          triggerAssistant(transcript);
          setTranscribeStatus("");
          return;
        }
      }

      if (Array.isArray(data.comments)) pushCommentsWithDelay(data.comments);

      setTranscribeStatus("");
    } catch (err) {
      console.warn("[Chunk] Error:", err);
      setTranscribeStatus("upload error");
      setTimeout(() => setTranscribeStatus(""), 2000);
    }
  }, [pushComment, pushCommentsWithDelay]);

  const recordNextChunk = useCallback(async () => {
    if (!isLiveRef.current || !isTranscribingRef.current) {
      console.log("[Record] Skipping — live:", isLiveRef.current, "transcribing:", isTranscribingRef.current);
      return;
    }
    if (!cameraRef.current) {
      console.warn("[Record] No camera ref");
      return;
    }
    if (isRecordingRef.current) return;
    try {
      isRecordingRef.current = true;
      console.log("[Record] Starting chunk…");
      const video = await cameraRef.current.recordAsync({ maxDuration: CHUNK_MS / 1000 });
      isRecordingRef.current = false;
      console.log("[Record] Chunk done, uri:", video?.uri);
      if (video?.uri) processChunk(video.uri);
      if (isLiveRef.current && isTranscribingRef.current) recordNextChunk();
    } catch (err) {
      isRecordingRef.current = false;
      console.warn("[Record] Error:", err);
    }
  }, [processChunk]);

  const stopRecording = useCallback(async () => {
    if (isRecordingRef.current && cameraRef.current) {
      try { cameraRef.current.stopRecording(); } catch {}
    }
    isRecordingRef.current = false;
    setIsTranscribing(false);
    setTranscribeStatus("");
    console.log("[Recording] Stopped.");
  }, []);

  useEffect(() => {
    if (isTranscribing && isLive) recordNextChunk();
  }, [isTranscribing]); // eslint-disable-line

  // ── Permissions ──────────────────────────────────────────────────────────────

  const requestPermissions = async () => {
    const cam = await requestCameraPermission();
    const mic = await requestMicPermission();
    if (!cam.granted || !mic.granted) {
      Alert.alert(
        "Permissions Required",
        "Allow camera & microphone in Settings to go live."
      );
    }
  };

  // ── Stream controls ──────────────────────────────────────────────────────────

  const handleGoLive = () => {
    setIsLive(true);
    setViewers(Math.floor(Math.random() * 30) + 8);
    setDuration(0);
    // Auto-start transcription — small delay to let camera settle
    setTimeout(() => setIsTranscribing(true), 800);
  };

  const handleEndStream = () => {
    Alert.alert("End Stream", "End the live stream?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End", style: "destructive",
        onPress: async () => {
          await stopRecording();
          setIsLive(false);
          setViewers(0);
          setDuration(0);
        },
      },
    ]);
  };

  const handleToggleTranscribe = () => {
    if (isTranscribing) {
      stopRecording();
    } else {
      setIsTranscribing(true);
    }
  };

  const handleSendComment = () => {
    if (!chatInput.trim() || !isLive) return;
    pushComment({ id: `${Date.now()}`, user: "you", text: chatInput.trim(), avatar: "🎤" });
    setChatInput("");
  };

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* ── LAYER 1: Fullscreen camera ── */}
      {granted && !isCamOff ? (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} mode="video" />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.camFallback]}>
          {!granted ? (
            <>
              <Text style={styles.camFallbackIcon}>🎥</Text>
              <Text style={styles.camFallbackText}>Camera & Mic Access Required</Text>
            </>
          ) : (
            <>
              <Text style={styles.camFallbackIcon}>📷</Text>
              <Text style={styles.camFallbackText}>Camera Off</Text>
            </>
          )}
        </View>
      )}

      {/* ── LAYER 2: Overlay UI ── */}
      <View style={styles.overlay} pointerEvents="box-none">

        {/* TOP BAR */}
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            <LinearGradient
              colors={[COLORS.gradientStart, COLORS.gradientEnd]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.logoBar}
            />
            <Text style={styles.brand}>Stream Mind</Text>
          </View>

          {isLive && (
            <View style={styles.topCenter}>
              <View style={styles.livePillWrap}>
                <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
                <Text style={styles.livePillText}>LIVE</Text>
              </View>
              <Text style={styles.durationText}>{fmt(duration)}</Text>
            </View>
          )}

          <View style={styles.topRight}>
            {isLive && (
              <View style={styles.viewersChip}>
                <Text style={styles.viewersText}>👁 {viewers.toLocaleString()}</Text>
              </View>
            )}
            {isLive && (
              <TouchableOpacity style={styles.endChip} onPress={handleEndStream}>
                <Text style={styles.endChipText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Zee assistant banner */}
        {assistantActive && (
          <View style={[styles.statusBanner, styles.zeeBanner]} pointerEvents="none">
            <Text style={styles.zeeText}>⚡ Zee is thinking…</Text>
          </View>
        )}

        {/* Transcribe status banner */}
        {!assistantActive && (isTranscribing || transcribeStatus.length > 0) && (
          <View style={styles.statusBanner} pointerEvents="none">
            <Text style={styles.statusText}>
              🗣 {transcribeStatus.length > 0 ? transcribeStatus : isRecordingRef.current ? "recording…" : "starting…"}
            </Text>
          </View>
        )}

        {/* Pre-permission prompt */}
        {!granted && (
          <View style={styles.permCenter}>
            <Text style={styles.permIcon}>🎥</Text>
            <Text style={styles.permTitle}>Camera & Mic Access</Text>
            <Text style={styles.permSub}>Required to go live</Text>
            <TouchableOpacity style={styles.permBtn} onPress={requestPermissions} activeOpacity={0.85}>
              <LinearGradient
                colors={[COLORS.gradientStart, COLORS.gradientEnd]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.permBtnGrad}
              >
                <Text style={styles.permBtnText}>Allow Access</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* BOTTOM OVERLAY */}
        <View style={styles.bottomOverlay} pointerEvents="box-none">

          {/* Right side action buttons */}
          {granted && (
            <View style={styles.sideActions}>
              <TouchableOpacity
                style={[styles.sideBtn, isMuted && styles.sideBtnRed]}
                onPress={() => setIsMuted((m) => !m)}
              >
                <Text style={styles.sideBtnIcon}>{isMuted ? "🔇" : "🎙"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sideBtn, isCamOff && styles.sideBtnRed]}
                onPress={() => setIsCamOff((c) => !c)}
              >
                <Text style={styles.sideBtnIcon}>{isCamOff ? "📷" : "📸"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sideBtn}
                onPress={() => setFacing((f) => f === "front" ? "back" : "front")}
              >
                <Text style={styles.sideBtnIcon}>🔄</Text>
              </TouchableOpacity>
              {isLive && (
                <TouchableOpacity
                  style={[styles.sideBtn, isTranscribing && styles.sideBtnGreen]}
                  onPress={handleToggleTranscribe}
                >
                  <Text style={styles.sideBtnIcon}>🗣</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Chat panel (live only) */}
          {isLive && (
            <View style={styles.chatPanel} pointerEvents="box-none">
              <ScrollView
                ref={scrollRef}
                style={styles.chatScroll}
                contentContainerStyle={styles.chatContent}
                showsVerticalScrollIndicator={false}
                pointerEvents="none"
              >
                {comments.map((c) => (
                  <View
                    key={c.id}
                    style={[
                      styles.chatRow,
                      c.isTranscript && styles.chatRowTranscript,
                    ]}
                  >
                    <Text style={styles.chatAvatar}>{c.avatar}</Text>
                    <View style={styles.chatBubble}>
                      <Text style={[
                        styles.chatUser,
                        c.isTranscript && styles.chatUserTranscript,
                        c.user === "you" && styles.chatUserSelf,
                      ]}>
                        {c.user}
                      </Text>
                      <Text style={styles.chatMsg}>{c.text}</Text>
                    </View>
                  </View>
                ))}
              </ScrollView>

              <View style={styles.chatInputRow}>
                <TextInput
                  style={styles.chatInput}
                  value={chatInput}
                  onChangeText={setChatInput}
                  placeholder="Comment…"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  onSubmitEditing={handleSendComment}
                  returnKeyType="send"
                />
                <TouchableOpacity
                  style={[styles.sendBtn, !chatInput.trim() && styles.sendBtnDim]}
                  onPress={handleSendComment}
                  disabled={!chatInput.trim()}
                >
                  <Text style={styles.sendIcon}>↑</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Go Live button */}
          {granted && !isLive && (
            <TouchableOpacity style={styles.goLiveBtn} onPress={handleGoLive} activeOpacity={0.85}>
              <LinearGradient
                colors={[COLORS.error, "#991B1B"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={styles.goLiveGrad}
              >
                <Text style={styles.goLiveText}>● Go Live</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },

  camFallback: {
    backgroundColor: "#0a0a14",
    justifyContent: "center",
    alignItems: "center",
  },
  camFallbackIcon: { fontSize: 52 },
  camFallbackText: {
    fontSize: 15,
    color: "rgba(255,255,255,0.45)",
    marginTop: SPACING.sm,
    textAlign: "center",
    paddingHorizontal: SPACING.xl,
  },

  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "space-between" },

  // Top bar
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: SPACING.xxl + 12,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  topLeft: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, flex: 1 },
  logoBar: { width: 20, height: 3, borderRadius: 2 },
  brand: { fontSize: 16, fontWeight: "800", color: "#fff", letterSpacing: -0.3 },
  topCenter: { alignItems: "center", gap: 3, flex: 1 },
  livePillWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.error,
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 3,
    gap: 5,
  },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#fff" },
  livePillText: { fontSize: 11, fontWeight: "900", color: "#fff", letterSpacing: 1.5 },
  durationText: { fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.8)" },
  topRight: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, flex: 1, justifyContent: "flex-end" },
  viewersChip: {
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  viewersText: { fontSize: 12, fontWeight: "600", color: "#fff" },
  endChip: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  endChipText: { fontSize: 14, color: "#fff", fontWeight: "700" },

  // Status banner
  statusBanner: {
    marginHorizontal: SPACING.md,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: `${COLORS.accent}55`,
    alignSelf: "flex-start",
  },
  statusText: { fontSize: 12, color: COLORS.accent, fontStyle: "italic" },
  zeeBanner: { borderColor: "#facc1555", backgroundColor: "rgba(0,0,0,0.7)" },
  zeeText: { fontSize: 13, color: "#facc15", fontWeight: "700" },

  // Permission
  permCenter: {
    position: "absolute", top: "35%", left: 0, right: 0,
    alignItems: "center", paddingHorizontal: SPACING.xl,
  },
  permIcon: { fontSize: 52 },
  permTitle: { fontSize: 20, fontWeight: "800", color: "#fff", marginTop: SPACING.md, textAlign: "center" },
  permSub: { fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: SPACING.xs, marginBottom: SPACING.xl, textAlign: "center" },
  permBtn: { width: "80%" },
  permBtnGrad: { borderRadius: RADII.lg, paddingVertical: SPACING.md, alignItems: "center" },
  permBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },

  // Bottom overlay
  bottomOverlay: {
    paddingBottom: 96,
    paddingHorizontal: SPACING.md,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACING.sm,
  },

  // Side buttons
  sideActions: { gap: SPACING.sm, alignItems: "center", paddingBottom: SPACING.sm },
  sideBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
  },
  sideBtnRed: { borderColor: COLORS.error, backgroundColor: "rgba(239,68,68,0.25)" },
  sideBtnGreen: { borderColor: COLORS.accent, backgroundColor: `${COLORS.accent}33` },
  sideBtnIcon: { fontSize: 20 },

  // Chat
  chatPanel: { flex: 1, maxHeight: SCREEN_H * 0.42, gap: SPACING.sm },
  chatScroll: { flex: 1 },
  chatContent: { gap: 6, paddingBottom: SPACING.sm },
  chatRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  chatRowTranscript: {},
  chatAvatar: { fontSize: 16 },
  chatBubble: {
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: RADII.md,
    paddingHorizontal: 10, paddingVertical: 5,
    maxWidth: "88%",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  chatUser: { fontSize: 11, fontWeight: "700", color: COLORS.primaryLight, marginBottom: 1 },
  chatUserSelf: { color: COLORS.accent },
  chatUserTranscript: { color: "#facc15" },
  chatMsg: { fontSize: 13, color: "rgba(255,255,255,0.92)", lineHeight: 17 },
  chatInputRow: { flexDirection: "row", gap: SPACING.sm, alignItems: "center" },
  chatInput: {
    flex: 1, height: 40, borderRadius: RADII.full,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: SPACING.md, fontSize: 14, color: "#fff",
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.primary,
    alignItems: "center", justifyContent: "center",
  },
  sendBtnDim: { backgroundColor: "rgba(255,255,255,0.15)" },
  sendIcon: { fontSize: 18, color: "#fff", fontWeight: "700" },

  // Go live
  goLiveBtn: { flex: 1, marginBottom: SPACING.sm },
  goLiveGrad: { borderRadius: RADII.xl, paddingVertical: SPACING.md, alignItems: "center" },
  goLiveText: { fontSize: 17, fontWeight: "900", color: "#fff", letterSpacing: 0.5 },
});
