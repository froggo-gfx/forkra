# Consolidated Pointer + Behavior Refactor Plan (Object-Kind × Behavior-Type × Modality)

## Статус
- **Версия:** 1.0
- **Дата:** 26 февраля 2026
- **Статус:** Готов к выполнению
- **Объединяет:**
  - `tunni-metrics-refactor-final-plan.md` (Steps 01-16)
  - `PLAN-edit-behavior-deep-dry-refactor.md` (Steps R1-R6)

---

## Глоссарий

| Термин | Определение |
|--------|-------------|
| **Behavior Type** | Семантика редактирования: `default`, `constrain`, `alternate`, `equalize`, `interpolate`, `tangent`. Определяет **что** происходит с точкой. |
| **Object Kind** | Тип данных: `regularPoint`, `skeletonPoint`, `skeletonHandle`, `ribPoint`, `ribHandle`. Определяет **где** применяется поведение. |
| **Modality** | Транспорт ввода: `drag`, `nudge`, `hover`. Определяет **как** пользователь взаимодействует. |
| **Modifier** | Клавиши-модификаторы: `shift`, `alt`, `z`, `x`, `q`. Влияют на выбор Behavior Type. |
| **Plan** | Результат резолюции: `(Object Kind, Behavior Type, Modality)`. |
| **Executor** | Центральная единица исполнения: применяет Behavior Type к Object Kind. |
| **Adapter** | Адаптер данных: предоставляет унифицированный интерфейс к Object Kind. |
| **Orchestrator** | Композиционный слой: соединяет Executor + Adapter + Modality. |

---

## Целевой Принцип (Three-Layer Architecture)

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: BEHAVIOR TYPES (What)                              │
│ Файл: src-js/views-editor/src/edit-behavior.js              │
│ - actionFactories, rules, behavior definitions              │
│ - Pure geometry transformation semantics                    │
│ - Не знает про Object Kind или Modality                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: DATA ADAPTERS (Where)                              │
│ Файл: src-js/views-editor/src/pointer-objects.js            │
│ - Regular/Skeleton/Rib adapters                             │
│ - Unified interface: applyBehavior(), getRollback()         │
│ - Не знает про Behavior Type semantics                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: COMPOSITION (Mix & Match)                          │
│ Файл: src-js/views-editor/src/edit-behavior-composer.js     │
│ - resolveBehaviorPlan(): modifiers → Plan                   │
│ - createBehaviorExecutor(): Plan → Executor                 │
│ - Orchestrates: Adapter × Behavior × Modality               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 4: TRANSPORT (Routing Only)                           │
│ Файл: src-js/views-editor/src/edit-tools-pointer.js         │
│ - Hit-test → Object Kind                                    │
│ - Modality routing (drag/nudge/hover)                       │
│ - Transaction commit (editGlyph, sendIncrementalChange)     │
│ - НЕ содержит behavior semantics                            │
└─────────────────────────────────────────────────────────────┘
```

---

## Эталон Main (Обязательный Guardrail)

- **Эталон pointer-поведения:** `main:src-js/views-editor/src/edit-tools-pointer.js`
- **Эталон behavior-поведения:** `main:src-js/views-editor/src/edit-behavior.js`
- **Любой шаг проходит двойную проверку:**
  1. **Fork-сценарии:** skeleton/rib/Tunni/Q-measure работают как baseline
  2. **Main-parity сценарии:** regular-only поведение идентично main
- **Если найдено отклонение regular-only от main** и это не запланированное изменение форка — шаг не закрывается.

---

## Style Parity с Main (Обязательный Guardrail)

- **Цель:** не только parity поведения, но и близкая архитектурная форма к `main`
- **Правила:**
  - Не менять без необходимости публичные entrypoint-методы pointer (`handleHover`, `handleDrag`, `handleArrowKeys`)
  - Сохранять близкий порядок и фазность обработки событий (hit-test → routing → edit/apply → refresh)
  - Новые абстракции добавлять точечно (без "фреймворка внутри pointer")
  - Не переименовывать массово существующие сущности
  - В `edit-tools-pointer.js` оставлять fork-логику локально понятной
- **Критерий приемки pointer-шагов:**
  - Diff к `main` объясняется именно fork-функционалом, а не произвольным переписыванием

---

## Метрики Успеха (Измеримые Критерии)

| Файл | Текущее состояние | Целевое состояние | Критерий |
|------|-------------------|-------------------|----------|
| `edit-behavior.js` | 2994 строки | ≤ 2500 строк | Удаление дубликатов после миграции |
| `edit-tools-pointer.js` | 6534 строк | ≤ 3500 строк | Перенос semantics в composer |
| `skeleton-edit-behavior.js` | Удалён | Удалён | Консолидация в edit-behavior.js |
| `edit-behavior-composer.js` | Не существует | ≤ 800 строк | Новый файл для Layer 3 |
| `pointer-objects.js` | Не существует | ≤ 600 строк | Новый файл для Layer 2 |

---

## Completion Criteria (Per-Step Verification)

**Each step has specific, verifiable completion criteria.** If criteria are not met, the step is **NOT COMPLETE**.

### Steps 01-07.7 (Completed - Verification Only)

| Step | Completion Criteria | Verification Method |
|------|---------------------|---------------------|
| **01** | Baseline document exists | `ls docs/refactor/tunni-measure-baseline.md` → file exists |
| **02** | `tunni-core.js` exports core functions | `grep -c "^export function" src-js/fontra-core/src/tunni-core.js` → ≥10 exports |
| **03** | `measure-core.js` exports math functions | `grep -c "^export function" src-js/fontra-core/src/measure-core.js` → ≥4 exports |
| **04** | `tunni-calculations.js` imports from core | `grep "from.*tunni-core" src-js/fontra-core/src/tunni-calculations.js` → matches found |
| **05** | N/A (consolidated into Step 02) | No separate skeleton-tunni file exists |
| **06** | `distance-angle.js` deleted, no imports | `ls src-js/fontra-core/src/distance-angle.js` → ENOENT |
| **07** | `getGeneratedContourIndexSetForLayer` exported | `grep "export.*getGeneratedContourIndexSetForLayer" src-js/fontra-core/src/skeleton-contour-generator.js` → match |
| **07.5** | `BEHAVIOR_TABLES` exists in edit-behavior.js | `grep "export const BEHAVIOR_TABLES" src-js/views-editor/src/edit-behavior.js` → match |
| **07.6** | Behavior classes use `getBehaviorPreset` | `grep "getBehaviorPreset" src-js/views-editor/src/edit-behavior.js` → ≥3 matches |
| **07.7** | `skeleton-edit-behavior.js` deleted | `ls src-js/views-editor/src/skeleton-edit-behavior.js` → ENOENT |

---

### Steps 08-19 (Pending - Detailed Criteria Below)

Each step below includes **explicit completion criteria** that must be verified before marking complete.

---

## ВЫПОЛНЕНО (Steps 01-07.7)

### Шаг 01. Baseline Фиксация
**Статус:** ✅ Выполнено

**Проблема:** При рефакторе легко потерять UX-эквивалентность.

**Решение:** Документ baseline-сценариев в `docs/refactor/tunni-measure-baseline.md`.

**Мокап кода:**
```md
# docs/refactor/tunni-measure-baseline.md
- Q hold / Alt+Q hold
- Regular Tunni midpoint + true-point drag
- Skeleton Tunni midpoint + true-point drag
- Skeleton point drag / rib drag / rib arrows
- Ctrl+Shift equalize/quantize
- Generated contours exclusion
```

**Что тестировать вручную:**
- Полный baseline-прогон до начала изменений.

---

### Шаг 02. Ввести `tunni-core.js` (Чистая Математика)
**Статус:** ✅ Выполнено

**Проблема:** Tunni-формулы дублируются в нескольких файлах.

**Решение:** Создать `src-js/fontra-core/src/tunni-core.js`.

**Мокап кода:**
```js
// tunni-core.js
export function midpoint(a, b) {}
export function trueIntersection(a1, a2, b1, b2) {}
export function calculateRegularTunniPoint(segmentPoints) {}
export function calculateRegularTrueTunniPoint(segmentPoints) {}
export function calculateSkeletonTunniPoint(segment) {}
export function calculateSkeletonTrueTunniPoint(segment) {}
```

**Что тестировать вручную:**
- UI не меняется, нет runtime/import ошибок.

---

### Шаг 03. Ввести `measure-core.js` (Чистая Measure-Математика)
**Статус:** ✅ Выполнено

**Проблема:** Measure-формулы смешаны с визуализацией.

**Решение:** Создать `src-js/fontra-core/src/measure-core.js`.

**Мокап кода:**
```js
// measure-core.js
export function distance(p1, p2) {}
export function angleDeg(p1, p2) {}
export function manhattan(p1, p2) {}
export function handleTension(segmentPoints, truePoint) {}
```

**Что тестировать вручную:**
- UI не меняется, нет циклических импортов.

---

### Шаг 04. Перевести `tunni-calculations.js` на `tunni-core.js`
**Статус:** ✅ Выполнено

**Проблема:** Старый файл держит дубли формул.

**Решение:** Заменить вычисления на импорты из `tunni-core.js`.

**Мокап кода:**
```js
import { calculateRegularTunniPoint } from "./tunni-core.js";
export function calculateTunniPoint(points) {
  return calculateRegularTunniPoint(points);
}
```

**Что тестировать вручную:**
- Regular Tunni drag/undo идентичны baseline.

---

### Шаг 05. Перевести `skeleton-tunni-calculations.js` на `tunni-core.js`
**Статус:** ✅ Выполнено

**Проблема:** Skeleton Tunni математика дублируется отдельно.

**Решение:** Локальные math-дубли заменить импортами core.

**Мокап кода:**
```js
import {
  calculateSkeletonTunniPoint,
  calculateSkeletonTrueTunniPoint,
} from "@fontra/core/tunni-core.js";
```

**Что тестировать вручную:**
- Skeleton midpoint/true-point drag как baseline.

---

### Шаг 06. Убрать `distance-angle.js`
**Статус:** ✅ Выполнено

**Проблема:** `distance-angle.js` смешивает вычисления и отрисовку.

**Решение:** Перенести draw-часть в `visualization-layer-definitions.js`, оставить в core только pure math.

**Мокап кода:**
```js
// visualization-layer-definitions.js
import { distance, angleDeg, manhattan, handleTension } from "@fontra/core/measure-core.js";
import { calculateRegularTrueTunniPoint } from "@fontra/core/tunni-core.js";

