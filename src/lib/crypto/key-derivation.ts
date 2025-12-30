/**
 * Key Derivation using PBKDF2
 * Derives AES-256-GCM encryption key from BIP-39 seed
 */

const PBKDF2_ITERATIONS = 100_000;
const SALT = new TextEncoder().encode('kakograph-v1');
const KEY_LENGTH = 256; // bits

/**
 * Derive an AES-256-GCM encryption key from a seed
 * Uses PBKDF2 with 100,000 iterations
 */
export async function deriveEncryptionKey(seed: Uint8Array): Promise<CryptoKey> {
    // Import the seed as a key for PBKDF2
    const baseKey = await crypto.subtle.importKey(
        'raw',
        seed as Uint8Array<ArrayBuffer>,
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
    );

    // Derive the actual encryption key
    const encryptionKey = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: SALT as Uint8Array<ArrayBuffer>,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        baseKey,
        { name: 'AES-GCM', length: KEY_LENGTH },
        true, // extractable for PIN encryption storage
        ['encrypt', 'decrypt']
    );

    return encryptionKey;
}

/**
 * Derive a device ID from the seed for multi-device sync
 * Uses a different salt to ensure unique derivation
 */
export async function deriveDeviceId(seed: Uint8Array): Promise<string> {
    const deviceSalt = new TextEncoder().encode('kakograph-device-v1');

    const baseKey = await crypto.subtle.importKey(
        'raw',
        seed as Uint8Array<ArrayBuffer>,
        'PBKDF2',
        false,
        ['deriveBits']
    );

    const deviceIdBits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: deviceSalt as Uint8Array<ArrayBuffer>,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        baseKey,
        128 // 128 bits for device ID
    );

    return bytesToHex(new Uint8Array(deviceIdBits));
}

/**
 * Convert Uint8Array to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}
