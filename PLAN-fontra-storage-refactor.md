# План: жёсткая миграция fork-данных в `fontra.internal` (без поддержки старой схемы в рантайме)

## 1) Краткое резюме
Мы переносим только данные, добавленные в форке:

1. Скелетные кривые и их параметры (`skeleton`, width/cap profiles, defaults).
2. `letterspacer`.
3. `speedpunk`.
4. Кастомная coarse grid.

Базовый формат Fontra (обычные контуры, точки, компоненты, стандартные поля шрифта) не меняется.

Решение принципиальное:

1. Новая версия работает только с новой схемой (`fontra.internal`).
2. Поддержки legacy-ключей в рантайме нет.
3. Для уже существующих файлов форка используется отдельный one-shot конвертер.

Это сохраняет ключевое свойство: даже старые версии без форк-функций открывают файл как обычный векторный (кастомные секции просто игнорируются).

---

## 2) Целевая схема хранения

### 2.1 Общий контейнер
На нужных уровнях (`font`, `source`, `glyph`, `layer`) используем:

`customData["fontra.internal"]`

### 2.2 Структуры
```js
// layer.customData["fontra.internal"]
{
  schemaVersion: 1,
  skeleton: { ...canonicalSkeleton }
}

// source.customData["fontra.internal"]
{
  schemaVersion: 1,
  skeletonDefaults: { ... },
  letterspacer: { area, depth, overshoot, ... }
}

// glyph.customData["fontra.internal"]
{
  schemaVersion: 1,
  letterspacer: { referenceGlyphName, ... }
}

// font.customData["fontra.internal"]
{
  schemaVersion: 1,
  letterspacer: { enabled, ... },
  editorView: {
    speedpunk: { peakHeightUpm, sharpness, opacity },
    coarseGrid: { values, defaultSpacing }
  }
}
```

### 2.3 Правило каноники
Производные поля скелета (например, `generatedContourIndices`) не являются каноникой и не копируются между слоями/источниками.

---

## 3) Ограничения и принятые решения

1. Риски релиза в этом плане не учитываем.
2. Автотесты не пишем; проверка вручную.
3. Legacy-read в рантайме не добавляем.
4. Dual-write (новый+старый ключ одновременно) не используем.
5. Fallback на legacy-ключи в `get*`-функциях не используем.
6. Миграция старых форк-файлов — только отдельным скриптом (one-shot).

---

## 4) Пошаговая имплементация (минимальные инкременты)

## УЖЕ СДЕЛАНО

## Шаг 01. Ввести контракт новой схемы
**Проблема (общее):** нет единой формальной схемы для fork-метаданных.  
**Аспект, который закрывает шаг:** фиксируем единый формат хранения и ключи.

**Решение (текст):**
1. Добавить файл схемы и констант.
2. Зафиксировать `FONTRA_INTERNAL_KEY = "fontra.internal"`.
3. Зафиксировать `schemaVersion = 1`.

**Мокап кода:**
```js
// src-js/fontra-core/src/fontra-internal-schema.js
export const FONTRA_INTERNAL_KEY = "fontra.internal";
export const FONTRA_INTERNAL_SCHEMA_VERSION = 1;
```

**Как тестировать вручную:**
1. Приложение собирается.
2. Никакое поведение пока не меняется.

**Corner cases:**
1. `customData` отсутствует.
2. `customData` есть, но пустой объект.

---

## Шаг 02. Добавить общий read/write API для internal-данных
**Проблема (общее):** прямой доступ к `customData` размазан по коду.  
**Аспект:** единая точка чтения/записи без дублирования.

**Решение (текст):**
1. Добавить `getFontraInternal(entity)`.
2. Добавить `setFontraInternalSection(entity, section, value)`.
3. Внутри всегда создавать контейнер безопасно.

