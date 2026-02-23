# Полный план рефакторинга Tunni + Metrics/Q-режима

## Статус документа
- **Версия:** 2.0 (полная, все шаги включены)
- **Дата:** 21 февраля 2026
- **Статус:** Готов к выполнению
- **Основан на:** `PLAN-tunni-metrics-refactor.md` + `docs/refactor/tunni-metrics-refactor-critical-fixes.md`

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
| **00** | Unit-тесты для Tunni-математики | ⬜ Новый | — |
| **01** | Зафиксировать baseline сценариев | ⬜ Оригинал | — |
| **02** | Ввести ядро регулярной Tunni-геометрии | ⬜ Оригинал | Шаг 00 |
| **03** | Перевести `tunni-calculations.js` на новое ядро | ⬜ Оригинал | Шаг 02 |
| **04** | Вычистить Tunni-дубли из `distance-angle.js` | ⬜ Оригинал | Шаг 02 |
| **05** | Разнести регистрации visualization layers по доменам | ⬜ Оригинал | — |
| **06** | Вынести регулярные Tunni interactions из core в views | ⬜ Оригинал | Шаг 02 |
| **07** | Ввести единый helper фильтра generated contours | ⬜ Оригинал+ | — |
| **08** | Ввести pointer context-контракт | ⬜ Оригинал | — |
| **09** | Вынести Q-measure key lifecycle из pointer | ⬜ Оригинал | Шаг 08 |
| **10** | Ввести единый Measure state API в `SceneModel` | ⬜ Оригинал+ | Шаг 08 |
| **11** | Вынести Q-measure hover hit-testing в отдельный модуль | ⬜ Оригинал | Шаг 10 |
| **12** | Вынести regular Tunni pointer-flow из pointer | ⬜ Оригинал | Шаг 08 |
| **13** | Вынести skeleton Tunni pointer-flow из pointer | ⬜ Оригинал | Шаг 08 |
| **14** | Вынести equalize-механику regular/skeleton | ⬜ Оригинал | Шаг 08 |
| **15** | Свести `edit-tools-pointer.js` к thin orchestrator | ⬜ Оригинал+ | Шаги 09-14 |
| **16** | Починить binding чекбоксов Tunni | ⬜ Оригинал+ | — |
| **17** | Вычистить `edit-tools-metrics.js` от no-op мусора | ⬜ Оригинал | — |
| **18** | Локализация, naming, hotkey-consistency | ⬜ Оригинал+ | — |
| **19** | Политика Ctrl-modified mousedown в MouseTracker | ⬜ Оригинал+ | — |
| **20** | Финальная зачистка deprecated путей | ⬜ Оригинал | Все предыдущие |
| **21** | Удалить debug-код и временные имена | ⬜ Новый | — |
| **22** | Объектно-ориентированный Pointer Tool | ⬜ Новый | Шаг 00 |

---

## Порядок выполнения (оптимизированный)

```
Фаза 1: Подготовка (Дни 1-2)
┌─────────────────────────────────────────────────────────┐
│  Шаг 00: Unit-тесты для Tunni-математики                │
│  (обязательный baseline перед любым рефакторингом)      │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Шаг 01: Зафиксировать baseline сценариев               │
│  (ручная проверка теку UX)                              │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│  Шаг 02: Ввести ядро Tunni-геометрии                    │
│  (создать tunni-geometry.js)                            │
└─────────────────────────────────────────────────────────┘
                          ↓
                    ┌───────────┴───────────┐
                    ↓                       ↓
        ┌───────────────────┐    ┌───────────────────┐
        │ Шаг 03:           │    │ Шаг 04:           │
        │ tunni-calculations│    │ distance-angle.js │
        └───────────────────┘    └───────────────────┘
                    ↓                       ↓
                    └───────────┬───────────┘
                                ↓
Фаза 2: Визуализация (Дни 3-4)
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
Фаза 3: Pointer рефакторинг (Дни 5-8)
┌─────────────────────────────────────────────────────────┐
│  Шаг 22: Объектно-ориентированный Pointer Tool          │
│  (архитектурное изменение — заменяет шаги 08-15)        │
└─────────────────────────────────────────────────────────┘
                          ↓
Фаза 4: Сопутствующие изменения (Дни 9-10)
┌─────────────────────────────────────────────────────────┐
│  Шаг 16: Чекбоксы Tunni                                 │
│  Шаг 17: Очистка edit-tools-metrics.js                  │
│  Шаг 18: Локализация                                    │
│  Шаг 19: Ctrl-modified логика                           │
│  Шаг 21: Debug clean                                    │
└─────────────────────────────────────────────────────────┘
                          ↓
Фаза 5: Финализация (День 11)
┌─────────────────────────────────────────────────────────┐
│  Шаг 20: Финальная зачистка + baseline sweep            │
└─────────────────────────────────────────────────────────┘
```

