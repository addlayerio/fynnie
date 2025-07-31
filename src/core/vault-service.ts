import Keyv from 'keyv';
import KeyvSqlite from '@keyv/sqlite';
import { Secret, Token } from 'fernet';

const VAULT_SECRET = process.env.VAULT_SECRET;
if (!VAULT_SECRET) throw new Error('VAULT_SECRET no definido');

export class VaultService {
  private keyv: Keyv;
  private secret: Secret;

  constructor(dbUri: string) {
    const store = new KeyvSqlite({ uri: dbUri });
    this.keyv = new Keyv({ store });
    this.secret = new Secret(VAULT_SECRET);
  }

  async getAllKeys(): Promise<string[]> {
    const keys: string[] = [];
    for await (const [key] of this.keyv.iterator({})) {
      keys.push(key as string);
    }
    return keys;
  }

  private encrypt(value: string): string {
    const token = new Token({
      secret: this.secret,
      time: Date.now(),
    });
    return token.encode(value);
  }

  private decrypt(tokenStr: string): string {
    const token = new Token({
      secret: this.secret,
      token: tokenStr,
      ttl: 0, // sin expiración
    });

    return token.decode(); // Puede lanzar error si es inválido
  }

  async setSecret(key: string, value: string): Promise<void> {
    const encrypted = this.encrypt(value);
    await this.keyv.set(key, encrypted);
  }

  async getSecret(key: string): Promise<string | null> {
    console.log(key)
    const encrypted = await this.keyv.get(key);
    console.log(encrypted)
    if (!encrypted || typeof encrypted !== 'string') return null;

    try {
      return this.decrypt(encrypted);
    } catch (err) {
      console.error(`Error al descifrar la clave '${key}':`, err);
      return null;
    }
  }

  async deleteSecret(key: string): Promise<boolean> {
    return await this.keyv.delete(key);
  }

  async hasSecret(key: string): Promise<boolean> {
    return (await this.keyv.get(key)) !== undefined;
  }
}
