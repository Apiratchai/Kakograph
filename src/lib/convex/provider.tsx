'use client';

/**
 * Convex Provider with Dynamic URL Configuration
 * Allows switching between local and cloud Convex backends
 */

import { ConvexProvider, ConvexReactClient } from 'convex/react';
import { ReactNode, createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';

// Storage key for persisted Convex URL
const CONVEX_URL_KEY = 'kakograph_convex_url';
const CONVEX_ENABLED_KEY = 'kakograph_sync_enabled';

// Default URLs
const DEFAULT_LOCAL_URL = 'http://127.0.0.1:3210';
const DEFAULT_CLOUD_URL = process.env.NEXT_PUBLIC_CONVEX_URL || '';

export type SyncMode = 'disabled' | 'local' | 'cloud' | 'custom';

interface ConvexConfig {
    mode: SyncMode;
    customUrl: string;
    isConnected: boolean;
    isChecking: boolean;
}

interface ConvexContextValue {
    config: ConvexConfig;
    client: ConvexReactClient | null;
    setMode: (mode: SyncMode) => void;
    setCustomUrl: (url: string) => void;
    getActiveUrl: () => string | null;
    testConnection: () => Promise<boolean>;
}

const ConvexConfigContext = createContext<ConvexContextValue | null>(null);

export function useConvexConfig() {
    const ctx = useContext(ConvexConfigContext);
    if (!ctx) {
        throw new Error('useConvexConfig must be used within ConvexConfigProvider');
    }
    return ctx;
}

interface Props {
    children: ReactNode;
}

export function ConvexConfigProvider({ children }: Props) {
    const [config, setConfig] = useState<ConvexConfig>({
        mode: 'disabled',
        customUrl: '',
        isConnected: false,
        isChecking: false,
    });

    // Ref to track the current client to avoid recreating on every render
    const clientRef = useRef<ConvexReactClient | null>(null);
    const [mounted, setMounted] = useState(false);

    // Get URL for a specific mode
    const getUrlForMode = useCallback((mode: SyncMode, customUrl: string): string | null => {
        switch (mode) {
            case 'disabled':
                return null;
            case 'local':
                return DEFAULT_LOCAL_URL;
            case 'cloud':
                return DEFAULT_CLOUD_URL;
            case 'custom':
                return customUrl || null;
            default:
                return null;
        }
    }, []);

    const getActiveUrl = useCallback((): string | null => {
        return getUrlForMode(config.mode, config.customUrl);
    }, [config.mode, config.customUrl, getUrlForMode]);

    // Test connection to Convex
    const testConnection = useCallback(async (): Promise<boolean> => {
        const url = getActiveUrl();
        if (!url) {
            setConfig(prev => ({ ...prev, isConnected: false, isChecking: false }));
            return false;
        }

        setConfig(prev => ({ ...prev, isChecking: true }));

        try {
            // Convex exposes a /version endpoint for health checks
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            await fetch(`${url.replace(/\/$/, '')}/version`, {
                method: 'GET',
                mode: 'no-cors',
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            // If fetch resolves (even with opaque response), we have a connection
            const connected = true;
            setConfig(prev => ({ ...prev, isConnected: connected, isChecking: false }));
            return connected;
        } catch {
            setConfig(prev => ({ ...prev, isConnected: false, isChecking: false }));
            return false;
        }
    }, [getActiveUrl]);

    // Load saved config from localStorage on mount
    useEffect(() => {
        setMounted(true);
        const savedEnabled = localStorage.getItem(CONVEX_ENABLED_KEY);
        const savedUrl = localStorage.getItem(CONVEX_URL_KEY);

        if (savedEnabled) {
            const mode = savedEnabled as SyncMode;
            setConfig(prev => ({
                ...prev,
                mode,
                customUrl: savedUrl || '',
            }));
        }
    }, []);

    // Auto-test connection when mode changes
    useEffect(() => {
        if (mounted && config.mode !== 'disabled') {
            testConnection();
        }
    }, [mounted, config.mode, config.customUrl, testConnection]);

    // Create/update Convex client when URL changes
    useEffect(() => {
        const url = getActiveUrl();
        if (url && mounted) {
            // Only create new client if URL changed
            if (!clientRef.current || clientRef.current.url !== url) {
                clientRef.current = new ConvexReactClient(url);
            }
        } else {
            clientRef.current = null;
        }
    }, [getActiveUrl, mounted]);

    const setMode = useCallback((mode: SyncMode) => {
        localStorage.setItem(CONVEX_ENABLED_KEY, mode);
        setConfig(prev => ({ ...prev, mode, isConnected: false }));
    }, []);

    const setCustomUrl = useCallback((url: string) => {
        localStorage.setItem(CONVEX_URL_KEY, url);
        setConfig(prev => ({ ...prev, customUrl: url, isConnected: false }));
    }, []);

    const contextValue = useMemo(() => ({
        config,
        client: clientRef.current,
        setMode,
        setCustomUrl,
        getActiveUrl,
        testConnection,
    }), [config, setMode, setCustomUrl, getActiveUrl, testConnection]);

    const activeUrl = getActiveUrl();

    // If sync is disabled or no URL, just render children without Convex
    if (!activeUrl || !clientRef.current) {
        return (
            <ConvexConfigContext.Provider value={contextValue}>
                {children}
            </ConvexConfigContext.Provider>
        );
    }

    return (
        <ConvexConfigContext.Provider value={contextValue}>
            <ConvexProvider client={clientRef.current}>
                {children}
            </ConvexProvider>
        </ConvexConfigContext.Provider>
    );
}
