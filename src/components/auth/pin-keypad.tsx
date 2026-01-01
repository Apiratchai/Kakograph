'use client';

import { Delete, ArrowRight, Check } from 'lucide-react';
import { useEffect, useState } from 'react';

interface PinKeypadProps {
    onSubmit: (pin: string) => void;
    label?: string;
    loading?: boolean;
    error?: string;
}

export function PinKeypad({ onSubmit, label = 'Enter PIN', loading = false, error }: PinKeypadProps) {
    const [pin, setPin] = useState('');

    const handleNum = (num: number) => {
        if (loading) return;
        setPin(prev => prev + num);
    };

    const handleDelete = () => {
        if (loading) return;
        setPin(prev => prev.slice(0, -1));
    };

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (loading || pin.length === 0) return;
        onSubmit(pin);
    };

    // Keyboard support for desktop
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (loading) return;
            if (/^[0-9]$/.test(e.key)) {
                setPin(prev => prev + e.key);
            }
            if (e.key === 'Backspace') {
                setPin(prev => prev.slice(0, -1));
            }
            if (e.key === 'Enter') {
                if (pin.length > 0) onSubmit(pin);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [pin, loading, onSubmit]);

    return (
        <div className="w-full max-w-xs mx-auto">
            <h3
                className="text-center text-lg font-medium mb-6"
                style={{ color: 'var(--text-primary)' }}
            >
                {label}
            </h3>

            {/* Display */}
            <div className="flex justify-center mb-8 h-8 items-center gap-2">
                {pin.length === 0 && (
                    <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Tap numbers</span>
                )}
                {pin.split('').map((_, i) => (
                    <div key={i} className="w-3 h-3 rounded-full bg-blue-500 animate-in fade-in zoom-in duration-200" />
                ))}
            </div>

            {error && (
                <div className="text-center text-red-400 text-xs mb-4 animate-pulse">
                    {error}
                </div>
            )}

            {/* Keypad */}
            <div className="grid grid-cols-3 gap-4 mb-6">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <button
                        key={num}
                        onClick={() => handleNum(num)}
                        disabled={loading}
                        className="h-16 w-16 mx-auto rounded-full active:scale-95 transition-all flex items-center justify-center text-2xl font-light disabled:opacity-50"
                        style={{
                            backgroundColor: 'var(--surface-secondary)',
                            color: 'var(--text-primary)'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--surface-secondary)'}
                    >
                        {num}
                    </button>
                ))}

                {/* Empty / Placeholder */}
                <div className="h-16 w-16" />

                <button
                    onClick={() => handleNum(0)}
                    disabled={loading}
                    className="h-16 w-16 mx-auto rounded-full active:scale-95 transition-all flex items-center justify-center text-2xl font-light disabled:opacity-50"
                    style={{
                        backgroundColor: 'var(--surface-secondary)',
                        color: 'var(--text-primary)'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--surface-secondary)'}
                >
                    0
                </button>

                <button
                    onClick={handleDelete}
                    disabled={loading || pin.length === 0}
                    className="h-16 w-16 mx-auto rounded-full bg-transparent active:scale-95 transition-all flex items-center justify-center disabled:opacity-30"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => {
                        e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)';
                        e.currentTarget.style.color = 'var(--accent-red)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = 'var(--text-muted)';
                    }}
                >
                    <Delete size={24} />
                </button>
            </div>

            {/* Submit */}
            <button
                onClick={() => handleSubmit()}
                disabled={loading || pin.length === 0}
                className="w-full h-12 rounded-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 transition-colors flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? (
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                    <span className="flex items-center gap-2 font-medium">
                        Unlock <ArrowRight size={18} />
                    </span>
                )}
            </button>
        </div>
    );
}

