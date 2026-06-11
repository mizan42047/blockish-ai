
import developerAgent from "assistant/agents/developer.js";
import { Request, Response } from "express";
const developerCallbacks = async (req: Request, res: Response) => {
    const { guideline, assets = {}, classManager = [] } = req.body;
    if (!guideline) {
        return res.status(400).json({ error: "Guideline is required" });
    }
    const developer = developerAgent();
    try {
        const result = await developer.run({
            designGuideline: guideline,
            assets: {
                icons: assets.icons || {},
                images: assets.images || {},
                videos: assets.videos || {},
            },
            classManager,
        });
        res.json(result);
    } catch (error) {
        console.error("Error in developerCallbacks:", error);
        res.status(500).json({ error: "An error occurred while processing the request." });
    }
    
}

export default developerCallbacks;