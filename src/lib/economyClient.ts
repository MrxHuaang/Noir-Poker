// Client-side helper for POST /api/economy. The token must be a valid Firebase
// ID token — the server verifies it and derives the uid from it (client-provided
// uid is ignored). All mutations (buy-in, cash-out, XP) go through this route.
export async function callEconomy(
  token: string,
  action: string,
  params: Record<string, unknown> = {},
): Promise<unknown> {
  const res = await fetch("/api/economy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({ action, ...params }),
  });
  const data = await res.json().catch(() => ({ error: "Error de red" }));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error ?? "Error desconocido");
  }
  return data;
}
