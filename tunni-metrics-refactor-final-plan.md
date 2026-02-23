# Полный план рефакторинга Tunni + Metrics/Q-режима

## Статус документа
- **Версия:** 5.0 (консолидация Tunni + Measure, Pointer модули)
- **Дата:** 23 февраля 2026
- **Статус:** Готов к выполнению
- **Основан на:** `PLAN-tunni-metrics-refactor.md` + аудит codebase от 23.02.2026
- **Критические изменения:**
  - Шаг 19 удалён (уже выполнен)
  - Tunni: 2 файла вместо 4 (tunni-core.js + tunni-target.js в Pointer)
  - Measure: 2 файла вместо 3 (measure-math.js + measure-target.js в Pointer)
  - Адаптеры regular/skeleton в том же файле что и математика
  - edit-tools-metrics.js ИСКЛЮЧЁН из рефактора (это MetricsTool)

---

## Резюме

**Цель:** Привести `Tunni`, `Distance/Manhattan/Q-measure`, `Pointer` и связанный UI к предсказуемой модульной архитектуре без изменения UX, кроме явных багфиксов математики.

**Режим исполнения:**
- UX freeze — математику менять только при доказанном баге
- Полный module split сразу
- Сопутствующий техдолг закрываем в этом плане

---

## Все шаги (полный список)

| Шаг | Название | Статус | Зависимости |
|-----|----------|--------|-------------|
| **00** | Математические инварианты (опционально) | ⬜ Новый | — |
| **01** | Зафиксировать baseline сценариев | ⬜ Оригинал | — |
| **02** | Ввести tunni-core.js (математика + адаптеры) | ⬜ Оригинал++ | — |
| **03** | Консолидировать Measure/Distance математику | ⬜ Новый | Шаг 02 |
| **04** | Вынести Tunni interactions в Pointer targets | ⬜ Оригинал+ | Шаг 02, 22 |
| **05** | Разнести регистрации visualization layers по доменам | ⬜ Оригинал | — |
| **06** | Helper фильтрации generated contours | ⬜ Оригинал+ | — |
| **07** | Ввести pointer context-контракт | ⬜ Оригинал | — |
| **08** | Консолидировать Measure state (Q-mode + Distance) | ⬜ Новый | Шаг 07 |
| **09** | Починить binding чекбоксов Tunni | ⬜ Оригинал+ | — |
| **10** | Локализация, naming, hotkey-consistency | ⬜ Оригинал+ | — |
| **11** | Удалить debug-код и временные имена | ⬜ Новый | — |
| **12** | Финальная зачистка deprecated путей | ⬜ Оригинал | Все предыдущие |
| **22** | Объектно-ориентированный Pointer Tool | ⬜ Новый | Шаг 02, 07 |

**Изменения в версии 5.0:**
- **Шаг 19 удалён** — проверка `ctrlKey` уже удалена в `mouse-tracker.js:44`
- **Шаг 02** — tunni-core.js (математика + адаптеры regular/skeleton)
- **Шаг 03 новый** — консолидация Measure/Distance математики в ОДИН файл
- **Шаг 04** — Tunni interactions в Pointer targets (часть Шага 22)
- **Шаг 08** — Measure state консолидируется (Q-mode + Distance один домен)
- **edit-tools-metrics.js ИСКЛЮЧЁН** — это MetricsTool (sidebearings/kerning), не относится к рефактору
- **Итого:** 14 шагов вместо 23

---

## Порядок выполнения (оптимизированный)

```
Фаза 1: Подготовка (Дни 1-2)
┌─────────────────────────────────────────────────────────┐
│  Шаг 00: Математические инварианты (ОПЦИОНАЛЬНО)        │
│  (тесты на математические истины, не на код)            │
│  Если не пишешь → усиливай Шаг 01 (ручная матрица)      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Шаг 01: Зафиксировать baseline сценариев               │
│  (ручная проверка текущего UX)                          │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Шаг 02: Ввести ядро Tunni-геометрии                    │
│  (создать tunni-geometry.js — универсальная математика) │
└─────────────────────────────────────────────────────────┘
                          ↓
                    ┌───────────┴───────────┐
                    ↓                       ↓
        ┌───────────────────┐    ┌───────────────────┐
        │ Шаг 02.5:         │    │ Шаг 04:           │
        │ Tunni adapters    │    │ distance-angle.js │
        │ (regular/skeleton)│    │ (импорт из ядра)  │
        └───────────────────┘    └───────────────────┘
                    ↓
        ┌───────────────────┐
        │ Шаг 03:           │
        │ tunni-calculations│
        │ (regular API)     │
        └───────────────────┘
                    ↓
                    └───────────┬───────────┘
                                ↓
Фаза 2: Визуализация (Дни 4-5)
┌─────────────────────────────────────────────────────────┐
│  Шаг 05: Разнести регистрации visualization layers      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Шаг 06: Вынести Tunni interactions из core             │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Шаг 07: Helper фильтрации generated contours           │
└─────────────────────────────────────────────────────────┘
                          ↓
Фаза 3: Pointer рефакторинг (Дни 6-10)
┌─────────────────────────────────────────────────────────┐
│  Шаг 22: Объектно-ориентированный Pointer Tool          │
│  (архитектурное изменение — заменяет шаги 08-15)        │
│  ⚠️ 4 дня минимум, +2 дня буфер                         │
└─────────────────────────────────────────────────────────┘
                          ↓
Фаза 4: Сопутствующие изменения (Дни 11-12)
┌─────────────────────────────────────────────────────────┐
│  Шаг 16: Чекбоксы Tunni                                 │
│  Шаг 17: Очистка edit-tools-metrics.js                  │
│  Шаг 18: Локализация                                    │
│  Шаг 21: Debug clean                                    │
│  (Шаг 19 исключён — уже выполнен)                       │
└─────────────────────────────────────────────────────────┘
                          ↓
Фаза 5: Финализация (День 13-14)
┌─────────────────────────────────────────────────────────┐
│  Шаг 20: Финальная зачистка + baseline sweep            │
└─────────────────────────────────────────────────────────┘
```

