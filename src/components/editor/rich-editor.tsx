'use client';

/**
 * TipTap Rich Text Editor
 * Obsidian-level editing experience with Markdown support
 */

import { useEditor, EditorContent, Extension } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import { ResizableImage } from './resizable-image';
import Typography from '@tiptap/extension-typography';
import { common, createLowlight } from 'lowlight';
import Mention from '@tiptap/extension-mention';
import { getSuggestionConfig } from './suggestion';
import { compressImage } from '@/lib/image-utils';
import { useCallback, useEffect, useState, useRef } from 'react';

// New Extensions
import { Underline } from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Highlight } from '@tiptap/extension-highlight';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { TextAlign } from '@tiptap/extension-text-align';
import { CharacterCount } from '@tiptap/extension-character-count';

import { getCommandSuggestionConfig } from './command-suggestion';

import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    Strikethrough,
    Code,
    Quote,
    Link as LinkIcon,
    List,
    ListOrdered,
    CheckSquare,
    Heading1,
    Heading2,
    Heading3,
    Code2,
    Minus,
    Image as ImageIcon,
    Table as TableIcon,
    Palette,
    Highlighter,
    IndentDecrease,
    IndentIncrease,
    AlignLeft,
    AlignCenter,
    AlignRight,
    Subscript as SubIcon,
    Superscript as SuperIcon,
    Eraser,
    X
} from 'lucide-react';
import './rich-editor.css';

// Create lowlight instance with common languages
const lowlight = createLowlight(common);

// Custom extension to fix Keyboard interactions (Tab, Enter)
const KeyMapOverride = Extension.create({
    name: 'keyMapOverride',
    addKeyboardShortcuts() {
        return {
            Tab: () => {
                // 1. Code Block -> Indent 2 spaces
                if (this.editor.isActive('codeBlock')) {
                    return this.editor.commands.insertContent('  ');
                }

                // 2. Lists -> Let TipTap handle indent (nesting)
                if (this.editor.isActive('bulletList') ||
                    this.editor.isActive('orderedList') ||
                    this.editor.isActive('taskList')) {
                    return false;
                }

                // 3. Normal Text -> Insert 4 spaces (Tab simulation)
                return this.editor.commands.insertContent('    ');
            },
            Enter: () => {
                if (this.editor.isActive('codeBlock')) {
                    this.editor.commands.insertContent('\n');
                    return true;
                }
                return false;
            },
        };
    },
    priority: 100,
});

interface RichEditorProps {
    content?: string;
    onChange?: (content: string) => void;
    onSave?: () => void;
    placeholder?: string;
    className?: string;
    editable?: boolean;
    showToolbar?: boolean;
    notes?: Array<{ id: string; title: string }>;
    onNoteSelect?: (id: string) => void;
    // NEW: Conflict Resolution Props
    conflictContent?: string;
    onResolveConflict?: () => void;
    // Expose editor controls to parent
    onEditorReady?: (controls: { undo: () => void; redo: () => void }) => void;
}

