import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

@Injectable()
export class EncryptionService {
  private _encryptionKey: Buffer | null = null;

  private get encryptionKey(): Buffer {
    if (!this._encryptionKey) {
      const hex = process.env['HR_PII_ENCRYPTION_KEY'];
      if (!hex || hex.length !== 64) {
        throw new Error(
          'HR_PII_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)',
        );
      }
      this._encryptionKey = Buffer.from(hex, 'hex');
    }
    return this._encryptionKey;
  }

  /** Encrypt plaintext to BYTEA-ready buffer: iv || authTag || ciphertext */
  encrypt(plaintext: string): Buffer {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]);
  }

  /** Decrypt BYTEA buffer produced by encrypt() */
  decrypt(blob: Buffer): string {
    const iv = blob.subarray(0, IV_LENGTH);
    const authTag = blob.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = blob.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
