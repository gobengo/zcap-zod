/**
 * The examples from the zcap-spec, vendored.
 *
 * `etc/zcap-spec-examples.ndjson` holds one record per example, exactly as the
 * `zcap-spec-examples` CLI emits them. It is checked in so that the test suite
 * has no dependency to install and no network to reach; refresh it with
 * `npm run fixture:update`.
 *
 * Each record's `url` carries the version of the spec it came from, so the
 * fixture is self-describing and `zcap-spec-examples-schema.test.ts` can assert
 * it is the version this library targets.
 *
 * @module
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** One example, as extracted from the spec's HTML. */
export interface SpecExample {
  /** The example's anchor name, e.g. `example-1`. */
  name: string;
  /** The verbatim text of the example, comments and all. */
  content: string;
  /** Absolute URL of the example within the spec it was extracted from. */
  url: string;
  /** The media type the spec labels the example with. */
  mediaType: string;
}

const FIXTURE = fileURLToPath(new URL("../etc/zcap-spec-examples.ndjson", import.meta.url));

/** Read the vendored examples, in document order. */
export function loadSpecExamples(): SpecExample[] {
  return readFileSync(FIXTURE, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as SpecExample);
}

/**
 * Remove `//` and block comments from JSON-with-comments.
 *
 * String contents are left alone, which matters here: almost every value in
 * these examples is a URL, and a naive strip would eat everything from the
 * `//` in `https://` onward.
 */
export function stripJsonComments(input: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      out += char;
      continue;
    }
    if (char === "/" && input[i + 1] === "/") {
      while (i < input.length && input[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (char === "/" && input[i + 1] === "*") {
      i += 2;
      while (i < input.length && !(input[i] === "*" && input[i + 1] === "/")) i++;
      i++;
      continue;
    }
    out += char;
  }
  return out;
}

/**
 * The object an example denotes.
 *
 * @throws if the example is not a JSON document -- the spec also contains raw
 * HTTP messages, which have no object representation.
 */
export function parseExampleContent(example: SpecExample): unknown {
  switch (example.mediaType) {
    case "application/json":
      return JSON.parse(example.content);
    case "application/jsonc":
      return JSON.parse(stripJsonComments(example.content));
    default:
      throw new Error(
        `parseExampleContent: ${example.name} is ${example.mediaType}, which has no object representation`,
      );
  }
}
