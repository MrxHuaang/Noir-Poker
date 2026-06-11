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

// Fire-and-forget variant for pagehide/tab-close: `keepalive` lets the request
// outlive the document, so the cash-out still lands when the user closes the
// tab instead of navigating within the SPA. Errors are intentionally swallowed
// (there is no UI left to report to); reconciliation can settle later.
export function callEconomyKeepalive(
  token: string,
  action: string,
  params: Record<string, unknown> = {},
): void {
  try {
    void fetch("/api/economy", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ action, ...params }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* no-op */
  }
}
