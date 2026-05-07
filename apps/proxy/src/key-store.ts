// Agent API key store (D-050).
//
// Issues opaque static API keys that agents use to authenticate with the proxy.
// Keys are stored as SHA-256 hashes — the plaintext is returned only at
// issuance time and never again.
//
// Key format: rind_live_<40 hex chars>  (20 random bytes)
// Key ID:     first 8 hex chars of the hash (short, collision-free at this scale)

import { createHash, randomBytes } from 'node:crypto';

const KEY_PREFIX = 'rind_live_';

export interface ApiKeyRecord {
  id: string;
  name: string;
  serverIds: string[]; // '*' = all registered servers
  createdAt: number;
  lastUsedAt?: number;
}

export interface IssuedKey {
  plaintext: string;
  record: ApiKeyRecord;
}

function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

function keyIdFromHash(hash: string): string {
  return hash.slice(0, 8);
}

export class ApiKeyStore {
  // Map<keyHash, record>
  private readonly keys = new Map<string, ApiKeyRecord>();
  // Map<keyId, keyHash> — for O(1) lookup by ID
  private readonly idToHash = new Map<string, string>();

  issue(name: string, serverIds: string[]): IssuedKey {
    const plaintext = KEY_PREFIX + randomBytes(20).toString('hex');
    const hash = hashKey(plaintext);
    const id = keyIdFromHash(hash);
    const record: ApiKeyRecord = {
      id,
      name,
      serverIds,
      createdAt: Date.now(),
    };
    this.keys.set(hash, record);
    this.idToHash.set(id, hash);
    return { plaintext, record };
  }

  validate(plaintext: string, serverId?: string): ApiKeyRecord | null {
    const hash = hashKey(plaintext);
    const record = this.keys.get(hash);
    if (!record) return null;
    if (serverId && !record.serverIds.includes('*') && !record.serverIds.includes(serverId)) {
      return null;
    }
    record.lastUsedAt = Date.now();
    return record;
  }

  get(id: string): ApiKeyRecord | undefined {
    const hash = this.idToHash.get(id);
    return hash ? this.keys.get(hash) : undefined;
  }

  list(): ApiKeyRecord[] {
    return Array.from(this.keys.values());
  }

  revoke(id: string): boolean {
    const hash = this.idToHash.get(id);
    if (!hash) return false;
    this.keys.delete(hash);
    this.idToHash.delete(id);
    return true;
  }

  size(): number {
    return this.keys.size;
  }
}
