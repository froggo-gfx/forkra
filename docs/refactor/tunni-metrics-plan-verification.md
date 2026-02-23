# Верификация планов рефакторинга против кодовой базы

## Дата проверки: 21 февраля 2026

## Статус проверки

| План | Статус | Примечания |
|------|--------|------------|
| `PLAN-tunni-metrics-refactor.md` (оригинал) | ✅ Проанализирован | 20 шагов, требует критических исправлений |
| `docs/refactor/tunni-metrics-refactor-critical-fixes.md` | ✅ Проанализирован | Критические исправления подтверждены |
| `docs/refactor/tunni-metrics-refactor-final-plan.md` | ✅ Проанализирован | Консолидированный план полон |

---

## Аудит текущей кодовой базы

### 1. Проблемные файлы (подтверждено)

| Файл | Проблема | Строк | Статус |
|------|----------|-------|--------|
| `edit-tools-pointer.js` | Монолит 7497 строк | 7497 | ⚠️ Требует рефакторинга |
| `tunni-calculations.js` | Математика + UI смешаны | 1507 | ⚠️ Дубли в distance-angle.js |
| `distance-angle.js` | Дубли Tunni функций + `calculateTunniPointz` | 1423 | ⚠️ 3 дублирующие функции |
| `visualization-layer-definitions.js` | Перегружен | 2985 | ⚠️ Tunni/Measure смешаны |
| `edit-tools-metrics.js` | Debug-код + no-op методы | 1604 | ⚠️ 5 console.log SKELETON DEBUG |
| `panel-transformation.js` | setTimeout + allCheckboxes[0] | 1928 | ⚠️ Хрупкий binding |
| `mouse-tracker.js` | Закомментированный ctrlKey | 125 | ✅ Уже исправлено |
| `scene-model.js` | Прямые присваивания measure* | 1907 | ⚠️ Нет инкапсуляции |

---

### 2. Дублирование функций (подтверждено)

#### Функция: `calculateTrueTunniPoint`
- ✅ `tunni-calculations.js:73` — основная
- ⚠️ `distance-angle.js:975` — дубль (требует удаления)

#### Функция: `calculateEqualizedControlPoints`
- ✅ `tunni-calculations.js:194` — основная
- ⚠️ `distance-angle.js:1005` — дубль (требует удаления)

#### Функция: `calculateControlHandleDistance`
- ✅ `tunni-calculations.js:292` — основная
- ⚠️ `distance-angle.js:1047` — дубль (требует удаления)

#### Функция: `areDistancesEqualized`
- ✅ `tunni-calculations.js:275` — основная
- ⚠️ `distance-angle.js:1073` — дубль (требует удаления)

#### Функция: `calculateTunniPointz` (временное имя с опечаткой)
- ⚠️ `distance-angle.js:1090` — определение
- ⚠️ `distance-angle.js:1177` — использование
- ⚠️ `visualization-layer-definitions.js:46` — импорт
- ❌ **Требует удаления везде**

---

### 3. Helper фильтрации generated contours (подтверждено дублирование)

| Файл | Функция | Строки |
|------|---------|-------|
| `tunni-calculations.js` | `getSkeletonGeneratedContourIndexSet` | 35-41 |
| `distance-angle.js` | `getSkeletonGeneratedContourIndexSet` | 1123-1136 |
| `visualization-layer-definitions.js` | `getSkeletonGeneratedContourIndexSet` | 2729-2737 |
| `edit-tools-pen.js` | `_getGeneratedContourIndexSet` + `getGeneratedContourIndexSet` | 158, 849 |

**Вывод:** 4 разных реализации одной логики → **требуется единый helper в `skeleton-contour-generator.js`**

---

### 4. Measure state (подтверждена проблема)

**Текущее состояние в `scene-model.js`:**
```js
// Строки 69-74
this.measureMode = false;
this.measureShowDirect = false;
this.measureHoverSegment = null;
this.measureHoverRibPoint = null;
this.measureHoverPoints = null;
this.measureHoverHandle = null;
```

**Прямые присваивания в `edit-tools-pointer.js`:**
- Строка 906: `this.measureMode = true;`
- Строка 907: `this.sceneModel.measureMode = true;`
- Строка 963: `this.measureMode = false;`
- Строка 964: `this.sceneModel.measureMode = false;`
- Строка 7168: `this.measureMode = false;`
- Строка 7169: `this.sceneModel.measureMode = false;`

**Вывод:** 6 мест с прямыми присваиваниями → **требуется инкапсуляция (Шаг 10)**

---

### 5. Debug-код (подтверждено)

**В `edit-tools-metrics.js`:**
```js
// Строки 859-872
console.log(`[SKELETON DEBUG] _applyDeltaToSkeletonPoints called with deltaX=${deltaX}`);
console.log(`[SKELETON DEBUG] Before applying delta, contours: ${skeletonData.contours.length}`);
// ... ещё 3 console.log
```

