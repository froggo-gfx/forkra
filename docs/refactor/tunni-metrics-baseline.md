# Baseline сценариев для Tunni + Metrics/Q-режима Refactor

**Дата:** 23 февраля 2026  
**Назначение:** Ручная проверка UX после каждого шага рефакторинга  
**Объём:** 18 сценариев, ~15,000 строк кода затрагивается

---

## Легенда

| Поле | Значение |
|------|----------|
| **Инструмент** | Pointer Tool / Skeleton Tool / Metrics Tool |
| **Тип данных** | Regular Contours / Skeleton Contours / Rib Points |
| **Interaction** | Hover (наведение) / Drag (перетаскивание) / Click (клик) / KeyHold (удержание клавиши) |
| **Режим** | Projected (Q) / Direct (Alt+Q) / Equalize (X) / Quantize (Shift) |
| **Файлы** | Какие файлы затрагиваются |

---

## Сценарий 1: Q-key hold (Projected Mode) — Regular Contours

| Поле | Значение |
|------|----------|
| **Инструмент** | Pointer Tool |
| **Тип данных** | Regular Contours (кубические кривые) |
| **Interaction** | KeyHold + Hover |
| **Режим** | Projected (Q) |
| **Файлы** | `edit-tools-pointer.js:900-960`, `scene-model.js:68-74`, `visualization-layer-definitions.js:2299-2340` |

**Действия:**
1. Открыть глиф с кривыми (например, "o", "n", "s")
2. Выбрать Pointer Tool
3. Зажать `Q` (не кликать)
4. Навести на сегмент (между двумя on-curve точками)

**Ожидаемое поведение:**
- Появляются projected distance labels (dx, dy) между on-curve точками
- Label показывается перпендикулярно базовой линии через midpoint
- При движении мыши вдоль сегмента — label обновляется в реальном времени
- При отпускании `Q` — label исчезает
- Нет изменения состояния glyph (только визуализация)

**State изменения:**
```js
// scene-model.js
this.measureMode = true;
this.measureHoverSegment = { p1, p2, type: "segment" };
```

---

## Сценарий 2: Alt+Q hold (Direct Mode) — Regular Contours

| Поле | Значение |
|------|----------|
| **Инструмент** | Pointer Tool |
| **Тип данных** | Regular Contours (кубические кривые) |
| **Interaction** | KeyHold + Hover |
| **Режим** | Direct (Alt+Q) |
| **Файлы** | `edit-tools-pointer.js:900-960`, `distance-angle.js:70-100`, `visualization-layer-definitions.js:2320-2340` |

**Действия:**
1. Открыть глиф с кривыми
2. Выбрать Pointer Tool
3. Зажать `Alt+Q` (не кликать)
4. Навести на сегмент

**Ожидаемое поведение:**
- Появляется direct distance + angle badge
- Distance показывается как абсолютное значение (всегда положительное)
- Angle показывается в градусах (0-90°, от горизонтальной базовой линии)
- Badge позиционируется между точками
- При движении мыши — значения обновляются
- При отпускании `Alt+Q` — badge исчезает

**State изменения:**
```js
// scene-model.js
this.measureMode = true;
this.measureShowDirect = true;  // Alt модификатор
this.measureHoverSegment = { p1, p2, type: "segment" };
```

**Математика:**
```js
// distance-angle.js
const { distance, angle } = calculateDistanceAndAngle(p1, p2);
// angle всегда 0-90° через Math.abs() + нормализацию
```

---

## Сценарий 3: X-key hold (Equalize Handles) — Regular Contours

| Поле | Значение |
|------|----------|
| **Инструмент** | Pointer Tool |
| **Тип данных** | Regular Contours (кубические кривые) |
| **Interaction** | KeyHold + Drag |
| **Режим** | Equalize (X) |
| **Файлы** | `edit-tools-pointer.js:1480-1520`, `tunni-calculations.js:200-280` |

**Действия:**
1. Открыть глиф с кривой (две контрольные точки между on-curve)
2. Выбрать Pointer Tool
3. Зажать `X`
4. Кликнуть и тянуть одну контрольную точку (handle)

**Ожидаемое поведение:**
- При drag контрольной точки, вторая контрольная точка двигается симметрично
- Расстояния от on-curve точек до контрольных точек выравниваются (equalize)
- Направление контрольных точек сохраняется (только расстояние меняется)
- При отпускании `X` — equalize отключается, drag продолжается как обычный

