/**
 * Convex Database Schema
 * Encrypted notes storage for real-time sync
 */

import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
    /**
     * Encrypted notes table
     * All content is encrypted client-side before storage
     */
    notes: defineTable({
        // Client-generated UUID
        noteId: v.string(),
        // Device that created/last modified
        deviceId: v.string(),
        // Encrypted content (stringified EncryptedData)
        encryptedContent: v.string(),
        // Encrypted title (stringified EncryptedData)
        encryptedTitle: v.string(),
        // Timestamps
        createdAt: v.number(),
        updatedAt: v.number(),
        // Soft delete for sync
        deleted: v.boolean(),
        // Metadata (not encrypted, just sizes and hashes)
        metadata: v.object({
            size: v.number(),
            contentHash: v.string(),
        }),
    })
        .index('by_device', ['deviceId'])
        .index('by_noteId', ['noteId'])
        .index('by_updatedAt', ['updatedAt'])
        .index('by_device_updated', ['deviceId', 'updatedAt']),
});
