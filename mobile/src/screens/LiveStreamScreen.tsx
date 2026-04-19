/**
 * LiveStreamScreen — fullscreen camera, translucent overlay UI.
 * Records audio via expo-audio, sends to backend /api/transcribe (Gemini),
 * console.logs the transcript and surfaces it in chat.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Alert,
  Dimensions,
  Image,
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
import * as FileSystem from "expo-file-system/legacy";
import * as Speech from "expo-speech";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { COLORS, SPACING, RADII, WEIGHTS } from "../constants/theme";
import { useLanguage } from "../context/LanguageContext";
import type { AssistantAction } from "../../App";
import PollOverlay from "../components/PollOverlay";
import ClipOverlay from "../components/ClipOverlay";
import ProductOverlay from "../components/ProductOverlay";
import { searchClips, uploadPhoto, editPhoto, identifyOutfit, OutfitItem, processEdit, poseCoach } from "../services/api";
import { findProduct, ProductItem } from "../services/product";
import { BACKEND_URL } from "../services/backendUrl";
import { ensureHumanLikeVoice, getVoicePresetPatch, getVoiceSettings, loadVoiceSettings, subscribeVoiceSettings, updateVoiceSettings } from "../services/voiceSettings";

// ─── Config ───────────────────────────────────────────────────────────────────


// VAD-driven chunking for the REST /api/transcribe path. Instead of slicing
// on a fixed 3s timer (which cut sentences in half mid-word), we record until
// the speaker has been quiet for SILENCE_TAIL_MS — so chunks only flush at a
// natural pause. MAX keeps one long rant from stalling transcription forever.
const AUDIO_VAD_MIN_SPEECH_MS = 1500;
const AUDIO_VAD_SILENCE_TAIL_MS = 1800;
const AUDIO_VAD_MAX_CHUNK_MS = 22000;
const AUDIO_VAD_POLL_MS = 120;
// dB threshold (expo-audio metering is typically -160..0). Anything ABOVE
// this is treated as active speech. Lowering it makes the VAD more lenient:
// quiet breaths and inter-word gaps get counted as still-talking, so we
// don't cut off mid-sentence. Raise if noisy rooms keep the recorder open.
const AUDIO_VAD_SILENCE_DB = -48;
const FRAME_INTERVAL_MS = 7000;
const SPEECH_RECORDING_PRESET = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 64000,
  isMeteringEnabled: true,
  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    audioSource: "voice_recognition" as const,
    sampleRate: 16000,
  },
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    sampleRate: 16000,
  },
};

// Chunked PCM streamed directly to Gemini Live on iOS.
// Kept short so Gemini's VAD can see turn boundaries with low latency,
// but not so short that the AudioRecorder start/stop overhead eats the loop.
const PANDA_PCM_CHUNK_MS = 640;

// 16 kHz / 16-bit / mono LPCM (WAV on disk; we strip the header before sending).
// Android MediaRecorder can't produce raw PCM — audioLoop falls back to the
// REST-transcribe path on Android.
const PANDA_PCM_RECORDING_OPTIONS = {
  extension: ".wav",
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  isMeteringEnabled: false,
  android: {
    ...RecordingPresets.HIGH_QUALITY.android,
    outputFormat: "default" as const,
    audioEncoder: "default" as const,
    sampleRate: 16000,
    extension: ".wav",
  },
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    outputFormat: "lpcm" as const, // IOSOutputFormat.LINEARPCM
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
    extension: ".wav",
  },
};

// Int16 PCM RMS below this is treated as silence and never shipped to Gemini.
// The Live API otherwise fills silence with fabricated transcripts ("you",
// "thank you", "okay"), polluting the chat overlay and engaging Panda by
// accident. ~400 corresponds to quiet room noise; raise if speech is being
// skipped or lower if too much silence leaks through.
const PANDA_SILENCE_RMS_THRESHOLD = 450;

/**
 * Compute RMS of a base64-encoded little-endian int16 PCM buffer without
 * allocating a typed array. Keeps per-chunk cost to ~a few ms even at 16 kHz.
 */
function pcmRmsFromBase64(b64: string): number {
  const binary = globalThis.atob(b64);
  const bytes = binary.length;
  if (bytes < 2) return 0;
  const samples = bytes >> 1;
  let sumSq = 0;
  for (let i = 0; i < samples; i++) {
    const lo = binary.charCodeAt(i * 2);
    const hi = binary.charCodeAt(i * 2 + 1);
    let v = lo | (hi << 8);
    if (v & 0x8000) v -= 0x10000;
    sumSq += v * v;
  }
  return Math.sqrt(sumSq / samples);
}

/**
 * Strip the RIFF/WAVE container from a base64 WAV and return the raw PCM
 * payload (still base64). Scans for the "data" subchunk rather than
 * assuming a fixed 44-byte header, since expo-audio occasionally emits
 * an LIST/INFO chunk that changes the offset.
 */
function stripWavHeaderBase64(b64: string): string {
  const binary = globalThis.atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);

  let offset = 44; // standard fallback
  const scanEnd = Math.min(512, len - 4);
  for (let i = 12; i < scanEnd; i++) {
    // "data" ASCII
    if (bytes[i] === 0x64 && bytes[i + 1] === 0x61 && bytes[i + 2] === 0x74 && bytes[i + 3] === 0x61) {
      offset = i + 8; // skip "data" (4) + chunk size (4)
      break;
    }
  }

  if (offset >= len) return "";

  let s = "";
  for (let i = offset; i < len; i++) s += String.fromCharCode(bytes[i]);
  return globalThis.btoa(s);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Comment {
  id: string;
  user: string;
  text: string;
  avatar: string;
  isTranscript?: boolean;
  link?: string;
  gifUrl?: string;
}


// ─── Component ────────────────────────────────────────────────────────────────

const { height: SCREEN_H } = Dimensions.get("window");

// Wake word — any phrase containing "panda" (or a common ASR mishear: pando,
// panta, ponda, banda, bando). Prefix like "hey"/"ok"/"yo" is optional; the
// only requirement is that the word appears somewhere in the transcript.
const PANDA_ALIASES = "p[ao]nd[ao]|p[ao]nt[ao]|b[ao]nd[ao]";
const WAKE_WORDS = new RegExp(`\\b(?:${PANDA_ALIASES})\\b`, "i");
const PANDA_STOP_RE = new RegExp(`\\b(?:${PANDA_ALIASES})\\s+stop\\b`, "i");
// Legacy keyword pre-filter — replaced by a Gemini 3.1 flash-lite classifier
// in /api/assistant. Any phrase that follows the wake word is now routed to
// the model for intent classification, so we don't need a hand-maintained
// regex that has to be updated every time we add a command. Left here as a
// reference until the new classifier has been in production for a while.
// const APP_CONTROL_RE = /\b(go live|end stream|mute|unmute|flip camera|emoji mode|hype|shoutout|countdown|create poll|close poll|go to|open|take my photo|take pictures|photo shoot|what am i wearing|rate my fit|find my outfit|change your voice|change voice|pull up|show .*clip|play .*clip|find .*clip|nike|adidas|puma|jordan|air max|samba|shoe|shoes|sneaker|sneakers|hoodie|shirt|jacket|bag|hat)\b/i;

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
  { cmd: "hey panda take my photo", desc: "Start a guided photo shoot" },
  { cmd: "hey panda change your voice", desc: "Switch Panda's saved voice" },
  { cmd: "hey panda what am I wearing", desc: "Identify outfit + shop links" },
  { cmd: "hey panda pull up red nike air maxes", desc: "Show a product page on stream" },
];