**State изменения:**
```js
// edit-tools-pointer.js
this.equalizeActive = true;  // во время drag
```

**Математика:**
```js
// tunni-calculations.js
const equalized = calculateEqualizedControlPoints(segmentPoints);
// cp1.distance == cp2.distance
```

---

## Сценарий 4: Ctrl+Shift+click на Tunni Midpoint — Regular Contours

| Поле | Значение |
|------|----------|
| **Инструмент** | Pointer Tool |
| **Тип данных** | Regular Contours (кубические кривые) |
| **Interaction** | Click (с модификаторами) |
| **Режим** | Equalize + Quantize (Ctrl+Shift) |
| **Файлы** | `edit-tools-pointer.js:1520-1600`, `tunni-calculations.js:280-350` |

**Действия:**
1. Открыть глиф с кривой
2. Выбрать Pointer Tool
3. Зажать `Ctrl+Shift`
4. Кликнуть на midpoint между контрольными точками (Tunni point)

**Ожидаемое поведение:**
- Применяется equalize (расстояния выравниваются)
- Применяется quantize (углы квантуются к 0°, 45°, 90°)
- Контрольные точки перемещаются симметрично
- Undo записывается как одно действие

**State изменения:**
```js
// edit-tools-pointer.js
this.equalizeActive = true;
this.quantizeActive = true;
```

**Математика:**
```js
// tunni-calculations.js
const equalized = equalizeThenQuantizeSegmentControlPoints(segmentPoints);
// 1. Equalize: cp1.distance == cp2.distance
// 2. Quantize: angle округляется до ближайших 0/45/90°
```

---

## Сценарий 5: Skeleton Tunni Midpoint Drag — Skeleton Contours

| Поле | Значение |
|------|----------|
| **Инструмент** | Skeleton Tool |
| **Тип данных** | Skeleton Contours (скелетные кривые) |
| **Interaction** | Drag |
| **Режим** | Tension Edit |
| **Файлы** | `skeleton-tunni-calculations.js:100-150`, `edit-tools-skeleton.js:400-500` |

**Действия:**
1. Открыть skeleton glyph (например, "o" в skeleton режиме)
2. Выбрать Skeleton Tool
3. Кликнуть на midpoint между контрольными точками skeleton сегмента
4. Тянуть midpoint перпендикулярно базовой линии

**Ожидаемое поведение:**
- Midpoint двигается свободно
- При drag меняется tension кривой (кривизна)
- On-curve точки остаются на месте
- Контрольные точки двигаются вдоль лучей от on-curve точек

**State изменения:**
```js
// skeleton-tunni-calculations.js
const tunniPoint = calculateSkeletonTunniPoint(segment);  // midpoint
// drag изменяет tension, не on-curve позиции
```

---

## Сценарий 6: Skeleton True Tunni Point Drag — Skeleton Contours

| Поле | Значение |
|------|----------|
| **Инструмент** | Skeleton Tool |
| **Тип данных** | Skeleton Contours (скелетные кривые) |
| **Interaction** | Drag |
| **Режим** | On-Curve Move (True Tunni) |
| **Файлы** | `skeleton-tunni-calculations.js:150-220`, `edit-tools-skeleton.js:500-600` |

**Действия:**
1. Открыть skeleton glyph
2. Выбрать Skeleton Tool
3. Кликнуть на true Tunni point (пересечение лучей от контрольных точек)
4. Тянуть true point

**Ожидаемое поведение:**
- True point двигается вдоль лучей (от on-curve к контрольным точкам)
- On-curve точки двигаются вдоль проекционных линий
- Tension сохраняется (пропорции контрольных точек)
- Визуализация лучей обновляется в реальном времени

**State изменения:**
```js
// skeleton-tunni-calculations.js
const trueTunniPoint = calculateSkeletonTrueTunniPoint(segment);
// drag изменяет on-curve позиции вдоль лучей
```

**Математика:**
```js
// intersect(p1, ray1End, p2, ray2End)
// p1 = startPoint, ray1End = cp1
// p2 = endPoint, ray2End = cp2
```

---

## Сценарий 7: Exclusion of Skeleton-Generated Contours

