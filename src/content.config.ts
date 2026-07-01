import { defineCollection } from "astro:content"
import { z } from "astro:schema"
import { glob } from "astro/loaders"

const work = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/work" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    year: z.number(),
    role: z.string(),
    scope: z.string(),
    client: z.string().optional(),
    // Subtitle shown under the case study title (e.g. "Digital Historical Archives Design")
    subtitle: z.string().optional(),
    // Discipline chips shown at scan-time on the work index and case study header
    disciplines: z.array(z.string()),
    // Thematic tags shown in the case study metadata block
    tags: z.array(z.string()).default([]),
    // Signature module ("About" accordion) — appears on every case study
    accessibility: z.array(z.string()).default([]),
    designSystem: z.array(z.string()).default([]),
    tools: z.array(z.string()).default([]),
    // "About [Project]" description paragraphs shown above the accordions
    aboutProject: z.array(z.string()).default([]),
    // One-line outcome (where available)
    outcome: z.string().optional(),
    // Short intro paragraph (~30 words max)
    intro: z.string().optional(),
    coverImage: z.string().optional(),
    coverAlt: z.string().optional(),
    // Second tile used by multi-image cluster rows on the work index
    secondaryImage: z.string().optional(),
    secondaryImageAlt: z.string().optional(),
    // Per-page OG image
    ogImage: z.string().optional(),
    // "full" = dedicated case study page; "card" = work index only
    treatment: z.enum(["full", "card"]),
    // Controls order on the work index
    order: z.number(),
    draft: z.boolean().default(false),
  }),
})

export const collections = { work }
