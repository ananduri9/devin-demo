import { getDevinSession } from './devinClient';
import type { GitHubIssue } from './prompt';
import type { DevinSession } from './devinClient';

// ── Logger ──────────────────────────────────────────────────────────────────

type Fields = Record<string, unknown>;

function emit(level: string, msg: string, fields?: Fields): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...fields }));
}

// Simple logger that emits JSON logs. Can be swapped out for Datadog, etc.
export const logger = {
  info: (msg: string, fields?: Fields) => emit('info', msg, fields),
  warn: (msg: string, fields?: Fields) => emit('warn', msg, fields),
  error: (msg: string, fields?: Fields) => emit('error', msg, fields),
};

// ── Tracker ──────────────────────────────────────────────────────────────────

export type IssueState = 'session_created' | 'in_progress' | 'completed' | 'failed' | 'blocked';

const TERMINAL_STATES: IssueState[] = ['completed', 'failed', 'blocked'];
const MAX_RECORDS = 100;

export interface IssueRecord {
  issue_number: number;
  issue_title: string;
  issue_url: string;
  state: IssueState;
  received_at: string;
  session_created_at?: string;
  completed_at?: string;
  session_creation_ms?: number;
  total_ms?: number;
  session_id?: string;
  session_url?: string;
  error?: string;
}

export interface StatusReport {
  uptime_seconds: number;
  summary: Record<IssueState | 'total', number>;
  recent_issues: IssueRecord[];
}

const records: IssueRecord[] = [];
const startedAt = Date.now();

function find(issueNumber: number): IssueRecord | undefined {
  return records.find((r) => r.issue_number === issueNumber);
}

export function trackStart(issue: Pick<GitHubIssue, 'number' | 'title' | 'html_url'>): void {
  records.unshift({ issue_number: issue.number, issue_title: issue.title, issue_url: issue.html_url, state: 'session_created', received_at: new Date().toISOString() });
  if (records.length > MAX_RECORDS) records.pop();
}

export function trackSessionCreated(issueNumber: number, session: DevinSession): void {
  const r = find(issueNumber);
  if (!r) return;
  r.session_id = session.session_id;
  r.session_url = session.url;
  r.session_created_at = new Date().toISOString();
  r.session_creation_ms = Date.now() - new Date(r.received_at).getTime();
  r.state = 'in_progress';
}

export function trackSessionFailed(issueNumber: number, error: string): void {
  const r = find(issueNumber);
  if (!r) return;
  r.state = 'failed';
  r.completed_at = new Date().toISOString();
  r.total_ms = Date.now() - new Date(r.received_at).getTime();
  r.error = error;
}

function trackUpdate(issueNumber: number, state: IssueState): void {
  const r = find(issueNumber);
  if (!r) return;
  r.state = state;
  if (TERMINAL_STATES.includes(state)) {
    r.completed_at ??= new Date().toISOString();
    r.total_ms ??= Date.now() - new Date(r.received_at).getTime();
  }
}

export function getStatus(): StatusReport {
  const summary = { total: records.length, session_created: 0, in_progress: 0, completed: 0, failed: 0, blocked: 0 };
  for (const r of records) summary[r.state]++;
  return { uptime_seconds: Math.floor((Date.now() - startedAt) / 1000), summary, recent_issues: records.slice(0, 20) };
}

// ── Poller ───────────────────────────────────────────────────────────────────

function mapStatus(devinStatus: string): IssueState {
  switch (devinStatus) {
    case 'finished':   return 'completed';  // Devin's term for success
    case 'completed':  return 'completed';  // fallback alias
    case 'failed':     return 'failed';
    case 'stopped':    return 'failed';
    case 'blocked':    return 'blocked';
    case 'suspended':  return 'blocked';
    default:           return 'in_progress';
  }
}

async function poll(): Promise<void> {
  const active = records.filter((r) => r.session_id && !TERMINAL_STATES.includes(r.state));
  if (active.length === 0) return;

  for (const record of active) {
    try {
      const session = await getDevinSession(record.session_id!);
      const newState = mapStatus(session.status);
      logger.info('devin session polled', {
        issue_number: record.issue_number,
        session_id: record.session_id,
        devin_status: session.status,
        mapped_state: newState,
      });
      if (newState === record.state) continue;

      trackUpdate(record.issue_number, newState);

      if (TERMINAL_STATES.includes(newState)) {
        const level = newState === 'completed' ? 'info' : 'error';
        logger[level]('devin session finished', {
          issue_number: record.issue_number,
          session_id: record.session_id,
          session_url: session.url,
          status: newState === 'completed' ? 'success' : 'failed',
          latency_ms: record.total_ms,
        });
      }
    } catch (err) {
      logger.error('failed to poll devin session', { issue_number: record.issue_number, session_id: record.session_id, error: String(err) });
    }
  }
}

export function startPolling(): void {
  setInterval(() => { const { summary } = getStatus(); logger.info('status', summary); }, 5 * 60_000);
  setInterval(() => { poll().catch(() => { }); }, 60_000);
}
