/**
 * Demo inventory rows — each item is either order-only or bid-only (never both).
 */
import type { InventoryProduct } from "../services/api";

const ago = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

/** How this demo line is sold: fixed orders OR auction — mutually exclusive. */
export type MockSalesChannel = "order" | "bid";

export type MockInventoryRow = InventoryProduct & { salesChannel: MockSalesChannel };

export const MOCK_INVENTORY_ITEMS: MockInventoryRow[] = [
  {
    id: "AP7L",
    name: "Fresh Gala Apples (1 kg)",
    salesChannel: "order",
    createdAt: ago(3),
    mode: "order",
    orders: [
      { commenter: "hype_chat_7", quantity: 2, timestamp: ago(2.5) },
      { commenter: "lurker_mia", quantity: 3, timestamp: ago(2.2) },
      { commenter: "tokyo_snaps", quantity: 1, timestamp: ago(1.8) },
      { commenter: "smoothie_bar_lu", quantity: 5, timestamp: ago(1.1) },
    ],
    bids: [],
    highestBid: 0,
  },
  {
    id: "UQTS",
    name: "Uniqlo Supima Cotton Crew Tee",
    salesChannel: "order",
    createdAt: ago(8),
    mode: "none",
    orders: [
      { commenter: "minimal_fit", quantity: 3, timestamp: ago(7.5) },
      { commenter: "capsule_wardrobe", quantity: 2, timestamp: ago(6) },
      { commenter: "uni_student_22", quantity: 1, timestamp: ago(5.2) },
    ],
    bids: [],
    highestBid: 0,
  },
  {
    id: "UQJK",
    name: "Uniqlo Blocktech Parka",
    salesChannel: "bid",
    createdAt: ago(14),
    mode: "bid",
    orders: [],
    bids: [
      { commenter: "outdoor_mo", amount: 95, timestamp: ago(12.5) },
      { commenter: "hiker_jules", amount: 112, timestamp: ago(11) },
      { commenter: "gear_head", amount: 118, timestamp: ago(9.5) },
      { commenter: "storm_chaser", amount: 145, timestamp: ago(8) },
    ],
    highestBid: 145,
  },
  {
    id: "MXBK",
    name: "Black Nike Air Maxes",
    salesChannel: "bid",
    createdAt: ago(20),
    mode: "none",
    orders: [],
    bids: [
      { commenter: "sneakerHead_99", amount: 210, timestamp: ago(19) },
      { commenter: "resell_king", amount: 265, timestamp: ago(18) },
      { commenter: "size_10_only", amount: 280, timestamp: ago(16.5) },
      { commenter: "tokyo_kicks", amount: 310, timestamp: ago(15) },
    ],
    highestBid: 310,
  },
];