---

## Детальное описание шагов

### Шаг 00. Математические инварианты (опционально)

**Статус:** ⬜ Новый, опционально

**Важное уточнение:** Тесты пишутся **не для кода**, а для **математических инвариантов**.

**Проблема:** Оригинал указывает: "Автотесты не добавляем". Ручная проверка может пропустить тихие численные регрессии.

**Решение:** Создать `test-common/test-tunni-geometry.js` с тестами на **математические истины**, не на реализацию.

**Файлы:**
- `test-common/test-tunni-geometry.js` — создать (опционально)

**Что тестируем (математические инварианты):**

```js
// ❌ Бесполезный тест (проверяет код):
it("возвращает {x: 100, y: 0}", () => {
  const result = calculateTrueTunniPoint([...]);
  expect(result).to.deep.equal({ x: 100, y: 0 }); // ← проверяет реализацию
});

// ✅ Полезный тест (проверяет математику):
it("параллельные лучи не пересекаются", () => {
  const segmentPoints = [
    { x: 0, y: 0 }, { x: 0, y: 50 },  // луч вверх
    { x: 100, y: 50 }, { x: 100, y: 0 }  // луч вверх — параллелен
  ];
  const result = calculateTrueTunniPoint(segmentPoints);
  // Это не про код — это про ГЕОМЕТРИЮ: параллельные прямые не пересекаются
  expect(result).to.be.null;
});

it("equalize на уже equalized сегменте не меняет ничего (идемпотентность)", () => {
  const segmentPoints = [
    { x: 0, y: 0 }, { x: 50, y: 0 },    // dist = 50
    { x: 150, y: 0 }, { x: 200, y: 0 }, // dist = 50
  ];
  const result = calculateEqualizedControlPoints(segmentPoints);
  // Это не про код — это про СВОЙСТВО: equalize не должен менять равное
  expect(result[0].x).to.equal(50);
  expect(result[1].x).to.equal(150);
});

it("расстояние всегда положительное", () => {
  const dist = calculateControlHandleDistance([...]);
  // Это не про код — это про СВОЙСТВО метрики
  expect(dist).to.be.greaterThan(0);
});
```

**Критерии приемки (если решено писать тесты):**
- [ ] Тесты проверяют **математические инварианты**, не реализацию
- [ ] Покрытие: ~3-5 тестов на ключевые свойства
- [ ] Edge cases: параллельные лучи, нулевые расстояния, идемпотентность

**Если тесты не пишутся:**
- Усилить Шаг 01 (baseline) — детальная ручная матрица
- Автор проверяет вручную после каждого шага

---

### Шаг 01. Зафиксировать baseline сценариев

**Статус:** ⬜ Оригинал

**Проблема:** Риск тихого изменения UX при большом распиле.

**Решение:** Добавить документ baseline-сценариев.

**Файлы:**
- `docs/refactor/tunni-metrics-baseline.md` — создать

**Сценарии для проверки:**
- Q hold: projected dx/dy labels
- Alt+Q hold: direct dist+angle
- X hold: equalize drag для regular handles
- Ctrl+Shift+click на Tunni midpoint: equalize+quantize
- Skeleton Tunni midpoint/true-point drag behavior
- Exclusion of skeleton-generated contours в regular Tunni layers

**Критерии приемки:**
- [ ] Все сценарии описаны
- [ ] Ручная проверка выполнена и задокументирована

---

### Шаг 02. Ввести tunni-core.js (математика + адаптеры)

**Статус:** ⬜ Оригинал++ (консолидировано)

**Проблема:** Дубли формул в `distance-angle.js`, `tunni-calculations.js` и `skeleton-tunni-calculations.js`.

**Решение:** Создать **один** файл `tunni-core.js` с универсальной математикой и адаптерами для regular/skeleton.

**Файлы:**
- `src-js/fontra-core/src/tunni-core.js` — создать (~500 строк)

