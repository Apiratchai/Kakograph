'use client';

/**
 * Write Page - Main Editor
 * Default route after authentication
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth/context';
import { RichEditor } from '@/components/editor/rich-editor';
import { useNotes } from '@/lib/notes/hooks';
import { Menu, Plus, Check, Cloud, CloudOff, Loader2, ChevronLeft, Lock, LockOpen, Download, Upload, Network, PenTool, Folder, FolderPlus, ChevronRight, ChevronDown, Trash2, Settings } from 'lucide-react';
import { PinKeypad } from '@/components/auth/pin-keypad';
import { Modal } from '@/components/ui/modal';
import './write.css';

const NoteGraph = dynamic(() => import('@/components/graph/note-graph'), {
    ssr: false,
    loading: () => <div className="w-full h-full flex items-center justify-center text-slate-500">Loading Graph...</div>
});

const TableOfContents = ({ content }: { content: string }) => {
    // Simple regex to extract headers (h1-h3)
    // Matches <hX ...>Text</hX>
    const headers = useMemo(() => {
        const regex = /<h([1-3])[^>]*>(.*?)<\/h\1>/g;
        const matches = [];
        let match;
        while ((match = regex.exec(content)) !== null) {
            matches.push({
                level: parseInt(match[1]),
                text: match[2].replace(/<[^>]+>/g, '') // Strip inner HTML if any
            });
        }
        return matches;
    }, [content]);

    const handleScroll = (text: string, level: number) => {
        // TipTap editor content is typically contained in a class 'ProseMirror'
        const editor = document.querySelector('.ProseMirror');
        if (!editor) return;

        // Find all matching headers of that level
        const elements = Array.from(editor.querySelectorAll(`h${level}`));

        // Find the specific one that matches the text
        // We trim to ensure whitespace doesn't cause misses
        const target = elements.find(el => el.textContent?.trim() === text.trim());

        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    if (headers.length === 0) {
        return <p className="text-slate-600 text-sm italic">No headers found.</p>;
    }

    return (
        <ul className="space-y-2">
            {headers.map((h, i) => (
                <li key={i} style={{ paddingLeft: `${(h.level - 1) * 12}px` }}>
                    <div
                        onClick={() => handleScroll(h.text, h.level)}
                        className="text-slate-400 text-sm hover:text-blue-400 cursor-pointer truncate transition-colors"
                    >
                        {h.text}
                    </div>
                </li>
            ))}
        </ul>
    );
};

export default function WritePage() {
    const router = useRouter();
    const { isAuthenticated, isLoading: authLoading, setupPin, hasProtectedSession, logout } = useAuth();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [showPinDialog, setShowPinDialog] = useState(false);
    const [pinInput, setPinInput] = useState('');
    const [pinLoading, setPinLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [viewMode, setViewMode] = useState<'editor' | 'graph'>('editor');

    const {
        notes,
        currentNote,
        saveNote,
        createNewNote,
        deleteNote,
        selectNote,
        isSaving,
        syncStatus,
        loadNotes,
        updateNoteLocal,
        importNote,
        moveNote,
        trash,
        restoreNote,
        deleteNotes,
        restoreNotes,
        permanentlyDeleteNote,
        trashCount,
        clearAllNotes // For full snapshot restore
    } = useNotes();

    const [content, setContent] = useState('');
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [lastSaved, setLastSaved] = useState<Date | null>(null);



    // Modal Configuration
    const [modalConfig, setModalConfig] = useState<{
        isOpen: boolean;
        title: string;
        description?: string;
        type: 'alert' | 'confirm';
        onConfirm?: () => void;
        isDestructive?: boolean;
    }>({
        isOpen: false,
        title: '',
        type: 'alert'
    });

    const closeModal = () => setModalConfig(prev => ({ ...prev, isOpen: false }));

    const showAlert = (title: string, description?: string) => {
        setModalConfig({
            isOpen: true,
            title,
            description,
            type: 'alert'
        });
    };

    const showConfirm = (title: string, description: string, onConfirm: () => void, isDestructive = false) => {
        setModalConfig({
            isOpen: true,
            title,
            description,
            type: 'confirm',
            onConfirm: () => {
                onConfirm();
                closeModal();
            },
            isDestructive
        });
    };

    // Folder State
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['TRASH_BIN']));
    const [tempFolders, setTempFolders] = useState<Set<string>>(new Set()); // For empty folders
    const [folderModal, setFolderModal] = useState({ isOpen: false, value: '' });

    // Hover state for bidirectional highlighting
    const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

    // Settings dropdown state
    const [showSettingsMenu, setShowSettingsMenu] = useState(false);

    // Folder Logic
    const groupedNotes = useMemo(() => {
        const groups: Record<string, typeof notes> = { 'ROOT': [] };

        // Populate from notes
        notes.forEach(note => {
            if (note.folder) {
                if (!groups[note.folder]) groups[note.folder] = [];
                groups[note.folder].push(note);
            } else {
                groups['ROOT'].push(note);
            }
        });

        // Ensure temp folders exist
        tempFolders.forEach(folder => {
            if (!groups[folder]) groups[folder] = [];
        });

        return groups;
    }, [notes, tempFolders]);

    // Trash Grouping
    const trashGroups = useMemo(() => {
        const groups: Record<string, typeof trash> = { 'ROOT': [] };
        trash.forEach(note => {
            if (note.folder) {
                if (!groups[note.folder]) groups[note.folder] = [];
                groups[note.folder].push(note);
            } else {
                groups['ROOT'].push(note);
            }
        });
        return groups;
    }, [trash]);

    const deleteFolder = (folderName: string) => {
        const notesInFolder = groupedNotes[folderName];
        if (notesInFolder && notesInFolder.length > 0) {
            showConfirm(
                'Delete Folder',
                `Delete folder "${folderName}" and move ${notesInFolder.length} notes to trash?`,
                async () => {
                    const ids = notesInFolder.map(n => n.id);
                    await deleteNotes(ids);

                    // Remove from temp folders
                    setTempFolders(prev => {
                        const next = new Set(prev);
                        next.delete(folderName);
                        return next;
                    });
                },
                true
            );
        } else {
            // Just remove if empty
            setTempFolders(prev => {
                const next = new Set(prev);
                next.delete(folderName);
                return next;
            });
        }
    };

    const restoreFolder = (folderName: string) => {
        const notes = trashGroups[folderName];
        if (notes) {
            restoreNotes(notes.map(n => n.id));
        }
    };

    const permanentlyDeleteFolder = (folderName: string) => {
        const notes = trashGroups[folderName];
        if (notes) {
            showConfirm('Permanently Delete Folder', `Permanently delete folder "${folderName}" and all its contents?`, async () => {
                for (const note of notes) {
                    await permanentlyDeleteNote(note.id);
                }
            }, true);
        }
    };

    const toggleFolder = (folder: string) => {
        const newSet = new Set(expandedFolders);
        if (newSet.has(folder)) newSet.delete(folder);
        else newSet.add(folder);
        setExpandedFolders(newSet);
    };

    const handleCreateFolderClick = () => {
        setFolderModal({ isOpen: true, value: '' });
    };

    const confirmCreateFolder = () => {
        const name = folderModal.value.trim();
        if (name) {
            setTempFolders(prev => new Set(prev).add(name));
            toggleFolder(name); // Auto expand
            setFolderModal({ isOpen: false, value: '' });
        }
    };

    const handleDragStart = (e: React.DragEvent, noteId: string) => {
        e.dataTransfer.setData('noteId', noteId);
    };

    const handleDrop = (e: React.DragEvent, folder: string) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent bubbling
        const noteId = e.dataTransfer.getData('noteId');
        if (noteId) {
            moveNote(noteId, folder);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
    };

    // Redirect if not authenticated
    useEffect(() => {
        if (!authLoading && !isAuthenticated) {
            router.push('/');
        }
    }, [isAuthenticated, authLoading, router]);

    // Load notes on mount
    useEffect(() => {
        if (isAuthenticated) {
            loadNotes();
        }
    }, [isAuthenticated, loadNotes]);

    // Set content when current note changes
    useEffect(() => {
        if (currentNote) {
            setContent(currentNote.content);
        } else {
            setContent('');
        }
    }, [currentNote]);

    // Autosave with debounce (3 seconds)
    const handleContentChange = useCallback((newContent: string) => {
        setContent(newContent);
        updateNoteLocal(newContent); // Instant UI update

        // Clear existing timeout
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        // Set new timeout for autosave
        saveTimeoutRef.current = setTimeout(async () => {
            if (newContent.trim()) {
                await saveNote(newContent);
                setLastSaved(new Date());
            }
        }, 3000);
    }, [saveNote, updateNoteLocal]);

    // Manual save
    const handleSave = useCallback(async () => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        if (content.trim()) {
            await saveNote(content);
            setLastSaved(new Date());
        }
    }, [content, saveNote]);

    // New note
    const handleNewNote = useCallback(() => {
        createNewNote();
        setContent('');
        if (window.innerWidth < 768) {
            setIsSidebarOpen(false);
        }
        setViewMode('editor');
    }, [createNewNote]);

    // Setup PIN
    const handleSetupPin = async (pin: string) => {
        if (pin.length < 4) return showAlert('Invalid PIN', 'PIN must be at least 4 characters long.');

        setPinLoading(true);
        // Add artificial delay for UX
        await new Promise(r => setTimeout(r, 100));

        const success = await setupPin(pin);
        setPinLoading(false);

        if (success) {
            setShowPinDialog(false);
            setPinInput('');
            showAlert('Success', 'PIN set successfully. You can now lock your session.');
        } else {
            showAlert('Error', 'Failed to set PIN. Please try again.');
        }
    };

    // Lock Session
    const handleLock = () => {
        logout(); // Logout but keep session in localStorage
        router.push('/');
    };

    // Export Notes
    const handleExport = () => {
        if (notes.length === 0) return showAlert('Export Failed', 'No notes to export.');

        const data = {
            version: 1,
            exportedAt: new Date().toISOString(),
            notes: notes,
            trash: trash,
            emptyFolders: Array.from(tempFolders) // Include empty folders
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kakograph-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Import Notes
    const handleImportTrigger = () => {
        fileInputRef.current?.click();
    };

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (!Array.isArray(data.notes)) {
                throw new Error('Invalid backup format');
            }

            // Improve: Show loading state
            const confirmImport = () => {
                (async () => {
                    // FULL SNAPSHOT: Clear all existing notes first
                    await clearAllNotes();

                    // Clear empty folders state
                    setTempFolders(new Set());

                    // Import active notes
                    for (const note of data.notes) {
                        await importNote(note, false); // false = not deleted
                    }
                    // Import trash notes (if present in backup)
                    if (Array.isArray(data.trash)) {
                        for (const note of data.trash) {
                            await importNote(note, true); // true = deleted
                        }
                    }
                    // Restore empty folders (if present in backup)
                    if (Array.isArray(data.emptyFolders)) {
                        setTempFolders(new Set(data.emptyFolders));
                    }

                    await loadNotes(true);
                    showAlert('Restore Successful', 'All notes restored from backup.');
                })();
            };

            const trashCount = Array.isArray(data.trash) ? data.trash.length : 0;
            const folderCount = Array.isArray(data.emptyFolders) ? data.emptyFolders.length : 0;
            const totalNotes = data.notes.length + trashCount;

            showConfirm(
                'Restore from Backup',
                `This will REPLACE all your current data with:\n• ${data.notes.length} active notes\n• ${trashCount} trashed notes\n• ${folderCount} empty folders\n\nThis action cannot be undone. Continue?`,
                confirmImport,
                true // isDestructive
            );

        } catch (err) {
            console.error(err);
            showAlert('Import Failed', 'Failed to import notes. Check console for details.');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Helper to restore a specific note to root (removing folder association)
    const restoreNoteAsRoot = async (id: string) => {
        // First move to root (remove folder)
        await moveNote(id, '');
        // Then restore
        await restoreNote(id);
    };



    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, []);

    // Toggle sidebar
    const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

    // Select note and close sidebar
    const handleSelectNote = (id: string) => {
        selectNote(id);
        setIsSidebarOpen(false);
        setViewMode('editor');
    };

    // Handle Graph Node Click
    const handleGraphNodeClick = (id: string) => {
        selectNote(id);
        setViewMode('editor');
    };

    // Compute connected notes for Local Graph
    const connectedNotes = useMemo(() => {
        if (typeof window === 'undefined') return []; // Server side safety
        if (!currentNote || !notes.length) return [];

        const linkedIds = new Set<string>([currentNote.id]);
        const parser = new DOMParser();

        // 1. Forward links
        try {
            const doc = parser.parseFromString(currentNote.content, 'text/html');
            doc.querySelectorAll('.wiki-link').forEach(el => {
                const id = el.getAttribute('data-id');
                if (id) linkedIds.add(id);
            });
        } catch (e) {
            console.error('Error parsing forward links', e);
        }

        // 2. Backlinks (scan all other notes)
        notes.forEach(note => {
            if (note.id === currentNote.id) return;
            if (note.content.includes(`data-id="${currentNote.id}"`)) {
                linkedIds.add(note.id);
            }
        });

        return notes.filter(n => linkedIds.has(n.id));
    }, [currentNote, notes]);

    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!isAuthenticated) {
        return null; // Will redirect
    }

    return (
        <div className="write-page">
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportFile}
                className="hidden"
                accept=".json"
            />

            <Modal
                isOpen={folderModal.isOpen}
                onClose={() => setFolderModal({ ...folderModal, isOpen: false })}
                title="New Folder"
                type="confirm"
                onConfirm={confirmCreateFolder}
                confirmText="Create Folder"
            >
                <div>
                    <label className="block text-sm text-slate-400 mb-2">Folder Name</label>
                    <input
                        type="text"
                        value={folderModal.value}
                        onChange={(e) => setFolderModal({ ...folderModal, value: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-700 text-slate-200 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="e.g. Project Idea"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && confirmCreateFolder()}
                    />
                </div>
            </Modal>

            {/* PIN Dialog */}
            {showPinDialog && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div className="bg-slate-900 p-6 rounded-2xl w-full max-w-sm border border-slate-700 shadow-2xl relative">
                        <button
                            onClick={() => setShowPinDialog(false)}
                            className="absolute top-4 right-4 text-slate-500 hover:text-slate-300"
                        >
                            &times;
                        </button>
                        <PinKeypad
                            onSubmit={handleSetupPin}
                            loading={pinLoading}
                            label="Create Login PIN"
                        />
                        <p className="text-center text-slate-500 text-xs mt-4">
                            You'll need this to unlock your notes on this device.
                        </p>
                    </div>
                </div>
            )}

            {/* Sidebar Overlay (Mobile) */}
            {isSidebarOpen && (
                <div
                    className="sidebar-overlay md:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <div className="flex items-center gap-2">
                        <h2 className="text-lg font-semibold text-slate-200 pl-4">Notes</h2>
                    </div>
                    <div className="flex items-center gap-1">
                        {/* New Folder */}
                        <button onClick={handleCreateFolderClick} className="icon-button" title="New Folder">
                            <FolderPlus size={18} />
                        </button>

                        <button onClick={handleNewNote} className="icon-button" title="New Note">
                            <Plus size={20} />
                        </button>
                        <button onClick={() => setIsSidebarOpen(false)} className="icon-button" title="Collapse Sidebar">
                            <ChevronLeft size={20} />
                        </button>
                    </div>
                </div>

                <div className="sidebar-content flex-1 overflow-y-auto" onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, "")} title="Drop here to move to Root">
                    {notes.length === 0 && trash.length === 0 && Object.keys(groupedNotes).length <= 1 ? (
                        <div className="text-center text-slate-500 py-8 text-sm px-4">
                            <p className="mb-2">No notes yet.</p>
                            <p className="mb-4">Click + to create one.</p>
                        </div>
                    ) : (
                        <div className="p-2 space-y-1">
                            {/* Render Folders */}
                            {Object.keys(groupedNotes).filter(k => k !== 'ROOT').sort().map(folder => (
                                <div key={folder} className="folder-group mb-1">
                                    <div
                                        className="flex items-center justify-between gap-2 px-3 py-2 text-slate-400 hover:text-slate-200 cursor-pointer hover:bg-slate-800/50 rounded transition-colors group"
                                        onDragOver={handleDragOver}
                                        onDrop={(e) => handleDrop(e, folder)}
                                    >
                                        <div
                                            className="flex items-center gap-2 flex-1 overflow-hidden"
                                            onClick={() => toggleFolder(folder)}
                                        >
                                            <div className={`transform transition-transform duration-200 ${expandedFolders.has(folder) ? 'rotate-90' : ''}`}>
                                                <ChevronRight size={14} />
                                            </div>
                                            <Folder size={14} className="text-blue-400/80 flex-shrink-0" />
                                            <span className="text-sm font-medium truncate select-none">{folder}</span>
                                        </div>
                                        <button
                                            className="p-1 text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                deleteFolder(folder);
                                            }}
                                            title="Delete Folder"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>

                                    {expandedFolders.has(folder) && (
                                        <ul className="pl-3 border-l border-slate-800 ml-4 space-y-0.5 mt-1 animate-in slide-in-from-top-2 duration-200">
                                            {groupedNotes[folder].length === 0 ? (
                                                <li className="px-4 py-2 text-xs text-slate-600 italic select-none">Empty folder</li>
                                            ) : (
                                                groupedNotes[folder].map(note => (
                                                    <li
                                                        key={note.id}
                                                        className={`note-item draggable ${currentNote?.id === note.id ? 'active' : ''} ${hoveredNodeId === note.id ? 'bg-slate-800/80 border-l-2 border-blue-500' : ''}`}
                                                        onClick={() => handleSelectNote(note.id)}
                                                        onMouseEnter={() => setHoveredNodeId(note.id)}
                                                        onMouseLeave={() => setHoveredNodeId(null)}
                                                        draggable
                                                        onDragStart={(e) => handleDragStart(e, note.id)}
                                                    >
                                                        <div className="note-title truncate">{note.title || 'Untitled'}</div>
                                                        <button
                                                            className="delete-button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                showConfirm('Delete Note', 'Confirm delete?', () => deleteNote(note.id), true);
                                                            }}
                                                        >
                                                            &times;
                                                        </button>
                                                    </li>
                                                ))
                                            )}
                                        </ul>
                                    )}
                                </div>
                            ))}

                            {/* Render Root Notes */}
                            <ul className="note-list mt-2">
                                {groupedNotes['ROOT'].map((note) => (
                                    <li
                                        key={note.id}
                                        className={`note-item draggable ${currentNote?.id === note.id ? 'active' : ''} ${hoveredNodeId === note.id ? 'bg-slate-800/80 border-l-2 border-blue-500' : ''}`}
                                        onClick={() => handleSelectNote(note.id)}
                                        onMouseEnter={() => setHoveredNodeId(note.id)}
                                        onMouseLeave={() => setHoveredNodeId(null)}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, note.id)}
                                    >
                                        <div className="note-info overflow-hidden">
                                            <div className="note-title truncate">{note.title || 'Untitled'}</div>
                                            <div className="note-date">
                                                {new Date(note.updatedAt).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <button
                                            className="delete-button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                showConfirm(
                                                    'Delete Note',
                                                    'Move this note to trash?',
                                                    () => deleteNote(note.id),
                                                    true
                                                );
                                            }}
                                            title="Move to Trash"
                                        >
                                            &times;
                                        </button>
                                    </li>
                                ))}
                            </ul>

                            {/* Render Trash Bin - Distinct Section */}
                            {/* Render Trash Bin - Distinct Section */}
                        </div>
                    )}
                </div>

                {/* Sidebar Footer: Trash + Actions */}
                <div className="border-t border-slate-800/50 bg-slate-900/50">
                    {/* Trash Section */}
                    <div className="px-1 border-b border-slate-800/30">
                        <div
                            className="flex items-center gap-2 px-3 py-3 text-red-400/90 hover:text-red-300 cursor-pointer transition-colors"
                            onClick={() => toggleFolder('TRASH_BIN')}
                        >
                            <div className={`transform transition-transform duration-200 ${expandedFolders.has('TRASH_BIN') ? 'rotate-90' : ''}`}>
                                <ChevronRight size={14} />
                            </div>
                            <div className="flex items-center gap-2 flex-1">
                                <span className="text-xs font-bold uppercase tracking-wider">Trash Bin</span>
                                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full">{trashCount}</span>
                            </div>
                        </div>

                        {expandedFolders.has('TRASH_BIN') && (
                            <div className="pl-2 pr-2 pb-4 max-h-60 overflow-y-auto">
                                {trash.length === 0 ? (
                                    <div className="px-4 py-2 text-xs text-slate-600 italic select-none">Trash is empty</div>
                                ) : (
                                    <>
                                        {/* Trashed Folders */}
                                        {Object.keys(trashGroups).filter(k => k !== 'ROOT').sort().map(folder => (
                                            <div key={folder} className="mb-2">
                                                <div className="flex items-center justify-between px-2 py-1 text-slate-500 rounded bg-slate-800/20 mb-1">
                                                    <div className="flex items-center gap-2 overflow-hidden">
                                                        <Folder size={12} />
                                                        <span className="text-xs truncate">{folder}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); restoreFolder(folder); }}
                                                            className="p-1 hover:text-green-400"
                                                            title="Restore Folder"
                                                        >
                                                            <Upload size={12} className="rotate-90" />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); permanentlyDeleteFolder(folder); }}
                                                            className="p-1 hover:text-red-400"
                                                            title="Delete Forever"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                </div>
                                                <ul className="pl-4 space-y-0.5 border-l border-slate-800 ml-1">
                                                    {trashGroups[folder].map(note => (
                                                        <li key={note.id} className="note-item opacity-60 hover:opacity-100 group">
                                                            <div className="note-info overflow-hidden">
                                                                <div className="note-title line-through text-slate-500 group-hover:text-slate-400 transition-colors text-xs">{note.title || 'Untitled'}</div>
                                                            </div>
                                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <button
                                                                    className="p-1 hover:text-green-400 text-slate-600"
                                                                    onClick={(e) => { e.stopPropagation(); restoreNoteAsRoot(note.id); }}
                                                                    title="Restore to Root"
                                                                >
                                                                    <Upload size={12} className="rotate-90" />
                                                                </button>
                                                                <button
                                                                    className="p-1 hover:text-red-500 text-slate-600"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        showConfirm('Delete Note', 'Permanently delete this note?', () => permanentlyDeleteNote(note.id), true);
                                                                    }}
                                                                    title="Delete Forever"
                                                                >
                                                                    &times;
                                                                </button>
                                                            </div>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))}

                                        {/* Trashed Root Notes */}
                                        <ul className="space-y-0.5 mt-2">
                                            {trashGroups['ROOT'].map(note => (
                                                <li key={note.id} className="note-item opacity-60 hover:opacity-100 group">
                                                    <div className="note-info overflow-hidden">
                                                        <div className="note-title line-through text-slate-500 group-hover:text-slate-400 transition-colors text-xs">{note.title || 'Untitled'}</div>
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button
                                                            className="p-1 hover:text-green-400 text-slate-600"
                                                            onClick={(e) => { e.stopPropagation(); restoreNote(note.id); }}
                                                            title="Restore"
                                                        >
                                                            <Upload size={12} className="rotate-90" />
                                                        </button>
                                                        <button
                                                            className="p-1 hover:text-red-500 text-slate-600"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                showConfirm('Delete Note', 'Permanently delete this note?', () => permanentlyDeleteNote(note.id), true);
                                                            }}
                                                            title="Delete Forever"
                                                        >
                                                            &times;
                                                        </button>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </aside>

            <div
                className="main-content-wrapper"
                onClick={() => isSidebarOpen && setIsSidebarOpen(false)}
            >
                {/* Header */}
                <header className="write-header">
                    <button
                        className="icon-button"
                        title="Menu"
                        onClick={toggleSidebar}
                    >
                        <Menu size={20} />
                    </button>

                    <div className="header-center flex items-center gap-2">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500">
                            <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
                            <path d="M12 20h9" />
                        </svg>
                        <span className="text-lg font-bold bg-gradient-to-r from-blue-400 to-blue-600 bg-clip-text text-transparent">Kakograph</span>
                    </div>

                    <div className="header-actions">
                        {/* Toggle Graph View */}
                        <button
                            className={`icon-button ${viewMode === 'graph' ? 'text-blue-400' : ''}`}
                            onClick={() => setViewMode(viewMode === 'editor' ? 'graph' : 'editor')}
                            title={viewMode === 'editor' ? "View Graph" : "View Editor"}
                        >
                            {viewMode === 'editor' ? <Network size={20} /> : <PenTool size={20} />}
                        </button>

                        {/* Settings Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                                className="icon-button"
                                title="Settings"
                            >
                                <Settings size={18} />
                            </button>
                            {showSettingsMenu && (
                                <div
                                    className="absolute right-0 top-full mt-1 w-48 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-[100] py-1 animate-in fade-in slide-in-from-top-2 duration-150"
                                    onMouseLeave={() => setShowSettingsMenu(false)}
                                >
                                    {/* Lock/Unlock Session */}
                                    {hasProtectedSession ? (
                                        <button
                                            onClick={() => { handleLock(); setShowSettingsMenu(false); }}
                                            className="w-full px-4 py-2 text-left text-sm text-orange-400 hover:bg-slate-800 flex items-center gap-3"
                                        >
                                            <Lock size={16} />
                                            Lock Session
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => { setShowPinDialog(true); setShowSettingsMenu(false); }}
                                            className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 flex items-center gap-3"
                                        >
                                            <LockOpen size={16} />
                                            Set PIN
                                        </button>
                                    )}
                                    <div className="border-t border-slate-800 my-1" />
                                    {/* Export */}
                                    <button
                                        onClick={() => { handleExport(); setShowSettingsMenu(false); }}
                                        className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 flex items-center gap-3"
                                    >
                                        <Download size={16} />
                                        Export Backup
                                    </button>
                                    {/* Import */}
                                    <button
                                        onClick={() => { handleImportTrigger(); setShowSettingsMenu(false); }}
                                        className="w-full px-4 py-2 text-left text-sm text-slate-300 hover:bg-slate-800 flex items-center gap-3"
                                    >
                                        <Upload size={16} />
                                        Import Backup
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Sync status */}
                        <div className="sync-status" title={`Status: ${syncStatus}`}>
                            {syncStatus === 'synced' && <Cloud size={16} className="text-green-500" />}
                            {syncStatus === 'syncing' && <Loader2 size={16} className="animate-spin text-blue-500" />}
                            {syncStatus === 'local' && <CloudOff size={16} className="text-slate-500" />}
                            {syncStatus === 'error' && <CloudOff size={16} className="text-red-500" />}
                        </div>

                        {/* Save status */}
                        {isSaving ? (
                            <span className="save-status">Saving...</span>
                        ) : lastSaved ? (
                            <span className="save-status saved">
                                <Check size={12} /> Saved
                            </span>
                        ) : null}

                        {/* New note button */}
                        <button className="icon-button" onClick={handleNewNote} title="New Note">
                            <Plus size={20} />
                        </button>
                    </div>
                </header>

                {/* Main Content Area */}
                {/* Main Content Area */}
                <main className="write-main relative flex overflow-hidden">
                    {/* Column 1: Editor */}
                    <div className="flex-1 h-full overflow-y-auto relative scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                        <RichEditor
                            content={content}
                            onChange={handleContentChange}
                            onSave={handleSave}
                            placeholder="Start writing..."
                            notes={notes}
                            onNoteSelect={selectNote}
                            className="bg-transparent min-h-full"
                            showToolbar={viewMode === 'editor'}
                        />
                    </div>

                    {/* Column 2: Right Sidebar (Graph + ToC) */}
                    {viewMode === 'editor' && currentNote && (
                        <aside className="w-80 border-l border-slate-800 hidden lg:flex flex-col bg-slate-900/30">
                            {/* Top: Interactive Graph */}
                            <div className="h-64 border-b border-slate-800 relative flex-shrink-0">
                                <div className="absolute top-2 left-4 z-10 pointer-events-none">
                                    <h3 className="font-semibold text-slate-400 text-xs uppercase tracking-wider">Interactive Graph</h3>
                                </div>
                                <NoteGraph
                                    notes={connectedNotes}
                                    onNodeClick={handleSelectNote}
                                    onNodeHover={setHoveredNodeId}
                                    highlightedNodeId={hoveredNodeId}
                                    className="bg-transparent"
                                />
                            </div>

                            {/* Bottom: On This Page (Table of Contents) */}
                            <div className="flex-1 overflow-y-auto p-6">
                                <h3 className="font-semibold text-slate-400 text-xs uppercase tracking-wider mb-4">On This Page</h3>
                                <TableOfContents content={content} />
                            </div>
                        </aside>
                    )}

                    {viewMode === 'graph' && (
                        <NoteGraph
                            notes={notes}
                            onNodeClick={handleGraphNodeClick}
                            onNodeHover={setHoveredNodeId}
                            highlightedNodeId={hoveredNodeId}
                            className="absolute inset-0 bg-slate-900 z-10"
                        />
                    )}
                </main>
            </div>

            <Modal
                isOpen={modalConfig.isOpen}
                onClose={closeModal}
                title={modalConfig.title}
                description={modalConfig.description}
                type={modalConfig.type}
                onConfirm={modalConfig.onConfirm}
                isDestructive={modalConfig.isDestructive}
            />
        </div>
    );
}