---

## Детальное описание шагов

### Шаг 00. Unit-тесты для Tunni-математики

**Статус:** ⬜ Новый, обязательный

**Проблема:** Оригинал указывает: "Автотесты не добавляем".

**Решение:** Создать `test-common/test-tunni-geometry.js`.

**Файлы:**
- `test-common/test-tunni-geometry.js` — создать

**Критерии приемки:**
- [ ] Все тесты проходят на текущем коде
- [ ] Покрытие: все экспортируемые функции из `tunni-geometry.js`
- [ ] Edge cases: параллельные лучи, нулевые расстояния

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

### Шаг 02. Ввести ядро регулярной Tunni-геометрии

**Статус:** ⬜ Оригинал

**Проблема:** Дубли формул в `distance-angle.js` и `tunni-calculations.js`.

**Решение:** Создать `tunni-geometry.js` с чистыми функциями.

**Файлы:**
- `src-js/fontra-core/src/tunni-geometry.js` — создать

**Функции для переноса:**
- `calculateMidpointTunni(segmentPoints)`
- `calculateTrueTunniPoint(segmentPoints)`
- `calculateControlPointsFromTunni(tunniPoint, segmentPoints, options)`
- `calculateEqualizedControlPoints(segmentPoints)`
- `areDistancesEqualized(segmentPoints, tolerance)`
- `calculateControlHandleDistance(segmentPoints)`

**Критерии приемки:**
- [ ] Все функции перенесены
- [ ] Нет зависимостей от canvas/scene/hit-test
- [ ] Тесты из Шага 00 проходят

---

### Шаг 03. Перевести `tunni-calculations.js` на новое ядро

**Статус:** ⬜ Оригинал

**Проблема:** `tunni-calculations.js` содержит и математику, и интеракцию.

**Решение:** Импортировать из `tunni-geometry.js`, удалить дубли.

**Файлы:**
- `src-js/fontra-core/src/tunni-calculations.js` — изменить

**Мокап кода:**
```js
// tunni-calculations.js
import {
  calculateTrueTunniPoint,
  calculateEqualizedControlPoints,
  calculateControlHandleDistance,
  areDistancesEqualized,
} from "./tunni-geometry.js";

// Thin wrappers для обратной совместимости
export function calculateTrueTunniPoint(points) { return calculateTrueTunniPoint(points); }
export function calculateEqualizedControlPoints(points) { return calculateEqualizedControlPoints(points); }
```

**Критерии приемки:**
- [ ] Дубли математики удалены
- [ ] Экспорты работают (обратная совместимость)
- [ ] Drag/ctrl+shift сценарии работают как раньше

---

### Шаг 04. Вычистить Tunni-дубли из `distance-angle.js`

**Статус:** ⬜ Оригинал

**Проблема:** `distance-angle.js` дублирует Tunni-математику.

**Решение:** Удалить дубли, импортировать из `tunni-geometry.js`.

**Файлы:**
- `src-js/fontra-core/src/distance-angle.js` — изменить

**Функции к удалению/замене:**
- `calculateTrueTunniPoint` → импорт из `tunni-geometry.js`
- `calculateEqualizedControlPoints` → импорт из `tunni-geometry.js`
- `calculateTunniPointz` → удалить (временное имя)

**Критерии приемки:**
- [ ] Дубли удалены
- [ ] Визуализации Distance/Manhattan/Tunni работают как раньше
- [ ] `calculateTunniPointz` больше не используется

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

### Шаг 07. Ввести единый helper фильтра generated contours

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

### Шаг 08-15: ЗАМЕНЕНО на Шаг 22

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

**Файлы:**
- `src-js/views-editor/src/pointer/interaction-target.js` — создать
- `src-js/views-editor/src/pointer/pointer-tool.js` — создать (~400 строк)
- `src-js/views-editor/src/pointer/targets/point-target.js` — создать
- `src-js/views-editor/src/pointer/targets/skeleton-point-target.js` — создать
- `src-js/views-editor/src/pointer/targets/rib-point-target.js` — создать
- `src-js/views-editor/src/pointer/targets/tunni-target.js` — создать
- `src-js/views-editor/src/pointer/targets/measure-target.js` — создать
- `src-js/views-editor/src/pointer/modifiers/equalize-modifier.js` — создать
- `src-js/views-editor/src/pointer/modifiers/quantize-modifier.js` — создать
- `src-js/views-editor/src/pointer/modifiers/snap-modifier.js` — создать
- `src-js/views-editor/src/pointer/modifiers/fixed-rib-modifier.js` — создать
- `src-js/views-editor/src/edit-tools-pointer.js` — удалить (7497 строк)