**Структура файла:**

```js
// tunni-core.js

// ============================================================================
// УНИВЕРСАЛЬНАЯ МАТЕМАТИКА (не зависит от regular/skeleton)
// ============================================================================

export function calculateMidpoint(point1, point2) {
  return { x: (point1.x + point2.x) / 2, y: (point1.y + point2.y) / 2 };
}

export function calculateTrueTunniIntersection(p1, ray1End, p2, ray2End) {
  return intersect(p1, ray1End, p2, ray2End);
}

export function calculateControlPointsAlongRays(...) {
  // ...
}

// ============================================================================
// АДАПТЕР ДЛЯ REGULAR CONTOURS
// ============================================================================

export function calculateTrueTunniPoint(segmentPoints) {
  const [p1, p2, p3, p4] = segmentPoints;
  // Regular: p1→p2 direction, p4→p3 direction
  return calculateTrueTunniIntersection(p1, p2, p4, p3);
}

export function calculateTunniPoint(segmentPoints) {
  const [p1, p2, p3, p4] = segmentPoints;
  return calculateMidpoint(p2, p3);
}

export function calculateControlPointsFromTunni(...) {
  // ...
}

// ============================================================================
// АДАПТЕР ДЛЯ SKELETON CONTOURS
// ============================================================================

export function calculateSkeletonTrueTunniPoint(segment) {
  const { startPoint, endPoint, controlPoints } = segment;
  const [cp1, cp2] = controlPoints;
  // Skeleton: startPoint→cp1 direction, endPoint→cp2 direction
  return calculateTrueTunniIntersection(startPoint, cp1, endPoint, cp2);
}

export function calculateSkeletonTunniPoint(segment) {
  const { controlPoints } = segment;
  const [cp1, cp2] = controlPoints;
  return calculateMidpoint(cp1, cp2);
}

export function calculateSkeletonControlPointsFromTunniDelta(...) {
  // ...
}
```

**Критерии приемки:**
- [ ] Все функции **чистые**, без зависимостей от canvas/scene/hit-test
- [ ] Универсальная математика отделена комментариями от адаптеров
- [ ] Адаптеры regular/skeleton в одном файле — легко сравнить
- [ ] Тесты из Шага 00 проходят

---

### Шаг 03. Консолидировать Measure/Distance математику

**Статус:** ⬜ Новый

**Проблема:** Q-measure и Distance-Angle используют одну и ту же математику (дистанция, угол, tension), но:
- Математика размазана по `distance-angle.js` (1423 строки!)
- Дублирование формул для distance/angle/tension
- Разные entry points для одного и того же

**Решение:** Создать **один** файл `measure-math.js` с универсальной математикой измерений.

**Файлы:**
- `src-js/fontra-core/src/measure-math.js` — создать (~400-500 строк)
- `src-js/fontra-core/src/distance-angle.js` — удалить математику, оставить только legacy совместимость (опционально)

**Структура файла:**

```js
// measure-math.js

// ============================================================================
// УНИВЕРСАЛЬНАЯ МАТЕМАТИКА ИЗМЕРЕНИЙ
// ============================================================================

export function calculateDistance(point1, point2) { ... }
export function calculateAngle(point1, point2) { ... }
export function calculateDistanceAndAngle(point1, point2) { ... }
export function calculateManhattanDistance(point1, point2) { ... }

// Tension calculation (использует Tunni)
import { calculateTrueTunniPoint } from "./tunni-core.js";

export function calculateHandleTension(cp1, cp2, tunniPoint) { ... }
export function calculateTunniTension(segmentPoints) { ... }

// Helper для Q-measure и Distance-Angle
export function formatDistance(dist) { ... }
export function formatAngle(angle) { ... }
export function formatTension(tension) { ... }
```

**Критерии приемки:**
- [ ] Вся математика измерений в одном файле
- [ ] Q-measure импортирует из `measure-math.js`
- [ ] Distance-Angle импортирует из `measure-math.js`
- [ ] Нет дублирования формул

---

### Шаг 04. Вынести Tunni interactions в Pointer targets

**Статус:** ⬜ Оригинал+ (обновлено)

**Проблема:** `tunni-calculations.js` содержит interaction-логику (hit-test, mouse down/drag/up), которая должна быть в views-editor.

**Решение:** Переместить Tunni interaction-логику в `pointer/targets/tunni-target.js` как часть Шага 22 (Pointer рефактор).

**Файлы:**
- `src-js/views-editor/src/pointer/targets/tunni-target.js` — создать (в рамках Шага 22)
- `src-js/fontra-core/src/tunni-calculations.js` — удалить interaction-функции, оставить только thin wrapper для совместимости (опционально)

**Что переезжает в tunni-target.js:**
- `tunniLayerHitTest(...)` → `TunniTarget.hitTest()`
- `handleTunniPointMouseDown(...)` → `TunniTarget.handleDrag()`
- `handleTunniPointMouseDrag(...)` → `TunniTarget.handleDrag()`
- `handleTunniPointMouseUp(...)` → `TunniTarget.handleDrag()`
- `equalizeThenQuantizeSegmentControlPoints(...)` → `TunniTarget` + `EqualizeModifier`
- `handleTrueTunniPoint*` → `TunniTarget`

