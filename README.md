# AI Chief of Staff

Human-in-the-loop demo that turns a mixed email, Slack, and WhatsApp morning inbox into a current-state executive workflow.

The app accepts a JSON array of communications, analyzes the complete batch together with an LLM, resolves evolving threads, classifies every original message, drafts responses or handoffs, flags important risks, and renders a concise daily briefing with source traceability. A separate local workflow layer lets the CEO record decisions, intended delegations, acknowledgements, waiting states, completions, and dismissals. It does not send messages or assign work.

## Quick Start

```bash
npm install
cp .env.example .env.local
# set OPENAI_API_KEY in .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The supplied fixture is normalized into [data/messages.json](data/messages.json). The assessment PDF remains outside the app and is not exposed through public assets.

## Environment

```bash
OPENAI_API_KEY=sk-your-server-side-key
OPENAI_MODEL=gpt-5.4-mini
AOS_THREADED_ANALYSIS_MIN_MESSAGES=30
AOS_THREAD_ANALYSIS_CONCURRENCY=3
```

`OPENAI_API_KEY` is used only in the server route. If it is missing, `POST /api/analyze` returns a clear `503` configuration error and the UI shows that a server-side key is required.

Large batches automatically switch from one-shot analysis to a threaded pipeline at `AOS_THREADED_ANALYSIS_MIN_MESSAGES` messages. The threaded path first builds a full-batch thread plan, then analyzes bounded thread slices with `AOS_THREAD_ANALYSIS_CONCURRENCY` parallel calls before merging back into the same audit-ready schema.

## From Analysis Report To Workflow

The first version answered “what did the AI find?” This version adds the operational loop: “what needs attention, what has been handled, and what remains unfinished?”

1. The AI layer resolves the latest current state from the full communication batch.
2. The workflow layer derives canonical actions from that analysis.
3. The CEO opens an action, inspects evidence and missing context, records a decision or handoff, acknowledges a flag, or dismisses the item.
4. Morning progress and active counts update immediately.
5. Original messages, model lifecycle state, rationale, and drafts remain unchanged in the Audit Trail.

## Two Types Of State

Immutable AI analysis state:

- Message classification: `ignore`, `delegate`, `decide`
- Lifecycle: `active`, `superseded`, `resolved`, `informational`
- Threads, executive items, flags, rationales, source IDs, and model drafts

Mutable local workflow state:

- Workflow status: `open`, `in_progress`, `waiting`, `completed`, `dismissed`
- Recorded decision, selected option, owner, notes, edited draft, and timestamps
- Stored by deterministic action keys derived from stable source IDs and action title

Completing an action never changes the AI lifecycle. For example, an AI-active decision can have workflow status `completed`.

## Saved Analysis Runs

Successful analyses are stored locally in the browser so a demo can survive refreshes and a reviewer can switch between prior runs.

- The latest saved run restores automatically on refresh.
- The Dataset panel includes a `Saved run` dropdown.
- Uploading a new JSON file creates a new working dataset without deleting previous runs.
- Clicking Analyze stores that dataset, analysis result, briefing, metadata, and timestamp.
- Saved runs are capped locally to keep browser storage bounded.

This supports a realistic CEO pattern: each morning can be reviewed as its own run, while unresolved workflow items remain locally available by stable action key. In production, prior-day carryover would be synthesized with new communications through durable user-scoped persistence and an explicit historical context retrieval layer.

## Navigation

The app uses URL-driven views so browser back/forward and metric-card links are useful without losing the current analysis:

- `Briefing`: concise daily briefing, morning progress, upcoming deadlines, and critical flags
- `Action Center`: canonical operational queue with filters, search, sorting, workflow controls, and detail drawer
- `Audit Trail`: original messages and thread timelines with AI category, lifecycle, rationale, drafts, flags, and source links

Metric cards navigate directly into the assignment deliverables: Briefing, Decide, Delegate, Flags, and Ignore.

## Analysis Pipeline

1. Load the default sample dataset or upload a new `.json` file.
2. Client-side validation checks array shape, unique IDs, parseable timestamps, sender/body presence, payload size, and unknown channel normalization.
3. `POST /api/analyze` normalizes and chronologically sorts messages.
4. Small batches use one compact structured-output analysis call for the complete batch.
5. Larger batches use staged analysis: one full-batch thread plan, then smaller structured-output calls per planned thread.
6. Application validation checks message coverage, ID references, thread/item uniqueness, active delegate/decision fields, suspicious sender reply safety, and obvious unsupported financial/candidate details.
7. Invalid model output gets one repair attempt at the same scope. In threaded mode, an individual failed thread can fall back to thread-scoped deterministic analysis without discarding successful model analysis for other threads.
8. Application code expands the validated current state into safe drafts, grounded decision options, and a deduplicated daily briefing.
9. The briefing is deterministic from validated analysis so it preserves source IDs, avoids obsolete history, and stays within the read-time budget.

## Workflow Behavior

Decision actions:

- Open the detail drawer with the decision question, current state, grounded options, tradeoffs, missing context, draft, thread timeline, and original messages.
- Record one of the model-returned options, request more information, or write a different decision.
- Move the item to `in_progress` or `waiting`, then later mark complete or reopen.

Delegation actions:

- Confirm or edit the suggested owner.
- Edit the internal handoff draft.
- Mark the item delegated, which moves it to `waiting`.
- The UI explicitly states that nobody is notified.

Flag actions:

- Flags attach to linked canonical actions when possible, so the phishing issue is one security delegation with an attached critical flag rather than several duplicate tasks.
- Standalone flags can be acknowledged or dismissed.
- Acknowledging a flag does not automatically complete a linked decision or delegation.

Drafts:

- Initial draft text comes from the AI output.
- Edits persist locally.
- `Reset to AI draft` restores the original model draft.
- There is no Send button.

## Demo Persistence

Workflow updates are stored in browser `localStorage` under a versioned key:

```text
ai-chief-of-staff:workflow:v1
```

Saved analysis runs are stored separately under:

```text
ai-chief-of-staff:analysis-runs:v1
ai-chief-of-staff:selected-run:v1
```

Malformed stored JSON is ignored safely. Stale workflow states are filtered by current deterministic action keys, so unrelated uploaded datasets do not show old action state. A visible `Reset workflow` action clears local workflow updates for another demo.

No messages are sent, no assignees are notified, and no external communication APIs are called.

## Demo Assumptions

The app uses a small generic context in [lib/demo/company-context.ts](lib/demo/company-context.ts). These assumptions are intentionally documented here rather than displayed in the product UI, so the demo interface stays focused on the briefing, action queue, and audit trail.

Executive preferences:

- Surface decisions requiring executive authority.
- Escalate security, financial, legal, reputational, major customer, and material operational risks.
- Prefer concise drafts.
- Keep personal communications separate from company matters.

Decision policy:

- The CEO generally decides fundraising matters, executive hiring, benefits approval, material commercial exceptions, and major risk tradeoffs.
- Routine execution, investigation, and status updates should normally be delegated to the appropriate function.
- No communication may be sent without human approval.

Functional owners available to the analysis:

- Executive Assistant
- Chief Operating Officer
- Engineering
- Security
- Finance
- Sales
- People
- Product
- Marketing
- Legal

A production deployment would replace this with the client’s org chart, responsibility matrix, approval thresholds, and CEO preferences.

## Data Contract

Accepted messages may look like:

```json
{
  "id": "16",
  "channel": "slack",
  "from": "tom.bradley",
  "channel_name": "#engineering",
  "timestamp": "2026-03-18T11:45:00Z",
  "body": "..."
}
```

Known channels are `email`, `slack`, and `whatsapp`. Unknown channels are normalized to `other` when required fields are present.

The analysis schema is defined in [lib/ai/schemas.ts](lib/ai/schemas.ts). Workflow types, action keys, selectors, and persistence helpers live under [lib/workflow](lib/workflow).

## Scripts

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Optional live evaluation:

```bash
OPENAI_API_KEY=sk-... npm run evaluate:sample
```

The evaluation command runs the real model against the supplied sample and checks the important assessment invariants, including API migration supersession, Horizon resolution, Northwind term update, security phishing handling, People split actions, and source coverage.

## API

`POST /api/analyze`

Request:

```json
{
  "messages": []
}
```

Success:

```json
{
  "analysis": {},
  "briefing": {},
  "metadata": {
    "model": "gpt-5.4-mini",
    "promptVersion": "aos-v4",
    "processedMessageCount": 20,
    "processingMs": 12345,
    "analysisMode": "single_pass",
    "modelCallCount": 1,
    "plannedThreadCount": null,
    "partialAnalysisFallbackCount": 0,
    "analysisFallbackReason": null,
    "analysisWarnings": [],
    "usedAnalysisFallback": false,
    "usedBriefingFallback": false
  }
}
```

Errors use sanitized statuses: `400` malformed input, `413` excessive payload, `503` missing server configuration/provider quota or key issues, `502` invalid model output after repair or provider failure, and `500` unexpected server error.

## Demo Script

1. Open Briefing.
2. Show morning progress.
3. Click the Decide metric.
4. Open the API incident.
5. Inspect the thread timeline.
6. Record a decision without sending anything.
7. Show the queue and progress update.
8. Open the Security delegation.
9. Edit the handoff and mark it delegated.
10. Show it moving to Waiting.
11. Open the Audit Trail.
12. Show the original AI analysis remained unchanged.
13. Reset workflow for another demo.

## Production Path

A production deployment would add durable user-scoped persistence, user identity, RBAC, multi-user collaboration, approval gates, audit events, workflow notifications, and real integrations for email, Slack, WhatsApp, ticketing, and task systems. Outbound actions would still require explicit human approval.

## Engineering Notes

- App Router, TypeScript, Tailwind CSS, Zod, and the official OpenAI TypeScript SDK.
- Small batches are analyzed together with a compact structured-output contract constrained to uploaded message IDs.
- Larger batches are analyzed hierarchically: full-batch thread planning first, then per-thread structured analysis with the full thread map included as deduplication context.
- Threaded analysis namespaces per-thread model IDs before merging so thread, action, and flag references stay stable and unique.
- The daily briefing is generated from validated current-state actions and standalone flags instead of asking the model to summarize the same facts again.
- If one threaded slice times out or still returns unusable structured output, only that slice falls back to thread-scoped deterministic analysis. If the whole provider path fails, the app falls back to conservative deterministic analysis so the CEO still gets triage, flags, and a briefing.
- Message content is treated as untrusted data in the prompt and never rendered as arbitrary HTML.
- Metrics are derived from canonical workflow selectors, not trusted from model totals.
- Source badges link briefing items, action cards, flags, threads, and audit records back to original message IDs.
- Local workflow state is separate from immutable AI analysis state.
- URL query parameters drive top-level views and filters.
- No authentication, database, background jobs, or external channel integrations are included in this vertical slice.
