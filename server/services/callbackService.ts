import { createHmac } from 'crypto';

export class CallbackService {
  constructor(private readonly secret: string) {}

  async send(callbackUrl: string, payload: Record<string, unknown>): Promise<void> {
    if (!callbackUrl) return;
    const body = JSON.stringify(payload);
    const signature = createHmac('sha256', this.secret).update(body).digest('hex');

    const response = await fetch(callbackUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-pathwisse-signature': signature,
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Callback failed with status ${response.status}`);
    }
  }
}
