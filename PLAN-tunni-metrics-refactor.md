# Рефактор Tunni + Metrics/Q-режима (полный, инкрементальный, для передачи другому исполнителю)

## Краткое summary
Цель: привести `Tunni`, `Distance/Manhattan/Q-measure`, `Pointer` и связанный UI к предсказуемой модульной архитектуре без изменения UX, кроме явных багфиксов математики.

Режим исполнения (зафиксировано):
UX freeze; математику менять можно только при доказанном баге; полный module split сразу; сопутствующий техдолг закрываем в этом же плане.

Сравнение с `main` уже учтено: ключевые проблемные зоны находятся в:
- `src-js/fontra-core/src/distance-angle.js`
- `src-js/fontra-core/src/tunni-calculations.js`
- `src-js/views-editor/src/edit-tools-pointer.js`
- `src-js/views-editor/src/visualization-layer-definitions.js`
- `src-js/views-editor/src/panel-transformation.js`
- `src-js/views-editor/src/edit-tools-metrics.js`
- `src-js/fontra-core/src/mouse-tracker.js`
- `src-js/views-editor/src/skeleton-tunni-calculations.js`

## Публичные интерфейсы/типы, которые меняем
1. Новый модуль геометрии регулярного Tunni: `src-js/fontra-core/src/tunni-geometry.js`.
2. `src-js/fontra-core/src/tunni-calculations.js` перестает быть смешанным комбайном; временно оставляет только совместимые реэкспорты/тонкие адаптеры, затем очищается.
3. `src-js/fontra-core/src/distance-angle.js` остается только про Measure (distance/angle/manhattan/off-curve), без дублированной Tunni-геометрии.
4. Новый набор модулей pointer-доменов в `src-js/views-editor/src/pointer/`:
   - `pointer-measure-mode.js`
   - `pointer-tunni-regular.js`
   - `pointer-tunni-skeleton.js`
   - `pointer-equalize-regular.js`
   - `pointer-equalize-skeleton.js`
   - `pointer-context.js` (вспомогательный контракт зависимостей)
5. Новый единый state-контур Measure в `SceneModel` (методы управления состоянием вместо рассыпанных прямых присваиваний).
6. Визуализации Tunni/Measure выносятся из `visualization-layer-definitions.js` в отдельные файлы регистрации.
7. В `MouseTracker` вводится явная политика ctrl-modified mouse down (точечное разрешение вместо глобального побочного эффекта).

## Шаг 01. Зафиксировать рефактор-контракт и анти-регресс baseline
Общая проблема: слишком высокий риск тихого изменения UX при большом распиле.

Аспект шага: зафиксировать, что считается неизмененным поведением, чтобы каждое следующее изменение верифицировалось одинаково.

Решение: добавить документ baseline-сценариев и чек-лист ручной проверки (до/после каждого шага).

Мокап кода:
```md
# docs/refactor/tunni-metrics-baseline.md
- Q hold: projected dx/dy labels
- Alt+Q hold: direct dist+angle
- X hold: equalize drag for regular handles
- Ctrl+Shift+click on Tunni midpoint: equalize+quantize
- Skeleton Tunni midpoint/true-point drag behavior
- Exclusion of skeleton-generated contours in regular Tunni layers
```

Что тестировать: вручную один раз прогнать весь baseline на текущем состоянии и сохранить результаты (видео/скрин+текст), чтобы дальше сравнивать строго с ним.

## Шаг 02. Ввести ядро регулярной Tunni-геометрии (pure math)
Общая проблема: дубли формул в двух файлах ядра (`distance-angle.js` и `tunni-calculations.js`).

Аспект шага: единый источник истины для регулярной кубической Tunni-математики.

Решение: создать `src-js/fontra-core/src/tunni-geometry.js` и перенести туда только чистые функции (без canvas, без scene, без hit-test UI).

