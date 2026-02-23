# Критические исправления к плану Tunni + Metrics рефакторинга

## Статус документа
- **Версия:** 2.0 (переработанный порядок шагов)
- **Дата:** 21 февраля 2026
- **Статус:** Требуется утверждение перед началом рефакторинга
- **Связанный план:** `PLAN-tunni-metrics-refactor.md`

---

## Резюме

Этот документ описывает **критические исправления** к основному плану рефакторинга. Без этих исправлений риск тихих регрессий UX оценивается как **высокий**.

### Ключевые проблемы оригинального плана

| Проблема |Severity | Последствия |
|----------|---------|-------------|
| Отсутствие unit-тестов математики | Critical | Тихие изменения UX при рефакторинге |
| Дублирование state MeasureMode | High | Рассинхрон состояния, утечки памяти |
| Нарушение границ слоев в MouseTracker | Medium | Сложность тестирования,耦合ление |
| Дублирование helper фильтрации | Medium | Рассинхрон логики exclusion |
| Неполная локализация | Low | UI-строки без перевода |

---

## Порядок выполнения шагов

```
Шаг 00 (тесты)
    ↓
Шаг 22 (Pointer рефактор) ←──┐
    ↓                          │
Шаг 10 (Measure state) ────────┤ (новые target-классы
    ↓                          │  используют новый API)
Шаг 07 (Helper фильтрации) ────┘
    ↓
Шаг 19 (Ctrl-modified)
    ↓
Шаг 15 (Pointer-context — теперь часть архитектуры)
    ↓
Шаг 16, 18, 21 (параллельно, независимые)
```

---

## Шаг 00. Добавить unit-тесты для Tunni-математики (НОВЫЙ, ОБЯЗАТЕЛЬНЫЙ)

**Проблема:** Оригинал явно указывает: "Автотесты не добавляем". Это неприемлемо для рефакторинга математики.

**Решение:** Создать `test-common/test-tunni-geometry.js` до начала любого рефакторинга.

### Мокап кода

```js
// test-common/test-tunni-geometry.js
import { expect } from "chai";
import {
  calculateMidpointTunni,
  calculateTrueTunniPoint,
  calculateControlPointsFromTunni,
  calculateEqualizedControlPoints,
  areDistancesEqualized,
  calculateControlHandleDistance,
} from "../src-js/fontra-core/src/tunni-geometry.js";

describe("Tunni Geometry Tests", () => {
  describe("calculateTrueTunniPoint", () => {
    it("находит пересечение лучей для симметричного сегмента", () => {
      const segmentPoints = [
        { x: 0, y: 0 },      // start
        { x: 50, y: 0 },     // control1
        { x: 150, y: 0 },    // control2
        { x: 200, y: 0 },    // end
      ];
      const result = calculateTrueTunniPoint(segmentPoints);
      expect(result).to.deep.equal({ x: 100, y: 0 });
    });

    it("возвращает null для параллельных лучей", () => {
      const segmentPoints = [
        { x: 0, y: 0 },
        { x: 0, y: 50 },
        { x: 100, y: 50 },
        { x: 100, y: 0 },
      ];
      const result = calculateTrueTunniPoint(segmentPoints);
      expect(result).to.be.null;
    });
  });

  describe("calculateEqualizedControlPoints", () => {
    it("уравнивает расстояния для асимметричного сегмента", () => {
      const segmentPoints = [
        { x: 0, y: 0 },
        { x: 30, y: 0 },     // dist = 30
        { x: 170, y: 0 },    // dist = 30
        { x: 200, y: 0 },
      ];
      const result = calculateEqualizedControlPoints(segmentPoints);
      // Ожидаем: оба контрольных пункта на расстоянии 30 от on-curve
      expect(result[0].x).to.equal(30);
      expect(result[1].x).to.equal(170);
    });
  });

  describe("calculateControlPointsFromTunni", () => {
    it("корректно работает с useArithmeticMean", () => {
      const tunniPoint = { x: 100, y: 50 };
      const segmentPoints = [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 160, y: 0 },
        { x: 200, y: 0 },
      ];
      const result = calculateControlPointsFromTunni(tunniPoint, segmentPoints, false, true);
      // Оба расстояния должны быть средним арифметическим
      const dist1 = Math.hypot(result[0].x - 0, result[0].y - 0);
      const dist2 = Math.hypot(result[1].x - 200, result[1].y - 0);
      expect(dist1).to.be.closeTo(dist2, 0.01);
    });
  });
});
```

