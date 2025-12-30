/**
 * PIN-based encryption for session persistence
 * Allows users to unlock their session without re-entering the seed phrase
 */

import { deriveEncryptionKey } from './key-derivation';

const PIN_ITERATIONS = 100_000;
const SALT_length = 16;

/**
 * Encrypt the master key and device ID with a PIN
 */
export async function encryptSessionWithPin(masterKey: CryptoKey, deviceId: string, pin: string): Promise<string> {
    // 1. Export Master Key
    const masterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);
    const masterKeyHex = bytesToHex(new Uint8Array(masterKeyBytes));

    // 2. CONST payload
    const payload = JSON.stringify({ k: masterKeyHex, d: deviceId });
    const payloadBytes = new TextEncoder().encode(payload);

    // 3. Derive Wrapping Key from PIN
    const salt = crypto.getRandomValues(new Uint8Array(SALT_length));
    const wrappingKey = await derivePinKey(pin, salt);

    // 4. Encrypt Payload
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedData = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv,
        },
        wrappingKey,
        payloadBytes
    );

    // 5. Serialize result: salt : iv : encryptedData
    return `${bytesToHex(salt)}:${bytesToHex(iv)}:${bytesToHex(new Uint8Array(encryptedData))}`;
}

/**
 * Decrypt the session (key + deviceID) with a PIN
 */
export async function decryptSessionWithPin(encryptedData: string, pin: string): Promise<{ key: CryptoKey, deviceId: string }> {
    const [saltHex, ivHex, ciphertextHex] = encryptedData.split(':');
    if (!saltHex || !ivHex || !ciphertextHex) {
        throw new Error('Invalid encrypted data format');
    }

    const salt = hexToBytes(saltHex);
    const iv = hexToBytes(ivHex);
    const ciphertext = hexToBytes(ciphertextHex);

    // 1. Derive Wrapping Key
    const wrappingKey = await derivePinKey(pin, salt);

    // 2. Decrypt Payload
    try {
        const payloadBytes = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv,
            },
            wrappingKey,
            ciphertext
        );

        const payloadString = new TextDecoder().decode(payloadBytes);
        const { k: keyHex, d: deviceId } = JSON.parse(payloadString);

        // 3. Import Master Key
        const masterKeyBytes = hexToBytes(keyHex);
        const key = await crypto.subtle.importKey(
            'raw',
            masterKeyBytes,
            'AES-GCM',
            false,
            ['encrypt', 'decrypt']
        );

        return { key, deviceId };
    } catch (e) {
        console.error(e);
        throw new Error('Incorrect PIN');
    }
}

/**
 * Derive a key from PIN using PBKDF2
 */
async function derivePinKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const pinBytes = encoder.encode(pin);

    const baseKey = await crypto.subtle.importKey(
        'raw',
        pinBytes,
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: PIN_ITERATIONS,
            hash: 'SHA-256',
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

// Params: hex string
function hexToBytes(hex: string): Uint8Array {
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < arr.length; i++) {
        arr[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return arr;
}

// Params: Uint8Array
function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
