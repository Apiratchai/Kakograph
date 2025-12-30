/**
 * Convex Notes API
 * Mutations and queries for encrypted notes sync
 * 
 * All note content is encrypted client-side. The server only sees ciphertext.
 */

import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

// Shared validator for note structure
const noteValidator = v.object({
    noteId: v.string(),
    deviceId: v.string(),
    encryptedContent: v.string(),
    encryptedTitle: v.string(),
    timestamp: v.number(),
    updatedAt: v.number(),
    deleted: v.boolean(),
    deletedAt: v.optional(v.number()),
    folder: v.optional(v.string()),
    metadata: v.object({
        size: v.number(),
        contentHash: v.string(),
    }),
});

/**
 * Upsert a note (create or update)
 * Uses last-write-wins conflict resolution
 */
export const upsertNote = mutation({
    args: noteValidator.fields,
    handler: async (ctx, args) => {
        // Find existing note by noteId AND deviceId
        const existing = await ctx.db
            .query('notes')
            .withIndex('by_device_noteId', (q) =>
                q.eq('deviceId', args.deviceId).eq('noteId', args.noteId)
            )
            .first();

        if (existing) {
            // Only update if incoming is newer (last-write-wins)
            if (args.updatedAt > existing.updatedAt) {
                await ctx.db.patch(existing._id, {
                    encryptedContent: args.encryptedContent,
                    encryptedTitle: args.encryptedTitle,
                    updatedAt: args.updatedAt,
                    deleted: args.deleted,
                    deletedAt: args.deletedAt,
                    folder: args.folder,
                    metadata: args.metadata,
                });
            }
            return existing._id;
        } else {
            // Create new note
            return await ctx.db.insert('notes', args);
        }
    },
});

/**
 * Soft delete a note (move to trash)
 */
export const softDeleteNote = mutation({
    args: {
        noteId: v.string(),
        deviceId: v.string(),
        deletedAt: v.number(),
    },
    handler: async (ctx, args) => {
        const note = await ctx.db
            .query('notes')
            .withIndex('by_device_noteId', (q) =>
                q.eq('deviceId', args.deviceId).eq('noteId', args.noteId)
            )
            .first();

        if (note) {
            await ctx.db.patch(note._id, {
                deleted: true,
                deletedAt: args.deletedAt,
                updatedAt: args.deletedAt,
            });
        }
    },
});

/**
 * Permanently delete a note (hard delete)
 */
export const hardDeleteNote = mutation({
    args: {
        noteId: v.string(),
        deviceId: v.string(),
    },
    handler: async (ctx, args) => {
        const note = await ctx.db
            .query('notes')
            .withIndex('by_device_noteId', (q) =>
                q.eq('deviceId', args.deviceId).eq('noteId', args.noteId)
            )
            .first();

        if (note) {
            await ctx.db.delete(note._id);
        }
    },
});

/**
 * Restore a note from trash
 */
export const restoreNote = mutation({
    args: {
        noteId: v.string(),
        deviceId: v.string(),
        updatedAt: v.number(),
        folder: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const note = await ctx.db
            .query('notes')
            .withIndex('by_device_noteId', (q) =>
                q.eq('deviceId', args.deviceId).eq('noteId', args.noteId)
            )
            .first();

        if (note) {
            await ctx.db.patch(note._id, {
                deleted: false,
                deletedAt: undefined,
                updatedAt: args.updatedAt,
                folder: args.folder,
            });
        }
    },
});

/**
 * Update note folder
 */
export const moveNote = mutation({
    args: {
        noteId: v.string(),
        deviceId: v.string(),
        folder: v.optional(v.string()),
        updatedAt: v.number(),
    },
    handler: async (ctx, args) => {
        const note = await ctx.db
            .query('notes')
            .withIndex('by_device_noteId', (q) =>
                q.eq('deviceId', args.deviceId).eq('noteId', args.noteId)
            )
            .first();

        if (note) {
            await ctx.db.patch(note._id, {
                folder: args.folder || undefined,
                updatedAt: args.updatedAt,
            });
        }
    },
});

/**
 * Get all notes for a device (active notes only)
 */
export const getActiveNotes = query({
    args: {
        deviceId: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('notes')
            .withIndex('by_device_deleted', (q) =>
                q.eq('deviceId', args.deviceId).eq('deleted', false)
            )
            .collect();
    },
});

/**
 * Get all notes for a device (including deleted/trash)
 */
export const getAllNotes = query({
    args: {
        deviceId: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('notes')
            .withIndex('by_device', (q) => q.eq('deviceId', args.deviceId))
            .collect();
    },
});

/**
 * Get trash notes for a device
 */
export const getTrashNotes = query({
    args: {
        deviceId: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('notes')
            .withIndex('by_device_deleted', (q) =>
                q.eq('deviceId', args.deviceId).eq('deleted', true)
            )
            .collect();
    },
});

/**
 * Get notes updated after a timestamp (for delta sync)
 */
export const getNotesAfterTimestamp = query({
    args: {
        deviceId: v.string(),
        timestamp: v.number(),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('notes')
            .withIndex('by_device_updated', (q) =>
                q.eq('deviceId', args.deviceId).gt('updatedAt', args.timestamp)
            )
            .collect();
    },
});

/**
 * Bulk upsert notes (for initial sync or batch operations)
 */
export const bulkUpsertNotes = mutation({
    args: {
        notes: v.array(noteValidator),
    },
    handler: async (ctx, args) => {
        const results = [];

        for (const note of args.notes) {
            const existing = await ctx.db
                .query('notes')
                .withIndex('by_device_noteId', (q) =>
                    q.eq('deviceId', note.deviceId).eq('noteId', note.noteId)
                )
                .first();

            if (existing) {
                if (note.updatedAt > existing.updatedAt) {
                    await ctx.db.patch(existing._id, {
                        encryptedContent: note.encryptedContent,
                        encryptedTitle: note.encryptedTitle,
                        updatedAt: note.updatedAt,
                        deleted: note.deleted,
                        deletedAt: note.deletedAt,
                        folder: note.folder,
                        metadata: note.metadata,
                    });
                }
                results.push(existing._id);
            } else {
                const id = await ctx.db.insert('notes', note);
                results.push(id);
            }
        }

        return results;
    },
});

/**
 * Clear all notes for a device (for full sync reset)
 */
export const clearAllNotes = mutation({
    args: {
        deviceId: v.string(),
    },
    handler: async (ctx, args) => {
        const notes = await ctx.db
            .query('notes')
            .withIndex('by_device', (q) => q.eq('deviceId', args.deviceId))
            .collect();

        for (const note of notes) {
            await ctx.db.delete(note._id);
        }

        return notes.length;
    },
});

/**
 * Cleanup old trash (30-day auto-delete)
 * This should be called periodically (e.g., via cron job)
 */
export const cleanupOldTrash = mutation({
    args: {
        deviceId: v.string(),
        olderThan: v.number(), // Timestamp threshold
    },
    handler: async (ctx, args) => {
        const oldTrash = await ctx.db
            .query('notes')
            .withIndex('by_device_deleted', (q) =>
                q.eq('deviceId', args.deviceId).eq('deleted', true)
            )
            .filter((q) =>
                q.and(
                    q.neq(q.field('deletedAt'), undefined),
                    q.lt(q.field('deletedAt'), args.olderThan)
                )
            )
            .collect();

        let deletedCount = 0;
        for (const note of oldTrash) {
            await ctx.db.delete(note._id);
            deletedCount++;
        }

        return deletedCount;
    },
});