| Поле | Значение |
|------|----------|
| **Инструмент** | Pointer Tool |
| **Тип данных** | Regular Contours + Skeleton Generated Contours |
| **Interaction** | Hover |
| **Режим** | Visualization Filter |
| **Файлы** | `tunni-calculations.js:35-40`, `skeleton-contour-generator.js:200-250` |

**Действия:**
1. Открыть glyph с skeleton + generated outlines (например, "o" с skeleton)
2. Переключиться на Regular Tunni visualization layer
3. Кликнуть/навести на skeleton сегмент
4. Кликнуть/навести на regular contour сегмент

**Ожидаемое поведение:**
- Regular Tunni visualization НЕ показывается на skeleton-generated contours
- Regular Tunni показывается только на обычных (ручных) контурах
- Skeleton Tunni показывается только на skeleton контурах
- Нет дублирования visualization

**State изменения:**
```js
// tunni-calculations.js
const generatedIndices = getSkeletonGeneratedContourIndexSet(positionedGlyph);
if (contourIndex in generatedIndices) {
  return;  // исключить из regular Tunni
}
```

---

## Сценарий 8: Tunni Distance/Tension/Angle Toggles

| Поле | Значение |
|------|----------|
| **Инструмент** | Pointer Tool |
| **Тип данных** | Regular Contours |
| **Interaction** | Click (checkbox toggle) |
| **Режим** | Visualization Toggle |
| **Файлы** | `panel-transformation.js:700-880`, `visualization-layer-definitions.js:2200-2280` |

**Действия:**
1. Открыть глиф с кривыми
2. Открыть Transformation Panel (sidebar)
3. Переключать чекбоксы:
   - Tunni Distance
   - Tunni Tension
   - Tunni Angle
4. Переключить глиф на другой
5. Вернуться на исходный глиф

**Ожидаемое поведение:**
- При включении чекбокса — visualization появляется немедленно
- При выключении — исчезает немедленно
- Состояние сохраняется при переключении глифов
- Нет console warnings/errors
- Нет `setTimeout` задержек

**State изменения:**
```js
// panel-transformation.js
// ✅ Правильно:
this.sceneController.sceneSettingsController.setItem("showTunniDistance", event.target.checked);

// ❌ Неправильно (baseline bug):
setTimeout(() => {
  this.allCheckboxes[0].checked = ...;
}, 0);
```

---

## Сценарий 9: Measure Hover Rib Point — Skeleton Rib Points

| Поле | Значение |
|------|----------|
| **Инструмент** | Pointer Tool |
| **Тип данных** | Skeleton Rib Points |
| **Interaction** | KeyHold + Hover |
| **Режим** | Projected (Q) |
| **Файлы** | `edit-tools-pointer.js:1040-1060`, `scene-model.js:72` |

**Действия:**
1. Открыть skeleton glyph с rib points (например, "o" с толщиной)
2. Выбрать Pointer Tool
3. Зажать `Q`
4. Навести на rib point (точка толщины на скелете)

**Ожидаемое поведение:**
- Показывается distance badge для rib point width
- Показывается left width отдельно
- Показывается right width отдельно
- Показывается total width
- При движении мыши — значения обновляются

**State изменения:**
```js
// scene-model.js
this.measureHoverRibPoint = {
  x, y,           // позиция rib point
  width,          // общая толщина
  leftWidth,      // толщина слева
  rightWidth      // толщина справа
};
```

---

## Сценарий 10: Measure Hover Handle (Tension) — Regular Contours

| Поле | Значение |
|------|----------|
| **Инструмент** | Pointer Tool |
| **Тип данных** | Regular Contours (контрольные точки) |
| **Interaction** | KeyHold + Hover |
| **Режим** | Projected (Q) + Tension |
| **Файлы** | `edit-tools-pointer.js:1060-1080`, `distance-angle.js:400-450`, `tunni-calculations.js:100-150` |

**Действия:**
1. Открыть глиф с кривой
2. Выбрать Pointer Tool
3. Зажать `Q`
4. Навести на контрольную точку (handle)

**Ожидаемое поведение:**
- Показывается tension badge
- Tension вычисляется через Tunni point (midpoint или true intersection)
- Tension = расстояние от контрольной точки до Tunni point
- При движении мыши — значение обновляется

**State изменения:**
```js
// scene-model.js
this.measureHoverHandle = {
  p1, p2,              // контрольные точки
  type: "handle",
  tensionContext: {    // для вычисления tension
    tunniPoint,
    cp1, cp2
  }
};
```