### Критерии приемки

- [ ] Все тесты проходят на текущем коде (baseline)
- [ ] Покрытие: все экспортируемые функции из `tunni-geometry.js`
- [ ] Edge cases: параллельные лучи, нулевые расстояния, floating-point tolerance

---

## Шаг 22 (НОВЫЙ). Объектно-ориентированный рефакторинг Pointer Tool

**Проблема оригинала:** `edit-tools-pointer.js` — 7497 строк монолитного кода с вложенными `if/else` для каждого типа объекта и модификатора.

**Решение:** Использовать **композицию + стратегию**: отдельные классы для типов объектов + отдельные классы для модификаторов.

**Почему здесь:** Это архитектурное изменение должно быть **первым** после тестов, потому что все последующие шаги (Measure state, Helper фильтрации) будут использоваться новыми target-классами.

### Архитектура

```
src-js/views-editor/src/pointer/
├── pointer-tool.js              # Основной класс (~400 строк)
├── interaction-target.js        # Базовый класс + интерфейс
├── targets/                     # Классы для типов объектов (5 файлов)
│   ├── point-target.js
│   ├── skeleton-point-target.js
│   ├── rib-point-target.js
│   ├── tunni-target.js
│   └── measure-target.js
└── modifiers/                   # Классы для модификаторов (4 файла)
    ├── equalize-modifier.js
    ├── quantize-modifier.js
    ├── snap-modifier.js
    └── fixed-rib-modifier.js
```

### Базовый класс InteractionTarget

```js
// src-js/views-editor/src/pointer/interaction-target.js

export class InteractionTarget {
  constructor(ctx) {
    this.ctx = ctx;
    this.modifiers = [];
    this.initialState = null;
  }

  // Переопределяется в подклассах
  get type() { return "unknown"; }

  // Hit-test: возвращает true, если точка попадает в объект
  hitTest(point, margin) {
    return false;
  }

  // Инициализация перед drag
  onDragStart(event) {
    this.initialState = this.saveState();
  }

  // Основной drag (переопределяется в подклассах)
  onDrag(event) {
    // Базовое поведение (если есть)
  }

  // Завершение drag
  onDragEnd(event) {
    this.modifiers = [];
  }

  // Применение модификаторов (вызывается из onDrag)
  applyModifiers(event) {
    for (const mod of this.modifiers) {
      mod.apply(this, event);
    }
  }

  // Добавление модификатора
  addModifier(mod) {
    if (!this.hasModifier(mod.constructor)) {
      this.modifiers.push(mod);
    }
  }

  // Проверка наличия модификатора
  hasModifier(ModifierClass) {
    return this.modifiers.some(m => m instanceof ModifierClass);
  }

  // Удаление модификатора
  removeModifier(ModifierClass) {
    this.modifiers = this.modifiers.filter(m => !(m instanceof ModifierClass));
  }

  // Сохранение состояния для rollback (переопределяется)
  saveState() {
    return {};
  }

  // Восстановление состояния (переопределяется)
  restoreState(state) {}

  // Курсор для этого типа объекта (переопределяется)
  getCursorStyle() {
    return "default";
  }

  // Поддерживает ли этот объект equalize (переопределяется)
  get supportsEqualize() {
    return false;
  }
}
```

### Пример: PointTarget

```js
// src-js/views-editor/src/pointer/targets/point-target.js
import { InteractionTarget } from "./interaction-target.js";

export class PointTarget extends InteractionTarget {
  get type() { return "point"; }

  hitTest(point, margin) {
    const path = this.ctx.getSceneModel().pathHitAtPoint(point, margin);
    return path?.segment ? false : !!path?.point;
  }

  onDragStart(event) {
    super.onDragStart(event);
    this.initialPoint = this.getSelectedPoint();
  }

  onDrag(event) {
    const delta = this.ctx.getDragDelta(event);
    const newPoint = {
      x: this.initialPoint.x + delta.x,
      y: this.initialPoint.y + delta.y,
    };
    this.updatePoint(newPoint);
    this.applyModifiers(event);
  }

  getCursorStyle() {
    return "move";
  }

  // Вспомогательные методы
  getSelectedPoint() {
    const selection = this.ctx.getSelection();
    // Логика получения первой выбранной точки
  }

  updatePoint(newPoint) {
    this.ctx.editGlyph((layerGlyphs) => {
      for (const layerGlyph of Object.values(layerGlyphs)) {
        const path = layerGlyph.path;
        path.setPointPosition(this.pointIndex, newPoint.x, newPoint.y);
      }
      return "Move Point";
    });
  }
}
```

