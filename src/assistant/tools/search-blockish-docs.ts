import { tool } from "langchain";
import { z } from "zod";
import axios from "axios";

const searchBlockishDocs = tool(
    async ({ queries }) => {
        console.log(`[search-blockish-docs] batch: ${queries.join(", ")}`);
        const results = await Promise.all(
            queries.map(async (query) => {
                try {
                    const response = await axios.get(
                        `http://localhost:3000/documents?search=${encodeURIComponent(query)}&limit=1&onlySearchTitle=true`
                    );
                    const content = response?.data?.data?.[0]?.content ?? `No documentation found for: ${query}`;
                    return `### ${query}\n${content}`;
                } catch {
                    return `### ${query}\nUnable to fetch documentation.`;
                }
            })
        );
        return results.join("\n\n");
    },
    {
        name: "search_blockish_docs",
        description: "Search Blockish documentation for multiple blocks at once. Pass all block names you need in a single call to fetch their schemas and rules in parallel.",
        schema: z.object({
            queries: z.array(z.string()).describe("List of block names or keywords to search for (e.g. ['Heading', 'Container', 'Accordion'])"),
        }),
    }
);

export default searchBlockishDocs;
