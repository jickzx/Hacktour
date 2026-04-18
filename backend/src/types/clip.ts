/** Clip library types used across the app */

import type { RemotionComposition } from "../types/remotion";

/** A saved clip entry */
export interface ClipEntry {
  id: string;
  prompt: string;
  embedding: number[];
  composition: RemotionComposition;
  sourceVideoUrl: string;
  thumbnailUrl?: string;
  durationSeconds: number;
  createdAt: string;
  title: string;
}

/** The full saved clip library */
export interface ClipLibrary {
  clips: ClipEntry[];
}

/** Request for saving a clip */
export interface SaveClipRequest {
  prompt: string;
  composition: RemotionComposition;
  sourceVideoUrl: string;
  durationSeconds?: number;
}

/** Response for saving a clip */
export interface SaveClipResponse {
  success: boolean;
  clip?: ClipEntry;
  error?: string;
}

/** Request for searching clips */
export interface SearchClipsRequest {
  query: string;
  limit?: number;
}

/** Response for searching clips */
export interface SearchClipsResponse {
  success: boolean;
  results?: Array<ClipEntry & { score: number }>;
  error?: string;
}