### Пример: SkeletonPointTarget (наследование)

```js
// src-js/views-editor/src/pointer/targets/skeleton-point-target.js
import { PointTarget } from "./point-target.js";
import { createSkeletonEditBehavior } from "../../skeleton-edit-behavior.js";

export class SkeletonPointTarget extends PointTarget {
  get type() { return "skeleton-point"; }

  onDrag(event) {
    // Skeleton points двигаются не свободно, а вдоль direction vector
    const delta = this.ctx.getDragDelta(event);
    const projectedDelta = this.projectDelta(delta, this.directionVector);
    
    const behavior = createSkeletonEditBehavior(
      this.skeletonData,
      this.selection,
      "default"
    );
    
    for (const beh of behavior) {
      beh.applyDelta({ x: projectedDelta, y: 0 });
    }
    
    this.applyModifiers(event);
  }

  getCursorStyle() {
    return "ew-resize"; // Зависит от direction
  }

  get supportsEqualize() {
    return true; // Skeleton points поддерживают equalize
  }

  projectDelta(delta, direction) {
    return delta.x * direction.x + delta.y * direction.y;
  }
}
```

### Пример: Modifier (Equalize)

```js
// src-js/views-editor/src/pointer/modifiers/equalize-modifier.js

export class EqualizeModifier {
  apply(target, event) {
    if (!target.supportsEqualize) {
      return;
    }

    if (target.type === "skeleton-point") {
      this.applySkeletonEqualize(target);
    } else if (target.type === "point") {
      this.applyPathEqualize(target);
    }
  }

  applySkeletonEqualize(target) {
    const { segmentPoints } = target;
    const equalizedPoints = calculateSkeletonEqualizedControlPoints(segmentPoints);
    target.updateControlPoints(equalizedPoints);
  }

  applyPathEqualize(target) {
    const { segmentPoints } = target;
    const equalizedPoints = calculateEqualizedControlPoints(segmentPoints);
    target.updateControlPoints(equalizedPoints);
  }
}
```

### Pointer Tool как оркестратор

