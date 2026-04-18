import axios from 'axios';

const apiKey = process.env['DEVIN_API_KEY'];
const orgId = process.env['DEVIN_ORG_ID'];

if (!apiKey) throw new Error('Missing env var: DEVIN_API_KEY');
if (!orgId) throw new Error('Missing env var: DEVIN_ORG_ID');

export interface DevinSession {
  session_id: string;
  url: string;
}

export interface DevinSessionStatus {
  session_id: string;
  status: string;
  url: string;
}

export async function createDevinSession(prompt: string): Promise<DevinSession> {
  const response = await axios.post<DevinSession>(
    `https://api.devin.ai/v3/organizations/${orgId}/sessions`,
    { prompt },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    }
  );
  return response.data;
}

export async function getDevinSession(sessionId: string): Promise<DevinSessionStatus> {
  const response = await axios.get<DevinSessionStatus>(
    `https://api.devin.ai/v3/organizations/${orgId}/sessions/${sessionId}`,
    {
      headers: { Authorization: `Bearer ${apiKey}` },
    }
  );
  return response.data;
}