**Математика:**
```js
// distance-angle.js
const tension = calculateHandleMeasureTension(measureHoverHandle);
// tension = distance(cp1, tunniPoint) + distance(cp2, tunniPoint)
```

---

## Сценарий 11: Measure Hover Selection Points — Regular Contours

| Поле | Значение |
|------|----------|
| **Инструмент** | Pointer Tool |
| **Тип данных** | Regular Contours (выбранные точки) |
| **Interaction** | KeyHold + Hover + Selection |
| **Режим** | Projected (Q) |
| **Файлы** | `edit-tools-pointer.js:1090-1100`, `scene-model.js:73` |

**Действия:**
1. Открыть глиф с кривыми
2. Выбрать Pointer Tool
3. Зажать `Q`
4. Выбрать две точки (Shift+click или drag selection)

**Ожидаемое поведение:**
- Показывается distance между выбранными точками
- Показывается angle между точками
- Показывается dx/dy (проекции)
- При движении мыши — значения обновляются

**State изменения:**
```js
// scene-model.js
this.measureHoverPoints = {
  p1, p2,            // выбранные точки
  type: "selection"
};
```

---

## Сценарий 12: Measure State Reset on Escape

| Поле | Значение |
|------|----------|
| **Инструмент** | Pointer Tool |
| **Тип данных** | Все типы |
| **Interaction** | KeyHold + Escape |
| **Режим** | State Reset |
| **Файлы** | `edit-tools-pointer.js:960-970`, `scene-model.js:68-74` |

**Действия:**
1. Открыть глиф с кривыми
2. Выбрать Pointer Tool
3. Зажать `Q`
4. Навести на сегмент (появляется measure overlay)
5. Нажать `Escape`

**Ожидаемое поведение:**
- Measure overlay исчезает немедленно
- Measure state полностью сбрасывается
- При повторном зажатии `Q` — measure появляется снова с чистого state

**State изменения:**
```js
// scene-model.js
this.measureMode = false;
this.measureHoverSegment = null;
this.measureHoverRibPoint = null;
this.measureHoverPoints = null;
this.measureHoverHandle = null;
```

---

## Сценарий 13: Measure State Reset on Tool Switch

| Поле | Значение |
|------|----------|
| **Инструмент** | Pointer Tool → Другой инструмент |
| **Тип данных** | Все типы |
| **Interaction** | Tool Switch |
| **Режим** | State Reset |
| **Файлы** | `edit-tools-pointer.js:7160-7175`, `scene-model.js:68-74` |

**Действия:**
1. Открыть глиф с кривыми
2. Выбрать Pointer Tool
3. Зажать `Q`
4. Навести на сегмент
5. Переключиться на другой инструмент (например, Pen Tool)

**Ожидаемое поведение:**
- Measure overlay исчезает немедленно
- Measure state полностью сбрасывается
- При возврате на Pointer Tool — measure state чистый

**State изменения:**
```js
// edit-tools-pointer.js (при смене инструмента)
this.measureMode = false;
this.sceneModel.measureMode = false;
this.sceneModel.measureHoverSegment = null;
this.sceneModel.measureHoverRibPoint = null;
this.sceneModel.measureHoverPoints = null;
this.sceneModel.measureHoverHandle = null;
```

---

## Сценарий 14: Pointer Drag не мешает Tunni Drag

| Поле | Значение |
|------|----------|
| **Инструмент** | Pointer Tool |
| **Тип данных** | Regular Contours (точки + Tunni points) |
| **Interaction** | Drag (разные типы) |
| **Режим** | Interaction Priority |
| **Файлы** | `edit-tools-pointer.js:1000-1100`, `tunni-calculations.js:300-400` |

**Действия:**
1. Открыть глиф с кривыми
2. Выбрать Pointer Tool
3. Кликнуть и тянуть обычную точку (не контрольную) — Pointer drag
4. Отпустить
5. Кликнуть и тянуть Tunni midpoint — Tunni drag

**Ожидаемое поведение:**
- Обычная точка двигается (selection drag)
- Tunni midpoint двигается (tension edit)
- Нет конфликта между Pointer и Tunni interactions
- Hit-test корректно определяет приоритет (Tunni > Point)