function drawMeasureLabels(...) { /* Q-measure + segment callouts */ }
function drawTunniLabels(...) { /* uses tunni-core + measure-core */ }
```

**Что тестировать вручную:**
- Q/Alt+Q для rib/handle/segment/selection как baseline.
- Distance/Manhattan overlays отображаются и считают как baseline.
- В коде нет runtime-импортов из `@fontra/core/distance-angle.js`.

---

### Шаг 07. Единый Helper Generated Contours
**Статус:** ✅ Выполнено

**Проблема:** Фильтрация generated contours дублируется в hit-test/visualization.

**Решение:** Добавить helper в core и заменить локальные копии.

**Мокап кода:**
```js
// skeleton-contour-generator.js
export function getGeneratedContourIndexSetForLayer(layer) {
  return new Set(getSkeletonData(layer)?.generatedContourIndices || []);
}
```

**Что тестировать вручную:**
- Regular flows не цепляют generated contours.

---

### Шаг 07.5. Собрать Единый Behavior Hub в `edit-behavior.js`
**Статус:** ✅ Выполнено

**Проблема:** `edit-behavior.js` и `skeleton-edit-behavior.js` держат дубли одной таблицы поведения.

**Решение:** В `edit-behavior.js` собрать behavior hub:
- `actionFactories`
- Базовые rule-наборы
- `BEHAVIOR_TABLES` по `objectKind` (`regular`, `skeleton`, `rib`)
- Lookup "эффективных модификаторов"
- Выдача preset через `getBehaviorPreset(objectKind, flagsOrName)`

**Мокап кода:**
```js
// edit-behavior.js
const BASE_PRESETS = { /* default/constrain/alternate/alternate-constrain */ };

export const BEHAVIOR_TABLES = {
  regular: BASE_PRESETS,
  skeleton: {
    ...BASE_PRESETS,
    // override только там, где skeleton реально отличается
  },
  rib: {
    default: BASE_PRESETS.default,
    constrain: BASE_PRESETS.constrain,
  },
};

export function resolveBehaviorPresetName(flags) {}
export function getBehaviorPreset(objectKind, flagsOrName) {}
```

**Что тестировать вручную:**
- Сборка проходит.
- Runtime без `ReferenceError`/циклических import-ошибок.

---

### Шаг 07.6. Подключить Regular/Skeleton/Rib Адаптеры к Behavior Hub
**Статус:** ✅ Выполнено

**Проблема:** Skeleton/rib путь тащит отдельные копии behavior-таблиц.

**Решение:** В `edit-behavior.js` и `skeleton-edit-behavior.js` заменить локальные `behaviorTypes` на `getBehaviorPreset`.

**Мокап кода:**
```js
// edit-behavior.js
const behavior = getBehaviorPreset("regular", behaviorName);

// skeleton-edit-behavior.js
import { getBehaviorPreset } from "./edit-behavior.js";
const behavior = getBehaviorPreset("skeleton", behaviorName);
```

**Что тестировать вручную:**
- Regular drag + Shift/Alt модификаторы по baseline.
- Skeleton drag + Shift/Alt модификаторы по baseline.
- Rib drag/arrows работают с намеренно урезанным набором поведений.

---

### Шаг 07.7. Консолидация Skeleton/Rib Behavior в `edit-behavior.js`
**Статус:** ✅ Выполнено

**Проблема:** После 7.6 источник preset общий, но реализация skeleton/rib все еще в отдельном файле.

**Решение:** Перенести `SkeletonEditBehavior`, `RibEditBehavior`, `EditableRibBehavior`, `InterpolatingRibBehavior`, `EditableHandleBehavior` в `edit-behavior.js`.

**Мокап кода:**
```js
// edit-behavior.js
export class SkeletonEditBehavior { ... }
export function createSkeletonEditBehavior(...) { ... }
export class RibEditBehavior { ... }
export function createRibEditBehavior(...) { ... }
```

**Что тестировать вручную:**
- Skeleton point drag/arrow + Shift/Alt как baseline.
- Rib drag/arrow и ограничения (linked/editable, Z, interpolation) работают как baseline.
- Generated handles drag/arrow и rollback/undo работают как baseline.
- В рантайме нет импортов на `./skeleton-edit-behavior.js` из pointer.

---

## ОСТАЛОСЬ ВЫПОЛНИТЬ (Steps 08-17)

### Шаг 08. Создать `edit-behavior-composer.js` (Layer 3: Composition)
**Статус:** ⏳ Pending

**Проблема:** Сейчас нет центрального механизма для комбинации Behavior Type × Object Kind. Pointer вручную wiring каждую комбинацию, что приводит к дублированию orchestration логики между drag/nudge.

**Решение:** Создать новый файл `src-js/views-editor/src/edit-behavior-composer.js` с:
1. Унифицированным интерфейсом для всех адаптеров данных
2. Фабрикой executors, которые комбинируют Behavior Type + Object Kind
3. Общей orchestration логикой для drag/nudge

---

**Completion Criteria (Expected Results - Plain Language):**

**8.1 — Composition layer exists as separate module**
- A new file `edit-behavior-composer.js` exists in `src-js/views-editor/src/`
- This file is the ONLY place where behavior + data adapter composition happens
- The file does NOT import from `edit-tools-pointer.js` (no circular dependency)
- The file does NOT directly handle events or mutate glyphs (orchestration only)

**8.2 — Plan resolution is centralized**
- Function `resolveBehaviorPlan()` exists and is the single entry point for converting (objectKind, modality, modifiers) → plan
- The function returns a structured plan with: `objectKind`, `behaviorType`, `modality`, `supported` (boolean)
- Unsupported combinations return `{ supported: false, reason: "..." }` instead of throwing or returning undefined

**8.3 — Executor factory creates composed behavior+adapter**
- Function `createBehaviorExecutor()` exists and accepts a plan + context
- The function looks up the correct behavior definition from Layer 1 (`edit-behavior.js`)
- The function instantiates the correct data adapter from Layer 2 (will be `pointer-objects.js` after Step 09)
- The returned executor has a unified `applyDelta(delta, options)` method regardless of object kind

**8.4 — Drag orchestration is shared**
- Function `runDragOrchestration()` exists
- It handles the event stream loop (`for await (const event of eventStream)`)
- It handles layer iteration (applies changes to all editing layers)
- It handles change accumulation and incremental sending
- It does NOT contain behavior-specific math (delegates to executor)

**8.5 — Nudge orchestration is shared**
- Function `runNudgeOrchestration()` exists
- It handles single delta application (not a stream)
- It handles layer iteration (applies to all editing layers)
- It does NOT contain behavior-specific math (delegates to executor)

**8.6 — No existing behavior is broken**
- Regular point drag works identically to baseline (before Step 08)
- Regular point nudge works identically to baseline (before Step 08)
- No runtime errors in console during testing
- No import/circular dependency errors

**8.7 — Layer boundaries are respected**
- Layer 3 (composer) does NOT import from Layer 4 (pointer)
- Layer 3 (composer) imports ONLY from Layer 1 (edit-behavior.js) and core modules
- Layer 3 (composer) does NOT directly call `editGlyph()` or `sendIncrementalChange()` — these are passed in via context

---

**Verification Commands (Evidence, Not Criteria):**

```bash
# File exists
ls src-js/views-editor/src/edit-behavior-composer.js