**Мокап кода:**
```js
export function getFontraInternal(entity) {
  return entity?.customData?.[FONTRA_INTERNAL_KEY] || null;
}

export function setFontraInternalSection(entity, section, value) {
  entity.customData ||= {};
  const root = structuredClone(entity.customData[FONTRA_INTERNAL_KEY] || {
    schemaVersion: FONTRA_INTERNAL_SCHEMA_VERSION,
  });
  root[section] = value;
  entity.customData[FONTRA_INTERNAL_KEY] = root;
}
```

**Как тестировать вручную:**
1. В devtools/логике вызова убедиться, что секции пишутся в один контейнер.

**Corner cases:**
1. Повторная запись в ту же секцию.
2. Запись в объект без `customData`.

---

## Шаг 03. Вынести нормализацию skeleton-каноники
**Проблема (общее):** скелет хранит смесь каноники и derived-полей.  
**Аспект:** формально очищаем skeleton перед записью.

**Решение (текст):**
1. Реализовать `stripDerivedSkeletonFields`.
2. Реализовать `normalizeSkeletonData`.
3. Гарантировать минимальную валидность структуры.

**Мокап кода:**
```js
export function stripDerivedSkeletonFields(skeleton) {
  const s = structuredClone(skeleton || {});
  delete s.generatedContourIndices;
  delete s.runtime;
  return s;
}

export function normalizeSkeletonData(skeleton) {
  const s = stripDerivedSkeletonFields(skeleton);
  s.version = 2;
  s.contours = Array.isArray(s.contours) ? s.contours : [];
  return s;
}
```

**Как тестировать вручную:**
1. Создать/изменить скелет.
2. Проверить сохранённые данные: нет `generatedContourIndices` в канонике.

**Corner cases:**
1. Пустой скелет.
2. Поломанный скелет (`contours: null`).

---

## Шаг 04. Перевести чтение skeleton на `fontra.internal`
**Проблема (общее):** чтение идёт из legacy-ключа `fontra.skeleton`.  
**Аспект:** все reader-paths переходят на новую секцию.

**Решение (текст):**
1. В местах чтения заменить прямые обращения на helper:
`getLayerSkeleton(layer) -> layer.customData["fontra.internal"].skeleton`.
2. Не добавлять fallback на старую схему.

**Мокап кода:**
```js
export function getLayerSkeleton(layer) {
  return getFontraInternal(layer)?.skeleton || null;
}
```

**Как тестировать вручную:**
1. Открыть файл уже в новой схеме.
2. Проверить визуализацию skeleton/ribs/handles.

**Corner cases:**
1. Layer без `fontra.internal`.
2. Layer с `fontra.internal`, но без `skeleton`.

---


## Шаг 05. Перевести запись skeleton на `fontra.internal`
**Проблема (общее):** writer-paths продолжают писать старые ключи.  
**Аспект:** единый путь записи + нормализация.

**Решение (текст):**
1. Все записи skeleton заменить на `setLayerSkeleton`.
2. Перед записью всегда `normalizeSkeletonData`.

**Мокап кода:**
```js
export function setLayerSkeleton(layer, skeleton) {
  const canonical = normalizeSkeletonData(skeleton);
  setFontraInternalSection(layer, "skeleton", canonical);
}
```

**Как тестировать вручную:**
1. Рисование скелета.
2. Изменение ширин/caps.
3. Undo/redo и повторное открытие файла.

**Corner cases:**
1. Множественные editing layers.
2. Быстрая серия undo/redo после paste.

---


## Шаг 06. Централизовать regeneration контуров скелета
**Проблема (общее):** логика генерации контуров дублируется в нескольких местах.  
**Аспект:** один источник правды для regenerate.

**Решение (текст):**
1. Вынести единый сервис `regenerateSkeletonContours`.
2. Все call-site использовать только его.

**Мокап кода:**
```js
export function regenerateSkeletonContours(staticGlyph, skeletonCanonical) {
  const contours = generateContoursFromSkeleton(skeletonCanonical);
  // удалить старые generated контуры из path, добавить новые
  // вернуть обновлённые path-индексы как runtime-результат
}
```

