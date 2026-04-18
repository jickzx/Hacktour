/**
 * LiveStreamScreen — fullscreen camera, translucent overlay UI.
 * Records audio via expo-audio, sends to backend /api/transcribe (Gemini),
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
import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync } from "expo-audio";
import * as Speech from "expo-speech";
import { LinearGradient } from "expo-linear-gradient";
import { COLORS, SPACING, RADII } from "../constants/theme";
import type { AssistantAction } from "../../App";
import PollOverlay from "../components/PollOverlay";

// ─── Config ───────────────────────────────────────────────────────────────────

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? "http://100.80.219.114:3001";

const AUDIO_CHUNK_MS = 3000;
const FRAME_INTERVAL_MS = 4000;

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

// Wake word variants — "panda", "hey panda", "ok panda", "yo panda", "panda go"
const WAKE_WORDS = /(?:^|\s)(hey\s+panda|ok\s+panda|yo\s+panda|panda\s+go|panda)(?:\s|,|!|$)/i;

const PANDA_COMMANDS = [
  { cmd: "hey panda go live", desc: "Start the stream" },
  { cmd: "hey panda end stream", desc: "End the stream" },
  { cmd: "hey panda mute", desc: "Mute your mic" },
  { cmd: "hey panda unmute", desc: "Unmute your mic" },
  { cmd: "hey panda flip camera", desc: "Switch front/back cam" },
  { cmd: "hey panda emoji mode", desc: "Toggle emoji-only chat" },
  { cmd: "hey panda hype", desc: "Blast hype into chat" },
  { cmd: "hey panda shoutout [user]", desc: "Shout out a viewer" },
  { cmd: "hey panda countdown 5", desc: "Start a countdown" },
  { cmd: "hey panda create poll cats or dogs", desc: "Start a chat poll" },
  { cmd: "hey panda close poll", desc: "Dismiss active poll" },
  { cmd: "hey panda go to edit", desc: "Navigate to edit tab" },
];

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
  const isVideoLoopRef = useRef(false);
  const isAudioLoopRef = useRef(false);
  const audioRecordingRef = useRef<InstanceType<typeof AudioModule.AudioRecorder> | null>(null);
  const isLiveRef = useRef(false);
  const isTranscribingRef = useRef(false);
  const transcriptContextRef = useRef<string[]>([]);
  const [assistantActive, setAssistantActive] = useState(false);
  const [activePoll, setActivePoll] = useState<{ question: string; options: string[] } | null>(null);
  const activePollRef = useRef(activePoll);
  const [latestAiComment, setLatestAiComment] = useState<string | undefined>();
  const [emojiMode, setEmojiMode] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const [copilot, setCopilot] = useState<{ suggestedReply: string; chatSummary: string; modAlert: string | null } | null>(null);
  const recentCommentsRef = useRef<string[]>([]);
  isLiveRef.current = isLive;
  activePollRef.current = activePoll;
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

  // ── Copilot insights (runs every 12s while live) ──────────────────────────────

  useEffect(() => {
    if (!isLive) { setCopilot(null); return; }
    const fetchCopilot = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/copilot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: recentCommentsRef.current.slice(-20),
            transcript: transcriptContextRef.current,
          }),
        });
        const data = await res.json();
        if (data.suggestedReply || data.chatSummary) setCopilot(data);
      } catch {}
    };
    fetchCopilot();
    const t = setInterval(fetchCopilot, 12_000);
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
        pushComment({ id: `ai-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`, ...c });
        setLatestAiComment(c.text);
        recentCommentsRef.current = [...recentCommentsRef.current.slice(-40), `${c.user}: ${c.text}`];
      }, i * (400 + Math.random() * 300));
    });
  }, [pushComment]);


  // ── Fake viewer votes while poll is active ───────────────────────────────────

  useEffect(() => {
    if (!activePoll) return;
    const FAKE_USERS = ["xX_fan99","stream_kid","lurker42","goated_viewer","hype_man7","w_commenter","chat_rat","vibes_only","lowkey_real","no_cap_bro"];
    const VOTE_TEMPLATES = (opt: string) => [
      opt, `${opt}!!`, `${opt} for sure`, `${opt} easy`, `${opt} 🔥`, `definitely ${opt}`, `gotta be ${opt}`, `${opt} no cap`, `${opt} W`
    ];
    const interval = setInterval(() => {
      // 2-4 votes per tick
      const count = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < count; i++) {
        const opt = activePoll.options[Math.random() < 0.55 ? 0 : 1]; // slight bias to first
        const templates = VOTE_TEMPLATES(opt);
        const text = templates[Math.floor(Math.random() * templates.length)];
        const user = FAKE_USERS[Math.floor(Math.random() * FAKE_USERS.length)];
        setTimeout(() => {
          pushComment({ id: `vote-${Date.now()}-${Math.random()}`, user, text, avatar: "👤" });
          setLatestAiComment(text);
        }, i * 300);
      }
    }, 1800);
    return () => clearInterval(interval);
  }, [activePoll, pushComment]);

  // ── Hype burst ───────────────────────────────────────────────────────────────

  const triggerHype = useCallback(() => {
    const HYPE_MSGS = [
      { user: "hype_man7", text: "LETS GOOO 🔥🔥🔥", avatar: "🔥" },
      { user: "w_commenter", text: "W streamer W", avatar: "👑" },
      { user: "chat_rat", text: "POGGERS", avatar: "😤" },
      { user: "goated_viewer", text: "GOAT fr 🐐", avatar: "🐐" },
      { user: "xX_fan99", text: "🚀🚀🚀", avatar: "🚀" },
      { user: "vibes_only", text: "slay bestie!!", avatar: "✨" },
      { user: "lurker42", text: "actually cracked", avatar: "😱" },
      { user: "no_cap_bro", text: "no cap this is peak", avatar: "💯" },
    ];
    pushCommentsWithDelay(HYPE_MSGS);
  }, [pushCommentsWithDelay]);

  // ── Shoutout ─────────────────────────────────────────────────────────────────

  const triggerShoutout = useCallback((user: string) => {
    const msgs = [
      { user: "🐼 Panda", text: `Big shoutout to @${user}! 🎉`, avatar: "🐼" },
      { user: "hype_man7", text: `@${user} W!!`, avatar: "🔥" },
      { user: "chat_rat", text: `lets gooo @${user}`, avatar: "😤" },
    ];
    pushCommentsWithDelay(msgs);
  }, [pushCommentsWithDelay]);

  // ── Countdown ────────────────────────────────────────────────────────────────

  const triggerCountdown = useCallback((seconds: number) => {
    const secs = Math.min(Math.max(seconds, 3), 10);
    for (let i = secs; i >= 0; i--) {
      setTimeout(() => {
        const text = i === 0 ? "🚀 GO! GO! GO!" : `${i}...`;
        pushComment({ id: `cd-${Date.now()}-${i}`, user: "🐼 Panda", text, avatar: "⏱", isTranscript: false });
        setLatestAiComment(text);
      }, (secs - i) * 1000);
    }
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
      case "create_poll":
        if (pendingAction.poll) setActivePoll(pendingAction.poll);
        break;
      case "close_poll":   setActivePoll(null); break;
      case "emoji_mode":   setEmojiMode(m => !m); break;
      case "hype":         triggerHype(); break;
      case "shoutout":     if (pendingAction.user) triggerShoutout(pendingAction.user); break;
      case "countdown":    triggerCountdown(pendingAction.seconds ?? 5); break;
    }
    onPendingActionConsumed();
  }, [pendingAction]); // eslint-disable-line

  // ── Assistant: detect wake word in transcript ─────────────────────────────────

  const triggerAssistant = useCallback(async (fullTranscript: string) => {
    const match = fullTranscript.match(WAKE_WORDS);
    if (!match) return;

    // Extract everything after the wake word as the command
    const afterWake = fullTranscript.slice(fullTranscript.indexOf(match[0]) + match[0].length).trim();
    const rawCommand = afterWake || "hello";
    // In emoji mode, append instruction so Zee replies in emojis
    const command = emojiMode ? `${rawCommand} (reply using emojis only, no words)` : rawCommand;

    console.log(`[Panda] Wake word detected, command: "${rawCommand}"`);
    setAssistantActive(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, context: transcriptContextRef.current }),
      });
      const data = await res.json();
      console.log(`[Panda] Response: "${data.response}", Action:`, data.action);

      // Speak the response
      if (data.response) {
        Speech.speak(data.response, { language: "en", rate: 1.1, pitch: 1.0 });
      }

      // Show as a special comment
      pushComment({
        id: `zee-${Date.now()}`,
        user: "🐼 Panda",
        text: data.response ?? "...",
        avatar: "🤖",
        isTranscript: false,
      });

      // Fire the action
      if (data.action && data.action.type !== "none") {
        onAssistantAction(data.action as AssistantAction);
      }
    } catch (err) {
      console.warn("[Panda] Error:", err);
    } finally {
      setAssistantActive(false);
    }
  }, [pushComment, onAssistantAction, emojiMode]);

  // ── Poll detection via Gemini function calling ────────────────────────────────
  // Cooldown: don't allow a new poll within 25s of the last one firing
  const lastPollTimeRef = useRef(0);

  const detectPoll = useCallback(async (transcript: string) => {
    if (activePollRef.current) return;
    const now = Date.now();
    if (now - lastPollTimeRef.current < 25_000) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/detect-poll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json();
      if (data.poll) {
        lastPollTimeRef.current = now;
        console.log(`[Poll] "${data.poll.options[0]}" vs "${data.poll.options[1]}"`);
        setActivePoll(data.poll);
        // Auto-close after 10s
        setTimeout(() => setActivePoll(null), 10_000);
      }
    } catch (err) {
      console.warn("[Poll] Error:", err);
    }
  }, []);

  // ── Fast audio-only transcription loop ───────────────────────────────────────

  const processAudioChunk = useCallback(async (uri: string) => {
    try {
      const form = new FormData();
      form.append("audio", { uri, name: "chunk.m4a", type: "audio/m4a" } as any);
      const res = await fetch(`${BACKEND_URL}/api/transcribe`, { method: "POST", body: form });
      const data = await res.json();
      const transcript: string = data.transcript ?? "";
      if (!transcript) return;

      console.log(`[Streamer] ${transcript}`);
      pushComment({ id: `transcript-${Date.now()}`, user: "🎙 you (live)", text: transcript, avatar: "🎤", isTranscript: true });
      transcriptContextRef.current = [...transcriptContextRef.current.slice(-4), transcript];

      if (WAKE_WORDS.test(transcript)) { triggerAssistant(transcript); return; }

      detectPoll(transcript);
    } catch (err) {
      console.warn("[Audio] Error:", err);
    }
  }, [pushComment]);

  const audioLoop = useCallback(async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) { console.warn("[Audio loop] Permission denied"); return; }
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    while (isAudioLoopRef.current) {
      try {
        const rec = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
        audioRecordingRef.current = rec;
        await rec.prepareToRecordAsync();
        rec.record();
        await new Promise(r => setTimeout(r, AUDIO_CHUNK_MS));
        await rec.stop();
        audioRecordingRef.current = null;
        const uri = rec.uri;
        if (uri && isAudioLoopRef.current) processAudioChunk(uri);
      } catch (err) {
        console.warn("[Audio loop] Error:", err);
        audioRecordingRef.current = null;
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }, [processAudioChunk]);

  // ── Slow video loop for AI comments ──────────────────────────────────────────

  const processFrame = useCallback(async (uri: string, base64: string) => {
    try {
      const form = new FormData();
      form.append("frame", { uri, name: "frame.jpg", type: "image/jpeg" } as any);
      form.append("base64", base64);
      form.append("context", JSON.stringify(transcriptContextRef.current.slice(-4)));
      form.append("emojiMode", emojiMode ? "1" : "0");
      const res = await fetch(`${BACKEND_URL}/api/analyse`, { method: "POST", body: form });
      const data = await res.json();
      if (Array.isArray(data.comments)) pushCommentsWithDelay(data.comments);
    } catch (err) {
      console.warn("[Frame] Error:", err);
    }
  }, [pushCommentsWithDelay, emojiMode]);

  const videoLoop = useCallback(async () => {
    while (isVideoLoopRef.current) {
      if (!cameraRef.current) { await new Promise(r => setTimeout(r, 500)); continue; }
      try {
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.3, base64: true, skipProcessing: true, width: 720 });
        if (photo?.uri && photo?.base64 && isVideoLoopRef.current) {
          processFrame(photo.uri, photo.base64);
        }
      } catch (err) {
        console.warn("[Frame loop] Error:", err);
      }
      await new Promise(r => setTimeout(r, FRAME_INTERVAL_MS));
    }
  }, [processFrame]);

  const stopRecording = useCallback(async () => {
    isAudioLoopRef.current = false;
    isVideoLoopRef.current = false;
    if (audioRecordingRef.current) {
      try { await audioRecordingRef.current.stop(); } catch {}
      audioRecordingRef.current = null;
    }
    if (isRecordingRef.current && cameraRef.current) {
      try { cameraRef.current.stopRecording(); } catch {}
    }
    isRecordingRef.current = false;
    setIsTranscribing(false);
    setTranscribeStatus("");
    console.log("[Recording] Stopped.");
  }, []);

  useEffect(() => {
    if (isTranscribing && isLive) {
      isAudioLoopRef.current = true;
      isVideoLoopRef.current = true;
      audioLoop();
      videoLoop();
    }
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
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} />
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

        {/* Poll overlay */}
        {activePoll && (
          <PollOverlay
            question={activePoll.question}
            options={activePoll.options}
            onClose={() => setActivePoll(null)}
            latestComment={latestAiComment}
          />
        )}

        {/* Copilot insights panel */}
        {isLive && copilot && !assistantActive && (
          <View style={styles.copilotPanel} pointerEvents="none">
            {copilot.modAlert && (
              <View style={styles.copilotRow}>
                <Text style={styles.copilotLabel}>⚠️ MOD</Text>
                <Text style={styles.copilotAlertText} numberOfLines={2}>{copilot.modAlert}</Text>
              </View>
            )}
            {copilot.chatSummary ? (
              <View style={styles.copilotRow}>
                <Text style={styles.copilotLabel}>💬</Text>
                <Text style={styles.copilotText} numberOfLines={2}>{copilot.chatSummary}</Text>
              </View>
            ) : null}
            {copilot.suggestedReply ? (
              <View style={styles.copilotRow}>
                <Text style={styles.copilotLabel}>🐼</Text>
                <Text style={[styles.copilotText, styles.copilotSuggest]} numberOfLines={2}>{copilot.suggestedReply}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Emoji mode banner */}
        {emojiMode && !assistantActive && (
          <View style={[styles.statusBanner, styles.emojiBanner]} pointerEvents="none">
            <Text style={styles.emojiModeText}>🎭 Emoji Mode ON</Text>
          </View>
        )}

        {/* Zee assistant banner */}
        {assistantActive && (
          <View style={[styles.statusBanner, styles.zeeBanner]} pointerEvents="none">
            <Text style={styles.zeeText}>🐼 Panda is thinking…</Text>
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
              {isLive && (
                <TouchableOpacity
                  style={[styles.sideBtn, emojiMode && styles.sideBtnPurple]}
                  onPress={() => setEmojiMode(m => !m)}
                >
                  <Text style={styles.sideBtnIcon}>🎭</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.sideBtn, showCommands && styles.sideBtnActive]}
                onPress={() => setShowCommands(v => !v)}
              >
                <Text style={styles.sideBtnIcon}>🐼</Text>
              </TouchableOpacity>
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

        {/* Commands sheet */}
        {showCommands && (
          <View style={styles.commandsSheet}>
            <View style={styles.commandsHeader}>
              <Text style={styles.commandsTitle}>🐼 Panda Commands</Text>
              <TouchableOpacity onPress={() => setShowCommands(false)}>
                <Text style={styles.commandsClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.commandsScroll} showsVerticalScrollIndicator={false}>
              {PANDA_COMMANDS.map((item, i) => (
                <View key={i} style={styles.commandRow}>
                  <Text style={styles.commandCmd}>{item.cmd}</Text>
                  <Text style={styles.commandDesc}>{item.desc}</Text>
                </View>
              ))}
              <View style={{ height: 12 }} />
            </ScrollView>
          </View>
        )}
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

  // Copilot panel
  copilotPanel: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.xs,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderRadius: RADII.md,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.4)",
    paddingHorizontal: SPACING.sm,
    paddingVertical: 6,
    gap: 4,
  },
  copilotRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  copilotLabel: { fontSize: 11, fontWeight: "800", color: "#a5b4fc", minWidth: 36 },
  copilotText: { fontSize: 11, color: "rgba(255,255,255,0.8)", flex: 1, lineHeight: 15 },
  copilotSuggest: { color: "#c4b5fd", fontStyle: "italic" },
  copilotAlertText: { fontSize: 11, color: "#f87171", flex: 1, lineHeight: 15 },

  // Commands sheet
  commandsSheet: {
    position: "absolute",
    bottom: 100,
    right: 60,
    width: 280,
    backgroundColor: "rgba(10,10,20,0.95)",
    borderRadius: RADII.lg,
    borderWidth: 1,
    borderColor: "rgba(99,102,241,0.5)",
    overflow: "hidden",
    maxHeight: SCREEN_H * 0.55,
  },
  commandsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: "rgba(99,102,241,0.2)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(99,102,241,0.3)",
  },
  commandsTitle: { fontSize: 13, fontWeight: "800", color: "#a5b4fc" },
  commandsClose: { fontSize: 16, color: "rgba(255,255,255,0.5)", fontWeight: "700" },
  commandsScroll: { paddingHorizontal: SPACING.md, paddingTop: SPACING.xs },
  commandRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  commandCmd: { fontSize: 12, fontWeight: "700", color: "#c4b5fd", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  commandDesc: { fontSize: 11, color: "rgba(255,255,255,0.5)", marginTop: 2 },

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
  sideBtnPurple: { borderColor: "#a855f7", backgroundColor: "rgba(168,85,247,0.25)" },
  sideBtnActive: { borderColor: "#34d399", backgroundColor: "rgba(52,211,153,0.2)" },
  emojiBanner: { borderColor: "#a855f755", backgroundColor: "rgba(0,0,0,0.7)" },
  emojiModeText: { fontSize: 13, color: "#a855f7", fontWeight: "700" },
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
