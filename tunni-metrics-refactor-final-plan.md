# Tunni + Q-Measure Refactor (Object-Kind × Modality)

## Статус
- Версия: 7.1
- Дата: 25 февраля 2026
- Статус: Готов к выполнению

## Глоссарий
- `Q-measure` / `Q-metrics`: измерения сегментов (distance/angle/manhattan/tension), режимы `Q` и `Alt+Q`.
- `MetricsTool`: инструмент сайдбирингов/кернинга (`src-js/views-editor/src/edit-tools-metrics.js`), вне scope.

## Scope / Non-Scope
- Scope:
  - Tunni (regular + skeleton)
  - Q-measure
  - Управление skeleton point/rib point в Pointer
  - Pointer-архитектура по схеме `object kind × modality`
- Non-Scope:
  - Любые изменения `src-js/views-editor/src/edit-tools-metrics.js`
  - Поведение sidebearing/kerning

## Эталон Main (обязательный guardrail)
- Эталон pointer-поведения: `main:src-js/views-editor/src/edit-tools-pointer.js`.
- Любой шаг, который меняет pointer-routing/drag/hover/arrow/key-flow, проходит двойную проверку:
  - fork-базовые сценарии (Tunni/skeleton/rib/Q-measure)
  - main-parity сценарии (regular-only).
- Если найдено отклонение regular-only поведения от main и это не запланированное изменение форка — шаг не закрывается.

## Style Parity с Main (обязательный guardrail)
- Цель: не только parity поведения, но и близкая архитектурная форма к `main` в `edit-tools-pointer.js`.
- Правила:
  - не менять без необходимости публичные/исторические entrypoint-методы pointer (`handleHover`, `handleDrag`, `handleArrowKeys`, `handleKeyDown/Up`);
  - сохранять близкий порядок и фазность обработки событий (hit-test -> routing -> edit/apply -> refresh);
  - новые абстракции добавлять точечно (без "фреймворка внутри pointer");
  - не переименовывать массово существующие сущности, если это не требуется для читаемости;
  - в `edit-tools-pointer.js` оставлять fork-логику локально понятной: минимум "магических" прокладок.
- Критерий приемки pointer-шагов:
  - diff к `main` объясняется именно fork-функционалом (skeleton/rib/Tunni/Q-measure), а не произвольным стилевым переписыванием.

## Целевой принцип
- Не делим pointer по типам данных (`pointer-foo-point.js`, `pointer-bar-point.js`, ...).
- Делаем:
  - один реестр типов объектов: `pointer-objects.js`
  - модальности как приватные раннеры в `edit-tools-pointer.js`
  - один оркестратор: `edit-tools-pointer.js`
- Для edit behavior:
  - один behavior hub в `edit-behavior.js`
  - таблицы по `objectKind` (`regular`, `skeleton`, `rib`) в одном файле
  - правила по "эффективным модификаторам" (`shift`, `alt`, `q`, `x`, `z`) как lookup preset
  - без копипаста больших rules/actions в `skeleton-edit-behavior.js`
- Математика отдельно:
  - `tunni-core.js`
  - `measure-core.js`

---

## ВЫПОЛНЕНО

## Шаг 01. Baseline фиксация
**Общая проблема:** при рефакторе легко потерять UX-эквивалентность.  
**Аспект шага:** единый эталон для сравнения после каждого шага.  
**Решение:** документ baseline-сценариев в `docs/refactor/tunni-measure-baseline.md`.

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

## Шаг 02. Ввести `tunni-core.js` (чистая математика)
**Общая проблема:** Tunni-формулы дублируются в нескольких файлах.  
**Аспект шага:** один источник истины для regular+skeleton Tunni-геометрии.  
**Решение:** создать `src-js/fontra-core/src/tunni-core.js`.

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

## ОСТАЛОСЬ ВЫПОЛНИТЬ

## Шаг 03. Ввести `measure-core.js` (чистая measure-математика)
**Общая проблема:** measure-формулы смешаны с визуализацией.  
**Аспект шага:** отделение вычислений от рендера/hover.  
**Решение:** создать `src-js/fontra-core/src/measure-core.js`.

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

