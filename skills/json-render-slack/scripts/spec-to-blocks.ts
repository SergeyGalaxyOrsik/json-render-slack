#!/usr/bin/env bun
/**
 * Converts a json-render spec to Slack Block Kit and reports degraded elements.
 *
 *   bun spec-to-blocks.ts spec.json            # print { text, blocks } and a summary
 *   SLACK_WEBHOOK_URL=... bun spec-to-blocks.ts spec.json --post
 *
 * Run it from a project with @json-render/chat and @chat-adapter/slack installed,
 * because the packages are resolved from the current directory. The webhook URL is
 * read from the environment only, so it stays out of shell history.
 */
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const post = args.includes("--post");
if (!file) {
  console.error("usage: bun spec-to-blocks.ts <spec.json> [--post]");
  process.exit(2);
}

const load = async (name: string) => {
  try {
    return await import(Bun.resolveSync(name, process.cwd()));
  } catch {
    console.error(`Cannot find ${name} from ${process.cwd()}. Install: bun add @json-render/core @json-render/chat @chat-adapter/slack chat zod`);
    process.exit(2);
  }
};

const { toCard, CardSpecError } = await load("@json-render/chat");
const { cardToSlackBlocks, cardToSlackFallbackText } = await load("@chat-adapter/slack/blocks");

const spec = JSON.parse(readFileSync(file, "utf8"));

let card;
try {
  card = toCard(spec);
} catch (err) {
  if (err instanceof CardSpecError) {
    console.error("CardSpecError:\n" + (err as { issues: string[] }).issues.map((i: string) => `  - ${i}`).join("\n"));
    process.exit(1);
  }
  throw err;
}

const blocks = cardToSlackBlocks(card) as Array<Record<string, any>>;
const text = cardToSlackFallbackText(card);
console.log(JSON.stringify({ text, blocks }, null, 2));

// Charts and tables that Slack cannot draw natively come back as ``` code sections.
const elements = Object.values(spec.elements ?? {}) as Array<{ type: string; props?: Record<string, any> }>;
const wanted = { charts: elements.filter((e) => e.type === "Chart").length, tables: elements.filter((e) => e.type === "Table").length };
const got = {
  charts: blocks.filter((b) => b.type === "data_visualization").length,
  tables: blocks.filter((b) => b.type === "data_table").length,
};
// A Text element that is itself a ``` fence (e.g. a log excerpt) is intentional, so count only charts and tables that lost their native block.
const codeBlocks = Math.max(0, wanted.charts - got.charts) + Math.max(0, wanted.tables - got.tables);
const fieldsCut = elements.some((e) => e.type === "Fields") && blocks.some((b) => Array.isArray(b.fields) && b.fields.length === 10);

console.error(`\nblocks: ${blocks.length} [${blocks.map((b) => b.type).join(", ")}]`);
console.error(`charts: ${got.charts}/${wanted.charts} native, tables: ${got.tables}/${wanted.tables} native`);
if (codeBlocks > 0) console.error(`WARNING: ${codeBlocks} element(s) degraded to a code block. Check chart label length/uniqueness, series lengths, >2 charts or >1 table.`);
if (blocks.length >= 50) console.error("WARNING: 50 blocks, Slack's maximum. Anything after the 50th block was dropped.");
if (fieldsCut) console.error("WARNING: a Fields group has 10 fields, the maximum. Extra fields may have been dropped.");

if (post) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) {
    console.error("Set SLACK_WEBHOOK_URL to post.");
    process.exit(2);
  }
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, blocks }) });
  const body = await res.text();
  console.error(res.ok ? `posted: ${res.status} ${body}` : `Slack rejected the message: HTTP ${res.status} ${body}`);
  process.exit(res.ok ? 0 : 1);
}
