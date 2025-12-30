# Kakograph

> **Write first, organize later** — Zero-knowledge, local-first note-taking.

Kakograph is a privacy-focused note-taking PWA that prioritizes speed, security, and user sovereignty. All data is encrypted client-side with AES-256-GCM, and users authenticate with a BIP-39 seed phrase (no email/password required).

---

## ✨ Features

### Core
- 🔐 **Zero-Knowledge Architecture** — Notes encrypted before leaving your device
- ✍️ **Rich Text Editor** — TipTap-powered with Markdown shortcuts and syntax highlighting
- 📱 **Mobile-First PWA** — Installable on iOS/Android, responsive design
- 🔄 **Offline-First** — Works 100% offline with IndexedDB
- 🆓 **Free Forever** — No subscriptions, no cloud costs

### Editor
- **Sticky/Fixed Toolbar** — Always accessible formatting tools
- **Wiki-style Linking** — Use `[[Note Title]]` to link between notes
- **Code Blocks** — Syntax highlighting for 20+ languages
- **Markdown Shortcuts** — Type `#`, `##`, `-`, `>` for instant formatting

### Organization
- 📁 **Virtual Folders** — Organize notes with drag-and-drop
- 🗑️ **Trash Bin** — Soft delete with 30-day auto-cleanup
- 🔄 **Restore/Permanent Delete** — Granular control over deleted notes
- 📊 **Interactive Note Graph** — Visualize connections between notes

### Security & Export
- 🔒 **Session PIN Lock** — Quick unlock without re-entering seed phrase
- 💾 **Full Snapshot Backup** — Export/Import all notes, trash, and folders as JSON
- 🔑 **Seed Phrase Recovery** — Reset PIN using your 12-word phrase

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

---

## � Deployment

For the best performance (low latency, global edge network), we recommend:

