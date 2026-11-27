import { resolveLocale, type HtmlViewLocale } from "../shared/locale.js";
import type { HtmlViewDocument } from "@univerkit/html-view";

export function createHtmlViewDocument(options: {
  template: HtmlViewDocument;
  runtime: string;
  connectionId: string;
  locale?: HtmlViewLocale;
  allowedOrigins?: readonly string[];
  mediaSources?: readonly string[];
}): string {
  const origins = [
    ...new Set(
      (options.allowedOrigins ?? []).map((value) => {
        const url = new URL(value);
        if (
          !["http:", "https:"].includes(url.protocol) ||
          url.username ||
          url.password ||
          url.pathname !== "/" ||
          url.search ||
          url.hash
        )
          throw new Error("HTML view allowed sources must be HTTP(S) origins.");
        return url.origin;
      }),
    ),
  ];
  const sources = origins.join(" ");
  const network = sources || "'none'";
  // Image and media loads only; scripts, requests, frames and workers stay limited to allowedOrigins.
  const media = [sources, ...new Set((options.mediaSources ?? []).map(mediaSource))]
    .filter(Boolean)
    .join(" ");
  const csp = `default-src ${network}; script-src 'unsafe-inline' 'unsafe-eval' ${sources}; style-src 'unsafe-inline' ${sources}; img-src data: blob: ${media}; media-src data: blob: ${media}; font-src data: ${sources}; connect-src ${network}; frame-src ${network}; worker-src blob: ${sources}; object-src 'none'; form-action 'none'; base-uri 'none'`;
  const attribute = (value: string) =>
    value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
  const bootstrap = `<meta http-equiv="Content-Security-Policy" content="${attribute(csp)}"><meta name="viewport" content="width=device-width, initial-scale=1"><script data-univer-locale="${resolveLocale(options.locale)}" data-univer-connection="${attribute(options.connectionId)}">${options.runtime.replace(/<\/script/gi, "<\\/script")}</script>`;
  // parseHtmlView normalizes the head, so author scripts always follow the bootstrap.
  return options.template.html.replace(/<head(?:\s[^>]*)?>/i, (head) => head + bootstrap);
}

/** An HTTP(S) origin with an optional path; a trailing slash allows every URL under that path. */
function mediaSource(value: string): string {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /[;,\s]/.test(url.pathname)
  )
    throw new Error(
      "HTML view media sources must be HTTP(S) URLs without credentials, query or fragment.",
    );
  return url.origin + url.pathname;
}
