---
tags: [skill-creator]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

i'm posting a slack message through a webhook, built from a json-render spec (toCard -> cardToSlackBlocks from @chat-adapter/slack/blocks). problem: some of the charts arrive not as charts but as some kind of table in a monospace block, and the Top page field shows garbage instead of the path "/search?q=<term>&page=2". here's the spec, find out why and fix it, save the fixed spec as fixed-spec.json and briefly explain what was wrong.

Input files: spec.json