**Как тестировать вручную:**
1. Изменить параметры скелета.
2. Проверить, что реальный контур обновился корректно.

**Corner cases:**
1. Открытый/закрытый скелетный контур.
2. Контуры на границе удаления/вставки.

---


## Шаг 07. Убрать копирование всего `layer.customData` при создании source/layer
**Проблема (общее):** перетаскивается мусорная метадата.  
**Аспект:** переносим только нужную канонику.

**Решение (текст):**
1. В коде создания source/layer убрать `JSON.parse(JSON.stringify(existingLayer.customData))`.
2. Копировать только `internal.skeleton` через helper.

**Мокап кода:**
```js
const srcSkeleton = getLayerSkeleton(existingLayer);
if (srcSkeleton) {
  setLayerSkeleton(newLayer, srcSkeleton);
}
```

**Как тестировать вручную:**
1. Создать новый source из существующего.
2. Проверить `newLayer.customData`: нет лишних ключей.

**Corner cases:**
1. Исходный слой без скелета.
2. Частично заполненный `fontra.internal`.

---


## Шаг 08. Перенести source-level width/cap defaults и profiles
**Проблема (общее):** параметры распылены по множеству legacy-ключей.  
**Аспект:** один раздел для профилей и дефолтов.

**Решение (текст):**
1. Ввести `source.internal.skeletonDefaults`.
2. Сложить туда:
`widthDefaults`, `capDefaults`, `widthProfiles`, `capProfiles`.

**Мокап кода:**
```js
setFontraInternalSection(source, "skeletonDefaults", {
  widthDefaults: { uppercase: {}, lowercase: {} },
  capDefaults: { square: {}, round: {} },
  widthProfiles: {},
  capProfiles: {},
});
```

**Как тестировать вручную:**
1. Переключение профилей ширины.
2. Переключение профилей cap-style.
3. Возврат к previous value.

**Corner cases:**
1. `mixed` значения на множественном выборе точек.
2. Применение профиля к части точек.

---


## Шаг 09. Перенести Letterspacer в internal-секции
**Проблема (общее):** letterspacer-хранилище разбросано и слабо типизировано.  
**Аспект:** прозрачная модель данных letterspacer.

**Решение (текст):**
1. `font.internal.letterspacer` для глобальных флагов.
2. `source.internal.letterspacer` для параметров источника.
3. `glyph.internal.letterspacer` для reference glyph и локальных данных.

**Мокап кода:**
```js
setFontraInternalSection(fontInfo, "letterspacer", { enabled: true });
setFontraInternalSection(source, "letterspacer", { area: 420, depth: 12, overshoot: 8 });
setFontraInternalSection(glyph, "letterspacer", { referenceGlyphName: "H" });
```

**Как тестировать вручную:**
1. Применение letterspacer к глифу.
2. Смена reference glyph.
3. Повторное открытие файла и проверка сохранения параметров.

**Corner cases:**
1. Пустой reference glyph.
2. Глиф с компонентами.

---


## Шаг 10. Перенести Speedpunk и coarse grid в `font.internal.editorView`
**Проблема (общее):** настройки размазаны между `window.*`, scene и persistent storage.  
**Аспект:** единая каноника редакторных настроек на уровне файла.

**Решение (текст):**
1. Ввести `font.internal.editorView.speedpunk`.
2. Ввести `font.internal.editorView.coarseGrid`.
3. Runtime (`sceneSettings`) использовать только как проекцию.

**Мокап кода:**
```js
setFontraInternalSection(fontInfo, "editorView", {
  speedpunk: { peakHeightUpm: 24, sharpness: 1, opacity: 0.5 },
  coarseGrid: { values: [5,10,15,20,25,30,35,40], defaultSpacing: 10 },
});
```

**Как тестировать вручную:**
1. Изменить speedpunk/coarse grid.
2. Сохранить, переоткрыть, убедиться в восстановлении.