**Критерии приемки:**
- [ ] `edit-tools-pointer.js` разделён на модули
- [ ] Базовый класс `InteractionTarget` определён
- [ ] 5 классов target реализованы
- [ ] 4 класса modifier реализованы
- [ ] Модификаторы добавляются/удаляются динамически
- [ ] Размер `pointer-tool.js` ≤ 500 строк

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

**Статус:** ⬜ Оригинал+ (исправлено)

**Проблема:** Глобальное удаление `ctrlKey` guard может давать побочные эффекты.

**Решение:** `MouseTracker` не проверяет ctrlKey, `SceneController` фильтрует.

**Файлы:**
- `src-js/fontra-core/src/mouse-tracker.js` — удалить проверку
- `src-js/views-editor/src/scene-controller.js` — добавить фильтрацию

**Критерии приемки:**
- [ ] `MouseTracker` не проверяет `event.ctrlKey`
- [ ] Ctrl+Shift+click на Tunni работает в pointer tool
- [ ] Обычный Ctrl+click не начинает drag в других инструментах

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

### После Шага 04 (ядро геометрии)
- [ ] Прогнать ручные сценарии на 3 типах сегментов
- [ ] Поведение в UI не изменилось до следующего шага

### После Шага 06 (visualization layers)
- [ ] Toggles всех слоев работают
- [ ] Порядок z-index не изменился

### После Шага 07 (helper фильтрации)
- [ ] Regular Tunni/measure не работают по generated contours
- [ ] На обычных контурах всё работает как раньше

### После Шага 22 (Pointer рефактор)
- [ ] Pointer drag не мешает Tunni drag
- [ ] Selection работает после Tunni interaction
- [ ] X+drag regular handles работает
- [ ] X+arrows skeleton handles работает
- [ ] Модификаторы включаются/выключаются в процессе drag

### После Шага 16 (чекбоксы)
- [ ] Переключение чекбоксов стабильно работает

### После Шага 17 (metrics clean)
- [ ] Изменение sidebearings работает
- [ ] Нет console noise

### После Шага 18 (i18n)
- [ ] Shortcuts UI показывает корректные названия

### После Шага 19 (ctrl-modified)
- [ ] Ctrl+Shift+click на Tunni работает в pointer tool
- [ ] Ctrl+click не начинает drag в pen tool

### После Шага 20 (baseline sweep)
- [ ] Полный regression test по матрице из Шага 01
- [ ] Стресс-кейс: skeleton + regular contours в одном глифе

---

## Итоговый чек-лист

- [ ] Шаг 00: Unit-тесты созданы и проходят
- [ ] Шаг 01: Baseline зафиксирован
- [ ] Шаг 02: Tunni-геометрия создана
- [ ] Шаг 03: tunni-calculations переведён на новое ядро
- [ ] Шаг 04: distance-angle вычищен от дублей
- [ ] Шаг 05: Visualization layers разнесены
- [ ] Шаг 06: Tunni interactions вынесены из core
- [ ] Шаг 07: Helper фильтрации создан
- [ ] Шаг 22: Pointer tool рефакторирован
- [ ] Шаг 16: Чекбоксы привязаны к sceneSettings
- [ ] Шаг 17: edit-tools-metrics вычищен
- [ ] Шаг 18: i18n аудит завершён
- [ ] Шаг 19: Ctrl-modified логика перемещена
- [ ] Шаг 21: Debug-код удалён
- [ ] Шаг 20: Финальная зачистка пройдена

---

## Метрики успеха

| Метрика | До | После |
|---------|-----|-------|
| **Размер pointer файла** | 7497 строк | ~400 строк (pointer-tool.js) |
| **Количество классов** | 0 (монолит) | 5 target + 4 modifier = 9 |
| **Unit-тесты математики** | 0 | ~20 тестов |
| **Дублирование функций** | 3+ места | 1 место |
| **Модификаторы** | if/else везде | Динамическая композиция |

---

## Рекомендация

**Порядок выполнения:**
1. Дни 1-2: Шаги 00, 01, 02
2. Дни 3-4: Шаги 03, 04, 05, 06
3. Дни 5-8: Шаг 22 (Pointer рефактор)
4. Дни 9-10: Шаги 07, 16, 17, 18, 19, 21
5. День 11: Шаг 20 (финализация)
