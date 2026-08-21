/** OpenAI-style tool definitions for Inquiry main track. */

import type { ChatToolDef } from "../chat/port";

export const INQUIRY_TOOL_DEFS: ChatToolDef[] = [
  {
    name: "vault_search",
    description:
      "Search the user's Obsidian vault (materials/, concepts/, inquiry/, root *.md) for a query. Use for notes and local study materials.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        limit: {
          type: "integer",
          description: "Max hits (1-12, default 6)",
          minimum: 1,
          maximum: 12,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "fetch_url",
    description:
      "Fetch a public http(s) URL and return extracted text. Do not use for private/local IPs.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Absolute http(s) URL" },
      },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "web_search",
    description:
      "Search the public web when enabled in settings. Prefer vault_search for local notes. If disabled, you will get an error — then answer from knowledge or ask for a URL.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Web search query" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
];

export function toolKindFromName(
  name: string,
): "vault_search" | "web_search" | "fetch_url" | "think" {
  if (name === "vault_search") return "vault_search";
  if (name === "web_search") return "web_search";
  if (name === "fetch_url") return "fetch_url";
  return "think";
}
