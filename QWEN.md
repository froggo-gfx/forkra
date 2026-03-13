# Fontra (Forkra) - Project Context

## Project Overview

**Fontra** (this fork is called **Forkra**) is a browser-based font editor for creating and editing variable fonts. It consists of:

- **Client-side**: JavaScript/TypeScript code running in the browser (HTML/CSS/JS)
- **Server-side**: Python server using `aiohttp` for WebSocket communication

The architecture is highly modular with pluggable views, storage backends, and project managers.

### Key Technologies

| Layer | Technologies |
|-------|-------------|
| **Frontend** | JavaScript (ES modules), TypeScript, CSS, HTML, CodeMirror, Webpack |
| **Backend** | Python 3.10+, aiohttp, cattrs, fonttools, ufoLib2, skia-pathops |
| **Communication** | JSON over WebSocket |
| **Font Formats** | .designspace, .ufo, .ttf, .otf, .woff, .woff2, .fontra, .glyphs (via plugin) |

### Directory Structure

```
fontra-skeletron/
├── src/fontra/           # Python server code
│   ├── backends/         # Font format backends
│   ├── core/             # Core server functionality
│   ├── filesystem/       # Filesystem project manager
│   └── workflow/         # Workflow tools
├── src-js/               # JavaScript client workspaces
│   ├── fontra-core/      # Core client library
│   ├── fontra-webcomponents/
│   ├── views-editor/     # Glyph editor view
│   ├── views-fontinfo/   # Font info view
│   ├── views-fontoverview/
│   └── ...
├── test-py/              # Python tests (pytest)
├── docs/                 # Documentation
├── scripts/              # Build/deployment scripts
└── venv/                 # Python virtual environment
```

## Building and Running

### Prerequisites

- **Python 3.10+** (preferably from python.org)
- **Node.js 20+** (preferably from nodejs.org)

### Initial Setup

```bash
# Create Python virtual environment
python3.10 -m venv venv --prompt=fontra

# Activate venv (Windows)
venv\Scripts\activate
# Activate venv (macOS/Linux)
source venv/bin/activate

# Install dependencies
pip install --upgrade pip
pip install -r requirements.txt
pip install -e .

# Install dev dependencies (for testing/contributing)
pip install -r requirements-dev.txt
pre-commit install --install-hooks
```

### Running the Application

```bash
# Start the Fontra server with a folder containing fonts
fontra --launch filesystem /path/to/font/folder

# Development mode (auto-rebuild on JS changes)
fontra --dev --launch filesystem /path/to/font/folder

# With robocjk backend (requires fontra-rcjk plugin)
fontra --launch rcjk some-robocjk-server.example.com
```

The application will open in your default browser at `http://localhost:8000/`.

### Testing

```bash
# Run Python tests
pytest

# Run JavaScript tests
npm test

# Run with coverage
pytest --cov-report=term-missing --cov-config=pyproject.toml --cov=src/fontra --cov=test-py
```

### Building

```bash
# Bundle JavaScript (production)
npm run bundle

# Bundle JavaScript (watch mode)
npm run bundle-watch
```

## Development Conventions

### Code Style

- **Python**: Black formatter, isort for imports, flake8 for linting
- **JavaScript/TypeScript**: Prettier (with organize-imports and sort-json plugins)
- **Pre-commit hooks**: Automatically run formatters and linters before commits

### Configuration Files

| File | Purpose |
|------|---------|
| `.pre-commit-config.yaml` | Pre-commit hook definitions |
| `.prettierrc` / `.prettierignore` | Prettier configuration |
| `.flake8` | Flake8 linting rules |
| `pyproject.toml` | Python build config, pytest, mypy, coverage |
| `package.json` | Node.js workspaces, webpack, scripts |
| `rollup.config.js` | Rollup bundling config |
| `webpack.config.cjs` | Webpack bundling config |

### Testing Practices

- **Python**: pytest with pytest-asyncio for async tests
- **JavaScript**: Mocha + Chai for unit tests
- Tests are located in `test-py/` and `src-js/*/tests/`
- Test data is stored in `test-py/data/`

### Entry Points (Plugin System)

Fontra uses Python entry points for extensibility:

```toml
[project.entry-points."fontra.views"]
editor = "fontra.client"
fontoverview = "fontra.client"

[project.entry-points."fontra.projectmanagers"]
filesystem = "fontra.filesystem.projectmanager:FileSystemProjectManagerFactory"

[project.entry-points."fontra.filesystem.backends"]
designspace = "fontra.backends.designspace:DesignspaceBackend"
ufo = "fontra.backends.designspace:UFOBackend"
ttf = "fontra.backends.opentype:OTFBackend"
```

### Key Features (Roadmap Status)

**Implemented** (partial list):
- Read/write .designspace, .ufo, .ttf, .otf, .woff2
- Live text entry with glyph interpolation
- Glyph editing (move points, pen tool, components)
- Multi-level undo/redo per glyph
- Kerning editing
- Font info editing
- Variation axis editing (including avar/avar-2)
- Full-screen mode, gestures, zoom
- Copy/paste, transformation panel
- FontMake integration for export

**In Progress / Planned**:
- Advanced text shaping
- Right-to-left / vertical text modes
- More advanced outline editing tools
- GitHub integration
- Serverless mode
- P2P collaboration features

