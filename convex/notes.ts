/**
 * Convex Notes API
 * Mutations and queries for encrypted notes
 */

import { mutation, query } from './_generated/server';
import { v } from 'convex/values';

/**
 * Upsert a note (create or update)
 */
export const upsertNote = mutation({
    args: {
        noteId: v.string(),
        deviceId: v.string(),
        encryptedContent: v.string(),
        encryptedTitle: v.string(),
        createdAt: v.number(),
        updatedAt: v.number(),
        deleted: v.boolean(),
        metadata: v.object({
            size: v.number(),
            contentHash: v.string(),
        }),
    },
    handler: async (ctx, args) => {
        // Check if note already exists
        const existing = await ctx.db
            .query('notes')
            .withIndex('by_noteId', (q) => q.eq('noteId', args.noteId))
            .first();

        if (existing) {
            // Only update if incoming is newer (last-write-wins)
            if (args.updatedAt > existing.updatedAt) {
                await ctx.db.patch(existing._id, {
                    encryptedContent: args.encryptedContent,
                    encryptedTitle: args.encryptedTitle,
                    updatedAt: args.updatedAt,
                    deleted: args.deleted,
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
 * Soft delete a note
 */
export const deleteNote = mutation({
    args: {
        noteId: v.string(),
        updatedAt: v.number(),
    },
    handler: async (ctx, args) => {
        const note = await ctx.db
            .query('notes')
            .withIndex('by_noteId', (q) => q.eq('noteId', args.noteId))
            .first();

        if (note && args.updatedAt > note.updatedAt) {
            await ctx.db.patch(note._id, {
                deleted: true,
                updatedAt: args.updatedAt,
            });
        }
    },
});

/**
 * Get all notes for a device
 */
export const getNotesByDevice = query({
    args: {
        deviceId: v.string(),
    },
    handler: async (ctx, args) => {
        return await ctx.db
            .query('notes')
            .withIndex('by_device', (q) => q.eq('deviceId', args.deviceId))
            .filter((q) => q.eq(q.field('deleted'), false))
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
        // Get all notes for this device updated after timestamp
        return await ctx.db
            .query('notes')
            .withIndex('by_device_updated', (q) =>
                q.eq('deviceId', args.deviceId).gt('updatedAt', args.timestamp)
            )
            .collect();
    },
});

/**
 * Get all notes (for initial sync)
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
 * Bulk upsert notes
 */
export const bulkUpsertNotes = mutation({
    args: {
        notes: v.array(
            v.object({
                noteId: v.string(),
                deviceId: v.string(),
                encryptedContent: v.string(),
                encryptedTitle: v.string(),
                createdAt: v.number(),
                updatedAt: v.number(),
                deleted: v.boolean(),
                metadata: v.object({
                    size: v.number(),
                    contentHash: v.string(),
                }),
            })
        ),
    },
    handler: async (ctx, args) => {
        for (const note of args.notes) {
            const existing = await ctx.db
                .query('notes')
                .withIndex('by_noteId', (q) => q.eq('noteId', note.noteId))
                .first();

            if (existing) {
                if (note.updatedAt > existing.updatedAt) {
                    await ctx.db.patch(existing._id, {
                        encryptedContent: note.encryptedContent,
                        encryptedTitle: note.encryptedTitle,
                        updatedAt: note.updatedAt,
                        deleted: note.deleted,
                        metadata: note.metadata,
                    });
                }
            } else {
                await ctx.db.insert('notes', note);
            }
        }
    },
});
