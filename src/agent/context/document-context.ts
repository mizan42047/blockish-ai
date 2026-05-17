import { getDocumentByTitle } from "routes/document.ropository.js";

const blockishOverviewTitle = "index";

export async function getBlockishOverviewContext() {
  const document = await getDocumentByTitle(blockishOverviewTitle);

  return document?.content ?? "";
}

export function formatBlockishOverviewContext(content: string) {
  if (!content.trim()) {
    return [
      "Blockish plugin documentation context:",
      "No Blockish overview document was found in the database.",
    ].join("\n");
  }

  return [
    "Blockish plugin documentation context:",
    "Use this as source context when answering questions about Blockish and when designing pages for Blockish.",
    "",
    content.trim(),
  ].join("\n");
}
