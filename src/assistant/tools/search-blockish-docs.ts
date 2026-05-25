import axios from "axios";

export const searchBlockishDocsTool = {
    type: "function",
    function: {
        name: "search_blockish_docs",
        description: "Search the Blockish documentation for relevant information based on the provided query. This tool can be used to find specific details about Blockish Blocks, Extensions, or other related topics. The query should be concise and focused on what you want to find in the documentation.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Search by Blockish Block, Extension, or other relevant keywords.",
                },
            },
            required: ["query"],
        },
    },
} as const;

export async function searchBlockishDocsExecutor(input: { query: string }) {
    try {
        console.log("Searching Blockish docs with query:", input.query);
        const response = await axios.get(
            "http://localhost:3000/documents?search=" +
            encodeURIComponent(input.query) +
            "&limit=1&onlySearchTitle=true"
        );

        return (
            response?.data?.data?.[0]?.content || "No relevant documentation found for the query: " + input.query
        );
    } catch (error) {
        console.error("Error fetching Blockish docs:", error);
        return "Unable to fetch Blockish documentation at this time.";
    }
}

const searchBlockishDocs = {
    tool: searchBlockishDocsTool,
    execute: searchBlockishDocsExecutor,
};

export default searchBlockishDocs;