# File size within target (≤800 lines)
wc -l src-js/views-editor/src/edit-behavior-composer.js

# Required exports exist
grep "export function resolveBehaviorPlan" src-js/views-editor/src/edit-behavior-composer.js
grep "export function createBehaviorExecutor" src-js/views-editor/src/edit-behavior-composer.js
grep "export async function runDragOrchestration" src-js/views-editor/src/edit-behavior-composer.js
grep "export async function runNudgeOrchestration" src-js/views-editor/src/edit-behavior-composer.js

# No forbidden imports (from pointer)
grep "from.*edit-tools-pointer" src-js/views-editor/src/edit-behavior-composer.js
# Expected: no matches

# Syntax check
node --check src-js/views-editor/src/edit-behavior-composer.js
# Expected: exit code 0
```

---

**Files Modified:**
- `src-js/views-editor/src/edit-behavior-composer.js` (NEW, ≤800 lines)

**Files Created:**
- None (only edit-behavior-composer.js)

**Files Deleted:**
- None

---

**Мокап кода:**
```js
// edit-behavior-composer.js

/**
 * Unified interface for all data adapters.
 * Layer 2 (pointer-objects.js) will implement this.
 */
export interface EditDataAdapter {
  objectKind: string;
  getSelectedPoints(): Iterable<PointRef>;
  applyBehavior(behaviorDef, delta, context): AppliedEffect;
  getRollback(): Change[];
}

/**
 * Resolve behavior plan from modifiers.
 * Returns: { objectKind, behaviorType, modality, supported: boolean }
 */
export function resolveBehaviorPlan(objectKind, modality, modifiers) {
  const intent = resolveModifierIntent(objectKind, modifiers);
  const behaviorType = mapIntentToBehaviorType(intent);
  
  return {
    objectKind,
    modality,
    behaviorType,
    supported: isBehaviorSupported(objectKind, behaviorType),
  };
}

/**
 * Create executor that combines behavior + data adapter.
 * This is the central composition point.
 */
export function createBehaviorExecutor(plan, context) {
  if (!plan.supported) {
    return { executor: null, plan };
  }
  
  const behaviorDef = getBehaviorPreset(plan.objectKind, plan.behaviorType);
  const AdapterClass = getDataAdapterClass(plan.objectKind);
  
  const adapter = new AdapterClass(context.data);
  
  return {
    executor: {
      applyDelta(delta, options) {
        return adapter.applyBehavior(behaviorDef, delta, {
          ...context,
          ...options,
          modality: plan.modality,
        });
      },
      getRollback() {
        return adapter.getRollback();
      }
    },
    plan,
  };
}

/**
 * Shared orchestration for drag modality.
 * Handles event stream, layer iteration, change accumulation.
 */
export async function runDragOrchestration(executor, eventStream, context) {
  const sceneController = context.sceneController;
  
  await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    let accumulatedChanges = new ChangeCollector();
    
    for await (const event of eventStream) {
      const delta = context.computeDelta(event);
      const roundFunc = makeRoundFunc(event);
      
      const result = executor.applyDelta(delta, { roundFunc, event });
      
      const changes = applyResultToGlyph(glyph, result, context);
      accumulatedChanges = accumulatedChanges.concat(changes);
      
      await sendIncrementalChange(changes.change, true);
    }
    
    await sendIncrementalChange(accumulatedChanges.change);
    
    return {
      changes: accumulatedChanges,
      undoLabel: context.undoLabel || "Drag",
      broadcast: true,
    };
  });
}

/**
 * Shared orchestration for nudge modality.
 * Handles single delta application, layer iteration.
 */
export async function runNudgeOrchestration(executor, delta, context) {
  const sceneController = context.sceneController;
  
  await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    const allChanges = [];
    
    for (const editLayerName of sceneController.editingLayerNames) {
      const layer = glyph.layers[editLayerName];
      const result = executor.applyDelta(delta, { layer, editLayerName });
      const changes = applyResultToLayer(layer, result, context);
      allChanges.push(changes);
    }
    
    const combined = new ChangeCollector().concat(...allChanges);
    await sendIncrementalChange(combined.change);
    
    return {
      changes: combined,
      undoLabel: context.undoLabel || "Nudge",
      broadcast: true,
    };
  });
}
```

**Импорты из существующих файлов:**
```js
import {
  getBehaviorPreset,
  resolveModifierIntent,
  SkeletonEditBehavior,
  RibEditBehavior,
  EditableRibBehavior,
  InterpolatingRibBehavior,
  EditableHandleBehavior,
  EditBehaviorFactory,
} from "./edit-behavior.js";
import { makeRoundFunc } from "./edit-behavior.js";
import { ChangeCollector } from "@fontra/core/changes.js";
```

**Что тестировать вручную:**
- Файл создаётся без изменения существующего поведения.
- Сборка проходит без ошибок.
- Нет runtime/import ошибок.
- **Main-parity check:** regular point drag/nudge работают как baseline.

---

### Шаг 09. Создать `pointer-objects.js` (Layer 2: Data Adapters)
**Статус:** ⏳ Pending

**Проблема:** Сейчас нет унифицированного интерфейса для работы с разными Object Kinds. Каждый тип точки имеет свой ad-hoc API, что усложняет композицию в Layer 3.

**Решение:** Создать `src-js/views-editor/src/pointer-objects.js` с:
1. Реестром Object Kinds и их capabilities
2. Адаптерами данных для каждого типа
3. Hit-test функциями для каждого типа

**Важно:** Этот файл **НЕ содержит behavior semantics** — только data adapters и transport routing.

**Мокап кода:**
```js
// pointer-objects.js

import {
  SkeletonEditBehavior,
  RibEditBehavior,
  EditableRibBehavior,
  InterpolatingRibBehavior,
  EditableHandleBehavior,
  EditBehaviorFactory,
} from "./edit-behavior.js";
import { getSkeletonData, setSkeletonData } from "./skeleton-utils.js";
import { getGeneratedContourIndexSetForLayer } from "./skeleton-contour-generator.js";

/**
 * Registry of object kinds with their capabilities.
 * Each entry provides: hitTest, adapter factory, nudge capability.
 */