**Corner cases:**
1. Некорректные значения (`NaN`, `0`, отрицательные).
2. Пустой массив `coarseGrid.values`.

---


## Шаг 11. Разделить UI: OpenType vs Fontra Internal
**Проблема (общее):** internal-поля ошибочно выглядят как OpenType settings.  
**Аспект:** корректная семантика в UI.

**Решение (текст):**
1. В `Font Info -> Sources` оставить OpenType-блок только для OpenType allowlist.
2. Добавить отдельный блок `Fontra internal settings`.
3. Не маркировать `fontra.internal` как OpenType.

**Мокап кода:**
```js
const openTypeItems = items.filter((i) => OPEN_TYPE_KEYS.has(i.key));
const internalItems = items.filter((i) => i.key === "fontra.internal");
```

**Как тестировать вручную:**
1. Открыть `Font Info -> Sources`.
2. Проверить, что internal-данные не в OpenType секции.

**Corner cases:**
1. Источник содержит только internal без OpenType.
2. Источник содержит только OpenType без internal.

---


## Шаг 13. Удалить legacy-код форка из приложения
**Проблема (общее):** после миграции останутся старые константы/ветки и техдолг.  
**Аспект:** финализация перехода и уменьшение сложности.

**Решение (текст):**
1. Удалить legacy-константы форк-ключей.
2. Удалить ветки чтения/записи старой схемы.
3. Оставить только `fontra.internal`.

**Мокап кода:**
```js
// before: layer.customData["fontra.skeleton"]
// after:  getLayerSkeleton(layer)
```

**Как тестировать вручную:**
1. Smoke-проход по всем 4 подсистемам.
2. Проверка сохранения/повторного открытия.

**Corner cases:**
1. Undo/redo длинной цепочки смешанных операций.
2. Множественные источники/слои.

---


## ОСТАЛОСЬ СДЕЛАТЬ

## Шаг 12. One-shot конвертер старых файлов форка
**Проблема (общее):** существующие файлы форка находятся в старой схеме.  
**Аспект:** миграция архива/текущих файлов в новый формат без legacy-рантайма.

**Решение (текст):**
1. Написать отдельный скрипт-конвертер.
2. Считать старые форк-ключи только в скрипте.
3. Записать в `fontra.internal`.
4. Удалить старые форк-ключи.

**Мокап кода:**
```js
// scripts/migrate-fork-data-to-internal.js
for (const file of fontraFiles) {
  const data = readFontra(file);
  migrateSkeleton(data);
  migrateLetterspacer(data);
  migrateSpeedpunkAndGrid(data);
  removeLegacyForkKeys(data);
  writeFontra(file, data);
}
```

**Как тестировать вручную:**
1. Прогнать скрипт на тестовой копии файлов.
2. Открыть конвертированные файлы в новой версии.
3. Проверить 4 подсистемы.

**Corner cases:**
1. Частично заполненные старые ключи.
2. Отсутствие одной из 4 подсистем в файле.

---

## 5) Ручной чеклист приёмки

1. Скелет:
   1. Создать/редактировать скелет.
   2. Изменять width/cap profiles.
   3. Проверить корректность generated контуров визуально.
2. Letterspacer:
   1. Изменить параметры на уровне source.
   2. Сменить reference glyph.
   3. Проверить повторяемость после reopen.
3. Speedpunk + coarse grid:
   1. Изменить настройки.
   2. Сохранить/переоткрыть.
4. Создание source/layer:
   1. Убедиться, что не копируется весь `layer.customData`.
5. Совместимость со старыми версиями:
   1. Файл открывается.
   2. Видна обычная векторная геометрия.
   3. Кастомные функции старой версией игнорируются.

---

## 6) Что именно не входит в этот план

1. Поддержка legacy-схемы в рантайме.
2. Автоматизированные тесты.
3. Изменение базовой модели контуров/точек Fontra.
4. Любая миграция данных, не относящаяся к 4 подсистемам форка.





