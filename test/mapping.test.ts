// Pins the behavior the skill documents in references/mapping.md. If an upgrade of
// @json-render/chat or @chat-adapter/slack changes any of it, these tests fail and
// the skill needs updating.
import { describe, expect, test } from "bun:test";
import { CardSpecError, toCard } from "@json-render/chat";
import { cardToSlackBlocks, type SlackCardElement } from "@chat-adapter/slack/blocks";

import { buildReportSpec } from "../skills/json-render-slack/references/example-report";

type El = { type: string; props: Record<string, unknown>; children?: string[] };
type Block = Record<string, any>;

const card = (children: Record<string, El>, props: Record<string, unknown> = { title: "T" }) => ({
  root: "root",
  elements: { root: { type: "Card", props, children: Object.keys(children) }, ...children },
});
const blocks = (spec: object): Block[] => cardToSlackBlocks(toCard(spec as never) as SlackCardElement) as Block[];
const types = (spec: object) => blocks(spec).map((b) => b.type);
const isCodeBlock = (b: Block) => b.type === "section" && String(b.text?.text ?? "").startsWith("```");

const line = (title: string, categories = ["a", "b"]) => ({
  type: "Chart",
  props: { title, chart: { type: "line", categories, series: [{ name: "s", values: categories.map((_, i) => i + 1) }] } },
});
const table = (caption?: string) => ({ type: "Table", props: { headers: ["h"], rows: [["r"]], ...(caption ? { caption } : {}) } });

describe("component mapping", () => {
  test("Card becomes header, context and image", () => {
    const out = blocks(card({}, { title: "Title", subtitle: "Sub", imageUrl: "https://example.com/a.png" }));
    expect(out.map((b) => b.type)).toEqual(["header", "context", "image"]);
    expect(out[0]).toMatchObject({ text: { type: "plain_text", text: "Title" } });
  });

  test("Fields become one section with mrkdwn *label*\\nvalue", () => {
    const out = blocks(card({ f: { type: "Fields", props: {}, children: ["a"] }, a: { type: "Field", props: { label: "Users", value: 5 } } }));
    expect(out[1]).toEqual({ type: "section", fields: [{ type: "mrkdwn", text: "*Users*\n5" }] });
  });

  test("muted Text becomes a context block", () => {
    expect(types(card({ t: { type: "Text", props: { content: "x", style: "muted" } } }))).toEqual(["header", "context"]);
  });

  test("Chart becomes a native data_visualization block", () => {
    const out = blocks(card({ c: line("Daily") }));
    expect(out[1]).toMatchObject({ type: "data_visualization", title: "Daily", chart: { type: "line", axis_config: { categories: ["a", "b"] } } });
  });

  test("pie Chart becomes data_visualization with segments", () => {
    const pie = { type: "Chart", props: { title: "P", chart: { type: "pie", segments: [{ label: "a", value: 1 }] } } };
    expect(blocks(card({ p: pie }))[1]).toMatchObject({ type: "data_visualization", chart: { type: "pie" } });
  });

  test("Table becomes data_table with raw_text cells, and align is dropped", () => {
    const t = { type: "Table", props: { headers: ["a"], rows: [["<x>"]], align: ["right"], caption: "Cap" } };
    const out = blocks(card({ t }))[1]!;
    expect(out).toMatchObject({ type: "data_table", caption: "Cap", rows: [[{ type: "raw_text", text: "a" }], [{ type: "raw_text", text: "<x>" }]] });
    expect(out.column_settings).toBeUndefined();
  });

  test("Table caption defaults to Table", () => {
    expect(blocks(card({ t: table() }))[1]).toMatchObject({ caption: "Table" });
  });

  test("nested Card becomes a bold section, not a header", () => {
    const out = blocks(card({ i: { type: "Card", props: { title: "Inner" }, children: [] } }));
    expect(out[1]).toEqual({ type: "section", text: { type: "mrkdwn", text: "*Inner*" } });
  });

  test("LinkButton is a url button, Button is an interactive button", () => {
    const out = blocks(
      card({
        a: { type: "Actions", props: {}, children: ["b", "l"] },
        b: { type: "Button", props: { id: "approve", label: "Approve", style: "primary" } },
        l: { type: "LinkButton", props: { label: "Open", url: "https://example.com" } },
      }),
    );
    const [button, link] = out[1]!.elements;
    expect(button).toMatchObject({ type: "button", action_id: "approve", style: "primary" });
    expect(button.url).toBeUndefined();
    expect(link).toMatchObject({ type: "button", url: "https://example.com", action_id: "link-https://example.com" });
  });
});

