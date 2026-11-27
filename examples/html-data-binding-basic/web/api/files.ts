import type { ExampleFile } from "../../shared/files.js";
import { json, request } from "./http.js";

const fileUrl = (id: string) => `/api/files/${encodeURIComponent(id)}`;

export const listFiles = () => request<ExampleFile[]>("/api/files");

export const getFile = (id: string, signal?: AbortSignal) =>
  request<ExampleFile>(fileUrl(id), { signal: signal ?? null });

export const createSheet = (name: string) =>
  request<ExampleFile>("/api/files", json("POST", { kind: "sheet", name }));

export const createHtml = (name: string, html: string) =>
  request<ExampleFile>("/api/files", json("POST", { kind: "html", name, html }));

export const getHtml = async (id: string) =>
  (await request<{ html: string }>(`${fileUrl(id)}/content`)).html;

export const saveHtml = (id: string, html: string) =>
  request(`${fileUrl(id)}/content`, json("PUT", { html }));
