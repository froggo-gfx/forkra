# План: Нормализация хранения внутренних данных `.fontra` (скелет, профили, letterspacer, speedpunk, coarse grid)

## Краткое резюме
Цель: привести хранение данных к явной модели "OpenType vs Fontra internal", убрать дубли/рассинхрон в skeleton-логике и стабилизировать схему данных без потери обратной совместимости файлов.

Ключевой принцип: `fontra.*` остаются в `customData`, но трактуются как внутренние свойства `.fontra`, а не OpenType-поля.

Выбранная политика UI: в `Font Info -> Sources` делать отдельный блок для `fontra.*` (не смешивать с OpenType settings).

## Область работ
1. Централизация storage-логики для skeleton данных.
2. Введение явной нормализации и версии схемы skeleton.
3. Удаление дублирующей регенерации контуров из editor/pointer/panel к единому helper.
4. Разделение UI-представления `source.customData` на OpenType и Fontra Internal.
5. Приведение персистентности настроек speedpunk/coarse-grid к согласованной модели.
6. Добавление тестов на инварианты хранения и миграции.

## Изменения интерфейсов и типов
1. `src-js/fontra-core/src/skeleton-contour-generator.js`
- Добавить `normalizeSkeletonData(input, options?) -> normalizedSkeletonData`.
- Добавить `regenerateSkeletonOutline(staticGlyph, skeletonData) -> { generatedContourIndices }`.
- Добавить `copySkeletonDataForLayer(layerCustomData) -> skeletonDataClone`.
- Обновить `createEmptySkeletonData()` до полной структуры с `version`.
2. Внутренняя схема `fontra.skeleton` (слой)
- Обязательные поля верхнего уровня: `version`, `contours`, `generatedContourIndices`.
- Обязательные поля контура: `isClosed`, `points`, `defaultWidth`, `defaultDistribution`, `capStyle`.
- Поля точек нормализуются по дефолтам, но не удаляются, если уже есть.
3. `src-js/views-fontinfo/src/panel-sources.js` + `src-js/fontra-webcomponents/src/custom-data-list.js`
- Добавить раздельную подачу данных:
`OpenType settings` = только `openType*`, `postscript*`, другие явно OpenType-ключи из `font-info-data`.
`Fontra internal settings` = ключи `fontra.*`.
- Ключи `fontra.*` не маркировать как OpenType нигде в UI.

## Пошаговая имплементация
1. Вынести единый skeleton-storage helper в core.
- Реализовать `normalizeSkeletonData`.
- В `normalize` делать:
  - восстановление `version` (по умолчанию `1`),
  - гарантию массивов `contours`/`generatedContourIndices`,
  - гарантию дефолтов контура,
  - защиту от malformed/NaN значений.
- Реализовать `regenerateSkeletonOutline` как единственный источник правды.
2. Подключить helper во всех точках модификации skeleton.
- Заменить локальные `_regenerateOutlineContours`/`regenerateOutline` в:
  - `src-js/views-editor/src/edit-tools-skeleton.js`
  - `src-js/views-editor/src/panel-skeleton-parameters.js`
  - `src-js/views-editor/src/edit-tools-pointer.js`
  - `src-js/views-editor/src/editor.js`
  - `src-js/views-editor/src/scene-controller.js` (где есть прямые операции с `fontra.skeleton`)
- Перед записью в `layer.customData["fontra.skeleton"]` всегда прогонять `normalizeSkeletonData`.
3. Убрать копирование лишнего `customData` между слоями.
- В местах добавления source/layer копировать только `fontra.skeleton`, а не весь `layer.customData`.
- При копировании прогонять через `copySkeletonDataForLayer` + `normalizeSkeletonData`.
4. Разделить UI customData в `Font Info -> Sources`.
- В `panel-sources` строить две секции:
  - `OpenType settings` (фильтр OpenType-ключей),
  - `Fontra internal settings` (фильтр `fontra.*`).
- В `CustomDataList` оставить общую механику, но подавать уже отфильтрованные map-объекты/контроллеры.
5. Уточнить модель персистентности settings.
- Зафиксировать:
  - `speedpunk`: user-level (`applicationSettings` localStorage), не в font file.
  - `coarse grid preset`: font-level (`font.customData["fontra.coarseGrid.settings"]`).
  - runtime значения (`sceneSettings`) только как runtime-проекция, не источник правды.
- Убрать конфликтные начальные значения (инициализация `coarseGridSpacing` в одном месте через нормализованный font preset fallback).
6. Технический долг по отладке.
- Убрать активные `console.log` из production-путей (не считая gated debug с флагом).
- Сохранить only gated debug в `skeleton-contour-generator` через глобальный флаг.

## Тесты и сценарии
1. Unit: `normalizeSkeletonData`.
- Пустой/битый input.
- Старый skeleton без `version`.
- Неинициализированные контуры/точки.
- Сохранение валидных пользовательских полей.
2. Unit: `regenerateSkeletonOutline`.
- Правильное удаление старых generated contours.
- Стабильное обновление `generatedContourIndices`.
- Идемпотентность повторного вызова.
3. Integration: skeleton editing flows.
- Изменение width/cap/profile в `panel-skeleton-parameters`.
- Drag/edit в pointer tool.
- Paste/delete/join/break skeleton.
- Проверка, что после каждой операции `layer.customData["fontra.skeleton"]` нормализован.
4. Integration: `Font Info -> Sources`.
- `openType*` и `fontra.*` разводятся по разным секциям.
- `fontra.*` не отображается как OpenType.
5. Regression: letterspacer.
- Значения `fontra.letterspacer.*` сохраняются и читаются как раньше.
- Старые файлы с этими ключами открываются без потери поведения.
6. Regression: совместимость файла.
- Файл `.fontra` после правок корректно открывается в текущей ветке.
- Геометрия и sidebearings не меняются без явных действий пользователя.

## Риски и меры
1. Риск: скрытый рассинхрон из-за множественных call-site.
- Мера: сначала внедрить helper, потом поэтапно заменить call-site с тестами на каждом шаге.
2. Риск: изменение UI может сломать ручное редактирование ключей.
- Мера: сохранить editable поведение в обоих блоках, если не выбран readonly-режим.
3. Риск: старые skeleton payload без `version`.
- Мера: мягкая миграция на чтении через `normalize`, без destructive rewrite до первой записи.

## Принятые допущения
1. `fontra.*` остаются в `customData`, но логически считаются внутренними свойствами `.fontra`.
2. Разделение в `Sources` делаем на два блока: `OpenType settings` и `Fontra internal settings`.
3. Формат файла не меняем радикально, миграция только мягкая и лениво-применяемая на чтении/перед записью.
4. В этом этапе не вводим новый top-level раздел в JSON-модели `FontSource`; работаем в рамках `customData` для совместимости.
