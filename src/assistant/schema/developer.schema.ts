import { z } from "zod";

export const BlockSchema: z.ZodType<any> = z.lazy(() =>
    z.object({
        name: z.string(),
        attributes: z.record(z.string(), z.unknown()).default({}),
        innerBlocks: z.array(BlockSchema).default([]),
    })
);

export const DeveloperResponseSchema = z.object({
    summary: z.string(),
    schema: z.object({
        extensions: z.record(z.string(), z.unknown()).default({}),
        blocks: z.array(BlockSchema),
    }),
});
