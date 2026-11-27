import type { ErrorRequestHandler } from "express";
import { CollabError } from "@univerjs-pro/collaboration-service";

/** Maps SDK and request-parsing errors to HTTP statuses; responses carry `{ error }`. */
export const handleErrors: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof CollabError) {
    const status =
      error.code === "INVALID_REQUEST"
        ? 400
        : error.code === "UNIT_NOT_FOUND"
          ? 404
          : error.code === "UNAUTHENTICATED"
            ? 401
            : error.code === "PERMISSION_DENIED" || error.code.startsWith("LICENSE_")
              ? 403
              : 500;
    if (status === 500) console.error(error);
    response
      .status(status)
      .json({ error: status === 500 ? "Unable to load or save the Sheet." : error.message });
    return;
  }
  if (error && typeof error === "object" && "type" in error) {
    if (error.type === "entity.too.large") {
      response.status(413).json({ error: "The request is too large." });
      return;
    }
    if (error.type === "entity.parse.failed") {
      response.status(400).json({ error: "The request body is not valid JSON." });
      return;
    }
  }
  console.error(error);
  response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
};
