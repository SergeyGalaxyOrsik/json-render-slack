---
tags: [skill-creator]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

we have a nightly bun cron job that posts plain text with last week's sales to slack through an incoming webhook. i want to make it look nice with json-render (@json-render/chat): a card with totals (revenue, orders, average order value, each with the change vs last week), a daily revenue chart (this week vs last week) and a top-10 products table. we don't have a slack bot and don't want one, only the webhook url. write a sales-digest.ts module with a function that builds the spec from the data and posts it to the webhook, plus an example spec for the data below converted to blocks.

data: revenue 18420 (prev 15100), orders 312 (prev 290), daily revenue this week [2100,2650,2400,3010,2890,2700,2670], last week [1900,2200,2100,2300,2250,2150,2200], top products: "Ergonomic Office Chair — Graphite Edition" 4200 (prev 3100), "Standing Desk Pro 160x80" 3900 (prev 4100), "USB-C Dock <Thunderbolt 4>" 1200 (prev 900), "Monitor Arm Dual" 980 (prev 1010), "Desk Lamp & Charger" 640 (prev 300)
