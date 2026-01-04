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

// PERSISTENT ZOMBIE GUARD: Track pending hard deletes across hook re-initializations.
// This prevents the "Zombie Revival" bug where a hook re-mount clears the memory of what we are deleting.
const globalPendingHardDeletes = new Set<string>();

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

    // Stabilize localNotes via Ref to break the infinite dependency loop in fullSync
    const localNotesRef = useRef<EncryptedNote[]>(localNotes);
    localNotesRef.current = localNotes; // Synchronous update to prevent stale closures during render/sync races

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

    // Refs for callbacks to prevent dependency churn in fullSync
    const onRemoteUpdateRef = useRef(onRemoteUpdate);
    const localMarkAsSyncedRef = useRef(localMarkAsSynced);

    useEffect(() => {
        onRemoteUpdateRef.current = onRemoteUpdate;
        localMarkAsSyncedRef.current = localMarkAsSynced;
    }, [onRemoteUpdate, localMarkAsSynced]);

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
            await localMarkAsSyncedRef.current([note.id]);
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

        // Ensure we don't revive notes that are pending hard delete
        const validNotes = notes.filter(n => !globalPendingHardDeletes.has(n.id));

        if (validNotes.length === 0) return;

        console.log(`[Sync] Pushing batch of ${validNotes.length} notes...`);

        try {
            await client.mutation(api.notes.bulkUpsertNotes, {
                notes: validNotes.map(toConvexFormat),
            });
            // Mark all as synced
            await localMarkAsSyncedRef.current(validNotes.map(n => n.id));
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
        if (!isEnabled || !seedId || !client) return;

        try {
            await client.mutation(api.notes.softDeleteNote, { noteId, seedId, deletedAt });
            // Mark as synced locally so background sync doesn't try to "fix" it (Zombie revival)
            await localMarkAsSyncedRef.current([noteId]);
        } catch (error) {
            console.error('Failed to push delete to Convex:', error);
            reportConnectionError();
            throw error;
        }
    }, [isEnabled, seedId, client]);

    // Track pending hard deletes to avoid pulling them back during sync
    // We use a local ref that mirrors the global one for React responsiveness if needed, 
    // but the source of truth is now the persistent globalPendingHardDeletes.

    /**
     * Hard delete a note on Convex
     */
    const pushHardDelete = useCallback(async (noteId: string) => {
        if (!isEnabled || !seedId || !client) return;

        globalPendingHardDeletes.add(noteId);
        try {
            await client.mutation(api.notes.hardDeleteNote, { noteId, seedId });
        } catch (error) {
            console.error('Failed to push hard delete to Convex:', error);
            globalPendingHardDeletes.delete(noteId);
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
        noteIds.forEach(id => globalPendingHardDeletes.add(id));

        try {
            await client.mutation(api.notes.bulkHardDeleteNotes, { noteIds, seedId });
        } catch (error) {
            console.error('Failed to push bulk hard delete:', error);
            // On failure, remove from pending so they might get synced back or retried
            noteIds.forEach(id => globalPendingHardDeletes.delete(id));
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
            // Mark as synced
            await localMarkAsSyncedRef.current([noteId]);
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
    const fullSync = useCallback(async (passedRemotes?: any[], force = false) => {
        if (!isEnabled || !client || !seedId) return;

        // Check if we already have a sync in progress
        const now = Date.now();
        if (!force && lastSyncRef.current > now - 1500) return; // Increased cooldown to 1.5s
        lastSyncRef.current = now;

        const currentLocalNotes = localNotesRef.current;

        // 1. Prepare Local State (Optimized lookup)
        const idMap = new Map<string, EncryptedNote>();
        for (const note of currentLocalNotes) {
            idMap.set(note.id, note);
        }

        // 2. Determine Remote State (Passed from subscription OR fetched)
        let fetchedRemotes: any[] = passedRemotes || [];
        if (!passedRemotes) {
            try {
                fetchedRemotes = await client.query(api.notes.getAllNotes, { seedId });
                setRemoteNotes(fetchedRemotes);
            } catch (err) {
                console.error('[Sync] Polling failed:', err);
                reportConnectionError();
                return;
            }
        }

        const toUpdateLocal: EncryptedNote[] = [];
        const toUpdateRemote: EncryptedNote[] = [];
        const remoteIdSet = new Set<string>();

        // 3. Process Remote -> Local (Downloads & Conflicts)
        for (const remote of fetchedRemotes) {
            const noteId = remote.noteId;
            remoteIdSet.add(noteId);

            // Safety skip: If we are in the middle of deleting this note, IGNORE whatever the server says.
            // This prevents "Zombie" re-downloads during the 1-2 second propagation delay.
            if (globalPendingHardDeletes.has(noteId)) {
                console.log(`[Sync] Skipping zombie: ${noteId.slice(0, 6)} (Pending Hard Delete)`);
                continue;
            }

            const local = idMap.get(noteId);

            if (!local) {
                // New note on server?

                // CRITICAL: If the server says it's deleted but we don't have it locally,
                // DO NOT download it. This stops the client from reviving "Deleted" server state
                // that doesn't exist in our current view.
                if (remote.deleted) {
                    console.log(`[Sync] Skipping deleted remote note: ${noteId.slice(0, 6)}`);
                    continue;
                }

                toUpdateLocal.push(fromConvexFormat(remote));
            } else if (remote.updatedAt > local.updatedAt) {
                // Server is newer -> Conflict or Download
                const isConflict = !local.synced && local.baseHash !== remote.metadata.contentHash;

                if (isConflict) {
                    console.warn(`[Sync] Conflict: ${noteId.slice(0, 6)}`);
                    toUpdateLocal.push({
                        ...local,
                        conflictData: JSON.parse(remote.encryptedContent),
                        synced: false,
                    });
                } else {
                    // Safe update
                    toUpdateLocal.push(fromConvexFormat(remote));
                }
            } else if (local.updatedAt > remote.updatedAt) {
                // Local is newer -> Prepare to push
                if (!local.synced) {
                    toUpdateRemote.push(local);
                }
            }
        }

        // 4. Process Local -> Remote (Uploads for notes not on server)
        for (const local of currentLocalNotes) {
            if (!remoteIdSet.has(local.id)) {
                // If it's not on server, it's either NEW local or DELETED remote.

                // Skip if we are deleting it anyway
                if (globalPendingHardDeletes.has(local.id)) continue;

                // CRITICAL: If it was already synced:true, it means it's DELETED on server.
                // We must NOT push it back up (Zombie revival).
                if (local.synced) continue;

                toUpdateRemote.push(local);
            }
        }

        if (toUpdateLocal.length > 0 || toUpdateRemote.length > 0) {
            console.log(`[Sync] Audit - Down: ${toUpdateLocal.length}, Up: ${toUpdateRemote.length}`);
        }

        // 5. Apply Results
        if (toUpdateLocal.length > 0) {
            onRemoteUpdateRef.current(toUpdateLocal);
        }

        if (toUpdateRemote.length > 0) {
            await pushAllUnsynced(toUpdateRemote);
        }

        // 6. Temporal Buffer Cleanup: 
        // We keep pending deletes in the guard for 5 seconds after they are confirmed gone.
        // This absorbs any "Ghost" subscription updates from the server.
        for (const id of globalPendingHardDeletes) {
            if (!remoteIdSet.has(id)) {
                setTimeout(() => {
                    globalPendingHardDeletes.delete(id);
                }, 5000);
            }
        }

        reportConnectionSuccess();
    }, [isEnabled, client, seedId, fromConvexFormat, pushAllUnsynced, reportConnectionSuccess]);

    /**
     * Subscribe to remote notes and trigger sync on every update
     */
    useEffect(() => {
        if (!isEnabled || !client || !seedId) {
            setRemoteNotes([]);
            return;
        }

        console.log('[Sync] Starting watch for seed:', seedId);
        const watch = client.watchQuery(api.notes.getAllNotes, { seedId });

        // Buffer subscription updates to avoid hammering during bulk ops
        let timeout: NodeJS.Timeout;

        const unsubscribe = watch.onUpdate(() => {
            const currentNotes = watch.localQueryResult();
            if (currentNotes !== undefined) {
                setRemoteNotes(currentNotes);

                // Reactive Sync: Run the audit whenever the server data changes
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    fullSync(currentNotes);
                }, 1000); // 1s buffer
            }
        });

        // Initial fetch
        const current = watch.localQueryResult();
        if (current) fullSync(current);

        return () => {
            console.log('[Sync] Stopping watch');
            clearTimeout(timeout);
            unsubscribe();
        };
    }, [isEnabled, client, seedId, fullSync]);

    return {
        isEnabled,
        pushNote,
        pushAllUnsynced,
        pushDelete,
        pushHardDelete,
        pushBulkHardDelete,
        pushRestore,
        fullSync: (force = false) => fullSync(undefined, force),
        remoteNotes: remoteNotes.map(fromConvexFormat),
    };
}
