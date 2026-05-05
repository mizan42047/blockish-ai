import type { Request, Response } from "express";

export async function assistantCallback(req: Request, res: Response) {
  console.log(req.body);
  res.json({ ok: true });
}
 