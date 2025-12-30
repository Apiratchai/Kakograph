// Storage module exports
export { type EncryptedNote, type StorageProvider, type SyncStatus, createNoteId } from './interface';
export { IndexedDBProvider } from './indexeddb-provider';
export { createStorageProvider, getCurrentStorageType, setStorageType, type StorageType } from './factory';