**State изменения:**
```js
// edit-tools-pointer.js
// Hit-test порядок: Tunni > Skeleton Point > Rib Point > Point
const target = hitTestLayers(event);
if (target.type === "tunni") {
  handleTunniDrag();
} else if (target.type === "point") {
  handlePointDrag();
}
```

---

## Сценарий 15: Selection работает после Tunni Interaction

| Поле | Значение |
|------|----------|
| **Инструмент** | Pointer Tool |
| **Тип данных** | Regular Contours |
| **Interaction** | Click (после Tunni drag) |
| **Режим** | Selection после Tunni |
| **Файлы** | `edit-tools-pointer.js:1100-1200`, `tunni-calculations.js:400-450` |

**Действия:**
1. Открыть глиф с кривыми
2. Выбрать Pointer Tool
3. Кликнуть на Tunni midpoint
4. Тянуть (изменить tension)
5. Отпустить
6. Кликнуть на контрольную точку

**Ожидаемое поведение:**
- Контрольная точка выделяется (selection работает)
- Нет залипшего Tunni state после interaction
- Нет конфликта между Tunni и Selection state

**State изменения:**
```js
// edit-tools-pointer.js (после Tunni drag)
this.tunniDragActive = false;
this.sceneModel.selection = new Set([pointIndex]);  // selection работает
```

---

## Сценарий 16: X+Drag Regular Handles

| Поле | Значение |
|------|----------|
| **Инструмент** | Pointer Tool |
| **Тип данных** | Regular Contours (контрольные точки) |
| **Interaction** | KeyHold + Drag |
| **Режим** | Equalize (X) |
| **Файлы** | `edit-tools-pointer.js:1480-1550`, `tunni-calculations.js:200-280` |

**Действия:**
1. Открыть глиф с кривой (две контрольные точки)
2. Выбрать Pointer Tool
3. Зажать `X`
4. Кликнуть и тянуть контрольную точку

**Ожидаемое поведение:**
- Контрольная точка двигается
- Вторая контрольная точка двигается симметрично
- Расстояния выравниваются (equalize)
- При отпускании `X` — equalize отключается, drag продолжается как обычный

**State изменения:**
```js
// edit-tools-pointer.js
this.equalizeActive = true;  // во время X+drag
```

**Математика:**
```js
// tunni-calculations.js
const equalized = calculateEqualizedControlPoints(segmentPoints);
// cp1.distance == cp2.distance
// cp1.angle == cp2.angle (сохраняется)
```

---

## Сценарий 17: X+Arrows Skeleton Handles

| Поле | Значение |
|------|----------|
| **Инструмент** | Skeleton Tool |
| **Тип данных** | Skeleton Contours (контрольные точки) |
| **Interaction** | KeyHold + Arrow Key |
| **Режим** | Equalize (X) + Nudge |
| **Файлы** | `edit-tools-skeleton.js:600-700`, `skeleton-tunni-calculations.js:220-280` |

**Действия:**
1. Открыть skeleton glyph
2. Выбрать Skeleton Tool
3. Выбрать контрольную точку
4. Зажать `X`
5. Нажать стрелку (arrow key: ←↑→↓)

**Ожидаемое поведение:**
- Контрольная точка двигается на фиксированный delta (1px или 10px с Shift)
- Вторая контрольная точка двигается симметрично (equalize)
- Расстояния выравниваются
- При отпускании `X` — equalize отключается

**State изменения:**
```js
// edit-tools-skeleton.js
this.equalizeActive = true;  // во время X+arrows
```

**Математика:**
```js
// skeleton-tunni-calculations.js
const equalized = calculateSkeletonEqualizedControlPoints(segment);
// cp1.distance == cp2.distance
```

---

## Сценарий 18: Модификаторы включаются/выключаются в процессе Drag

| Поле | Значение |
|------|----------|
| **Инструмент** | Pointer Tool |
| **Тип данных** | Regular Contours |
| **Interaction** | Drag + KeyHold (в процессе) |
| **Режим** | Dynamic Modifier |
| **Файлы** | `edit-tools-pointer.js:900-960`, `mouse-tracker.js:18-20` |

**Действия:**
1. Открыть глиф с кривой
2. Выбрать Pointer Tool
3. Начать drag контрольной точки (без модификаторов)
4. В процессе drag зажать `X` (equalize)
5. В процессе drag отпустить `X`
6. Отпустить drag