export const POINTER_OBJECTS = {
  regularPoint: {
    objectKind: "regularPoint",
    
    hitTest(context, event) {
      const { sceneController, positionedGlyph } = context;
      const glyphPoint = sceneController.localPoint(event);
      // Standard regular point hit test
      const hit = positionedGlyph.glyph.path.hitTestPoint(glyphPoint);
      return hit ? { type: "regularPoint", ...hit } : null;
    },
    
    getAdapter(context) {
      const { selection, glyph } = context;
      return new RegularPointAdapter(glyph, selection);
    },
    
    async nudge(context, delta, event) {
      const adapter = this.getAdapter(context);
      return adapter.applyNudge(delta, { event });
    },
  },
  
  skeletonPoint: {
    objectKind: "skeletonPoint",
    
    hitTest(context, event) {
      const { sceneController, positionedGlyph } = context;
      const glyphPoint = sceneController.localPoint(event);
      const skeletonData = getSkeletonData(positionedGlyph.glyph);
      if (!skeletonData) return null;
      
      // Skeleton point hit test
      for (const [contourIndex, contour] of enumerate(skeletonData.contours)) {
        for (const [pointIndex, point] of enumerate(contour.points)) {
          if (Math.hypot(point.x - glyphPoint.x, point.y - glyphPoint.y) < 10) {
            return { type: "skeletonPoint", contourIndex, pointIndex, point };
          }
        }
      }
      return null;
    },
    
    getAdapter(context) {
      const { selection, glyph } = context;
      const skeletonData = getSkeletonData(glyph);
      return new SkeletonPointAdapter(skeletonData, selection);
    },
    
    async nudge(context, delta, event) {
      const adapter = this.getAdapter(context);
      return adapter.applyNudge(delta, { event });
    },
  },
  
  skeletonHandle: {
    objectKind: "skeletonHandle",
    
    hitTest(context, event) {
      // Hit test for generated skeleton handles (off-curve points)
      const { sceneController, positionedGlyph } = context;
      const glyphPoint = sceneController.localPoint(event);
      const skeletonData = getSkeletonData(positionedGlyph.glyph);
      if (!skeletonData) return null;
      
      for (const [contourIndex, contour] of enumerate(skeletonData.contours)) {
        for (const [pointIndex, point] of enumerate(contour.points)) {
          if (point.type === "cubic" && 
              Math.hypot(point.x - glyphPoint.x, point.y - glyphPoint.y) < 10) {
            return { type: "skeletonHandle", contourIndex, pointIndex, point };
          }
        }
      }
      return null;
    },
    
    getAdapter(context) {
      const { selection, glyph } = context;
      const skeletonData = getSkeletonData(glyph);
      return new SkeletonHandleAdapter(skeletonData, selection);
    },
    
    async nudge(context, delta, event) {
      const adapter = this.getAdapter(context);
      return adapter.applyNudge(delta, { event });
    },
  },
  
  ribPoint: {
    objectKind: "ribPoint",
    
    hitTest(context, event) {
      // Rib point hit test (uses existing _hitTestRibPoints logic)
      const { sceneController, positionedGlyph } = context;
      const glyphPoint = sceneController.localPoint(event);
      const skeletonData = getSkeletonData(positionedGlyph.glyph);
      if (!skeletonData) return null;
      
      // ... existing rib hit test logic ...
      return ribHit;
    },
    
    getAdapter(context) {
      const { selection, glyph, ribHit } = context;
      const skeletonData = getSkeletonData(glyph);
      
      if (ribHit?.isEditable) {
        return new EditableRibPointAdapter(skeletonData, ribHit);
      }
      return new RibPointAdapter(skeletonData, ribHit);
    },
    
    async nudge(context, delta, event) {
      const adapter = this.getAdapter(context);
      return adapter.applyNudge(delta, { event });
    },
  },
  
  ribHandle: {
    objectKind: "ribHandle",
    
    hitTest(context, event) {
      // Rib handle hit test (editable generated handles)
      // ... existing logic ...
    },
    
    getAdapter(context) {
      const { selection, glyph, handleInfo } = context;
      const skeletonData = getSkeletonData(glyph);
      return new RibHandleAdapter(skeletonData, handleInfo);
    },
    
    async nudge(context, delta, event) {
      const adapter = this.getAdapter(context);
      return adapter.applyNudge(delta, { event });
    },
  },
  
  tunniMidpoint: {
    objectKind: "tunniMidpoint",
    
    hitTest(context, event) {
      // Tunni midpoint hit test
      const { sceneController, positionedGlyph } = context;
      const glyphPoint = sceneController.localPoint(event);
      // ... existing Tunni hit test logic ...
      return tunniHit;
    },
    
    getAdapter(context) {
      const { selection, glyph, tunniHit } = context;
      return new TunniMidpointAdapter(glyph, tunniHit);
    },
    
    async nudge(context, delta, event) {
      const adapter = this.getAdapter(context);
      return adapter.applyNudge(delta, { event });
    },
  },
  
  measureTarget: {
    objectKind: "measureTarget",
    
    hitTest(context, event) {
      // Q-measure hover target hit test
      const { sceneController, positionedGlyph } = context;
      const glyphPoint = sceneController.localPoint(event);
      // ... existing measure hit test logic ...
      return measureHit;
    },
    
    hover(context, hit, event) {
      // Update measure hover state in scene-model
      const { sceneModel } = context;
      sceneModel.setMeasureState({ hoverSegment: hit?.segment || null });
    },
  },
};

/**
 * Data adapter for regular points.
 * Implements unified EditDataAdapter interface.
 */
class RegularPointAdapter {
  constructor(glyph, selection) {
    this.glyph = glyph;
    this.selection = selection;
    this.factory = new EditBehaviorFactory(glyph, selection);
  }
  
  applyBehavior(behaviorDef, delta, context) {
    const behavior = this.factory.getBehavior(behaviorDef.presetName);
    return behavior.makeChangeForDelta(delta);
  }
  
  getRollback() {
    // Return rollback changes for regular points
    return [];
  }
}

/**
 * Data adapter for skeleton points.
 */
class SkeletonPointAdapter {
  constructor(skeletonData, selection) {
    this.skeletonData = skeletonData;
    this.selection = selection;
  }
  
  applyBehavior(behaviorDef, delta, context) {
    const { roundFunc, event } = context;
    const behavior = new SkeletonEditBehavior(
      this.skeletonData,
      0, // contourIndex from selection
      Array.from(this.selection),
      behaviorDef.presetName,
      false,
      roundFunc
    );
    return behavior.applyDelta(delta);
  }
  
  getRollback() {
    // Return rollback changes for skeleton points
    return [];
  }
}

// ... additional adapters for other object kinds ...

/**
 * Helper to get adapter class by object kind.
 * Used by edit-behavior-composer.js
 */
export function getDataAdapterClass(objectKind) {
  const obj = POINTER_OBJECTS[objectKind];
  if (!obj) {
    throw new Error(`Unknown object kind: ${objectKind}`);
  }
  return obj.getAdapter;
}
```

---

**Completion Criteria (Expected Results - Plain Language):**

**9.1 — Data adapter layer exists as separate module**
- A new file `pointer-objects.js` exists in `src-js/views-editor/src/`
- This file is the ONLY place where object kind hit-testing and adapter factories live
- The file does NOT contain behavior semantics (no action factories, no rules)
- The file does NOT orchestrate drag/nudge loops (that's Layer 3's job)

**9.2 — Object Kind registry is declarative**
- Export `POINTER_OBJECTS` exists as a plain object (not a class)
- Each object kind entry has: `objectKind` (string), `hitTest(context, event)`, `getAdapter(context)`, `nudge(context, delta, event)`
- Adding a new object kind requires adding ONE entry to this registry, not modifying pointer logic

**9.3 — Hit-test is separated from behavior**
- Each `hitTest()` function returns ONLY structural data (contourIndex, pointIndex, type info)
- Hit-test does NOT decide what behavior to apply (that's Layer 3's `resolveBehaviorPlan()`)
- Hit-test does NOT mutate state (that's Layer 4's job)

**9.4 — Adapters expose unified interface**
- Each adapter class implements `applyBehavior(behaviorDef, delta, context)` method
- Each adapter class implements `getRollback()` method
- The interface is the SAME for all object kinds (regular/skeleton/rib/handle)
- Adapters know their data structure (contours vs skeletonData vs ribHit) but NOT behavior semantics

**9.5 — All object kinds from baseline are covered**
- `regularPoint` adapter exists (uses `EditBehaviorFactory`)
- `skeletonPoint` adapter exists (uses `SkeletonEditBehavior`)
- `skeletonHandle` adapter exists (uses handle equalize executor)
- `ribPoint` adapter exists (uses `RibEditBehavior` / `EditableRibBehavior` / `InterpolatingRibBehavior`)
- `ribHandle` adapter exists (uses `EditableHandleBehavior`)
- `tunniMidpoint` adapter exists (uses Tunni-specific logic)
- `measureTarget` entry exists (for Q-measure hover handling)

**9.6 — No existing behavior is broken**
- Regular point hit-test works identically to baseline
- Skeleton point hit-test works identically to baseline
- Rib point hit-test works identically to baseline
- No runtime errors in console during testing

**9.7 — Layer boundaries are respected**
- Layer 2 (pointer-objects) imports from Layer 1 (edit-behavior.js) for behavior classes
- Layer 2 does NOT import from Layer 4 (edit-tools-pointer.js)
- Layer 2 does NOT call `sceneController.editGlyph()` directly (adapters return changes, not commit them)

---

**Verification Commands (Evidence, Not Criteria):**

```bash
# File exists
ls src-js/views-editor/src/pointer-objects.js