## Шаг 04. Перевести `tunni-calculations.js` на `tunni-core.js`
**Общая проблема:** старый файл держит дубли формул.  
**Аспект шага:** regular Tunni путь использует только новый core.  
**Решение:** заменить вычисления на импорты из `tunni-core.js`, оставить thin wrappers.

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

## Шаг 05. Перевести `src-js/views-editor/src/skeleton-tunni-calculations.js` на `tunni-core.js`
**Общая проблема:** skeleton Tunni математика дублируется отдельно.  
**Аспект шага:** skeleton путь тоже на общем core.  
**Решение:** локальные math-дубли заменить импортами core; оставить только skeleton-структурные операции.

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

## Шаг 06. Перевести `distance-angle.js` на `measure-core.js`
**Общая проблема:** файл одновременно считает и рисует, плюс Tunni-дубли.  
**Аспект шага:** оставить в файле только visualization/format слой.  
**Решение:** формулы импортировать из `measure-core.js`, удалить временные дубли (`calculateTunniPointz` и т.п.).

**Мокап кода:**
```js
import { distance, angleDeg, manhattan, handleTension } from "./measure-core.js";
import { calculateRegularTrueTunniPoint } from "./tunni-core.js";
```

**Что тестировать вручную:**
- Q/Alt+Q значения и Tunni labels как baseline.

---

## Шаг 07. Единый helper generated contours
**Общая проблема:** фильтрация generated contours дублируется в hit-test/visualization.  
**Аспект шага:** одна функция, одинаковый результат везде.  
**Решение:** добавить helper в core и заменить локальные копии.

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

## Шаг 07.5. Собрать единый behavior hub в `edit-behavior.js`
**Общая проблема:** `edit-behavior.js` и `skeleton-edit-behavior.js` держат дубли одной таблицы поведения.  
**Аспект шага:** один источник правил/actions и lookup модификаторов в одном файле.  
**Решение:** в `src-js/views-editor/src/edit-behavior.js` собрать behavior hub:
- `actionFactories`
- базовые rule-наборы
- `BEHAVIOR_TABLES` по `objectKind` (`regular`, `skeleton`, `rib`)
- lookup "эффективных модификаторов" (`resolveBehaviorPresetName(flags)`)
- выдача preset через `getBehaviorPreset(objectKind, flagsOrName)`.

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
    // rib intentionally limited
  },
};

