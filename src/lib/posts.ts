import { getCollection, type CollectionEntry } from "astro:content";

export type Post = CollectionEntry<"posts">;

/** Non-draft posts, newest first. */
export async function getSortedPosts(): Promise<Post[]> {
  const posts = await getCollection("posts", ({ data }) => data.draft !== true);
  return posts.sort(
    (a, b) => b.data.publishDate.getTime() - a.data.publishDate.getTime(),
  );
}

export function postSlug(post: Post): string {
  return post.data.slug ?? post.id;
}

export function readingTime(post: Post): number {
  if (post.data.readingTime) return post.data.readingTime;
  const words = (post.body ?? "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Soft brand-red gradient cover, varied by category (placeholder art). */
export function coverGradient(category: string): string {
  switch (category) {
    case "Brand Building":
      return "linear-gradient(135deg, #93221e 0%, #c23a30 100%)";
    case "Distribution":
      return "linear-gradient(135deg, #7a1c19 0%, #93221e 100%)";
    case "FMCG Insights":
      return "linear-gradient(135deg, #b8392f 0%, #7a1c19 100%)";
    case "Behind the Brand":
      return "linear-gradient(135deg, #5e1411 0%, #93221e 100%)";
    default:
      return "linear-gradient(135deg, #93221e 0%, #c23a30 100%)";
  }
}
