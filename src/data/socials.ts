// Social accounts per zone + their inline SVG icons (no icon webfont).
// Icons share one stroke style (24px grid, currentColor) — the same glyphs the
// corporate footer uses for Instagram / Facebook / LinkedIn, plus TikTok.

export interface SocialLink {
  network: string; // also the link's aria-label
  url: string;
  icon: string; // inline SVG markup
}

const svg = (body: string) =>
  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const socialIcons = {
  instagram: svg(`<rect x="2.5" y="2.5" width="19" height="19" rx="5.5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>`),
  facebook: svg(`<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>`),
  linkedin: svg(`<path d="M16 8a6 6 0 0 1 6 6v6h-4v-6a2 2 0 0 0-4 0v6h-4V8.5h4V10"/><rect x="2" y="9" width="4" height="11"/><circle cx="4" cy="4" r="2"/>`),
  tiktok: svg(`<path d="M14.5 3v11.25a3.75 3.75 0 1 1-3.75-3.75"/><path d="M14.5 3c.45 2.7 2.35 4.6 5.25 4.85"/>`),
};

/** Tall Nest (corporate zone). */
export const corporateSocials: SocialLink[] = [
  { network: "Instagram", url: "https://www.instagram.com/tallnestgroup", icon: socialIcons.instagram },
  { network: "Facebook", url: "https://www.facebook.com/tallnestgroup", icon: socialIcons.facebook },
  { network: "LinkedIn", url: "https://www.linkedin.com/company/tallnestgroup", icon: socialIcons.linkedin },
];

/** Jingo (brand zone). */
export const jingoSocials: SocialLink[] = [
  { network: "Instagram", url: "https://www.instagram.com/jingo.pk", icon: socialIcons.instagram },
  { network: "Facebook", url: "https://www.facebook.com/jingopakistan", icon: socialIcons.facebook },
  { network: "TikTok", url: "https://www.tiktok.com/@jingo.pk", icon: socialIcons.tiktok },
];
