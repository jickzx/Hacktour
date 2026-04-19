import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

const STORE_PATH = "/tmp/hacktour-inventory.json";

export interface InventoryOrder {
  commenter: string;
  quantity: number;
  timestamp: string;
}

export interface InventoryBid {
  commenter: string;
  amount: number;
  timestamp: string;
}

export interface InventoryProduct {
  id: string;          // short 4-char alphanumeric e.g. "AB12"
  name: string;
  photoBase64?: string;
  createdAt: string;
  mode: "order" | "bid" | "none";
  orders: InventoryOrder[];
  bids: InventoryBid[];
  highestBid: number;
}

let store: InventoryProduct[] = [];

function load() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
    }
  } catch { store = []; }
}

function save() {
  try {
    // Skip huge base64 blobs — sync writes of MB-sized JSON stall the server and HTTP responses.
    const slim = store.map(({ photoBase64: _b, ...rest }) => rest);
    fs.writeFileSync(STORE_PATH, JSON.stringify(slim, null, 2));
  } catch {}
}

load();

function generateId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  while (id.length < 4) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  // ensure unique
  if (store.some((p) => p.id === id)) return generateId();
  return id;
}

export function addProduct(name: string, photoBase64?: string): InventoryProduct {
  const product: InventoryProduct = {
    id: generateId(),
    name,
    photoBase64,
    createdAt: new Date().toISOString(),
    mode: "none",
    orders: [],
    bids: [],
    highestBid: 0,
  };
  store.unshift(product);
  save();
  return product;
}

export function getProduct(id: string): InventoryProduct | undefined {
  return store.find((p) => p.id === id);
}

export function listProducts(): InventoryProduct[] {
  return store;
}

export function setProductMode(id: string, mode: "order" | "bid" | "none"): InventoryProduct | null {
  const p = store.find((p) => p.id === id);
  if (!p) return null;
  p.mode = mode;
  save();
  return p;
}

export function placeOrder(productId: string, commenter: string, quantity = 1): InventoryProduct | null {
  const p = store.find((p) => p.id === productId);
  if (!p || p.mode !== "order") return null;
  p.orders.push({ commenter, quantity, timestamp: new Date().toISOString() });
  save();
  return p;
}

export function placeBid(productId: string, commenter: string, amount: number): InventoryProduct | null {
  const p = store.find((p) => p.id === productId);
  if (!p || p.mode !== "bid") return null;
  if (amount <= p.highestBid) return null;
  p.bids.push({ commenter, amount, timestamp: new Date().toISOString() });
  p.highestBid = amount;
  save();
  return p;
}

export function clearStore() {
  store = [];
  save();
}
