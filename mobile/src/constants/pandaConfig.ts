/**
 * Panda assistant config — wake words, commands, timing constants, and types.
 */

export const AUDIO_CHUNK_MS = 3000;
export const FRAME_INTERVAL_MS = 7000;

export const WAKE_WORDS = /(?:^|\s)(hey\s+panda|ok\s+panda|yo\s+panda|panda\s+go|panda)(?:\s|,|!|$)/i;
export const PANDA_STOP_RE = /(?:^|\s)(?:hey\s+)?panda\s+stop(?:\s|,|!|\.|$)/i;
export const APP_CONTROL_RE = /\b(go live|end stream|mute|unmute|flip camera|emoji mode|hype|shoutout|countdown|create poll|close poll|go to|open|take my photo|take pictures|photo shoot|what am i wearing|rate my fit|find my outfit|change your voice|change voice|pull up|show .*clip|play .*clip|find .*clip)\b/i;

export const PANDA_COMMANDS = [
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
];

export const MAX_POSES = 10;
export const READY_TIMEOUT_MS = 22000;
export const READY_RE = /\b(yes|yep|yeah|yup|ready|go|shoot|take it|take the (shot|photo|picture)|do it|i'?m ready|ok|okay|sure)\b/i;
export const STOP_RE = /\b(stop|cancel|never\s*mind|no more|abort|that'?s enough|enough|done)\b/i;

export interface Comment {
  id: string;
  user: string;
  text: string;
  avatar: string;
  isTranscript?: boolean;
  link?: string;
}
