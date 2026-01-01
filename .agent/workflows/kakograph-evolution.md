---
description: Comprehensive evolution plan for Kakograph
---

# Kakograph Evolution Plan

This plan outlines the bugs to fix and features to implement to make Kakograph a robust, professional, and feature-rich local-first note-taking app.

## // turbo-all

## 1. Critical Bug Fixes & Stability 🛡️

### 1.1. False "Connected" Status (URGENT)
- **Problem**: UI shows "Connected" even when there is no internet.
- **Solution**: 
    - Improve `testConnection` in `ConvexConfigProvider` to check `navigator.onLine` and handle fetch timeouts more accurately.
    - Sync the connection status with actual WebSocket health if possible.

### 1.2. PWA Cache Management
- **Problem**: Hard crashes due to old service worker cache.
- **Solution**: 
    - Finalize the automated repair system (already started).
    - Ensure `next-pwa` configuration uses a "Network First" or more granular strategy for configuration files.

### 1.3. Backup Encryption Verification
- **Problem**: Backup JSON might be exporting plaintext.
- **Solution**: 
    - Check `storage.exportAll()`. Ensure it exports the `EncryptedNote` objects directly (which contain ciphertext) and NOT decrypted data.
    - Add a "Verify Encryption" step in the export process.

### 1.4. Recycle Bin Persistence
- **Problem**: Users report permanent deletion doesn't always stick.
- **Solution**:
    - Refine the "Safety Tracker" in the sync engine to ensure hard-deletes are finalized on the server before clearing them locally.
    - Add a "Clear Trash" button for bulk deletion.

### 1.5. Graph View Stability
- **Problem**: Nodes bounce around too much.
- **Solution**: 
    - Adjust D3/Force-graph settings to increase "damping" or "friction".
    - Lock nodes in place after the initial layout or provide a "Pin Nodes" toggle.

## 2. Editor Enhancements ✍️

### 2.1. Basic Formatting Tools
- [ ] **Indent/Outdent**: Add buttons to the toolbar and keyboard shortcuts (Tab/Shift+Tab) for list indentation.
- [ ] **Text Color & Highlight**: Add color picker and background highlighting support to Tiptap.
- [ ] **Tables**: Implement `@tiptap/extension-table` for professional data organization.
- [ ] **Resizable Images**: Add an extension to allow users to drag/resize images.

### 2.2. Link System Fix
- **Problem**: Manual link insertion is reported as failing.
- **Solution**: 
    - Debug the `setLink` function in `RichEditor`.
    - Ensure the Link bubble menu or prompt is user-friendly and correctly applies the `link` mark.

### 2.3. Advanced Features
- [ ] **Slash Commands**: Add a `/` command menu (using Tiptap's Suggestion extension) for quickly inserting blocks, tables, or AI tools.
- [ ] **Floating/Fixed Toolbar**: Fix the mobile issue where the toolbar is "stuck" at the top or overlaps content.

## 3. Advanced Sync & Data Management 🔄

### 3.1. Merge & Conflict Resolution
- **Problem**: Concurrent edits can lead to data loss or "last-write-wins" issues.
- **Solution**: 
    - **Optimistic Merge**: If two notes are different but one is strictly newer and logically contains the same sequence, merge automatically.
    - **Conflict UI**: If encryption prevents deep merging, show a side-by-side comparison (Diff) and let the user choose or manually merge.
    - **Fallback**: Strict timestamp-based enforcement with a "Conflict Found" notification.

### 3.2. Sync UX & Categorization
- **Offline Mode**: Explicitly label "Local Only" as "Offline Only".
- **Sync Types**: 
    - **Public Convex**: Standard cloud sync.
    - **Custom Convex**: For Self-hosted or LAN-based instances.
- **Warnings**: Add a warning modal when switching sync providers: "Stick with one provider to avoid conflicts. Always backup before switching."

## 4. UI/UX Evolution 🎨

### 4.1. Light Mode
- **Goal**: Implement a beautiful light theme using "Plasaba" aesthetics.
- **Implementation**: Add CSS variables for light mode and a theme toggle.

### 4.2. Folder Boards & Metadata
- **Folders**: Transform folders from simple groups into "Boards" where users can add a description, cover image, or metadata.
- **AI Meta-Data**: Support for hidden or visible metadata fields (dates, auto-summary permissions, tags) to help AI agents process notes.

### 4.3. Mobile Enhancements
- [ ] **Mobile ToC**: Add a floating or drawer-based Table of Contents for long notes on mobile.

## 5. AI Integration 🤖
- [ ] **AI Summary**: Add a button to generate summaries using KKU or native Gemini API.
- [ ] **Metadata Management**: Let AI automatically tag and organize notes based on content.
