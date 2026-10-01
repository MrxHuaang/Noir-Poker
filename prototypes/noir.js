/* Noir Poker site runtime shared by landing, panel, perfil and invitación:
   the peephole transition between pages, the brand sounds, the cast and the rotating character of the week. */
(() => {
  "use strict";
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // film grain texture for .grain
  const c = document.createElement("canvas"); c.width = c.height = 120; const x = c.getContext("2d"), im = x.createImageData(120, 120);
  for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0); document.documentElement.style.setProperty("--noise", `url(${c.toDataURL()})`);

  // the cast (one source for every page)
  const CAST = {
    bruma: ["Don Salvatore Bruma", "El que no pestañea", "Don Bruma"], ofelia: ["Ofelia Ferrán", "La Viuda", "La Viuda"], malaquias: ["Malaquías Garza", "El Tuerto de Tijuana", "Tuerto"],
    iturbe: ["Casimiro Iturbe", "El Mago de Feria", "Iturbe"], nicanor: ["Nicanor Carmona", "Dedos", "Dedos"], kessler: ["Aldebrand Kessler", "El Relojero", "El Suizo"],
    lulu: ["Lulú Medianoche", "La Reina del Charlestón", "Lulú"], arrieta: ["Tobías Arrieta", "El Doctor sin Licencia", "El Doctor"], enzo: ["Enzo Ratti", "El Sastre", "Ratti"],
    gaetano: ["Gaetano Bellomo", "El Tano", "El Tano"], rosalba: ["Madama Rosalba", "La que Todo lo Sabe", "Madama"], anselmo: ["Don Anselmo Ceniza", "El Viejo del 29", "Don Anselmo"],
  };
  const LOCKED = ["iturbe", "kessler", "arrieta", "rosalba", "anselmo"];
  const week = Math.floor((Date.now() / 864e5 + 3) / 7);
  const featured = LOCKED[week % LOCKED.length];
  const weekEnds = (() => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return d.toLocaleDateString("es", { weekday: "long", day: "numeric" }); })();

  // preferences shared with the table
  const read = () => { try { return JSON.parse(localStorage.getItem("np-pix3") || "{}"); } catch (e) { return {}; } };
  const write = o => { try { localStorage.setItem("np-pix3", JSON.stringify(o)); } catch (e) {} };

  // sounds: three knocks on the door, a lighter
  let ctx = null;
  const ac = () => (ctx = ctx || new (window.AudioContext || window.webkitAudioContext)());
  function thump(t, f, v) { const a = ac(), o = a.createOscillator(), g = a.createGain(); o.type = "sine"; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * .6, t + .12); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + .16); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + .2); }
  function hiss(t, len, v, freq) { const a = ac(), b = a.createBuffer(1, a.sampleRate * len, a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = a.createBufferSource(); s.buffer = b; const fl = a.createBiquadFilter(); fl.type = "bandpass"; fl.frequency.value = freq; const g = a.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + len); s.connect(fl); fl.connect(g); g.connect(a.destination); s.start(t); }
  const sound = {
    knock() { try { const t = ac().currentTime; [0, .28, .52].forEach(o => { thump(t + o, 90, .55); hiss(t + o, .05, .25, 700); }); } catch (e) {} },
    lighter() { try { const t = ac().currentTime; hiss(t, .02, .4, 5200); hiss(t + .1, .4, .14, 900); } catch (e) {} },
  };

  // peephole transition: the slot closes, a pair of eyes checks you, the door opens on the next page
  const peep = document.createElement("div"); peep.className = "peep" + (RM ? "" : " shut"); peep.setAttribute("aria-hidden", "true");
  peep.innerHTML = '<i class="t"></i><i class="b"></i><span class="eyes"><b></b><b></b></span>';
  document.documentElement.appendChild(peep);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  async function open() { if (RM) return; await wait(120); peep.className = "peep slit"; await wait(420); peep.className = "peep"; }
  async function go(url) { if (RM) { location.href = url; return; } peep.className = "peep slit"; await wait(380); peep.className = "peep shut"; await wait(360); location.href = url; }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", open); else open();
  addEventListener("pageshow", e => { if (e.persisted) peep.className = "peep"; });
  document.addEventListener("click", e => {
    const a = e.target.closest("a[href]"); if (!a || a.target || e.metaKey || e.ctrlKey) return;
    const href = a.getAttribute("href"); if (!href || href.startsWith("#") || /^https?:/.test(href)) return;
    e.preventDefault(); if (a.hasAttribute("data-knock")) sound.knock(); if (a.hasAttribute("data-light")) sound.lighter(); go(href);
  });

  window.NOIR = { CAST, LOCKED, featured, weekEnds, read, write, sound, go, RM };
})();
