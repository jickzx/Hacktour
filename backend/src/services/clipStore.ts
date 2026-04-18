/**
 * In-memory clip store with filesystem backup to backend/data/clips.json
 * Clips survive server restarts during development
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import type { ClipEntry } from "../types/clip";
import { cosineSimilarity } from "./embedding";

const DATA_DIR = join(__dirname, "../../data");
const CLIPS_FILE = join(DATA_DIR, "clips.json");

/** In-memory store — loaded from disk on startup */
let clips: ClipEntry[] = [];

/** Loads clips from disk if the file exists */
function loadFromDisk(): void {
  try {
    if (existsSync(CLIPS_FILE)) {
      const raw = readFileSync(CLIPS_FILE, "utf-8");
      clips = JSON.parse(raw) as ClipEntry[];
      console.log(`[ClipStore] Loaded ${clips.length} clips from disk`);
    }
  } catch (err) {
    console.warn("[ClipStore] Failed to load clips from disk:", err);
    clips = [];
  }
}

/** Persists current clips array to disk */
function saveToDisk(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(CLIPS_FILE, JSON.stringify(clips, null, 2), "utf-8");
  } catch (err) {
    console.warn("[ClipStore] Failed to save clips to disk:", err);
  }
}

// Load on module init
loadFromDisk();

export const clipStore = {
  /** Saves a new clip, generates id + createdAt, persists to disk */
  saveClip(entry: Omit<ClipEntry, "id" | "createdAt">): ClipEntry {
    const clip: ClipEntry = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    clips.push(clip);
    saveToDisk();
    return clip;
  },

  /** Returns all clips sorted newest first */
  getAllClips(): ClipEntry[] {
    return [...clips].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  /** Finds a clip by its id */
  getClipById(id: string): ClipEntry | undefined {
    return clips.find((c) => c.id === id);
  },

  /** Returns top N clips ranked by cosine similarity to the query embedding */
  searchByEmbedding(
    queryEmbedding: number[],
    limit: number
  ): (ClipEntry & { score: number })[] {
    return clips
      .map((clip) => ({
        ...clip,
        score: cosineSimilarity(queryEmbedding, clip.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  },
};
