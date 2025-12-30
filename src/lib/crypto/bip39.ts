/**
 * BIP-39 Seed Phrase utilities
 * Uses ethers.js for 12-word mnemonic generation and validation
 */
import { Mnemonic, randomBytes } from 'ethers';

/**
 * Generate a new 12-word BIP-39 mnemonic phrase
 * 128-bit entropy = 12 words
 */
export function generateMnemonic(): string {
  const entropy = randomBytes(16); // 128 bits = 12 words
  const mnemonic = Mnemonic.fromEntropy(entropy);
  return mnemonic.phrase;
}

/**
 * Validate a BIP-39 mnemonic phrase
 */
export function validateMnemonic(phrase: string): boolean {
  try {
    const normalized = phrase.trim().toLowerCase();
    Mnemonic.fromPhrase(normalized);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a mnemonic phrase to a 512-bit seed
 */
export function mnemonicToSeed(phrase: string): Uint8Array {
  const normalized = phrase.trim().toLowerCase();
  const mnemonic = Mnemonic.fromPhrase(normalized);
  // The seed is derived from the mnemonic using PBKDF2
  // ethers.js returns this as part of the HDNode
  const seedHex = mnemonic.computeSeed();
  return hexToBytes(seedHex);
}

/**
 * Convert a hex string to Uint8Array
 */
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleanHex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Parse a mnemonic phrase from user input
 * Handles various separators (spaces, commas, newlines)
 */
export function parseMnemonicInput(input: string): string[] {
  return input
    .trim()
    .toLowerCase()
    .split(/[\s,\n]+/)
    .filter((word) => word.length > 0);
}

/**
 * Join mnemonic words into a phrase
 */
export function joinMnemonicWords(words: string[]): string {
  return words.join(' ');
}