Мокап кода:
```js
// src-js/fontra-core/src/tunni-geometry.js
export function calculateMidpointTunni(segmentPoints) {}
export function calculateTrueTunniPoint(segmentPoints) {}
export function calculateControlPointsFromTunni(tunniPoint, segmentPoints, options = {}) {}
export function calculateOnCurvePointsFromTunni(tunniPoint, segmentPoints, options = {}) {}
export function calculateEqualizedControlPoints(segmentPoints, options = {}) {}
export function areControlHandleDistancesEqualized(segmentPoints, tolerance = 0.01) {}
export function calculateControlHandleDistance(segmentPoints) {}
```

Что тестировать: прогонить ручные сценарии на 3 типах сегментов (обычный кубик, почти прямой, почти параллельные лучи), убедиться что до следующего шага поведение в UI не изменилось.

## Шаг 03. Перевести `tunni-calculations.js` на новое ядро
Общая проблема: `tunni-calculations.js` содержит и математику, и интеракцию, и рисование, и hit-test.

Аспект шага: убрать дубликаты математики, оставить существующие экспортируемые точки входа работоспособными.

Решение: импортировать функции из `tunni-geometry.js`, локальные дубли удалить, экспорты оставить как thin wrappers на время миграции.

Мокап кода:
```js
// src-js/fontra-core/src/tunni-calculations.js
import {
  calculateTrueTunniPoint as calcTrue,
  calculateEqualizedControlPoints as calcEqualized,
  calculateControlHandleDistance as calcHandleDist,
  areControlHandleDistancesEqualized as areEqualized,
} from "./tunni-geometry.js";

export function calculateTrueTunniPoint(points) { return calcTrue(points); }
export function calculateEqualizedControlPoints(points) { return calcEqualized(points); }
export function calculateControlHandleDistance(points) { return calcHandleDist(points); }
export function areDistancesEqualized(points, tol = 0.01) { return areEqualized(points, tol); }
```

Что тестировать: проверить drag/ctrl+shift сценарии регулярного Tunni до пикселя; проверить, что undo/redo не поменялись.

## Шаг 04. Вычистить Tunni-дубли из `distance-angle.js`
Общая проблема: `distance-angle.js` содержит метрики и параллельно дублирует Tunni-математику (`calculateTrueTunniPoint`, `calculateEqualizedControlPoints`, `calculateTunniPointz`).

Аспект шага: оставить файл только про measure-математику и форматирование.

Решение: удалить Tunni-дубли, заменить использования импортом из `tunni-geometry.js`, устранить кривой нейминг `calculateTunniPointz`.

Мокап кода:
```js
// src-js/fontra-core/src/distance-angle.js
import { calculateTrueTunniPoint, calculateMidpointTunni } from "./tunni-geometry.js";
// удалить export function calculateTunniPointz(...)
```

Что тестировать: визуализации Distance/Manhattan/Tunni labels должны выглядеть и считать как раньше на том же глифе и том же зуме.

## Шаг 05. Разнести регистрации visualization layers по доменам
Общая проблема: `visualization-layer-definitions.js` перегружен разнотипной логикой.

Аспект шага: изолировать Tunni/Measure-регистрации от базовых слоев.

Решение: вынести Tunni/Measure layer registration в отдельные файлы, оставив общий реестр и shared helper в текущем модуле.

Мокап кода:
```js
// src-js/views-editor/src/visualization-layer-tunni.js
import { registerVisualizationLayerDefinition, glyphSelector } from "./visualization-layer-definitions.js";
export function registerTunniVisualizationLayers() { /* fontra.tunni.* */ }

// src-js/views-editor/src/visualization-layer-measure.js
export function registerMeasureVisualizationLayers() { /* fontra.distance-angle, fontra.manhattan-distance, q-mode overlay */ }

// src-js/views-editor/src/editor.js
import "./visualization-layer-tunni.js";
import "./visualization-layer-measure.js";
```

Что тестировать: toggles всех слоев в меню должны отображаться и работать; порядок z-index не должен измениться.

## Шаг 06. Вынести регулярные Tunni interactions из core в views-editor
Общая проблема: core-файл знает про UI-объекты (`positionedGlyph`, hit-test viewport), что ломает границу слоев.

