# Component → Block Kit mapping

Observed with `@json-render/chat@0.22.0` + `@chat-adapter/slack@4.45.0` (`toCard` then `cardToSlackBlocks`). "mrkdwn" means the text is passed to Slack as-is: Slack formatting works, and `<`, `>` and `&` in data must be escaped.

## Components and props

| Component | Props | Children | Slack output |
|---|---|---|---|
| `Card` (root) | `title?`, `subtitle?`, `imageUrl?` | yes | `header` (plain_text, title) → `context` (mrkdwn, subtitle) → `image` (imageUrl, alt = title) → children |
| `Card` (nested) | same | yes | `section` mrkdwn `*title*` → `context` (subtitle) → children. Slack has no nested cards. |
| `Section` | none | yes | children flattened in place; no block of its own |
| `Text` | `content` (string), `style?`: `plain` \| `bold` \| `muted` | no | `section` mrkdwn; `muted` → `context` (small grey text) |
| `Fields` | none | `Field`s | one `section` with `fields` array (Slack shows 2 columns, max 10 fields) |
| `Field` | `label` (string), `value` (string \| number) | no | field mrkdwn `*label*\nvalue` |
| `Table` | `headers` string[], `rows` (string\|number)[][], `align?` (`left`\|`center`\|`right`)[], `caption?` | no | 1st per message: `data_table` (raw_text cells, header row first, `caption` defaults to "Table"; `align` is accepted but **ignored** here); later ones: mrkdwn code block |
| `Chart` | `title` (string), `chart` (see below) | no | 1st and 2nd valid chart: `data_visualization`; invalid or 3rd+: mrkdwn code block with an ASCII table |
| `Divider` | none | no | `divider` |
| `Image` | `url`, `alt` | no | `image` |
| `Actions` | none | `Button`/`LinkButton` | `actions` |
| `Button` | `id`, `label`, `style?` (`default`\|`primary`\|`danger`), `value?` | no | interactive `button` with `action_id = id`; clicks go to the Interactivity Request URL of the webhook's app and error until one is set. No `confirm` dialog prop; add `confirm` to the block yourself after conversion if needed |
| `LinkButton` | `label`, `url` | no | `button` with `url` and `action_id = "link-<url>"` (truncated to 255 by the adapter); works with a plain webhook |

## Chart prop shapes

```ts
// line / bar / area
{ type: "line" | "bar" | "area",
  categories: string[],                          // x axis, 1–20, unique, each 1–20 chars
  series: { name: string; values: number[] }[],  // 1–12 series, names unique 1–20 chars, values.length === categories.length
  xLabel?: string, yLabel?: string }             // ≤ 50 chars

// pie
{ type: "pie", segments: { label: string; value: number }[] }  // 1–12 segments, value > 0, label 1–20 chars
```

`title` must be 1–50 characters. If any rule fails, that one chart is replaced by a code block such as:

```
Users per day
       | This week | Last week
Nov 12 | 3         | 1
```

## Message-level limits (adapter defaults)

| Limit | Value | Over the limit |
|---|---|---|
| charts per message | 2 (Slack rejects a 3rd `data_visualization`) | code block |
| native tables per message | 1 | code block |
| table size | 100 rows incl. header, 20 columns, 10,000 chars in all cells | code block |
| fields per `Fields` | 10 | extra fields **silently dropped** |
| blocks per message | 50 | blocks after the 50th **silently dropped** |
| header (Card title) | 150 chars | truncated |
| section / context text | 3000 chars | truncated |

To make `toCard` throw instead of degrading, pass `toCard(spec, { limits: { charts: 2, tables: 1, chartLabel: 20, chartPoints: 20, chartSeries: 12 } })`. It raises `CardSpecError` with readable `issues`, e.g. `"at most 2 Chart per message"`.

## Errors from `toCard`

- `root must be a Card`
- `<id>.props.<prop>: Invalid input: expected string, received number` (zod validation per component)
- unknown component type or a missing child id

## Fallback text

`cardToSlackFallbackText(card)` renders the whole card as plain lines: title, subtitle, fields as `label: value`, `---` for dividers, tables and charts as aligned text tables. Use it as `text` in the webhook payload, or write a one-line summary for nicer notifications.
