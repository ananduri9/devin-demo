import * as crypto from 'crypto';
import type { GitHubIssue } from './prompt';

export function verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const expectedBuf = Buffer.from(expected, 'utf8');
  const signatureBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

export function parseIssueOpenedEvent(body: unknown): GitHubIssue | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;

  if (b['action'] !== 'opened') return null;

  const issue = b['issue'];
  if (typeof issue !== 'object' || issue === null) return null;
  const i = issue as Record<string, unknown>;

  if (typeof i['number'] !== 'number') return null;
  if (typeof i['title'] !== 'string') return null;
  if (typeof i['html_url'] !== 'string') return null;

  const user = i['user'];
  if (typeof user !== 'object' || user === null) return null;
  if (typeof (user as Record<string, unknown>)['login'] !== 'string') return null;

  const labels = Array.isArray(i['labels']) ? i['labels'] : [];

  return {
    number: i['number'] as number,
    title: i['title'] as string,
    body: typeof i['body'] === 'string' ? i['body'] : null,
    html_url: i['html_url'] as string,
    user: { login: (user as Record<string, unknown>)['login'] as string },
    labels: labels
      .filter((l): l is Record<string, unknown> => typeof l === 'object' && l !== null)
      .map((l) => ({ name: typeof l['name'] === 'string' ? l['name'] : '' })),
  };
}
