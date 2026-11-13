---
type: llm
focus: trace
weight: 1
---

The explanation says the Field value is sent as mrkdwn without escaping, so <term> and & are interpreted by Slack, and the fix escapes them as &lt; &gt; &amp;