export function resolveBehaviorPresetName(flags) {}
export function getBehaviorPreset(objectKind, flagsOrName) {}
```

**Что тестировать вручную:**
- Сборка проходит.
- Runtime без `ReferenceError`/циклических import-ошибок.

---

## Шаг 07.6. Подключить regular/skeleton/rib адаптеры к behavior hub
**Общая проблема:** skeleton/rib путь тащит отдельные копии behavior-таблиц.  
**Аспект шага:** все адаптеры берут preset из единого hub в `edit-behavior.js`.  
**Решение:** в `edit-behavior.js` и `skeleton-edit-behavior.js` заменить локальные `behaviorTypes`/копипасту правил на `getBehaviorPreset`; оставить в каждом файле только адаптер данных:
- regular: unpack contours + текущий rollback
- skeleton: segment/neighbor mapping + свой rollback
- rib: ширинные/nudge-операции с ограниченным набором preset.

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
- `Q/X/Z`-флаги не ломают выбор preset (даже если для части objectKind они no-op).

---

## Шаг 08. Создать `pointer-objects.js` (реестр типов объектов)
**Общая проблема:** логика по типам объектов размазана по pointer-условиям.  
**Аспект шага:** декларативное описание типов и их capability в одном месте.  
**Решение:** создать единый реестр object kinds + адаптеры операций по типам.

**Мокап кода:**
```js
// pointer-objects.js
export const POINTER_OBJECTS = {
  regularPoint: {
    hitTest(ctx, event) {},
    beginDrag(ctx, hit) {},
    applyDrag(ctx, state, event) {},
    nudge(ctx, selection, delta, event) {},
  },
  skeletonPoint: {
    hitTest(ctx, event) {},
    beginDrag(ctx, hit) {},
    applyDrag(ctx, state, event) {},
    nudge(ctx, selection, delta, event) {},
  },
  ribPoint: {
    hitTest(ctx, event) {},
    beginDrag(ctx, hit) {},
    applyDrag(ctx, state, event) {},
    nudge(ctx, selection, delta, event) {},
  },
  tunniMidpoint: {
    hitTest(ctx, event) {},
    beginDrag(ctx, hit) {},
    applyDrag(ctx, state, event) {},
  },
  tunniTruePoint: {
    hitTest(ctx, event) {},
    beginDrag(ctx, hit) {},
    applyDrag(ctx, state, event) {},
  },
  measureTarget: {
    hitTest(ctx, event) {},
    hover(ctx, hit, event) {},
  },
};
```

**Что тестировать вручную:**
- Подключение файла без изменения поведения.

---

## Шаг 09. Добавить модальности как приватные раннеры в `edit-tools-pointer.js`
**Общая проблема:** pointer-логика размазана по событиям и private-методам.  
**Аспект шага:** модальности централизованы и работают через object kind capabilities.  
**Решение:** добавить приватные раннеры модальностей в `edit-tools-pointer.js`: `hover`, `drag`, `arrow`, `measure-key`.

**Мокап кода:**
```js
// edit-tools-pointer.js
_runHoverMode(event) {}
async _runDragMode(eventStream, initialEvent) {}
async _runArrowMode(event) {}
_runMeasureKeyMode(event) {}
```

**Что тестировать вручную:**
- Без переключения вызовов поведение неизменно.
- Main-parity mini-check (regular-point drag + handle drag + multi-select).

---

## Шаг 10. Ввести единый Measure State API в `scene-model.js` без смены shape state
**Общая проблема:** measure state дублируется между pointer и scene-model.  
**Аспект шага:** один owner состояния.  
**Решение:** добавить `setMeasureState/resetMeasureState`, но оставить текущие поля (`measureMode`, `measureShowDirect`, `measureHover*`) как источник истины; меняем только точку записи.

**Мокап кода:**
```js
setMeasureState(patch) {
  if ("mode" in patch) this.measureMode = patch.mode;
  if ("showDirect" in patch) this.measureShowDirect = patch.showDirect;
  if ("hoverSegment" in patch) this.measureHoverSegment = patch.hoverSegment;
  if ("hoverRibPoint" in patch) this.measureHoverRibPoint = patch.hoverRibPoint;
  if ("hoverPoints" in patch) this.measureHoverPoints = patch.hoverPoints;
  if ("hoverHandle" in patch) this.measureHoverHandle = patch.hoverHandle;
}
resetMeasureState() {
  this.measureMode = false;
  this.measureShowDirect = false;
  this.measureHoverSegment = null;
  this.measureHoverRibPoint = null;
  this.measureHoverPoints = null;
  this.measureHoverHandle = null;
}
```

**Что тестировать вручную:**
- Q key lifecycle и reset на tool switch/escape.

---

## Шаг 11. Подключить measure key modality в pointer
**Общая проблема:** Q/Alt+Q key lifecycle вшит в монолит pointer.  
**Аспект шага:** key mode идет через централизованную модальность.  
**Решение:** `handleKeyDown/Up` делегирует в приватный `_runMeasureKeyMode`, который использует `POINTER_OBJECTS.measureTarget`.

**Мокап кода:**
```js
import { POINTER_OBJECTS } from "./pointer-objects.js";
handleKeyDown(e) { this._runMeasureKeyMode(e); /* ... */ }
handleKeyUp(e) { this._runMeasureKeyMode(e); /* ... */ }
```

**Что тестировать вручную:**
- Q hold / Alt+Q hold без регресса.
- Main-parity mini-check: Q-mode не ломает обычный pointer lifecycle.

---

## Шаг 12. Подключить hover modality в pointer
**Общая проблема:** hover приоритеты зашиты в длинных ветках.  
**Аспект шага:** hover всегда проходит через реестр object kinds.  
**Решение:** `handleHover` делегирует в приватный `_runHoverMode`, который опирается на `POINTER_OBJECTS`.

**Мокап кода:**
```js
handleHover(event) { return this._runHoverMode(event); }
```

**Что тестировать вручную:**
- Приоритеты rib > handle > segment > points стабильны.
- Main-parity mini-check: hover regular points/handles/segments как в main.

---

## Шаг 13. Подключить drag modality в pointer
**Общая проблема:** drag для regular/skeleton/rib/tunni реализован разрозненно.  
**Аспект шага:** единый drag routing через object kinds.  
**Решение:** `handleDrag` делегирует в приватный `_runDragMode`, который вызывает `beginDrag/applyDrag` нужного объекта из `POINTER_OBJECTS`.

**Мокап кода:**
```js
async handleDrag(stream, initial) {
  if (await this._runDragMode(stream, initial)) return;
  return this.handleDefaultPointerFlow(stream, initial);
}
```

**Что тестировать вручную:**
- Skeleton point drag, rib drag, regular point drag, Tunni drag — все по baseline.
- Main-parity mini-check: regular drag/undo/redo и constrain-модификаторы как в main.

---

## Шаг 14. Подключить arrow modality в pointer
**Общая проблема:** arrow flow для skeleton/rib смешан с прочими ветками.  
**Аспект шага:** единый nudge flow через capability `nudge`.  
**Решение:** `handleArrowKeys` делегирует в приватный `_runArrowMode`, который распределяет nudge через `POINTER_OBJECTS`.

**Мокап кода:**
```js
async handleArrowKeys(event) {
  if (await this._runArrowMode(event)) return;
  return this._handleDefaultArrowKeys(event);
}
```

**Что тестировать вручную:**
- Skeleton point arrows и rib arrows (включая linked/editable) как baseline.
- Main-parity mini-check: regular arrow-nudge (точки/компоненты) как в main.

---

## Шаг 15. Сжать `edit-tools-pointer.js` до оркестратора
**Общая проблема:** после подключения раннеров модальностей остаются дубли и legacy-ветки.  
**Аспект шага:** удалить старый путь, оставить orchestration.  
**Решение:** удалить перенесенные private-методы и dead branches.

**Мокап кода:**
```js
// edit-tools-pointer.js (idea)
handleHover -> _runHoverMode
handleDrag -> _runDragMode
handleArrowKeys -> _runArrowMode
handleKeyDown/Up -> _runMeasureKeyMode
```

**Что тестировать вручную:**
- Full pointer smoke-test без деградации.
- Полный main-parity smoke-test regular-only глифов.

---

## Шаг 16. Финальная зачистка и baseline sweep
**Общая проблема:** после миграции обычно остаются временные имена и дубли.  
**Аспект шага:** убрать вторую “правду” и завершить refactor чисто.  
**Решение:** `rg`-проверка + удаление мусора + финальный baseline.

**Мокап кода:**
```powershell
rg -n "calculateTunniPointz|SKELETON DEBUG|measureMode\\s*=|measureHoverSegment\\s*=" src-js
rg -n "_handleDragSkeletonPoints|_handleDragRibPoint|_handleArrowKeysForRibPoints" src-js/views-editor/src/edit-tools-pointer.js
```

**Что тестировать вручную:**
- Полный baseline из шага 01.
- Stress: mixed glyph (regular + skeleton), multi-source editing.

---

## Ограничение по файлам (жестко)
- Разрешено добавить:
  - `src-js/fontra-core/src/tunni-core.js`
  - `src-js/fontra-core/src/measure-core.js`
  - `src-js/views-editor/src/pointer-objects.js`
- Запрещено:
  - распил pointer на десятки `pointer-<type>.js`
  - любые правки `src-js/views-editor/src/edit-tools-metrics.js`

## Минимальный regression checklist (после шагов 06, 13, 16)
1. Q projected / Alt+Q direct: совпадают с baseline.
2. Regular Tunni midpoint/true-point: совпадают с baseline.
3. Skeleton Tunni midpoint/true-point: совпадают с baseline.
4. Skeleton point drag / rib drag / rib arrows: совпадают с baseline.
5. Generated contours исключены из regular measure/tunni hit-test.
6. Mixed glyph + multi-source не дает интерполяционных артефактов.
7. Поведение regular/skeleton/rib соответствует целевой матрице preset (допустимы осознанные отличия).
8. Regular-only pointer UX (drag/hover/arrow/select) не деградирует относительно `main`.
9. Структурный стиль `edit-tools-pointer.js` остается близким к `main` (без лишней "архитектурной революции").
