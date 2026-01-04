'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { ResizableNodeView } from '@tiptap/core';

// Resizable Image Extension using TipTap's built-in ResizableNodeView
export const ResizableImage = Node.create({
    name: 'image',

    group: 'block',

    draggable: true,

    addAttributes() {
        return {
            src: {
                default: null,
            },
            alt: {
                default: null,
            },
            title: {
                default: null,
            },
            width: {
                default: null,
            },
            height: {
                default: null,
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'img[src]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['img', mergeAttributes(HTMLAttributes)];
    },

    addNodeView() {
        return ({ node, getPos, HTMLAttributes, editor }) => {
            const img = document.createElement('img');
            img.src = HTMLAttributes.src || '';

            // Copy non-size attributes to element
            Object.entries(HTMLAttributes).forEach(([key, value]) => {
                if (value == null) return;
                if (key === 'width' || key === 'height') return;
                img.setAttribute(key, String(value));
            });

            // Apply initial size if exists
            if (HTMLAttributes.width) {
                img.style.width = `${HTMLAttributes.width}px`;
            }
            if (HTMLAttributes.height) {
                img.style.height = `${HTMLAttributes.height}px`;
            }

            // Style the image
            img.style.maxWidth = '100%';
            img.style.borderRadius = '0.5rem';
            img.style.display = 'block';
            img.draggable = false;

            // Instantiate ResizableNodeView
            return new ResizableNodeView({
                editor,
                element: img,
                node,
                getPos,
                onResize: (w, h) => {
                    // Get parent container max width
                    const parent = img.closest('.rich-editor-content');
                    const maxWidth = parent ? parent.clientWidth - 48 : 800; // 48px for padding

                    // Constrain width and recalculate height proportionally
                    const constrainedWidth = Math.min(w, maxWidth);
                    const ratio = constrainedWidth / w;
                    const constrainedHeight = h * ratio;

                    img.style.width = `${constrainedWidth}px`;
                    img.style.height = `${constrainedHeight}px`;
                },
                onCommit: (w, h) => {
                    const pos = getPos();
                    if (pos === undefined) return;

                    // Get parent container max width
                    const parent = img.closest('.rich-editor-content');
                    const maxWidth = parent ? parent.clientWidth - 48 : 800;

                    // Constrain and persist
                    const constrainedWidth = Math.min(w, maxWidth);
                    const ratio = constrainedWidth / w;
                    const constrainedHeight = h * ratio;

                    // Use transaction to ensure changes are saved
                    const { tr } = editor.state;
                    tr.setNodeMarkup(pos, undefined, {
                        ...node.attrs,
                        width: Math.round(constrainedWidth),
                        height: Math.round(constrainedHeight),
                    });
                    editor.view.dispatch(tr);
                },
                onUpdate: (updatedNode) => {
                    if (updatedNode.type.name !== node.type.name) return false;
                    // Update src if changed
                    const newSrc = updatedNode.attrs.src;
                    if (newSrc && newSrc !== img.src) {
                        img.src = newSrc;
                    }
                    return true;
                },
                options: {
                    directions: ['bottom-right'],
                    min: { width: 50, height: 50 },
                    max: { width: 800, height: 600 }, // Prevent overflow beyond viewport
                    preserveAspectRatio: true, // Always preserve proportion
                    className: {
                        container: 'resizable-image-container',
                        wrapper: 'resizable-image-wrapper',
                        handle: 'resize-handle',
                        resizing: 'is-resizing',
                    },
                },
            });
        };
    },
});

export default ResizableImage;