```js
// src-js/views-editor/src/pointer/pointer-tool.js
import { PointTarget } from "./targets/point-target.js";
import { SkeletonPointTarget } from "./targets/skeleton-point-target.js";
import { RibPointTarget } from "./targets/rib-point-target.js";
import { TunniTarget } from "./targets/tunni-target.js";
import { MeasureTarget } from "./targets/measure-target.js";
import { EqualizeModifier } from "./modifiers/equalize-modifier.js";
import { QuantizeModifier } from "./modifiers/quantize-modifier.js";
import { SnapModifier } from "./modifiers/snap-modifier.js";
import { FixedRibModifier } from "./modifiers/fixed-rib-modifier.js";

export class PointerTool extends BaseTool {
  constructor(editor) {
    super(editor);
    
    this.targets = [
      new TunniTarget(this.createContext()),
      new MeasureTarget(this.createContext()),
      new RibPointTarget(this.createContext()),
      new SkeletonPointTarget(this.createContext()),
      new PointTarget(this.createContext()),
    ];
  }

  async handleDrag(eventStream, initialEvent) {
    // Находим target через hit-test
    const target = this.findTarget(initialEvent);

    if (!target) {
      await this.handleDefaultDrag(eventStream, initialEvent);
      return;
    }

    // Инициализируем drag
    target.onDragStart(initialEvent);

    // Process drag events
    for await (const event of eventStream) {
      if (event.type === "mousemove") {
        // Проверяем модификаторы в каждом кадре
        this.updateModifiers(target, event);
        
        // Выполняем drag
        target.onDrag(event);
        
        // Обновляем курсор
        this.setCursor(target.getCursorStyle());
      }
    }

    // Завершаем drag
    target.onDragEnd(initialEvent);
  }

  findTarget(event) {
    const point = this.sceneController.localPoint(event);
    const margin = this.sceneController.mouseClickMargin;

    for (const target of this.targets) {
      if (target.hitTest(point, margin)) {
        return target;
      }
    }
    return null;
  }

  updateModifiers(target, event) {
    // Equalize: Alt+Shift или X
    if ((event.altKey && event.shiftKey) || this.equalizeMode) {
      target.addModifier(new EqualizeModifier());
    } else {
      target.removeModifier(EqualizeModifier);
    }

    // Quantize: Ctrl+Shift
    if (event.ctrlKey && event.shiftKey) {
      target.addModifier(new QuantizeModifier());
    } else {
      target.removeModifier(QuantizeModifier);
    }

    // Snap: Ctrl
    if (event.ctrlKey && !event.shiftKey) {
      target.addModifier(new SnapModifier());
    } else {
      target.removeModifier(SnapModifier);
    }

    // Fixed Rib: специальная горячая клавиша
    if (eventMatchesActionShortCut(REALTIME_FIXED_RIB_ACTION, event)) {
      target.addModifier(new FixedRibModifier());
    } else {
      target.removeModifier(FixedRibModifier);
    }
  }

  createContext() {
    return {
      getSceneModel: () => this.sceneModel,
      getSceneController: () => this.sceneController,
      getSelection: () => this.sceneModel.selection,
      setSelection: (selection) => { this.sceneModel.selection = selection; },
      editGlyph: async (editFunc, undoLabel) => {
        return await this.sceneController.editLayersAndRecordChanges(editFunc, undoLabel);
      },
      getDragDelta: (event) => {
        const current = this.sceneController.localPoint(event);
        const initial = this.sceneController.localPoint(this._initialEvent);
        return {
          x: current.x - initial.x,
          y: current.y - initial.y,
        };
      },
      requestRedraw: () => {
        this.sceneController.canvasController.requestUpdate();
      },
      setCursor: (cursor) => {
        this.canvasController.canvas.style.cursor = cursor;
      },
    };
  }
}
```

### Динамическая активация модификаторов

```js
// В процессе drag пользователь зажал Ctrl (snap)

for await (const event of eventStream) {
  if (event.type === "mousemove") {
    // Проверяем модификаторы в каждом кадре
    this.updateModifiers(target, event);
    
    // Если Ctrl зажат только что — добавится SnapModifier
    // Если Ctrl отпущен — удалится SnapModifier
    
    target.onDrag(event);
  }
}
```

### Критерии приемки

- [ ] `edit-tools-pointer.js` разделён на модули
- [ ] Базовый класс `InteractionTarget` определён
- [ ] 5 классов target реализованы
- [ ] 4 класса modifier реализованы
- [ ] Модификаторы добавляются/удаляются динамически в процессе drag
- [ ] Размер `pointer-tool.js` ≤ 500 строк
- [ ] Нет дублирования кода между target-классами

---

## Шаг 10 (REVISED). Единый Measure state API с инкапсуляцией

**Проблема оригинала:** Pointer напрямую пишет в `sceneModel.measureMode`, обходя централизованный API.

**Решение:** Использовать приватные поля и предоставить только методы.

**Почему здесь:** Новые target-классы из Шага 22 будут использовать этот API вместо прямого доступа к полям.

### Мокап кода

