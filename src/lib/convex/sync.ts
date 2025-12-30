'use client';

/**
 * Convex Sync Service
 * Handles bidirectional sync between IndexedDB (local) and Convex (remote)
 */

import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { useConvexConfig } from './provider';
import { useCallback, useEffect, useRef } from 'react';
import { EncryptedNote } from '../storage/interface';

// How often to check for remote updates (ms)
const SYNC_INTERVAL = 30000; // 30 seconds

export interface SyncState {
    lastSyncTime: number;
    isSyncing: boolean;
    error: string | null;
}

/**
 * Hook to sync notes with Convex
 * Returns sync functions and state
 */
export function useConvexSync(
    deviceId: string | null,
    localNotes: EncryptedNote[],
    onRemoteUpdate: (notes: EncryptedNote[]) => void
) {
    const { config, client } = useConvexConfig();
    const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastSyncRef = useRef<number>(0);

    // Only use Convex hooks when connected
    const isEnabled = config.mode !== 'disabled' && config.isConnected && !!deviceId && !!client;

    // Convex mutations (only call when enabled)
    const upsertNote = useMutation(api.notes.upsertNote);
    const bulkUpsert = useMutation(api.notes.bulkUpsertNotes);
    const softDelete = useMutation(api.notes.softDeleteNote);
    const hardDelete = useMutation(api.notes.hardDeleteNote);
    const restoreNote = useMutation(api.notes.restoreNote);

    // Convex queries
    const remoteNotes = useQuery(
        api.notes.getAllNotes,
        isEnabled ? { deviceId: deviceId! } : 'skip'
    );

    /**
     * Convert local EncryptedNote to Convex format
     */
    const toConvexFormat = useCallback((note: EncryptedNote) => ({
        noteId: note.id,
        deviceId: note.deviceId,
        encryptedContent: JSON.stringify(note.encryptedContent),
        encryptedTitle: JSON.stringify(note.encryptedTitle),
        timestamp: note.timestamp,
        updatedAt: note.updatedAt,
        deleted: note.deleted,
        deletedAt: note.deletedAt,
        folder: note.folder,
        metadata: note.metadata,
    }), []);

    /**
     * Convert Convex note to local EncryptedNote format
     */
    const fromConvexFormat = useCallback((note: {
        noteId: string;
        deviceId: string;
        encryptedContent: string;
        encryptedTitle: string;
        timestamp: number;
        updatedAt: number;
        deleted: boolean;
        deletedAt?: number;
        folder?: string;
        metadata: { size: number; contentHash: string };
    }): EncryptedNote => ({
        id: note.noteId,
        deviceId: note.deviceId,
        encryptedContent: JSON.parse(note.encryptedContent),
        encryptedTitle: JSON.parse(note.encryptedTitle),
        timestamp: note.timestamp,
        updatedAt: note.updatedAt,
        deleted: note.deleted,
        deletedAt: note.deletedAt,
        folder: note.folder,
        synced: true,
        metadata: note.metadata,
    }), []);

    /**
     * Push a single note to Convex
     */
    const pushNote = useCallback(async (note: EncryptedNote) => {
        if (!isEnabled) return;

        try {
            await upsertNote(toConvexFormat(note));
        } catch (error) {
            console.error('Failed to push note to Convex:', error);
            throw error;
        }
    }, [isEnabled, upsertNote, toConvexFormat]);

    /**
     * Push all unsynced notes to Convex
     */
    const pushAllUnsynced = useCallback(async (notes: EncryptedNote[]) => {
        if (!isEnabled) return;

        const unsynced = notes.filter(n => !n.synced);
        if (unsynced.length === 0) return;

        try {
            await bulkUpsert({
                notes: unsynced.map(toConvexFormat),
            });
        } catch (error) {
            console.error('Failed to bulk push notes to Convex:', error);
            throw error;
        }
    }, [isEnabled, bulkUpsert, toConvexFormat]);

    /**
     * Soft delete a note on Convex
     */
    const pushDelete = useCallback(async (noteId: string, deletedAt: number) => {
        if (!isEnabled || !deviceId) return;

        try {
            await softDelete({ noteId, deviceId, deletedAt });
        } catch (error) {
            console.error('Failed to push delete to Convex:', error);
            throw error;
        }
    }, [isEnabled, deviceId, softDelete]);

    /**
     * Hard delete a note on Convex
     */
    const pushHardDelete = useCallback(async (noteId: string) => {
        if (!isEnabled || !deviceId) return;

        try {
            await hardDelete({ noteId, deviceId });
        } catch (error) {
            console.error('Failed to push hard delete to Convex:', error);
            throw error;
        }
    }, [isEnabled, deviceId, hardDelete]);

    /**
     * Restore a note on Convex
     */
    const pushRestore = useCallback(async (noteId: string, folder?: string) => {
        if (!isEnabled || !deviceId) return;

        try {
            await restoreNote({
                noteId,
                deviceId,
                updatedAt: Date.now(),
                folder,
            });
        } catch (error) {
            console.error('Failed to push restore to Convex:', error);
            throw error;
        }
    }, [isEnabled, deviceId, restoreNote]);

    /**
     * Full sync: merge local and remote notes
     * Uses last-write-wins conflict resolution
     */
    const fullSync = useCallback(async () => {
        if (!isEnabled || !remoteNotes) return;

        const localMap = new Map(localNotes.map(n => [n.id, n]));
        const remoteMap = new Map(remoteNotes.map(n => [n.noteId, n]));

        const toUpdateLocal: EncryptedNote[] = [];
        const toUpdateRemote: EncryptedNote[] = [];

        // Check each remote note
        for (const remote of remoteNotes) {
            const local = localMap.get(remote.noteId);
            if (!local) {
                // Remote note doesn't exist locally, add it
                toUpdateLocal.push(fromConvexFormat(remote));
            } else if (remote.updatedAt > local.updatedAt) {
                // Remote is newer, update local
                toUpdateLocal.push(fromConvexFormat(remote));
            } else if (local.updatedAt > remote.updatedAt) {
                // Local is newer, update remote
                toUpdateRemote.push(local);
            }
        }

        // Check for local notes not in remote
        for (const local of localNotes) {
            if (!remoteMap.has(local.id)) {
                toUpdateRemote.push(local);
            }
        }

        // Apply updates
        if (toUpdateLocal.length > 0) {
            onRemoteUpdate(toUpdateLocal);
        }

        if (toUpdateRemote.length > 0) {
            await pushAllUnsynced(toUpdateRemote);
        }

        lastSyncRef.current = Date.now();
    }, [isEnabled, remoteNotes, localNotes, fromConvexFormat, onRemoteUpdate, pushAllUnsynced]);

    // Auto-sync on interval when enabled
    useEffect(() => {
        if (isEnabled) {
            // Initial sync
            fullSync();

            // Set up interval
            syncIntervalRef.current = setInterval(() => {
                fullSync();
            }, SYNC_INTERVAL);

            return () => {
                if (syncIntervalRef.current) {
                    clearInterval(syncIntervalRef.current);
                }
            };
        }
    }, [isEnabled, fullSync]);

    return {
        isEnabled,
        pushNote,
        pushAllUnsynced,
        pushDelete,
        pushHardDelete,
        pushRestore,
        fullSync,
        remoteNotes: remoteNotes ? remoteNotes.map(fromConvexFormat) : [],
    };
}