## Useful Commands

```bash
# Check git status and recent changes
git status && git diff HEAD && git log -n 3

# Run pre-commit on all files
pre-commit run --all-files

# Install a Fontra plugin (example: fontra-glyphs)
pip install fontra-glyphs

# Run Fontra workflow commands
fontra-workflow <workflow.yaml>
```

## Related Repositories

- **fontra-pak**: Standalone desktop application builds
- **fontra-rcjk**: RoboCJK server backend
- **fontra-glyphs**: .glyphs format support
- **fontra-compile**: glyf1 variable composite export

## Notes

- This repository is a **fork of Fontra** called "Forkra"
- The codebase uses async/await patterns extensively (Python asyncio, JS promises)
- Client/server communication is via JSON objects over WebSocket
- Browser URL encodes view settings for shareable links
- Localization is supported via key-value JSON files in `src/fontra/client/lang/`

---

## Active Development: Persistent Power Rulers

### Status

**✅ IMPLEMENTED** (as of 2026-03-12)

The Persistent Power Rulers feature is now complete and includes:
- Multiple rulers per glyph with file-based persistence
- Click-to-activate static rulers
- Sidebar panel for ruler management
- Undo/redo support

The Persistent Power Rulers feature enhances the existing power ruler tool to support:
- **Multiple rulers per glyph** - Create multiple measurement rulers in a single glyph
- **Active vs static rulers** - One active ruler (full opacity) that updates on drag; static rulers (40% opacity lines) that remain fixed
- **File-based persistence** - Rulers stored in `glyph.customData["fontra.glyph.rulers"]`, persisting in font files and shareable via GitHub
- **Sidebar panel** - Manage rulers with X/Y/angle editing, naming, and deletion

### User Interaction

- **Double-click** in canvas (not on glyph) → Creates new ruler at that position
- **Drag** with power ruler tool → Repositions active ruler
- **Backspace** → Deletes active ruler
- **Sidebar panel** → Edit ruler properties (name, X, Y, angle), delete rulers

### Technical Design

**Data Structure:**
```javascript
{
  activeRulerId: "ruler-1742000000000",
  rulers: {
    "ruler-1742000000000": {
      id: "ruler-1742000000000",
      name: "Ruler 1",
      basePoint: { x: 100, y: 200 },
      directionVector: { x: 1, y: 0 },
      intersections: [...],
      measurePoints: [...]
    }
  }
}
```

**Persistence:** Rulers are stored in glyph customData and saved via the edit recording system, providing:
- Undo/redo support
- File-based storage (survives browser restart)
- Shareability via Git/version control
- Cross-machine synchronization

### Visual Design

| Element | Active Ruler | Static Ruler |
|---------|-------------|--------------|
| Line | Full opacity | 40% opacity |
| Intersection markers | Full opacity | Full opacity |
| Distance labels | Full opacity | Full opacity |

### Documentation Files

| File | Purpose |
|------|---------|
| `task_plan.md` | High-level phases and task tracking |
| `findings.md` | Research notes on existing implementation |
| `progress.md` | Session log and current status |
| `docs/superpowers/plans/2026-03-12-persistent-power-rulers.md` | Detailed implementation plan |

### Files Modified/Created

| File | Status | Purpose |
|------|--------|---------|
| `src-js/views-editor/src/edit-tools-power-ruler.js` | ✅ Complete | Core ruler logic, persistence, hit detection |
| `src-js/views-editor/src/panel-power-rulers.js` | ✅ Complete | Sidebar panel component |
| `src-js/views-editor/src/editor.js` | ✅ Complete | Register new panel |
| `src-js/fontra-core/assets/lang/en.js` | ✅ Complete | Localization strings |

### Remaining Work

- [ ] Manual testing in browser
- [ ] Bug fixes if needed
- [ ] Merge to main branch

### Known Issues & Future Improvements

**⚠️ Issues to Fix Before File Persistence:**

1. **Drag Behavior** - Needs refinement
   - Current: Ruler follows clicks/drags too eagerly
   - Desired: Standard draggable pattern (click selects, drag moves, double-click creates)
   - Impact: Makes reliable double-click creation difficult

2. **Ruler Scope** - Needs architectural decision
   - Current: Rulers exist on ALL sources/layers (global by default)
   - Desired: Per-layer scoping with optional "global" property
   - Impact: Affects file persistence structure

**Storage Structure TBD:**
```javascript
// Per layer (default)
glyph.layers[layerName].customData["fontra.glyph.rulers"]

// Global option
glyph.customData["fontra.glyph.rulers.global"]
```

**Action Required:** Resolve these issues before implementing file persistence to avoid breaking changes.

---

### Completed Work

- [x] File-based persistence (glyph.customData)
- [x] Sidebar panel component
- [x] Localization strings
- [x] Ruler hit detection and activation
- [x] Hover cursor changes
- [x] Undo/redo integration

### Key Design Decisions

1. **No pointer tool integration** - Static rulers are not draggable with pointer tool (simpler implementation, clearer tool responsibilities)
2. **File-based persistence** - Chose glyph.customData over localStorage for shareability and version control
3. **Opacity-based visual distinction** - Static rulers distinguished by line opacity only, markers/labels remain visible
4. **One active ruler** - Only one ruler updates dynamically; others are static until activated