# File size within target (≤600 lines)
wc -l src-js/views-editor/src/pointer-objects.js

# Required exports exist
grep "export const POINTER_OBJECTS" src-js/views-editor/src/pointer-objects.js
grep "export function getDataAdapterClass" src-js/views-editor/src/pointer-objects.js

# All object kinds registered
grep -c "objectKind:" src-js/views-editor/src/pointer-objects.js
# Expected: ≥7 (regularPoint, skeletonPoint, skeletonHandle, ribPoint, ribHandle, tunniMidpoint, measureTarget)

# No forbidden imports (from pointer)
grep "from.*edit-tools-pointer" src-js/views-editor/src/pointer-objects.js
# Expected: no matches

# Syntax check
node --check src-js/views-editor/src/pointer-objects.js
# Expected: exit code 0
```

---

**Files Modified:**
- `src-js/views-editor/src/pointer-objects.js` (NEW, ≤600 lines)

**Files Created:**
- None (only pointer-objects.js)

**Files Deleted:**
- None

---

**Что тестировать вручную:**
- Файл создаётся без изменения существующего поведения.
- Сборка проходит без ошибок.
- **Main-parity check:** regular point hit-test/drag/nudge работают как baseline.
- **Fork check:** skeleton/rib hit-test работают как baseline.

---

### Шаг 10. Мигрировать Regular Point Drag на Composer
**Статус:** ⏳ Pending

**Проблема:** Regular point drag сейчас использует прямой вызов `EditBehaviorFactory` в pointer. Нужно перевести на центральный composer.

**Решение:** Обновить `_handleDragRegularPoints` в `edit-tools-pointer.js` для использования `createBehaviorExecutor` + `runDragOrchestration`.

**Мокап кода:**
```js
// edit-tools-pointer.js (before)
async _handleDragRegularPoints(eventStream, initialEvent) {
  const behaviorFactory = new EditBehaviorFactory(
    this.sceneController.sceneModel.getSelectedPositionedGlyph().glyph,
    this.selection
  );
  const behavior = behaviorFactory.getBehavior("default");
  
  await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    for await (const event of eventStream) {
      const delta = this.localPoint(event);
      const changes = behavior.makeChangeForDelta(delta);
      await sendIncrementalChange(changes, true);
    }
  });
}

// edit-tools-pointer.js (after)
import {
  resolveBehaviorPlan,
  createBehaviorExecutor,
  runDragOrchestration,
} from "./edit-behavior-composer.js";
import { POINTER_OBJECTS } from "./pointer-objects.js";

async _handleDragRegularPoints(eventStream, initialEvent) {
  const plan = resolveBehaviorPlan("regularPoint", "drag", this.modifiers);
  const { executor } = createBehaviorExecutor(plan, {
    data: { glyph: this.sceneController.sceneModel.getSelectedPositionedGlyph().glyph },
    selection: this.selection,
    sceneController: this.sceneController,
    computeDelta: (event) => this.localPoint(event),
    undoLabel: "Drag Points",
  });
  
  await runDragOrchestration(executor, eventStream, {
    sceneController: this.sceneController,
    selection: this.selection,
  });
}
```

**Что тестировать вручную:**
- Regular point drag с default поведением как baseline.
- Regular point drag + Shift (constrain) как baseline.
- Regular point drag + Alt (alternate) как baseline.
- Regular point drag + Shift+Alt как baseline.
- Multi-point selection drag как baseline.
- Undo/redo после drag как baseline.

---

**Completion Criteria (Expected Results - Plain Language):**

**10.1 — Regular point drag uses composer**
- Function `_handleDragRegularPoints` calls `resolveBehaviorPlan()` with `objectKind: "regularPoint"`
- Function `_handleDragRegularPoints` calls `createBehaviorExecutor()` with the plan
- Function `_handleDragRegularPoints` calls `runDragOrchestration()` with the executor
- The old inline drag loop (with `for await (const event of eventStream)`) is REMOVED

**10.2 — Behavior selection is plan-driven**
- Default drag uses plan with `behaviorType: "default"`
- Shift+drag uses plan with `behaviorType: "constrain"`
- Alt+drag uses plan with `behaviorType: "alternate"`
- Shift+Alt+drag uses plan with `behaviorType: "alternate-constrain"`

**10.3 — No behavior regression**
- Regular point drag with default behavior matches baseline
- Regular point drag with Shift (constrain) matches baseline
- Regular point drag with Alt (alternate) matches baseline
- Regular point drag with Shift+Alt matches baseline
- Multi-point selection drag matches baseline
- Undo/redo after drag matches baseline

**10.4 — Pointer line count reduced**
- `edit-tools-pointer.js` line count is reduced by ≥50 lines from this step

---

**Verification Commands:**
```bash
# Old drag loop removed from _handleDragRegularPoints
grep -A 20 "_handleDragRegularPoints" src-js/views-editor/src/edit-tools-pointer.js | grep -c "for await"
# Expected: 0 (orchestration moved to composer)

# New composer imports exist
grep "from.*edit-behavior-composer" src-js/views-editor/src/edit-tools-pointer.js
# Expected: imports for resolveBehaviorPlan, createBehaviorExecutor, runDragOrchestration

# Line count reduction
wc -l src-js/views-editor/src/edit-tools-pointer.js
# Expected: reduced from baseline
```

---

### Шаг 11. Мигрировать Regular Point Nudge на Composer
**Статус:** ⏳ Pending

**Проблема:** Regular point nudge (arrow keys) сейчас использует прямой вызов `EditBehaviorFactory` в pointer.

**Решение:** Обновить `_handleArrowKeys` для regular points с использованием `createBehaviorExecutor` + `runNudgeOrchestration`.

**Мокап кода:**
```js
// edit-tools-pointer.js (after)
import {
  resolveBehaviorPlan,
  createBehaviorExecutor,
  runNudgeOrchestration,
} from "./edit-behavior-composer.js";

async _handleArrowKeysForRegularPoints(delta, event) {
  const plan = resolveBehaviorPlan("regularPoint", "nudge", this.modifiers);
  const { executor } = createBehaviorExecutor(plan, {
    data: { glyph: this.sceneController.sceneModel.getSelectedPositionedGlyph().glyph },
    selection: this.selection,
    sceneController: this.sceneController,
  });
  
  await runNudgeOrchestration(executor, delta, {
    sceneController: this.sceneController,
    selection: this.selection,
    undoLabel: "Nudge Points",
  });
}
```

**Что тестировать вручную:**
- Regular point nudge стрелками как baseline.
- Regular point nudge + Shift (coarse grid) как baseline.
- Regular point nudge + Alt (alternate) как baseline.
- Undo/redo после nudge как baseline.

---

**Completion Criteria (Expected Results - Plain Language):**

**11.1 — Regular point nudge uses composer**
- Function `_handleArrowKeysForRegularPoints` (or equivalent) calls `resolveBehaviorPlan()` with `objectKind: "regularPoint"`
- Function calls `createBehaviorExecutor()` with the plan
- Function calls `runNudgeOrchestration()` with the executor
- The old inline nudge logic is REMOVED

**11.2 — Behavior selection is plan-driven**
- Default nudge uses plan with `behaviorType: "default"`
- Alt+nudge uses plan with `behaviorType: "alternate"`
- Shift affects step size (handled in context, not behavior)

**11.3 — No behavior regression**
- Regular point nudge matches baseline
- Regular point nudge + Shift matches baseline
- Regular point nudge + Alt matches baseline
- Undo/redo after nudge matches baseline

**11.4 — Pointer line count reduced**
- `edit-tools-pointer.js` line count is reduced by ≥30 lines from this step

---

**Verification Commands:**
```bash
# Old nudge logic removed
grep -A 15 "_handleArrowKeysForRegularPoints" src-js/views-editor/src/edit-tools-pointer.js | grep -c "EditBehaviorFactory"
# Expected: 0

