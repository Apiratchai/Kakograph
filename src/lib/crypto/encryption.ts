/**
 * AES-256-GCM Encryption/Decryption
 * Client-side encryption for zero-knowledge architecture
 */

export interface EncryptedData {
    ciphertext: string; // Base64 encoded
    iv: string; // Base64 encoded (96-bit)
    authTag: string; // Base64 encoded (128-bit, included in GCM ciphertext)
}

const IV_LENGTH = 12; // 96 bits for AES-GCM
const TAG_LENGTH = 128; // bits

/**
 * Encrypt plaintext using AES-256-GCM
 */
export async function encryptText(
    plaintext: string,
    key: CryptoKey
): Promise<EncryptedData> {
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Encode plaintext to bytes
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);

    // Encrypt with AES-GCM
    const encryptedBuffer = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv as Uint8Array<ArrayBuffer>,
            tagLength: TAG_LENGTH,
        },
        key,
        data
    );

    // The encrypted buffer includes the auth tag at the end
    const encryptedArray = new Uint8Array(encryptedBuffer);

    // Extract auth tag (last 16 bytes for 128-bit tag)
    const tagByteLength = TAG_LENGTH / 8;
    const ciphertextBytes = encryptedArray.slice(0, -tagByteLength);
    const authTagBytes = encryptedArray.slice(-tagByteLength);

    return {
        ciphertext: arrayToBase64(ciphertextBytes),
        iv: arrayToBase64(iv),
        authTag: arrayToBase64(authTagBytes),
    };
}

/**
 * Decrypt ciphertext using AES-256-GCM
 */
export async function decryptText(
    encrypted: EncryptedData,
    key: CryptoKey
): Promise<string> {
    const iv = base64ToArray(encrypted.iv);
    const ciphertextBytes = base64ToArray(encrypted.ciphertext);
    const authTagBytes = base64ToArray(encrypted.authTag);

    // Combine ciphertext and auth tag (GCM expects them together)
    const combined = new Uint8Array(ciphertextBytes.length + authTagBytes.length);
    combined.set(ciphertextBytes, 0);
    combined.set(authTagBytes, ciphertextBytes.length);

    // Decrypt
    const decryptedBuffer = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: iv as Uint8Array<ArrayBuffer>,
            tagLength: TAG_LENGTH,
        },
        key,
        combined as Uint8Array<ArrayBuffer>
    );

    // Decode to string
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
}

/**
 * Compute SHA-256 hash of content (for integrity checking)
 */
export async function hashContent(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return arrayToBase64(new Uint8Array(hashBuffer));
}

/**
 * Convert Uint8Array to Base64 string
 */
function arrayToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Convert Base64 string to Uint8Array
 */
function base64ToArray(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