describe("mrkdwn is not escaped", () => {
  test("Text, Field and subtitle pass < > & through as-is", () => {
    const out = blocks(
      card(
        { t: { type: "Text", props: { content: "a < b & c" } }, f: { type: "Fields", props: {}, children: ["v"] }, v: { type: "Field", props: { label: "L", value: "<x>" } } },
        { title: "T", subtitle: "s & t" },
      ),
    );
    const json = JSON.stringify(out);
    expect(json).toContain("a < b & c");
    expect(json).toContain("<x>");
    expect(json).toContain("s & t");
    expect(json).not.toContain("&amp;");
  });
});

describe("silent degradation", () => {
  test("a third chart becomes a code block", () => {
    const out = blocks(card({ a: line("1"), b: line("2"), c: line("3") }));
    expect(out.filter((b) => b.type === "data_visualization")).toHaveLength(2);
    expect(isCodeBlock(out[3]!)).toBe(true);
  });

  test("a second table becomes a code block", () => {
    const out = blocks(card({ a: table("one"), b: table("two") }));
    expect(out.map((b) => b.type)).toEqual(["header", "data_table", "section"]);
    expect(isCodeBlock(out[2]!)).toBe(true);
  });

  test("a chart label over 20 characters degrades the chart", () => {
    expect(isCodeBlock(blocks(card({ c: line("Long", ["x".repeat(21)]) }))[1]!)).toBe(true);
    expect(blocks(card({ c: line("Ok", ["x".repeat(20)]) }))[1]!.type).toBe("data_visualization");
  });

  test("duplicate categories degrade the chart", () => {
    expect(isCodeBlock(blocks(card({ c: line("Dup", ["a", "a"]) }))[1]!)).toBe(true);
  });

  test("more than 10 fields are cut to 10", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `f${i}`);
    const fields: Record<string, El> = { g: { type: "Fields", props: {}, children: ids } };
    for (const id of ids) fields[id] = { type: "Field", props: { label: id, value: 1 } };
    expect(blocks(card(fields))[1]!.fields).toHaveLength(10);
  });

  test("more than 50 blocks are cut to 50", () => {
    const many: Record<string, El> = {};
    for (let i = 0; i < 60; i++) many[`d${i}`] = { type: "Divider", props: {} };
    expect(blocks(card(many))).toHaveLength(50);
  });
});

describe("toCard validation", () => {
  test("root must be a Card", () => {
    expect(() => toCard({ root: "x", elements: { x: { type: "Text", props: { content: "a" } } } } as never)).toThrow(CardSpecError);
  });

  test("limits turn degradation into a CardSpecError", () => {
    const spec = card({ a: line("1"), b: line("2"), c: line("3") });
    try {
      toCard(spec as never, { limits: { charts: 2 } });
      throw new Error("expected CardSpecError");
    } catch (err) {
      expect(err).toBeInstanceOf(CardSpecError);
      expect((err as CardSpecError).issues).toContain("at most 2 Chart per message");
    }
  });
});

describe("example report", () => {
  const pair = (current: number, previous: number) => ({ current, previous });
  const now = new Date("2026-02-16T09:00:00Z");

  test("renders natively with two charts and one table", () => {
    const spec = buildReportSpec(
      {
        users: pair(1200, 1000),
        pageviews: pair(5000, 5000),
        sessions: pair(1500, 2000),
        pages: [{ name: "/", ...pair(3000, 2500) }],
        events: [{ name: "a_very_long_event_name_over_twenty", ...pair(10, 5) }, { name: "a_very_long_event_name_over_twenty_2", ...pair(9, 5) }],
        dailyUsers: Array.from({ length: 14 }, (_, i) => 100 - i),
      },
      now,
      "Weekly",
    );
    const out = blocks(spec);
    expect(out.map((b) => b.type)).toEqual(["header", "context", "section", "data_visualization", "divider", "data_table", "data_visualization"]);
    expect(out.some(isCodeBlock)).toBe(false);
  });

  test("an empty period renders one line", () => {
    const zero = pair(0, 0);
    const spec = buildReportSpec({ users: zero, pageviews: zero, sessions: zero, pages: [], events: [], dailyUsers: [] }, now, "Weekly");
    expect(types(spec)).toEqual(["header", "context", "section"]);
  });
});
