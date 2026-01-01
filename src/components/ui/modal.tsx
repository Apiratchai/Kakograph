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
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="relative w-full max-w-md border rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                style={{
                    backgroundColor: 'var(--surface-elevated)',
                    borderColor: 'var(--border-primary)'
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div
                    className="flex items-center justify-between p-4"
                    style={{ borderBottom: '1px solid var(--border-secondary)' }}
                >
                    <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
                    <button
                        onClick={onClose}
                        className="p-1 rounded-lg transition-colors"
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--hover-bg)'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-4 space-y-4">
                    {description && (
                        <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                            {description}
                        </p>
                    )}
                    {children}
                </div>

                {/* Footer (Auto-generated for alert/confirm, or custom) */}
                <div
                    className="p-4 flex justify-end gap-3"
                    style={{
                        backgroundColor: 'var(--surface-secondary)',
                        borderTop: '1px solid var(--border-secondary)'
                    }}
                >
                    {footer ? footer : (
                        <>
                            {(type === 'confirm' || type === 'custom') && (
                                <button
                                    onClick={onClose}
                                    className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                                    style={{
                                        backgroundColor: 'var(--surface-tertiary)',
                                        color: 'var(--text-secondary)'
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.backgroundColor = 'var(--hover-bg)';
                                        e.currentTarget.style.color = 'var(--text-primary)';
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.backgroundColor = 'var(--surface-tertiary)';
                                        e.currentTarget.style.color = 'var(--text-secondary)';
                                    }}
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

