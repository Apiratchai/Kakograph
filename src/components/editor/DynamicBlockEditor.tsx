"use client";

import dynamic from "next/dynamic";

// Dynamic import to prevent SSR issues with BlockNote
export const BlockEditor = dynamic(
    () => import("./block-editor").then((mod) => mod.BlockEditor),
    {
        ssr: false,
        loading: () => (
            <div className="flex items-center justify-center h-full p-8">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm text-[var(--text-muted)]">Loading editor...</span>
                </div>
            </div>
        )
    }
);

export default BlockEditor;
