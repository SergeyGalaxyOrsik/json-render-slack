---
name: json-render-slack
description: Turn a json-render spec (vercel-labs/json-render, @json-render/chat) into a native Slack message — Block Kit with real charts (data_visualization), tables (data_table), fields and link buttons — and post it through a plain Slack Incoming Webhook, with no Slack bot, Chat SDK instance or bot token. Use this whenever someone wants a "pretty", card-like or chart-filled Slack message built from data (reports, digests, alerts, metrics, KPIs, weekly summaries), mentions json-render or @json-render/chat together with Slack, wants to replace a plain-text/mrkdwn Slack webhook post with something richer, or asks how to render generative UI in Slack without building a bot. Also use it to debug such messages (a chart that shows up as a code block, Slack rejecting blocks, a spec that throws CardSpecError).
---

# json-render → Slack (Incoming Webhook, no bot)

json-render's chat renderer (`@json-render/chat`) was built for the Vercel Chat SDK, whose docs assume a Slack **bot** (`SLACK_BOT_TOKEN`, signing secret, `thread.post`). Most "send a report to a channel" jobs only have an **Incoming Webhook URL**. You don't need the bot: the two pure functions in the middle of that pipeline work on their own.

```
Spec (JSON) ──toCard()──▶ CardElement ──cardToSlackBlocks()──▶ Block Kit ──POST──▶ webhook
 @json-render/chat                        @chat-adapter/slack/blocks            { text, blocks }
```

Neither function talks to Slack or needs credentials, and both are side-effect free, so they are easy to unit-test.

## Install

```bash
bun add @json-render/core @json-render/chat @chat-adapter/slack chat zod
# or npm i / pnpm add the same list
```

`chat` is only a peer dependency, used for the `CardElement` type; nothing from it runs. Verified with `@json-render/chat@0.22.0`, `@chat-adapter/slack@4.45.0`, `chat@4.45.0`. If the installed versions differ a lot, run `scripts/spec-to-blocks.ts` on a sample spec before relying on the mapping below.

## The core code

```ts
import type { Spec } from "@json-render/core";
import { toCard } from "@json-render/chat";
import { cardToSlackBlocks, cardToSlackFallbackText, type SlackBlock, type SlackCardElement } from "@chat-adapter/slack/blocks";

export function specToSlack(spec: Spec): { text: string; blocks: SlackBlock[] } {
  // Chat SDK's CardElement and the adapter's SlackCardElement are the same shape but separate types.
  const card = toCard(spec) as SlackCardElement;
  return { text: cardToSlackFallbackText(card), blocks: cardToSlackBlocks(card) };
}

export async function postToWebhook(webhookUrl: string, message: { text: string; blocks: SlackBlock[] }) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(15_000),
  });
  // Slack answers 200 "ok", or 400 with a short reason such as "invalid_blocks".
  if (!res.ok) throw new Error(`Slack webhook failed: HTTP ${res.status} ${await res.text()}`);
}
```

Always send `text` alongside `blocks`: it is what Slack shows in notifications, previews and screen readers. `cardToSlackFallbackText` gives a decent one. A short custom summary line is often better, because the fallback contains every table row.

Treat the webhook URL as a secret. Keep it out of logs, error messages and command-line arguments, and strip it from any error you rethrow.

## The spec

A spec is a flat map of elements plus the id of the root. The **root must be a `Card`**, or `toCard` throws.

```json
{
  "root": "card",
  "elements": {
    "card":   { "type": "Card", "props": { "title": "Weekly report", "subtitle": "Nov 06 – Nov 13" }, "children": ["totals", "daily"] },
    "totals": { "type": "Fields", "props": {}, "children": ["users"] },
    "users":  { "type": "Field", "props": { "label": "Unique users", "value": "46  (+130.0%)" } },
    "daily":  { "type": "Chart", "props": { "title": "Users per day", "chart": {
                "type": "line", "categories": ["Nov 12", "Nov 13"],
                "series": [{ "name": "This week", "values": [3, 5] }, { "name": "Last week", "values": [1, 2] }] } } }
  }
}
```

Each component, its props and the Slack block it becomes are in `references/mapping.md`. Read it before writing a spec. The short version:

| Component | Slack block |
|---|---|
| Card | `header` (title), `context` (subtitle), `image` (imageUrl) |
| Text | `section` mrkdwn (`style: "muted"` becomes a `context`) |
| Fields / Field | one `section` with mrkdwn `fields` (`*label*\nvalue`) |
| Chart (line, bar, area, pie) | native `data_visualization` |
| Table | native `data_table`, but only the first one per message |
| Divider, Image | `divider`, `image` |
| Actions with LinkButton / Button | `actions` with url buttons / interactive buttons |

## Build the spec from data in code, unless the user wants an LLM

