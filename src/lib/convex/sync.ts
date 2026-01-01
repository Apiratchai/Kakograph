'use client';

/**
 * Convex Sync Service
 * Handles bidirectional sync between IndexedDB (local) and Convex (remote)
 */

import { api } from '../../../convex/_generated/api';
import { useConvexConfig } from './provider';
import { useCallback, useEffect, useRef, useState } from 'react';
import { EncryptedNote } from '../storage/interface';
import { v4 as uuidv4 } from 'uuid';

// How often to check for remote updates (ms)
const SYNC_INTERVAL = 5000; // 5 seconds

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
    const { config, client, reportConnectionError, reportConnectionSuccess } = useConvexConfig();
    const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastSyncRef = useRef<number>(0);
    const [remoteNotes, setRemoteNotes] = useState<any[]>([]);

    // Determine if sync is enabled
    // Note: client might be null if mode is disabled
    const isEnabled = config.mode !== 'disabled' && config.isConnected && !!deviceId && !!client && !config.isChecking;

    /**
     * Subscribe to remote notes manually (avoiding useQuery hook which throws without provider)
     */
    useEffect(() => {
        if (!isEnabled || !client || !deviceId) {
            console.log('[Sync] Sync inactive. Reason:', {
                mode: config.mode,
                isConnected: config.isConnected,
                hasClient: !!client,
                hasDeviceId: !!deviceId
            });
            setRemoteNotes([]);
            return;
        }

        console.log('[Sync] Starting watch for device:', deviceId);
        // Create a watcher for the query
        const watch = client.watchQuery(api.notes.getAllNotes, { deviceId });

        // Subscribe to updates
        const unsubscribe = watch.onUpdate(() => {
            const currentNotes = watch.localQueryResult();
            console.log('[Sync] Received update. Notes count:', currentNotes?.length);
            if (currentNotes !== undefined) {
                setRemoteNotes(currentNotes);
            }
        });

        // Initial fetch
        const current = watch.localQueryResult();
        if (current) setRemoteNotes(current);

        return () => {
            console.log('[Sync] Stopping watch');
            unsubscribe();
        };
    }, [isEnabled, client, deviceId]);


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
        if (!isEnabled || !client) return;

        try {
            await client.mutation(api.notes.upsertNote, toConvexFormat(note));
        } catch (error) {
            console.error('Failed to push note to Convex:', error);
            reportConnectionError();
            throw error;
        }
    }, [isEnabled, client, toConvexFormat]);

    /**
     * Push all unsynced notes to Convex
     */
    const pushAllUnsynced = useCallback(async (notes: EncryptedNote[]) => {
        if (!isEnabled || !client) return;

        if (!isEnabled || !client) return;

        // Trust the caller (fullSync) - if passed here, it needs pushing regardless of synced flag
        if (notes.length === 0) return;

        console.log(`[Sync] Pushing batch of ${notes.length} notes to Cloud`);

        try {
            await client.mutation(api.notes.bulkUpsertNotes, {
                notes: notes.map(toConvexFormat),
            });
        } catch (error) {
            console.error('Failed to bulk push notes to Convex:', error);
            reportConnectionError();
            throw error;
        }
    }, [isEnabled, client, toConvexFormat]);

    /**
     * Soft delete a note on Convex
     */
    const pushDelete = useCallback(async (noteId: string, deletedAt: number) => {
        if (!isEnabled || !deviceId || !client) return;

        try {
            await client.mutation(api.notes.softDeleteNote, { noteId, deviceId, deletedAt });
        } catch (error) {
            console.error('Failed to push delete to Convex:', error);
            reportConnectionError();
            throw error;
        }
    }, [isEnabled, deviceId, client]);

    // Track pending hard deletes to avoid pulling them back during sync
    const pendingHardDeletes = useRef<Set<string>>(new Set());

    /**
     * Hard delete a note on Convex
     */
    const pushHardDelete = useCallback(async (noteId: string) => {
        if (!isEnabled || !deviceId || !client) return;

        pendingHardDeletes.current.add(noteId);
        try {
            await client.mutation(api.notes.hardDeleteNote, { noteId, deviceId });
        } catch (error) {
            console.error('Failed to push hard delete to Convex:', error);
            pendingHardDeletes.current.delete(noteId);
            reportConnectionError();
            throw error;
        }
    }, [isEnabled, deviceId, client]);

    /**
     * Restore a note on Convex
     */
    const pushRestore = useCallback(async (noteId: string, folder?: string) => {
        if (!isEnabled || !deviceId || !client) return;

        try {
            await client.mutation(api.notes.restoreNote, {
                noteId,
                deviceId,
                updatedAt: Date.now(),
                folder,
            });
        } catch (error) {
            console.error('Failed to push restore to Convex:', error);
            reportConnectionError();
            throw error;
        }
    }, [isEnabled, deviceId, client]);

    /**
     * Full sync: merge local and remote notes
     * Uses last-write-wins conflict resolution
     */
    const fullSync = useCallback(async () => {
        if (!isEnabled || !client || !deviceId) return;

        console.log('[Sync] Running full sync cycle');

        // 1. Use localNotes from prop (already fresh from useNotes hook)
        const localMap = new Map(localNotes.map(n => [n.id, n]));

        // 2. Fetch latest from Cloud (Polling fallback)
        // This ensures sync works even if WebSocket live updates fail
        let fetchedRemotes: any[] = [];
        try {
            fetchedRemotes = await client.query(api.notes.getAllNotes, { deviceId });
            // Update state for UI debugging
            setRemoteNotes(fetchedRemotes);
        } catch (err) {
            console.error('[Sync] Failed to poll remote:', err);
            // Report error to provider to stop the loop
            reportConnectionError();
            return;
        }

        const toUpdateLocal: EncryptedNote[] = [];
        const toUpdateRemote: EncryptedNote[] = [];

        // Check each remote note
        for (const remote of fetchedRemotes) {
            // Skip notes that we are currently hard-deleting
            if (pendingHardDeletes.current.has(remote.noteId)) {
                console.log(`[Sync] Skipping remote note ${remote.noteId.slice(0, 6)} - pending hard delete`);
                continue;
            }

            const local = localMap.get(remote.noteId);
            if (!local) {
                // Remote note doesn't exist locally, add it
                toUpdateLocal.push(fromConvexFormat(remote));
            } else if (remote.updatedAt > local.updatedAt) {
                // Remote is newer.
                // CHECK FOR CONFLICT: If local has unsynced changes (synced = false), we have a conflict.
                if (!local.synced) {
                    console.warn('[Sync] CONFLICT DETECTED for', local.id);

                    // 1. Preserve local changes as a NEW note in "Conflicts" folder
                    const conflictNote: EncryptedNote = {
                        ...local,
                        id: uuidv4(),
                        folder: 'Conflicts',
                        synced: false, // Mark as unsynced so it gets pushed to remote as a new note
                        timestamp: Date.now()
                        // encryption remains valid as key is same
                    };

                    // Add the conflict copy to local DB (which will eventually sync up)
                    toUpdateLocal.push(conflictNote);

                    // 2. Overwrite original note with Remote version
                    console.log(`[Sync] resolving conflict: ${local.id} -> Remote wins, local moved to Conflicts`);
                    toUpdateLocal.push(fromConvexFormat(remote));

                } else {
                    console.log(`[Sync] Update found for ${remote.noteId.slice(0, 6)}. Remote: ${remote.updatedAt}, Local: ${local.updatedAt}`);
                    // Remote is newer, update local
                    toUpdateLocal.push(fromConvexFormat(remote));
                }
            } else if (local.updatedAt > remote.updatedAt) {
                // Local is newer, update remote
                toUpdateRemote.push(local);
            }
        }

        // 3. Clear pending deletes that are no longer in remote
        const remoteIdSet = new Set(fetchedRemotes.map(n => n.noteId));
        for (const id of pendingHardDeletes.current) {
            if (!remoteIdSet.has(id)) {
                pendingHardDeletes.current.delete(id);
            }
        }

        console.log(`[Sync] Decisions - LocalUp: ${toUpdateLocal.length}, RemoteUp: ${toUpdateRemote.length}`);

        // Check for local notes not in remote
        for (const local of localNotes) {
            if (!remoteIdSet.has(local.id)) {
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

        // Report success to provider to reset any error backoffs
        reportConnectionSuccess();

        lastSyncRef.current = Date.now();
    }, [isEnabled, remoteNotes, localNotes, fromConvexFormat, onRemoteUpdate, pushAllUnsynced, reportConnectionSuccess]);

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
        remoteNotes: remoteNotes.map(fromConvexFormat),
    };
}
