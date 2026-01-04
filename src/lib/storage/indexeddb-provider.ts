/**
 * IndexedDB Storage Provider
 * Local-first storage implementation using Dexie.js
 */

import { v4 as uuidv4 } from 'uuid';
import { getDB, requestPersistentStorage } from '../db/schema';
import { EncryptedNote, StorageProvider } from './interface';

// Singleton instance
let providerInstance: IndexedDBProvider | null = null;

export class IndexedDBProvider implements StorageProvider {
    private initialized = false;

    static getInstance(): IndexedDBProvider {
        if (!providerInstance) {
            providerInstance = new IndexedDBProvider();
        }
        return providerInstance;
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;

        // Request persistent storage
        requestPersistentStorage().then(granted => {
            console.log(`[Storage] Persistent status: ${granted ? 'GRANTED' : 'DENIED/UNSUPPORTED'}`);
        }).catch(err => console.error('[Storage] Persistent error:', err));

        // Open the database
        const db = getDB();
        await db.open();

        // Migration: detailed deviceId -> seedId
        try {
            await db.notes
                .filter((node: any) => !!node.deviceId && !node.seedId)
                .modify((note: any) => {
                    note.seedId = note.deviceId;
                });
        } catch (err) {
            console.error('[Storage] Migration failed:', err);
        }

        this.initialized = true;
    }

    async close(): Promise<void> {
        getDB().close();
        this.initialized = false;
    }

    async saveNote(note: EncryptedNote): Promise<string> {
        const db = getDB();
        await db.notes.put(note);

        // Add to sync queue
        await db.syncQueue.add({
            id: uuidv4(),
            noteId: note.id,
            operation: 'create',
            timestamp: Date.now(),
        });

        return note.id;
    }

    async getNote(id: string): Promise<EncryptedNote | null> {
        const db = getDB();
        const note = await db.notes.get(id);
        return note && !note.deleted ? note : null;
    }

    async getAllNotes(): Promise<EncryptedNote[]> {
        const db = getDB();
        // Return ALL notes (including deleted). Filtering is done in the hooks layer.
        const notes = await db.notes.toArray();
        return notes;
    }

    async updateNote(id: string, updates: Partial<EncryptedNote>): Promise<void> {
        const db = getDB();
        await db.notes.update(id, {
            ...updates,
            updatedAt: Date.now(),
            synced: false,
        });

        // Add to sync queue
        await db.syncQueue.add({
            id: uuidv4(),
            noteId: id,
            operation: 'update',
            timestamp: Date.now(),
        });
    }

    async deleteNote(id: string): Promise<void> {
        const db = getDB();
        // Soft delete for sync
        await db.notes.update(id, {
            deleted: true,
            updatedAt: Date.now(),
            synced: false,
        });

        // Add to sync queue
        await db.syncQueue.add({
            id: uuidv4(),
            noteId: id,
            operation: 'delete',
            timestamp: Date.now(),
        });
    }

    // Permanently remove a note from the database
    async hardDeleteNote(id: string): Promise<void> {
        const db = getDB();
        await db.notes.delete(id);
        // Also remove from sync queue
        await db.syncQueue.where('noteId').equals(id).delete();
    }

    async getNotesByDateRange(start: Date, end: Date): Promise<EncryptedNote[]> {
        const db = getDB();
        return await db.notes
            .where('timestamp')
            .between(start.getTime(), end.getTime())
            .and((note) => !note.deleted)
            .toArray();
    }

    async getUnsyncedNotes(): Promise<EncryptedNote[]> {
        const db = getDB();
        const notes = await db.notes.where('synced').equals(0).toArray();
        return notes.filter((note) => !note.deleted || note.deleted);
    }

    async bulkSave(notes: EncryptedNote[]): Promise<string[]> {
        const db = getDB();
        await db.notes.bulkPut(notes);

        // Add unsynced notes to sync queue
        const unsyncedNotes = notes.filter(n => !n.synced);
        if (unsyncedNotes.length > 0) {
            const syncItems = unsyncedNotes.map((note) => ({
                id: uuidv4(),
                noteId: note.id,
                operation: 'create' as const,
                timestamp: Date.now(),
            }));
            await db.syncQueue.bulkAdd(syncItems);
        }

        return notes.map((n) => n.id);
    }

    // Clear all notes for a specific seedId (used for full snapshot restore / full reset)
    async clearAllNotesForSeed(seedId: string): Promise<void> {
        const db = getDB();

        await db.transaction('rw', db.notes, db.syncQueue, async () => {
            // 1. Find all notes belonging to this seed
            const notes = await db.notes.where('seedId').equals(seedId).toArray();
            const noteIds = notes.map(n => n.id);

            // 2. Delete the notes
            await db.notes.where('seedId').equals(seedId).delete();

            // 3. CRITICAL: Clear any pending sync operations for these notes
            // so we don't accidentally push "deletes" or "updates" after we wipe them.
            // Since syncQueue items just have 'noteId', we use the IDs we gathered.
            if (noteIds.length > 0) {
                await db.syncQueue.where('noteId').anyOf(noteIds).delete();
            }
        });
    }

    async bulkDelete(ids: string[]): Promise<void> {
        const db = getDB();
        const now = Date.now();

        await db.transaction('rw', db.notes, db.syncQueue, async () => {
            for (const id of ids) {
                await db.notes.update(id, {
                    deleted: true,
                    updatedAt: now,
                    synced: false,
                });
                await db.syncQueue.add({
                    id: uuidv4(),
                    noteId: id,
                    operation: 'delete',
                    timestamp: now,
                });
            }
        });
    }

    async markAsSynced(id: string): Promise<void> {
        const db = getDB();
        await db.notes.update(id, { synced: true });

        // Remove from sync queue
        await db.syncQueue.where('noteId').equals(id).delete();
    }

    async getNotesAfterTimestamp(timestamp: number): Promise<EncryptedNote[]> {
        const db = getDB();
        return await db.notes
            .where('updatedAt')
            .above(timestamp)
            .toArray();
    }

    async exportAll(): Promise<Blob> {
        const db = getDB();
        const notes = await db.notes.toArray();
        const data = JSON.stringify({
            version: 1,
            exportedAt: Date.now(),
            notes: notes,
        });
        return new Blob([data], { type: 'application/json' });
    }

    async importAll(data: Blob): Promise<void> {
        const text = await data.text();
        const parsed = JSON.parse(text);

        if (parsed.version !== 1) {
            throw new Error(`Unsupported export version: ${parsed.version}`);
        }

        const db = getDB();
        await db.notes.bulkPut(parsed.notes);
    }
}
