/**
 * Convex Database Schema
 * Encrypted notes storage for real-time sync
 * 
 * IMPORTANT: All content is encrypted client-side before storage.
 * The server never sees plaintext data.
 */

import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
    /**
     * Encrypted notes table
     * Matches the EncryptedNote interface in src/lib/storage/interface.ts
     */
    notes: defineTable({
        // Client-generated UUID (matches local IndexedDB id)
        noteId: v.string(),

        // User identifier (derived from seed phrase)
        seedId: v.string(),

        // Encrypted content (JSON stringified EncryptedData)
        encryptedContent: v.string(),

        // Encrypted title (JSON stringified EncryptedData)
        encryptedTitle: v.string(),

        // Encrypted folder name (JSON stringified EncryptedData)
        encryptedFolder: v.optional(v.string()),

        // Timestamps (Unix ms)
        timestamp: v.number(),      // Created at
        updatedAt: v.number(),      // Last modified

        // Soft delete for sync
        deleted: v.boolean(),
        deletedAt: v.optional(v.number()), // When deleted (for 30-day cleanup)

        // Metadata (not encrypted)
        metadata: v.object({
            size: v.number(),           // Plaintext size in bytes
            contentHash: v.string(),    // SHA-256 of plaintext for conflict detection
        }),
    })
        // Indexes for efficient queries
        .index('by_seed', ['seedId'])
        .index('by_noteId', ['noteId'])
        .index('by_seed_noteId', ['seedId', 'noteId'])
        .index('by_seed_updated', ['seedId', 'updatedAt'])
        .index('by_seed_deleted', ['seedId', 'deleted']),
});
