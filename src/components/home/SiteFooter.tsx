"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";

const OWNER = "MrxHuaang";
const REPO = "poker-sim";

type Person = { login: string; avatarUrl: string; htmlUrl: string };

const PEOPLE: Record<string, string> = {
  MrxHuaang: "MrxHuaang",
  poethy: "Poethy",
  JuanGaitanD: "Juan Gaitan",
  MiloAgudelo: "Milo Agudelo",
};

function person(login: string): Person {
  return {
    login,
    avatarUrl: `https://github.com/${login}.png?size=64`,
    htmlUrl: `https://github.com/${login}`,
  };
}

const FALLBACK: Person[] = ["poethy", "JuanGaitanD", "MiloAgudelo"].map(person);

function displayName(login: string) {
  return PEOPLE[login] ?? login;
}

function GithubIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export function SiteFooter() {
  const [stars, setStars] = useState<number | null>(null);
  const [contributors, setContributors] = useState<Person[]>(FALLBACK);

  useEffect(() => {
    const ac = new AbortController();
    // Single cached server route instead of two direct, uncached, unauthenticated
    // hits to api.github.com on every mount.
    fetch("/api/github-meta", { signal: ac.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { stars: number | null; contributors: Person[] }) => {
        if (typeof d.stars === "number") setStars(d.stars);
        if (Array.isArray(d.contributors) && d.contributors.length > 0) {
          setContributors(d.contributors);
        }
      })
      .catch(() => {});
    return () => ac.abort();
  }, []);

  return (
    <footer className="w-full border-t border-line pt-10 pb-12">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-4">
          <p className="font-display text-2xl text-primary">
            Noir <span className="suit" aria-hidden>♠</span>
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <PersonChip person={person(OWNER)} label="Autor principal" prominent />
            {contributors.map((contributor) => (
              <PersonChip key={contributor.login} person={contributor} label="Colaborador" />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted">
          <a
            href={`https://github.com/${OWNER}/${REPO}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 transition-colors hover:text-primary"
          >
            <GithubIcon />
            <span className="numeric text-xs">{OWNER}/{REPO}</span>
          </a>
          {stars !== null && (
            <span className="numeric inline-flex items-center gap-1 text-xs">
              <Star className="h-3 w-3" />
              {stars}
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}

function PersonChip({
  person,
  label,
  prominent = false,
}: {
  person: Person;
  label: string;
  prominent?: boolean;
}) {
  return (
    <a
      href={person.htmlUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={`${displayName(person.login)} | ${label}`}
      className="group inline-flex min-w-0 items-center gap-2.5 text-secondary transition-colors hover:text-primary"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={person.avatarUrl}
        alt={displayName(person.login)}
        loading="lazy"
        className={`rounded-[8px] object-cover grayscale transition group-hover:grayscale-0 ${
          prominent ? "h-8 w-8" : "h-7 w-7"
        }`}
      />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-sm font-medium text-inherit">
          {displayName(person.login)}
        </span>
        <span className="eyebrow block truncate">{label}</span>
      </span>
    </a>
  );
}
