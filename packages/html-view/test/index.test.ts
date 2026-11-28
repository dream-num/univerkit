import { expect, it } from "vitest";
import { parseHtmlView } from "@univerkit/html-view-parser";
import { createHtmlViewDocument } from "../src/host/document.js";

it("installs the runtime and network policy before any author script", () => {
  const html = createHtmlViewDocument({
    template: parseHtmlView('<head class="custom"><script>author()</script></head>'),
    runtime: "bootstrap()",
    connectionId: "page-1",
  });
  expect(html.indexOf("Content-Security-Policy")).toBeLessThan(html.indexOf("bootstrap()"));
  expect(html.indexOf("bootstrap()")).toBeLessThan(html.indexOf("author()"));
  expect(html).toContain("script-src 'unsafe-inline'");
  expect(html).toContain("connect-src 'none'");
});
it("allows only explicit HTTP(S) origins and escapes script end tags", () => {
  const template = parseHtmlView("hello");
  const html = createHtmlViewDocument({
    template,
    runtime: 'const text="</script>";',
    connectionId: '"<>',
    allowedOrigins: ["https://assets.example.com"],
  });
  expect(html).toContain("connect-src https://assets.example.com;");
  expect(html).toContain("form-action 'none';");
  expect(html).toContain("<\\/script>");
  expect(html).toContain("&quot;&lt;>");
  for (const source of [
    "https://example.com/path",
    "https://user:pass@example.com",
    "data:",
    "https://example.com?q=x",
    "https://example.com#x",
  ]) {
    expect(() =>
      createHtmlViewDocument({
        template,
        runtime: "",
        connectionId: "x",
        allowedOrigins: [source],
      }),
    ).toThrow();
  }
});
it("allows media sources only for image and media loads", () => {
  const template = parseHtmlView("<video></video>");
  const html = createHtmlViewDocument({
    template,
    runtime: "",
    connectionId: "x",
    allowedOrigins: ["https://cdn.example.com"],
    mediaSources: [
      "https://app.example.com/api/blobs/",
      "https://app.example.com/api/blobs/",
      "https://media.example.com",
    ],
  });
  const media =
    "https://cdn.example.com https://app.example.com/api/blobs/ https://media.example.com/";
  expect(html).toContain(`img-src data: blob: ${media};`);
  expect(html).toContain(`media-src data: blob: ${media};`);
  expect(html).toContain("connect-src https://cdn.example.com;");
  expect(html).toContain("frame-src https://cdn.example.com;");
  expect(html).toContain("default-src https://cdn.example.com;");
  expect(html).not.toMatch(/(?:script|connect|frame|worker|default)-src[^;]*app\.example\.com/);
  const offline = createHtmlViewDocument({
    template,
    runtime: "",
    connectionId: "x",
    mediaSources: ["https://app.example.com/a/"],
  });
  expect(offline).toContain("connect-src 'none';");
  expect(offline).toContain("media-src data: blob: https://app.example.com/a/;");
  for (const source of [
    "data:",
    "ftp://example.com/a/",
    "https://user:pass@example.com/a/",
    "https://example.com/a/?q=x",
    "https://example.com/a/#x",
    "https://example.com/a;b/",
    "https://example.com/a,b/",
  ]) {
    expect(() =>
      createHtmlViewDocument({ template, runtime: "", connectionId: "x", mediaSources: [source] }),
    ).toThrow();
  }
});
