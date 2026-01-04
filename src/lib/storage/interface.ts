/**
 * Storage Provider Interface
 * Abstract interface for pluggable storage backends (IndexedDB, Convex)
 */

import { EncryptedData } from '../crypto';

/**
 * Encrypted note structure stored in database
 */
export interface EncryptedNote {
    id: string; // UUID v4
    seedId: string; // Renamed from deviceId: Derived from seed phrase, identifies the "user"
    encryptedContent: EncryptedData;
    encryptedTitle: EncryptedData;
    encryptedFolder?: EncryptedData; // Encrypted folder name
    timestamp: number; // Created at (Unix ms)
    updatedAt: number; // Last updated (Unix ms)
    deleted: boolean; // Soft delete for sync
    deletedAt?: number; // Timestamp when deleted (for 30-day cleanup)
    synced: boolean; // Has been synced to remote
    baseHash?: string; // Content hash of the version we last synced from
    conflictData?: EncryptedData; // Encrypted content of the remote version if conflict exists
    metadata: {
        size: number; // Plaintext size in bytes
        contentHash: string; // SHA-256 of plaintext
    };
}

/**
 * Sync status for UI display
 */
export type SyncStatus = 'local' | 'syncing' | 'synced' | 'error';

/**
 * Storage provider interface
 * All storage backends must implement this interface
 */
export interface StorageProvider {
    // Lifecycle
    initialize(): Promise<void>;
    close(): Promise<void>;

    // CRUD operations
    saveNote(note: EncryptedNote): Promise<string>;
    getNote(id: string): Promise<EncryptedNote | null>;
    getAllNotes(): Promise<EncryptedNote[]>;
    updateNote(id: string, updates: Partial<EncryptedNote>): Promise<void>;
    deleteNote(id: string): Promise<void>; // Soft delete
    hardDeleteNote(id: string): Promise<void>; // Permanent delete

    // Query operations
    getNotesByDateRange(start: Date, end: Date): Promise<EncryptedNote[]>;
    getUnsyncedNotes(): Promise<EncryptedNote[]>;

    // Batch operations
    bulkSave(notes: EncryptedNote[]): Promise<string[]>;
    bulkDelete(ids: string[]): Promise<void>;
    clearAllNotesForSeed(seedId: string): Promise<void>;

    // Sync operations
    markAsSynced(id: string): Promise<void>;
    getNotesAfterTimestamp(timestamp: number): Promise<EncryptedNote[]>;

    // Portability
    exportAll(): Promise<Blob>;
    importAll(data: Blob): Promise<void>;
}

/**
 * Create a new note ID
 */
export function createNoteId(): string {
    return crypto.randomUUID();
}