// Hard cap on pictures per "take photos of me" request
const MAX_POSES = 10;
// How long to wait for the streamer to say "yes/ready" before auto-snapping
const READY_TIMEOUT_MS = 22000;
// From the moment Panda starts the "3, 2, 1, smile!" countdown to the actual
// shutter. Long enough that the TTS finishes before the shot, so audio lines
// up with the flash instead of landing after.
const PHOTO_COUNTDOWN_MS = 4000;
// Hard cap on how many coach iterations we run before taking the shot anyway.
// Stops the loop from running forever if the subject never settles into a pose.
const POSE_COACH_MAX_ATTEMPTS = 8;
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
  const { t } = useLanguage();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();

  const [isLive, setIsLive] = useState(false);
  const [viewers, setViewers] = useState(0);
  const [comments, setComments] = useState<Comment[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
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
  const [pandaDebug, setPandaDebug] = useState("idle");
  const recentCommentsRef = useRef<string[]>([]);
  const [photoSession, setPhotoSession] = useState<{
    pose: string;
    index: number;
    total: number;
    phase: "pose" | "waiting" | "capturing" | "editing" | "done";
  } | null>(null);
  const [flashOpacity] = useState(new Animated.Value(0));
  // Glowing white border shown while Panda is counting down + capturing a shot.
  const [glowOpacity] = useState(new Animated.Value(0));
  const photoSessionRef = useRef(false);
  const readyResolverRef = useRef<((result: "ready" | "stop" | "timeout") => void) | null>(null);
  const [outfitScanning, setOutfitScanning] = useState(false);
  const outfitBusyRef = useRef(false);
  const [isClipping, setIsClipping] = useState(false);
  const isClippingRef = useRef(false);
  // Rolling 35s video buffer — always holds the URI of the most recently completed chunk
  const lastVideoChunkUriRef = useRef<string | null>(null);
  // Whether the buffer loop is actively recording right now
  const videoBufferActiveRef = useRef(false);
  // Resolve fn to interrupt the current recordAsync and get its URI immediately
  const stopCurrentBufferRef = useRef<(() => void) | null>(null);
  const [activeClip, setActiveClip] = useState<{
    id: string; mountKey: string; title: string; sourceVideoUrl: string; durationSeconds: number; score: number;
  } | null>(null);
  const activeClipRef = useRef<typeof activeClip>(null);
  const [activeProduct, setActiveProduct] = useState<(ProductItem & { mountKey: string }) | null>(null);
  const activeProductRef = useRef<typeof activeProduct>(null);
  activeClipRef.current = activeClip;
  activeProductRef.current = activeProduct;
  const [pandaLiveOn, setPandaLiveOn] = useState(false);
  const pandaLiveWsRef = useRef<WebSocket | null>(null);
  const pandaLiveReadyRef = useRef(false);
  const pandaLiveQueueRef = useRef<string[]>([]);
  const pandaLiveActiveRef = useRef(false);
  const pandaLiveConnectingRef = useRef(false);
  const pandaSpeechUntilRef = useRef(0);
  const lastPandaSpeechRef = useRef("");
  const lastPandaGreetingAtRef = useRef(0);
  isLiveRef.current = isLive;
  activePollRef.current = activePoll;
  isTranscribingRef.current = isTranscribing;

  useEffect(() => {
    loadVoiceSettings().then(() => ensureHumanLikeVoice());
    const unsub = subscribeVoiceSettings(() => {});
    return unsub;
  }, []);

  const speak = useCallback((text: string) => {
    const v = getVoiceSettings();
    pandaSpeechUntilRef.current = Date.now() + 1800;
    lastPandaSpeechRef.current = text.toLowerCase().replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
    Speech.speak(text, { language: v.language, rate: v.rate, pitch: v.pitch, voice: v.voiceId });
  }, []);

  const isPandaEcho = useCallback((transcript: string) => {
    if (Date.now() > pandaSpeechUntilRef.current) return false;
    const normalized = transcript.toLowerCase().replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
    if (!normalized) return false;
    const lastSpeech = lastPandaSpeechRef.current;
    const protectedLines = new Set(["panda here what s up", "panda out"]);
    return protectedLines.has(lastSpeech) && normalized === lastSpeech;
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

  useEffect(() => {
    if (isLive) return;
    pandaLiveActiveRef.current = false;
    setPandaLiveOn(false);
    pandaLiveReadyRef.current = false;
    pandaLiveQueueRef.current = [];
    pandaLiveWsRef.current?.close();
    pandaLiveWsRef.current = null;
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

  const debugPanda = useCallback((message: string) => {
    const stamped = `${new Date().toLocaleTimeString()} ${message}`;
    setPandaDebug(stamped);
    console.log(`[PandaDebug] ${stamped}`);
  }, []);

  const stopPandaLive = useCallback((announce = true) => {
    debugPanda(`stop requested announce=${announce}`);
    pandaLiveActiveRef.current = false;
    setPandaLiveOn(false);
    // On iOS the Live session is the transcription source too — keep the WS
    // alive so chat transcription / polls / photo cues keep working.
    // On Android the WS only exists while Panda is actively chatting, so tear
    // it down to save the token.
    if (Platform.OS !== "ios") {
      pandaLiveConnectingRef.current = false;
      pandaLiveReadyRef.current = false;
      pandaLiveQueueRef.current = [];
      pandaLiveWsRef.current?.close();
      pandaLiveWsRef.current = null;
    }
    if (announce) {
      Speech.stop();
      speak("Panda out.");
      pushComment({ id: `panda-stop-${Date.now()}`, user: "🐼 Panda", text: "Panda out.", avatar: "🤖" });
    }
  }, [debugPanda, pushComment, speak]);

  // Send one complete text turn. Uses clientContent (not realtimeInput) so
  // the Live API knows the turn is finished and emits a model response.
  // realtimeInput.text is for token streaming mid-audio-turn; using it alone
  // leaves the model waiting forever for a turn end, which is why Panda
  // "stalled" after the greeting.
  const sendTextTurnOverWs = useCallback((ws: WebSocket, text: string) => {
    ws.send(JSON.stringify({
      clientContent: {
        turns: [{ role: "user", parts: [{ text }] }],
        turnComplete: true,
      },
    }));
  }, []);

  // Read a WAV file the recorder wrote, strip its header, and ship the PCM
  // to Gemini Live as a realtimeInput.audio blob. Gemini's built-in VAD
  // (configured in setup) handles turn segmentation; we just keep feeding
  // it audio for as long as Panda is active.
  const streamPcmChunkToPanda = useCallback(async (uri: string) => {
    const ws = pandaLiveWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !pandaLiveReadyRef.current) return;
    try {
      const b64wav = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
      if (!b64wav) return;
      const b64pcm = stripWavHeaderBase64(b64wav);
      if (!b64pcm) return;

      // Don't ship silence — Gemini's transcriber will hallucinate over it.
      const rms = pcmRmsFromBase64(b64pcm);
      if (rms < PANDA_SILENCE_RMS_THRESHOLD) return;

      ws.send(JSON.stringify({
        realtimeInput: {
          audio: { data: b64pcm, mimeType: "audio/pcm;rate=16000" },
        },
      }));
    } catch (err) {
      debugPanda(`pcm stream error ${err instanceof Error ? err.message : "?"}`);
    } finally {
      // The WAV chunks pile up in cache — delete eagerly to stop running out of room
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
    }
  }, [debugPanda]);

  // Setup for Gemini Live. We feed 16 kHz LPCM audio continuously (iOS only)
  // so Gemini's server-side VAD segments the turns. Android still uses the
  // clientContent text-turn fallback, which also works against this setup.
  // Model name is env-overridable — if your account has access to a newer
  // preview, set EXPO_PUBLIC_GEMINI_LIVE_MODEL in mobile/.env to swap it in.
  const createPandaSetup = useCallback(() => JSON.stringify({
    setup: {
      model: `models/${process.env.EXPO_PUBLIC_GEMINI_LIVE_MODEL ?? "gemini-3.1-flash-live"}`,
      generationConfig: {
        responseModalities: ["TEXT"],
        temperature: 0.8,
      },
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          // Give the streamer a full breath between the wake word and the command
          // so Gemini doesn't split "panda / what's the weather" into two turns
          // (the second turn would have no wake word and trigger SILENT).
          silenceDurationMs: 1500,
          prefixPaddingMs: 400,
          endOfSpeechSensitivity: "END_SENSITIVITY_UNSPECIFIED",
          startOfSpeechSensitivity: "START_SENSITIVITY_UNSPECIFIED",
        },
        // Don't let fresh audio chatter cancel an in-flight Panda reply —
        // wait for the response to finish, then start listening again.
        activityHandling: "NO_INTERRUPTION",
        // Carry natural pauses inside a turn so short phrases like "hey panda"
        // stay attached to the follow-up question.
        turnCoverage: "TURN_INCLUDES_ALL_INPUT",
      },
      // Gemini's own transcript of the user's speech, so we can show it
      // in chat without running a second REST transcription.
      inputAudioTranscription: {},
      systemInstruction: {
        parts: [{ text: `You are Panda, a live voice assistant inside a streaming app.

You continuously hear the streamer. They are broadcasting to an audience and most of their speech is NOT directed at you, so you must NOT respond to every turn.

Rules:
1. If the streamer addressed you in the current turn OR the immediately preceding turn — by saying "Panda", "hey panda", "ok panda", or "yo panda" — respond conversationally in 1-2 sentences. Warm, short, direct, no JSON.
2. If there is no mention of your name in the current or previous turn, reply with the exact single word: SILENT
3. When in doubt — if the speech could plausibly be addressed to you — RESPOND. Don't default to silent when the streamer has recently said your name.
4. Never explain being silent. Never apologise. Do not use JSON.` }],
      },
    },
  }), []);

  const ensurePandaLive = useCallback(async () => {
    debugPanda(`ensure session state=${pandaLiveWsRef.current?.readyState ?? "none"}`);
    pandaLiveActiveRef.current = true;
    setPandaLiveOn(true);
    if (pandaLiveWsRef.current && pandaLiveWsRef.current.readyState < WebSocket.CLOSING) {
      return pandaLiveWsRef.current;
    }
    if (pandaLiveConnectingRef.current) return pandaLiveWsRef.current;

    pandaLiveConnectingRef.current = true;
    try {
      debugPanda("fetching live token");
      const response = await fetch(`${BACKEND_URL}/api/live-token`, { method: "POST" });
      if (!response.ok) throw new Error(`token ${response.status}`);
      const data = await response.json() as { token: string };
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${data.token}`;
      debugPanda("creating websocket");
      const ws = new WebSocket(wsUrl);
      pandaLiveWsRef.current = ws;
      pandaLiveReadyRef.current = false;
      ws.onopen = () => {
        debugPanda("socket open sending setup");
        ws.send(createPandaSetup());
      };
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as {
            setupComplete?: boolean;
            serverContent?: {
              inputTranscription?: { text?: string; finished?: boolean };
              outputTranscription?: { text?: string };
              modelTurn?: { parts?: Array<{ text?: string }> };
              turnComplete?: boolean;
              interrupted?: boolean;
            };
          };
          debugPanda(`message keys=${Object.keys(msg).join(",")}`);
          if (msg.setupComplete) {
            pandaLiveReadyRef.current = true;
            pandaLiveConnectingRef.current = false;
            debugPanda(`ready queued=${pandaLiveQueueRef.current.length}`);
            const queue = [...pandaLiveQueueRef.current];
            pandaLiveQueueRef.current = [];
            queue.forEach((queued) => sendTextTurnOverWs(ws, queued));
            return;
          }

          // Gemini-side transcript of the streamer's speech. Route it through
          // the same dispatcher the REST path uses so wake word detection,
          // poll detection, photo-session cues, and chat display all reuse
          // one pipeline.
          const userTranscript = msg.serverContent?.inputTranscription;
          if (userTranscript?.finished && userTranscript.text?.trim()) {
            handleStreamerTranscript(userTranscript.text);
          }

          const liveText = msg.serverContent?.modelTurn?.parts
            ?.map((part) => part.text?.trim())
            .filter(Boolean)
            .join(" ");
          const outputTranscript = msg.serverContent?.outputTranscription?.text?.trim();
          const responseText = liveText || outputTranscript;
          if (responseText) {
            // System instruction tells Panda to say exactly "SILENT" for any
            // turn that wasn't directed at her. Drop those before speaking.
            const normalised = responseText.replace(/[^a-zA-Z]/g, "").toUpperCase();
            if (normalised === "SILENT" || normalised === "") {
              debugPanda("response silent-drop");
              return;
            }
            debugPanda(`response ${responseText.slice(0, 60)}`);
            speak(responseText);
            pushComment({
              id: `panda-live-${Date.now()}`,
              user: "🐼 Panda",
              text: responseText,
              avatar: "🤖",
            });
          }
        } catch (err) {
          debugPanda("parse error");
          console.warn("[Panda Live] Parse error:", err);
        }
      };
      ws.onerror = (err) => {
        const reason = (err as { message?: string })?.message || "unknown";
        debugPanda(`socket error ${reason}`);
        console.warn("[Panda Live] Error:", err);
      };
      ws.onclose = (evt) => {
        const e = evt as { code?: number; reason?: string };
        debugPanda(`socket closed code=${e?.code ?? "?"} reason=${(e?.reason ?? "").slice(0, 80)}`);
        pandaLiveWsRef.current = null;
        pandaLiveConnectingRef.current = false;
        pandaLiveReadyRef.current = false;
        pandaLiveQueueRef.current = [];
        pandaLiveActiveRef.current = false;
        setPandaLiveOn(false);
      };
    } catch (err) {
      debugPanda(`token fetch failed ${err instanceof Error ? err.message : "unknown"}`);
      pandaLiveActiveRef.current = false;
      pandaLiveConnectingRef.current = false;
      setPandaLiveOn(false);
    }

    return pandaLiveWsRef.current;
  }, [createPandaSetup, debugPanda, pushComment, speak]);

  const sendToPandaLive = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;

    debugPanda(`send text ready=${pandaLiveReadyRef.current} text=${trimmed.slice(0, 60)}`);
    pandaLiveQueueRef.current.push(trimmed);
    if (!pandaLiveReadyRef.current) debugPanda("queued text turn");
    void ensurePandaLive().then((ws) => {
      if (!ws || !pandaLiveReadyRef.current || ws.readyState !== WebSocket.OPEN) return;
      const queue = [...pandaLiveQueueRef.current];
      pandaLiveQueueRef.current = [];
      queue.forEach((queued) => sendTextTurnOverWs(ws, queued));
    });
  }, [debugPanda, ensurePandaLive, sendTextTurnOverWs]);

  const togglePandaLive = useCallback(() => {
    if (pandaLiveActiveRef.current) {
      stopPandaLive();
      return;
    }

    const greeting = "Panda here, what's up?";
    debugPanda("button activation");
    speak(greeting);
    pushComment({ id: `panda-button-${Date.now()}`, user: "🐼 Panda", text: greeting, avatar: "🤖" });
    void ensurePandaLive();
  }, [debugPanda, ensurePandaLive, pushComment, speak, stopPandaLive]);

  const pushCommentsWithDelay = useCallback((
    newComments: Array<{ user: string; text: string; avatar: string }>
  ) => {
    // Drip them in one at a time with random delays so it feels live
    newComments.forEach((c, i) => {
      setTimeout(() => {
        pushComment({ id: `ai-${Date.now()}-${i}-${Math.random().toString(36).slice(2)}`, ...c });
        setLatestAiComment(c.text);
        recentCommentsRef.current = [...recentCommentsRef.current.slice(-40), `${c.user}: ${c.text}`];
      }, i * (1100 + Math.random() * 500));
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

  // ── Pull up clip: vector search the clip library ────────────────────────────

  const handlePullUpClip = useCallback(async (query: string) => {
    if (activeClipRef.current) return; // already showing a clip, ignore
    console.log(`[ClipOverlay] Searching for: "${query}"`);
    pushComment({ id: `zee-clip-${Date.now()}`, user: "⚡ Zee", text: `🔍 Searching clips for "${query}"…`, avatar: "🤖" });

    try {
      const results = await searchClips(query, 1);
      if (!results || results.length === 0) {
        pushComment({ id: `zee-clip-miss-${Date.now()}`, user: "⚡ Zee", text: "Couldn't find a matching clip 😅", avatar: "🤖" });
        return;
      }
      const best = results[0];
      console.log(`[ClipOverlay] Best match: "${best.title}" (score: ${best.score.toFixed(3)})`);
      const rawUrl = best.sourceVideoUrl ?? "";
      const fullUrl = rawUrl.startsWith("http") ? rawUrl : `${BACKEND_URL}${rawUrl}`;
      setActiveClip({
        id: best.id,
        mountKey: `${best.id}-${Date.now()}`,
        title: best.title,
        sourceVideoUrl: fullUrl,
        durationSeconds: best.durationSeconds,
        score: best.score,
      });
    } catch (err) {
      console.warn("[ClipOverlay] Search error:", err);
      pushComment({ id: `zee-clip-err-${Date.now()}`, user: "⚡ Zee", text: "Clip search failed — try again!", avatar: "🤖" });
    }
  }, [pushComment]);

  const handleVoiceChange = useCallback(async (action: AssistantAction) => {
    const patch: { preset?: AssistantAction["preset"]; language?: string } = {};
    if (action.preset) patch.preset = action.preset;
    if (action.language) patch.language = action.language;

    const next = await updateVoiceSettings({
      ...(action.preset ? getVoicePresetPatch(action.preset) : {}),
      ...(action.language ? { language: action.language, voiceId: undefined } : {}),
    });

    const summary = [patch.preset, patch.language].filter(Boolean).join(" ") || "new voice";
    pushComment({ id: `voice-${Date.now()}`, user: "🐼 Panda", text: `Saved ${summary} for next time.`, avatar: "🤖" });
    Speech.stop();
    Speech.speak("Voice updated. I'll keep this one for next time.", {
      language: next.language,
      rate: next.rate,
      pitch: next.pitch,
      voice: next.voiceId,
    });
  }, [pushComment]);

  const handlePullUpProduct = useCallback(async (query: string) => {
    if (activeProductRef.current) return;
    console.log(`[ProductOverlay] Searching for: "${query}"`);

    try {
      const item = await findProduct(query);
      setActiveProduct({ ...item, mountKey: `${Date.now()}-${item.displayUrl}` });
      pushComment({
        id: `panda-product-${Date.now()}`,
        user: "🐼 Panda",
        text: `${item.title}${item.store ? ` from ${item.store}` : ""}${item.price ? ` · ${item.price}` : ""}`,
        avatar: "🛍️",
        link: item.url,
      });
      speak(`Pulled it up. I dropped the buy link in chat.`);
    } catch (err) {
      console.warn("[ProductOverlay] Search error:", err);
      pushComment({ id: `panda-product-err-${Date.now()}`, user: "🐼 Panda", text: "I couldn't find a solid buy link for that one.", avatar: "🛍️" });
    }
  }, [pushComment, speak]);

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
      case "pull_up_clip": if (pendingAction.query) handlePullUpClip(pendingAction.query); break;
      case "pull_up_product": if (pendingAction.query) handlePullUpProduct(pendingAction.query); break;
      case "clip":         handleClip(); break;
      case "take_photos":
        startPhotoSession({
          count: pendingAction.count,
          auto: pendingAction.auto,
          poses: pendingAction.poses,
        });
        break;
      case "identify_outfit": scanOutfit(); break;
      case "change_voice": handleVoiceChange(pendingAction); break;
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
    const greeting = "Panda here, what's up?";
    const isFreshWake = !pandaLiveActiveRef.current;
    const hasExplicitCommand = afterWake.length > 0;
    // Previously we gated /api/assistant on a local keyword regex so casual
    // chat wouldn't trigger an action call. The backend now runs a Gemini
    // 3.1 flash-lite classifier that returns type="none" for anything that
    // isn't an app command, so we can safely route every wake-word turn.
    // const shouldRunActionAssistant = hasExplicitCommand && APP_CONTROL_RE.test(afterWake);
    const shouldRunActionAssistant = hasExplicitCommand;
    const canSpeakGreeting = Date.now() - lastPandaGreetingAtRef.current > 10_000;

    console.log(`[Panda] Wake word detected, command: "${rawCommand}"`);
    setAssistantActive(true);

    // On iOS the Live session is already open and streaming audio, so Gemini
    // will produce its own reply to the wake-word turn. Speaking a canned
    // greeting locally would just talk over the real response. Keep the
    // greeting on Android where we still need the user feedback.
    const iosLive = Platform.OS === "ios" && pandaLiveReadyRef.current;

    if (isFreshWake) {
      pandaLiveActiveRef.current = true;
      setPandaLiveOn(true);
      if (!iosLive && canSpeakGreeting) {
        lastPandaGreetingAtRef.current = Date.now();
        speak(greeting);
      }
      if (!iosLive) {
        pushComment({
          id: `panda-greet-${Date.now()}`,
          user: "🐼 Panda",
          text: greeting,
          avatar: "🤖",
        });
      }

      if (!hasExplicitCommand) {
        ensurePandaLive();
        setAssistantActive(false);
        return;
      }
    }

    // Android path still needs a text-turn echo (audio never reaches Gemini).
    // iOS has already fed the audio, so resending as text would duplicate the
    // user input and confuse the model.
    if (hasExplicitCommand && !iosLive) {
      sendToPandaLive(rawCommand);
    }

    if (!shouldRunActionAssistant) {
      setAssistantActive(false);
      return;
    }

    try {
      const res = await fetch(`${BACKEND_URL}/api/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command, context: transcriptContextRef.current }),
      });
      const data = await res.json();
      console.log(`[Panda] Response: "${data.response}", Action:`, data.action);

      // Only surface the structured assistant reply when it triggered an action.
      if (data.action && data.action.type !== "none" && data.response) {
        pushComment({
          id: `zee-${Date.now()}`,
          user: "🐼 Panda",
          text: data.response,
          avatar: "🤖",
          isTranscript: false,
        });
      }

      // Fire the action
      if (data.action && data.action.type !== "none") {
        onAssistantAction(data.action as AssistantAction);
      }
    } catch (err) {
      console.warn("[Panda] Error:", err);
    } finally {
      setAssistantActive(false);
    }
  }, [pushComment, onAssistantAction, emojiMode, sendToPandaLive, speak]);

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

  // Post-transcription dispatcher. The same logic runs whether the transcript
  // came from the REST /api/transcribe (Android / pre-live) or from Gemini's
  // continuous inputAudioTranscription stream (iOS always-on path).
  const handleStreamerTranscript = useCallback((raw: string) => {
    // Clean up ASR mishears of the wake word so chat + context consistently show "panda".
    const transcript = raw.trim().replace(new RegExp(`\\b(?:${PANDA_ALIASES})\\b`, "gi"), "panda");
    if (!transcript) return;

    if (isPandaEcho(transcript)) {
      console.log(`[Panda] Ignoring self-echo: ${transcript}`);
      return;
    }

    console.log(`[Streamer] ${transcript}`);
    pushComment({ id: `transcript-${Date.now()}`, user: "🎙 you (live)", text: transcript, avatar: "🎤", isTranscript: true });
    transcriptContextRef.current = [...transcriptContextRef.current.slice(-4), transcript];

    if (PANDA_STOP_RE.test(transcript) && pandaLiveActiveRef.current) {
      stopPandaLive();
      return;
    }

    // While Panda is already active, ignore repeated wake words entirely.
    if (pandaLiveActiveRef.current && WAKE_WORDS.test(transcript)) {
      console.log(`[Panda] Ignoring repeated wake word: ${transcript}`);
      return;
    }

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

    // Only the REST / Android path needs to hand the text back to the Panda WS.
    // On iOS we're already streaming audio into the same session, so Gemini
    // will produce its conversational response straight from the audio.
    if (pandaLiveActiveRef.current && Platform.OS !== "ios") {
      sendToPandaLive(transcript);
    }

    detectPoll(transcript);
  }, [detectPoll, isPandaEcho, pushComment, sendToPandaLive, stopPandaLive, triggerAssistant]);

  const processAudioChunk = useCallback(async (uri: string) => {
    try {
      const audioType = getAudioMimeType(uri);
      const filename = `chunk${getAudioExtension(uri)}`;
      const form = new FormData();
      form.append("audio", { uri, name: filename, type: audioType } as any);
      const res = await fetch(`${BACKEND_URL}/api/transcribe`, { method: "POST", body: form });
      const data = await res.json();
      handleStreamerTranscript(data.transcript ?? "");
    } catch (err) {
      console.warn("[Audio] Error:", err);
    }
  }, [handleStreamerTranscript]);

  const audioLoop = useCallback(async () => {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) { console.warn("[Audio loop] Permission denied"); return; }
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
      shouldRouteThroughEarpiece: false,
      interruptionMode: "doNotMix",
    });
    while (isAudioLoopRef.current) {
      // iOS: always stream 16 kHz LPCM directly to Gemini Live (the session
      // opens automatically when transcription starts). Gemini's own VAD
      // handles turn segmentation, so a single pipeline covers chat
      // transcription, wake-word detection, poll detection, AND Panda's
      // conversational responses — no REST round-trip.
      // Android: MediaRecorder can't emit clean raw PCM, so it stays on the
      // slower REST /api/transcribe path.
      const pandaPcmStreaming =
        Platform.OS === "ios" &&
        pandaLiveWsRef.current?.readyState === WebSocket.OPEN &&
        pandaLiveReadyRef.current;
      try {
        const preset = pandaPcmStreaming ? PANDA_PCM_RECORDING_OPTIONS : SPEECH_RECORDING_PRESET;
        const rec = new AudioModule.AudioRecorder(preset);
        audioRecordingRef.current = rec;
        await rec.prepareToRecordAsync();
        if (!pandaPcmStreaming) {
          // Only the slow loop benefits from explicit mic selection; PCM chunks are short
          // enough that hunting through available inputs each iteration wastes time.
          const inputs = rec.getAvailableInputs();
          const phoneMic = inputs.find((input) => /built.?in|microphone|bottom/i.test(`${input.name} ${input.type}`));
          if (phoneMic) rec.setInput(phoneMic.uid);
        }
        rec.record();

        let sawSpeech = false;
        if (pandaPcmStreaming) {
          // PCM path: Gemini Live runs its own VAD, so just hand it short fixed chunks.
          await new Promise(r => setTimeout(r, PANDA_PCM_CHUNK_MS));
        } else {
          // REST path: wait for a natural pause before flushing so sentences stay whole.
          let silentMs = 0;
          let elapsedMs = 0;
          while (isAudioLoopRef.current && elapsedMs < AUDIO_VAD_MAX_CHUNK_MS) {
            await new Promise(r => setTimeout(r, AUDIO_VAD_POLL_MS));
            elapsedMs += AUDIO_VAD_POLL_MS;
            const meter = rec.getStatus().metering;
            const isSpeaking = typeof meter === "number" && meter > AUDIO_VAD_SILENCE_DB;
            if (isSpeaking) {
              sawSpeech = true;
              silentMs = 0;
            } else {
              silentMs += AUDIO_VAD_POLL_MS;
            }
            // Only end the chunk once there's been real speech followed by a clear pause.
            if (sawSpeech && elapsedMs >= AUDIO_VAD_MIN_SPEECH_MS && silentMs >= AUDIO_VAD_SILENCE_TAIL_MS) break;
          }
        }

        await rec.stop();
        audioRecordingRef.current = null;
        const uri = rec.uri;
        if (uri && isAudioLoopRef.current) {
          if (pandaPcmStreaming) streamPcmChunkToPanda(uri);
          else if (sawSpeech) processAudioChunk(uri);
          else FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
        }
      } catch (err) {
        console.warn("[Audio loop] Error:", err);
        audioRecordingRef.current = null;
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }, [processAudioChunk, streamPcmChunkToPanda]);

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
        const photo = await cameraRef.current.takePictureAsync({ quality: 0.3, base64: true, skipProcessing: true });
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

  // Speak "3, 2, 1, smile!", fade a white glowing border in over the countdown
  // window, hold it through the shutter, then fade out. The countdown duration
  // is kept at PHOTO_COUNTDOWN_MS so the TTS lines up with the shot.
  const runCountdownAndCapture = useCallback(async (
    pose: string,
    index: number,
    total: number,
    sessionId: string,
  ): Promise<{ id: string; pose: string } | null> => {
    setPhotoSession({ pose, index, total, phase: "capturing" });
    speak("Three, two, one, smile!");
    Animated.timing(glowOpacity, { toValue: 1, duration: PHOTO_COUNTDOWN_MS - 300, useNativeDriver: true }).start();
    await new Promise((r) => setTimeout(r, PHOTO_COUNTDOWN_MS));
    if (!photoSessionRef.current) {
      Animated.timing(glowOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      return null;
    }
    try {
      const pic = await cameraRef.current?.takePictureAsync({ quality: 0.85, skipProcessing: true });
      Animated.sequence([
        Animated.timing(flashOpacity, { toValue: 0.9, duration: 80, useNativeDriver: true }),
        Animated.timing(flashOpacity, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start();
      Animated.timing(glowOpacity, { toValue: 0, duration: 500, useNativeDriver: true }).start();
      if (pic?.uri) {
        const saved = await uploadPhoto({ uri: pic.uri, caption: pose, sessionId });
        return { id: saved.id, pose };
      }
    } catch (err) {
      console.warn("[Photos] Capture error:", err);
      Animated.timing(glowOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
    return null;
  }, [speak, flashOpacity, glowOpacity]);

  const startPhotoSession = useCallback(async (opts: { count?: number; auto?: boolean; poses?: string[] }) => {
    if (photoSessionRef.current) return;
    const totalShots = Math.max(1, Math.min(MAX_POSES, Math.floor(opts.count ?? opts.poses?.length ?? 5)));
    const auto = Boolean(opts.auto);
    const dictatedPoses = opts.poses?.length ? opts.poses.slice(0, totalShots) : null;
    photoSessionRef.current = true;
    console.log(`[Photos] Session starting — ${totalShots} shots, auto=${auto}, dictated=${Boolean(dictatedPoses)}`);

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

    speak(auto
      ? `Alright, let's get ${totalShots} shots. I'll countdown and snap when you look ready.`
      : `Alright, ${totalShots} shots coming up. Say yes when you want me to take each one.`);

    for (let i = 0; i < totalShots; i++) {
      if (!photoSessionRef.current) break;

      let currentPose = dictatedPoses?.[i] ?? "";
      let shouldTake = false;
      let attempts = 0;

      setPhotoSession({ pose: currentPose || "getting ready…", index: i, total: totalShots, phase: "pose" });
      pushComment({
        id: `pose-${Date.now()}-${i}`,
        user: "📸 Panda",
        text: `Shot ${i + 1}/${totalShots} — ${auto ? "I'll snap when the pose looks good" : "say yes when you're set"}`,
        avatar: "✨",
      });

      // Live coach loop: grab a frame, ask Gemini, speak guidance, repeat until ready-to-shoot
      while (!shouldTake && photoSessionRef.current && attempts < POSE_COACH_MAX_ATTEMPTS) {
        attempts += 1;
        let coachReady = false;
        try {
          const frame = await cameraRef.current?.takePictureAsync({ quality: 0.35, base64: true, skipProcessing: true });
          if (frame?.base64) {
            const coach = await poseCoach({
              base64: frame.base64,
              shotIndex: i,
              totalShots,
              auto,
              previousPose: currentPose,
            });
            if (!dictatedPoses) currentPose = coach.pose;
            coachReady = coach.readyToShoot;
            setPhotoSession({ pose: currentPose || coach.pose, index: i, total: totalShots, phase: coachReady ? "waiting" : "pose" });
            speak(coach.coaching);
          }
        } catch (err) {
          console.warn("[Photos] Coach error:", err);
        }

        if (!photoSessionRef.current) break;

        if (coachReady && auto) {
          shouldTake = true;
          break;
        }

        if (coachReady) {
          // Interactive: ask the streamer to confirm verbally
          speak("Looking great — say yes when you want the shot.");
          setPhotoSession({ pose: currentPose, index: i, total: totalShots, phase: "waiting" });
          const result = await waitForReady(READY_TIMEOUT_MS);
          if (!photoSessionRef.current) break;
          if (result === "stop") { stoppedEarly = true; break; }
          if (result === "ready") { shouldTake = true; break; }
          // timeout: let the coach loop re-evaluate the frame
        } else {
          // Not ready yet — wait a short beat so TTS finishes + user has time to adjust
          const result = await waitForReady(2800);
          if (!photoSessionRef.current) break;
          if (result === "stop") { stoppedEarly = true; break; }
          // "ready" from user here = force-take even though coach wasn't sure
          if (result === "ready") { shouldTake = true; break; }
        }
      }

      if (stoppedEarly) {
        speak("No worries, stopping the shoot.");
        pushComment({ id: `pose-stop-${Date.now()}`, user: "📸 Panda", text: "stopped by streamer", avatar: "✨" });
        break;
      }

      if (!shouldTake) {
        // Max attempts hit — take the shot anyway so we never stall forever
        speak("Taking it anyway — hold still.");
      }

      const saved = await runCountdownAndCapture(currentPose || "candid", i, totalShots, sessionId);
      if (saved) savedOriginals.push(saved);
      // Small breathing room before the next pose
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
        user: "📸 Panda",
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
      speak(`Done! Your ${total} original shots and cinematic edits are in the library images tab.`);
      pushComment({
        id: `pose-done-${Date.now()}`,
        user: "📸 Panda",
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
  }, [speak, pushComment, waitForReady, runCountdownAndCapture]); // eslint-disable-line

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
        pushComment({ id: `fit-empty-${Date.now()}`, user: "👗 Panda", text: "Can't see the fit clearly — try stepping back", avatar: "✨" });
      } else {
        const intro = items.length === 1
          ? `Spotted your ${items[0].label.toLowerCase()}. Dropping a link in chat.`
          : `Spotted ${items.length} pieces. Dropping links in chat.`;
        speak(intro);
        pushComment({ id: `fit-head-${Date.now()}`, user: "👗 Panda", text: intro, avatar: "✨" });
        items.forEach((item, i) => {
          setTimeout(() => {
            pushComment({
              id: `fit-${Date.now()}-${i}`,
               user: "👗 Panda",
              text: `${item.label} → tap to shop`,
              avatar: "🛍",
              link: item.searchUrl,
            });
          }, 350 + i * 450);
        });
      }
    } catch (err) {
      console.warn("[Outfit] Error:", err);
      pushComment({ id: `fit-err-${Date.now()}`, user: "👗 Panda", text: "Outfit scan failed — try again", avatar: "✨" });
    } finally {
      setOutfitScanning(false);
      outfitBusyRef.current = false;
      if (wasVideoLooping && isLiveRef.current && isTranscribingRef.current) {
        isVideoLoopRef.current = true;
        videoLoop();
      }
    }
  }, [speak, pushComment]); // eslint-disable-line

  // ── Rolling 35s video buffer loop ────────────────────────────────────────────
  // Continuously records 35s chunks while live. The last completed chunk URI is
  // always available in lastVideoChunkUriRef so the clip button can grab it.

  const startVideoBuffer = useCallback(async () => {
    if (videoBufferActiveRef.current) return;
    videoBufferActiveRef.current = true;
    console.log("[VideoBuffer] Starting rolling buffer");

    // Wait for camera to be in video mode and mounted before first record
    await new Promise((r) => setTimeout(r, 1500));

    while (videoBufferActiveRef.current) {
      // Pause buffer during photo/outfit sessions (they need picture mode)
      if (photoSessionRef.current || outfitBusyRef.current) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      if (!cameraRef.current) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      let succeeded = false;
      try {
        await new Promise<void>((resolveChunk) => {
          stopCurrentBufferRef.current = resolveChunk;
          cameraRef.current!.recordAsync({ maxDuration: 35 })
            .then((result) => {
              if (result?.uri) {
                lastVideoChunkUriRef.current = result.uri;
                console.log(`[VideoBuffer] Chunk saved: ${result.uri}`);
                succeeded = true;
              }
              resolveChunk();
            })
            .catch((err) => {
              console.warn("[VideoBuffer] recordAsync error:", err.message ?? err);
              resolveChunk();
            });
        });
        stopCurrentBufferRef.current = null;
      } catch (err: any) {
        console.warn("[VideoBuffer] Loop error:", err.message ?? err);
      }

      // Back off before retrying if recording failed immediately
      if (!succeeded) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    videoBufferActiveRef.current = false;
    console.log("[VideoBuffer] Stopped");
  }, []);

  const stopVideoBuffer = useCallback(() => {
    videoBufferActiveRef.current = false;
    if (cameraRef.current) {
      try { cameraRef.current.stopRecording(); } catch {}
    }
    stopCurrentBufferRef.current?.();
    stopCurrentBufferRef.current = null;
  }, []);

  // ── Clip: stop current buffer chunk, grab the video+audio, embed via Gemini ──

  const handleClip = useCallback(async () => {
    if (isClippingRef.current || photoSessionRef.current) return;
    isClippingRef.current = true;
    setIsClipping(true);

    pushComment({ id: `clip-start-${Date.now()}`, user: "✂️ Panda", text: "Clipping last 30s…", avatar: "🎬" });

    try {
      // Stop the current recording chunk so we get the URI immediately
      if (cameraRef.current) {
        try { cameraRef.current.stopRecording(); } catch {}
      }
      // Give recordAsync time to flush and write the file
      await new Promise((r) => setTimeout(r, 800));

      const videoUri = lastVideoChunkUriRef.current;
      if (!videoUri) {
        pushComment({ id: `clip-novid-${Date.now()}`, user: "✂️ Panda", text: "No video buffered yet — wait a few seconds and try again", avatar: "🎬" });
        return;
      }

      // Ask Gemini to describe the moment using recent speech context
      const contextLines = transcriptContextRef.current.slice(-4).join(" ");
      let clipPrompt = contextLines || "Highlight this moment";
      try {
        const geminiRes = await fetch(`${BACKEND_URL}/api/clip-prompt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context: transcriptContextRef.current.slice(-4) }),
        });
        const geminiData = await geminiRes.json();
        if (geminiData.clipPrompt) clipPrompt = geminiData.clipPrompt;
      } catch {}

      pushComment({ id: `clip-prompt-${Date.now()}`, user: "✂️ Panda", text: `"${clipPrompt}"`, avatar: "🎬" });

      // Restart the buffer before the slow upload so we don't lose coverage
      stopVideoBuffer();
      await new Promise((r) => setTimeout(r, 500));
      startVideoBuffer();

      // Send the real video file to /api/process
      // trimStart=5 trims the first ~5s (buffer startup artifact), giving ~30s of content
      const result = await processEdit(clipPrompt, [
        { name: "livestream_clip.mp4", duration: 35, uri: videoUri, trimStart: 5, trimEnd: 35 },
      ]);

      speak("Clip saved to your library!");
      pushComment({ id: `clip-done-${Date.now()}`, user: "✂️ Panda", text: `Saved! "${clipPrompt}"`, avatar: "🎬" });
      console.log(`[Clip] clipId: ${result.clipId}`);
    } catch (err: any) {
      console.warn("[Clip] Error:", err);
      pushComment({ id: `clip-err-${Date.now()}`, user: "✂️ Panda", text: "Clip failed — try again", avatar: "🎬" });
      stopVideoBuffer();
      await new Promise((r) => setTimeout(r, 500));
      startVideoBuffer();
    } finally {
      isClippingRef.current = false;
      setIsClipping(false);
    }
  }, [speak, pushComment, startVideoBuffer, stopVideoBuffer]); // eslint-disable-line

  // ── GIF comment loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLive) return;
    const TENOR_KEY = "LIVDSRZULELA";
    let cancelled = false;

    async function fireGif() {
      if (cancelled) return;
      const context = transcriptContextRef.current.slice(-4).join(" ").trim();
      if (!context) return;
      try {
        // Ask Gemini (via backend) for a search term — or just use Tenor directly with a keyword from context
        const words = context.replace(/[^a-z0-9\s]/gi, " ").split(/\s+/).filter(w => w.length > 3);
        if (!words.length) return;
        const term = words.slice(-2).join(" ");
        const url = `https://api.tenor.com/v1/search?q=${encodeURIComponent(term)}&key=${TENOR_KEY}&limit=8&contentfilter=medium&media_filter=minimal`;
        const res = await fetch(url);
        const json = await res.json() as any;
        const results = json.results;
        if (!results?.length || cancelled) return;
        const pick = results[Math.floor(Math.random() * Math.min(5, results.length))];
        const gifUrl = pick.media?.[0]?.gif?.url ?? pick.media?.[0]?.tinygif?.url ?? pick.media?.[0]?.mediumgif?.url;
        if (!gifUrl || cancelled) return;
        const names = ["😂 viewer", "🔥 chat", "💀 fan", "👀 viewer", "😭 chat"];
        const name = names[Math.floor(Math.random() * names.length)];
        pushComment({ id: `gif-${Date.now()}`, user: name, text: "", avatar: "🎭", gifUrl });
      } catch {}
    }

    // Fire first one after a short delay, then every 20s
    const first = setTimeout(fireGif, 8000);
    const interval = setInterval(fireGif, 20000);
    return () => { cancelled = true; clearTimeout(first); clearInterval(interval); };
  }, [isLive]); // eslint-disable-line

  useEffect(() => {
    if (isTranscribing && isLive) {
      isAudioLoopRef.current = true;
      isVideoLoopRef.current = true;
      audioLoop();
      videoLoop();
      // iOS can feed audio directly to Gemini Live — open the session eagerly
      // so the audioLoop has somewhere to send its PCM chunks from turn 1.
      if (Platform.OS === "ios") {
        ensurePandaLive();
      }
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
    // Start video buffer after camera is fully in video mode
    setTimeout(() => startVideoBuffer(), 2500);
  };

  const handleEndStream = () => {
    Alert.alert("End Stream", "End the live stream?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "End", style: "destructive",
        onPress: async () => {
          stopVideoBuffer();
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

  /** Map the recorder output path to a best-effort MIME type. */
  function getAudioMimeType(uri: string) {
    const ext = getAudioExtension(uri);
    if (ext === ".caf") return "audio/x-caf";
    if (ext === ".wav") return "audio/wav";
    if (ext === ".webm") return "audio/webm";
    if (ext === ".mp3") return "audio/mpeg";
    return "audio/mp4";
  }

  /** Pull the file extension from a local recording URI. */
  function getAudioExtension(uri: string) {
    const cleanUri = uri.split("?")[0] ?? uri;
    const match = cleanUri.match(/(\.[a-z0-9]+)$/i);
    return match?.[1]?.toLowerCase() ?? ".m4a";
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* ── LAYER 1: Fullscreen camera ── */}
      {granted ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode={photoSession ? "picture" : "video"}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.camFallback]}>
          <Ionicons name="videocam-outline" size={48} color={COLORS.textMuted} style={{ marginBottom: SPACING.md }} />
          <Text style={styles.camFallbackText}>Camera & Mic Access Required</Text>
        </View>
      )}

      {/* ── LAYER 2: Overlay UI ── */}
      <View style={styles.overlay} pointerEvents="box-none">

        {/* TOP BAR */}
        <View style={styles.topBar}>
          <View style={styles.topLeft}>
            <View style={styles.pandaIconWrap}>
              <MaterialCommunityIcons name="panda" size={22} color="#FFFFFF" />
            </View>
            {isLive && (
              <View style={styles.livePillWrap}>
                <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
                <Text style={styles.livePillText}>LIVE</Text>
              </View>
            )}
          </View>

          {isLive && (
            <View style={styles.topCenter}>
              <Text style={styles.durationText}>{fmt(duration)}</Text>
            </View>
          )}

          <View style={styles.topRight}>
            {isLive && (
              <View style={styles.viewersChip}>
                <Ionicons name="eye-outline" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={styles.viewersText}>{viewers.toLocaleString()}</Text>
              </View>
            )}
            <TouchableOpacity
              style={styles.flipChip}
              onPress={() => setFacing((f) => f === "front" ? "back" : "front")}
            >
              <Ionicons name="camera-reverse" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            {isLive && (
              <TouchableOpacity style={styles.endChip} onPress={handleEndStream}>
                <Ionicons name="close" size={18} color="#FFFFFF" />
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

        {/* Clip overlay */}
        {activeClip && (
          <ClipOverlay
            key={activeClip.mountKey}
            clip={activeClip}
            onClose={() => setActiveClip(null)}
          />
        )}

        {activeProduct && (
          <ProductOverlay
            key={activeProduct.mountKey}
            item={activeProduct}
            onClose={() => setActiveProduct(null)}
          />
        )}

        {/* Emoji mode banner */}
        {emojiMode && !assistantActive && (
          <View style={[styles.statusBanner, styles.emojiBanner]} pointerEvents="none">
            <Text style={styles.emojiModeText}>EMO MODE ON</Text>
          </View>
        )}

        {/* Assistant banner */}
        {assistantActive && (
          <View style={[styles.statusBanner, styles.zeeBanner]} pointerEvents="none">
            <Text style={styles.zeeText}>🐼 Panda is thinking…</Text>
          </View>
        )}

        {pandaLiveOn && (
          <View style={[styles.statusBanner, styles.zeeBanner, { top: 104 }]} pointerEvents="none">
            <Text style={styles.zeeText}>🐼 {pandaDebug}</Text>
          </View>
        )}

        {/* Outfit scan banner */}
        {outfitScanning && (
          <View style={[styles.statusBanner, styles.zeeBanner]} pointerEvents="none">
            <Text style={styles.zeeText}>👗 Panda is scanning your fit…</Text>
          </View>
        )}

        {/* Clip banner */}
        {isClipping && (
          <View style={[styles.statusBanner, styles.clipBanner]} pointerEvents="none">
            <Text style={styles.clipBannerText}>✂️ Clipping with Gemini…</Text>
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
        <Animated.View pointerEvents="none" style={[styles.photoGlow, { opacity: glowOpacity }]} />

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
            <Ionicons name="videocam" size={52} color={COLORS.text} style={{ marginBottom: SPACING.md }} />
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
                <Ionicons name={isMuted ? "mic-off" : "mic"} size={20} color="#FFFFFF" />
              </TouchableOpacity>
              {isLive && (
                <TouchableOpacity
                  style={[styles.sideBtn, isTranscribing && styles.sideBtnGreen]}
                  onPress={handleToggleTranscribe}
                >
                  <Ionicons name="sparkles" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              )}
              {isLive && (
                <TouchableOpacity
                  style={[styles.sideBtn, pandaLiveOn && styles.sideBtnActive]}
                  onPress={togglePandaLive}
                >
                  <Ionicons name="paw" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.sideBtn, showCommands && styles.sideBtnActive]}
                onPress={() => setShowCommands(v => !v)}
              >
                <Ionicons name="help-circle-outline" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sideBtn, styles.sideBtnClip, isClipping && styles.sideBtnRed]}
                onPress={handleClip}
                disabled={isClipping}
              >
                <Ionicons name="cut" size={20} color="#FFFFFF" />
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
                      {c.gifUrl ? (
                        <Image source={{ uri: c.gifUrl }} style={styles.chatGif} resizeMode="cover" />
                      ) : (
                        <Text style={[styles.chatMsg, c.link && styles.chatMsgLink]}>{c.text}</Text>
                      )}
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
                <Text style={styles.goLiveText}>{t("goLive")}</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>

        {/* Commands sheet */}
        {showCommands && (
          <View style={styles.commandsSheet}>
            <View style={styles.commandsHeader}>
              <Text style={styles.commandsTitle}>Voice Commands</Text>
              <TouchableOpacity onPress={() => setShowCommands(false)}>
                <Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" />
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
  pandaIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
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
  durationText: { fontSize: 14, fontWeight: "700", color: "#fff", letterSpacing: 0.5 },
  topRight: { flexDirection: "row", alignItems: "center", gap: SPACING.sm, flex: 1, justifyContent: "flex-end" },
  viewersChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: RADII.full,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  viewersText: { fontSize: 12, fontWeight: "600", color: "#fff" },
  flipChip: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
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
  clipBanner: { borderColor: "#34d39955", backgroundColor: "rgba(0,0,0,0.7)" },
  clipBannerText: { fontSize: 13, color: "#34d399", fontWeight: "700" },

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
  // Thick white glowing border that pulses up while Panda counts down to a shot.
  photoGlow: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 8,
    borderColor: "#fff",
    borderRadius: 36,
    shadowColor: "#fff",
    shadowOpacity: 1,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 0 },
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
  sideBtnActive: { borderColor: "#34d399", backgroundColor: "rgba(52,211,153,0.2)" },
  sideBtnClip: { borderColor: "#34d399", backgroundColor: "rgba(52,211,153,0.15)" },
  emojiBanner: { borderColor: "#a855f755", backgroundColor: "rgba(0,0,0,0.7)" },
  emojiModeText: { fontSize: 13, color: "#a855f7", fontWeight: "700" },
  sideBtnIcon: { fontSize: 11, fontWeight: "700", color: "#FFFFFF", letterSpacing: 0.5 },

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
  chatGif: { width: 140, height: 100, borderRadius: 8, marginTop: 4 },
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
