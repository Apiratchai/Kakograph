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
} from "@blocknote/core";
import {
    useCreateBlockNote,
    SuggestionMenuController,
    getDefaultReactSlashMenuItems,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compressImage } from "@/lib/image-utils";

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
    // Conflict Resolution Props
    conflictContent?: string;
    onResolveConflict?: () => void;
    // Expose editor controls to parent
    onEditorReady?: (controls: { undo: () => void; redo: () => void }) => void;
}

// Helper: Convert HTML to BlockNote blocks
async function htmlToBlocks(
    editor: BlockNoteEditor,
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
async function blocksToHtml(editor: BlockNoteEditor): Promise<string> {
    try {
        return await editor.blocksToHTMLLossy(editor.document);
    } catch (error) {
        console.warn("Failed to convert blocks to HTML:", error);
        return "";
    }
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

    // Create editor instance
    const editor = useCreateBlockNote({
        uploadFile: handleUpload,
        domAttributes: {
            editor: {
                class: "block-editor-content",
            },
        },
    });

    // Initialize content from HTML
    useEffect(() => {
        if (!editor || !content) return;

        // Only set content on initial load or if content changed externally
        if (lastContentRef.current !== content && !editor.isFocused) {
            isProgrammaticUpdate.current = true;

            htmlToBlocks(editor, content).then((blocks) => {
                editor.replaceBlocks(editor.document, blocks);
                isProgrammaticUpdate.current = false;
                setIsReady(true);
            }).catch((error) => {
                console.error("Failed to initialize editor content:", error);
                isProgrammaticUpdate.current = false;
                setIsReady(true);
            });

            lastContentRef.current = content;
        } else if (!isReady) {
            setIsReady(true);
        }
    }, [editor, content, isReady]);

    // Handle content changes - convert back to HTML for compatibility
    const handleChange = useCallback(async () => {
        if (isProgrammaticUpdate.current || !editor) return;

        try {
            const html = await blocksToHtml(editor);
            lastContentRef.current = html;
            onChange?.(html);
        } catch (error) {
            console.error("Error converting blocks to HTML:", error);
        }
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
            // Check if clicked element is a wiki link (we'll add this class in custom inline content)
            if (target.closest('.wiki-link')) {
                const link = target.closest('.wiki-link') as HTMLElement;
                const noteId = link.getAttribute('data-id');
                if (noteId) {
                    onNoteSelect(noteId);
                }
            }
        };

        // Access the DOM element through the editor
        const editorElement = document.querySelector('.bn-editor');
        editorElement?.addEventListener('click', handleClick);

        return () => {
            editorElement?.removeEventListener('click', handleClick);
        };
    }, [editor, onNoteSelect]);

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
                            <BlockNoteView
                                editor={editor}
                                onChange={handleChange}
                                editable={editable}
                                theme="dark"
                            />
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
            <BlockNoteView
                editor={editor}
                onChange={handleChange}
                editable={editable}
                theme="dark"
                slashMenu={showToolbar}
                formattingToolbar={showToolbar}
            />
        </div>
    );
}

export default BlockEditor;