Аспект шага: оставить в core только математику, а интеракции переместить в `views-editor`.

Решение: создать `src-js/views-editor/src/tunni-interactions-regular.js`, перенести туда `tunniLayerHitTest`, mouse down/drag/up lifecycle, equalize-then-quantize workflow; pointer импортирует из views.

Мокап кода:
```js
// src-js/views-editor/src/tunni-interactions-regular.js
export function tunniLayerHitTest(...) {}
export function handleTunniPointMouseDown(...) {}
export function handleTunniPointMouseDrag(...) {}
export function handleTunniPointMouseUp(...) {}
export async function equalizeThenQuantizeSegmentControlPoints(...) {}
```

Что тестировать: регулярные Tunni points drag, true Tunni drag, ctrl+shift-click equalize/quantize, alt-модификаторы, undo/redo.

## Шаг 07. Ввести единый helper фильтра generated contours
Общая проблема: логика исключать скелет-сгенерированные контуры из regular Tunni/measure продублирована.

Аспект шага: убрать расхождения фильтрации при hit-test и draw.

Решение: добавить один helper в views (`src-js/views-editor/src/skeleton-generated-contours.js`) и использовать его в визуализациях/interaction modules.

Мокап кода:
```js
// src-js/views-editor/src/skeleton-generated-contours.js
export function getGeneratedContourIndexSet(positionedGlyph, sceneSettings) {
  const layerName = sceneSettings.editLayerName || positionedGlyph?.glyph?.layerName;
  const layer = positionedGlyph?.varGlyph?.glyph?.layers?.[layerName];
  return new Set(getSkeletonData(layer)?.generatedContourIndices || []);
}
```

Что тестировать: regular Tunni/measure не цепляются за outline, который сгенерирован из skeleton; на обычных контурах все работает как раньше.

## Шаг 08. Ввести pointer context-контракт для декомпозиции
Общая проблема: `edit-tools-pointer.js` держит слишком много скрытых зависимостей.

Аспект шага: зафиксировать единый контракт зависимостей между pointer и выносимыми модулями.

Решение: создать `src-js/views-editor/src/pointer/pointer-context.js` с фабрикой контекста (sceneController, sceneModel, editor settings, convertors, common utilities).

Мокап кода:
```js
// src-js/views-editor/src/pointer/pointer-context.js
export function createPointerContext(tool) {
  return {
    sceneController: tool.sceneController,
    sceneModel: tool.sceneModel,
    editor: tool.editor,
    toGlyphPoint: (event) => ...,
    requestRedraw: () => tool.sceneController.canvasController.requestUpdate(),
  };
}
```

Что тестировать: после внедрения контекста behavior не меняется; pointer работает в обычном drag/selection режиме.

## Шаг 09. Вынести Q-measure key lifecycle из pointer
Общая проблема: keydown/keyup логика Q и Alt+Q размазана по pointer, легко ломается.

Аспект шага: изолировать управление режимом измерений.

Решение: создать `src-js/views-editor/src/pointer/pointer-measure-mode.js` с функциями `handleMeasureKeyDown/Up`.

Мокап кода:
```js
// pointer-measure-mode.js
export function handleMeasureKeyDown(ctx, event) {}
export function handleMeasureKeyUp(ctx, event) {}
```

Что тестировать: Q-hold включает projected mode; Alt+Q включает direct mode; отпускание клавиш всегда очищает hover state.

## Шаг 10. Ввести единый Measure state API в `SceneModel`
Общая проблема: одновременно есть `this.measureMode` в pointer и поля `sceneModel.measure*`; источник истины не один.

Аспект шага: сделать один state-owner и один протокол изменения состояния.

Решение: в `SceneModel` добавить методы управления measure state; pointer не пишет напрямую в разрозненные поля.

