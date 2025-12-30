import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    children?: React.ReactNode;
    footer?: React.ReactNode;
    type?: 'alert' | 'confirm' | 'custom';
    onConfirm?: () => void;
    confirmText?: string;
    cancelText?: string;
    isDestructive?: boolean;
}

export function Modal({
    isOpen,
    onClose,
    title,
    description,
    children,
    footer,
    type = 'custom',
    onConfirm,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    isDestructive = false
}: ModalProps) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-800">
                    <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 space-y-4">
                    {description && (
                        <p className="text-slate-300 text-sm leading-relaxed">
                            {description}
                        </p>
                    )}
                    {children}
                </div>

                {/* Footer (Auto-generated for alert/confirm, or custom) */}
                <div className="p-4 bg-slate-950/50 border-t border-slate-800 flex justify-end gap-3">
                    {footer ? footer : (
                        <>
                            {(type === 'confirm' || type === 'custom') && (
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
                                >
                                    {cancelText}
                                </button>
                            )}
                            {(type === 'confirm' || type === 'alert') && (
                                <button
                                    onClick={() => {
                                        onConfirm?.();
                                        if (type === 'alert') onClose(); // Auto close alert on confirm
                                    }}
                                    className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${isDestructive
                                        ? 'bg-red-600 hover:bg-red-700'
                                        : 'bg-blue-600 hover:bg-blue-700'
                                        }`}
                                >
                                    {confirmText}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