**Важно:** Tunni interaction **не выносится в отдельный файл** — это часть Pointer-рефактора (Шаг 22).

**Критерии приемки:**
- [ ] Regular Tunni drag работает через `TunniTarget`
- [ ] Skeleton Tunni drag работает через `TunniTarget`
- [ ] Ctrl+Shift-click equalize/quantize работает
- [ ] Undo/redo работают

---

### Шаг 05. Разнести регистрации visualization layers по доменам

**Статус:** ⬜ Оригинал

**Проблема:** `visualization-layer-definitions.js` перегружен.

**Решение:** Вынести Tunni/Measure layer registration в отдельные файлы.

**Файлы:**
- `src-js/views-editor/src/visualization-layer-tunni.js` — создать
- `src-js/views-editor/src/visualization-layer-measure.js` — создать
- `src-js/views-editor/src/visualization-layer-definitions.js` — изменить

**Критерии приемки:**
- [ ] Toggles всех слоев работают
- [ ] Порядок z-index не изменился

---

### Шаг 06. Вынести регулярные Tunni interactions из core в views

**Статус:** ⬜ Оригинал

**Проблема:** core-файл знает про UI-объекты.

**Решение:** Создать `tunni-interactions-regular.js` в views-editor.

**Файлы:**
- `src-js/views-editor/src/tunni-interactions-regular.js` — создать
- `src-js/fontra-core/src/tunni-calculations.js` — удалить UI-логику

**Функции для переноса:**
- `tunniLayerHitTest(...)`
- `handleTunniPointMouseDown(...)`
- `handleTunniPointMouseDrag(...)`
- `handleTunniPointMouseUp(...)`
- `equalizeThenQuantizeSegmentControlPoints(...)`

**Критерии приемки:**
- [ ] Regular Tunni drag работает
- [ ] Ctrl+Shift-click equalize/quantize работает
- [ ] Undo/redo работают

---

### Шаг 07. Helper фильтрации generated contours

**Статус:** ⬜ Оригинал+ (исправлено)

**Проблема:** Логика исключать скелет-сгенерированные контуры продублирована.

**Решение:** Один helper в `skeleton-contour-generator.js`.

**Файлы:**
- `src-js/fontra-core/src/skeleton-contour-generator.js` — добавить экспорт
- `src-js/fontra-core/src/tunni-calculations.js` — удалить локальную функцию

**Мокап кода:**
```js
// skeleton-contour-generator.js
export function getGeneratedContourIndexSet(positionedGlyph, editLayerName) {
  const layerName = editLayerName || positionedGlyph?.glyph?.layerName;
  const layer = positionedGlyph?.varGlyph?.glyph?.layers?.[layerName];
  return new Set(getSkeletonData(layer)?.generatedContourIndices || []);
}
```

**Критерии приемки:**
- [ ] Helper экспортирован из `skeleton-contour-generator.js`
- [ ] Все импорты обновлены
- [ ] Regular Tunni/measure не цепляются за generated contours

---

### Шаг 08. Консолидировать Measure state (Q-mode + Distance)

**Статус:** ⬜ Новый

**Проблема:** Measure state дублируется между:
- `PointerTool.measureMode` (в `edit-tools-pointer.js`)
- `SceneModel.measureMode`, `measureHoverSegment`, `measureHoverRibPoint`, etc. (в `scene-model.js`)
- Дублирование keydown/keyup логики для Q/Alt+Q

**Решение:** Консолидировать Measure state в `SceneModel`, Pointer импортирует состояние оттуда.

**Файлы:**
- `src-js/views-editor/src/scene-model.js` — добавить единый Measure state API
- `src-js/views-editor/src/edit-tools-pointer.js` — удалить дубли state, импортировать из `scene-model.js`

**Структура Measure state:**

```js
// scene-model.js
this.measure = {
  active: false,           // Q-key hold
  showDirect: false,       // Alt+Q toggle
  hoverSegment: null,      // { p1, p2, type }
  hoverRibPoint: null,     // { x, y, width, leftWidth, rightWidth }
  hoverHandle: null,       // { p1, p2, type, tensionContext }
  hoverPoints: null,       // { p1, p2, type } (selected points)
};

setMeasureState(patch) { Object.assign(this.measure, patch); }
resetMeasureState() { /* сброс всех полей */ }
```

**Критерии приемки:**
- [ ] Единый источник истины для Measure state в `SceneModel`
- [ ] Pointer не дублирует state, только вызывает `setMeasureState()`
- [ ] Q-key lifecycle (keydown/keyup) управляет state через `setMeasureState()`
- [ ] При любом завершении interaction (mouseup, escape, смена tool) state сбрасывается

---

### Шаг 09. Ввести pointer context-контракт

