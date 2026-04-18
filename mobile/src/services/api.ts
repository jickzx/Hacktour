/** API service for communicating with the Stream Mind backend */

const API_BASE = "http://localhost:3001";

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

/** Sends clips and prompt to the AI edit endpoint */
export async function generateEdit(
  prompt: string,
  clips: { name: string; duration: number }[]
) {
  const res = await fetch(`${API_BASE}/api/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, clips }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `API error: ${res.status}`);
  }
  return data.composition;
}