**Вывод:** 5 console.log с префиксом `[SKELETON DEBUG]` → **требуется удаление (Шаг 21)**

---

### 6. Хрупкий binding чекбоксов (подтверждено)

**В `panel-transformation.js` (строка 850):**
```js
const allCheckboxes = this.infoForm.querySelectorAll("input[type=checkbox]");
const distanceCheckbox = allCheckboxes[0]; // ← Хрупкий индекс!
```

**Вывод:** Зависимость от порядка чекбоксов в DOM → **требуется привязка по ключу (Шаг 16)**

---

### 7. MouseTracker ctrlKey (проверено)

**В `mouse-tracker.js` (строка 38):**
```js
if (event.button === 2 /* || event.ctrlKey */) {
  // Note: ctrlKey check removed to allow Ctrl+Shift+click for Tunni equalize
  return;
}
```

**Статус:** ✅ Уже исправлено (закомментировано). Но требуется полное удаление проверки и перенос логики в `SceneController` (Шаг 19).

---

### 8. no-op методы в edit-tools-metrics.js (подтверждено)

**В `edit-tools-metrics.js`:**
- Строка 798: Вызов `await this._updateSkeletonDataForSidebearingChange(...)`
- Строка 847: Определение `async _updateSkeletonDataForSidebearingChange(...)`
- Строка 881: Определение `async _regenerateOutlineContoursFromSkeleton(...)`

**Вывод:** No-op метод вызывается → **требуется удаление (Шаг 17)**

---

## Сопоставление планов с кодовой базой

### Оригинальный план (PLAN-tunni-metrics-refactor.md)

| Шаг | Описание | Статус в коде | Примечания |
|-----|----------|---------------|------------|
| 01 | Baseline сценариев | ⬜ Не создан | Требуется `docs/refactor/tunni-metrics-baseline.md` |
| 02 | tunni-geometry.js | ⬜ Не создан | Требуется создать |
| 03 | tunni-calculations на новое ядро | ⬜ Не начато | Зависит от Шага 02 |
| 04 | distance-angle вычистить | ⬜ Не начато | 3 дублирующие функции |
| 05 | Visualization layers разнести | ⬜ Не начато | Требуется 2 новых файла |
| 06 | Tunni interactions из core | ⬜ Не начато | 6 функций на перенос |
| 07 | Helper фильтрации | ⬜ Не начато | 4 дублирующие реализации |
| 08 | Pointer context | ⬜ Не начато | Часть Шага 22 |
| 09 | Q-measure lifecycle | ⬜ Не начато | Часть Шага 22 |
| 10 | Measure state API | ⬜ Не начато | 6 прямых присваиваний |
| 11 | Q-measure hit-testing | ⬜ Не начато | Часть Шага 22 |
| 12 | Regular Tunni pointer-flow | ⬜ Не начато | Часть Шага 22 |
| 13 | Skeleton Tunni pointer-flow | ⬜ Не начато | Часть Шага 22 |
| 14 | Equalize-механика | ⬜ Не начато | Часть Шага 22 |
| 15 | Thin orchestrator | ⬜ Не начато | Результат Шага 22 |
| 16 | Чекбоксы Tunni | ⬜ Не начато | allCheckboxes[0] |
| 17 | edit-tools-metrics clean | ⬜ Не начато | 5 debug-логов + no-op |
| 18 | Локализация | ⬜ Не начато | i18n ключи |
| 19 | Ctrl-modified MouseTracker | ⚠️ Частично | Закомментировано, но не удалено |
| 20 | Финальная зачистка | ⬜ Не начато | После всех шагов |

---

### План критических исправлений (tunni-metrics-refactor-critical-fixes.md)

| Шаг | Описание | Статус | Примечания |
|-----|----------|--------|------------|
| 00 | Unit-тесты | ⬜ Не создан | **Обязательный baseline** |
| 22 | Pointer OO рефактор | ⬜ Не начато | Заменяет шаги 08-15 |
| 10 | Measure state инкапсуляция | ⬜ Не начато | Зависит от Шага 22 |
| 07 | Helper в skeleton-contour-generator | ⬜ Не начато | 4 реализации → 1 |
| 19 | Ctrl-modified в SceneController | ⚠️ Частично | MouseTracker уже готов |
| 16 | Чекбоксы к sceneSettings | ⬜ Не начато | Независимый |
| 18 | i18n аудит | ⬜ Не начато | Независимый |
| 21 | Debug clean | ⬜ Не начато | 5 console.log |

---

### Консолидированный план (tunni-metrics-refactor-final-plan.md)

**Все 23 шага включены:** ✅

