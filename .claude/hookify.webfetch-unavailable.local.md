---
name: warn-webfetch-unavailable
enabled: true
event: all
action: warn
tool_matcher: WebFetch|WebSearch
conditions:
  - field: url
    operator: regex_match
    pattern: .
---

⚠️ **`WebFetch` and `WebSearch` do not work in this environment**

Measured over 7 days: **15 of 15** `WebFetch` calls and **16 of 16** `WebSearch`
calls failed. 31 calls, zero successes. This is not intermittent.

Two distinct failure modes, neither of which a retry fixes:

- `Unable to verify if domain <host> is safe to fetch` — domain verification
  fails even for `code.claude.com` and `github.com`.
- Outright refusal because the session is not in a trusted mode.

**Use instead:**

| Need                      | Route                                                 |
| ------------------------- | ----------------------------------------------------- |
| Library / framework docs  | `context7` MCP — 1 call, 1 success in the same window |
| A specific page's content | Ask the user to paste it                              |
| Something in the repo     | `Grep` / `Glob` / `Read`                              |

One message asking the user for content costs far less than four failed fetches
followed by a wrong answer from memory.

See `docs/17-session-review.md` § 3.8.

---

_Note: this rule matches on the `url` field, so a `WebSearch` call carrying only
a `query` will not trigger it. The guidance above still applies — treat both
tools as unavailable._
