/** Product lookup API used by Panda on the live screen. */
import { BACKEND_URL as API_BASE } from "./backendUrl";

export interface ProductItem {
  title: string;
  price?: string;
  store?: string;
  url: string;
  displayUrl: string;
  summary: string;
}

/** Look up a product link from a spoken shopping query. */
export async function findProduct(query: string): Promise<ProductItem> {
  const res = await fetch(`${API_BASE}/api/product-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  const data = await res.json();
  if (!res.ok || !data.success || !data.item) {
    throw new Error(data.error || `API error: ${res.status}`);
  }

  return data.item as ProductItem;
}