| Фаза | Шаги | Статус |
|------|------|--------|
| Фаза 1: Подготовка | 00, 01, 02 | ⬜ Не начато |
| Фаза 2: Ядро геометрии | 03, 04 | ⬜ Не начато |
| Фаза 3: Визуализация | 05, 06, 07 | ⬜ Не начато |
| Фаза 4: Pointer рефактор | 22 | ⬜ Не начато |
| Фаза 5: Сопутствующие | 16, 17, 18, 19, 21 | ⬜ Не начато |
| Фаза 6: Финализация | 20 | ⬜ Не начато |

---

## Выявленные расхождения

### 1. Пропущенные файлы в оригинальном плане

**Оригинал упоминает:**
- `src-js/views-editor/src/skeleton-tunni-calculations.js`

**Но это файл существует и содержит:**
- 426 строк
- Skeleton-specific Tunni функции
- **Не был включён в план рефакторинга!**

**Рекомендация:** Добавить проверку `skeleton-tunni-calculations.js` на дублирование с `tunni-calculations.js`.

---

### 2. Недостаточная детализация Шага 17

**Оригинал указывает:**
- Удалить `_updateSkeletonDataForSidebearingChange`

**Но в коде:**
- Этот метод **вызывается** в строке 798
- Нужно удалить **и вызов, и определение**

**Рекомендация:** Уточнить Шаг 17 — удалить вызов в строке 798 + определение в строке 847.

---

### 3. MouseTracker уже частично исправлен

**Оригинал (Шаг 19) предполагает:**
- Добавить `allowCtrlModifiedMouseDown` предикат

**Но в коде:**
- Проверка `ctrlKey` уже закомментирована
- **Предикат не нужен** — достаточно перенести логику в `SceneController`

**Рекомендация:** Упростить Шаг 19 — удалить закомментированный код, добавить фильтрацию в `SceneController.handleMouseDrag`.

---

### 4. Helper фильтрации — 4 реализации

**Оригинал (Шаг 07) предполагает:**
- Один helper в `views-editor/src/skeleton-generated-contours.js`

**Но в коде:**
- 4 разных реализации в разных файлах
- **Нужен в `fontra-core/src/skeleton-contour-generator.js`** (единый источник)

**Рекомендация:** Исправить Шаг 07 — helper в `fontra-core`, не в `views-editor`.

---

### 5. Measure state — дублирование в pointer

**Оригинал (Шаг 10) предполагает:**
- Pointer не пишет напрямую в `sceneModel.measure*`

**Но в коде:**
- 6 мест с прямыми присваиваниями
- **Нужно обновить все 6 мест**

**Рекомендация:** Уточнить Шаг 10 — найти все вхождения `this.measureMode =` и `this.sceneModel.measureMode =`.

---

## Итоговые рекомендации

### Критические (блокируют начало)

1. **Создать Шаг 00 (unit-тесты)** — без тестов нельзя начинать рефакторинг математики
2. **Создать baseline документ (Шаг 01)** — `docs/refactor/tunni-metrics-baseline.md`
3. **Уточнить Шаг 07** — helper в `fontra-core/src/skeleton-contour-generator.js`, не в `views-editor`

### Важные (требуют уточнения)

4. **Упростить Шаг 19** — MouseTracker уже готов, нужно только удалить закомментированный код
5. **Уточнить Шаг 17** — удалить вызов + определение no-op метода
6. **Уточнить Шаг 10** — найти все 6 прямых присваиваний measureMode

### Опциональные (можно добавить)

7. **Проверить `skeleton-tunni-calculations.js`** — на дублирование с `tunni-calculations.js`
8. **Добавить метрики** — замеры размера файлов до/после

---

## Подтверждение полноты планов

| Аспект | Оригинал | Критические исправления | Консолидированный | Статус |
|--------|----------|------------------------|-------------------|--------|
| Все файлы учтены | ⚠️ Частично | ✅ Да | ✅ Да | **OK** |
| Все дубли найдены | ⚠️ Частично | ✅ Да | ✅ Да | **OK** |
| Порядок шагов | ⚠️ 01-20 | ✅ 00,22,10,07... | ✅ Фазы 1-6 | **OK** |
| Зависимости указаны | ⚠️ Частично | ✅ Да | ✅ Да | **OK** |
| Unit-тесты | ❌ Нет | ✅ Шаг 00 | ✅ Шаг 00 | **OK** |
| Debug clean | ⚠️ Шаг 21 | ✅ Шаг 21 | ✅ Шаг 21 | **OK** |

**Вывод:** Консолидированный план (`tunni-metrics-refactor-final-plan.md`) **полон и готов к выполнению**.

---

## Чек-лист перед началом

- [ ] Утвердить консолидированный план
- [ ] Создать `test-common/test-tunni-geometry.js` (Шаг 00)
- [ ] Создать `docs/refactor/tunni-metrics-baseline.md` (Шаг 01)
- [ ] Проверить `skeleton-tunni-calculations.js` на дубли
- [ ] Начать выполнение с Шага 00
