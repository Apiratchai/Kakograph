/**
 * Storage Factory
 * Creates storage provider instances
 */

import { StorageProvider } from './interface';
import { IndexedDBProvider } from './indexeddb-provider';

export type StorageType = 'indexeddb' | 'convex';

/**
 * Create a storage provider based on type
 */
export function createStorageProvider(type: StorageType): StorageProvider {
    switch (type) {
        case 'indexeddb':
            return new IndexedDBProvider();
        case 'convex':
            // TODO: Implement ConvexProvider
            throw new Error('Convex provider not yet implemented');
        default:
            throw new Error(`Unknown storage type: ${type}`);
    }
}

/**
 * Get the current storage type from settings
 */
export function getCurrentStorageType(): StorageType {
    if (typeof window === 'undefined') return 'indexeddb';
    return (localStorage.getItem('storage_type') as StorageType) || 'indexeddb';
}

/**
 * Set the storage type in settings
 */
export function setStorageType(type: StorageType): void {
    localStorage.setItem('storage_type', type);
}