```js
// src-js/views-editor/src/scene-model.js

export class SceneModel {
  // ... существующие поля ...

  // Приватное состояние (недоступно извне напрямую)
  #measureState = {
    active: false,
    showDirect: false,
    hoverSegment: null,
    hoverRibPoint: null,
    hoverPoints: null,
    hoverHandle: null,
  };

  // Публичные методы для управления состоянием
  setMeasureState(patch) {
    Object.assign(this.#measureState, patch);
    this._notifyMeasureStateChange();
  }

  resetMeasureState() {
    this.#measureState = {
      active: false,
      showDirect: false,
      hoverSegment: null,
      hoverRibPoint: null,
      hoverPoints: null,
      hoverHandle: null,
    };
    this._notifyMeasureStateChange();
  }

  getMeasureState() {
    return { ...this.#measureState }; // Возвращаем копию
  }

  // Геттеры для отдельных полей (только чтение)
  get measureMode() { return this.#measureState.active; }
  get measureShowDirect() { return this.#measureState.showDirect; }
  get measureHoverSegment() { return this.#measureState.hoverSegment; }
  get measureHoverRibPoint() { return this.#measureState.hoverRibPoint; }
  get measureHoverPoints() { return this.#measureState.hoverPoints; }
  get measureHoverHandle() { return this.#measureState.hoverHandle; }

  _notifyMeasureStateChange() {
    // Уведомить visualization layers о необходимости перерисовки
  }
}
```

### Изменения в MeasureTarget

```js
// src-js/views-editor/src/pointer/targets/measure-target.js

export class MeasureTarget extends InteractionTarget {
  get type() { return "measure"; }

  onDragStart(event) {
    // НОВОЕ: используем централизованный API
    this.ctx.getSceneModel().setMeasureState({ active: true });
  }

  onDrag(event) {
    const segmentHit = this.findSegmentHit(event.point);
    const current = this.ctx.getSceneModel().getMeasureState();
    
    if (!this._segmentsEqual(segmentHit, current.hoverSegment)) {
      this.ctx.getSceneModel().setMeasureState({ hoverSegment: segmentHit });
    }
  }

  onDragEnd(event) {
    this.ctx.getSceneModel().resetMeasureState();
  }
}
```

### Критерии приемки

- [ ] Pointer больше не пишет напрямую в `sceneModel.measure*` поля
- [ ] Все 26 вхождений `measureMode`/`measureHoverSegment` обновлены
- [ ] Visualization layers читают состояние через геттеры
- [ ] MeasureTarget использует новый API

---

## Шаг 07 (REVISED). Переместить helper фильтрации в skeleton-contour-generator

**Проблема оригинала:** Функция дублируется в `tunni-calculations.js`.

**Решение:** Единый источник истины в core-модуле.

**Почему здесь:** Target-классы из Шага 22 будут использовать этот helper для исключения generated contours.

### Мокап кода

```js
// src-js/fontra-core/src/skeleton-contour-generator.js

// ДОБАВИТЬ экспорт:
export function getGeneratedContourIndices(layer) {
  const skeletonData = getSkeletonData(layer);
  return skeletonData?.generatedContourIndices || [];
}

export function getGeneratedContourIndexSet(positionedGlyph, editLayerName) {
  const layerName = editLayerName || positionedGlyph?.glyph?.layerName;
  const layer = positionedGlyph?.varGlyph?.glyph?.layers?.[layerName];
  return new Set(getGeneratedContourIndices(layer));
}
```

```js
// src-js/views-editor/src/pointer/targets/tunni-target.js

import { getGeneratedContourIndexSet } from "@fontra/core/skeleton-contour-generator.js";

export class TunniTarget extends InteractionTarget {
  hitTest(point, margin) {
    const positionedGlyph = this.ctx.getSceneModel().getSelectedPositionedGlyph();
    const generatedContourIndices = getGeneratedContourIndexSet(
      positionedGlyph,
      this.ctx.getSceneSettings().editLayerName
    );
    
    // Исключаем generated contours из hit-test
    for (const contourIndex of generatedContourIndices) {
      if (this.isPointInContour(point, contourIndex)) {
        return false;
      }
    }
    
    // ... остальная логика hit-test
  }
}
```

### Критерии приемки

- [ ] Функция экспортирована из `skeleton-contour-generator.js`
- [ ] Все импорты обновлены
- [ ] Локальная функция в `tunni-calculations.js` удалена
- [ ] Target-классы используют новый helper

---

## Шаг 19 (REVISED). Переместить ctrl-modified логику в SceneController

**Проблема оригинала:** `MouseTracker` знает о pointer-tool-specific логике.

**Решение:** `MouseTracker` всегда передаёт event, `SceneController` решает.

### Мокап кода

