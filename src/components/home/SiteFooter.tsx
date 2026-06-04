"use client";
// Site footer: shows the author (repo owner) prominently and contributors as a
// dynamic avatar row, fetched from the GitHub contributors API (falls back to a
// static list on rate-limit/offline). Keeps the repo link + star count.
import { useEffect, useState } from "react";
import { Star } from "lucide-react";

const OWNER = "MrxHuaang";
const REPO = "poker-sim";

type Person = { login: string; avatarUrl: string; htmlUrl: string };

function person(login: string): Person {
  return {
    login,
    avatarUrl: `https://github.com/${login}.png?size=64`,
    htmlUrl: `https://github.com/${login}`,
  };
}

// Used until the API responds (and if it fails). Keeps known contributors visible.
const FALLBACK: Person[] = ["poethy", "JuanGaitanD", "MiloAgudelo"].map(person);

function GithubIcon() {
  return (
    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function SiteFooter() {
  const [stars, setStars] = useState<number | null>(null);
  const [contributors, setContributors] = useState<Person[]>(FALLBACK);

  useEffect(() => {
    fetch(`https://api.github.com/repos/${OWNER}/${REPO}`)
      .then((r) => r.json())
      .then((d) => typeof d.stargazers_count === "number" && setStars(d.stargazers_count))
      .catch(() => {});

    fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contributors?per_page=30`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((list: { login: string; avatar_url: string; html_url: string; type?: string }[]) => {
        if (!Array.isArray(list)) return;
        const people = list
          .filter((c) => c.type !== "Bot" && !c.login.endsWith("[bot]") && c.login !== OWNER)
          .map((c) => ({ login: c.login, avatarUrl: c.avatar_url, htmlUrl: c.html_url }));
        if (people.length > 0) setContributors(people);
      })
      .catch(() => {/* keep fallback */});
  }, []);

  return (
    <footer className="w-full flex flex-col items-center gap-4 pb-3">
      <div className="w-full h-px bg-gradient-to-r from-transparent via-zinc-800 to-transparent" />

      {/* Author */}
      <div className="flex items-center gap-3">
        <a
          href={`https://github.com/${OWNER}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 group"
          title={`${OWNER} — autor`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://github.com/${OWNER}.png?size=72`}
            alt={OWNER}
            loading="lazy"
            className="w-9 h-9 rounded-full ring-2 ring-accent-400/40 group-hover:ring-accent-400/70 transition"
          />
          <span className="flex flex-col leading-tight">
            <span className="text-[9px] uppercase tracking-[0.25em] text-accent-300/80 font-black">
              Autor
            </span>
            <span className="text-sm text-zinc-100 font-bold group-hover:text-white transition">
              {OWNER}
            </span>
          </span>
        </a>
      </div>

      {/* Contributors */}
      {contributors.length > 0 && (
        <div className="flex items-center gap-2.5">
          <span className="text-[9px] uppercase tracking-[0.25em] text-zinc-600 font-black">
            Contribuyen
          </span>
          <div className="flex items-center -space-x-1.5">
            {contributors.map((c) => (
              <a
                key={c.login}
                href={c.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={`@${c.login}`}
                className="transition hover:-translate-y-0.5 hover:z-10"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.avatarUrl}
                  alt={c.login}
                  loading="lazy"
                  className="w-7 h-7 rounded-full ring-2 ring-zinc-900 bg-zinc-800 hover:ring-accent-400/50 transition"
                />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Repo meta */}
      <div className="flex items-center gap-4 text-[11px] text-zinc-600">
        <a
          href={`https://github.com/${OWNER}/${REPO}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-zinc-500 hover:text-zinc-300 transition tracking-wide"
        >
          <GithubIcon />
          {REPO}
        </a>
        {stars !== null && (
          <span className="flex items-center gap-1">
            <Star className="w-3 h-3 fill-zinc-700 text-zinc-700" />
            {stars}
          </span>
        )}
        <span className="text-zinc-700">·</span>
        <span className="uppercase tracking-[0.2em] text-zinc-700">Noir v1</span>
      </div>
    </footer>
  );
}
