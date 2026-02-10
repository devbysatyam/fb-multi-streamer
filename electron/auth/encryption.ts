import crypto from 'crypto';
import { app } from 'electron';
import path from 'path';
import fs from 'fs-extra';

const KEY_SIZE = 32; // 256 bits
const NONCE_SIZE = 12; // 96 bits
const ALGORITHM = 'aes-256-gcm';

class CryptoService {
    private key: Buffer;

    constructor() {
        this.key = this.getOrCreateKey();
    }

    private getOrCreateKey(): Buffer {
        const userDataPath = app.getPath('userData');
        const keyPath = path.join(userDataPath, '.key');

        if (fs.existsSync(keyPath)) {
            try {
                const key = fs.readFileSync(keyPath);
                if (key.length === KEY_SIZE) {
                    return key;
                }
            } catch (e) {
                console.error('Error reading key:', e);
            }
        }

        // Generate new key
        const newKey = crypto.randomBytes(KEY_SIZE);
        try {
            fs.writeFileSync(keyPath, newKey);
            // On Windows, we might want to set file attributes to hidden, but simple file permission is default for now
        } catch (e) {
            console.error('Error saving key:', e);
        }
        return newKey;
    }

    public encrypt(plaintext: string): { ciphertext: string; nonce: string; authTag: string } {
        const nonce = crypto.randomBytes(NONCE_SIZE);
        const cipher = crypto.createCipheriv(ALGORITHM, this.key, nonce);

        let encrypted = cipher.update(plaintext, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();

        return {
            ciphertext: encrypted,
            nonce: nonce.toString('hex'),
            authTag: authTag.toString('hex'),
        };
    }

    public decrypt(ciphertext: string, nonceHex: string, authTagHex: string): string {
        const nonce = Buffer.from(nonceHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, this.key, nonce);

        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }
}

export const cryptoService = new CryptoService();