```js
// src-js/fontra-core/src/mouse-tracker.js

export class MouseTracker {
  constructor(options) {
    this._dragFunc = options.drag;
    this._hoverFunc = options.hover;
    this._eventStream = undefined;
    this._lastMouseDownEvent = undefined;
    this._getTapCount = getTapCounter();
    this._addEventListeners(options.element);
  }

  handleMouseDown(event) {
    // Удалить проверку ctrlKey здесь
    if (event.button === 2) {
      return; // Только контекстное меню
    }
    this._lastMouseDownEvent = event;
    window._fontraMouseTracker = this;
    this._eventStream = new QueueIterator(1, true);
    this._dragFunc(this._eventStream, event);
  }
}
```

```js
// src-js/views-editor/src/scene-controller.js

async handleMouseDrag(eventStream, event) {
  // Новая логика: проверять ctrl-modified здесь
  if (event.ctrlKey && !event.shiftKey) {
    // Ctrl без Shift — игнорировать
    return;
  }

  if (event.ctrlKey && event.shiftKey) {
    // Ctrl+Shift — разрешить только для pointer tool
    if (this.selectedTool?.identifier !== "pointer-tool") {
      return;
    }
  }

  await this.selectedTool?.handleDrag(eventStream, event);
}
```

### Критерии приемки

- [ ] `MouseTracker` не проверяет `event.ctrlKey`
- [ ] `SceneController.handleMouseDrag` фильтрует ctrl-modified события
- [ ] Ctrl+Shift+click на Tunni работает только в pointer tool
- [ ] Обычный Ctrl+click не начинает drag в других инструментах

---

## Шаг 15 (REVISED). Pointer-context как часть архитектуры

**Проблема оригинала:** Модули `pointer-*` будут耦合лены к внутренней структуре `SceneController`.

**Решение:** Явный интерфейс с методами.

**Почему здесь:** Теперь это часть архитектуры из Шага 22, а не отдельный шаг.

### Мокап кода

```js
// src-js/views-editor/src/pointer/pointer-context.js

export function createPointerContext(tool) {
  return {
    // === Selection ===
    getSelection: () => tool.sceneModel.selection,
    setSelection: (selection) => { tool.sceneModel.selection = selection; },
    clearSelection: () => { tool.sceneModel.selection = new Set(); },

    // === Editing ===
    editGlyph: async (editFunc, undoLabel) => {
      return await tool.sceneController.editLayersAndRecordChanges(editFunc, undoLabel);
    },

    // === Undo ===
    pushUndoRecord: (undoRecord) => {
      tool.sceneController.undoStack.pushUndoRecord(undoRecord);
    },

    // === Redraw ===
    requestRedraw: () => {
      tool.sceneController.canvasController.requestUpdate();
    },

    // === Coordinates ===
    toGlyphPoint: (event) => tool.sceneController.localPoint(event),
    toScreenPoint: (glyphPoint) => tool.sceneController.canvasController.glyphToScreenPoint(glyphPoint),

    // === Hit testing ===
    pathHitAtPoint: (point, margin) => tool.sceneModel.pathHitAtPoint(point, margin),
    glyphHitAtPoint: (point, margin) => tool.sceneModel.glyphHitAtPoint(point, margin),

    // === Settings ===
    getSceneSettings: () => tool.sceneModel.sceneSettings,
    getToolIdentifier: () => tool.identifier,
  };
}
```

### Критерии приемки

- [ ] Все target-классы импортируют контекст через `createPointerContext()`
- [ ] Нет прямого доступа к `tool.sceneController.sceneModel.selection`
- [ ] Контракт задокументирован в JSDoc

---

## Шаг 16 (REVISED). Привязать чекбоксы к sceneSettingsController

**Проблема оригинала:** Чекбоксы привязаны к локальному `transformParameters`, а не к глобальным `sceneSettings`.

**Решение:** Прямая привязка к `sceneSettingsController`.

### Критерии приемки

- [ ] Чекбоксы привязаны к `sceneSettingsController.setItem()`
- [ ] `setTimeout` удалён полностью
- [ ] `allCheckboxes[0]` больше не используется
- [ ] Состояние сохраняется при переключении глифов

---

## Шаг 18 (REVISED). Полный аудит i18n строк

**Проблема оригинала:** Добавляется только `shortcuts.realtime.measure-direct`.

**Решение:** Аудит всех строк в затронутых файлах.

### Критерии приемки

