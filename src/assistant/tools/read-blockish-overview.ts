import { tool } from "langchain";
import { z } from "zod";
import axios from "axios";

const readBlockishOverview = tool(
    async () => {
        try {
            const response = await axios.get(
                "http://localhost:3000/documents?search=Blockish Overview&limit=1"
            );
            return response?.data?.data?.[0]?.content ?? "Blockish overview not found.";
        } catch {
            return "Unable to fetch Blockish overview at this time.";
        }
    },
    {
        name: "read_blockish_overview",
        description: "Read the Blockish overview to understand available blocks and capabilities. Call this first before generating any schema.",
        schema: z.object({}),
    }
);

export default readBlockishOverview;
