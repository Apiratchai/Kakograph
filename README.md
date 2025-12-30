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

## 🛠️ Tech Stack

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
- **No cross-browser sync** — Data is isolated per browser/profile
- Export your backup regularly to avoid data loss

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
- [x] Settings dropdown menu (Lock, Export, Import)
- [x] Custom modal system (no browser alerts)
- [x] Mobile-responsive sidebar
- [x] Modal z-index fixes for mobile
- [x] Gradient logo matching landing page

### 🚧 Planned Features
- [ ] **Cloud sync via Convex** (user-hosted Convex project) — *Schema ready*
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
