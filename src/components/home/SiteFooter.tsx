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
    fetch(`https://api.github.com/repos/${OWNER}/${REPO}`)
      .then((r) => r.json())
      .then((d) => {
        if (typeof d.stargazers_count === "number") {
          setStars(d.stargazers_count);
        }
      })
      .catch(() => {});

    fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contributors?per_page=30`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((list: { login: string; avatar_url: string; html_url: string; type?: string }[]) => {
        if (!Array.isArray(list)) return;

        const people = list
          .filter((c) => c.type !== "Bot" && !c.login.endsWith("[bot]") && c.login !== OWNER)
          .map((c) => ({ login: c.login, avatarUrl: c.avatar_url, htmlUrl: c.html_url }));

        if (people.length > 0) {
          setContributors(people);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <footer className="w-full pb-3 pt-2">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(255,255,255,0.02))] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] lg-blur sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
              Equipo
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <PersonChip person={person(OWNER)} label="Autor principal" prominent />
              {contributors.map((contributor) => (
                <PersonChip
                  key={contributor.login}
                  person={contributor}
                  label="Colabora"
                />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 self-start pl-0 text-[11px] text-zinc-500 lg:self-end">
            <a
              href={`https://github.com/${OWNER}/${REPO}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 transition hover:text-zinc-300"
            >
              <GithubIcon />
              <span className="tracking-[0.14em]">{REPO}</span>
            </a>
            {stars !== null && (
              <span className="inline-flex items-center gap-1 text-zinc-600">
                <Star className="h-3 w-3 fill-zinc-700 text-zinc-700" />
                {stars}
              </span>
            )}
          </div>
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
      className={`group inline-flex min-w-0 items-center gap-2 rounded-full border px-2.5 py-2 transition ${
        prominent
          ? "border-accent-400/16 bg-accent-500/[0.08] text-zinc-100 hover:border-accent-400/28 hover:bg-accent-500/[0.12]"
          : "border-white/7 bg-white/[0.03] text-zinc-300 hover:border-white/12 hover:bg-white/[0.05]"
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={person.avatarUrl}
        alt={displayName(person.login)}
        loading="lazy"
        className={`rounded-full object-cover ${
          prominent
            ? "h-9 w-9 ring-1 ring-accent-300/25"
            : "h-8 w-8 ring-1 ring-white/10"
        }`}
      />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-xs font-medium text-inherit">
          {displayName(person.login)}
        </span>
        <span
          className={`block truncate text-[10px] uppercase tracking-[0.16em] ${
            prominent ? "text-accent-200/70" : "text-zinc-500"
          }`}
        >
          {label}
        </span>
      </span>
    </a>
  );
}
