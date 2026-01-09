'use client';

/**
 * BlockNote Rich Text Editor
 * Notion-like block-based editing experience
 */

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import "./block-editor.css";

import {
    BlockNoteEditor,
    PartialBlock,
    BlockNoteSchema,
    defaultInlineContentSpecs,
} from "@blocknote/core";
import {
    useCreateBlockNote,
    DefaultReactSuggestionItem,
    createReactInlineContentSpec,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useCallback, useEffect, useMemo, useRef, useState, createContext, useContext } from "react";
import { compressImage } from "@/lib/image-utils";
import { FileText, Plus } from "lucide-react";

// Context to provide live note titles and resolution
const NoteTitleContext = createContext<{
    idToTitle: Record<string, string>;
    titleToId: Record<string, string>;
}>({ idToTitle: {}, titleToId: {} });

// Custom inline content spec for Wiki Links
const WikiLink = createReactInlineContentSpec(
    {
        type: "wikiLink",
        propSchema: {
            noteId: { default: "" },
            noteTitle: { default: "" },
        },
        content: "none",
    },
    {
        render: (props) => {
            const { idToTitle, titleToId } = useContext(NoteTitleContext);
            const noteId = props.inlineContent.props.noteId;
            const noteTitle = props.inlineContent.props.noteTitle;

            // A note exists if either its ID is valid OR a note with its exact title exists
            const resolvedId = idToTitle[noteId] ? noteId : titleToId[noteTitle];
            const exists = !!resolvedId;
            const title = idToTitle[noteId] || noteTitle;

            return (
                <span
                    className="wiki-link"
                    data-id={resolvedId || noteId}
                    data-is-unresolved={!exists}
                >
                    {title}
                </span>
            );
        },
    }
);

// Create custom schema with wiki links
const schema = BlockNoteSchema.create({
    inlineContentSpecs: {
        ...defaultInlineContentSpecs,
        wikiLink: WikiLink,
    },
});

// Type for our custom editor
type CustomBlockNoteEditor = typeof schema.BlockNoteEditor;

// Props interface matching the TipTap RichEditor for drop-in replacement
interface BlockEditorProps {
    content?: string;
    onChange?: (content: string) => void;
    onSave?: () => void;
    placeholder?: string;
    className?: string;
    editable?: boolean;
    showToolbar?: boolean;
    notes?: Array<{ id: string; title: string }>;
    onNoteSelect?: (id: string) => void;
    // NEW: Callback to create a new note with a given title, returns the new note ID
    onCreateNote?: (title: string, switchToNote?: boolean) => Promise<string | undefined>;
    // Conflict Resolution Props
    conflictContent?: string;
    onResolveConflict?: () => void;
    // Expose editor controls to parent
    onEditorReady?: (controls: { undo: () => void; redo: () => void }) => void;
}

// Helper: Convert HTML to BlockNote blocks
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function htmlToBlocks(
    editor: any,
    html: string
): Promise<PartialBlock[]> {
    if (!html || html.trim() === '' || html === '<p></p>') {
        return [{ type: "paragraph" }];
    }
    try {
        const blocks = await editor.tryParseHTMLToBlocks(html);
        return blocks.length > 0 ? blocks : [{ type: "paragraph" }];
    } catch (error) {
        console.warn("Failed to parse HTML to blocks:", error);
        // Return plain text as content (BlockNote accepts string directly)
        const plainText = html.replace(/<[^>]*>/g, '');
        return [{ type: "paragraph", content: plainText }];
    }
}

// Helper: Convert BlockNote blocks to HTML
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function blocksToHtml(editor: any): Promise<string> {
    try {
        return await editor.blocksToHTMLLossy(editor.document);
    } catch (error) {
        console.warn("Failed to convert blocks to HTML:", error);
        return "";
    }
}

import { WikiLinkController } from "./WikiLinkController";

// Wiki Link item type for our custom data
export type WikiLinkData = {
    noteId: string;
    noteTitle: string;
    isCreateNew?: boolean;
};

