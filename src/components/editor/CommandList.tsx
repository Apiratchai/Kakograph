'use client';

import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import {
    Type, Heading1, Heading2, Heading3,
    List, ListOrdered, CheckSquare,
    Table, Image, Code as CodeIcon,
    Quote, Minus, Sparkles
} from 'lucide-react';

interface CommandItem {
    title: string;
    description: string;
    icon: React.ReactNode;
    command: (props: any) => void;
}

export const CommandList = forwardRef((props: any, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const items: CommandItem[] = [
        {
            title: 'Text',
            description: 'Just start typing with plain text.',
            icon: <Type size={18} />,
            command: ({ editor, range }) => {
                editor.chain().focus().deleteRange(range).setParagraph().run();
            },
        },
        {
            title: 'Heading 1',
            description: 'Big section heading.',
            icon: <Heading1 size={18} />,
            command: ({ editor, range }) => {
                editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run();
            },
        },
        {
            title: 'Heading 2',
            description: 'Medium section heading.',
            icon: <Heading2 size={18} />,
            command: ({ editor, range }) => {
                editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run();
            },
        },
        {
            title: 'Heading 3',
            description: 'Small section heading.',
            icon: <Heading3 size={18} />,
            command: ({ editor, range }) => {
                editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run();
            },
        },
        {
            title: 'Bullet List',
            description: 'Simple bulleted list.',
            icon: <List size={18} />,
            command: ({ editor, range }) => {
                editor.chain().focus().deleteRange(range).toggleBulletList().run();
            },
        },
        {
            title: 'Numbered List',
            description: 'List with numbering.',
            icon: <ListOrdered size={18} />,
            command: ({ editor, range }) => {
                editor.chain().focus().deleteRange(range).toggleOrderedList().run();
            },
        },
        {
            title: 'Task List',
            description: 'List with checkboxes.',
            icon: <CheckSquare size={18} />,
            command: ({ editor, range }) => {
                editor.chain().focus().deleteRange(range).toggleTaskList().run();
            },
        },
        {
            title: 'Table',
            description: 'Insert a 3x3 table.',
            icon: <Table size={18} />,
            command: ({ editor, range }) => {
                editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
            },
        },
        {
            title: 'Image',
            description: 'Upload an image.',
            icon: <Image size={18} />,
            command: ({ editor, range }) => {
                editor.chain().focus().deleteRange(range).run();
                // Trigger file input - this needs to be handled in the editor component
                // For now, we'll emit a custom event or use a callback
                const event = new CustomEvent('editor-upload-image');
                window.dispatchEvent(event);
            },
        },
        {
            title: 'Code Block',
            description: 'Code snippet with highlighting.',
            icon: <CodeIcon size={18} />,
            command: ({ editor, range }) => {
                editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
            },
        },
        {
            title: 'Quote',
            description: 'Capture a quotation.',
            icon: <Quote size={18} />,
            command: ({ editor, range }) => {
                editor.chain().focus().deleteRange(range).toggleBlockquote().run();
            },
        },
        {
            title: 'Divider',
            description: 'Visually separate sections.',
            icon: <Minus size={18} />,
            command: ({ editor, range }) => {
                editor.chain().focus().deleteRange(range).setHorizontalRule().run();
            },
        },
        {
            title: 'AI Summary (Gemini)',
            description: 'Summarize current note (Coming Soon).',
            icon: <Sparkles size={18} className="text-purple-400" />,
            command: ({ editor, range }) => {
                editor.chain().focus().deleteRange(range).run();
                alert('AI Summary is being implemented!');
            },
        },
    ];

    const filteredItems = items.filter(item =>
        item.title.toLowerCase().includes(props.query.toLowerCase())
    );

    const selectItem = (index: number) => {
        const item = filteredItems[index];

        if (item) {
            item.command(props);
        }
    };

    useEffect(() => setSelectedIndex(0), [props.query]);

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            if (event.key === 'ArrowUp') {
                setSelectedIndex((selectedIndex + filteredItems.length - 1) % filteredItems.length);
                return true;
            }

            if (event.key === 'ArrowDown') {
                setSelectedIndex((selectedIndex + 1) % filteredItems.length);
                return true;
            }

            if (event.key === 'Enter') {
                selectItem(selectedIndex);
                return true;
            }

            return false;
        },
    }));

    if (filteredItems.length === 0) return null;

    return (
        <div className="bg-slate-900 border border-slate-700 rounded-lg shadow-2xl overflow-hidden min-w-[280px]">
            <div className="p-2 flex flex-col gap-0.5">
                {filteredItems.map((item, index) => (
                    <button
                        key={index}
                        className={`flex items-center gap-3 px-3 py-2 text-left rounded-md transition-all ${index === selectedIndex ? 'bg-blue-600 text-white shadow-md' : 'text-slate-300 hover:bg-slate-800'
                            }`}
                        onClick={() => selectItem(index)}
                    >
                        <div className={`${index === selectedIndex ? 'text-white' : 'text-slate-400'}`}>
                            {item.icon}
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-medium">{item.title}</span>
                            <span className={`text-[10px] ${index === selectedIndex ? 'text-blue-100' : 'text-slate-500'}`}>
                                {item.description}
                            </span>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
});

CommandList.displayName = 'CommandList';
