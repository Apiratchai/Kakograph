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
    seedId: string | null,
    localNotes: EncryptedNote[],
    onRemoteUpdate: (notes: EncryptedNote[]) => void,
    localMarkAsSynced: (ids: string[]) => Promise<void>
) {
    const { config, client, reportConnectionError, reportConnectionSuccess } = useConvexConfig();
    const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const lastSyncRef = useRef<number>(0);
    const [remoteNotes, setRemoteNotes] = useState<any[]>([]);

    // Determine if sync is enabled
    // Note: client might be null if mode is disabled
    // We do NOT pause sync during 'isChecking' (HTTP ping), as that tears down the interface.
    const isEnabled = config.mode !== 'disabled' && config.isConnected && !!seedId && !!client;

    /**
     * Subscribe to remote notes manually (avoiding useQuery hook which throws without provider)
     */
    useEffect(() => {
        if (!isEnabled || !client || !seedId) {
            console.log('[Sync] Sync inactive. Reason:', {
                mode: config.mode,
                isConnected: config.isConnected,
                hasClient: !!client,
                hasSeedId: !!seedId
            });
            setRemoteNotes([]);
            return;
        }

        console.log('[Sync] Starting watch for seed:', seedId);
        // Create a watcher for the query
        const watch = client.watchQuery(api.notes.getAllNotes, { seedId });

        // Subscribe to updates
        const unsubscribe = watch.onUpdate(() => {
            const currentNotes = watch.localQueryResult();
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
    }, [isEnabled, client, seedId]);


    /**
     * Convert local EncryptedNote to Convex format
     */
    const toConvexFormat = useCallback((note: EncryptedNote) => ({
        noteId: note.id,
        seedId: note.seedId,
        encryptedContent: JSON.stringify(note.encryptedContent),
        encryptedTitle: JSON.stringify(note.encryptedTitle),
        encryptedFolder: note.encryptedFolder ? JSON.stringify(note.encryptedFolder) : undefined,
        timestamp: note.timestamp,
        updatedAt: note.updatedAt,
        deleted: note.deleted,
        deletedAt: note.deletedAt,
        metadata: note.metadata,
    }), []);

    /**
     * Convert Convex note to local EncryptedNote format
     */
    const fromConvexFormat = useCallback((note: {
        noteId: string;
        seedId: string;
        encryptedContent: string;
        encryptedTitle: string;
        encryptedFolder?: string;
        timestamp: number;
        updatedAt: number;
        deleted: boolean;
        deletedAt?: number;
        metadata: { size: number; contentHash: string };
    }): EncryptedNote => ({
        id: note.noteId,
        seedId: note.seedId,
        encryptedContent: JSON.parse(note.encryptedContent),
        encryptedTitle: JSON.parse(note.encryptedTitle),
        encryptedFolder: note.encryptedFolder ? JSON.parse(note.encryptedFolder) : undefined,
        timestamp: note.timestamp,
        updatedAt: note.updatedAt,
        deleted: note.deleted,
        deletedAt: note.deletedAt,
        synced: true,
        // When coming from Convex, this content is the "Base State" for next edit
        baseHash: note.metadata.contentHash,
        metadata: note.metadata,
    }), []);

    /**
     * Push a single note to Convex
     */
    const pushNote = useCallback(async (note: EncryptedNote) => {
        if (!isEnabled || !client) return;

        try {
            await client.mutation(api.notes.upsertNote, toConvexFormat(note));
            // Mark as synced locally so we don't conflict with our own echo
            await localMarkAsSynced([note.id]);
        } catch (error) {
            console.error('Failed to push note to Convex:', error);
            reportConnectionError();
            throw error;
        }
    }, [isEnabled, client, toConvexFormat, localMarkAsSynced]);

    /**
     * Push all unsynced notes to Convex
     */
    const pushAllUnsynced = useCallback(async (notes: EncryptedNote[]) => {
        if (!isEnabled || !client) return;

        // Trust the caller (fullSync) - if passed here, it needs pushing regardless of synced flag
        if (notes.length === 0) return;

        console.log(`[Sync] Pushing batch of ${notes.length} notes to Cloud`);

        try {
            await client.mutation(api.notes.bulkUpsertNotes, {
                notes: notes.map(toConvexFormat),
            });
            // Mark all as synced
            await localMarkAsSynced(notes.map(n => n.id));
        } catch (error) {
            console.error('Failed to bulk push notes to Convex:', error);
            reportConnectionError();
            throw error;
        }
    }, [isEnabled, client, toConvexFormat, localMarkAsSynced]);

    /**
     * Soft delete a note on Convex
     */
    const pushDelete = useCallback(async (noteId: string, deletedAt: number) => {
        if (!isEnabled || !seedId || !client) return;

        try {
            await client.mutation(api.notes.softDeleteNote, { noteId, seedId, deletedAt });
        } catch (error) {
            console.error('Failed to push delete to Convex:', error);
            reportConnectionError();
            throw error;
        }
    }, [isEnabled, seedId, client]);

    // Track pending hard deletes to avoid pulling them back during sync
    const pendingHardDeletes = useRef<Set<string>>(new Set());

    /**
     * Hard delete a note on Convex
     */
    const pushHardDelete = useCallback(async (noteId: string) => {
        if (!isEnabled || !seedId || !client) return;

        pendingHardDeletes.current.add(noteId);
        try {
            await client.mutation(api.notes.hardDeleteNote, { noteId, seedId });
        } catch (error) {
            console.error('Failed to push hard delete to Convex:', error);
            pendingHardDeletes.current.delete(noteId);
            reportConnectionError();
            throw error;
        }
    }, [isEnabled, seedId, client]);

    /**
     * Bulk Hard Delete
     */
    const pushBulkHardDelete = useCallback(async (noteIds: string[]) => {
        if (!isEnabled || !seedId || !client || noteIds.length === 0) return;

        // Mark all as pending delete to prevent re-sync
        noteIds.forEach(id => pendingHardDeletes.current.add(id));

        try {
            await client.mutation(api.notes.bulkHardDeleteNotes, { noteIds, seedId });
        } catch (error) {
            console.error('Failed to push bulk hard delete:', error);
            // On failure, remove from pending so they might get synced back or retried
            noteIds.forEach(id => pendingHardDeletes.current.delete(id));
            reportConnectionError();
            throw error;
        }
    }, [isEnabled, seedId, client]);

    /**
     * Restore a note on Convex
     */
    const pushRestore = useCallback(async (noteId: string) => {
        if (!isEnabled || !seedId || !client) return;

        try {
            // Restore: we don't change folder here as we can't encrypt it without key. 
            // It stays in original encrypted folder state.
            await client.mutation(api.notes.restoreNote, {
                noteId,
                seedId,
                updatedAt: Date.now(),
            });
        } catch (error) {
            console.error('Failed to push restore to Convex:', error);
            reportConnectionError();
            throw error;
        }
    }, [isEnabled, seedId, client]);

    /**
     * Full sync: merge local and remote notes
     * Uses last-write-wins conflict resolution
     */
    const fullSync = useCallback(async () => {
        if (!isEnabled || !client || !seedId) return;

        // 1. Use localNotes from prop (already fresh from useNotes hook)
        const localMap = new Map(localNotes.map(n => [n.id, n]));

        // 2. Fetch latest from Cloud (Polling fallback)
        let fetchedRemotes: any[] = [];
        try {
            fetchedRemotes = await client.query(api.notes.getAllNotes, { seedId });
            // Update state for UI debugging
            setRemoteNotes(fetchedRemotes);
        } catch (err) {
            console.error('[Sync] Failed to poll remote:', err);
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
                // ... (existing conflict check logic) ...
                const isConflict = !local.synced && local.baseHash !== remote.metadata.contentHash;

                if (isConflict) {
                    // ... (existing conflict handling) ...
                    console.warn('[Sync] CONFLICT DETECTED for', local.id);
                    const conflictUpdate: EncryptedNote = {
                        ...local,
                        conflictData: JSON.parse(remote.encryptedContent),
                        synced: false,
                    };
                    toUpdateLocal.push(conflictUpdate);
                } else {
                    // Safe update
                    toUpdateLocal.push(fromConvexFormat(remote));
                }
            } else if (local.updatedAt > remote.updatedAt) {
                // Local is newer
                if (!local.synced) {
                    // Only push if we explicitly have unsynced changes
                    toUpdateRemote.push(local);
                }
                // If local.synced is true, it means we just pushed it but Remote Subscription hasn't caught up yet.
                // Do NOT push again (breaks the loop).
            } else {
                // Timestamps equal - assume synced?
                // console.log(`[Sync] Note ${local.id.slice(0,6)} is up to date.`);
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
        lastSyncRef.current = Date.now();
    }, [isEnabled, remoteNotes, localNotes, fromConvexFormat, onRemoteUpdate, pushAllUnsynced, reportConnectionSuccess, localMarkAsSynced]);

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
        pushBulkHardDelete,
        pushRestore,
        fullSync,
        remoteNotes: remoteNotes.map(fromConvexFormat),
    };
}