Мокап кода:
```js
// scene-model.js
this.measure = {
  active: false,
  showDirect: false,
  hoverSegment: null,
  hoverRibPoint: null,
  hoverPoints: null,
  hoverHandle: null,
};

setMeasureState(patch) { Object.assign(this.measure, patch); }
resetMeasureState() { this.measure = { active:false, showDirect:false, hoverSegment:null, hoverRibPoint:null, hoverPoints:null, hoverHandle:null }; }
```

Что тестировать: при любом завершении interaction (mouseup, escape, смена tool, blur canvas) measure state гарантированно сбрасывается единообразно.

## Шаг 11. Вынести Q-measure hover hit-testing в отдельный модуль
Общая проблема: поиск rib/segment/handle для Q-mode смешан с прочим hover кодом pointer.

Аспект шага: сделать локально тестируемый алгоритм выбора приоритета hover-цели.

Решение: добавить `src-js/views-editor/src/pointer/pointer-measure-hit-test.js` и определить строгий приоритет: rib point > off-curve handle > segment > pair-selection.

Мокап кода:
```js
// pointer-measure-hit-test.js
export function resolveMeasureHoverTarget(ctx, event) {
  // return { kind: "ribPoint" | "handle" | "segment" | "points", payload }
}
```

Что тестировать: при перекрытии кандидатов всегда выбирается одинаковый объект; при малом zoom и большом zoom выбор стабилен.

## Шаг 12. Вынести regular Tunni pointer-flow из `edit-tools-pointer.js`
Общая проблема: regular Tunni drag logic занимает большой кусок pointer и конфликтует с другими режимами.

Аспект шага: encapsulate lifecycle regular Tunni.

Решение: создать `src-js/views-editor/src/pointer/pointer-tunni-regular.js` с API `tryStartRegularTunniDrag`, `handleRegularTunniDragStream`, `finishRegularTunniDrag`.

Мокап кода:
```js
// pointer-tunni-regular.js
export async function tryHandleRegularTunni(ctx, eventStream, initialEvent) {
  const hit = tunniLayerHitTest(...);
  if (!hit) return { handled: false };
  // do lifecycle
  return { handled: true };
}
```

Что тестировать: regular Tunni drag не мешает обычному point drag; ctrl+shift-click path равен baseline; rollback корректен при cancel.

## Шаг 13. Вынести skeleton Tunni pointer-flow из `edit-tools-pointer.js`
Общая проблема: skeleton Tunni и regular Tunni перемешаны, сложно поддерживать edge-cases.

Аспект шага: отдельный жизненный цикл для skeleton midpoint/true-point/equalize.

Решение: создать `src-js/views-editor/src/pointer/pointer-tunni-skeleton.js`, перенести туда `_handleSkeletonTunniDrag`, `_equalizeSkeletonTunniTensions`, вспомогательный hit/selection flow.

Мокап кода:
```js
// pointer-tunni-skeleton.js
export async function tryHandleSkeletonTunni(ctx, eventStream, initialEvent) {}
export async function equalizeSkeletonTunniAtPoint(ctx, glyphPoint) {}
```

Что тестировать: midpoint drag skeleton, true-point drag skeleton, Ctrl+Shift equalize, Alt отключает equalization, mixed layer edits.

## Шаг 14. Вынести equalize-механику regular/skeleton handles в отдельные модули
Общая проблема: equalize при drag/arrow-nudge размазан по pointer и частично дублируется.

Аспект шага: разделить regular-handle equalize и skeleton-handle equalize/nudge по двум модулям.

Решение: добавить `pointer-equalize-regular.js` и `pointer-equalize-skeleton.js`; pointer вызывает только узкие entrypoints.

Мокап кода:
```js
// pointer-equalize-regular.js
export function buildRegularEqualizeState(layerPath, pointIndex) {}
export function applyRegularEqualizeDrag(equalizeState, delta) {}

// pointer-equalize-skeleton.js
export function buildSkeletonEqualizeState(skeletonContour, pointIndex) {}
export function applySkeletonEqualizeNudge(state, dx, dy) {}
```

Что тестировать: X+drag regular handles; X+arrows для skeleton handles; включение/выключение X в процессе drag; undo label и rollback соответствуют действию.