**Примечание:** Шаги 08-15 оригинального плана заменены на **Шаг 22** (объектно-ориентированный Pointer Tool), который реализует ту же функциональность, но с лучшей архитектурой.

| Оригинал (Шаги 08-15) | Новый подход (Шаг 22) |
|-----------------------|----------------------|
| Шаг 08: Pointer context-контракт | `pointer-context.js` — часть архитектуры |
| Шаг 09: Q-measure key lifecycle | `measure-target.js` — инкапсулировано |
| Шаг 10: Measure state API | `scene-model.js` + `measure-target.js` |
| Шаг 11: Q-measure hit-testing | `measure-target.js` — приватный метод |
| Шаг 12: Regular Tunni pointer-flow | `tunni-target.js` — отдельный класс |
| Шаг 13: Skeleton Tunni pointer-flow | `skeleton-point-target.js` — отдельный класс |
| Шаг 14: Equalize-механика | `equalize-modifier.js` — отдельный класс |
| Шаг 15: Thin orchestrator | `pointer-tool.js` — ~400 строк |

---

### Шаг 22. Объектно-ориентированный Pointer Tool

**Статус:** ⬜ Новый, архитектурное изменение

**Проблема:** `edit-tools-pointer.js` — 7497 строк монолита.

**Решение:** Композиция + стратегия: 5 target-классов + 4 modifier-класса.

**Важное разделение:**

| Тип | Назначение | Примеры |
|-----|------------|---------|
| **Targets** | Объекты для hit-test, реагируют на drag | point, skeleton-point, rib-point, tunni, measure |
| **Modifiers** | Состояния, меняющие поведение drag | equalize, quantize, snap, fixed-rib |

**Архитектура:**

```
┌─────────────────────────────────────────────────────────┐
│                    PointerTool                          │
│  targets: [PointTarget, SkeletonPointTarget, ...]       │
│  modifiers: []  (добавляются dynamically при keydown)   │
│                                                         │
│  handleDrag(eventStream, initialEvent):                 │
│    target = targets.find(t => t.hitTest(event))         │
│    if target:                                           │
│      modifiers.forEach(m => m.beforeDrag(target))       │
│      await target.handleDrag(eventStream, event)        │
│      modifiers.forEach(m => m.afterDrag(target))        │
└─────────────────────────────────────────────────────────┘
                          │
          ┌───────────────┴───────────────┐
          ↓                               ↓
┌─────────────────────┐         ┌─────────────────────┐
│   InteractionTarget │         │  Modifier           │
│   (базовый класс)   │         │  (базовный класс)   │
├─────────────────────┤         ├─────────────────────┤
│ + hitTest()         │         │ + beforeDrag()      │
│ + handleDrag()      │         │ + afterDrag()       │
│ + handleHover()     │         │ + isActive()        │
│ + getCursor()       │         │ + getCursorMod()    │
└─────────────────────┘         └─────────────────────┘
          │                               │
    ┌─────┴─────┐                   ┌─────┴─────┐
    ↓           ↓                   ↓           ↓
 PointTarget  ...              EqualizeMod  ...
```

**Файлы:**

**Базовые классы:**
- `src-js/views-editor/src/pointer/interaction-target.js` — создать (базовый класс `InteractionTarget`)
- `src-js/views-editor/src/pointer/modifier-base.js` — создать (базовый класс `Modifier`)

**Targets (5 классов):**
- `src-js/views-editor/src/pointer/targets/point-target.js` — создать
- `src-js/views-editor/src/pointer/targets/skeleton-point-target.js` — создать
- `src-js/views-editor/src/pointer/targets/rib-point-target.js` — создать
- `src-js/views-editor/src/pointer/targets/tunni-target.js` — создать (regular + skeleton Tunni; импортирует математику из `@fontra/core/tunni-core.js`)
- `src-js/views-editor/src/pointer/targets/measure-target.js` — создать (Q-mode + Distance; импортирует математику из `@fontra/core/measure-math.js`)

**Modifiers (4 класса):**
- `src-js/views-editor/src/pointer/modifiers/equalize-modifier.js` — создать
- `src-js/views-editor/src/pointer/modifiers/quantize-modifier.js` — создать
- `src-js/views-editor/src/pointer/modifiers/snap-modifier.js` — создать
- `src-js/views-editor/src/pointer/modifiers/fixed-rib-modifier.js` — создать

**Оркестратор:**
- `src-js/views-editor/src/pointer/pointer-tool.js` — создать (~400-500 строк)
- `src-js/views-editor/src/edit-tools-pointer.js` — удалить (7497 строк)

**Важно:** Интеракция Q-measure **не выносится в отдельный файл** — это часть `measure-target.js` в составе Pointer-рефактора.

**Мокап базового интерфейса:****

