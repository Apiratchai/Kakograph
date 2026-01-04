'use client';

/**
 * Notes Hook
 * State management for notes with encryption
 */

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/lib/auth/context';
import {
    encryptText,
    decryptText,
    hashContent,
    type EncryptedData
} from '@/lib/crypto';
import {
    IndexedDBProvider,
    type EncryptedNote,
    type SyncStatus,
    createNoteId
} from '@/lib/storage';
import { useConvexSync } from '@/lib/convex/sync';

interface DecryptedNote {
    id: string;
    title: string;
    content: string;
    timestamp: number;
    updatedAt: number;
    folder?: string;
    deletedAt?: number;
    baseHash?: string;
    conflictContent?: string;
}

interface NotesState {
    notes: DecryptedNote[];
    currentNote: DecryptedNote | null;
    isLoading: boolean;
    isSaving: boolean;
    syncStatus: SyncStatus;
    error: string | null;
    trashCount: number;
    trash: DecryptedNote[];
    encryptedNotes: EncryptedNote[]; // NEW: For sync
}

export function useNotes() {
    const { encryptionKey, seedId, isAuthenticated } = useAuth();
    const [storage] = useState(() => IndexedDBProvider.getInstance());
    const [state, setState] = useState<NotesState>({
        notes: [],
        currentNote: null,
        isLoading: false,
        isSaving: false,
        syncStatus: 'local',
        error: null,
        trashCount: 0,
        trash: [],
        encryptedNotes: [],
    });

    // Initialize storage
    useEffect(() => {
        if (isAuthenticated) {
            storage.initialize().catch(console.error);
        }
        // Don't close storage on unmount - it's a singleton that persists
    }, [isAuthenticated, storage]);

    // Extract title from content (first line only)
    const extractTitle = useCallback((content: string): string => {
        // Replace block-level tags and breaks with newlines to ensure line separation
        const withLineBreaks = content
            .replace(/<\/(p|h[1-6]|div|li)>/gi, '\n')
            .replace(/<br\s*\/?>/gi, '\n');

        // Remove HTML tags and get first non-empty line
        const text = withLineBreaks.replace(/<[^>]*>/g, '').trim();
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        const firstLine = lines[0] || 'Untitled';

        return firstLine.slice(0, 70);
    }, []);

    // Load all notes
    const loadNotes = useCallback(async (silent = false) => {
        if (!encryptionKey) return;

        if (!silent) {
            setState((prev) => ({ ...prev, isLoading: true, error: null }));
        }

        try {
            const allEncryptedNotes = await storage.getAllNotes();

            // 30-day cleanup threshold
            const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            const notesToDelete: string[] = [];

            // Filter notes derived from the current seed (User ID) and cleanup old trash
            const encryptedNotes = allEncryptedNotes.filter((note) => {
                if (note.seedId !== seedId) return false;

                // Check for auto-deletion
                if (note.deleted && note.deletedAt && (now - note.deletedAt > THIRTY_DAYS_MS)) {
                    notesToDelete.push(note.id);
                    return false;
                }
                return true;
            });

            // Perform cleanup
            if (notesToDelete.length > 0) {
                storage.bulkDelete(notesToDelete).catch(console.error);
            }

            const decryptedNotes: DecryptedNote[] = [];
            const decryptedTrash: DecryptedNote[] = [];

            for (const note of encryptedNotes) {
                try {
                    const content = await decryptText(note.encryptedContent, encryptionKey);
                    const title = await decryptText(note.encryptedTitle, encryptionKey);

                    let folder: string | undefined = undefined;
                    if (note.encryptedFolder) {
                        try {
                            folder = await decryptText(note.encryptedFolder, encryptionKey);
                        } catch (e) {
                            console.warn(`Failed to decrypt folder for note ${note.id}`, e);
                        }
                        try {
                            folder = await decryptText(note.encryptedFolder, encryptionKey);
                        } catch (e) {
                            console.warn(`Failed to decrypt folder for note ${note.id}`, e);
                        }
                    } else if ((note as any).folder) {
                        // Legacy support during migration
                        folder = (note as any).folder;
                    }

                    // Decrypt conflict data if present
                    let conflictContent: string | undefined;
                    if (note.conflictData) {
                        try {
                            conflictContent = await decryptText(note.conflictData, encryptionKey);
                        } catch (e) {
                            console.warn(`Failed to decrypt conflict data for note ${note.id}`, e);
                        }
                    }

                    const decryptedNote = {
                        id: note.id,
                        title,
                        content,
                        timestamp: note.timestamp,
                        updatedAt: note.updatedAt,
                        folder,
                        deletedAt: note.deletedAt,
                        // NEW: Pass through fields for conflict UI
                        baseHash: note.baseHash,
                        conflictContent // Decrypted remote content
                    };

                    if (note.deleted) {
                        decryptedTrash.push(decryptedNote);
                    } else {
                        decryptedNotes.push(decryptedNote);
                    }
                } catch (err) {
                    console.error('Failed to decrypt note:', note.id, err);
                }
            }

            // Sort by updatedAt descending
            decryptedNotes.sort((a, b) => b.updatedAt - a.updatedAt);
            decryptedTrash.sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));

            setState((prev) => ({
                ...prev,
                notes: decryptedNotes,
                trash: decryptedTrash,
                encryptedNotes, // Update encrypted notes for sync
                isLoading: false,
                // Update current note with new version if it exists
                currentNote: prev.currentNote
                    ? decryptedNotes.find(n => n.id === prev.currentNote!.id) || null
                    : (!silent ? decryptedNotes[0] || null : null),
                trashCount: decryptedTrash.length,
            }));
        } catch (err) {
            console.error('Failed to load notes:', err);
            setState((prev) => ({
                ...prev,
                isLoading: false,
                error: 'Failed to load notes',
            }));
        }
    }, [encryptionKey, storage, seedId]);

    // Save current note
    const saveNote = useCallback(async (content: string) => {
        if (!encryptionKey || !seedId) return;

        setState((prev) => ({ ...prev, isSaving: true }));

        try {
            const title = extractTitle(content);
            const now = Date.now();
            const contentHash = await hashContent(content);
            const folderName = state.currentNote?.folder;

            // Encrypt title, content, and folder
            const promises: Promise<any>[] = [
                encryptText(content, encryptionKey),
                encryptText(title, encryptionKey),
            ];

            if (folderName) {
                promises.push(encryptText(folderName, encryptionKey));
            } else {
                promises.push(Promise.resolve(undefined));
            }

            const [encryptedContent, encryptedTitle, encryptedFolder] = await Promise.all(promises);

            // Monotonic Timestamp: Ensure new update is always physically "newer" than the previous version
            // This prevents clock skew issues where local clock < remote clock causing sync to overwrite local changes.
            const nextUpdatedAt = Math.max(now, (state.currentNote?.updatedAt || 0) + 1);

            const encryptedNote: EncryptedNote = {
                id: state.currentNote?.id || createNoteId(),
                seedId,
                encryptedContent,
                encryptedTitle,
                encryptedFolder,
                // Preserve baseHash if we are updating (it shouldn't change until we sync)
                baseHash: state.currentNote?.baseHash,
                // Clear conflict data on save (Resolution strategy: Local Overwrite)
                conflictData: undefined,
                timestamp: state.currentNote?.timestamp || now,
                updatedAt: nextUpdatedAt,
                deleted: false,
                synced: false,
                metadata: {
                    size: new TextEncoder().encode(content).length,
                    contentHash,
                },
            };

            if (state.currentNote) {
                await storage.updateNote(encryptedNote.id, encryptedNote);
            } else {
                await storage.saveNote(encryptedNote);
            }

            // Update state immediately for responsiveness
            const decryptedNote: DecryptedNote = {
                id: encryptedNote.id,
                title,
                content,
                timestamp: encryptedNote.timestamp,
                updatedAt: encryptedNote.updatedAt,
                folder: folderName,
                // Partial update doesn't have these, but safe to assume undefined for new note
                baseHash: encryptedNote.baseHash,
                conflictContent: undefined
            };

            setState((prev) => {
                const existingIndex = prev.notes.findIndex((n) => n.id === decryptedNote.id);
                // Optimistic update
                const newNotes = existingIndex >= 0
                    ? prev.notes.map((n, i) => i === existingIndex ? { ...n, ...decryptedNote } : n)
                    : [decryptedNote, ...prev.notes];

                // Re-sort
                newNotes.sort((a, b) => b.updatedAt - a.updatedAt);

                return {
                    ...prev,
                    notes: newNotes,
                    currentNote: { ...decryptedNote, conflictContent: undefined }, // Ensure conflict UI clears
                    isSaving: false,
                };
            });


            // Refresh from DB to ensure consistency
            loadNotes(true);

        } catch (err) {
            console.error('Failed to save note:', err);
            setState((prev) => ({
                ...prev,
                isSaving: false,
                error: 'Failed to save note',
            }));
        }
    }, [encryptionKey, seedId, storage, state.currentNote, extractTitle, loadNotes]);

    // Internal Save for Offline Fallback or Cache Update
    const saveNoteLocal = useCallback(async (encryptedNote: EncryptedNote) => {
        if (state.currentNote) {
            await storage.updateNote(encryptedNote.id, encryptedNote);
        } else {
            await storage.saveNote(encryptedNote);
        }
        loadNotes(true);
    }, [storage, state.currentNote, loadNotes]);

    // Create new note
    const createNewNote = useCallback(async (initialFolder?: string) => {
        if (!encryptionKey || !seedId) return;

        const content = '';
        const title = 'Untitled';
        const now = Date.now();
        const contentHash = await hashContent(content);

        try {
            // Encrypt title and content
            const promises: Promise<any>[] = [
                encryptText(content, encryptionKey),
                encryptText(title, encryptionKey),
            ];

            if (initialFolder) {
                promises.push(encryptText(initialFolder, encryptionKey));
            } else {
                promises.push(Promise.resolve(undefined));
            }

            const [encryptedContent, encryptedTitle, encryptedFolder] = await Promise.all(promises);

            const encryptedNote: EncryptedNote = {
                id: createNoteId(),
                seedId,
                encryptedContent,
                encryptedTitle,
                encryptedFolder,
                timestamp: now,
                updatedAt: now,
                deleted: false,
                synced: false,
                metadata: {
                    size: 0,
                    contentHash,
                },
            };

            await storage.saveNote(encryptedNote);

            const decryptedNote: DecryptedNote = {
                id: encryptedNote.id,
                title,
                content,
                timestamp: encryptedNote.timestamp,
                updatedAt: encryptedNote.updatedAt,
                folder: initialFolder
            };

            setState((prev) => ({
                ...prev,
                notes: [decryptedNote, ...prev.notes],
                currentNote: decryptedNote,
            }));

            // Refresh from DB
            loadNotes(true);
        } catch (err) {
            console.error('Failed to create new note:', err);
        }
    }, [encryptionKey, seedId, storage, loadNotes]);

    // Select a note
    const selectNote = useCallback((id: string) => {
        setState((prev) => ({
            ...prev,
            currentNote: prev.notes.find((n) => n.id === id) || null,
        }));
    }, []);

    // Delete a note (Soft Delete)
    const deleteNote = useCallback(async (id: string) => {
        try {
            const noteToTrash = state.notes.find(n => n.id === id);
            if (!noteToTrash) return;

            // Get existing encrypted note to preserve fields
            const existing = await storage.getNote(id);
            if (existing) {
                // Monotonic: Ensure deletion timestamp is newer than last update
                const nextDeletedAt = Math.max(Date.now(), (existing.updatedAt || 0) + 1);

                await storage.updateNote(id, {
                    deleted: true,
                    deletedAt: nextDeletedAt,
                    updatedAt: nextDeletedAt,
                });
            }

            setState((prev) => {
                const deletedNote = prev.notes.find(n => n.id === id);
                return {
                    ...prev,
                    notes: prev.notes.filter((n) => n.id !== id),
                    trash: deletedNote ? [{ ...deletedNote, deletedAt: Date.now() }, ...(prev.trash || [])] : (prev.trash || []),
                    currentNote: prev.currentNote?.id === id ? null : prev.currentNote,
                    trashCount: prev.trashCount + 1,
                };
            });

            // Refresh state to ensure sync service sees the change
            loadNotes(true);
        } catch (err) {
            console.error('Failed to delete note:', err);
        }
    }, [storage, state.notes, loadNotes]);

    // Restore a note
    const restoreNote = useCallback(async (id: string) => {
        try {
            const existing = await storage.getNote(id);
            const nextUpdatedAt = Math.max(Date.now(), (existing?.updatedAt || 0) + 1);

            await storage.updateNote(id, {
                deleted: false,
                deletedAt: undefined,
                updatedAt: nextUpdatedAt // Force update timestamp to propagate change
            });
            loadNotes(true);
        } catch (err) {
            console.error('Failed to restore note:', err);
        }
    }, [storage, loadNotes]);

    // Permanently Delete (Local Only)
    const permanentlyDeleteNote = useCallback(async (id: string) => {
        try {
            // Optimistic update
            setState(prev => ({
                ...prev,
                trash: prev.trash.filter(n => n.id !== id),
                trashCount: Math.max(0, prev.trashCount - 1),
                currentNote: prev.currentNote?.id === id ? null : prev.currentNote
            }));

            await storage.hardDeleteNote(id);
            // Refresh state from DB to ensure sync list is updated
            await loadNotes(true);
        } catch (err) {
            console.error('Failed to permanently delete:', err);
            // Reload if error to restore consistency
            loadNotes(true);
        }
    }, [storage, loadNotes]);



    // Move note to folder
    const moveNote = useCallback(async (id: string, folder: string) => {
        if (!encryptionKey) return;
        try {
            const encryptedFolder = folder ? await encryptText(folder, encryptionKey) : undefined;

            // We need to update the encrypted folder in the DB
            await storage.updateNote(id, { encryptedFolder });

            setState(prev => ({
                ...prev,
                notes: prev.notes.map(n => n.id === id ? { ...n, folder } : n),
                currentNote: prev.currentNote?.id === id ? { ...prev.currentNote, folder } : prev.currentNote
            }));

            loadNotes(true);
        } catch (err) {
            console.error('Failed to move note:', err);
        }
    }, [storage, loadNotes, encryptionKey]);

    // Optimistic local update (as user types)
    const updateNoteLocal = useCallback((content: string) => {
        const title = extractTitle(content);
        const now = Date.now();

        setState((prev) => {
            if (!prev.currentNote) return prev;

            const updatedNote: DecryptedNote = {
                ...prev.currentNote,
                title,
                content,
                updatedAt: now,
            };

            const existingIndex = prev.notes.findIndex((n) => n.id === prev.currentNote!.id);
            const newNotes = existingIndex >= 0
                ? prev.notes.map((n, i) => i === existingIndex ? updatedNote : n)
                : prev.notes;

            // Optional: re-sort on every keystroke might be jumpy, so maybe just update data
            // but let's keep it simple for now. 
            // Actually, re-sorting while typing might move the active note in the sidebar.
            // Let's NOT re-sort locally, just update title. Sorting happens on save.

            return {
                ...prev,
                notes: newNotes,
                currentNote: updatedNote,
            };
        });
    }, [extractTitle]);

    // Import a note (preserving ID and timestamps)
    const importNote = useCallback(async (note: DecryptedNote, isDeleted: boolean = false) => {
        if (!encryptionKey || !seedId) return;

        try {
            const contentHash = await hashContent(note.content);

            const promises: Promise<any>[] = [
                encryptText(note.content, encryptionKey),
                encryptText(note.title, encryptionKey),
            ];

            if (note.folder) {
                promises.push(encryptText(note.folder, encryptionKey));
            } else {
                promises.push(Promise.resolve(undefined));
            }

            const [encryptedContent, encryptedTitle, encryptedFolder] = await Promise.all(promises);

            const encryptedNote: EncryptedNote = {
                id: note.id, // Preserve ID
                seedId,    // Re-assign to current user
                encryptedContent,
                encryptedTitle,
                encryptedFolder,
                timestamp: note.timestamp,
                updatedAt: note.updatedAt,
                deleted: isDeleted,
                deletedAt: isDeleted ? (note.deletedAt || Date.now()) : undefined,
                synced: false,
                metadata: {
                    size: new TextEncoder().encode(note.content).length,
                    contentHash,
                },
            };

            // Upsert (save/overwrite) - saveNote uses 'put' internally
            await storage.saveNote(encryptedNote);

            // We don't auto-reload here for performance (batch imports). 
            // The UI should call loadNotes() after batch completion.
        } catch (err) {
            console.error('Failed to import note:', err);
            throw err;
        }
    }, [encryptionKey, seedId, storage, extractTitle]);

    // Bulk delete notes (Soft Delete)
    const deleteNotes = useCallback(async (ids: string[]) => {
        try {
            // Update DB
            await Promise.all(ids.map(id =>
                storage.updateNote(id, {
                    deleted: true,
                    deletedAt: Date.now(),
                })
            ));

            setState((prev) => {
                const now = Date.now();
                const deletedNotes = prev.notes.filter(n => ids.includes(n.id));
                const remainingNotes = prev.notes.filter(n => !ids.includes(n.id));

                const newTrash = [
                    ...deletedNotes.map(n => ({ ...n, deletedAt: now })),
                    ...(prev.trash || [])
                ];

                return {
                    ...prev,
                    notes: remainingNotes,
                    trash: newTrash,
                    currentNote: ids.includes(prev.currentNote?.id || '') ? null : prev.currentNote,
                    trashCount: newTrash.length,
                };
            });

            loadNotes(true);
        } catch (err) {
            console.error('Failed to bulk delete notes:', err);
        }
    }, [storage, loadNotes]);

    // Bulk restoration
    const restoreNotes = useCallback(async (ids: string[]) => {
        try {
            await Promise.all(ids.map(id =>
                storage.updateNote(id, {
                    deleted: false,
                    deletedAt: undefined
                })
            ));
            loadNotes(true);
        } catch (err) {
            console.error('Failed to bulk restore notes:', err);
        }
    }, [storage, loadNotes]);

    // Clear all notes for full snapshot restore
    const clearAllNotes = useCallback(async () => {
        if (!seedId) return;
        try {
            await storage.clearAllNotesForSeed(seedId);
            setState(prev => ({
                ...prev,
                notes: [],
                trash: [],
                currentNote: null,
                trashCount: 0
            }));
        } catch (err) {
            console.error('Failed to clear notes:', err);
        }
    }, [storage, seedId]);

    // Handle remote updates from Convex
    const handleRemoteUpdate = useCallback(async (incomingNotes: EncryptedNote[]) => {
        if (!encryptionKey) return;

        try {
            await storage.bulkSave(incomingNotes);
            await loadNotes(true);
        } catch (err) {
            console.error('Failed to apply remote updates:', err);
        }
    }, [storage, encryptionKey, loadNotes]);

    // Callback to mark notes as synced after successful push
    const markNoteAsSynced = useCallback(async (ids: string[]) => {
        try {
            for (const id of ids) {
                await storage.markAsSynced(id);
            }
            // Silent reload to update 'synced' status in memory
            loadNotes(true);
        } catch (err) {
            console.error('Failed to mark notes as synced:', err);
        }
    }, [storage, loadNotes]);

    // Initialize Sync Service (Moved UP to be available for functions)
    const syncService = useConvexSync(
        seedId,
        state.encryptedNotes,
        handleRemoteUpdate,
        markNoteAsSynced
    );

    // Override saveNote to push to sync
    // ... we already refactored saveNote below, but let's keep the flow.



    // Cloud-First Save
    const saveNoteWithSync = useCallback(async (content: string) => {
        if (!encryptionKey || !seedId) return;

        // 1. Prepare Note Data (Encryption & Metadata)
        // ... (Logic duplicated from original saveNote, moved here for control) ...
        // To avoid HUGE duplication, let's keep originalSaveNote as "prepareAndSaveLocal" 
        // and just interpret "saveNote" as the high-level action.

        // Actually, simpler: let's modify the ORIGINAL saveNote to be "saveNoteInternal" that returns the encrypted object
        // and handles the "where to save" logic.

    }, []);

    // RE-WRITING saveNote (the one exposed to UI via return) to be the orchestrator
    const saveNoteOrchestrator = useCallback(async (content: string) => {
        if (!encryptionKey || !seedId) return;

        setState(prev => ({ ...prev, isSaving: true }));

        try {
            const title = extractTitle(content);
            const now = Date.now();
            const contentHash = await hashContent(content);
            const folderName = state.currentNote?.folder;

            const promises: Promise<any>[] = [
                encryptText(content, encryptionKey),
                encryptText(title, encryptionKey),
            ];

            if (folderName) {
                promises.push(encryptText(folderName, encryptionKey));
            } else {
                promises.push(Promise.resolve(undefined));
            }

            const [encryptedContent, encryptedTitle, encryptedFolder] = await Promise.all(promises);
            const nextUpdatedAt = Math.max(now, (state.currentNote?.updatedAt || 0) + 1);

            const encryptedNote: EncryptedNote = {
                id: state.currentNote?.id || createNoteId(),
                seedId,
                encryptedContent,
                encryptedTitle,
                encryptedFolder,
                baseHash: state.currentNote?.baseHash,
                conflictData: undefined,
                timestamp: state.currentNote?.timestamp || now,
                updatedAt: nextUpdatedAt,
                deleted: false,
                synced: true, // Optimistically true if going to cloud? No, let sync logic handle default.
                metadata: {
                    size: new TextEncoder().encode(content).length,
                    contentHash,
                },
            };

            // OPTIMISTIC UPDATE (React State)
            const decryptedNote: DecryptedNote = {
                id: encryptedNote.id,
                title,
                content,
                timestamp: encryptedNote.timestamp,
                updatedAt: encryptedNote.updatedAt,
                folder: folderName,
                baseHash: encryptedNote.baseHash,
                conflictContent: undefined
            };

            setState((prev) => {
                const existingIndex = prev.notes.findIndex((n) => n.id === decryptedNote.id);
                const newNotes = existingIndex >= 0
                    ? prev.notes.map((n, i) => i === existingIndex ? { ...n, ...decryptedNote } : n)
                    : [decryptedNote, ...prev.notes];

                newNotes.sort((a, b) => b.updatedAt - a.updatedAt);

                return {
                    ...prev,
                    notes: newNotes,
                    currentNote: { ...decryptedNote, conflictContent: undefined },
                    isSaving: false,
                };
            });

            // CLOUD FIRST LOGIC
            // If connected, push directly. Local DB will update via subscription.
            if (syncService.isEnabled) {
                try {
                    await syncService.pushNote(encryptedNote);
                    console.log('[Hooks] Cloud-First save successful');
                } catch (err) {
                    console.warn('[Hooks] Cloud save failed, falling back to local:', err);
                    // Fallback
                    await saveNoteLocal({ ...encryptedNote, synced: false });
                }
            } else {
                // Offline: Save to DB + Queue
                await saveNoteLocal({ ...encryptedNote, synced: false });
            }

        } catch (err) {
            console.error('Failed to save note:', err);
            setState(prev => ({ ...prev, isSaving: false, error: 'Failed to save note' }));
        }
    }, [encryptionKey, seedId, state.currentNote, extractTitle, syncService, saveNoteLocal]);

    // Explicitly push deletions/restores
    const deleteNoteWithSync = useCallback(async (id: string) => {
        // Optimistic UI Update
        setState((prev) => {
            const deletedNote = prev.notes.find(n => n.id === id);
            return {
                ...prev,
                notes: prev.notes.filter((n) => n.id !== id),
                trash: deletedNote ? [{ ...deletedNote, deletedAt: Date.now() }, ...(prev.trash || [])] : (prev.trash || []),
                currentNote: prev.currentNote?.id === id ? null : prev.currentNote,
                trashCount: prev.trashCount + 1,
            };
        });

        if (syncService.isEnabled) {
            try {
                await syncService.pushDelete(id, Date.now());
            } catch (err) {
                console.warn('[Hooks] Cloud delete failed, fallback to local', err);
                await deleteNote(id);
            }
        } else {
            await deleteNote(id);
        }
    }, [deleteNote, syncService]);

    const hardDeleteWithSync = useCallback(async (id: string) => {
        // Optimistic UI Update
        setState(prev => ({
            ...prev,
            trash: prev.trash.filter(n => n.id !== id),
            trashCount: Math.max(0, prev.trashCount - 1),
            currentNote: prev.currentNote?.id === id ? null : prev.currentNote
        }));

        if (syncService.isEnabled) {
            try {
                await syncService.pushHardDelete(id);
                // Note: We do NOT need to delete locally if cloud succeeds? 
                // Actually for hard delete, we SHOULD delete locally immediately to free space, 
                // as the subscription might just say "record gone" which implies delete.
                await permanentlyDeleteNote(id);
            } catch (error) {
                console.error('[Hooks] Cloud hard-delete failed, aborting local delete:', error);
                // Revert optimistic update? For now, we reload.
                loadNotes(true);
            }
        } else {
            await permanentlyDeleteNote(id);
        }
    }, [permanentlyDeleteNote, syncService, loadNotes]);

    // Bulk Permanently Delete (Cloud-First)
    const permanentlyDeleteNotes = useCallback(async (ids: string[]) => {
        // Optimistic UI Update
        setState(prev => ({
            ...prev,
            trash: prev.trash.filter(n => !ids.includes(n.id)),
            trashCount: Math.max(0, prev.trashCount - ids.length),
            currentNote: ids.includes(prev.currentNote?.id || '') ? null : prev.currentNote
        }));

        if (syncService.isEnabled) {
            try {
                // 1. Push Bulk Hard Delete (Registers pending deletes to prevent zombie re-download)
                await syncService.pushBulkHardDelete(ids);
                // 2. Perform local delete
                // We do this AFTER push starts (or ideally parallel with optimistic UI) 
                // but since we added to pending list in sync service, fullSync won't catch it. 
                await Promise.all(ids.map(id => storage.hardDeleteNote(id)));
            } catch (error) {
                console.error('[Hooks] Cloud bulk hard-delete failed, aborting local delete:', error);
                // Revert or reload
                loadNotes(true);
            }
        } else {
            // Offline: Just delete locally.
            await Promise.all(ids.map(id => storage.hardDeleteNote(id)));
        }

        // Refresh to ensure consistency
        loadNotes(true);
    }, [storage, loadNotes, syncService]);

    const restoreNoteWithSync = useCallback(async (id: string) => {
        // Optimistic UI Update
        // (Complex to do optimistic restore derived from trash state, so skipping UI opt for now, rely on fast cloud)

        if (syncService.isEnabled) {
            try {
                await syncService.pushRestore(id);
            } catch (err) {
                console.warn('[Hooks] Cloud restore failed, fallback to local', err);
                await restoreNote(id);
            }
        } else {
            await restoreNote(id);
        }
    }, [restoreNote, syncService]);

    const moveNoteWithSync = useCallback(async (id: string, folder: string) => {
        await moveNote(id, folder);
        // We'd need a pushMove or just let full sync handle the metadata update.
        // Since useConvexSync does full diff, it should catch the folder change on next sync interval.
        // To force it, we can trigger fullSync
        syncService.fullSync();
    }, [moveNote, syncService]);


    return {
        ...state,
        loadNotes,
        saveNote: saveNoteOrchestrator, // Use the new Cloud-First Orchestrator
        createNewNote,
        selectNote,
        deleteNote: deleteNoteWithSync,
        deleteNotes,
        importNote,
        restoreNote: restoreNoteWithSync,
        restoreNotes,
        permanentlyDeleteNote: hardDeleteWithSync,
        permanentlyDeleteNotes, // New Bulk Function
        moveNote: moveNoteWithSync,
        updateNoteLocal,
        clearAllNotes, // For full snapshot restore
        wipeLocalData: clearAllNotes // Exposed for UI "Clear Local Data"
    };
}
