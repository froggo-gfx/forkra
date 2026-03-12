# Task Plan: Persistent Power Rulers (Revised)

## Goal
Implement persistent power rulers feature where:
- Double-click creates a new ruler (becomes active)
- Previous rulers become static (NOT draggable - power ruler tool only)
- Sidebar panel shows ruler list with X/Y/angle parameters
- Static rulers have reduced opacity for lines only (markers/labels full opacity)
- Rulers persist in glyph customData (file-based, shareable via GitHub)

## Phases

### Phase 1: Research & Analysis
- [x] Understand current ruler implementation
- [x] Identify all files that need modification
- [x] Understand persistence mechanism (ObservableController)

### Phase 2: Data Structure Changes
- [x] Modify ruler data structure to support multiple rulers per glyph
- [x] Add ruler ID and name fields
- [ ] Update storage to use glyph.customData (file-based persistence)

### Phase 3: Core Ruler Logic Updates
- [x] Update PowerRulerTool to manage multiple rulers
- [x] Implement double-click to create new ruler
- [x] Make previous rulers static when new one created
- [x] Update draw function to render multiple rulers with different opacity

### Phase 4: Sidebar Panel
- [ ] Create new panel component for ruler list
- [ ] Add ruler item UI (checkbox, name, X, Y, angle, delete)
- [ ] Implement panel logic (add, edit, delete rulers)
- [ ] Sync panel with ruler state

### Phase 5: File-based Persistence
- [ ] Store rulers in glyph.customData["fontra.glyph.rulers"]
- [ ] Load rulers when glyph is opened
- [ ] Save rulers via edit recording (undo/redo support)
- [ ] Handle glyph switching correctly

### Phase 6: Testing & Polish
- [ ] Test ruler creation/deletion
- [ ] Test panel interactions
- [ ] Test file persistence (save/reload)
- [ ] Fix visual styling (opacity, hover states)

## Files to Modify

| File | Changes |
|------|---------|
| src-js/views-editor/src/edit-tools-power-ruler.js | Core ruler logic, multiple rulers, customData persistence |
| src-js/views-editor/src/editor.js | Register new panel |
| New: src-js/views-editor/src/panel-power-rulers.js | New sidebar panel component |
| src-js/fontra-core/assets/lang/en.js | Add localization strings |

## Key Design Decisions (Updated)

1. **Data structure**: glyphRulers[glyphName] = { activeRulerId, rulers: {...} }
2. **Active ruler**: Only one at a time, updates on drag
3. **Static rulers**: Reduced opacity for lines only, markers/labels full opacity, **NOT draggable**
4. **Persistence**: **glyph.customData["fontra.glyph.rulers"]** - stored in font file, shareable
5. **Panel location**: Sidebar, collapsible like other panels
6. **NO pointer tool integration**: Rulers only manipulated via power ruler tool and panel

## Risks & Considerations

- File-based persistence requires proper undo/redo integration
- Need to ensure customData is preserved across backends (designspace, UFO, etc.)
- Localization for panel strings
- Backward compatibility (existing single-ruler data)