// Custom Wiki Link Suggestion Menu Component
export function WikiLinkSuggestionMenu({
    items,
    selectedIndex,
    onItemClick,
}: {
    items: Array<DefaultReactSuggestionItem & { data?: WikiLinkData }>;
    selectedIndex: number;
    onItemClick?: (item: DefaultReactSuggestionItem & { data?: WikiLinkData }) => void;
}) {
    if (items.length === 0) {
        return (
            <div
                className="wiki-link-menu bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden p-2 text-xs text-slate-400"
                onMouseDown={(e) => e.preventDefault()}
                tabIndex={0}
            >
                Start typing to search or create a note
            </div>
        );
    }

    return (
        <div
            className="wiki-link-menu bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden flex flex-col min-w-[200px] max-h-[300px] overflow-y-auto"
            onMouseDown={(e) => e.preventDefault()}
            tabIndex={0}
        >
            {items.map((item, index) => (
                <button
                    key={item.data?.noteId || item.title}
                    className={`flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${index === selectedIndex
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-200 hover:bg-slate-700'
                        }`}
                    onClick={() => onItemClick?.(item)}
                >
                    {item.data?.isCreateNew ? (
                        <Plus size={14} className={index === selectedIndex ? 'text-white' : 'text-green-400'} />
                    ) : (
                        <FileText size={14} className={index === selectedIndex ? 'text-white' : 'text-slate-400'} />
                    )}
                    <span className="truncate">
                        {item.data?.isCreateNew ? `Create "${item.data.noteTitle}"` : (item.data?.noteTitle || item.title)}
                    </span>
                </button>
            ))}
        </div>
    );
}