## Шаг 15. Свести `edit-tools-pointer.js` к thin orchestrator
Общая проблема: файл 7k+ строк, высокий риск регрессий при любом изменении.

Аспект шага: оставить orchestration, убрать доменную логику в модульные обработчики.

Решение: pointer хранит только маршрутизацию событий и вызовы специализированных модулей; удалить продублированные private-методы.

Мокап кода:
```js
// edit-tools-pointer.js
async handleDrag(eventStream, initialEvent) {
  const ctx = createPointerContext(this);
  if (await tryHandleMeasureFlow(ctx, eventStream, initialEvent)) return;
  if (await tryHandleSkeletonTunni(ctx, eventStream, initialEvent)) return;
  if (await tryHandleRegularTunni(ctx, eventStream, initialEvent)) return;
  return this.handleDefaultPointerFlow(eventStream, initialEvent);
}
```

Что тестировать: полный smoke-test pointer tool: selection, drag, move points, handle editing, Tunni regular/skeleton, Q-mode, X-mode; производительность на длинных контурах без деградации.

## Шаг 16. Починить binding чекбоксов Tunni в `panel-transformation.js`
Общая проблема: binding через `setTimeout` + индекс чекбокса (`allCheckboxes[0]`) хрупок.

Аспект шага: deterministic binding по ключу поля, без DOM-поиска по позиции.

Решение: добавить helper для булевых строк формы и привязывать обработчик прямо при создании `auxiliaryElement`; удалить `setTimeout` блок полностью.

Мокап кода:
```js
function buildBooleanRow(key, label, value, onChange) {
  const checkbox = html.input({ type: "checkbox", checked: !!value, onchange: (e) => onChange(e.target.checked) });
  return {
    type: "universal-row",
    field1: { type: "auxiliaryElement", key, auxiliaryElement: checkbox },
    field2: { type: "text", value: label },
    field3: {},
  };
}
```

Что тестировать: переключение `showTunniDistance/showTunniTension/showTunniAngle` и skeleton-аналогов стабильно работает после любого reorder полей и после повторного открытия панели.

## Шаг 17. Вычистить `edit-tools-metrics.js` от no-op/stub/debug мусора
Общая проблема: активный путь содержит no-op метод + warn/log шум и дублированную логику.

Аспект шага: убрать ложные вызовы и оставить единственный рабочий путь обновления skeleton при sidebearing edit.

Решение: удалить `_updateSkeletonDataForSidebearingChange` no-op и его вызов, удалить `_applyDeltaToSkeletonPoints` debug-функцию и мертвую `_regenerateOutlineContoursFromSkeleton`, оставить ровно один применяемый механизм (тот, что уже в `switch(sidebearing)` через `moveSkeletonData/setSkeletonData`).

Мокап кода:
```js
// edit-tools-metrics.js
// удалить:
// await this._updateSkeletonDataForSidebearingChange(...)
// async _updateSkeletonDataForSidebearingChange(...) { console.warn(...); }
// _applyDeltaToSkeletonPoints(...)
// _regenerateOutlineContoursFromSkeleton(...)
```

Что тестировать: изменение L/R/LR sidebearings с skeleton + без skeleton; отсутствие console noise; отсутствие двойного сдвига skeleton; корректный undo/redo.

## Шаг 18. Локализация, naming, hotkey-consistency
Общая проблема: недостающие i18n ключи и несогласованные имена усложняют поддержку.

Аспект шага: закрыть техдолг релизного уровня по строкам/неймингу.

Решение: добавить ключ `shortcuts.realtime.measure-direct` во все поддерживаемые словари; заменить сырые строки в UI там, где это уже часть refactor touch-zone; финально убрать `calculateTunniPointz` и аналогичные временные имена.

Мокап кода:
```js
// assets/lang/en.js и остальные
"shortcuts.realtime.measure-direct": "Measure Direct Mode (hold)"

// editor.js
titleKey: "shortcuts.realtime.measure-direct"
```

