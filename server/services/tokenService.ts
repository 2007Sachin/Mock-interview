import { createHash, createHmac, randomUUID } from 'crypto';
import { SignedVoiceConnectToken, VoiceConnectTokenClaims, VoiceTransport } from '../types.js';

export class TokenService {
  createToken() {
    return randomUUID();
  }

  createSignedVoiceToken(input: {
    sessionId: string;
    transport: VoiceTransport;
    ttlSeconds?: number;
  }): SignedVoiceConnectToken {
    const secret = process.env.PIPECAT_CONNECT_SECRET?.trim();
    if (!secret) {
      throw new Error('PIPECAT_CONNECT_SECRET is not configured.');
    }

    const iat = Math.floor(Date.now() / 1000);
    const claims: VoiceConnectTokenClaims = {
      sessionId: input.sessionId,
      transport: input.transport,
      nonce: randomUUID(),
      iat,
      exp: iat + (input.ttlSeconds ?? 5 * 60),
    };

    const header = this.toBase64Url({ alg: 'HS256', typ: 'JWT' });
    const payload = this.toBase64Url(claims);
    const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');

    return {
      token: `${header}.${payload}.${signature}`,
      claims,
    };
  }

  hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private toBase64Url(value: object) {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }
}
