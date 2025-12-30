'use client';

/**
 * TipTap Rich Text Editor
 * Obsidian-level editing experience with Markdown support
 */

import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Typography from '@tiptap/extension-typography';
import { common, createLowlight } from 'lowlight';
import Mention from '@tiptap/extension-mention';
import { getSuggestionConfig } from './suggestion';
import { compressImage } from '@/lib/image-utils';
import { useCallback, useEffect, useState, useRef } from 'react';
import {
    Bold,
    Italic,
    Strikethrough,
    Code,
    Link as LinkIcon,
    List,
    ListOrdered,
    Quote,
    CheckSquare,
    Heading1,
    Heading2,
    Heading3,
    Code2,
    Minus
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
}: RichEditorProps) {
    const [isSaving, setIsSaving] = useState(false);
    const isProgrammaticUpdate = useRef(false);

    // Track notes in ref to access inside suggestion (closure) without re-init editor
    const notesRef = useRef(notes);
    useEffect(() => {
        notesRef.current = notes;
    }, [notes]);

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            KeyMapOverride,
            StarterKit.configure({
                codeBlock: false,
                heading: {
                    levels: [1, 2, 3, 4, 5, 6],
                },
            }),
            Placeholder.configure({
                placeholder,
                emptyEditorClass: 'is-editor-empty',
            }),
            CodeBlockLowlight.configure({
                lowlight,
                defaultLanguage: 'plaintext',
            }),
            Mention.configure({
                HTMLAttributes: {
                    class: 'wiki-link',
                },
                suggestion: getSuggestionConfig(() => notesRef.current),
                renderLabel({ options, node }) {
                    return `${node.attrs.label ?? node.attrs.id}`;
                },
            }),
            TaskList.configure({
                HTMLAttributes: {
                    class: 'task-list',
                },
            }),
            // ... rest of extensions
            TaskItem.configure({
                nested: true,
                HTMLAttributes: {
                    class: 'task-item',
                },
            }),
            Link.configure({
                openOnClick: true,
                autolink: true,
                linkOnPaste: true,
                HTMLAttributes: {
                    class: 'editor-link',
                },
            }),
            Image.configure({
                inline: true,
                allowBase64: true,
            }),
            Typography,
        ],
        content,
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
        if (editor && content !== editor.getHTML()) {
            isProgrammaticUpdate.current = true;
            editor.commands.setContent(content);
            // Reset flag after update is processed (next tick unsafe? no, synchronous)
            // But to be safe, setTimeout? No, TipTap update is sync.
            isProgrammaticUpdate.current = false;
        }
    }, [content, editor]);

    const setLink = useCallback(() => {
        if (!editor) return;
        const previousUrl = editor.getAttributes('link').href;
        const url = window.prompt('URL', previousUrl);
        if (url === null) return;
        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }, [editor]);

    if (!editor) {
        return null;
    }

    return (
        <div className={`rich-editor ${className}`}>
            {/* Fixed toolbar */}
            {showToolbar && (
                <div className="editor-toolbar">
                    <div className="toolbar-group">
                        <button
                            onClick={() => editor.chain().focus().toggleBold().run()}
                            className={editor.isActive('bold') ? 'is-active' : ''}
                            title="Bold (Ctrl+B)"
                        >
                            <Bold size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleItalic().run()}
                            className={editor.isActive('italic') ? 'is-active' : ''}
                            title="Italic (Ctrl+I)"
                        >
                            <Italic size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleStrike().run()}
                            className={editor.isActive('strike') ? 'is-active' : ''}
                            title="Strikethrough"
                        >
                            <Strikethrough size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleCode().run()}
                            className={editor.isActive('code') ? 'is-active' : ''}
                            title="Inline Code"
                        >
                            <Code size={16} />
                        </button>
                    </div>

                    <div className="toolbar-separator" />

                    <div className="toolbar-group">
                        <button
                            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                            className={editor.isActive('heading', { level: 1 }) ? 'is-active' : ''}
                            title="Heading 1"
                        >
                            <Heading1 size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                            className={editor.isActive('heading', { level: 2 }) ? 'is-active' : ''}
                            title="Heading 2"
                        >
                            <Heading2 size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                            className={editor.isActive('heading', { level: 3 }) ? 'is-active' : ''}
                            title="Heading 3"
                        >
                            <Heading3 size={16} />
                        </button>
                    </div>

                    <div className="toolbar-separator" />

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
                            title="Numbered List"
                        >
                            <ListOrdered size={16} />
                        </button>
                        <button
                            onClick={() => editor.chain().focus().toggleTaskList().run()}
                            className={editor.isActive('taskList') ? 'is-active' : ''}
                            title="Task List"
                        >
                            <CheckSquare size={16} />
                        </button>
                    </div>

                    <div className="toolbar-separator" />

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
                            onClick={setLink}
                            className={editor.isActive('link') ? 'is-active' : ''}
                            title="Add Link"
                        >
                            <LinkIcon size={16} />
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

            {/* Main editor content */}
            <EditorContent editor={editor} />

            {/* Status indicator */}
            {isSaving && (
                <div className="save-indicator">Saving...</div>
            )}
        </div>
    );
}

export default RichEditor;
