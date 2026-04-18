# Devin Demo

Automatically fix GitHub issues as they are created using [Devin](https://app.devin.ai). When a new issue is opened in your repository, this service calls the Devin API to start an autonomous session that investigates the problem, implements a fix, writes regression tests, and opens a pull request — ready for a human to review and merge.

## How It Works

1. A GitHub issue is opened in your repository
2. GitHub sends a webhook POST to this service
3. The service validates the signature and extracts the issue
4. A detailed prompt is built and sent to the Devin API
5. Devin clones the repo, fixes the issue, writes tests, and opens a PR on a `fix/issue-{N}` branch
6. The service polls Devin every 60 seconds until the session completes
7. A human reviews and merges the PR

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- A [Devin](https://app.devin.ai) account with API access
- A GitHub repository you own or administer

## Setup

### Step 1 — Get your Devin credentials

- **`DEVIN_API_KEY`**: In the Devin dashboard go to Settings → API Keys
- **`DEVIN_ORG_ID`**: Visible in the URL after logging in — `app.devin.ai/organizations/<org-id>`

### Step 2 — Generate a webhook secret

Run this command and save the output:

```bash
openssl rand -hex 32
```

This becomes your `GITHUB_WEBHOOK_SECRET`. It is used to verify that webhook requests are genuinely from GitHub.

### Step 3 — Build the Docker image

```bash
docker build -t devin-demo .
```

### Step 4 — Create your `.env` file

```bash
cp .env.example .env
```

Fill in your values (format is `KEY=value` with no `export`):

```
DEVIN_API_KEY=your_devin_api_key
DEVIN_ORG_ID=your_devin_org_id
GITHUB_WEBHOOK_SECRET=your_generated_secret
GITHUB_REPO=owner/repo
PORT=3000
```

### Step 5 — Run the container

```bash
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  --name devin-demo \
  devin-demo
```

The service must be reachable from the internet for GitHub to deliver webhooks. If running locally, expose it with [ngrok](https://ngrok.com):

```bash
ngrok http 3000
```

Ngrok will give you a public URL like `https://abc123.ngrok-free.app` — use this in the next step.

### Step 6 — Register the webhook in GitHub

1. Go to your repository → **Settings → Webhooks → Add webhook**
2. **Payload URL**: `https://<your-host>/webhook`
3. **Content type**: `application/json`
4. **Secret**: the value from Step 2
5. **Which events**: select **Let me select individual events** → check **Issues** only
6. Click **Add webhook**

GitHub will send a ping event. A green checkmark confirms the service received it correctly.

## Monitoring

### Health check

```bash
curl http://localhost:3000/health
```
```json
{"status":"ok"}
```

### Live status

```bash
curl http://localhost:3000/status
```
```json
{
  "uptime_seconds": 3600,
  "summary": {
    "total": 5,
    "session_created": 0,
    "in_progress": 1,
    "completed": 3,
    "failed": 1,
    "blocked": 0
  },
  "recent_issues": [
    {
      "issue_number": 62,
      "issue_title": "fix: null pointer in auth middleware",
      "issue_url": "https://github.com/owner/repo/issues/62",
      "state": "in_progress",
      "received_at": "2026-04-18T22:10:00Z",
      "session_created_at": "2026-04-18T22:10:01Z",
      "session_creation_ms": 1240,
      "session_id": "abc123",
      "session_url": "https://app.devin.ai/sessions/abc123"
    },
    {
      "issue_number": 60,
      "issue_title": "fix(jinja): url_param() SQL injection",
      "issue_url": "https://github.com/owner/repo/issues/60",
      "state": "completed",
      "received_at": "2026-04-18T21:00:00Z",
      "completed_at": "2026-04-18T21:14:00Z",
      "session_creation_ms": 980,
      "total_ms": 840000,
      "session_id": "xyz789",
      "session_url": "https://app.devin.ai/sessions/xyz789"
    }
  ]
}
```

`session_creation_ms` is the time from webhook receipt to Devin session created. `total_ms` is the full wall-clock time from receipt to Devin finishing.

### Logs

All logs are structured JSON written to stdout:

```bash
docker logs -f devin-demo
```

Key events:

| `msg` field | When it appears |
|---|---|
| `server started` | On startup — confirms port and repo being watched |
| `issue received` | A new GitHub issue triggered the webhook |
| `devin session created` | Devin accepted the job — `session_url` links to the live session |
| `devin session finished` | Devin completed — `status` is `"success"` or `"failed"`, `latency_ms` is total duration |
| `failed to create devin session` | Devin API call failed (check credentials) |
| `status` | Heartbeat every 5 minutes with summary counts |

Example output:

```
{"ts":"2026-04-18T22:10:00Z","level":"info","msg":"issue received","issue_number":62,"title":"fix: null pointer in auth middleware"}
{"ts":"2026-04-18T22:10:01Z","level":"info","msg":"devin session created","issue_number":62,"session_id":"abc123","session_url":"https://app.devin.ai/sessions/abc123"}
{"ts":"2026-04-18T22:24:00Z","level":"info","msg":"devin session finished","issue_number":62,"status":"success","latency_ms":840000}
{"ts":"2026-04-18T22:30:00Z","level":"info","msg":"status","total":5,"in_progress":0,"completed":4,"failed":1,"blocked":0}
```