```js
// src-js/views-editor/src/pointer/interaction-target.js
export class InteractionTarget {
  constructor(context) {
    this.context = context; // { sceneController, sceneModel, editor }
  }

  /**
   * Проверить, попадает ли событие в этот target
   * @param {Event} event — событие мыши
   * @returns {boolean} — true если hit
   */
  hitTest(event) {
    return false;
  }

  /**
   * Обработать drag сессию
   * @param {QueueIterator} eventStream — поток событий
   * @param {Event} initialEvent — начальное событие
   */
  async handleDrag(eventStream, initialEvent) {
    // Реализация в подклассах
  }

  /**
   * Обработать hover
   * @param {Event} event — событие мыши
   */
  handleHover(event) {
    // Опционально
  }

  /**
   * Получить курсор для этого target
   * @returns {string} — имя курсора
   */
  getCursor() {
    return "default";
  }
}

// src-js/views-editor/src/pointer/modifier-base.js
export class Modifier {
  constructor(context) {
    this.context = context;
  }

  isActive() {
    return false;
  }

  beforeDrag(target) {
    // Вызывается перед drag
  }

  afterDrag(target) {
    // Вызывается после drag
  }

  getCursorMod() {
    return null; // или имя курсора-модификатора
  }
}

// src-js/views-editor/src/pointer/pointer-tool.js
import { InteractionTarget } from "./interaction-target.js";
import { PointTarget } from "./targets/point-target.js";
// ... импорты всех targets
import { EqualizeModifier } from "./modifiers/equalize-modifier.js";
// ... импорты всех modifiers

export class PointerTool extends BaseTool {
  constructor(editor) {
    super(editor);
    const context = {
      sceneController: this.sceneController,
      sceneModel: this.sceneModel,
      editor: this.editor,
    };

    this.targets = [
      new PointTarget(context),
      new SkeletonPointTarget(context),
      new RibPointTarget(context),
      new TunniTarget(context),
      new MeasureTarget(context),
    ];

    this.modifiers = [];
    this._setupKeyListeners();
  }

  async handleDrag(eventStream, initialEvent) {
    const target = this.targets.find(t => t.hitTest(initialEvent));
    if (!target) return;

    // Применить модификаторы
    for (const mod of this.modifiers) {
      if (mod.isActive()) mod.beforeDrag(target);
    }

    await target.handleDrag(eventStream, initialEvent);

    for (const mod of this.modifiers) {
      if (mod.isActive()) mod.afterDrag(target);
    }
  }

  handleKeyDown(event) {
    // Добавить модификатор при нажатии клавиши
    if (eventMatchesActionShortCut(REALTIME_EQUALIZE_ACTION, event)) {
      if (!this.modifiers.some(m => m instanceof EqualizeModifier)) {
        this.modifiers.push(new EqualizeModifier(this.context));
      }
    }
  }

  handleKeyUp(event) {
    // Удалить модификатор при отпускании клавиши
    if (eventMatchesActionBaseKey(REALTIME_EQUALIZE_ACTION, event)) {
      this.modifiers = this.modifiers.filter(m => !(m instanceof EqualizeModifier));
    }
  }

  _setupKeyListeners() {
    // Подписка на keydown/keyup для модификаторов
  }
}
```

**Критерии приемки:**
- [ ] `edit-tools-pointer.js` разделён на модули
- [ ] Базовый класс `InteractionTarget` определён с методами `hitTest`, `handleDrag`, `handleHover`, `getCursor`
- [ ] Базовый класс `Modifier` определён с методами `beforeDrag`, `afterDrag`, `isActive`
- [ ] 5 классов target реализованы
- [ ] 4 класса modifier реализованы
- [ ] Модификаторы добавляются/удаляются динамически (при keydown/keyup)
- [ ] Размер `pointer-tool.js` ≤ 500 строк
- [ ] `PointerTool` делегирует target'ам через `hitTest` → `handleDrag`

---

### Шаг 16. Починить binding чекбоксов Tunni

**Статус:** ⬜ Оригинал+ (исправлено)

**Проблема:** Binding через `setTimeout` + индекс чекбокса хрупок.

**Решение:** Прямая привязка к `sceneSettingsController`.

**Файлы:**
- `src-js/views-editor/src/panel-transformation.js` — изменить

**Критерии приемки:**
- [ ] `setTimeout` удалён
- [ ] Чекбоксы привязаны к `sceneSettingsController.setItem()`
- [ ] Состояние сохраняется при переключении глифов

---

### Шаг 17. Вычистить `edit-tools-metrics.js` от no-op мусора

**Статус:** ⬜ Оригинал

**Проблема:** Активный путь содержит no-op метод + warn/log шум.

**Решение:** Удалить `_updateSkeletonDataForSidebearingChange` no-op и debug-функции.

**Файлы:**
- `src-js/views-editor/src/edit-tools-metrics.js` — изменить

**Функции к удалению:**
- `_updateSkeletonDataForSidebearingChange(...)` — no-op
- `_applyDeltaToSkeletonPoints(...)` — debug
- `_regenerateOutlineContoursFromSkeleton(...)` — мертвый код

**Критерии приемки:**
- [ ] No-op методы удалены
- [ ] Console noise удалён
- [ ] Изменение sidebearings работает как раньше

