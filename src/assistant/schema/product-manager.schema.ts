import { z } from "zod";

export const ProductManagerResponseSchema = z.object({
    designGuideline: z.string().describe("Detailed design instructions for the developer agent"),
    assets: z.object({
        icons: z.record(z.string(), z.string()).default({}),
        images: z.record(z.string(), z.string()).default({}),
        videos: z.record(z.string(), z.string()).default({}),
    }),
});
