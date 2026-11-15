# Curbie — Installation Plan

> Status: **Draft.** What the host and clients need installed, and where the offline knowledge sources come from. Sizes are approximate; check the download pages before buying a drive. Provider choices marked *TBD* are still open questions in `design.md` §8.

## 0. Automated setup check

`scripts/install.sh` checks this Mac for everything in §1 and walks through installing anything missing, asking before each step:

```bash
scripts/install.sh             # check and offer to install
scripts/install.sh --check     # report only; never prompts or installs
scripts/install.sh --dry-run   # asks every question, but prints the command each "yes" would run instead of running it
```

It covers the platform, Xcode Command Line Tools, Homebrew, Node (≥ 20.19, offers `node@24`), Ollama (installed and responding; offers to start Curbie's Ollama service if it's set up), model storage (the service keeps models on the USB drive, §1.3a), the `qwen3:4b-instruct` and coding models, the data directory (exists, writable, on `/Volumes`, marker file, free space; reads `CURBIE_DATA_DIR` or asks), and system sleep (only changed if you confirm this is the always-on host). Later-phase items such as mkcert are reported, not installed. Knowledge downloads (§4) and accounts (§1.6) stay manual.

## 1. Host: Mac M1 (16 GB)

### 1.1 Required for Phase 1

| Item | Install | Notes |
|---|---|---|
| Xcode Command Line Tools | `xcode-select --install` | Provides git, a C/C++ compiler (only needed if `better-sqlite3` can't fetch a prebuilt binary), and `swiftc` for the OCR helper later. Full Xcode should not be required. |
| Homebrew | https://brew.sh | Optional, but the easiest way to install and update everything below. |
| Node.js 24 LTS (includes npm) | `brew install node@24` or a version manager (fnm, nvm) | The plan requires Node ≥ 20.19 and targets 24 on the M1. |
| Ollama | Mac app from https://ollama.com, or `brew install ollama` | Runs as a background service on `http://127.0.0.1:11434`. Kept alive under launchd (§4.8). |
| Qwen general model | `ollama pull qwen3:4b-instruct` | About 2.5 GB. The default since 2026-11-15 (design §4.5); overridable with `CURBIE_MODEL`. |
| Qwen baseline model (optional) | `ollama pull qwen3:8b` | About 5 GB. A thinking-mode model kept for comparisons (design §7.1); too slow to be the default. |

**No separate install needed:**
- **SQLite:** `better-sqlite3` bundles its own SQLite, including FTS5. macOS also ships a `sqlite3` CLI for inspecting databases by hand.

### 1.2 Required in later phases

| Item | Install | Phase / notes |
|---|---|---|
| Coding model | `ollama pull qwen2.5-coder:7b` (or similar) | About 5 GB. Loaded on demand for coding requests (§4.3). |
| Embedding model | `ollama pull <model>` | Model *TBD* (§8). `nomic-embed-text` is a common small option; not yet decided. |
| mkcert | `brew install mkcert` (plus `nss` if Firefox is used) | Local HTTPS (§5.3). Run `mkcert -install`, then install the root CA on every client device. |
| ZIM reader library | `npm install @openzim/libzim` (in `server/`) | Project dependency for the knowledge indexer, not a system install. |
| OCR helper | Built from `ocr/` with `swiftc` | Swift CLI wrapping Apple Vision (§3). Spawned on demand during ingestion. |

### 1.3 Hardware and macOS setup

- **External USB drive for the data dir and the models.** Full Wikipedia, Gutenberg, scans, and indexes may pass 100 GB (§6b). Suggested: a 1 TB SSD formatted APFS, so index rebuilds have headroom. The current drive is a 500 GB APFS SSD named `CURBIE_BRAIN`, laid out as:

  ```
  /Volumes/CURBIE_BRAIN/
  ├── curbie/          the data dir (CURBIE_DATA_DIR), backed up
  └── ollama-models/   Ollama's models (OLLAMA_MODELS, §1.3a), re-downloadable, not backed up
  ```

- **Connect the drive at USB 3 speed or faster.** Plug it straight into one of the Mac's USB-C ports with a cable rated 10 Gb/s, not through a hub or a USB 2 cable. On a USB 2 link the drive read at about 2 MB/s, so loading a 2.5 GB model took about 1.5 minutes. Check the link with `system_profiler SPUSBHostDataType` (look for the drive's `Link Speed`).
- **Data dir marker.** Curbie refuses to start unless the data dir exists and contains a marker file:

  ```bash
  mkdir -p /Volumes/<usb-drive>/curbie
  touch /Volumes/<usb-drive>/curbie/.curbie-data-dir
  ```

- **Separate backup destination**, not the same USB drive (Time Machine disk or a second drive).
- **Keep the Mac awake** so timers fire on time: System Settings → Energy, or `sudo pmset -a sleep 0`.

### 1.3a Keeping models on the USB drive

Ollama stores models in `~/.ollama/models` on the internal disk unless `OLLAMA_MODELS` says otherwise. Curbie runs Ollama as its own LaunchAgent with that variable pointing at the drive, instead of `brew services start ollama` (which ignores it).