# New composer imports used
grep "runNudgeOrchestration" src-js/views-editor/src/edit-tools-pointer.js
# Expected: at least 1 match (this step)
```

---

### Шаг 12. Мигрировать Skeleton Point Drag на Composer
**Статус:** ⏳ Pending

**Проблема:** Skeleton point drag использует `SkeletonEditBehavior` напрямую в pointer.

**Решение:** Обновить `_handleDragSkeletonPoints` для использования composer.

**Мокап кода:**
```js
// edit-tools-pointer.js (after)
async _handleDragSkeletonPoints(eventStream, initialEvent) {
  const plan = resolveBehaviorPlan("skeletonPoint", "drag", this.modifiers);
  const { executor } = createBehaviorExecutor(plan, {
    data: { skeletonData: getSkeletonData(this.glyph) },
    selection: this.selection,
    sceneController: this.sceneController,
    computeDelta: (event) => this.localPoint(event),
    undoLabel: "Drag Skeleton Points",
  });
  
  await runDragOrchestration(executor, eventStream, {
    sceneController: this.sceneController,
    selection: this.selection,
  });
}
```

**Что тестировать вручную:**
- Skeleton point drag как baseline.
- Skeleton point drag + Shift как baseline.
- Skeleton point drag + Alt как baseline.
- Undo/redo как baseline.

---

### Шаг 13. Мигрировать Skeleton Point Nudge на Composer
**Статус:** ⏳ Pending

**Проблема:** Skeleton point nudge использует `SkeletonEditBehavior` напрямую.

**Решение:** Обновить `_handleArrowKeysForSkeletonPoints` для использования composer.

**Мокап кода:**
```js
async _handleArrowKeysForSkeletonPoints(delta, event) {
  const plan = resolveBehaviorPlan("skeletonPoint", "nudge", this.modifiers);
  const { executor } = createBehaviorExecutor(plan, {
    data: { skeletonData: getSkeletonData(this.glyph) },
    selection: this.selection,
    sceneController: this.sceneController,
  });
  
  await runNudgeOrchestration(executor, delta, {
    sceneController: this.sceneController,
    selection: this.selection,
    undoLabel: "Nudge Skeleton Points",
  });
}
```

**Что тестировать вручную:**
- Skeleton point nudge как baseline.
- Skeleton point nudge + Shift как baseline.
- Skeleton point nudge + Alt как baseline.

---

### Шаг 14. Мигрировать Skeleton Handle Equalize на Composer
**Статус:** ⏳ Pending

**Проблема:** Skeleton handle equalize (X+drag/nudge) использует отдельные helper-функции с дублированием orchestration.

**Решение:** Обновить `_handleEqualizeHandlesDrag` и `_handleArrowKeysForEqualizeSkeletonHandles` для использования composer.

**Мокап кода:**
```js
async _handleArrowKeysForEqualizeSkeletonHandles(delta, selection) {
  const plan = resolveBehaviorPlan("skeletonHandle", "nudge", { ...this.modifiers, x: true });
  const { executor } = createBehaviorExecutor(plan, {
    data: { skeletonData: getSkeletonData(this.glyph) },
    selection,
    sceneController: this.sceneController,
  });
  
  await runNudgeOrchestration(executor, delta, {
    sceneController: this.sceneController,
    selection,
    undoLabel: "Equalize Skeleton Handles",
  });
}

async _handleEqualizeHandlesDrag(eventStream, initialEvent, contourIndex, pointIndex) {
  const plan = resolveBehaviorPlan("skeletonHandle", "drag", { ...this.modifiers, x: true });
  const { executor } = createBehaviorExecutor(plan, {
    data: { skeletonData: getSkeletonData(this.glyph) },
    selection: new Set([`${contourIndex}/${pointIndex}`]),
    sceneController: this.sceneController,
    computeDelta: (event) => this.localPoint(event),
  });
  
  await runDragOrchestration(executor, eventStream, {
    sceneController: this.sceneController,
    undoLabel: "Equalize Skeleton Handles",
  });
}
```

**Что тестировать вручную:**
- Skeleton handle X+nudge как baseline.
- Skeleton handle X+drag как baseline.
- Undo/redo как baseline.

---

### Шаг 15. Мигрировать Rib Point Drag/Nudge на Composer
**Статус:** ⏳ Pending

**Проблема:** Rib point drag/nudge использует `createRibBehaviorExecutor` напрямую.

**Решение:** Обновить `_handleDragRibPoint` и `_handleArrowKeysForRibPoints` для использования composer.

**Мокап кода:**
```js
async _handleDragRibPoint(eventStream, initialEvent, ribHit) {
  const plan = resolveBehaviorPlan("ribPoint", "drag", this.modifiers);
  const { executor } = createBehaviorExecutor(plan, {
    data: { skeletonData: getSkeletonData(this.glyph), ribHit },
    selection: this.selection,
    sceneController: this.sceneController,
    computeDelta: (event) => this.localPoint(event),
  });
  
  await runDragOrchestration(executor, eventStream, {
    sceneController: this.sceneController,
    undoLabel: "Drag Rib Point",
  });
}

async _handleArrowKeysForRibPoints(delta, ribHit) {
  const plan = resolveBehaviorPlan("ribPoint", "nudge", this.modifiers);
  const { executor } = createBehaviorExecutor(plan, {
    data: { skeletonData: getSkeletonData(this.glyph), ribHit },
    selection: this.selection,
    sceneController: this.sceneController,
  });
  
  await runNudgeOrchestration(executor, delta, {
    sceneController: this.sceneController,
    undoLabel: "Nudge Rib Point",
  });
}
```

**Что тестировать вручную:**
- Rib point drag (linked mode) как baseline.
- Rib point drag (editable mode) как baseline.
- Rib point drag + Z (tangent) как baseline.
- Rib point drag + Alt (interpolation) как baseline.
- Rib point nudge как baseline.
- Rib point nudge + Z как baseline.
- Rib point nudge + Alt как baseline.

---

### Шаг 16. Мигрировать Tunni Midpoint Drag на Composer
**Статус:** ⏳ Pending

**Проблема:** Tunni midpoint drag использует отдельные calculation-функции.

**Решение:** Обновить `_handleDragTunniMidpoint` для использования composer.

**Мокап кода:**
```js
async _handleDragTunniMidpoint(eventStream, initialEvent, tunniHit) {
  const plan = resolveBehaviorPlan("tunniMidpoint", "drag", this.modifiers);
  const { executor } = createBehaviorExecutor(plan, {
    data: { glyph: this.glyph, tunniHit },
    selection: this.selection,
    sceneController: this.sceneController,
    computeDelta: (event) => this.localPoint(event),
  });
  
  await runDragOrchestration(executor, eventStream, {
    sceneController: this.sceneController,
    undoLabel: "Drag Tunni Midpoint",
  });
}
```

**Что тестировать вручную:**
- Regular Tunni midpoint drag как baseline.
- Regular Tunni true-point drag как baseline.
- Skeleton Tunni midpoint drag как baseline.
- Undo/redo как baseline.

---

### Шаг 17. Мигрировать Q-Measure на Composer
**Статус:** ⏳ Pending

**Проблема:** Q-measure hover/click использует отдельную логику в pointer.

**Решение:** Обновить `handleHover` и measure key handling для использования `POINTER_OBJECTS.measureTarget`.

**Мокап кода:**
```js
// edit-tools-pointer.js
handleHover(event) {
  const context = this._buildContext();
  const measureHit = POINTER_OBJECTS.measureTarget.hitTest(context, event);
  POINTER_OBJECTS.measureTarget.hover(context, measureHit, event);
}

handleKeyDown(event) {
  if (event.key === "q") {
    this._runMeasureKeyMode(event);
  }
}

