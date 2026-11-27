export type AiEvent =
  | { type: "status"; message: string }
  | { type: "reset" }
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "result"; html: string }
  | { type: "error"; message: string };

export interface HtmlDraft {
  id: string;
  name: string;
  html: string;
}

export const AI_DRAFT_KEY = "univer-html-ai-draft";
