---
type: llm
focus: trace
weight: 1
---

deploy-alert.ts converts the spec with toCard and cardToSlackBlocks and POSTs a JSON body with both text and blocks to the incoming webhook, without a Chat SDK bot or bot token
