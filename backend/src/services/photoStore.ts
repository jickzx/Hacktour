/**
 * Photo library storage — saves photo files to disk + keeps a JSON index
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const DATA_DIR = join(__dirname, "../../data");
const PHOTOS_DIR = join(DATA_DIR, "photos");
const INDEX_FILE = join(DATA_DIR, "photos.json");

export type PhotoVariant = "original" | "edited";

export interface PhotoEntry {
  id: string;
  filename: string;
  url: string;
  caption: string;
  createdAt: string;
  sessionId: string;
  variant: PhotoVariant;
  parentId?: string;
}

let photos: PhotoEntry[] = [];

function loadFromDisk(): void {
  try {
    if (existsSync(INDEX_FILE)) {
      const raw = readFileSync(INDEX_FILE, "utf-8");
      photos = JSON.parse(raw) as PhotoEntry[];
      // Backfill variant on legacy entries
      photos = photos.map((p) => (p.variant ? p : { ...p, variant: "original" as PhotoVariant }));
      console.log(`[PhotoStore] Loaded ${photos.length} photos from disk`);
    }
  } catch (err) {
    console.warn("[PhotoStore] Failed to load:", err);
    photos = [];
  }
}

function saveIndex(): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(INDEX_FILE, JSON.stringify(photos, null, 2), "utf-8");
  } catch (err) {
    console.warn("[PhotoStore] Failed to save index:", err);
  }
}

loadFromDisk();

export const photoStore = {
  savePhoto(entry: {
    caption: string;
    sessionId: string;
    buffer: Buffer;
    ext: string;
    variant?: PhotoVariant;
    parentId?: string;
  }): PhotoEntry {
    mkdirSync(PHOTOS_DIR, { recursive: true });
    const id = crypto.randomUUID();
    const filename = `${id}.${entry.ext}`;
    const filePath = join(PHOTOS_DIR, filename);
    writeFileSync(filePath, entry.buffer);
    const photo: PhotoEntry = {
      id,
      filename,
      url: `/api/photos/file/${filename}`,
      caption: entry.caption,
      createdAt: new Date().toISOString(),
      sessionId: entry.sessionId,
      variant: entry.variant ?? "original",
      parentId: entry.parentId,
    };
    photos.push(photo);
    saveIndex();
    return photo;
  },

  getAllPhotos(): PhotoEntry[] {
    return [...photos].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  },

  getPhotoById(id: string): PhotoEntry | undefined {
    return photos.find((p) => p.id === id);
  },

  getFilePath(filename: string): string {
    return join(PHOTOS_DIR, filename);
  },

  readFileBuffer(filename: string): Buffer {
    return readFileSync(join(PHOTOS_DIR, filename));
  },
};
