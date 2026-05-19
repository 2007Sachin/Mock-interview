import { createHash, randomUUID } from 'crypto';

export class TokenService {
  createToken() {
    return randomUUID();
  }

  hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