### 1. Frontend: Vercel
Kakograph is built with Next.js, making **Vercel** the ideal host.
- Zero-configuration deployment.
- Global CDN for static assets.
- [Deploy to Vercel](https://vercel.com/new)

### 2. Backend: Convex Cloud
- **Managed:** Use [Convex Cloud](https://convex.dev) for specialized real-time performance and global caching.
- **Self-Hosted:** You can run the Convex backend via Docker on any VPS (DigitalOcean, Hetzner, etc.) if data sovereignty is your priority.

```bash
# Docker command for self-hosting backend
docker run -d -p 3210:3210 convexinc/convex-backend
```

---

## �🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Framework** | Next.js 16 (App Router, Turbopack) |
| **Language** | TypeScript |
| **Editor** | TipTap (ProseMirror-based) |
| **Storage** | IndexedDB via Dexie.js |
| **Graph** | react-force-graph-2d (D3-based) |
| **Crypto** | WebCrypto API (AES-256-GCM, PBKDF2) |
| **Identity** | BIP-39 seed phrase |
| **Styling** | Tailwind CSS + Custom CSS |
| **Icons** | Lucide React |

---

## 🔒 Security Architecture

| Component | Implementation |
|-----------|---------------|
| **Authentication** | 12-word BIP-39 mnemonic |
| **Key Derivation** | PBKDF2 with 100,000 iterations |
| **Encryption** | AES-256-GCM with 96-bit IV per note |
| **Session Protection** | Optional 6-digit PIN (derived from seed) |
| **Data Location** | Browser IndexedDB (device-specific) |

### Important Notes
- **No server** ever sees your plaintext data
- **No cross-browser sync** — Data is isolated per browser/profile (unless Sync is enabled)
- Export your backup regularly to avoid data loss

---

## 🌐 Sync Architecture (Technical)

Kakograph uses a **Local-First, Cloud-Optional** architecture.

### 1. Identity & Encryption
Your **Seed Phrase** is the root secret. We derive two distinct keys to ensure security:
- **Encryption Key (`AES-256-GCM`)**: Derived using `PBKDF2` (Salt: `kakograph-v1`). Used to encrypt/decrypt note content.
- **Sync Identity (`Device ID`)**: Derived using `PBKDF2` (Salt: `kakograph-device-v1`). Used to identify "you" on the sync server.

**Benefit:** The server knows *who* you are (Sync ID) to group your data, but can never *read* your data because it never sees the Encryption Key.

### 2. Conflict Resolution
We use a **Last-Write-Wins (LWW)** strategy based on client-side timestamps:
- If you edit the same note on two devices, the save with the **later timestamp** overwrites the earlier one.
- **Deletion** is treated as a property update (`deleted: true`), so deletions also follow LWW.

### 3. Data Flow
- **Write:** UI &rarr; Local IndexedDB &rarr; Sync Queue (if enabled) &rarr; Convex Mutation
- **Read:** Local IndexedDB &rarr; UI
- **Sync:** Convex Subscription (`onUpdate`) &rarr; Local IndexedDB &rarr; UI Refresh

This ensures the app remains **fast and offline-capable** even when sync is enabled.

---

## 📦 Data Storage

### Where is data stored?
- **IndexedDB** — Browser-based storage (like localStorage but better)
- Each browser (Chrome, Firefox, Safari) has **separate** storage
- Data does **NOT** sync between browsers automatically

### Browser Support
| Browser | Support |
|---------|---------|
| Chrome | ✅ Full |
| Firefox | ✅ Full |
| Safari | ✅ Supported |
| Edge | ✅ Full |
| Mobile Browsers | ✅ Full |

### Backup & Restore
The app supports full snapshot export/import:
- **Export**: Downloads JSON with all notes, trash, and empty folders
- **Import**: Completely replaces current data with backup snapshot

---

## 📋 Development Progress

### ✅ Completed Features

#### Core Editor
- [x] TipTap rich text editor with toolbar
- [x] Fixed toolbar (stays visible during scroll)
- [x] Markdown shortcuts (headings, lists, quotes, code)
- [x] Code block syntax highlighting
- [x] Wiki-style `[[note linking]]` with autocomplete
- [x] Table of Contents sidebar

#### Organization
- [x] Virtual folders (create, rename, delete)
- [x] Drag-and-drop notes between folders
- [x] Empty folder placeholders
- [x] Folder deletion (moves all notes to trash)

#### Trash & Recovery
- [x] Soft delete with trash bin
- [x] 30-day auto-cleanup for trash
- [x] Restore individual notes from deleted folders (as root notes)
- [x] Restore entire folders with all notes
- [x] Permanent delete (individual notes or entire folders)
- [x] Proper event handling (no accidental folder deletion)

#### Graph Visualization
- [x] Interactive force-directed note graph
- [x] Bidirectional highlighting (sidebar ↔ graph)
- [x] Tag-based node coloring
- [x] Connected component grouping
- [x] Click to navigate between notes

#### Security & Sessions
- [x] BIP-39 seed phrase authentication
- [x] Optional 6-digit PIN for quick unlock
- [x] Session lock/unlock
- [x] "Forgot PIN? Use Seed Phrase" recovery

#### Import/Export
- [x] Full snapshot export (notes + trash + empty folders)
- [x] Full snapshot import (replaces all data)
- [x] Proper handling of legacy backups

#### UI/UX
- [x] Settings dropdown menu (Lock, Export, Import, Sync Settings)
- [x] Custom modal system (no browser alerts)
- [x] Mobile-responsive sidebar
- [x] Modal z-index fixes for mobile
- [x] Gradient logo matching landing page

#### Cloud Sync (New)
- [x] Optional sync via Convex
- [x] Multiple modes: Local Only, Local Convex, Convex Cloud, Custom URL
- [x] Bidirectional sync (local updates push, remote updates pull)
- [x] Sync status indicator in header
- [x] Connection testing and auto-reconnect
- [x] **Smart Identity**: Syncs across devices using the same Seed Phrase (no extra login required).

### 🚧 Planned Features
- [ ] Real-time collaboration
- [ ] Note versioning/history
- [ ] Full-text search
- [ ] Tags system
- [ ] Dark/Light theme toggle
- [ ] PWA install prompt

---

## ☁️ Convex Sync (Optional)

Kakograph supports optional cloud sync via **Convex**. Convex is **fully self-hostable** with an open-source backend (Rust + TypeScript, FSL Apache 2.0 License).

### Options for Users

| Option | Description |
|--------|-------------|
| **Convex Cloud** | Create free account at [convex.dev](https://convex.dev) |
| **Self-Hosted** | Run Convex backend on your own server |

### Self-Hosting Guide

Convex backend is open-source and can be self-hosted:
- [Self-hosting documentation](https://docs.convex.dev/production/self-hosting)
- [Convex GitHub](https://github.com/get-convex)
- Join `#self-hosted` on [Convex Discord](https://discord.gg/convex)

### Setup

1. Create a Convex project (cloud or self-hosted)
2. Deploy the schema:
   ```bash
   npx convex deploy
   ```
3. Configure your Kakograph instance with your Convex URL

### Convex Schema

The `/convex` folder contains:
- `schema.ts` — Database schema matching local IndexedDB structure
- `notes.ts` — API functions (queries, mutations)

**Operations supported:**
- `upsertNote` / `bulkUpsertNotes` — Create or update notes
- `softDeleteNote` / `hardDeleteNote` — Trash and permanent delete
- `restoreNote` / `moveNote` — Recovery and folder operations
- `getActiveNotes` / `getAllNotes` / `getTrashNotes` — Querying
- `clearAllNotes` — Full reset (for snapshot restore)
- `cleanupOldTrash` — 30-day auto-cleanup

---

## 🏗️ Project Structure

```
src/
├── app/
│   ├── page.tsx          # Landing/Auth page
│   ├── write/
│   │   ├── page.tsx      # Main editor
│   │   └── write.css     # Editor styles
│   └── globals.css
├── components/
│   ├── auth/             # PIN keypad, seed phrase input
│   ├── editor/           # RichEditor, TableOfContents
│   ├── graph/            # NoteGraph visualization
│   └── ui/               # Modal, shared components
├── lib/
│   ├── auth/             # Auth context, session management
│   ├── crypto/           # Encryption utilities
│   ├── notes/            # useNotes hook, note operations
│   └── storage/          # IndexedDB provider
└── ...
```

---

## 📄 License

AGPLv3 — See [LICENSE](LICENSE)

---

## 🤝 Contributing

Contributions welcome! Please read the codebase and open an issue before submitting PRs.

---

**Made with ❤️ for privacy-conscious note-takers**
