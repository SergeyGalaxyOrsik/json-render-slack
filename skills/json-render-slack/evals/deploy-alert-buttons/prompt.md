---
tags: [skill-creator]
max_turns: 30
timeout_seconds: 900
allowed_tools: [Read, Glob, Grep, Skill, Write, Edit, Bash]
---

i want a deploy failure alert in the #deploys slack channel. we only have an incoming webhook. the message: a header with the service name and environment, fields (commit, author, duration, failed step), an excerpt of the error log and two buttons: "View logs" (link to CI) and "Rollback" (to roll back right from slack). i want to build it with a json-render spec. make deploy-alert.ts with a buildDeployAlertSpec function plus sending, and an example spec + blocks in example.json.
