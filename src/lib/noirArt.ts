// Loader for the card art shared with the 3D scene (public/noir/art.js). The
// module is plain browser JS served as a static file, so it is loaded at
// runtime instead of bundled: the scene and the app draw the very same cards.
export type ArtCard = { r: number; s: number } | null;
export type ArtCanvas = HTMLCanvasElement & { nearest?: boolean };
type ArtModule = {
  cardCanvas: (c: ArtCard, opt: { face?: string; four?: boolean; back?: string }) => ArtCanvas;
};

let mod: Promise<ArtModule> | null = null;
export function loadArt(): Promise<ArtModule> {
  const url = "/noir/art.js";
  mod ??= import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url) as Promise<ArtModule>;
  return mod;
}
