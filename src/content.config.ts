import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    excerpt: z.string(),
    publishDate: z.coerce.date(),
    author: z.string().default("Tall Nest"),
    category: z.enum([
      "Brand Building",
      "Distribution",
      "FMCG Insights",
      "Behind the Brand",
    ]),
    coverImage: z.string().optional(),
    // Local topical cover photo (see scripts/fetch-blog-images.mjs). Optional so
    // a post with no image gracefully falls back to the gradient placeholder.
    cover: z.string().optional(),
    // Cover photo attribution (e.g. CC BY requires a followable credit).
    coverCredit: z.string().optional(),
    coverCreditUrl: z.string().optional(),
    coverLicense: z.string().optional(),
    readingTime: z.number().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { posts };
