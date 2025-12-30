import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { Loader2, FileText } from 'lucide-react';

export interface WikiLinkListProps {
    items: Array<{ id: string; title: string }>;
    command: (item: { id: string; label: string }) => void;
}

export const WikiLinkList = forwardRef((props: WikiLinkListProps, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
        const item = props.items[index];
        if (item) {
            props.command({ id: item.id, label: item.title });
        }
    };

    const upHandler = () => {
        setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length);
    };

    const downHandler = () => {
        setSelectedIndex((selectedIndex + 1) % props.items.length);
    };

    const enterHandler = () => {
        selectItem(selectedIndex);
    };

    useEffect(() => setSelectedIndex(0), [props.items]);

    useImperativeHandle(ref, () => ({
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            if (event.key === 'ArrowUp') {
                upHandler();
                return true;
            }

            if (event.key === 'ArrowDown') {
                downHandler();
                return true;
            }

            if (event.key === 'Enter') {
                enterHandler();
                return true;
            }

            return false;
        },
    }));

    if (props.items.length === 0) {
        return (
            <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden p-2 text-xs text-slate-400">
                No matching notes
            </div>
        );
    }

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden flex flex-col min-w-[200px]">
            {props.items.map((item, index) => (
                <button
                    className={`flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${index === selectedIndex ? 'bg-blue-600 text-white' : 'text-slate-200 hover:bg-slate-700'
                        }`}
                    key={item.id}
                    onClick={() => selectItem(index)}
                >
                    <FileText size={14} className={index === selectedIndex ? 'text-white' : 'text-slate-400'} />
                    <span className="truncate">{item.title}</span>
                </button>
            ))}
        </div>
    );
});

WikiLinkList.displayName = 'WikiLinkList';
