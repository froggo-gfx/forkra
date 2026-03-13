# Session Progress: Persistent Power Rulers

## Session: 2026-03-12

### Completed ✅
- [x] Initial research on current ruler implementation
- [x] Identified files that need modification
- [x] Understood persistence mechanism (ObservableController)
- [x] Designed data structure for multiple rulers
- [x] Created task_plan.md, findings.md, progress.md
- [x] Design approved by user
- [x] Phase 1: Data structure updated (multiple rulers per glyph)
- [x] Phase 2: Ruler creation (double-click) and rendering (opacity) complete
- [x] Plan updated: Removed pointer tool integration, changed to file-based persistence
- [x] Implementation plan written to docs/superpowers/plans/
- [x] **File-based persistence** - loadRulersFromGlyph/saveRulersToGlyph with undo support
- [x] **Sidebar panel** - Full UI for managing rulers (add, edit, delete, X/Y/angle)
- [x] **Panel registration** - Added to right sidebar
- [x] **Localization** - Added all required strings to en.js
- [x] **Ruler hit detection** - Click on static rulers to make them active
- [x] **Hover cursor** - Pointer cursor when hovering over rulers

### Commits
1. `a0e4b8eca` - feat: persistent multi-ruler support with file-based persistence
   - Initial data structure and rendering
   - Documentation (QWEN.md, task_plan.md, findings.md, progress.md)
   - Implementation plan

2. `2dce004ef` - feat: Add ruler hit detection and activation on click
   - findRulerAtPoint() for hit detection
   - setActiveRuler() to switch active ruler
   - Updated handleDrag() and handleHover()
   - 10-pixel hit radius for comfortable selection

3. `505459766` - feat: Add power rulers sidebar panel with file persistence
   - Created panel-power-rulers.js component
   - Added persistence layer (load/save to glyph.customData)
   - Registered panel in editor.js
   - Added localization strings

### Feature Summary

**User Interaction:**
- **Double-click** in canvas → Creates new ruler at that position (becomes active)
- **Single-click** on ruler → Makes it active (full opacity)
- **Drag** active ruler → Repositions it
- **Backspace** → Deletes active ruler
- **Sidebar panel** → Manage rulers (name, X, Y, angle, delete)

**Visual Design:**
- Active ruler: Full opacity line
- Static rulers: 40% opacity lines
- All rulers: Full opacity markers and labels
- Hover: Pointer cursor over rulers

**Persistence:**
- Stored in: `glyph.customData["fontra.glyph.rulers"]`
- Survives browser restart
- Shareable via Git/version control
- Undo/redo support via edit recording

### Test Results
Pending manual testing:
- [ ] Create rulers via double-click
- [ ] Click static rulers to activate
- [ ] Drag active ruler
- [ ] Edit via panel (X/Y/angle)
- [ ] Delete via panel and Backspace
- [ ] Reload page - verify persistence
- [ ] Test undo/redo

### Next Steps
1. Manual testing in browser
2. Fix any bugs found during testing
3. Consider merging to main branch

### Issues & Improvements for Next Session

**1. Ruler Drag Behavior - Needs Fix**
Current behavior: Ruler follows mouse clicks/drags too eagerly
Desired behavior: Mirror standard draggable object pattern
- **Click** → Selects ruler (makes it active)
- **Click + Drag** → Moves the selected ruler
- **Double-click** → Creates new ruler (reliable, not conflicted)

Problem: Current implementation makes it hard to reliably create new rulers with double-click because single clicks also try to activate rulers.

**2. Ruler Scope - Source/Layer Specificity**
Current behavior: Rulers exist on ALL sources and source layers (global by default)
Desired behavior: Rulers should be scoped properly
- **Per source layer** (default) - Rulers specific to the current source/layer being edited
- **Global option** - Optional "global" property to make ruler persist across all layers/sources

This is critical before implementing file persistence - need to decide the correct data structure:
```javascript
// Option A: Per layer (default)
glyph.layers[layerName].customData["fontra.glyph.rulers"]

// Option B: Per source
glyph.sources[sourceName].customData["fontra.glyph.rulers"]

// Option C: Global + per-layer
glyph.customData["fontra.glyph.rulers.global"] // global rulers
glyph.layers[layerName].customData["fontra.glyph.rulers"] // layer-specific
```

**Action Required:** These issues should be resolved BEFORE implementing file persistence to avoid breaking changes to the storage format.
