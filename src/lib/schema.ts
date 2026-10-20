// Schema.org JSON-LD nodes shared across the site (rendered via SEOHead's
// @graph). Ids let nodes reference each other: Organization → brand → Jingo.
// Note: schema.org `Brand` has no parent property; the parent relationship is
// expressed by the Organization's `brand`, so Jingo pages include both nodes.
import { corporateSocials } from "../data/socials";
import { WHATSAPP_DISTRIBUTOR } from "../data/contact";

export const SITE = "https://www.tallnest.com";
export const ORG_ID = `${SITE}/#organization`;
export const WEBSITE_ID = `${SITE}/#website`;
export const JINGO_ID = `${SITE}/jingo/#brand`;

export const organizationNode = {
  "@type": "Organization",
  "@id": ORG_ID,
  name: "Tall Nest Group",
  alternateName: "Tall Nest Food & Beverages",
  url: `${SITE}/`,
  logo: {
    "@type": "ImageObject",
    url: `${SITE}/tallnest-logo.png`,
    width: 820,
    height: 322,
  },
  image: {
    "@type": "ImageObject",
    url: `${SITE}/og/tallnest-og.jpg`,
    width: 1200,
    height: 630,
  },
  description:
    "Tall Nest Group is a Pakistani FMCG company building consumer brands. Its first brand, Jingo, is a confectionery range — candies, toffees, liquid chocolates, lollipops, bubblegums, bunties and nimkos — priced from Rs. 5 to Rs. 50.",
  email: "hello@tallnest.com",
  telephone: "+92-317-8276277",
  address: {
    "@type": "PostalAddress",
    streetAddress: "DHA Phase 6",
    addressLocality: "Lahore",
    addressRegion: "Punjab",
    addressCountry: "PK",
  },
  areaServed: { "@type": "Country", name: "Pakistan" },
  sameAs: corporateSocials.map((s) => s.url),
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "sales",
      telephone: "+92-317-8276277",
      url: WHATSAPP_DISTRIBUTOR,
      areaServed: "PK",
      availableLanguage: ["English", "Urdu"],
    },
  ],
  brand: { "@id": JINGO_ID },
};

export const websiteNode = {
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  url: `${SITE}/`,
  name: "Tall Nest Group",
  inLanguage: "en",
  publisher: { "@id": ORG_ID },
};

export const jingoBrandNode = {
  "@type": "Brand",
  "@id": JINGO_ID,
  name: "Jingo",
  url: `${SITE}/jingo/`,
  logo: `${SITE}/Jingo-Logo-Red.png`,
  slogan: "Big flavour, small price, pure fun.",
  description:
    "Jingo is a Pakistani confectionery brand from Tall Nest Group: 35+ products across 7 categories — candies, toffees, Squizo liquid chocolates, Twist lollipops, Bublo bubblegums, Choco Chums bunties and Mehfil nimkos — priced from Rs. 5 to Rs. 50.",
};
