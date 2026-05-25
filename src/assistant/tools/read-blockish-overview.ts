import axios from "axios";

export const readBlockishOverviewTool = {
    type: "function",
    function: {
        name: "read_blockish_overview",
        description: "Read the overview of Blockish and its capabilities. This tool is for the assistant to understand what Blockish is and what it can do. It should be used at the beginning of the conversation to get an overview of Blockish.",
        parameters: {
            type: "object",
            properties: {},
            required: [],
        },
    },
} as const;

export async function readBlockishOverviewExecutor() {
    try {
        const response = await axios.get(
            "http://localhost:3000/documents?search=Blockish Overview&limit=1"
        );

        return (
            response?.data?.data?.[0]?.content || "Blockish overview not found."
        );
    } catch (error) {
        console.error("Error fetching Blockish overview:", error);
        return "Unable to fetch Blockish overview at this time.";
    }
}

const readBlockishOverview = {
    tool: readBlockishOverviewTool,
    execute: readBlockishOverviewExecutor,
};

export default readBlockishOverview;