export function RichEditor({
    content = '',
    onChange,
    onSave,
    placeholder = 'Start writing...',
    className = '',
    editable = true,
    showToolbar = true,
    notes = [],
    onNoteSelect,
    conflictContent,    // New Prop
    onResolveConflict,  // New Prop
    onEditorReady,      // Expose undo/redo
}: RichEditorProps) {
    const isProgrammaticUpdate = useRef(false);

    // Link modal state
    const [showLinkModal, setShowLinkModal] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');
    const [linkText, setLinkText] = useState('');
    const [needsLinkText, setNeedsLinkText] = useState(false);

    // Color picker modal states
    const [showTextColorModal, setShowTextColorModal] = useState(false);
    const [showHighlightModal, setShowHighlightModal] = useState(false);

    // Table menu state
    const [showTableMenu, setShowTableMenu] = useState(false);
    const [tableCellPosition, setTableCellPosition] = useState<{ top: number; right: number } | null>(null);

    // Predefined color palette
    const colorPalette = [
        '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
        '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
        '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e', '#64748b',
        '#000000', '#ffffff'
    ];

    // Track notes in ref to access inside suggestion (closure) without re-init editor
    const notesRef = useRef(notes);
    useEffect(() => {
        notesRef.current = notes;
    }, [notes]);

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({
                codeBlock: false, // Use lowlight instead
                // history: true, // Invalid property in this version
            }),
            Placeholder.configure({
                placeholder: placeholder,
                emptyNodeClass: 'is-editor-empty',
            }),
            Underline,
            TextStyle,
            Color,
            Highlight.configure({ multicolor: true }),
            Table.configure({
                resizable: true,
            }),
            TableRow,
            TableHeader,
            TableCell,
            Subscript,
            Superscript,
            TextAlign.configure({
                types: ['heading', 'paragraph'],
            }),
            CharacterCount,
            Mention.configure({
                HTMLAttributes: {
                    class: 'wiki-link',
                },
                suggestion: getSuggestionConfig(() => notesRef.current),
            }),
            // Slash Command Mention
            Mention.extend({
                name: 'slashCommand',
            }).configure({
                HTMLAttributes: {
                    class: 'slash-command',
                },
                suggestion: getCommandSuggestionConfig(),
            }),
            CodeBlockLowlight.configure({
                lowlight,
            }),
            TaskList,
            TaskItem.configure({
                nested: true,
            }),
            Link.configure({
                openOnClick: false,
                autolink: true,
                HTMLAttributes: {
                    class: 'editor-link',
                },
            }),
            ResizableImage,
            Typography,
            KeyMapOverride,
        ],
        content: content,
        editable,
        editorProps: {
            attributes: {
                class: 'rich-editor-content prose prose-invert max-w-none focus:outline-none',
            },
            handlePaste: (view, event) => {
                const items = Array.from(event.clipboardData?.items || []);
                const images = items.filter(item => item.type.startsWith('image'));

                if (images.length === 0) return false;

                event.preventDefault();

                images.forEach(item => {
                    const file = item.getAsFile();
                    if (file) {
                        compressImage(file).then(base64 => {
                            const { schema } = view.state;
                            const node = schema.nodes.image.create({ src: base64 });
                            const transaction = view.state.tr.replaceSelectionWith(node);
                            view.dispatch(transaction);
                        }).catch(console.error);
                    }
                });

                return true;
            },
        },
        onUpdate: ({ editor }) => {
            // Skip if this update was triggered by setContent
            if (isProgrammaticUpdate.current) return;
            onChange?.(editor.getHTML());
        },
    });

    // Second Editor for Conflict View (Read-Only)
    const conflictEditor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({ codeBlock: false }),
            CodeBlockLowlight.configure({ lowlight }),
            Table.configure({ resizable: true }),
            TableRow, TableHeader, TableCell,
            ResizableImage,
        ],
        content: conflictContent || '',
        editable: false,
        editorProps: {
            attributes: {
                class: 'rich-editor-content prose prose-invert max-w-none focus:outline-none opacity-80',
            },
        },
    }, [conflictContent]); // Re-create if content changes

    // Update conflict editor content when prop changes
    useEffect(() => {
        if (conflictEditor && conflictContent && conflictContent !== conflictEditor.getHTML()) {
            conflictEditor.commands.setContent(conflictContent);
        }
    }, [conflictContent, conflictEditor]);

    // Handle Wiki Link Clicks
    useEffect(() => {
        if (!editor || !onNoteSelect) return;

        const handleClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            // Check if clicked element is a wiki link
            if (target.closest('.wiki-link')) {
                const link = target.closest('.wiki-link') as HTMLElement;
                const noteId = link.getAttribute('data-id');
                if (noteId) {
                    onNoteSelect(noteId);
                }
            }
        };

        const viewDom = editor.view.dom;
        viewDom.addEventListener('click', handleClick);

        return () => {
            viewDom.removeEventListener('click', handleClick);
        };
    }, [editor, onNoteSelect]);

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

    // Update content when prop changes
    useEffect(() => {
        if (!editor) return;

        // Skip if editor is focused - user is actively typing
        // This prevents cursor jump when save/sync triggers loadNotes()
        if (editor.isFocused) return;

        // Only update if content actually differs
        if (content !== editor.getHTML()) {
            isProgrammaticUpdate.current = true;
            editor.commands.setContent(content);
            isProgrammaticUpdate.current = false;
        }
    }, [content, editor]);

    // Expose undo/redo to parent component
    useEffect(() => {
        if (editor && onEditorReady) {
            onEditorReady({
                undo: () => editor.chain().focus().undo().run(),
                redo: () => editor.chain().focus().redo().run(),
            });
        }
    }, [editor, onEditorReady]);

    // Track selected cell position for table menu
    useEffect(() => {
        if (!editor) return;

        const updateCellPosition = () => {
            if (editor.isActive('table')) {
                // Method 1: Find selected cells (multi-select)
                const selectedCell = document.querySelector('.ProseMirror .selectedCell') as HTMLElement;
                if (selectedCell) {
                    const rect = selectedCell.getBoundingClientRect();
                    setTableCellPosition({
                        top: rect.top + 4,
                        right: window.innerWidth - rect.right + 4,
                    });
                    return;
                }

                // Method 2: Find cell containing cursor using DOM selection
                const selection = window.getSelection();
                if (selection && selection.anchorNode) {
                    let node: Node | null = selection.anchorNode;
                    // Walk up the DOM tree to find td or th
                    while (node && node !== document.body) {
                        if (node instanceof HTMLElement && (node.tagName === 'TD' || node.tagName === 'TH')) {
                            const rect = node.getBoundingClientRect();
                            setTableCellPosition({
                                top: rect.top + 4,
                                right: window.innerWidth - rect.right + 4,
                            });
                            return;
                        }
                        node = node.parentNode;
                    }
                }
            }
            setTableCellPosition(null);
        };

        // Update on selection change
        editor.on('selectionUpdate', updateCellPosition);
        editor.on('focus', updateCellPosition);

        // Also listen to transaction for any changes
        editor.on('transaction', updateCellPosition);

        // Initial update
        updateCellPosition();

        return () => {
            editor.off('selectionUpdate', updateCellPosition);
            editor.off('focus', updateCellPosition);
            editor.off('transaction', updateCellPosition);
        };
    }, [editor]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && editor) {
            compressImage(file).then(base64 => {
                editor.chain().focus().insertContent({
                    type: 'image',
                    attrs: { src: base64 }
                }).run();
            }).catch(console.error);
        }
        if (e.target) e.target.value = '';
    };

    const openLinkModal = useCallback(() => {
        if (!editor) return;
        const previousUrl = editor.getAttributes('link').href || '';
        const { from, to } = editor.state.selection;
        setLinkUrl(previousUrl || 'https://');
        setLinkText('');
        setNeedsLinkText(from === to);
        setShowLinkModal(true);
    }, [editor]);

    const handleLinkSubmit = useCallback(() => {
        if (!editor) return;
        if (!linkUrl || linkUrl === 'https://') {
            // Remove link if URL is empty
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
        } else if (needsLinkText && linkText) {
            // Insert new link with text
            editor.chain().focus().insertContent(`<a href="${linkUrl}">${linkText}</a>`).run();
        } else if (!needsLinkText) {
            // Apply link to selected text
            editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
        }
        setShowLinkModal(false);
        setLinkUrl('');
        setLinkText('');
    }, [editor, linkUrl, linkText, needsLinkText]);

    const indent = useCallback(() => {
        if (!editor) return;
        if (editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('taskList')) {
            editor.chain().focus().sinkListItem('listItem').run();
        } else {
            editor.chain().focus().insertContent('    ').run();
        }
    }, [editor]);

    const outdent = useCallback(() => {
        if (!editor) return;
        if (editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('taskList')) {
            editor.chain().focus().liftListItem('listItem').run();
        }
    }, [editor]);

    if (!editor) {
        return null;
    }

    if (!editor) {
        return null;
    }

    // SPLIT VIEW MODE (If conflict detected)
    if (conflictContent && conflictEditor) {
        return (
            <div className={`rich-editor ${className} flex flex-col h-full`}>
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
                        {showToolbar && editable && (
                            <div className="editor-toolbar sticky top-0 z-10 border-b border-[var(--border-primary)]">
                                {/* Simplified Toolbar for Split View space constraint */}
                                <div className="toolbar-group">
                                    <button onClick={() => editor.chain().focus().toggleBold().run()} className={editor.isActive('bold') ? 'is-active' : ''}><Bold size={14} /></button>
                                    <button onClick={() => editor.chain().focus().toggleItalic().run()} className={editor.isActive('italic') ? 'is-active' : ''}><Italic size={14} /></button>
                                    <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={editor.isActive('bulletList') ? 'is-active' : ''}><List size={14} /></button>
                                </div>
                            </div>
                        )}
                        <EditorContent editor={editor} className="rich-editor-content flex-1 overflow-y-auto p-4" />
                    </div>

                    {/* RIGHT: Remote (Read-Only) */}
                    <div className="flex-1 flex flex-col bg-[var(--surface-secondary)]/30">
                        <div className="p-2 bg-[var(--surface-secondary)] text-xs text-center font-bold text-red-400 border-b border-[var(--border-primary)]">
                            THEIR VERSION (READ ONLY)
                        </div>
                        <EditorContent editor={conflictEditor} className="rich-editor-content flex-1 overflow-y-auto p-4 select-text" />
                    </div>
                </div>
            </div>
        );
    }

    // NORMAL MODE
    return (
        <div className={`rich-editor ${className} ${!editable ? 'readonly' : ''}`}>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                className="hidden"
                accept="image/*"
            />

            {showToolbar && editable && (
                <div className="rich-editor-toolbar scrollbar-hide">
                    {/* Text Formatting Group */}
                    <div className="toolbar-group">
                        <button
                            onClick={() => editor.chain().focus().toggleBold().run()}
                            className={editor.isActive('bold') ? 'is-active' : ''}
                            title="Bold (Cmd+B)"
                        >
                            <Bold size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleItalic().run()}
                            className={editor.isActive('italic') ? 'is-active' : ''}
                            title="Italic (Cmd+I)"
                        >
                            <Italic size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleUnderline().run()}
                            className={editor.isActive('underline') ? 'is-active' : ''}
                            title="Underline (Cmd+U)"
                        >
                            <UnderlineIcon size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleStrike().run()}
                            className={editor.isActive('strike') ? 'is-active' : ''}
                            title="Strikethrough"
                        >
                            <Strikethrough size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleSubscript().run()}
                            className={editor.isActive('subscript') ? 'is-active' : ''}
                            title="Subscript"
                        >
                            <SubIcon size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleSuperscript().run()}
                            className={editor.isActive('superscript') ? 'is-active' : ''}
                            title="Superscript"
                        >
                            <SuperIcon size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
                            title="Clear Formatting"
                        >
                            <Eraser size={16} />
                        </button>
                    </div>

                    <div className="toolbar-separator" />

                    {/* Headings Group */}
                    <div className="toolbar-group">
                        <button
                            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                            className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}
                            title="Heading 1"
                        >
                            <Heading1 size={18} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                            className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}
                            title="Heading 2"
                        >
                            <Heading2 size={18} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                            className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''}
                            title="Heading 3"
                        >
                            <Heading3 size={18} />
                        </button>
                    </div>

                    <div className="toolbar-separator" />

                    {/* Lists & Indentation Group */}
                    <div className="toolbar-group">
                        <button
                            onClick={() => editor.chain().focus().toggleBulletList().run()}
                            className={editor.isActive('bulletList') ? 'is-active' : ''}
                            title="Bullet List"
                        >
                            <List size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleOrderedList().run()}
                            className={editor.isActive('orderedList') ? 'is-active' : ''}
                            title="Ordered List"
                        >
                            <ListOrdered size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleTaskList().run()}
                            className={editor.isActive('taskList') ? 'is-active' : ''}
                            title="Checklist"
                        >
                            <CheckSquare size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
                            disabled={!editor.can().sinkListItem('listItem')}
                            title="Indent"
                        >
                            <IndentIncrease size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().liftListItem('listItem').run()}
                            disabled={!editor.can().liftListItem('listItem')}
                            title="Outdent"
                        >
                            <IndentDecrease size={16} />
                        </button>
                    </div>

                    <div className="toolbar-separator" />

                    {/* Alignment Group */}
                    <div className="toolbar-group">
                        <button
                            onClick={() => editor.chain().focus().setTextAlign('left').run()}
                            className={editor.isActive({ textAlign: 'left' }) ? 'is-active' : ''}
                            title="Align Left"
                        >
                            <AlignLeft size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().setTextAlign('center').run()}
                            className={editor.isActive({ textAlign: 'center' }) ? 'is-active' : ''}
                            title="Align Center"
                        >
                            <AlignCenter size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().setTextAlign('right').run()}
                            className={editor.isActive({ textAlign: 'right' }) ? 'is-active' : ''}
                            title="Align Right"
                        >
                            <AlignRight size={16} />
                        </button>
                    </div>

                    <div className="toolbar-separator" />

                    {/* Colors Group */}
                    <div className="toolbar-group">
                        <button
                            onClick={() => setShowTextColorModal(true)}
                            title="Text Color"
                        >
                            <Palette size={16} />
                        </button>
                        <button
                            onClick={() => setShowHighlightModal(true)}
                            className={editor.isActive('highlight') ? 'is-active' : ''}
                            title="Highlight"
                        >
                            <Highlighter size={16} />
                        </button>
                    </div>

                    <div className="toolbar-separator" />

                    {/* Insert Group */}
                    <div className="toolbar-group">
                        <button
                            onClick={() => editor.chain().focus().toggleBlockquote().run()}
                            className={editor.isActive('blockquote') ? 'is-active' : ''}
                            title="Quote"
                        >
                            <Quote size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                            className={editor.isActive('codeBlock') ? 'is-active' : ''}
                            title="Code Block"
                        >
                            <Code2 size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleCode().run()}
                            className={editor.isActive('code') ? 'is-active' : ''}
                            title="Inline Code"
                        >
                            <Code size={16} />
                        </button>
                        <button
                            onClick={openLinkModal}
                            className={editor.isActive('link') ? 'is-active' : ''}
                            title="Add Link"
                        >
                            <LinkIcon size={16} />
                        </button>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            title="Upload Image"
                        >
                            <ImageIcon size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
                            title="Insert Table"
                        >
                            <TableIcon size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().setHorizontalRule().run()}
                            title="Horizontal Rule"
                        >
                            <Minus size={16} />
                        </button>
                    </div>
                </div>
            )}

            <div className="rich-editor-content-wrapper">
                <EditorContent editor={editor} className="rich-editor-content" />

                {/* Table Cell Menu - 3-dots button on selected cells */}
                {editor && editable && editor.isActive('table') && tableCellPosition && (
                    <div
                        className="table-cell-menu-trigger"
                        style={{
                            position: 'fixed',
                            top: tableCellPosition.top,
                            right: tableCellPosition.right,
                            zIndex: 100,
                        }}
                    >
                        <button
                            className="table-dots-btn"
                            onClick={() => setShowTableMenu(!showTableMenu)}
                            title="Table options"
                        >
                            ⋮
                        </button>
                        {showTableMenu && (
                            <div className="table-dropdown-menu">
                                <div className="menu-section">
                                    <span className="menu-label">Row</span>
                                    <button onClick={() => { editor.chain().focus().addRowBefore().run(); setShowTableMenu(false); }}>
                                        ↑ Add Above
                                    </button>
                                    <button onClick={() => { editor.chain().focus().addRowAfter().run(); setShowTableMenu(false); }}>
                                        ↓ Add Below
                                    </button>
                                    <button className="danger" onClick={() => { editor.chain().focus().deleteRow().run(); setShowTableMenu(false); }}>
                                        × Delete Row
                                    </button>
                                </div>
                                <div className="menu-section">
                                    <span className="menu-label">Column</span>
                                    <button onClick={() => { editor.chain().focus().addColumnBefore().run(); setShowTableMenu(false); }}>
                                        ← Add Left
                                    </button>
                                    <button onClick={() => { editor.chain().focus().addColumnAfter().run(); setShowTableMenu(false); }}>
                                        → Add Right
                                    </button>
                                    <button className="danger" onClick={() => { editor.chain().focus().deleteColumn().run(); setShowTableMenu(false); }}>
                                        × Delete Column
                                    </button>
                                </div>
                                <div className="menu-section">
                                    <button className="danger" onClick={() => { editor.chain().focus().deleteTable().run(); setShowTableMenu(false); }}>
                                        × Delete Table
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {editor.storage.characterCount && (
                    <div className="editor-status-bar">
                        {editor.storage.characterCount.characters()} characters
                    </div>
                )}
            </div>

            {/* Link Modal */}
            {showLinkModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowLinkModal(false)}>
                    <div
                        className="bg-[var(--surface-elevated)] rounded-lg shadow-xl p-6 w-full max-w-md mx-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Insert Link</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-[var(--text-secondary)] mb-1">URL</label>
                                <input
                                    type="url"
                                    value={linkUrl}
                                    onChange={(e) => setLinkUrl(e.target.value)}
                                    placeholder="https://example.com"
                                    className="w-full bg-[var(--surface-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] rounded-lg p-2 focus:border-[var(--accent-blue)] outline-none"
                                    autoFocus
                                />
                            </div>
                            {needsLinkText && (
                                <div>
                                    <label className="block text-sm text-[var(--text-secondary)] mb-1">Link Text</label>
                                    <input
                                        type="text"
                                        value={linkText}
                                        onChange={(e) => setLinkText(e.target.value)}
                                        placeholder="Click here"
                                        className="w-full bg-[var(--surface-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] rounded-lg p-2 focus:border-[var(--accent-blue)] outline-none"
                                    />
                                </div>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 mt-6">
                            <button
                                onClick={() => setShowLinkModal(false)}
                                className="px-4 py-2 text-sm font-medium rounded-lg transition-colors hover:bg-[var(--hover-bg)] text-[var(--text-secondary)]"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleLinkSubmit}
                                disabled={!linkUrl || (needsLinkText && !linkText)}
                                className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Insert Link
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Text Color Modal */}
            {showTextColorModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowTextColorModal(false)}>
                    <div
                        className="bg-[var(--surface-elevated)] rounded-lg shadow-xl p-4 w-full max-w-xs mx-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Text Color</h3>
                        <div className="grid grid-cols-5 gap-2 mb-4">
                            {colorPalette.map((color) => (
                                <button
                                    key={color}
                                    className="w-10 h-10 rounded-lg border-2 border-transparent hover:border-[var(--accent-blue)] transition-colors hover:scale-110"
                                    style={{ backgroundColor: color, boxShadow: color === '#ffffff' ? 'inset 0 0 0 1px var(--border-primary)' : undefined }}
                                    onClick={() => {
                                        editor.chain().focus().setColor(color).run();
                                        setShowTextColorModal(false);
                                    }}
                                    title={color}
                                />
                            ))}
                        </div>
                        <button
                            onClick={() => {
                                editor.chain().focus().unsetColor().run();
                                setShowTextColorModal(false);
                            }}
                            className="w-full py-2 text-sm font-medium rounded-lg transition-colors bg-[var(--surface-secondary)] hover:bg-[var(--hover-bg)] text-[var(--text-secondary)] flex items-center justify-center gap-2"
                        >
                            <X size={14} />
                            Clear Color
                        </button>
                    </div>
                </div>
            )}

            {/* Highlight Color Modal */}
            {showHighlightModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowHighlightModal(false)}>
                    <div
                        className="bg-[var(--surface-elevated)] rounded-lg shadow-xl p-4 w-full max-w-xs mx-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-3">Highlight Color</h3>
                        <div className="grid grid-cols-5 gap-2 mb-4">
                            {colorPalette.map((color) => (
                                <button
                                    key={color}
                                    className="w-10 h-10 rounded-lg border-2 border-transparent hover:border-[var(--accent-blue)] transition-colors hover:scale-110"
                                    style={{ backgroundColor: color, boxShadow: color === '#ffffff' ? 'inset 0 0 0 1px var(--border-primary)' : undefined }}
                                    onClick={() => {
                                        editor.chain().focus().toggleHighlight({ color }).run();
                                        setShowHighlightModal(false);
                                    }}
                                    title={color}
                                />
                            ))}
                        </div>
                        <button
                            onClick={() => {
                                editor.chain().focus().unsetHighlight().run();
                                setShowHighlightModal(false);
                            }}
                            className="w-full py-2 text-sm font-medium rounded-lg transition-colors bg-[var(--surface-secondary)] hover:bg-[var(--hover-bg)] text-[var(--text-secondary)] flex items-center justify-center gap-2"
                        >
                            <X size={14} />
                            Clear Highlight
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default RichEditor;
