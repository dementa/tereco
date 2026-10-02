/**
 * The renderer's Content-Security-Policy must let the offline library's own
 * `tereco-media:` scheme through, and nothing else on the network.
 *
 * It failed silently once: the policy had no `tereco-media:` source, so every
 * PDF page rendered as a broken image, no video or audio would play
 * (media-src fell back to default-src 'none') and DocxViewer's fetch() was
 * refused. Nothing errored outside the DevTools console.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const policy = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? "";

function directive(name: string): string[] {
  const entry = policy
    .split(";")
    .map((d) => d.trim().split(/\s+/))
    .find(([key]) => key === name);
  return entry ? entry.slice(1) : [];
}

describe("renderer CSP", () => {
  it("allows offline library media wherever the viewers load it", () => {
    expect(directive("img-src")).toContain("tereco-media:");
    expect(directive("media-src")).toContain("tereco-media:");
    expect(directive("connect-src")).toContain("tereco-media:");
  });

  it("still reaches no network", () => {
    expect(directive("default-src")).toEqual(["'none'"]);
    for (const name of ["img-src", "media-src", "connect-src"]) {
      expect(directive(name).some((s) => /^(https?:|\*)/.test(s))).toBe(false);
    }
  });
});
