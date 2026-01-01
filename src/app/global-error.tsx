'use client';

import { Wrench, RefreshCw, AlertOctagon } from 'lucide-react';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const handleHardReset = () => {
        // Clear everything that could cause a boot loop
        localStorage.removeItem('kakograph_convex_url');
        localStorage.removeItem('kakograph_sync_enabled');
        localStorage.removeItem('kakograph_session');

        // Force reload to root
        window.location.href = '/?repair=1';
    };

    return (
        <html lang="en">
            <body className="bg-slate-950 text-slate-100 min-h-screen flex items-center justify-center p-4 font-sans">
                <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl text-center">
                    <div className="flex justify-center mb-6">
                        <div className="p-4 bg-red-500/10 rounded-full">
                            <AlertOctagon className="w-12 h-12 text-red-500" />
                        </div>
                    </div>

                    <h1 className="text-2xl font-bold mb-2">Critical App Failure</h1>
                    <p className="text-slate-400 mb-8 text-sm leading-relaxed">
                        Kakograph encountered a critical error during startup. This is often due to a misconfigured sync URL or corrupted cache.
                    </p>

                    <div className="space-y-4">
                        <button
                            onClick={() => reset()}
                            className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold transition-all active:scale-[0.98]"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Restart App
                        </button>

                        <button
                            onClick={handleHardReset}
                            className="w-full flex items-center justify-center gap-2 py-4 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl font-bold transition-all border border-slate-700 active:scale-[0.98]"
                        >
                            <Wrench className="w-4 h-4" />
                            Reset Settings (Keep Notes)
                        </button>
                    </div>

                    <div className="mt-8 p-4 bg-black/20 rounded-2xl text-left">
                        <p className="text-[10px] text-slate-600 uppercase tracking-widest font-bold mb-2">Error Details</p>
                        <p className="text-[11px] font-mono text-slate-500 break-all leading-relaxed">
                            {error.message || 'Unknown initialization error'}
                        </p>
                    </div>
                </div>
            </body>
        </html>
    );
}