---

### Шаг 18. Локализация, naming, hotkey-consistency

**Статус:** ⬜ Оригинал+ (расширено)

**Проблема:** Недостающие i18n ключи и несогласованные имена.

**Решение:** Добавить ключи во все словари, удалить временные имена.

**Файлы:**
- `assets/lang/en.js` — добавить ключи
- `assets/lang/ru.js` — добавить ключи
- `assets/lang/de.js` — добавить ключи (если есть)

**Ключи для добавления:**
- `shortcuts.realtime.measure`: "Measure Mode (hold Q)"
- `shortcuts.realtime.measure-direct`: "Measure Direct Mode (hold Alt+Q)"
- `shortcuts.realtime.equalize`: "Equalize Handles (hold X)"
- `sidebar.transformation.tunni-distance`: "Tunni Distance"
- `sidebar.transformation.tunni-tension`: "Tunni Tension"
- `sidebar.transformation.tunni-angle`: "Tunni Angle"
- `undo.equalize-control-point-distances`: "Equalize Control Point Distances"
- `undo.quantize-segment-control-points`: "Quantize Segment Control Points"

**Критерии приемки:**
- [ ] Shortcuts UI показывает корректные названия
- [ ] Нет `undefined`/raw key string в разных языках

---

### Шаг 19. Политика Ctrl-modified mousedown в MouseTracker

**Статус:** ❌ **УДАЛЁН** — уже выполнен в codebase

**Причина удаления:** Аудит codebase от 23.02.2026 показал, что этот шаг уже выполнен:

```js
// src-js/fontra-core/src/mouse-tracker.js:44
handleMouseDown(event) {
  if (event.button === 2 /* || event.ctrlKey */) {  // ← ctrlKey check ЗАКОММЕНТИРОВАН
    return;
  }
  // ...
}
```

**Примечание:** Проверка `ctrlKey` уже удалена из `MouseTracker`, что позволяет `Ctrl+Shift+click` для Tunni equalize. Дополнительная фильтрация в `SceneController` не требуется.

---

### Шаг 20. Финальная зачистка deprecated путей

**Статус:** ⬜ Оригинал

**Проблема:** После миграции остаются адаптеры/реэкспорты.

**Решение:** Удалить deprecated wrappers, прогнать rg-поиск.

**Файлы:**
- Все файлы из предыдущих шагов

**Команды для проверки:**
```powershell
rg -n "calculateTunniPointz" src-js
rg -n "from \"@fontra/core/tunni-calculations.js\"" src-js/views-editor/src
rg -n "setTimeout\(\) => .*allCheckboxes\[0\]" src-js
```

**Критерии приемки:**
- [ ] Deprecated wrappers удалены
- [ ] Временные имена не найдены
- [ ] Полный baseline sweep пройден

---

### Шаг 21. Удалить debug-код и временные имена

**Статус:** ⬜ Новый

**Проблема:** В коде остались debug-сообщения и временные имена.

**Решение:** Удалить все debug-логи и временные имена.

**Файлы:**
- `src-js/views-editor/src/edit-tools-metrics.js` — удалить debug
- `src-js/fontra-core/src/distance-angle.js` — удалить `calculateTunniPointz`

**Список к удалению:**
- `console.log(`[SKELETON DEBUG] ...`)`
- `console.warn("SKELETON DEBUG: ...")`
- `export function calculateTunniPointz(...)`

**Критерии приемки:**
- [ ] `rg "SKELETON DEBUG"` не находит совпадений
- [ ] `rg "calculateTunniPointz"` не находит совпадений

---

## Матрица тестирования

### После Шага 00 (тесты)
- [ ] Все unit-тесты проходят на baseline

### После Шага 01 (baseline)
- [ ] Все сценарии описаны и проверены

### После Шага 02 (tunni-core.js)
- [ ] Прогнать ручные сценарии на 3 типах сегментов
- [ ] Regular Tunni работает на обычных контурах
- [ ] Skeleton Tunni работает на скелетных контурах
- [ ] Поведение в UI не изменилось

### После Шага 03 (measure-math.js)
- [ ] Distance-Angle визуализация работает как раньше
- [ ] Q-measure (Q-key hold) работает как раньше
- [ ] Математика измерений в одном файле

### После Шага 05 (visualization layers)
- [ ] Toggles всех слоев работают
- [ ] Порядок z-index не изменился

### После Шага 06 (helper фильтрации)
- [ ] Regular Tunni/measure не работают по generated contours
- [ ] На обычных контурах всё работает как раньше

### После Шага 08 (Measure state)
- [ ] Q-key lifecycle работает (keydown/keyup)
- [ ] Alt+Q toggle работает (direct/projected)
- [ ] Measure state сбрасывается при escape/tool switch

### После Шага 22 (Pointer рефактор)
- [ ] Pointer drag не мешает Tunni drag
- [ ] Selection работает после Tunni interaction
- [ ] X+drag regular handles работает
- [ ] X+arrows skeleton handles работает
- [ ] Модификаторы включаются/выключаются в процессе drag

