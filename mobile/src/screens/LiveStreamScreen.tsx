/**
 * LiveStreamScreen — fullscreen camera, translucent overlay UI.
 * Records audio via expo-audio, sends to backend /api/transcribe (Gemini),
 * console.logs the transcript and surfaces it in chat.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Alert,
  Dimensions,
  Linking,
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
import { getVoiceSettings, loadVoiceSettings, subscribeVoiceSettings } from "../services/voiceSettings";
import { uploadPhoto, editPhoto, identifyOutfit, OutfitItem } from "../services/api";

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
  link?: string;
}


// ─── Component ────────────────────────────────────────────────────────────────

const { height: SCREEN_H } = Dimensions.get("window");

// Wake word variants — "zee", "z", "zy", "zed", "hey z(ee)", "yo z(ee)", "ok z(ee)", "z vice", "vice z", "gemini"
const WAKE_WORDS = /(?:^|\s)(ok\s+z(?:ee|ed|y)?|yo\s+z(?:ee|ed|y)?|hey\s+z(?:ee|ed|y)?|z(?:ee|ed|y)?\s+vice|vice\s+z(?:ee|ed|y)?|zee|zed|zy|\bz\b|gemini|jemini|gemeni)(?:\s|,|\.|!|\?|$)/i;

// Hard cap on pictures per "take photos of me" request
const MAX_POSES = 10;
// How long to wait for the streamer to say "yes/ready" before auto-snapping
const READY_TIMEOUT_MS = 22000;
// Phrases that count as "take the shot"
const READY_RE = /\b(yes|yep|yeah|yup|ready|go|shoot|take it|take the (shot|photo|picture)|do it|i'?m ready|ok|okay|sure)\b/i;
// Phrases that end the photo session early
const STOP_RE = /\b(stop|cancel|never\s*mind|no more|abort|that'?s enough|enough|done)\b/i;

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
  const [photoSession, setPhotoSession] = useState<{
    pose: string;
    index: number;
    total: number;
    phase: "pose" | "waiting" | "capturing" | "editing" | "done";
  } | null>(null);
  const [flashOpacity] = useState(new Animated.Value(0));
  const photoSessionRef = useRef(false);
  const readyResolverRef = useRef<((result: "ready" | "stop" | "timeout") => void) | null>(null);
  const [outfitScanning, setOutfitScanning] = useState(false);
  const outfitBusyRef = useRef(false);
  isLiveRef.current = isLive;
  activePollRef.current = activePoll;
  isTranscribingRef.current = isTranscribing;

  useEffect(() => {
    loadVoiceSettings();
    const unsub = subscribeVoiceSettings(() => {});
    return unsub;
  }, []);

  const speak = useCallback((text: string) => {
    const v = getVoiceSettings();
    Speech.speak(text, { language: v.language, rate: v.rate, pitch: v.pitch, voice: v.voiceId });
  }, []);

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
        pushComment({ id: `ai-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`, ...c });
        setLatestAiComment(c.text);
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
      { user: "⚡ Zee", text: `Big shoutout to @${user}! 🎉`, avatar: "🤖" },
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
        pushComment({ id: `cd-${Date.now()}-${i}`, user: "⚡ Zee", text, avatar: "⏱", isTranscript: false });
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
      case "take_photos": {
        const poses = pendingAction.photos?.poses?.length
          ? pendingAction.photos.poses
          : ["big smile", "look over your shoulder", "peace sign", "candid laugh"];
        if (!photoSessionRef.current) startPhotoSession(poses);
        break;
      }
      case "identify_outfit":
        scanOutfit();
        break;
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

    console.log(`[Zee] Wake word detected, command: "${rawCommand}"`);
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
      if (data.response) speak(data.response);

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
  }, [pushComment, onAssistantAction, emojiMode]);

  // ── Poll detection helper (pure, no hooks) ───────────────────────────────────

  const detectPoll = (transcript: string): { question: string; options: [string, string] } | null => {
    // Match "X or Y" — allow apostrophes, hyphens, letters, spaces
    const orMatch = transcript.match(/([\w\s'\-.]+?)\s+or\s+([\w\s'\-.]+?)(?:\?|,|\.|!|$)/i);
    if (!orMatch) return null;
    const clean = (s: string) => s
      .replace(/^(are\s+we\s+going\s+to|going\s+to|we\s+going|gonna\s+go\s+to)\s+/i, "")
      .replace(/^(who('?s)?\s+(gonna|going to)\s+win[,\s]*)/i, "")
      .replace(/\b(tonight|today|right now|chat|guys)\b.*$/i, "")
      .replace(/^(the\s+streamer\s+(asks?|says)[,\s"]*)/i, "")
      .trim();
    const a = clean(orMatch[1]);
    const b = clean(orMatch[2]);
    if (a.split(" ").length <= 5 && b.split(" ").length <= 5 && a.length > 1 && b.length > 1) {
      const question = `${a} or ${b}?`;
      return { question, options: [a, b] };
    }
    return null;
  };

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

      // During a photo session, listen for "ready" / "stop" and swallow everything else
      if (photoSessionRef.current && readyResolverRef.current) {
        if (STOP_RE.test(transcript)) {
          const r = readyResolverRef.current; readyResolverRef.current = null; r("stop");
          return;
        }
        if (READY_RE.test(transcript)) {
          const r = readyResolverRef.current; readyResolverRef.current = null; r("ready");
          return;
        }
        // Don't trigger assistant / polls while we're shooting — just absorb
        return;
      }

      if (WAKE_WORDS.test(transcript)) { triggerAssistant(transcript); return; }

      if (!activePollRef.current) {
        const poll = detectPoll(transcript);
        if (poll) {
          console.log(`[Poll] Detected: "${poll.options[0]}" vs "${poll.options[1]}"`);
          setActivePoll(poll);
        }
      }
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

  // ── Photo session: Gemini guides streamer through poses ──────────────────────

  const waitForReady = useCallback((timeoutMs: number) =>
    new Promise<"ready" | "stop" | "timeout">((resolve) => {
      readyResolverRef.current = resolve;
      setTimeout(() => {
        if (readyResolverRef.current === resolve) {
          readyResolverRef.current = null;
          resolve("timeout");
        }
      }, timeoutMs);
    }), []);

  const startPhotoSession = useCallback(async (rawPoses: string[]) => {
    if (photoSessionRef.current) return;
    const poses = rawPoses.slice(0, MAX_POSES);
    photoSessionRef.current = true;
    console.log(`[Photos] Session starting — ${poses.length} poses (max ${MAX_POSES})`);

    // Pause the analyse video loop so we can use takePictureAsync
    const wasVideoLooping = isVideoLoopRef.current;
    isVideoLoopRef.current = false;
    if (isRecordingRef.current && cameraRef.current) {
      try { cameraRef.current.stopRecording(); } catch {}
    }
    // Let camera switch from video→picture mode
    await new Promise((r) => setTimeout(r, 600));

    const sessionId = `session-${Date.now()}`;
    const savedOriginals: { id: string; pose: string }[] = [];
    let stoppedEarly = false;

    for (let i = 0; i < poses.length; i++) {
      if (!photoSessionRef.current) break;
      const pose = poses[i];

      // 1. Announce pose + ask for confirmation
      setPhotoSession({ pose, index: i, total: poses.length, phase: "pose" });
      const firstLine = i === 0
        ? `Pose ${i + 1}: ${pose}. Say "ready" when you want me to snap it.`
        : `Nice! Now: ${pose}. Say "ready" when you're set.`;
      speak(firstLine);
      pushComment({
        id: `pose-${Date.now()}-${i}`,
        user: "📸 Gemini",
        text: `Pose ${i + 1}/${poses.length}: ${pose} — say "ready"`,
        avatar: "✨",
      });

      // 2. Wait for the streamer to say "yes"/"ready" (or "stop")
      setPhotoSession({ pose, index: i, total: poses.length, phase: "waiting" });
      const result = await waitForReady(READY_TIMEOUT_MS);
      if (!photoSessionRef.current) break;
      if (result === "stop") {
        speak("No worries, stopping the shoot.");
        pushComment({ id: `pose-stop-${Date.now()}`, user: "📸 Gemini", text: "stopped by streamer", avatar: "✨" });
        stoppedEarly = true;
        break;
      }
      if (result === "timeout") {
        speak("Alright, taking it anyway — say cheese!");
      } else {
        speak("Got it!");
      }

      // 3. Capture + flash
      setPhotoSession({ pose, index: i, total: poses.length, phase: "capturing" });
      await new Promise((r) => setTimeout(r, 550));
      try {
        const pic = await cameraRef.current?.takePictureAsync({ quality: 0.85, skipProcessing: true });
        Animated.sequence([
          Animated.timing(flashOpacity, { toValue: 0.9, duration: 80, useNativeDriver: true }),
          Animated.timing(flashOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
        ]).start();
        if (pic?.uri) {
          const saved = await uploadPhoto({ uri: pic.uri, caption: pose, sessionId });
          savedOriginals.push({ id: saved.id, pose });
        }
      } catch (err) {
        console.warn("[Photos] Capture error:", err);
      }
      // Small breathing room before the next prompt
      await new Promise((r) => setTimeout(r, 600));
    }

    // 4. Edit pass (Nano Banana 2) — run them in parallel, keep UI in "editing" phase
    if (savedOriginals.length > 0 && photoSessionRef.current && !stoppedEarly) {
      setPhotoSession({
        pose: "making them cinematic…",
        index: 0,
        total: savedOriginals.length,
        phase: "editing",
      });
      speak(`Got ${savedOriginals.length} shots. Making them cinematic, one sec.`);
      pushComment({
        id: `edit-start-${Date.now()}`,
        user: "📸 Gemini",
        text: `Editing ${savedOriginals.length} photos…`,
        avatar: "✨",
      });
      let completed = 0;
      await Promise.all(savedOriginals.map((p) =>
        editPhoto(p.id)
          .then(() => {
            completed += 1;
            setPhotoSession({
              pose: `edit ${completed}/${savedOriginals.length}`,
              index: completed,
              total: savedOriginals.length,
              phase: "editing",
            });
          })
          .catch((e) => console.warn("[Photos] Edit failed:", e))
      ));
    } else if (savedOriginals.length === 0 && !stoppedEarly) {
      speak("Didn't get any shots that time.");
    }

    // 5. Wrap up
    const total = savedOriginals.length;
    if (total > 0) {
      speak(`Done! Your ${total} original shots and cinematic edits are in the library.`);
      pushComment({
        id: `pose-done-${Date.now()}`,
        user: "📸 Gemini",
        text: `Saved ${total} originals + ${total} cinematic edits`,
        avatar: "✨",
      });
    }
    setPhotoSession(null);
    photoSessionRef.current = false;
    readyResolverRef.current = null;

    if (wasVideoLooping && isLiveRef.current && isTranscribingRef.current) {
      isVideoLoopRef.current = true;
      videoLoop();
    }
  }, [speak, pushComment, flashOpacity, waitForReady]); // eslint-disable-line

  // ── Outfit scan: capture a frame and post shopping links to chat ─────────────

  const scanOutfit = useCallback(async () => {
    if (outfitBusyRef.current || photoSessionRef.current) return;
    outfitBusyRef.current = true;
    setOutfitScanning(true);
    console.log("[Outfit] Scanning…");

    // Pause video loop so takePictureAsync works
    const wasVideoLooping = isVideoLoopRef.current;
    isVideoLoopRef.current = false;
    if (isRecordingRef.current && cameraRef.current) {
      try { cameraRef.current.stopRecording(); } catch {}
    }
    await new Promise((r) => setTimeout(r, 500));

    try {
      const pic = await cameraRef.current?.takePictureAsync({ quality: 0.7, skipProcessing: true });
      if (!pic?.uri) throw new Error("no camera frame");

      const items: OutfitItem[] = await identifyOutfit(pic.uri);

      if (!items.length) {
        speak("Hmm, I can't see any clothes clearly. Try stepping back?");
        pushComment({ id: `fit-empty-${Date.now()}`, user: "👗 Gemini", text: "Can't see the fit clearly — try stepping back", avatar: "✨" });
      } else {
        const intro = items.length === 1
          ? `Spotted your ${items[0].label.toLowerCase()}. Dropping a link in chat.`
          : `Spotted ${items.length} pieces. Dropping links in chat.`;
        speak(intro);
        pushComment({ id: `fit-head-${Date.now()}`, user: "👗 Gemini", text: intro, avatar: "✨" });
        items.forEach((item, i) => {
          setTimeout(() => {
            pushComment({
              id: `fit-${Date.now()}-${i}`,
              user: "👗 Gemini",
              text: `${item.label} → tap to shop`,
              avatar: "🛍",
              link: item.searchUrl,
            });
          }, 350 + i * 450);
        });
      }
    } catch (err) {
      console.warn("[Outfit] Error:", err);
      pushComment({ id: `fit-err-${Date.now()}`, user: "👗 Gemini", text: "Outfit scan failed — try again", avatar: "✨" });
    } finally {
      setOutfitScanning(false);
      outfitBusyRef.current = false;
      if (wasVideoLooping && isLiveRef.current && isTranscribingRef.current) {
        isVideoLoopRef.current = true;
        videoLoop();
      }
    }
  }, [speak, pushComment]); // eslint-disable-line

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
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode={photoSession ? "picture" : "video"}
        />
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

        {/* Emoji mode banner */}
        {emojiMode && !assistantActive && (
          <View style={[styles.statusBanner, styles.emojiBanner]} pointerEvents="none">
            <Text style={styles.emojiModeText}>🎭 Emoji Mode ON</Text>
          </View>
        )}

        {/* Assistant banner */}
        {assistantActive && (
          <View style={[styles.statusBanner, styles.zeeBanner]} pointerEvents="none">
            <Text style={styles.zeeText}>⚡ Gemini is thinking…</Text>
          </View>
        )}

        {/* Outfit scan banner */}
        {outfitScanning && (
          <View style={[styles.statusBanner, styles.zeeBanner]} pointerEvents="none">
            <Text style={styles.zeeText}>👗 Gemini is scanning your fit…</Text>
          </View>
        )}

        {/* Photo session popup */}
        {photoSession && (
          <View style={styles.photoBackdrop} pointerEvents="none">
            <View style={styles.photoCard}>
              <Text style={styles.photoStep}>
                {photoSession.phase === "editing"
                  ? `✨ EDITING ${photoSession.index}/${photoSession.total}`
                  : `📸 ${Math.min(photoSession.index + 1, photoSession.total)} / ${photoSession.total}`}
              </Text>
              <Text style={styles.photoPose}>{photoSession.pose}</Text>
              <Text style={styles.photoHint}>
                {photoSession.phase === "pose"     && "listen for the cue…"}
                {photoSession.phase === "waiting"  && "say “ready” when you’re in position"}
                {photoSession.phase === "capturing" && "snap!"}
                {photoSession.phase === "editing"  && "running Nano Banana 2…"}
                {photoSession.phase === "done"     && "all done"}
              </Text>
            </View>
          </View>
        )}
        <Animated.View pointerEvents="none" style={[styles.flash, { opacity: flashOpacity }]} />

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
                pointerEvents="box-none"
              >
                {comments.map((c) => {
                  const bubble = (
                    <View style={[styles.chatBubble, c.link && styles.chatBubbleLink]}>
                      <Text style={[
                        styles.chatUser,
                        c.isTranscript && styles.chatUserTranscript,
                        c.user === "you" && styles.chatUserSelf,
                      ]}>
                        {c.user}
                      </Text>
                      <Text style={[styles.chatMsg, c.link && styles.chatMsgLink]}>{c.text}</Text>
                    </View>
                  );
                  return (
                    <View
                      key={c.id}
                      style={[
                        styles.chatRow,
                        c.isTranscript && styles.chatRowTranscript,
                      ]}
                      pointerEvents={c.link ? "box-none" : "none"}
                    >
                      <Text style={styles.chatAvatar}>{c.avatar}</Text>
                      {c.link ? (
                        <TouchableOpacity activeOpacity={0.8} onPress={() => Linking.openURL(c.link!)}>
                          {bubble}
                        </TouchableOpacity>
                      ) : bubble}
                    </View>
                  );
                })}
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

  // Photo session popup
  photoBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: SPACING.xl,
  },
  photoCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "rgba(15,15,25,0.92)",
    borderRadius: RADII.xl,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  photoStep: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 2,
    color: "#fff",
    backgroundColor: "rgba(124,58,237,0.85)",
    paddingHorizontal: SPACING.md,
    paddingVertical: 5,
    borderRadius: RADII.full,
    overflow: "hidden",
  },
  photoPose: {
    fontSize: 28,
    fontWeight: "900",
    color: "#fff",
    textAlign: "center",
    marginTop: SPACING.md,
    textShadowColor: "rgba(0,0,0,0.85)",
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 2 },
  },
  photoHint: {
    fontSize: 13,
    color: "rgba(255,255,255,0.75)",
    marginTop: SPACING.sm,
    fontStyle: "italic",
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#fff",
  },

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
  chatBubbleLink: { borderColor: COLORS.accent, backgroundColor: "rgba(6,214,160,0.15)" },
  chatMsgLink: { color: COLORS.accent, textDecorationLine: "underline", fontWeight: "700" },
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
