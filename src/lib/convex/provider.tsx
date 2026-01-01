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
    isOfflineMode: boolean;
}

interface ConvexContextValue {
    config: ConvexConfig;
    client: ConvexReactClient | null;
    setMode: (mode: SyncMode) => void;
    setCustomUrl: (url: string) => void;
    getActiveUrl: () => string | null;
    testConnection: () => Promise<boolean>;
    toggleOfflineMode: () => void;
    reportConnectionError: () => void;
    reportConnectionSuccess: () => void;
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
        isOfflineMode: false,
    });

    // Track consecutive failures for exponential backoff
    const [failureCount, setFailureCount] = useState(0);

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
        if (config.isOfflineMode) return null;
        // Strictly require isConnected to allow client creation.
        // This ensures implementation of "Disconnect -> Destroy Client -> Stop Logs"
        if (!config.isConnected) return null;
        return getUrlForMode(config.mode, config.customUrl);
    }, [config.mode, config.customUrl, config.isOfflineMode, config.isConnected, getUrlForMode]);

    // Test connection to Convex
    const testConnection = useCallback(async (): Promise<boolean> => {
        if (config.isOfflineMode) {
            setConfig(prev => ({ ...prev, isConnected: false, isChecking: false }));
            return false;
        }

        // First check navigator.onLine if available
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
            setConfig(prev => ({ ...prev, isConnected: false, isChecking: false }));
            return false;
        }

        const url = getUrlForMode(config.mode, config.customUrl);
        if (!url) {
            setConfig(prev => ({ ...prev, isConnected: false, isChecking: false }));
            return false;
        }

        setConfig(prev => ({ ...prev, isChecking: true }));

        try {
            // Convex exposes a /version endpoint for health checks
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

            await fetch(`${url.replace(/\/$/, '')}/version`, {
                method: 'GET',
                mode: 'no-cors',
                signal: controller.signal,
                cache: 'no-store', // Prevent getting cached responses
            });
            clearTimeout(timeoutId);

            const connected = true;

            setConfig(prev => ({ ...prev, isConnected: connected, isChecking: false }));
            return connected;
        } catch (err) {
            console.warn('[ConvexProvider] Connection test failed:', err);
            setConfig(prev => ({ ...prev, isConnected: false, isChecking: false }));
            return false;
        }
    }, [config.isOfflineMode, config.mode, config.customUrl, getUrlForMode]);

    // Listen for online/offline events
    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleStatusChange = () => {
            if (config.isOfflineMode) return;

            if (!navigator.onLine) {
                setConfig(prev => ({ ...prev, isConnected: false }));
            } else if (mounted && config.mode !== 'disabled') {
                testConnection();
            }
        };

        window.addEventListener('online', handleStatusChange);
        window.addEventListener('offline', handleStatusChange);

        return () => {
            window.removeEventListener('online', handleStatusChange);
            window.removeEventListener('offline', handleStatusChange);
        };
    }, [mounted, config.mode, config.isOfflineMode, testConnection]);

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
        if (mounted && config.mode !== 'disabled' && !config.isOfflineMode) {
            testConnection();
        }
    }, [mounted, config.mode, config.customUrl, config.isOfflineMode, testConnection]);

    const setMode = useCallback((mode: SyncMode) => {
        localStorage.setItem(CONVEX_ENABLED_KEY, mode);
        setConfig(prev => ({ ...prev, mode, isConnected: false }));
        setFailureCount(0); // Reset failures on mode switch
    }, []);

    const setCustomUrl = useCallback((url: string) => {
        localStorage.setItem(CONVEX_URL_KEY, url);
        setConfig(prev => ({ ...prev, customUrl: url, isConnected: false }));
        setFailureCount(0);
    }, []);

    const toggleOfflineMode = useCallback(() => {
        setConfig(prev => ({ ...prev, isOfflineMode: !prev.isOfflineMode }));
    }, []);

    const reportConnectionSuccess = useCallback(() => {
        setFailureCount(0);
    }, []);

    const reportConnectionError = useCallback(() => {
        console.warn('[ConvexProvider] Connection error reported. Failure count:', failureCount + 1);

        setFailureCount(prev => prev + 1);
        setConfig(prev => {
            if (prev.isConnected) {
                return { ...prev, isConnected: false };
            }
            return prev;
        });

        // Exponential backoff: 5s, 10s, 20s... max 60s
        const delay = Math.min(60000, 5000 * Math.pow(2, failureCount));

        console.log(`[ConvexProvider] Scheduling reconnection attempt in ${delay}ms`);

        if (mounted && config.mode !== 'disabled' && !config.isOfflineMode) {
            setTimeout(() => {
                testConnection();
            }, delay);
        }
    }, [mounted, config.mode, config.isOfflineMode, failureCount, testConnection]);

    // Create/update Convex client when URL changes
    useEffect(() => {
        const url = getActiveUrl();
        if (url && mounted && !config.isOfflineMode) {
            try {
                // Basic validation: must start with http/https
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    throw new Error('Invalid Convex URL protocol');
                }

                // Only create new client if URL changed
                if (!clientRef.current || clientRef.current.url !== url) {
                    clientRef.current = new ConvexReactClient(url, {
                        skipConvexDeploymentUrlCheck: true,
                    });
                }
            } catch (err) {
                console.error('Failed to initialize Convex client:', err);
                clientRef.current = null;
                // If it crashes, we disable sync mode automatically to unblock the user
                setMode('disabled');
                reportConnectionError();
            }
        } else {
            // Destroy client to stop background retries/logs
            if (clientRef.current) {
                console.log('[ConvexProvider] Destroying Convex client');
            }
            clientRef.current = null;
        }
    }, [getActiveUrl, mounted, setMode, config.isOfflineMode, reportConnectionError]);

    const contextValue = useMemo(() => ({
        config,
        client: clientRef.current,
        setMode,
        setCustomUrl,
        getActiveUrl,
        testConnection,
        toggleOfflineMode,
        reportConnectionError,
        reportConnectionSuccess,
    }), [config, setMode, setCustomUrl, getActiveUrl, testConnection, toggleOfflineMode, reportConnectionError, reportConnectionSuccess]);

    const activeUrl = getActiveUrl();

    // If sync is disabled or no URL, just render children without Convex
    if (!activeUrl || !clientRef.current || config.isOfflineMode) {
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
