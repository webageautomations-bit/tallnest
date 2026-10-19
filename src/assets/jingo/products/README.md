# Jingo pack shots

Drop product pack images here, named by the product `id` from
`src/data/jingo-products.ts`:

    cola-candy.webp
    kachi-keri.png
    mix-toffees-pouch.jpg   ← special SKUs use their id too

- Formats: `.webp`, `.png`, `.jpg`/`.jpeg` (if several exist for one id,
  webp wins, then png, then jpg).
- Prefer a transparent-background PNG/WebP cut-out, roughly square, at least
  800px on the long edge. Astro optimises it to WebP at build time.
- No code change needed: the /jingo/flavours card for that product switches
  from its colour block to the pack shot automatically. Remove the file and it
  falls back again.
