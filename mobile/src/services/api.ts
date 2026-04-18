/** API service for communicating with the Hacktour backend */

const API_BASE = "http://localhost:3001";

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
