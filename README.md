# LightSearch

A cross-platform (macOS / Windows / Linux) Spotlight-style launcher with an
**AI-powered natural-language file search mode**, built with Electron and
TypeScript.

## Features

- **Spotlight-style search window** — frameless, translucent panel summoned
  with a global shortcut, dismissed with `Esc` or by clicking away.
- **Global shortcuts** (configurable in Settings):
  - `Cmd/Ctrl + Shift + Space` — regular fuzzy file search
  - `Cmd/Ctrl + Shift + A` — AI search mode
  - `Tab` inside the window toggles between the two modes.
- **Fast fuzzy file search** over a background-built index of your home
  directory (fzy-style scoring: word boundaries, consecutive runs, short
  names win).
- **AI File & Content Locator** — describe what you're looking for in plain
  language ("the tax PDF I downloaded last month", "notes mentioning the
  Berlin offsite"). An LLM converts the query into a structured search plan
  (keywords, extensions, date bounds, folder hints, content terms) which is
  executed **locally** against the index, including a bounded plain-text
  content scan. Your files are never uploaded — only the query text is sent
  to the provider.
- **Two LLM backends** behind one interface (pick in Settings):
  - **Google Gemini** (Generative Language API)
  - **OpenRouter** (OpenAI-compatible; free models like
    `meta-llama/llama-3.3-70b-instruct:free` work out of the box)
- **Keyboard-first**: `↑/↓` navigate, `Enter` opens, `Cmd/Ctrl+Enter` reveals
  in Finder/Explorer.
- **Tray icon** with quick actions; no Dock icon on macOS (utility-app style).

## Getting started

```bash
npm install
npm start          # build + launch Electron
```

Then press the gear icon (or `⚙` in the search bar) and paste an API key:

- **OpenRouter** (default): create a key at <https://openrouter.ai/keys>.
  The default model is free.
- **Gemini**: create a key at <https://aistudio.google.com/apikey>.

Package installers:

```bash
npm run dist:mac   # .dmg / .zip
npm run dist:win   # NSIS installer / .zip
```

## Architecture

The codebase follows a layered Electron architecture with a strict
main/preload/renderer split and `contextIsolation` + `sandbox` enabled.

```
src/
├── shared/                  # Types + IPC channel names shared by all layers
│   ├── types.ts             # Domain models (FileRecord, AiSearchPlan, …)
│   ├── ipc.ts               # IpcChannels — single source of truth
│   └── api.ts               # LightSearchApi — the typed preload bridge contract
├── main/
│   ├── index.ts             # Composition root (constructs & wires services)
│   ├── ipc/registerIpcHandlers.ts   # Whole IPC surface in one auditable file
│   ├── windows/SearchWindowManager.ts
│   ├── shortcuts/ShortcutManager.ts
│   ├── tray/TrayManager.ts
│   └── services/
│       ├── settings/SettingsStore.ts    # JSON-backed settings (observer: emits 'change')
│       ├── indexing/FileIndex.ts        # Repository: in-memory index + disk cache
│       ├── indexing/FileIndexer.ts      # Background crawler (ignores, caps, yields)
│       ├── search/fuzzyScore.ts         # Pure scoring function
│       ├── search/FuzzySearchService.ts # Name search (Spotlight mode)
│       ├── search/ContentScanner.ts     # Bounded plain-text content scan
│       ├── files/FileActions.ts         # open / reveal wrappers
│       └── ai/
│           ├── AiProvider.ts            # Strategy interface for LLM backends
│           ├── GeminiProvider.ts        # Strategy: Gemini REST API
│           ├── OpenRouterProvider.ts    # Strategy: OpenRouter chat completions
│           ├── AiProviderFactory.ts     # Factory: settings -> provider
│           ├── prompts.ts               # Plan prompt + robust JSON extraction
│           └── AiSearchService.ts       # Orchestrator: NL -> plan -> local execution
├── preload/index.ts         # contextBridge exposure of LightSearchApi
└── renderer/                # Vanilla TS UI (no framework, esbuild-bundled)
    ├── index.html / styles.css
    └── src/
        ├── App.ts                   # Controller: input, modes, keyboard
        └── components/              # ResultsList, SettingsPanel
```

### Design patterns used

- **Strategy** — `AiProvider` implementations (`GeminiProvider`,
  `OpenRouterProvider`) are interchangeable LLM backends.
- **Factory** — `AiProviderFactory` builds the right strategy from settings,
  so adding a provider touches two files.
- **Repository** — `FileIndex` hides storage (memory + JSON cache) from
  consumers; `SettingsStore` does the same for settings.
- **Observer** — `SettingsStore` and `FileIndexer` emit events;
  shortcuts/indexer react to settings changes without polling.
- **Composition root / dependency injection** — every service receives its
  dependencies via constructor in `main/index.ts`; nothing reaches for
  globals, which keeps services unit-testable.
- **Facade** — the preload `LightSearchApi` is the single, typed surface between
  renderer and main.

### How AI search works

1. The query plus today's date go into a strict JSON-only prompt
   (`prompts.ts`).
2. The provider returns an `AiSearchPlan`; `normalizePlan` coerces untrusted
   model output into a well-formed plan (never trusted blindly).
3. `AiSearchService.execute` filters the index by extension/date/path hints,
   fuzzy-scores keywords, then scans the top candidates' text content for
   `contentTerms` (size- and count-bounded), attaching snippets to hits.
4. Results are ranked (content hits first) and rendered with the plan's
   one-line summary.

### Security notes

- Renderer runs sandboxed with context isolation; only `LightSearchApi` is exposed.
- API keys are stored in the OS user-data directory and **redacted before
  being sent to the renderer** (the UI only learns that a key is set).
- A restrictive CSP is set in `index.html`.

## Configuration

Settings live in the platform user-data directory
(`~/Library/Application Support/LightSearch`, `%APPDATA%/LightSearch`) as
`settings.json`:

| Key | Default | Description |
| --- | --- | --- |
| `aiProvider` | `openrouter` | `gemini` or `openrouter` |
| `geminiModel` | `gemini-2.0-flash` | Any Generative Language model |
| `openRouterModel` | `meta-llama/llama-3.3-70b-instruct:free` | Any OpenRouter model |
| `searchShortcut` | `CommandOrControl+Shift+Space` | Electron accelerator |
| `aiSearchShortcut` | `CommandOrControl+Shift+A` | Electron accelerator |
| `indexRoots` | your home directory | Absolute paths to crawl |

## Development

```bash
npm run typecheck   # strict tsc over all layers
npm run build       # esbuild bundles main/preload/renderer into dist/
```
