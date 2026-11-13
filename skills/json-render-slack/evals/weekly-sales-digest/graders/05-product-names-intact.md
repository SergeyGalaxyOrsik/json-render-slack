---
type: llm
focus: trace
weight: 1
---

Product names containing <, > or & ("USB-C Dock <Thunderbolt 4>", "Desk Lamp & Charger") appear correctly in the output: escaped as &lt; &gt; &amp; where they go into mrkdwn text, and unescaped where they go into table cells or chart labels