_runMeasureKeyMode(event) {
  const context = this._buildContext();
  const measureHit = POINTER_OBJECTS.measureTarget.hitTest(context, event);
  // Update measure state via scene-model
  this.sceneModel.setMeasureState({
    mode: event.altKey ? "direct" : "projected",
    hoverSegment: measureHit?.segment || null,
  });
}
```

**Что тестировать вручную:**
- Q hold (projected mode) как baseline.
- Alt+Q hold (direct mode) как baseline.
- Q-measure для segments как baseline.
- Q-measure для rib points как baseline.
- Q-measure для handles как baseline.
- Measure reset на escape как baseline.

---

**Completion Criteria for Migration Steps (12-17):**

Each migration step (12-17) follows the same pattern. The step is complete when:

**M.1 — Object Kind migrated to composer**
- The drag/nudge handler for this object kind calls `resolveBehaviorPlan()` with correct `objectKind`
- The handler calls `createBehaviorExecutor()` with the plan
- The handler calls appropriate orchestration function (`runDragOrchestration` or `runNudgeOrchestration`)
- Old inline orchestration logic is REMOVED

**M.2 — Behavior selection is plan-driven**
- Modifier combinations map to correct behavior types via plan
- Object-kind-specific behavior overrides (if any) are handled in adapter, not pointer

**M.3 — No behavior regression**
- All test scenarios from "Что тестировать вручную" section pass
- Baseline document scenarios for this object kind pass

**M.4 — Pointer line count reduced**
- `edit-tools-pointer.js` line count is reduced by ≥20 lines per migration step

---

**Verification Commands for Steps 12-17:**
```bash
# Check that old inline orchestration is removed for this object kind
grep -A 20 "_handleDrag<ObjectKind>" src-js/views-editor/src/edit-tools-pointer.js | grep -c "for await"
# Expected: 0

# Check that composer is used
grep -A 10 "_handleDrag<ObjectKind>" src-js/views-editor/src/edit-tools-pointer.js | grep -c "runDragOrchestration"
# Expected: ≥1

# Line count reduction
wc -l src-js/views-editor/src/edit-tools-pointer.js
# Expected: reduced by ≥20 lines per step
```

---

### Шаг 18. Сжать `edit-tools-pointer.js` до Оркестратора
**Статус:** ⏳ Pending

**Проблема:** После миграции всех behavior flows на composer, в pointer остаются старые helper-функции и dead code.

**Решение:** Удалить перенесённые private-методы и оставить только orchestration layer.

**Целевая структура `edit-tools-pointer.js`:**
```js
// edit-tools-pointer.js (target structure)

import {
  resolveBehaviorPlan,
  createBehaviorExecutor,
  runDragOrchestration,
  runNudgeOrchestration,
} from "./edit-behavior-composer.js";
import { POINTER_OBJECTS } from "./pointer-objects.js";

export class PointerTool {
  // Public API (unchanged from main)
  async handleHover(event) {
    return this._runHoverMode(event);
  }
  
  async handleDrag(eventStream, initialEvent) {
    return this._runDragMode(eventStream, initialEvent);
  }
  
  async handleArrowKeys(event) {
    return this._runArrowMode(event);
  }
  
  handleKeyDown(event) {
    this._runMeasureKeyMode(event);
  }
  
  handleKeyUp(event) {
    this._runMeasureKeyMode(event);
  }
  
  // Private modality runners (orchestration only)
  _runHoverMode(event) {
    const objectKind = this._hitTestObjectKind(event);
    if (objectKind && POINTER_OBJECTS[objectKind]) {
      return POINTER_OBJECTS[objectKind].hitTest(this._buildContext(), event);
    }
    return null;
  }
  
  async _runDragMode(eventStream, initialEvent) {
    const objectKind = this._hitTestObjectKind(initialEvent);
    if (!objectKind || !POINTER_OBJECTS[objectKind]) {
      return false;
    }
    
    const plan = resolveBehaviorPlan(objectKind, "drag", this.modifiers);
    const { executor } = createBehaviorExecutor(plan, this._buildContext(objectKind));
    
    await runDragOrchestration(executor, eventStream, {
      sceneController: this.sceneController,
      selection: this.selection,
      computeDelta: (event) => this.localPoint(event),
      undoLabel: this._getUndoLabel(objectKind, "drag"),
    });
    
    return true;
  }
  
  async _runArrowMode(event) {
    const objectKind = this._hitTestObjectKind(event);
    if (!objectKind || !POINTER_OBJECTS[objectKind]) {
      return false;
    }
    
    const plan = resolveBehaviorPlan(objectKind, "nudge", this.modifiers);
    const { executor } = createBehaviorExecutor(plan, this._buildContext(objectKind));
    
    const delta = this._computeArrowDelta(event);
    await runNudgeOrchestration(executor, delta, {
      sceneController: this.sceneController,
      selection: this.selection,
      undoLabel: this._getUndoLabel(objectKind, "nudge"),
    });
    
    return true;
  }
  
  _runMeasureKeyMode(event) {
    // Q/Alt+Q handling via POINTER_OBJECTS.measureTarget
  }
  
  // Helper methods (unchanged from main)
  _hitTestObjectKind(event) { /* ... */ }
  _buildContext(objectKind) { /* ... */ }
  _computeArrowDelta(event) { /* ... */ }
  _getUndoLabel(objectKind, modality) { /* ... */ }
}
```

**Что тестировать вручную:**
- **Full pointer smoke-test:** все сценарии из baseline работают.
- **Main-parity full check:** regular-only pointer UX идентичен main.
- **Fork full check:** skeleton/rib/Tunni/Q-measure работают как baseline.

---

**Completion Criteria (Expected Results - Plain Language):**

**18.1 — Pointer is pure orchestrator**
- Public API methods (`handleHover`, `handleDrag`, `handleArrowKeys`, `handleKeyDown`, `handleKeyUp`) are unchanged from main
- Private modality runners exist: `_runHoverMode`, `_runDragMode`, `_runArrowMode`, `_runMeasureKeyMode`
- Object-kind-specific helpers (like `_handleDragSkeletonPoints`, `_handleDragRibPoint`, etc.) are REMOVED
- Pointer does NOT contain behavior math or orchestration loops

**18.2 — All drag routing goes through composer**
- `_runDragMode` calls `resolveBehaviorPlan()` with hit-tested `objectKind`
- `_runDragMode` calls `createBehaviorExecutor()` with the plan
- `_runDragMode` calls `runDragOrchestration()` with the executor
- No object-kind-specific drag branches remain

**18.3 — All nudge routing goes through composer**
- `_runArrowMode` calls `resolveBehaviorPlan()` with hit-tested `objectKind`
- `_runArrowMode` calls `createBehaviorExecutor()` with the plan
- `_runArrowMode` calls `runNudgeOrchestration()` with the executor
- No object-kind-specific nudge branches remain

**18.4 — Target line count achieved**
- `edit-tools-pointer.js` is ≤ 3500 lines
- Reduction from baseline (6534 lines) is ≥ 47%

**18.5 — Full baseline passes**
- All scenarios from `docs/refactor/tunni-measure-baseline.md` pass
- Main-parity check: regular-only pointer UX identical to main
- Fork-parity check: skeleton/rib/Tunni/Q-measure identical to pre-refactor baseline

---

**Verification Commands:**
```bash
# Target line count
wc -l src-js/views-editor/src/edit-tools-pointer.js
# Expected: ≤ 3500 lines

# Old helper functions removed
rg "_handleDragSkeletonPoints|_handleDragRibPoint|_handleArrowKeysForRibPoints|_handleEqualizeHandlesDrag" src-js/views-editor/src/edit-tools-pointer.js
# Expected: no matches

# Modality runners exist
grep "_runDragMode|_runArrowMode|_runHoverMode|_runMeasureKeyMode" src-js/views-editor/src/edit-tools-pointer.js
# Expected: all 4 found

# Full baseline test
# Run all scenarios from docs/refactor/tunni-measure-baseline.md
# Expected: all pass
```

---

### Шаг 19. Финальная Зачистка и Baseline Sweep
**Статус:** ⏳ Pending

**Проблема:** После миграции обычно остаются временные имена, дубли импортов, dead code.

**Решение:**
1. `rg`-проверка на старые паттерны
2. Удаление мусора
3. Финальный baseline прогон

**Мокап команд:**
```powershell
# Поиск старых импортов
rg -n "skeleton-edit-behavior" src-js/views-editor/src/

# Поиск удалённых helper-функций
rg -n "_handleDragSkeletonPoints|_handleDragRibPoint|_handleArrowKeysForRibPoints" src-js/views-editor/src/edit-tools-pointer.js