**Ожидаемое поведение:**
- При нажатии `X` — включается equalize (вторая контрольная точка двигается симметрично)
- При отпускании `X` — equalize выключается (вторая контрольная точка остаётся на месте)
- Drag продолжается без прерывания
- Нет скачков или телепортации точек

**State изменения:**
```js
// edit-tools-pointer.js (во время drag)
handleKeyDown(event) {
  if (eventMatchesActionShortCut(REALTIME_EQUALIZE_ACTION, event)) {
    this.equalizeActive = true;  // включается в процессе drag
  }
}

handleKeyUp(event) {
  if (eventMatchesActionBaseKey(REALTIME_EQUALIZE_ACTION, event)) {
    this.equalizeActive = false;  // выключается в процессе drag
  }
}
```

---

## Сводная таблица сценариев

| № | Инструмент | Тип данных | Interaction | Режим | Файлы |
|---|------------|------------|-------------|-------|-------|
| 1 | Pointer | Regular Contours | KeyHold + Hover | Projected (Q) | `edit-tools-pointer.js`, `scene-model.js`, `visualization-layer-definitions.js` |
| 2 | Pointer | Regular Contours | KeyHold + Hover | Direct (Alt+Q) | `edit-tools-pointer.js`, `distance-angle.js` |
| 3 | Pointer | Regular Contours | KeyHold + Drag | Equalize (X) | `edit-tools-pointer.js`, `tunni-calculations.js` |
| 4 | Pointer | Regular Contours | Click (модификаторы) | Equalize+Quantize | `edit-tools-pointer.js`, `tunni-calculations.js` |
| 5 | Skeleton | Skeleton Contours | Drag | Tension Edit | `skeleton-tunni-calculations.js`, `edit-tools-skeleton.js` |
| 6 | Skeleton | Skeleton Contours | Drag | On-Curve Move | `skeleton-tunni-calculations.js`, `edit-tools-skeleton.js` |
| 7 | Pointer | Regular + Generated | Hover | Visualization Filter | `tunni-calculations.js`, `skeleton-contour-generator.js` |
| 8 | Pointer | Regular Contours | Click (checkbox) | Visualization Toggle | `panel-transformation.js`, `visualization-layer-definitions.js` |
| 9 | Pointer | Skeleton Rib Points | KeyHold + Hover | Projected (Q) | `edit-tools-pointer.js`, `scene-model.js` |
| 10 | Pointer | Regular Handles | KeyHold + Hover | Tension | `edit-tools-pointer.js`, `distance-angle.js`, `tunni-calculations.js` |
| 11 | Pointer | Selected Points | KeyHold + Hover + Selection | Projected (Q) | `edit-tools-pointer.js`, `scene-model.js` |
| 12 | Pointer | Все типы | KeyHold + Escape | State Reset | `edit-tools-pointer.js`, `scene-model.js` |
| 13 | Pointer → Другой | Все типы | Tool Switch | State Reset | `edit-tools-pointer.js`, `scene-model.js` |
| 14 | Pointer | Points + Tunni | Drag (разные типы) | Interaction Priority | `edit-tools-pointer.js`, `tunni-calculations.js` |
| 15 | Pointer | Regular Contours | Click (после Tunni) | Selection после Tunni | `edit-tools-pointer.js`, `tunni-calculations.js` |
| 16 | Pointer | Regular Handles | KeyHold + Drag | Equalize (X) | `edit-tools-pointer.js`, `tunni-calculations.js` |
| 17 | Skeleton | Skeleton Handles | KeyHold + Arrow | Equalize + Nudge | `edit-tools-skeleton.js`, `skeleton-tunni-calculations.js` |
| 18 | Pointer | Regular Contours | Drag + KeyHold (в процессе) | Dynamic Modifier | `edit-tools-pointer.js`, `mouse-tracker.js` |

---

## Чек-лист для проверки

После каждого шага рефакторинга выполнить **все 18 сценариев**:

