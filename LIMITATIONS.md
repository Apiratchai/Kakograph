# Sync Architecture & Technical Limitations

Kakograph employs a **Local-First, End-to-End Encrypted** architecture. This document explains the sync lifecycle, the trade-offs made for privacy, and the technical mechanisms ensuring data consistency.

## 1. Core Architecture

The system is designed around **Zero-Knowledge** principles. The server (Convex) acts as a "dumb" store of encrypted blobs and does not have the keys to read or merge content.

### The Stack
- **Storage**: IndexedDB (Browser Local Storage) is the source of truth.
- **Encryption**: AES-256-GCM (WebCrypto API). Keys derived from BIP-39 Seed Phrase.
- **Transport**: Convex Cloud (or Self-Hosted) via WebSockets + HTTP Polling.
- **Identity**: Deterministic Device ID derived from the Seed Phrase (`PBKDF2`).

---

## 2. The Sync Lifecycle ("Pipeline")

### A. Writing Data (Device A)
1.  **User Input**: User types in `RichEditor`.
2.  **Debounce**: System waits for **1 second** of inactivity (to save battery/CPU).
3.  **Encryption**: The entire note content is encrypted into a `string` blob.
4.  **Local Commit**: Encrypted blob is saved to IndexedDB.
    - *Timestamp is updated locally.*
5.  **Push**: The encrypted blob is pushed to Convex Cloud.

### B. Reading Data (Device B)
1.  **Detection**: Device B detects changes via **Hybrid Sync**:
    - **Live**: WebSocket subscription (`watchQuery`) pushes update immediately.
    - **Polling**: Every 5 seconds, it polls via HTTP to handle firewall/network edge cases.
2.  **Download**: Encrypted blobs are fetched.
3.  **Conflict Check**: `Remote.updatedAt > Local.updatedAt`?
    - If yes: Overwrite Local.
    - If no: Ignore (Local is newer or identical).
4.  **Local Commit**: Encrypted blob is written to IndexedDB.
5.  **UI Refresh**:
    - The `useNotes` hook detects the DB change.
    - It decrypts the new blob in memory.
    - It swaps the active `currentNote` in the editor with the new version.

---

## 3. Loop Prevention ("Ping-Pong" Protection)

A critical challenge in bidirectional sync is preventing **Infinite Loops**:
> Device A writes -> Syncs to B -> B updates Editor -> Editor fires "onChange" -> B thinks User typed -> B writes back -> Syncs to A...

### The Solution: `isProgrammaticUpdate` Flag
We implement a semaphore in the `RichEditor` component:
1.  When an update arrives from the Cloud, we set `isProgrammaticUpdate = true`.
2.  We call `editor.commands.setContent(newContent)`.
3.  The editor fires `onUpdate`.
4.  The `onUpdate` handler checks `if (isProgrammaticUpdate)`:
    - **True**: It returns early. **No "onChange" event is propagated.**
    - **False**: It assumes User typed it, and triggers the Save Pipeline.
5.  The flag is reset to `false` immediately after the operation.

This ensures that **cloud updates update the screen but DO NOT trigger a save back to the cloud**, breaking the loop.

---

## 4. Conflict Resolution: Last-Write-Wins (LWW)

### Strategy
Since the server cannot read the text to merge it (e.g., "Merge sentence A with sentence B"), we rely on **Time**.

### Behavior
- **Granularity**: Note-level.
- **Rule**: The version with the **highest (latest) timestamp** wins.
- **Scenario**:
    - You edit Note X on PC A at `10:00`.
    - You edit Note X on PC B at `10:05`.
    - **Result**: PC B's version overwrites PC A's version entirely. PC A's changes are lost.

### Why?
This is the only secure way to handle conflicts without exposing plaintext to a central server or implementing complex CRDTs (Conflict-Free Replicated Data Types) over encrypted blobs, which is an area of active research but effectively impractical for large rich-text documents in this context.

---

## 5. Latency & Performance

- **Sync Speed**: Typically **1-3 seconds**.
    - 1s Debounce (Device A) + ~200ms Network + ~100ms Decryption (Device B).
- **Latency Factors**:
    - **Encryption Cost**: Encrypting large notes takes CPU time.
    - **Debounce**: Chosen to prevent freezing the UI on every keystroke.
    - **Polling Fallback**: If WebSockets fail, updates appear every ~5 seconds.

---

## 6. PWA & Offline Behavior (iOS Specific)

### The "Safari Bridge"
On iOS, PWAs are sandboxed within Safari's engine.
- **Service Worker Lifecycle**: Safari checks for a new version of the app on every cold launch. This causes a momentary delay where it "goes to the internet first."
- **First Load Requirement**: A Service Worker must be successfuly **installed and activated** before offline mode works. This typically requires opening the app once while connected and waiting ~5 seconds.
- **HTTPS Only**: Service Workers (and therefore Offline Mode) **will not work** on local IP addresses (e.g., `http://192.168.1.x`). You must use the live HTTPS production URL.

### Caching Strategy
Kakograph uses **Stale-While-Revalidate**:
1.  **Stage 1 (Instant)**: App loads the cached version immediately from your device.
2.  **Stage 2 (Background)**: App checks the server for a newer version. If found, it updates in the background for the next time you open the app.
3.  **Result**: The app feels instant, but might be "one version behind" for a few seconds if you just pushed an update.