# Проверка циклических импортов
node --check src-js/views-editor/src/edit-behavior-composer.js
node --check src-js/views-editor/src/pointer-objects.js
```

**Что тестировать вручную:**
- **Полный baseline из Шага 01:**
  - Q hold / Alt+Q hold
  - Regular Tunni midpoint/true-point drag
  - Skeleton Tunni midpoint/true-point drag
  - Skeleton point drag / rib drag / rib arrows
  - Ctrl+Shift equalize/quantize
  - Generated contours exclusion
- **Stress test:** mixed glyph (regular + skeleton), multi-source editing.
- **Undo/redo stress:** последовательные drag/nudge/undo/redo циклы.

---

**Completion Criteria (Expected Results - Plain Language):**

**19.1 — All dead code removed**
- No references to `skeleton-edit-behavior.js` anywhere in codebase
- No references to deleted helper functions (`_handleDragSkeletonPoints`, etc.)
- No unused imports in any modified file
- No TODO comments referencing this refactor plan

**19.2 — All files pass syntax check**
- `node --check` passes for all modified files
- No circular dependency errors at runtime
- Build process completes without errors

**19.3 — All file size targets met**
| File | Target | Verification |
|------|--------|--------------|
| `edit-behavior.js` | ≤ 2500 lines | `wc -l` |
| `edit-tools-pointer.js` | ≤ 3500 lines | `wc -l` |
| `edit-behavior-composer.js` | ≤ 800 lines | `wc -l` |
| `pointer-objects.js` | ≤ 600 lines | `wc -l` |

**19.4 — Full baseline sweep passes**
- All 15+ scenarios from `docs/refactor/tunni-measure-baseline.md` pass
- Zero unexpected behavior changes
- Zero console errors during testing

**19.5 — Git history is clean**
- Each step (08-19) has a dedicated commit
- Commit messages reference step numbers
- `git status --porcelain` is clean after final commit

---

**Verification Commands:**
```bash
# Dead code check
rg "skeleton-edit-behavior" src-js/views-editor/src/
# Expected: no matches

rg "_handleDragSkeletonPoints|_handleDragRibPoint|_handleArrowKeysForRibPoints" src-js/views-editor/src/edit-tools-pointer.js
# Expected: no matches

# File size targets
wc -l src-js/views-editor/src/edit-behavior.js src-js/views-editor/src/edit-tools-pointer.js src-js/views-editor/src/edit-behavior-composer.js src-js/views-editor/src/pointer-objects.js
# Expected: all within targets

# Syntax check
node --check src-js/views-editor/src/edit-behavior.js
node --check src-js/views-editor/src/edit-tools-pointer.js
node --check src-js/views-editor/src/edit-behavior-composer.js
node --check src-js/views-editor/src/pointer-objects.js
# Expected: all exit code 0

# Git status
git status --porcelain
# Expected: clean (no uncommitted changes)
```

---

## Ограничение по Файлам (Жестко)

| Файл | Статус | Примечание |
|------|--------|------------|
| `src-js/fontra-core/src/tunni-core.js` | ✅ Существует | Core math |
| `src-js/fontra-core/src/measure-core.js` | ✅ Существует | Core math |
| `src-js/views-editor/src/edit-behavior-composer.js` | ⏳ Pending | Layer 3: Composition |
| `src-js/views-editor/src/pointer-objects.js` | ⏳ Pending | Layer 2: Data Adapters |
| `src-js/views-editor/src/edit-tools-pointer.js` | ⏳ Pending | Layer 4: Transport (сжимается) |
| `src-js/views-editor/src/edit-behavior.js` | ⏳ Pending | Layer 1: Behavior Types (сжимается) |
| `src-js/views-editor/src/skeleton-edit-behavior.js` | ❌ Удалить | После миграции |

**Запрещено:**
- Распил pointer на десятки `pointer-<type>.js`
- Любые правки `src-js/views-editor/src/edit-tools-metrics.js`
- Изменение публичного API pointer без необходимости

---

## Минимальный Regression Checklist

### После Шага 06 (Measure Core Migration)
1. ✅ Q projected / Alt+Q direct: совпадают с baseline.
2. ✅ Distance/Manhattan overlays отображаются и считают как baseline.
3. ✅ Tunni labels (distance/tension/angle toggles) совпадают с baseline.

### После Шага 07.7 (Behavior Hub Consolidation)
4. ✅ Regular drag + Shift/Alt модификаторы по baseline.
5. ✅ Skeleton drag + Shift/Alt модификаторы по baseline.
6. ✅ Rib drag/arrows работают с намеренно урезанным набором поведений.

### После Шага 18 (Pointer Compression)
7. ✅ Skeleton point drag/arrow + Shift/Alt как baseline.
8. ✅ Rib drag/arrow и ограничения (linked/editable, Z, interpolation) работают как baseline.
9. ✅ Generated handles drag/arrow и rollback/undo работают как baseline.
10. ✅ Regular point drag/nudge + все модификаторы как main.
11. ✅ Tunni midpoint/true-point drag как baseline.
12. ✅ Q/Alt+Q measure lifecycle как baseline.

### После Шага 19 (Final Cleanup)
13. ✅ **Полный baseline sweep** из Шага 01.
14. ✅ **Full main-parity check:** regular-only pointer UX идентичен main.
15. ✅ **Stress test:** mixed glyph + multi-source editing.
16. ✅ **Метрики:**
    - `edit-behavior.js` ≤ 2500 строк
    - `edit-tools-pointer.js` ≤ 3500 строк
    - `edit-behavior-composer.js` ≤ 800 строк
    - `pointer-objects.js` ≤ 600 строк
    - `skeleton-edit-behavior.js` удалён

---

## Evidence Template (Required per Completed Step)

Для каждого завершённого шага записать:

```md
### Шаг XX - [Название]
**Статус:** ✅ Completed (YYYY-MM-DD)

**Файлы затронуты:**
- `path/to/file1.js` (N строк добавлено/удалено)
- `path/to/file2.js` (N строк добавлено/удалено)

**BCM rows affected:**
- (Behavior Coverage Map rows, если применимо)

**Удалённые pointer semantic branches:**
- (Список удалённых helper-функций)

**Новые центральные пути:**
- (Список новых resolver/plan/executor paths)

**Ручные проверки выполнены:**
1. [Test case 1] - PASS/FAIL
2. [Test case 2] - PASS/FAIL

**Main-parity check:**
- [Regular-only test] - PASS/FAIL

**Результат:** PASS/FAIL
```

---

## Governance Rules (Strict)

1. **No step closure without binary gate evidence.** Если тесты не прошли — шаг не закрыт.
2. **No "partial complete" на behavior families.** Миграция должна быть полной для каждого Object Kind.
3. **No new pointer-local semantics.** Pointer становится чище, не сложнее.
4. **No manual case hunting as closure strategy.** Нельзя закрывать шаг фиксом отдельных багов без полного baseline.
5. **Any parity bug is fixed at composer layer first.** Если нашлён баг parity — фиксим в composer, не в pointer.
6. **Main-parity is non-negotiable.** Regular-only поведение должно быть идентично main после каждого шага.

---

## Итоговый Результат

После завершения всех шагов:

1. **Чёткое разделение ответственности:**
   - Layer 1 (`edit-behavior.js`): Behavior Types — **что** происходит
   - Layer 2 (`pointer-objects.js`): Data Adapters — **где** применяется
   - Layer 3 (`edit-behavior-composer.js`): Composition — **как** комбинируется
   - Layer 4 (`edit-tools-pointer.js`): Transport — **маршрутизация** ввода

2. **Уменьшение дублирования:**
   - Drag/nudge используют общие orchestration функции
   - Behavior semantics определены один раз
   - Object Kind adapters унифицированы

3. **Упрощение добавления новых поведений:**
   - Новый Behavior Type: добавить в `edit-behavior.js`
   - Новый Object Kind: добавить адаптер в `pointer-objects.js`
   - Новая комбинация: автоматически работает через composer

4. **Измеримое уменьшение файлов:**
   - `edit-tools-pointer.js`: 7429 → ≤ 3500 строк
   - `edit-behavior.js`: 3304 → ≤ 2500 строк
   - Удалён `skeleton-edit-behavior.js`

5. **Сохранение parity с main:**
   - Regular-only поведение идентично main
   - Fork-функционал (skeleton/rib/Tunni/Q-measure) работает как baseline