- [ ] Сценарий 1: Q hold (projected) — Regular Contours
- [ ] Сценарий 2: Alt+Q hold (direct) — Regular Contours
- [ ] Сценарий 3: X hold (equalize) — Regular Contours
- [ ] Сценарий 4: Ctrl+Shift+click (equalize+quantize) — Regular Contours
- [ ] Сценарий 5: Skeleton Tunni midpoint drag — Skeleton Contours
- [ ] Сценарий 6: Skeleton True Tunni drag — Skeleton Contours
- [ ] Сценарий 7: Exclusion of generated contours — Regular + Generated
- [ ] Сценарий 8: Tunni visualization toggles — Regular Contours
- [ ] Сценарий 9: Measure hover rib point — Skeleton Rib Points
- [ ] Сценарий 10: Measure hover handle (tension) — Regular Handles
- [ ] Сценарий 11: Measure hover selection points — Selected Points
- [ ] Сценарий 12: Measure state reset on escape — Все типы
- [ ] Сценарий 13: Measure state reset on tool switch — Все типы
- [ ] Сценарий 14: Pointer drag не мешает Tunni drag — Points + Tunni
- [ ] Сценарий 15: Selection работает после Tunni interaction — Regular Contours
- [ ] Сценарий 16: X+drag regular handles — Regular Handles
- [ ] Сценарий 17: X+arrows skeleton handles — Skeleton Handles
- [ ] Сценарий 18: Модификаторы в процессе drag — Regular Contours

---

## Известные проблемы (baseline)

На момент фиксации (23 февраля 2026):

| Проблема | Файл | Строки | Описание |
|----------|------|--------|----------|
| **Дублирование state** | `edit-tools-pointer.js`, `scene-model.js` | 879, 68-74 | `measureMode` дублируется в двух местах |
| **Дублирование математики** | `tunni-calculations.js`, `distance-angle.js`, `skeleton-tunni-calculations.js` | 1507, 1423, 426 | distance/angle/tension формулы в 3 файлах |
| **Хрупкий binding чекбоксов** | `panel-transformation.js` | 855-876 | используется `setTimeout` + индекс массива |
| **Монолитный Pointer** | `edit-tools-pointer.js` | 7497 | весь Pointer Tool в одном файле |
| **Debug-код** | `skeleton-tunni-calculations.js`, `edit-tools-metrics.js` | разбросано | `SKELETON DEBUG` console.log/warn |
| **Временные имена** | `distance-angle.js` | 400-450 | `calculateTunniPointz` (с тремя z) |

---

## Файлы baseline

| Файл | Строк | Тип | Описание |
|------|-------|-----|----------|
| `edit-tools-pointer.js` | 7497 | views-editor | Pointer Tool (монолит) |
| `tunni-calculations.js` | 1507 | fontra-core | Regular Tunni математика + interaction |
| `skeleton-tunni-calculations.js` | 426 | views-editor | Skeleton Tunni математика |
| `distance-angle.js` | 1423 | fontra-core | Distance/Angle математика + визуализация |
| `scene-model.js` | 1907 | views-editor | Scene Model + Measure state |
| `panel-transformation.js` | ~900 | views-editor | Transformation Panel + Tunni checkboxes |
| `visualization-layer-definitions.js` | ~2500 | views-editor | Visualization layers |
| `edit-tools-metrics.js` | 1604 | views-editor | Metrics Tool (sidebearings/kerning) — **НЕ трогать** |
| `skeleton-contour-generator.js` | ~800 | fontra-core | Skeleton контуры + generated contours |
| `edit-tools-skeleton.js` | ~2000 | views-editor | Skeleton Tool |

**Итого:** ~18,000 строк в codebase, ~15,000 строк затрагивается рефактором

---

## Матрица покрытия

| Домен | Файлы | Сценарии |
|-------|-------|----------|
| **Tunni (Regular)** | `tunni-calculations.js` | 1, 2, 3, 4, 7, 8, 10, 14, 15, 16 |
| **Tunni (Skeleton)** | `skeleton-tunni-calculations.js` | 5, 6, 7, 17 |
| **Measure (Q-mode)** | `edit-tools-pointer.js`, `scene-model.js` | 1, 2, 9, 10, 11, 12, 13 |
| **Distance-Angle** | `distance-angle.js` | 2, 10 |
| **Pointer Interaction** | `edit-tools-pointer.js` | 3, 4, 14, 15, 16, 18 |
| **Skeleton Interaction** | `edit-tools-skeleton.js` | 5, 6, 17 |
| **Visualization** | `visualization-layer-definitions.js`, `panel-transformation.js` | 7, 8 |
| **State Management** | `scene-model.js`, `edit-tools-pointer.js` | 12, 13 |
