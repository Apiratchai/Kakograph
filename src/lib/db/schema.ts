/**
 * Dexie.js Database Schema
 * IndexedDB wrapper for local-first storage
 */

import Dexie, { Table } from 'dexie';
import { EncryptedNote } from '../storage/interface';

/**
 * Auth data stored locally
 */
export interface AuthData {
    key: string;
    encryptedSeed: string; // Seed encrypted with PIN-derived key
    iv: string;
    authTag: string;
    seedId: string; // Renamed from deviceId
}

/**
 * Settings stored locally
 */
export interface SettingsData {
    key: string;
    value: string;
}

/**
 * Sync queue item for pending remote sync
 */
export interface SyncQueueItem {
    id: string;
    noteId: string;
    operation: 'create' | 'update' | 'delete';
    timestamp: number;
}

/**
 * KakographDB - Local database using Dexie.js
 */
export class KakographDB extends Dexie {
    notes!: Table<EncryptedNote>;
    auth!: Table<AuthData>;
    settings!: Table<SettingsData>;
    syncQueue!: Table<SyncQueueItem>;

    constructor() {
        super('KakographDB');

        // Version 2: Renamed deviceId -> seedId, removed folder from index (encrypted)
        this.version(2).stores({
            notes: 'id, timestamp, updatedAt, synced, deleted, deletedAt, seedId',
            auth: 'key', // seedId is stored in content, not indexed here
            settings: 'key',
            syncQueue: 'id, noteId, timestamp',
        }).upgrade(tx => {
            // Migration logic if needed, but we're doing a rewrite
            // Just clearing old table or let it be implies data loss for old schema
            // which is consistent with "overhaul"
        });

        // Keep version 1 for reference/history if browser still has it, but v2 overrides
        this.version(1).stores({
            notes: 'id, timestamp, updatedAt, synced, deleted, deletedAt, folder, deviceId',
            auth: 'key',
            settings: 'key',
            syncQueue: 'id, noteId, timestamp',
        });
    }
}

// Singleton instance
let dbInstance: KakographDB | null = null;

/**
 * Get or create the database instance
 */
export function getDB(): KakographDB {
    if (!dbInstance) {
        dbInstance = new KakographDB();
    }
    return dbInstance;
}

/**
 * Request persistent storage to prevent browser eviction
 */
export async function requestPersistentStorage(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persisted();
        if (isPersisted) return true;

        console.log('[Storage] Requesting persistence...');
        return await navigator.storage.persist();
    }
    return false;
}

/**
 * Get storage usage estimate
 */
export async function getStorageEstimate(): Promise<{ usage: number; quota: number }> {
    if (navigator.storage && navigator.storage.estimate) {
        const estimate = await navigator.storage.estimate();
        return {
            usage: estimate.usage || 0,
            quota: estimate.quota || 0,
        };
    }
    return { usage: 0, quota: 0 };
}
