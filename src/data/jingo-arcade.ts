// JINGO ARCADE — game registry (single source of truth for the hub + game chrome).
// `status`: 'soon' renders a disabled "Coming soon" card on /jingo/arcade;
// 'live' links it to /jingo/arcade/<slug>. Each game flips its own entry.
// `accentColor` themes the game's card and its chrome. `mascotId` (from
// jingo-mascots.ts) is the card art.
//
// House rules for every game: mobile-first touch controls, 44px+ tap targets,
// no sideways scroll at 360px, prefers-reduced-motion respected, vanilla
// Canvas/DOM (no game engine), and all product / mascot content read from
// jingo-products.ts and jingo-mascots.ts — never hardcoded.

export type ArcadeStatus = "live" | "soon";

export interface ArcadeGame {
  slug: string;
  name: string;
  blurb: string;
  status: ArcadeStatus;
  accentColor: string;
  mascotId: string;
}

export const games: ArcadeGame[] = [
  { slug: "quiz",    name: "Which Jingo Candy Are You?", blurb: "Seven questions. One very specific verdict.",            status: "live", accentColor: "#FF4F9A", mascotId: "khatti-meethi" },
  { slug: "match",   name: "Flavour Match",              blurb: "Pair the packs before your memory gives out.",           status: "live", accentColor: "#38C6F4", mascotId: "mint" },
  { slug: "counter", name: "Counter Rush",               blurb: "Serve the queue. Grab the right pack. Don't panic.",     status: "live", accentColor: "#FFC93C", mascotId: "orange" },
  { slug: "chilli",  name: "Chilli Chaska Challenge",    blurb: "Stop the needle in the sweet spot. It only gets hotter.", status: "live", accentColor: "#E0202B", mascotId: "chilli" },
  { slug: "runner",  name: "Mascot Runner",              blurb: "Pick your character and run.",                           status: "live", accentColor: "#A6E04A", mascotId: "raw-mango" },
];

export const gameBySlug = (slug: string): ArcadeGame | undefined =>
  games.find((g) => g.slug === slug);