### После Шага 09 (чекбоксы)
- [ ] Переключение чекбоксов стабильно работает

### После Шага 10 (i18n)
- [ ] Shortcuts UI показывает корректные названия

### После Шага 12 (baseline sweep)
- [ ] Полный regression test по матрице из Шага 01
- [ ] Стресс-кейс: skeleton + regular contours в одном глифе

---

## Итоговый чек-лист

- [ ] Шаг 00: Математические инварианты (ОПЦИОНАЛЬНО — если пишешь тесты)
- [ ] Шаг 01: Baseline зафиксирован
- [ ] Шаг 02: tunni-core.js создан (математика + адаптеры)
- [ ] Шаг 03: measure-math.js создан (консолидация Measure/Distance)
- [ ] Шаг 04: Tunni interactions переехали в Pointer targets
- [ ] Шаг 05: Visualization layers разнесены
- [ ] Шаг 06: Helper фильтрации создан
- [ ] Шаг 07: Pointer context введён
- [ ] Шаг 08: Measure state консолидирован в SceneModel
- [ ] Шаг 09: Чекбоксы Tunni привязаны
- [ ] Шаг 10: i18n аудит завершён
- [ ] Шаг 11: Debug-код удалён
- [ ] Шаг 12: Финальная зачистка пройдена
- [ ] Шаг 22: Pointer tool рефакторирован (Targets + Modifiers)

**Исключено:**
- ~~Шаг 19: Ctrl-modified логика~~ — уже выполнена в codebase
- ~~edit-tools-metrics.js~~ — это MetricsTool (sidebearings/kerning), не относится к рефактору

**Если Шаг 00 пропущен:**
- [ ] Шаг 01 усилен — детальная ручная матрица проверки
- [ ] Автор проверяет вручную после каждого шага

---

## Метрики успеха

| Метрика | До | После |
|---------|-----|-------|
| **Размер pointer файла** | 7497 строк | ~400-500 строк (pointer-tool.js) |
| **Количество классов** | 0 (монолит) | 2 базовых + 5 target + 4 modifier = 11 |
| **Unit-тесты математики** | 0 | ~20 тестов (опционально) |
| **Дублирование функций** | 3+ места (tunni-calculations, distance-angle, skeleton-tunni) | 1 файл (tunni-core.js) + 1 файл (measure-math.js) |
| **Модификаторы** | if/else везде | Динамическая композиция |
| **Tunni файлы** | 3 файла с дублями | 1 файл (tunni-core.js) + 1 target в Pointer |
| **Tunni interaction** | В core (tunni-calculations.js) | В views (tunni-target.js) |
| **Measure файлы** | Математика в distance-angle.js (1423 строки) | 1 файл (measure-math.js) + 1 target в Pointer |
| **Measure state** | Дублируется (Pointer + SceneModel) | Единый state в SceneModel |

---

## Рекомендация

**Порядок выполнения:**
1. Дни 1-2: Шаг 00 (опционально — тесты на инварианты), Шаг 01 (baseline)
2. Дни 3-4: Шаги 02, 03 (tunni-core.js + measure-math.js)
3. Дни 5-6: Шаги 05, 06 (визуализация + helper фильтрации)
4. Дни 7-8: Шаг 08 (Measure state консолидация)
5. Дни 9-13: Шаг 22 (Pointer рефактор) — **5 дней минимум**
6. Дни 14-15: Шаги 09-12 (параллельно: чекбоксы, i18n, debug clean, финализация)

**Итого: 15 дней**

**Важно про Tunni-рефактор (Шаги 02-04):**
- tunni-core.js — математика + адаптеры в одном файле (~500 строк)
- Адаптеры regular/skeleton разделены комментариями внутри файла
- Tunni interaction переезжает в pointer/targets/tunni-target.js (часть Шага 22)

**Важно про Measure-рефактор (Шаги 03, 08):**
- measure-math.js — математика измерений (distance, angle, tension) в одном файле
- Measure state консолидирован в SceneModel (единый источник истины)
- Q-measure interaction — часть measure-target.js (Шаг 22)
- **edit-tools-metrics.js НЕ трогать** — это MetricsTool (sidebearings/kerning)

**Важно про Шаг 00:**
- Если пишешь тесты → только на **математические инварианты**, не на реализацию
- 3-5 тестов достаточно: параллельные лучи, идемпотентность, расстояние > 0
- Если не пишешь → усиль Шаг 01 (детальная ручная матрица)

**Важно про ручную валидацию:**
- Автор знает правильное поведение → ручная проверка надёжнее тестов
- Визуальная проверка ловит UX-регрессии, которые тесты пропустят
- Проверяй после каждого шага по baseline-матрице (Шаг 01)

**Важно про Шаг 22:**
- Это самый большой и рискованный шаг
- Начни с прототипа `InteractionTarget` и одного target-класса
- Убедись, что архитектура работает, прежде чем рефакторить всё остальное
- +2 дня буфера обязательно
