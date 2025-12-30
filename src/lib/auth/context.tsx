'use client';

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { mnemonicToSeed, deriveEncryptionKey, deriveDeviceId, validateMnemonic } from '@/lib/crypto';
import { encryptSessionWithPin, decryptSessionWithPin } from '@/lib/crypto/pin';

interface AuthState {
    isAuthenticated: boolean;
    hasProtectedSession: boolean; // True if a PIN-encrypted session exists
    isLoading: boolean;
    encryptionKey: CryptoKey | null;
    deviceId: string | null;
}

interface AuthContextValue extends AuthState {
    authenticate: (phrase: string) => Promise<boolean>;
    setupPin: (pin: string) => Promise<boolean>;
    unlockWithPin: (pin: string) => Promise<boolean>;
    logout: () => void;
    clearSession: () => void; // Clears everything including PIN
}

const AuthContext = createContext<AuthContextValue | null>(null);

const SESSION_KEY = 'kakograph_session';

export function AuthProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<AuthState>({
        isAuthenticated: false,
        hasProtectedSession: false,
        isLoading: true,
        encryptionKey: null,
        deviceId: null,
    });

    // Check for existing session on mount
    useEffect(() => {
        const checkSession = async () => {
            const encryptedSession = localStorage.getItem(SESSION_KEY);
            if (encryptedSession) {
                setState((prev) => ({
                    ...prev,
                    hasProtectedSession: true,
                    isLoading: false,
                }));
            } else {
                setState((prev) => ({ ...prev, isLoading: false }));
            }
        };
        checkSession();
    }, []);

    // Authenticate with seed phrase
    const authenticate = useCallback(async (phrase: string): Promise<boolean> => {
        if (!validateMnemonic(phrase)) {
            return false;
        }

        try {
            const seed = mnemonicToSeed(phrase);
            const [encryptionKey, deviceId] = await Promise.all([
                deriveEncryptionKey(seed),
                deriveDeviceId(seed),
            ]);

            setState((prev) => ({
                ...prev,
                isAuthenticated: true,
                encryptionKey,
                deviceId,
            }));

            return true;
        } catch (error) {
            console.error('Authentication failed:', error);
            return false;
        }
    }, []);

    // Enable PIN protection
    const setupPin = useCallback(async (pin: string): Promise<boolean> => {
        if (!state.encryptionKey || !state.deviceId) return false;

        try {
            const encryptedSession = await encryptSessionWithPin(state.encryptionKey, state.deviceId, pin);
            localStorage.setItem(SESSION_KEY, encryptedSession);
            setState(prev => ({ ...prev, hasProtectedSession: true }));
            return true;
        } catch (error) {
            console.error('Failed to setup PIN:', error);
            return false;
        }
    }, [state.encryptionKey, state.deviceId]);

    // Unlock with PIN
    const unlockWithPin = useCallback(async (pin: string): Promise<boolean> => {
        const encryptedSession = localStorage.getItem(SESSION_KEY);
        if (!encryptedSession) return false;

        try {
            const { key, deviceId } = await decryptSessionWithPin(encryptedSession, pin);
            setState((prev) => ({
                ...prev,
                isAuthenticated: true,
                encryptionKey: key,
                deviceId,
            }));
            return true;
        } catch (error) {
            console.error('Failed to unlock with PIN:', error);
            return false;
        }
    }, []);

    // Logout (Keeps PIN session if exists)
    const logout = useCallback(() => {
        setState((prev) => ({
            ...prev,
            isAuthenticated: false,
            encryptionKey: null,
            deviceId: null,
        }));
    }, []);

    // Clear session (Removes PIN, requires full re-login)
    const clearSession = useCallback(() => {
        localStorage.removeItem(SESSION_KEY);
        setState({
            isAuthenticated: false,
            hasProtectedSession: false,
            isLoading: false,
            encryptionKey: null,
            deviceId: null,
        });
    }, []);

    return (
        <AuthContext.Provider value={{
            ...state,
            authenticate,
            setupPin,
            unlockWithPin,
            logout,
            clearSession
        }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export default AuthContext;
