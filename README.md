# AI Chief of Staff

Human-in-the-loop demo that turns a mixed email, Slack, and WhatsApp morning inbox into a current-state executive brief.

The app accepts a JSON array of communications, analyzes the complete batch together with an LLM, resolves evolving threads, classifies every original message, drafts responses or handoffs, flags important risks, and renders a daily briefing with source traceability. It does not send messages or assign work.

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
OPENAI_MODEL=gpt-4.1-mini
```

`OPENAI_API_KEY` is used only in the server route. If it is missing, `POST /api/analyze` returns a clear `503` configuration error and the UI shows that a server-side key is required.

## Workflow

1. Load the default sample dataset or upload a new `.json` file.
2. Client-side validation checks array shape, unique IDs, parseable timestamps, sender/body presence, payload size, and unknown channel normalization.
3. `POST /api/analyze` normalizes and chronologically sorts messages.
4. The server makes a structured-output analysis call for the complete batch.
5. Application validation checks message coverage, ID references, thread/item uniqueness, active delegate/decision fields, suspicious sender reply safety, and obvious unsupported financial/candidate details.
6. If validation fails, the server makes one repair call and validates again.
7. A second structured-output call creates the daily briefing from validated current-state analysis only.
8. If the briefing stays over 250 words after one rewrite, a deterministic fallback preserves source IDs.

## Demo Assumptions

The app uses a small generic context in [lib/demo/company-context.ts](lib/demo/company-context.ts). It assumes the CEO decides fundraising matters, executive hiring, benefits approval, material commercial exceptions, and major risk tradeoffs. Routine execution is delegated to functional owners such as Security, Engineering, Finance, Sales, People, Legal, and Operations.

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

The analysis schema is defined in [lib/ai/schemas.ts](lib/ai/schemas.ts). The UI distinguishes historical per-message classifications, current thread state, and deduplicated active executive items.

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
    "model": "gpt-4.1-mini",
    "promptVersion": "aos-v1",
    "processedMessageCount": 20,
    "processingMs": 12345,
    "usedBriefingFallback": false
  }
}
```

Errors use sanitized statuses: `400` malformed input, `413` excessive payload, `503` missing server configuration, `502` invalid model output after repair, and `500` unexpected server error.

## Engineering Notes

- App Router, TypeScript, Tailwind CSS, Zod, and the official OpenAI TypeScript SDK.
- The model never receives one message at a time; the full normalized batch is analyzed together.
- Message content is treated as untrusted data in the prompt and never rendered as arbitrary HTML.
- Metrics are derived in application code, not trusted from model totals.
- Source badges link briefing items, executive cards, flags, threads, and audit records back to original message IDs.
- No authentication, database, background jobs, or external channel integrations are included in this vertical slice.