- [ ] Все undo labels используют `translate()`
- [ ] Все `titleKey` в visualization layers имеют ключи
- [ ] Нет сырых строк в UI-элементах
- [ ] Словари обновлены для en/ru/de

---

## Шаг 21 (НОВЫЙ). Удалить debug-код и временные имена

**Проблема:** В коде остались debug-сообщения и временные имена.

### Список к удалению

```js
// edit-tools-metrics.js
console.log(`[SKELETON DEBUG] _applyDeltaToSkeletonPoints called with deltaX=${deltaX}`);
console.warn("SKELETON DEBUG: ...");

// distance-angle.js
export function calculateTunniPointz(segmentPoints) { ... }

// visualization-layer-definitions.js
import { calculateTunniPoint as calculateTunniPointz, ... }
```

### Критерии приемки

- [ ] `rg "SKELETON DEBUG"` не находит совпадений
- [ ] `rg "calculateTunniPointz"` не находит совпадений
- [ ] `rg "console\.log.*Tunni"` не находит совпадений

---

## Матрица тестирования

### После Шага 00 (тесты)
- [ ] Все unit-тесты проходят на baseline

### После Шага 22 (Pointer рефактор)
- [ ] Pointer drag не мешает Tunni drag
- [ ] Selection работает после Tunni interaction
- [ ] X+drag regular handles работает
- [ ] X+arrows skeleton handles работает
- [ ] Модификаторы включаются/выключаются в процессе drag

### После Шага 10 (Measure state)
- [ ] Q-hold включает projected mode
- [ ] Alt+Q включает direct mode
- [ ] Отпускание клавиш очищает hover state
- [ ] Смена tool сбрасывает measure state

### После Шага 19 (ctrl-modified)
- [ ] Ctrl+Shift+click на Tunni работает в pointer tool
- [ ] Ctrl+click не начинает drag в pen tool
- [ ] Контекстное меню (правый клик) работает

---

## Итоговый чек-лист

- [ ] Шаг 00: Unit-тесты созданы и проходят
- [ ] Шаг 22: Pointer tool рефакторирован с использованием композиции
- [ ] Шаг 10: Measure state инкапсулирован
- [ ] Шаг 07: Helper перемещён в `skeleton-contour-generator.js`
- [ ] Шаг 19: Ctrl-modified логика перемещена
- [ ] Шаг 15: Pointer-context контракт определён
- [ ] Шаг 16: Чекбоксы привязаны к sceneSettings
- [ ] Шаг 18: i18n аудит завершён
- [ ] Шаг 21: Debug-код удалён

---

## Сравнение: до и после

| Метрика | До (оригинал) | После |
|---------|---------------|-------|
| **Размер pointer файла** | 7497 строк | ~400 строк (pointer-tool.js) |
| **Количество классов** | 0 (монолит) | 5 target + 4 modifier = 9 |
| **Добавление нового типа** | +200 строк в монолит | +1 файл (~100 строк) |
| **Добавление модификатора** | +if/else везде | +1 класс (~50 строк) |
| **Тестируемость** | Сложно (всё вместе) | Легко (каждый класс отдельно) |
| **Динамические модификаторы** | Не поддерживаются | Поддерживаются |

---

## Риски при игнорировании шагов

| Игнорируемое исправление | Вероятный исход |
|--------------------------|-----------------|
| Шаг 00 (тесты) | Тихие регрессии математики, обнаруженные пользователем |
| Шаг 22 (pointer refactor) | Pointer остаётся 7497 строк монолита, сложно добавлять новые типы |
| Шаг 10 (state) | Рассинхрон Q-mode после переключения tool |
| Шаг 07 (helper) | Generated contours иногда пропускаются |
| Шаг 19 (ctrl) | Случайные drags в pen/skeleton tools |
| Шаг 16 (checkbox) | Чекбоксы сбрасываются при reopen панели |
| Шаг 18 (i18n) | Сырые ключи в UI для не-English locale |
| Шаг 21 (debug) | Console spam в production |

---

## Рекомендация

**Не начинать рефакторинг** до:
1. Утверждения этого документа
2. Создания unit-тестов (Шаг 00)
3. Определения приоритетов: какие исправления обязательны, какие опциональны
