// Cached proxy for the repo star count + contributor list shown in the footer.
// Visitors used to hit api.github.com twice per page mount (unauthenticated, so
// 60 req/h/IP); now the footer hits this route, which fetches upstream at most
// once per revalidate window and serves a cached payload to everyone.
import { NextResponse } from "next/server";

const OWNER = "MrxHuaang";
const REPO = "poker-sim";
const TTL = 3600; // 1h

export const revalidate = 3600;

type Contributor = { login: string; avatarUrl: string; htmlUrl: string };

export async function GET() {
  let stars: number | null = null;
  let contributors: Contributor[] = [];

  try {
    const [repoRes, contribRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${OWNER}/${REPO}`, {
        next: { revalidate: TTL },
      }),
      fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contributors?per_page=30`, {
        next: { revalidate: TTL },
      }),
    ]);

    if (repoRes.ok) {
      const repo = (await repoRes.json()) as { stargazers_count?: number };
      if (typeof repo.stargazers_count === "number") stars = repo.stargazers_count;
    }

    if (contribRes.ok) {
      const list = (await contribRes.json()) as {
        login: string;
        avatar_url: string;
        html_url: string;
        type?: string;
      }[];
      if (Array.isArray(list)) {
        contributors = list
          .filter((c) => c.type !== "Bot" && !c.login.endsWith("[bot]") && c.login !== OWNER)
          .map((c) => ({ login: c.login, avatarUrl: c.avatar_url, htmlUrl: c.html_url }));
      }
    }
  } catch {
    // Upstream unavailable: serve nulls; the footer keeps its fallback list.
  }

  return NextResponse.json(
    { stars, contributors },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
