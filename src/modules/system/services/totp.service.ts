// =============================================================================
// TotpService — TOTP 2FA with AES-256-GCM Encryption
// =============================================================================
// OK Footwear ERP — Sprint 2, System Module
//
// Implements RFC 6238 TOTP using Node.js built-in crypto (no external deps).
//
// Secret lifecycle:
//   generateSecret() → 20 random bytes → base32 → encrypt(AES-256-GCM) → store
//   verify(token, encrypted) → decrypt → HMAC-SHA1 TOTP check → boolean
//
// Encryption (AES-256-GCM):
//   - Key: 32 bytes from TOTP_ENCRYPTION_KEY env var (64-char hex)
//   - IV: 12 random bytes per encryption
//   - Storage format: base64(iv || authTag || ciphertext)
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const TOTP_PERIOD = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;
const OTPAUTH_ISSUER = 'OKFootwearERP';
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

@Injectable()
export class TotpService {
  private readonly logger = new Logger(TotpService.name);
  private _encryptionKey: Buffer | null = null;

  private get encryptionKey(): Buffer {
    if (!this._encryptionKey) {
      const hex = process.env['TOTP_ENCRYPTION_KEY'];
      if (!hex || hex.length !== 64) {
        throw new Error(
          'TOTP_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)',
        );
      }
      this._encryptionKey = Buffer.from(hex, 'hex');
    }
    return this._encryptionKey;
  }

  // =========================================================================
  // Public API
  // =========================================================================

  /** Generate secret + encrypt + otpauth URL. Caller stores encrypted in DB. */
  generateSecret(): { secret: string; encrypted: string; otpauthUrl: string } {
    const rawBytes = crypto.randomBytes(20);
    const secret = this.bytesToBase32(rawBytes);
    const encrypted = this.encrypt(secret);
    const otpauthUrl = `otpauth://totp/${OTPAUTH_ISSUER}?secret=${secret}&issuer=${OTPAUTH_ISSUER}`;
    return { secret, encrypted, otpauthUrl };
  }

  /** Setup 2FA: returns raw secret (for QR) + encrypted (for DB). */
  async setup2fa(): Promise<{ secret: string; encrypted: string; otpauthUrl: string }> {
    return this.generateSecret();
  }

  /** Verify a TOTP token against the encrypted secret from DB. */
  verify(token: string, encryptedSecret: string): boolean {
    try {
      const secret = this.decrypt(encryptedSecret);
      return this.checkTotp(token, secret);
    } catch (err) {
      this.logger.warn('TOTP verify failed', (err as Error).message);
      return false;
    }
  }

  /** Disable 2FA — caller sets totp_secret_encrypted = null in DB. */
  disable2fa(): void {
    this.logger.debug('2FA disabled');
  }

  // =========================================================================
  // TOTP (RFC 6238) — HMAC-SHA1 + dynamic truncation
  // =========================================================================

  private generateTotp(secretBytes: Buffer, counter: number): string {
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigUInt64BE(BigInt(counter), 0);
    const hmac = crypto.createHmac('sha1', secretBytes).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1]! & 0x0f;
    const binary =
      ((hmac[offset]! & 0x7f) << 24) |
      ((hmac[offset + 1]! & 0xff) << 16) |
      ((hmac[offset + 2]! & 0xff) << 8) |
      (hmac[offset + 3]! & 0xff);
    const otp = binary % 10 ** TOTP_DIGITS;
    return otp.toString().padStart(TOTP_DIGITS, '0');
  }

  private checkTotp(token: string, base32Secret: string): boolean {
    const secretBytes = this.base32ToBytes(base32Secret);
    const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
    for (let w = -TOTP_WINDOW; w <= TOTP_WINDOW; w++) {
      const expected = this.generateTotp(secretBytes, counter + w);
      if (crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
        return true;
      }
    }
    return false;
  }

  // =========================================================================
  // AES-256-GCM
  // =========================================================================

  private encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  }

  private decrypt(encryptedBase64: string): string {
    const combined = Buffer.from(encryptedBase64, 'base64');
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }

  // =========================================================================
  // Base32 (RFC 4648)
  // =========================================================================

  private bytesToBase32(bytes: Buffer): string {
    let result = '', bits = 0, value = 0;
    for (const byte of bytes) {
      value = (value << 8) | byte; bits += 8;
      while (bits >= 5) { bits -= 5; result += BASE32_ALPHABET[(value >> bits) & 0x1f]; }
    }
    if (bits > 0) result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
    return result;
  }

  private base32ToBytes(base32: string): Buffer {
    const sanitized = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
    const result: number[] = [];
    let bits = 0, value = 0;
    for (const char of sanitized) {
      value = (value << 5) | BASE32_ALPHABET.indexOf(char); bits += 5;
      if (bits >= 8) { bits -= 8; result.push((value >> bits) & 0xff); }
    }
    return Buffer.from(result);
  }
}