1. Create the folder: `mkdir -p /Volumes/CURBIE_BRAIN/ollama-models`.
2. Save this as `~/Library/LaunchAgents/com.curbie.ollama.plist` (replace `<you>` with your macOS username, and adjust the drive name if yours differs):

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
     <key>Label</key>
     <string>com.curbie.ollama</string>
     <key>ProgramArguments</key>
     <array>
       <string>/opt/homebrew/bin/ollama</string>
       <string>serve</string>
     </array>
     <key>EnvironmentVariables</key>
     <dict>
       <key>OLLAMA_MODELS</key>
       <string>/Volumes/CURBIE_BRAIN/ollama-models</string>
     </dict>
     <key>KeepAlive</key>
     <dict>
       <key>PathState</key>
       <dict>
         <key>/Volumes/CURBIE_BRAIN/ollama-models</key>
         <true/>
       </dict>
     </dict>
     <key>StandardOutPath</key>
     <string>/Users/<you>/Library/Logs/ollama.log</string>
     <key>StandardErrorPath</key>
     <string>/Users/<you>/Library/Logs/ollama.log</string>
   </dict>
   </plist>
   ```

   Write it with an editor, not by pasting a heredoc into the terminal: copied lines can pick up leading spaces, and then the shell never sees the closing `EOF`. Check it with `plutil -lint`.
3. Start it with `scripts/ollama-service.sh start`, then pull the models (§1.1). They download straight to the drive.

How it behaves:
- **`KeepAlive` → `PathState`** keeps Ollama running only while the models folder exists, so it never starts against an unplugged drive. There is deliberately no `RunAtLoad`, which would start it regardless.
- **It starts at login** when the drive is attached.
- **`scripts/ollama-service.sh`** wraps launchd: `start` (refuses if the drive isn't mounted), `stop` (run it before ejecting the drive, or macOS reports the disk in use), `restart`, and `status` (shows loaded models).
- **Logs** go to `~/Library/Logs/ollama.log`. Ollama's own request log there also gives per-call timings (`POST "/api/chat"` lines).
- **Curbie pins its model in memory** (`keep_alive: -1`), so only the first question after Ollama starts waits on reading the model from the drive.
- **Moving existing models:** stop Ollama, `mv ~/.ollama/models/* /Volumes/CURBIE_BRAIN/ollama-models/`, start it, and confirm with `ollama list`.

### 1.4 Configuration (environment variables)

| Variable | Required | Default | Notes |
|---|---|---|---|
| `CURBIE_DATA_DIR` | Yes | — | Absolute path to the data dir on the USB drive. |
| `CURBIE_MODEL` | No | `qwen3:4b-instruct` | Ollama model tag. Since Phase 2 this is only the default: a model chosen on the Settings page (Manage → Settings) overrides it. |
| `OLLAMA_BASE_URL` | No | `http://127.0.0.1:11434` | |
| `CURBIE_HTTP_HOST` | No | `127.0.0.1` | An IP address or `localhost`. Set `0.0.0.0` to serve the home network (§1.5a). No auth, by decision (design §5.3). |
| `CURBIE_HTTP_PORT` | No | `3000` | |
| `CURBIE_SKILLS_DIR` | No | repo `skills/` | |
| `CURBIE_HISTORY_MESSAGE_LIMIT` | No | `10` | 0–100. |
| `CURBIE_MAX_TOOL_ROUNDS` | No | `4` | 1–10. |

### 1.5 First run (Phase 1)

```bash
scripts/ollama-service.sh start
ollama pull qwen3:4b-instruct
cd server && npm ci && npm run build
CURBIE_DATA_DIR=/Volumes/<usb-drive>/curbie npm start
```

Then open `http://127.0.0.1:3000`. The live verification checklist is in the Phase 1 plan, Task 12 Step 7. Running under launchd (start at boot, wait for the USB drive, restart on crash) comes in a later phase.

### 1.5a Reaching Curbie from other devices (Phase 2)

Curbie is served over plain HTTP and reached by IP address (design §5.3).

1. Start it on all interfaces: `CURBIE_HTTP_HOST=0.0.0.0 CURBIE_DATA_DIR=/Volumes/CURBIE_BRAIN/curbie npm start`. The log prints an `On your home network: http://<ip>:3000` line for each network address.
2. The IP can also be found under System Settings → Wi-Fi → Details, or with `ipconfig getifaddr en0`.
3. Reserve that IP for the M1 in the router's DHCP settings, or the address will eventually change and bookmarks will break.
4. The first time, macOS may ask whether `node` may accept incoming connections. Allow it.
5. On a phone or laptop on the same network, open `http://<ip>:3000`.

Open the page by IP, `localhost`, or `127.0.0.1`. Curbie refuses requests addressed to a hostname (a DNS rebinding defense), and refuses form posts and chat connections from other sites' pages (design §5.3).

### 1.6 Accounts and API keys (later phases)

Stored in environment/config outside the repo or in the macOS Keychain, never in source (§4.6, §6b).

- SMTP provider for email alerts (*TBD*)
- Weather API key (*TBD*, AccuWeather or alternative)
- Web search provider (*TBD*)
- Calendar source (*TBD*)

### 1.7 Not needed

Docker, Redis, Python on the M1 (unless a Python sidecar is ever needed, §3), and the Kiwix apps (Curbie reads ZIM files directly; see §4.1).

## 2. Development machine

- Xcode Command Line Tools and Node.js 24, as above.
- Ollama is optional here. Without it, the server starts, and chat replies show the "model isn't responding" error (Phase 1 plan, Task 12 Step 6).

## 3. Clients

- **Phone and laptops:** a modern browser on the home network. If HTTPS lands later, the mkcert root CA too.
- **Raspberry Pi (later):** Raspberry Pi OS with a browser and the mkcert root CA. The voice phase adds Python 3 with openWakeWord, whisper.cpp, and Piper.

## 4. Offline knowledge sources

All of these go on the USB drive, inside the data dir. The indexed `knowledge.db` is rebuildable from the downloaded files, so backing it up is optional (§6b).

### 4.1 Kiwix ZIM files (chosen)

A ZIM is a single compressed file holding every article or book in a collection. Download from the Kiwix server and pick the newest `<YYYY-MM>` date. Sizes below are from the server listing on 2026-10-02.

**Planned downloads (~91 GB before indexing):**

| Collection | File | Size | Contents |
|---|---|---|---|
| English Wikipedia | `wikipedia_en_all_nopic_<YYYY-MM>.zim` | 49 GB | Every English article, full text, no images |
| Gutenberg PR | `gutenberg_en_lcc-pr_<YYYY-MM>.zim` | 15 GB | English literature (Austen, Dickens, the Brontës, Hardy, Stevenson, Conan Doyle, Wells) |
| Gutenberg PS | `gutenberg_en_lcc-ps_<YYYY-MM>.zim` | 15 GB | American literature (Twain, Melville, Hawthorne, Poe, Alcott, London) |
| Gutenberg T | `gutenberg_en_lcc-t_<YYYY-MM>.zim` | 12 GB | Technology, including cookery |

- Wikipedia: https://download.kiwix.org/zim/wikipedia/
- Gutenberg: https://download.kiwix.org/zim/gutenberg/

**Why these variants:**
- **`nopic`, not `mini`:** `mini` files contain only each article's introduction. Curbie answers only from what it can cite, so intros alone would mean far more "don't know" answers. `nopic` keeps the full text and drops images, which Curbie doesn't use.
- **Gutenberg by subject, not `gutenberg_en_all`:** the full English collection is 206 GB. Kiwix splits it by Library of Congress Classification (LCC) class, so only the wanted subjects are downloaded.

**Add later as needed** (other LCC literature classes; novels are filed by the author's nationality, so some well-known ones are not in PR or PS):

| File suffix | Size | Contents |
|---|---|---|
| `lcc-pz` | 18 GB | Fiction and juvenile belles lettres. Gutenberg files much popular and children's fiction here. |
| `lcc-pq` | 3.8 GB | French, Italian, Spanish, Portuguese literature (Hugo, Dumas, Verne, Cervantes, in translation) |
| `lcc-pn` | 3.0 GB | General literature: anthologies, drama collections, criticism |
| `lcc-pt` | 724 MB | German, Dutch, Scandinavian literature (Goethe, Kafka, Ibsen) |
| `lcc-pa` | 498 MB | Greek and Latin classics in translation |
| `lcc-pg` | 261 MB | Slavic literature (Tolstoy, Dostoevsky, Chekhov) |

**Other Wikipedia options** for reference: `wikipedia_en_top1m_nopic` (16 GB, the million most-read articles), `wikipedia_en-simple_all_nopic` (1.0 GB, Simple English, a quick way to prove the pipeline before the 49 GB download), and topic collections such as medicine, history, and computer (a few hundred MB each).

**Optional extras** (sibling folders on the same server): iFixit, Stack Exchange sites, DevDocs (offline programming docs).

**Caveat:** some Gutenberg books have no LCC classification, and it's unconfirmed whether Kiwix includes those in any subject file. Spot-check a few favorite titles after downloading.

**Downloading large files:**
- Use the `.torrent` or `.meta4` file listed next to each ZIM, or `curl -C - -O <url>` so interrupted downloads resume.
- Verify against the `.sha256` file published alongside each ZIM.

**Kiwix software is not required.** Curbie's indexer reads the `.zim` files directly through the `@openzim/libzim` library (§1.2). The Kiwix desktop app or `kiwix-serve` is optional, only for browsing the files by hand to check what's in them.

### 4.2 Alternatives (more work)

- **Wikipedia raw dump:** https://dumps.wikimedia.org/enwiki/latest/ — `enwiki-latest-pages-articles.xml.bz2` (~20+ GB compressed). Raw wikitext, so templates and markup must be parsed into clean text.
- **Gutenberg directly:** gutenberg.org asks that bulk downloads use its official mirrors or rsync, not website scraping. Provides plain-text files and a machine-readable catalog. Cleaner text than ZIMs, but the collection has to be assembled by hand.