Что тестировать: Shortcuts UI показывает корректные названия без пустых ключей; в разных языках нет `undefined`/raw key string.

## Шаг 19. Жестко определить политику Ctrl-modified mousedown в MouseTracker
Общая проблема: глобальное удаление `ctrlKey` guard может давать побочные эффекты вне Tunni-сценариев.

Аспект шага: точечно разрешить Ctrl+Shift взаимодействия, не ломая контекст-меню/другие инструменты.

Решение: расширить `MouseTracker` опцией-предикатом `allowCtrlModifiedMouseDown(event)`; по умолчанию блокировать ctrl-modified, разрешать только когда предикат true; в `SceneController` прокинуть предикат, который разрешает Ctrl+Shift только для pointer/Tunni case.

Мокап кода:
```js
// mouse-tracker.js
constructor(options) { this._allowCtrlModifiedMouseDown = options.allowCtrlModifiedMouseDown; }
handleMouseDown(event) {
  const allowCtrl = this._allowCtrlModifiedMouseDown?.(event) === true;
  if (event.button === 2 || (event.ctrlKey && !allowCtrl)) return;
}

// scene-controller.js
this.mouseTracker = new MouseTracker({
  ...,
  allowCtrlModifiedMouseDown: (event) => this.selectedTool?.identifier === "pointer-tool" && event.shiftKey,
});
```

Что тестировать: Ctrl+Shift+click на Tunni работает; обычный Ctrl+click не начинает drag там, где должен быть контекстный сценарий; другие инструменты не регрессируют.

## Шаг 20. Финальная зачистка deprecated путей и повторный baseline sweep
Общая проблема: после миграции остаются адаптеры/реэкспорты и потенциальные дублеры.

Аспект шага: завершить рефактор, оставить чистую структуру без времянок.

Решение: удалить deprecated wrappers, прогнать `rg`-поиск на запрещенные символы/имена, обновить docs структуры модулей.

Мокап кода:
```powershell
rg -n "calculateTunniPointz|Skeleton functionality is not available|SKELETON DEBUG|setTimeout\\(\\) => .*allCheckboxes\\[0\\]" src-js
rg -n "from \"@fontra/core/tunni-calculations.js\"" src-js/views-editor/src
```

Что тестировать: полный baseline из Шага 01; отдельно стресс-кейс skeleton + regular contours в одном глифе + multi-source editing + interpolation health.

## Сквозной manual test matrix (обязательный после шагов 10, 15 и 20)
1. Regular cubic contour: midpoint Tunni drag, true-point drag, ctrl+shift equalize, alt modifier behavior, undo/redo цепочки.
2. Skeleton contour: midpoint/true-point drag, X-drag equalize, X+arrow nudge, выбор rib/handle/point без клика-away.
3. Q-measure: Q projected, Alt+Q direct, hover priority rib>handle>segment>selected-points, стабильность reset при key up/tool switch.
4. Distance/Manhattan визуализации: корректные числа при горизонтальном/вертикальном/диагональном расположении.
5. Generated contour exclusion: regular Tunni/measure не работают по generated contours, но работают по настоящим контурам.
6. Mixed glyph content: skeleton + regular path в одном слое и в нескольких источниках, без интерполяционных артефактов из-за рефактора pointer/metrics.
7. UI panel transformation: все чекбоксы Tunni/skeleton labels биндинг стабильный после reopen панелей и after-form rebuild.
8. Shortcut labels: `measure-direct` и остальные строки корректны в UI локализации.

## Явные assumptions и принятые дефолты
1. UX остается прежним; допустимы только доказанные багфиксы математики.
2. Рефактор делается без требования поддержки старой предрефакторной внутренней архитектуры.
3. Автотесты не добавляем в этой задаче; валидация вручную по матрице выше.
4. Область этого плана: Tunni + metrics/Q + связанный pointer/UI/локализация/ввод мыши; storage-схема и остальные подсистемы не трогаем.
5. На каждом шаге выполняется принцип минимальный изменяемый срез + ручная проверка перед следующим шагом.
