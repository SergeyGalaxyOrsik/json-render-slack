---
type: llm
focus: trace
weight: 1
---

sales-digest.ts converts the spec with toCard and cardToSlackBlocks and POSTs a JSON body with both text and blocks to the webhook URL, without creating a Chat SDK bot or using a Slack bot token
