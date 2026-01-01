'use client';

import { useEffect } from 'react';
import { RefreshCw, Wrench, AlertTriangle } from 'lucide-react';

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Log the error to an error reporting service
        console.error('Client-side exception:', error);
    }, [error]);

    const handleHardReset = async () => {
        // Use the centralized repair trigger
        window.location.href = '/?repair=1';
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
            <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl text-center">
                <div className="flex justify-center mb-6">
                    <div className="p-4 bg-red-500/10 rounded-full">
                        <AlertTriangle className="w-12 h-12 text-red-500" />
                    </div>
                </div>

                <h2 className="text-2xl font-bold mb-2">Something went wrong</h2>
                <p className="text-slate-400 mb-8 text-sm">
                    A client-side exception occurred. This is often caused by a corrupted browser cache or a mismatch between app versions.
                </p>

                <div className="space-y-4">
                    <button
                        onClick={() => reset()}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Try Again
                    </button>

                    <button
                        onClick={handleHardReset}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium transition-colors border border-slate-700"
                    >
                        <Wrench className="w-4 h-4" />
                        Reset Browser Cache & Repair
                    </button>

                    <p className="text-[10px] text-slate-500 pt-4">
                        Resetting cache will not delete your notes stored in IndexedDB,
                        but it will require you to log in again.
                    </p>
                </div>
            </div>
        </div>
    );
}