For recurring reports, write a function `buildXSpec(data) → Spec`. The layout is the same every run, it costs nothing, and you can test it. `references/example-report.ts` is a complete, tested weekly-report builder (totals as fields, a this-week vs last-week line chart, a top-N table, a top-N bar chart) to adapt.

An LLM-generated layout (`defineCatalog(schema, { components: standardComponentDefinitions }).prompt()` as the system prompt) only makes sense when the content really varies. If you use one, call `toCard(spec, { limits: { charts: 2, tables: 1 } })` so that a spec Slack would degrade is rejected with a `CardSpecError` whose `issues` you can feed back to the model.

## Slack's rules that shape the spec

These come from Slack, enforced by the adapter. A rule you break doesn't fail loudly: the adapter quietly **degrades** the element into a monospaced text table in a code block. That still posts, but looks broken. Design around them:

- **At most 2 charts per message.** The 3rd and later become code blocks.
- **At most 1 native table per message.** The 2nd becomes a code block. Use a bar chart, Fields or Text for other lists.
- **Chart labels (categories, series names, pie labels) are 1–20 characters, and categories must be unique.** Clip long names, e.g. `name.slice(0, 19) + "…"`, and make sure clipping doesn't produce duplicates. Chart titles are 1–50 characters.
- **Each series needs exactly one value per category.** At most 20 categories and at most 12 series. Pie segments need values > 0, at most 12 segments.
- **A native table has at most 100 rows including the header, at most 20 columns and at most 10,000 characters in all cells.** Above that it becomes a code block.
- Some limits cut content silently instead of degrading it: more than 10 `Field`s in one `Fields`, or more than 50 blocks in the message. Split a long field list into several `Fields`, and keep a message to a few dozen elements.

## Escape your data in mrkdwn

`Text` content, `Field` labels and values, and `Card.subtitle` are sent as **mrkdwn without any escaping**. That's useful when you want Slack syntax (`*bold*`, `<https://x|link>`, `<@U123>`). But a page path, event name or user-supplied string containing `<`, `>` or `&` will be mangled or turned into a link or mention. Escape untrusted values:

```ts
const mrkdwn = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
```

`Card.title` (a plain_text header), table cells (raw_text) and chart labels are not mrkdwn, so don't escape those, or `&amp;` will show up literally.

## Buttons

`LinkButton` (url) works with any webhook: Slack just opens the link. A plain `Button` is interactive. Slack sends its click to the **Interactivity Request URL of the Slack app that owns the webhook** (every incoming webhook belongs to an app). Until that is configured, clicking it shows the user an error. So for an action like "Rollback" or "Approve", offer the user both options:

1. **No new infrastructure:** a `LinkButton` to a page that does the action after a confirmation, such as the CI job's "Run workflow" page or your own endpoint with a signed, short-lived token. Don't perform the action on the GET itself, because link unfurlers and scanners open URLs.
2. **A real in-Slack button:** turn on Interactivity in the webhook's app, point it at an endpoint that verifies the Slack signature (signing secret), acks within 3 seconds, checks who clicked, runs the action and reports back through `response_url`. That's more work and a new public endpoint, so build it only if the user wants it.

Default to option 1 and say why.

## Check before you post

1. Convert locally and look at the block types:
   ```bash
   bun <this skill's directory>/scripts/spec-to-blocks.ts spec.json
   ```
   Run it from a project that has the packages installed. It prints the Block Kit JSON and lists any element that was degraded into a code block.
2. Write a unit test that asserts the block `type` sequence (e.g. `["header", "context", "section", "data_visualization", "data_table"]`). It catches silent degradation, which is the main failure mode.
3. Post to a test channel:
   ```bash
   SLACK_WEBHOOK_URL=… bun …/spec-to-blocks.ts spec.json --post
   ```
   Then look at the message itself. A 200 from Slack doesn't prove the charts rendered the way you meant.

## Pitfalls

- `toCard` throws `CardSpecError` (`.issues: string[]`) for a non-Card root, unknown component types, missing children or bad props, e.g. a number where a string is expected. Field `value` and table cells accept numbers and stringify them.
- A `Card` nested inside the root Card has no header of its own. It turns into a bold `*title*` section plus a context. Use it for sub-sections.
- Format numbers yourself (`Intl.NumberFormat`) before putting them in Fields or tables. Chart `values` must stay raw numbers.
- `Table.align` passes `toCard` but the adapter drops it for the native `data_table`, so numbers can't be right-aligned. Always set `caption`, or Slack shows the default caption "Table".
- For logs and stack traces, use a `Text` whose content is a ``` fence. Keep the tail, about 25 lines and under 3000 characters in total. Escape `& < >`, and break up any ``` inside the log so it can't close the fence early.
- An empty dataset: render one `Text` element ("No data for this period") rather than charts of zeros or empty tables. Slack rejects a chart with zero categories, and the adapter then degrades it.
