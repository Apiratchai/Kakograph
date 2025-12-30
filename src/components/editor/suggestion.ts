import { ReactRenderer } from '@tiptap/react';
import tippy from 'tippy.js';
import { WikiLinkList } from './WikiLinkList';

export const getSuggestionConfig = (getNotes: () => Array<{ id: string; title: string }>) => ({
    char: '[[',

    items: ({ query }: { query: string }) => {
        const notes = getNotes();
        return notes
            .filter(item => item.title.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 10);
    },

    render: () => {
        let component: ReactRenderer<any>;
        let popup: any;

        return {
            onStart: (props: any) => {
                component = new ReactRenderer(WikiLinkList, {
                    props,
                    editor: props.editor,
                });

                if (!props.clientRect) {
                    return;
                }

                popup = tippy('body', {
                    getReferenceClientRect: props.clientRect,
                    appendTo: () => document.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: 'manual',
                    placement: 'bottom-start',
                });
            },

            onUpdate(props: any) {
                component.updateProps(props);

                if (!props.clientRect) {
                    return;
                }

                popup[0].setProps({
                    getReferenceClientRect: props.clientRect,
                });
            },

            onKeyDown(props: any) {
                if (props.event.key === 'Escape') {
                    popup[0].hide();
                    return true;
                }

                return component.ref?.onKeyDown(props);
            },

            onExit() {
                popup[0].destroy();
                component.destroy();
            },
        };
    },
});
