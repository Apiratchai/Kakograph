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
    const { encryptionKey, deviceId, isAuthenticated } = useAuth();
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

    // Extract title from content (first line or first N chars)
    const extractTitle = useCallback((content: string): string => {
        // Remove HTML tags and get first line
        const text = content.replace(/<[^>]*>/g, '').trim();
        const firstLine = text.split('\n')[0];
        return firstLine.slice(0, 50) || 'Untitled';
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
                if (note.deviceId !== deviceId) return false;

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

                    const decryptedNote = {
                        id: note.id,
                        title,
                        content,
                        timestamp: note.timestamp,
                        updatedAt: note.updatedAt,
                        folder: note.folder,
                        deletedAt: note.deletedAt
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
    }, [encryptionKey, storage, deviceId]);

    // Save current note
    const saveNote = useCallback(async (content: string) => {
        if (!encryptionKey || !deviceId) return;

        setState((prev) => ({ ...prev, isSaving: true }));

        try {
            const title = extractTitle(content);
            const now = Date.now();
            const contentHash = await hashContent(content);

            // Encrypt title and content
            const [encryptedContent, encryptedTitle] = await Promise.all([
                encryptText(content, encryptionKey),
                encryptText(title, encryptionKey),
            ]);

            const encryptedNote: EncryptedNote = {
                id: state.currentNote?.id || createNoteId(),
                deviceId,
                encryptedContent,
                encryptedTitle,
                timestamp: state.currentNote?.timestamp || now,
                updatedAt: now,
                deleted: false,
                folder: state.currentNote?.folder, // Preserve folder
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
                folder: encryptedNote.folder,
            };

            setState((prev) => {
                const existingIndex = prev.notes.findIndex((n) => n.id === decryptedNote.id);
                // Optimistic update
                const newNotes = existingIndex >= 0
                    ? prev.notes.map((n, i) => i === existingIndex ? decryptedNote : n)
                    : [decryptedNote, ...prev.notes];

                // Re-sort
                newNotes.sort((a, b) => b.updatedAt - a.updatedAt);

                return {
                    ...prev,
                    notes: newNotes,
                    currentNote: decryptedNote,
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
    }, [encryptionKey, deviceId, storage, state.currentNote, extractTitle, loadNotes]);

    // Create new note
    const createNewNote = useCallback(async (initialFolder?: string) => {
        if (!encryptionKey || !deviceId) return;

        const content = '';
        const title = 'Untitled';
        const now = Date.now();
        const contentHash = await hashContent(content);

        try {
            // Encrypt title and content
            const [encryptedContent, encryptedTitle] = await Promise.all([
                encryptText(content, encryptionKey),
                encryptText(title, encryptionKey),
            ]);

            const encryptedNote: EncryptedNote = {
                id: createNoteId(),
                deviceId,
                encryptedContent,
                encryptedTitle,
                timestamp: now,
                updatedAt: now,
                deleted: false,
                synced: false,
                folder: initialFolder,
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
    }, [encryptionKey, deviceId, storage, loadNotes]);

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
                await storage.updateNote(id, {
                    deleted: true,
                    deletedAt: Date.now(),
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
            await storage.updateNote(id, {
                deleted: false,
                deletedAt: undefined
            });
            loadNotes(true);
        } catch (err) {
            console.error('Failed to restore note:', err);
        }
    }, [storage, loadNotes]);

    // Permanently Delete
    const permanentlyDeleteNote = useCallback(async (id: string) => {
        try {
            await storage.hardDeleteNote(id);
            // Refresh state from DB
            loadNotes(true);
        } catch (err) {
            console.error('Failed to permanently delete:', err);
        }
    }, [storage, loadNotes]);

    // Move note to folder
    const moveNote = useCallback(async (id: string, folder: string) => {
        try {
            await storage.updateNote(id, { folder });

            setState(prev => ({
                ...prev,
                notes: prev.notes.map(n => n.id === id ? { ...n, folder } : n),
                currentNote: prev.currentNote?.id === id ? { ...prev.currentNote, folder } : prev.currentNote
            }));

            loadNotes(true);
        } catch (err) {
            console.error('Failed to move note:', err);
        }
    }, [storage, loadNotes]);

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
        if (!encryptionKey || !deviceId) return;

        try {
            const contentHash = await hashContent(note.content);
            const [encryptedContent, encryptedTitle] = await Promise.all([
                encryptText(note.content, encryptionKey),
                encryptText(note.title, encryptionKey),
            ]);

            const encryptedNote: EncryptedNote = {
                id: note.id, // Preserve ID
                deviceId,    // Re-assign to current user
                encryptedContent,
                encryptedTitle,
                timestamp: note.timestamp,
                updatedAt: note.updatedAt,
                deleted: isDeleted,
                deletedAt: isDeleted ? (note.deletedAt || Date.now()) : undefined,
                folder: note.folder,
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
    }, [encryptionKey, deviceId, storage, extractTitle]);

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
        if (!deviceId) return;
        try {
            await storage.clearAllNotesForDevice(deviceId);
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
    }, [storage, deviceId]);

    // Handle remote updates from Convex
    const handleRemoteUpdate = useCallback(async (incomingNotes: EncryptedNote[]) => {
        if (!encryptionKey) return;

        try {
            console.log('[Hooks] Applying remote updates to DB:', incomingNotes.length);
            await storage.bulkSave(incomingNotes);
            console.log('[Hooks] DB Unlocked. Reloading notes...');
            await loadNotes(true);
            console.log('[Hooks] Notes reloaded.');
        } catch (err) {
            console.error('Failed to apply remote updates:', err);
        }
    }, [storage, encryptionKey, loadNotes]);

    // Initialize Sync Service
    const syncService = useConvexSync(
        deviceId,
        state.encryptedNotes,
        handleRemoteUpdate
    );

    // Override saveNote to push to sync
    const originalSaveNote = saveNote;
    const saveNoteWithSync = useCallback(async (content: string) => {
        await originalSaveNote(content);
        // After saving locally, trigger sync (implicit via state.encryptedNotes update -> hook reaction)
        // But for faster response, we can explicitly push the *current* note if we knew the ID.
        // Since loadNotes updates state, the hook will pick it up eventually (30s or immediate if depend effect runs).
        // Actually, let's optimize: saveNote calls loadNotes(true), which updates state.encryptedNotes.
        // useConvexSync depends on localNotes (state.encryptedNotes), so it will re-evaluate diff.
    }, [originalSaveNote]);

    // Explicitly push deletions/restores
    const deleteNoteWithSync = useCallback(async (id: string) => {
        await deleteNote(id);
        syncService.pushDelete(id, Date.now());
    }, [deleteNote, syncService]);

    const hardDeleteWithSync = useCallback(async (id: string) => {
        await permanentlyDeleteNote(id);
        syncService.pushHardDelete(id);
    }, [permanentlyDeleteNote, syncService]);

    const restoreNoteWithSync = useCallback(async (id: string) => {
        await restoreNote(id);
        syncService.pushRestore(id);
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
        saveNote: saveNoteWithSync,
        createNewNote,
        selectNote,
        deleteNote: deleteNoteWithSync,
        deleteNotes,
        importNote,
        restoreNote: restoreNoteWithSync,
        restoreNotes,
        permanentlyDeleteNote: hardDeleteWithSync,
        moveNote: moveNoteWithSync,
        updateNoteLocal,
        clearAllNotes // NEW
    };
}
