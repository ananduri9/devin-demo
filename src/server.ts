import express, { Request, Response } from 'express';
import { verifySignature, parseIssueOpenedEvent } from './webhook';
import { buildDevinPrompt } from './prompt';
import { createDevinSession } from './devinClient';
import { logger, trackStart, trackSessionCreated, trackSessionFailed, getStatus, startPolling } from './observability';

const required = ['DEVIN_API_KEY', 'DEVIN_ORG_ID', 'GITHUB_WEBHOOK_SECRET', 'GITHUB_REPO', 'PORT'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing env var: ${key}`);
}

const WEBHOOK_SECRET = process.env['GITHUB_WEBHOOK_SECRET']!;
const GITHUB_REPO = process.env['GITHUB_REPO']!;
const PORT = parseInt(process.env['PORT']!, 10);

const app = express();

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.get('/status', (_req: Request, res: Response) => {
  res.json(getStatus());
});

app.post('/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  const signature = req.headers['x-hub-signature-256'];
  if (typeof signature !== 'string') {
    res.status(400).json({ error: 'Missing X-Hub-Signature-256 header' });
    return;
  }

  if (!verifySignature(req.body as Buffer, signature, WEBHOOK_SECRET)) {
    res.status(401).json({ error: 'Invalid signature' });
    return;
  }

  const event = req.headers['x-github-event'];
  if (event !== 'issues') {
    res.json({ skipped: true, reason: `event type: ${event}` });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse((req.body as Buffer).toString('utf8'));
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const issue = parseIssueOpenedEvent(parsed);
  if (!issue) {
    res.json({ skipped: true, reason: 'not an opened issue event' });
    return;
  }

  trackStart(issue);
  logger.info('issue received', { issue_number: issue.number, title: issue.title });

  try {
    const prompt = buildDevinPrompt(issue, GITHUB_REPO);
    const session = await createDevinSession(prompt);
    trackSessionCreated(issue.number, session);
    logger.info('devin session created', { issue_number: issue.number, session_id: session.session_id, session_url: session.url });
    res.json({ session_id: session.session_id, url: session.url });
  } catch (err) {
    const error = String(err);
    trackSessionFailed(issue.number, error);
    logger.error('failed to create devin session', { issue_number: issue.number, error });
    res.status(500).json({ error: 'Failed to create Devin session' });
  }
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandled rejection', { reason: String(reason) });
  process.exit(1);
});

app.listen(PORT, () => {
  logger.info('server started', { port: PORT, repo: GITHUB_REPO });
  startPolling();
});
