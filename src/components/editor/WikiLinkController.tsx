'use client';

import { BlockNoteEditor } from "@blocknote/core";
import { DefaultReactSuggestionItem } from "@blocknote/react";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { WikiLinkSuggestionMenu, WikiLinkData } from "./block-editor";

interface WikiLinkControllerProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editor: any;
    getItems: (query: string, editorInstance: any) => Promise<Array<DefaultReactSuggestionItem & { data?: WikiLinkData }>>;
}

export function WikiLinkController({ editor, getItems }: WikiLinkControllerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [items, setItems] = useState<Array<DefaultReactSuggestionItem & { data?: WikiLinkData }>>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
    const [query, setQuery] = useState("");

    // Use refs for values needed in event listeners to avoid stale closures
    const isOpenRef = useRef(isOpen);
    const itemsRef = useRef(items);
    const selectedIndexRef = useRef(selectedIndex);
    const queryRef = useRef(query);

    useEffect(() => {
        isOpenRef.current = isOpen;
        itemsRef.current = items;
        selectedIndexRef.current = selectedIndex;
        queryRef.current = query;
    }, [isOpen, items, selectedIndex, query]);

    // Handle selection change and text input
    useEffect(() => {
        if (!editor) return;

        const handleSelectionChange = async () => {
            const selection = editor.getTextCursorPosition();
            if (!selection) {
                setIsOpen(false);
                return;
            }

            const block = selection.block;
            const text = (block.content as any[])?.[0]?.text || "";
            // const textBeforeCursor = text.slice(0, selection.prevBlockEndPos); // This api is tricky, let's use a simpler regex on the whole block text

            // We need to find the text before the cursor in the current block
            // API doesn't give simple "text before cursor" easily without computing offset
            // We can iterate content or just assume simple text block for now as wiki links usually are typed in text

            // Access the ProseMirror view directly for accurate cursor handling
            const view = editor.prosemirrorView;
            const state = view.state;
            const from = state.selection.from;
            const $from = state.selection.$from;

            // Get text before cursor in current node
            const textBefore = $from.parent.textBetween(0, $from.parentOffset, "\n", "\0");

            // Matches [[something at end of string
            const match = textBefore.match(/\[\[([^\[\]]*)$/);

            if (match) {
                const newQuery = match[1];

                // Fetch items
                const newItems = await getItems(newQuery, editor);

                if (newItems.length > 0) {
                    setItems(newItems);
                    setQuery(newQuery);
                    setSelectedIndex(0);

                    // Calculate position
                    const coords = view.coordsAtPos(from);
                    // Adjust for scroll and absolute positioning
                    // Coords are viewport relative. We need page relative or fixed. 
                    // Let's use fixed positioning for the menu
                    setPosition({ x: coords.left, y: coords.bottom + 5 });
                    setIsOpen(true);
                } else {
                    setIsOpen(false);
                }
            } else {
                setIsOpen(false);
            }
        };

        // We can hook into editor.onSelectionChange but we also need onTextChange equivalent
        // BlockNote exposes onSelectionChange and onChange. 
        // Let's bind to the internal ProseMirror View transaction dispatch if possible for fastest response
        // Or just use editor.onSelectionChange which fires on cursor move and type

        const cleanup = editor.onSelectionChange(() => {
            handleSelectionChange();
        });

        // Also need to listen to document changes (typing)
        const cleanupChange = editor.onChange(() => {
            handleSelectionChange();
        });

        return () => {
            cleanup();
            cleanupChange();
        };
    }, [editor, getItems]);

    // Handle Keyboard Navigation
    useEffect(() => {
        if (!editor) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpenRef.current) return;

            if (e.key === "ArrowUp") {
                e.preventDefault();
                const newIndex = selectedIndexRef.current > 0 ? selectedIndexRef.current - 1 : itemsRef.current.length - 1;
                setSelectedIndex(newIndex);
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                const newIndex = selectedIndexRef.current < itemsRef.current.length - 1 ? selectedIndexRef.current + 1 : 0;
                setSelectedIndex(newIndex);
            } else if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation(); // Stop editor enter behavior

                const item = itemsRef.current[selectedIndexRef.current];
                if (item && item.onItemClick) {
                    // Before inserting, we need to delete the [[query part
                    // Access ProseMirror transaction for atomic delete + insert
                    const view = editor.prosemirrorView;
                    const state = view.state;
                    const $from = state.selection.$from;
                    const queryLen = queryRef.current.length;

                    // Transaction: Delete [[ + query, then run onItemClick logic
                    // Actually, onItemClick in our implementation calls editor.insertInlineContent
                    // insertInlineContent usually inserts at cursor. 
                    // We should delete the trigger chars first.

                    // Delete the `[[` + `query`
                    // Length to delete = 2 + query length
                    const tr = state.tr.delete($from.pos - (2 + queryLen), $from.pos);
                    view.dispatch(tr);

                    // Now call the item click which inserts the wiki link block
                    // @ts-ignore
                    item.onItemClick();

                    setIsOpen(false);
                }
            } else if (e.key === "Escape") {
                e.preventDefault();
                setIsOpen(false);
            }
        };

        // Attach to the view's root DOM logic 
        // Or better, use a global capture approach if editor consumes events aggressively
        const viewDom = editor.prosemirrorView.dom;
        viewDom.addEventListener("keydown", handleKeyDown, true); // Capture phase to preempt editor

        return () => {
            viewDom.removeEventListener("keydown", handleKeyDown, true);
        };
    }, [editor]);

    // Handle clicks outside to close
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            // If click is outside the menu
            const target = e.target as HTMLElement;
            if (!target.closest('.wiki-link-menu')) {
                setIsOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        }
    }, []);

    if (!isOpen || !position) return null;

    // Render using a Portal to escape overflow:hidden issues and ensuring z-index
    // Using simple fixed positioning
    return ReactDOM.createPortal(
        <div
            style={{
                position: "fixed",
                left: position.x,
                top: position.y,
                zIndex: 99999,
            }}
        >
            <WikiLinkSuggestionMenu
                items={items}
                selectedIndex={selectedIndex}
                onItemClick={(item) => {
                    // Same logic as Enter key
                    const view = editor!.prosemirrorView;
                    const state = view.state;
                    const $from = state.selection.$from;
                    const queryLen = queryRef.current.length;

                    const tr = state.tr.delete($from.pos - (2 + queryLen), $from.pos);
                    view.dispatch(tr);

                    // @ts-ignore
                    item.onItemClick && item.onItemClick();
                    setIsOpen(false);
                }}
            />
        </div>,
        document.body
    );
}