export function BlockEditor({
    content = '',
    onChange,
    onSave,
    placeholder = 'Start writing, or type "/" for commands...',
    className = '',
    editable = true,
    showToolbar = true,
    notes = [],
    onNoteSelect,
    onCreateNote,
    conflictContent,
    onResolveConflict,
    onEditorReady,
}: BlockEditorProps) {
    const isProgrammaticUpdate = useRef(false);
    const lastContentRef = useRef(content);
    const [isReady, setIsReady] = useState(false);

    // Track notes in ref to access inside suggestion (closure) without re-init editor
    const notesRef = useRef(notes);
    useEffect(() => {
        notesRef.current = notes;
    }, [notes]);

    // Memoize title maps for dynamic wiki link titles and resolution
    const titleMaps = useMemo(() => {
        const idToTitle: Record<string, string> = {};
        const titleToId: Record<string, string> = {};
        notes?.forEach(n => {
            idToTitle[n.id] = n.title;
            titleToId[n.title] = n.id;
        });
        return { idToTitle, titleToId };
    }, [notes]);

    // Track callbacks in refs to avoid re-creating suggestion menu
    const onNoteSelectRef = useRef(onNoteSelect);
    const onCreateNoteRef = useRef(onCreateNote);
    useEffect(() => {
        onNoteSelectRef.current = onNoteSelect;
        onCreateNoteRef.current = onCreateNote;
    }, [onNoteSelect, onCreateNote]);

    // Get wiki link suggestion items based on query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const getWikiLinkItems = useCallback(async (query: string, editorInstance: any): Promise<Array<DefaultReactSuggestionItem & { data?: WikiLinkData }>> => {
        const currentNotes = notesRef.current;
        const lowerQuery = query.toLowerCase().trim();

        // Filter notes by title
        const filteredNotes: Array<DefaultReactSuggestionItem & { data?: WikiLinkData }> = currentNotes
            .filter(note => note.title.toLowerCase().includes(lowerQuery))
            .slice(0, 8)
            .map(note => ({
                title: note.title,
                onItemClick: () => {
                    // Ensure focus is in the editor before inserting
                    editorInstance.focus();
                    // Insert proper wiki link inline content with data-id for graph and click handling
                    editorInstance.insertInlineContent([
                        {
                            type: "wikiLink",
                            props: {
                                noteId: note.id,
                                noteTitle: note.title,
                            },
                        },
                    ]);
                },
                data: {
                    noteId: note.id,
                    noteTitle: note.title,
                },
            }));

        // Add "Create new" option if:
        // 1. Query is not empty
        // 2. No exact match exists
        const hasExactMatch = currentNotes.some(
            note => note.title.toLowerCase() === lowerQuery
        );

        if (query.trim() && !hasExactMatch && onCreateNoteRef.current) {
            const noteTitle = query.trim();
            filteredNotes.push({
                title: `Create "${noteTitle}"`,
                onItemClick: async () => {
                    // Create the note first to get its ID
                    let newNoteId: string | undefined;
                    if (onCreateNoteRef.current) {
                        newNoteId = await onCreateNoteRef.current(noteTitle, false); // false = stay in current note
                    }

                    // Re-focus the editor before insertion, especially important after async note creation
                    editorInstance.focus();

                    // Insert proper wiki link with the new note's ID if available
                    editorInstance.insertInlineContent([
                        {
                            type: "wikiLink",
                            props: {
                                noteId: newNoteId || '',
                                noteTitle: noteTitle,
                            },
                        },
                    ]);
                },
                data: {
                    noteId: '__create_new__',
                    noteTitle: noteTitle,
                    isCreateNew: true,
                },
            });
        }

        return filteredNotes;
    }, []);

    // Custom upload handler for images
    const handleUpload = useCallback(async (file: File): Promise<string> => {
        if (file.type.startsWith('image/')) {
            try {
                return await compressImage(file);
            } catch (error) {
                console.error('Failed to compress image:', error);
                throw error;
            }
        }
        // For non-image files, return a data URL
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }, []);

    // Create editor instance with custom schema for wiki links
    const editor = useCreateBlockNote({
        schema,
        uploadFile: handleUpload,
        domAttributes: {
            editor: {
                class: "block-editor-content",
            },
        },
    });

    // Initialize content from HTML on first load
    const hasInitialized = useRef(false);

    useEffect(() => {
        if (!editor) return;

        // First-time initialization
        if (!hasInitialized.current && content) {
            hasInitialized.current = true;
            isProgrammaticUpdate.current = true;

            htmlToBlocks(editor, content).then((blocks) => {
                editor.replaceBlocks(editor.document, blocks);
                lastContentRef.current = content;
                isProgrammaticUpdate.current = false;
                setIsReady(true);
            }).catch((error) => {
                console.error("Failed to initialize editor content:", error);
                isProgrammaticUpdate.current = false;
                setIsReady(true);
            });
            return;
        }

        // Subsequent updates - only update if content changed externally and editor not focused
        if (hasInitialized.current && content !== lastContentRef.current && !editor.isFocused) {
            isProgrammaticUpdate.current = true;

            htmlToBlocks(editor, content).then((blocks) => {
                editor.replaceBlocks(editor.document, blocks);
                lastContentRef.current = content;
                isProgrammaticUpdate.current = false;
            }).catch((error) => {
                console.error("Failed to update editor content:", error);
                isProgrammaticUpdate.current = false;
            });
        }

        if (!isReady) {
            setIsReady(true);
        }
    }, [editor, content, isReady]);

    // Handle content changes - convert back to HTML for compatibility
    const changeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isMountedRef = useRef(true);

    // Cleanup on unmount
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
            if (changeTimeoutRef.current) {
                clearTimeout(changeTimeoutRef.current);
            }
        };
    }, []);

    const handleChange = useCallback(async () => {
        if (isProgrammaticUpdate.current || !editor || !isMountedRef.current) return;

        // Debounce changes to prevent rapid firing which can cause table index errors
        if (changeTimeoutRef.current) {
            clearTimeout(changeTimeoutRef.current);
        }

        changeTimeoutRef.current = setTimeout(async () => {
            // Double-check we're still mounted
            if (!isMountedRef.current) return;

            try {
                const html = await blocksToHtml(editor);
                if (html !== lastContentRef.current && isMountedRef.current) {
                    lastContentRef.current = html;
                    onChange?.(html);
                }
            } catch (error) {
                // Silently ignore BlockNote internal errors
                if (error instanceof RangeError || error instanceof TypeError) {
                    console.debug("BlockNote error (ignored):", (error as Error).message);
                    return;
                }
                console.error("Error converting blocks to HTML:", error);
            }
        }, 100); // 100ms debounce
    }, [editor, onChange]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Cmd/Ctrl + S to save
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                onSave?.();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onSave]);

    // Expose undo/redo to parent component
    useEffect(() => {
        if (editor && onEditorReady) {
            onEditorReady({
                undo: () => editor.undo(),
                redo: () => editor.redo(),
            });
        }
    }, [editor, onEditorReady]);

    // Handle WikiLink clicks
    useEffect(() => {
        if (!editor || !onNoteSelect) return;

        const handleClick = (e: Event) => {
            const target = e.target as HTMLElement;
            const link = target.closest('.wiki-link') as HTMLElement;
            if (link) {
                const noteId = link.getAttribute('data-id');
                const isUnresolved = link.getAttribute('data-is-unresolved') === 'true';
                const title = (link.textContent || '').trim();

                // If unresolved, try to resolve by title first before creating a new one
                if (isUnresolved) {
                    const resolvedId = titleMaps.titleToId[title];
                    if (resolvedId) {
                        // Found a matching note by title! Navigate to it instead of creating
                        onNoteSelect?.(resolvedId);
                        return;
                    }

                    if (onCreateNote) {
                        // Simple approach: create note and navigate immediately
                        // The wiki link will resolve via titleToId when user returns to this note
                        onCreateNote(title, true); // switchToNote: true - let it handle navigation
                    }
                } else if (noteId) {
                    onNoteSelect?.(noteId);
                }
            }
        };

        // Access the DOM element through the editor
        const editorElement = document.querySelector('.bn-editor');
        editorElement?.addEventListener('click', handleClick);

        return () => {
            editorElement?.removeEventListener('click', handleClick);
        };
    }, [editor, onNoteSelect, titleMaps, onCreateNote]);

    // Conflict view - render two editors side by side
    if (conflictContent && conflictContent.trim()) {
        return (
            <div className={`block-editor ${className} flex flex-col h-full`}>
                {/* Conflict Header */}
                <div className="bg-red-500/10 border-b border-red-500/20 p-4 flex items-center justify-between">
                    <div>
                        <h3 className="text-red-400 font-bold flex items-center gap-2">
                            ⚠️ Conflict Detected
                        </h3>
                        <p className="text-xs text-[var(--text-secondary)] mt-1">
                            This note was modified on another device.
                            <br />
                            <strong>Left:</strong> Your version (Editable). <strong>Right:</strong> Their version.
                            <br />
                            Manually copy what you want to keep from Right to Left, then click Resolve.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={onResolveConflict}
                            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded font-medium transition-colors shadow-sm"
                        >
                            ✅ Resolve & Save
                        </button>
                    </div>
                </div>

                {/* Split Editors */}
                <div className="flex-1 flex overflow-hidden">
                    {/* LEFT: Local (Editable) */}
                    <div className="flex-1 flex flex-col border-r border-[var(--border-primary)] relative">
                        <div className="p-2 bg-[var(--surface-secondary)] text-xs text-center font-bold text-[var(--text-secondary)] border-b border-[var(--border-primary)]">
                            YOUR VERSION (EDIT HERE)
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <NoteTitleContext.Provider value={titleMaps}>
                                <BlockNoteView
                                    editor={editor}
                                    onChange={handleChange}
                                    editable={editable}
                                    theme="dark"
                                />
                            </NoteTitleContext.Provider>
                        </div>
                    </div>

                    {/* RIGHT: Remote (Read-Only) */}
                    <div className="flex-1 flex flex-col bg-[var(--surface-secondary)]/30">
                        <div className="p-2 bg-[var(--surface-secondary)] text-xs text-center font-bold text-red-400 border-b border-[var(--border-primary)]">
                            THEIR VERSION (READ ONLY)
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 prose prose-invert max-w-none opacity-80">
                            <div dangerouslySetInnerHTML={{ __html: conflictContent }} />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Normal editor mode
    return (
        <div className={`block-editor ${className} ${!editable ? 'readonly' : ''}`}>
            <NoteTitleContext.Provider value={titleMaps}>
                <BlockNoteView
                    editor={editor}
                    onChange={handleChange}
                    editable={editable}
                    theme="dark"
                    slashMenu={showToolbar}
                    formattingToolbar={showToolbar}
                >
                    {/* Wiki Link Controller for [[ trigger */}
                    <WikiLinkController
                        editor={editor}
                        getItems={getWikiLinkItems}
                    />
                </BlockNoteView>
            </NoteTitleContext.Provider>
        </div>
    );
}

export default BlockEditor;
