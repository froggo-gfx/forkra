# План: Упрощение offset-кривых

## Проблема

`bezier.offset()` возвращает массив из нескольких кривых Безье вместо одной. Это создаёт лишние промежуточные точки в результирующем контуре.

## Исследование

### Что выяснено:

1. **bezier-js `offset()`** автоматически разбивает кривую на сегменты — это не регулируется.

2. **Стандартный подход к упрощению** (Paper.js и др.): сэмплировать точки → fitCubic.

3. **`fitCubic` уже есть** в проекте (`/src-js/fontra-core/src/fit-cubic.js`).

4. **Предыдущая попытка** использовать fitCubic давала сильное отклонение кривой.

### Причина отклонения:

`bezier.offset()` разбивает кривую в местах высокой кривизны. На стыках сегментов касательные могут не совпадать. Попытка аппроксимировать все сегменты одной кривой с неправильными касательными даёт отклонение.

## Решение

**Использовать `bezier.offset()`, но упрощать его результат.**

`bezier.offset()` даёт математически корректный offset с учётом кривизны. Проблема только в количестве сегментов.

Подход:
1. Получить результат `bezier.offset()` — массив кривых Безье
2. Сэмплировать точки на **этих offset-кривых** (пройтись по всем сегментам)
3. Вычислить касательные на концах из **первой и последней offset-кривой**
4. Использовать `fitCubic` для аппроксимации всех точек одной кубической кривой
5. Проверить ошибку — если допустима, использовать упрощённую кривую; иначе оставить оригинал

## Детали реализации

### Файл: `/src-js/fontra-core/src/skeleton-contour-generator.js`

### Константы и флаги:

```javascript
// Флаг включения упрощения (для будущего использования)
const SIMPLIFY_OFFSET_CURVES = true; // TODO: в будущем сделать настраиваемым

// Порог ошибки как процент от ширины stroke
const SIMPLIFY_ERROR_PERCENT = 0.05; // 5% от halfWidth
```

**Вычисление порога:**
```javascript
const errorThreshold = halfWidth * SIMPLIFY_ERROR_PERCENT;
```

При halfWidth = 10 upm → errorThreshold = 0.5 upm
При halfWidth = 50 upm → errorThreshold = 2.5 upm

В будущем эти параметры можно будет:
- Вынести в настройки пользователя
- Передавать как параметры в `skeletonContour`
- Добавить в UI

### Изменения в функции `generateOffsetPointsForSegment`:

```javascript
// Получаем offset как раньше
const offsetLeftCurves = bezier.offset(-halfWidth);
const offsetRightCurves = bezier.offset(halfWidth);

// Пытаемся упростить (если флаг включён)
let simplifiedLeft = null;
let simplifiedRight = null;

if (SIMPLIFY_OFFSET_CURVES) {
  simplifiedLeft = trySimplifyOffsetCurves(offsetLeftCurves, errorThreshold);
  simplifiedRight = trySimplifyOffsetCurves(offsetRightCurves, errorThreshold);
}

// Если упрощение удалось — используем одну кривую вместо массива
if (simplifiedLeft) {
  // simplifiedLeft.points — массив из 4 точек [start, ctrl1, ctrl2, end]
  // Конвертируем в формат контура
  addSimplifiedCurve(simplifiedLeft, left, fixedStartLeft, fixedEndLeft, ...);
} else {
  // Используем оригинальный результат offset
  addOffsetCurves(offsetLeftCurves, left, ...);
}
// Аналогично для right
```

### Новая функция `trySimplifyOffsetCurves`:

```javascript
function trySimplifyOffsetCurves(offsetCurves, errorThreshold = 1.0) {
  // offsetCurves — массив Bezier объектов от bezier.offset()

  if (!offsetCurves || offsetCurves.length === 0) {
    return null;
  }

  // Если только одна кривая — упрощать не нужно
  if (offsetCurves.length === 1) {
    return null;
  }

  // 1. Сэмплировать точки на всех offset-кривых
  const samplePoints = [];
  const samplesPerCurve = 5;

  for (let i = 0; i < offsetCurves.length; i++) {
    const curve = offsetCurves[i];
    const isLast = i === offsetCurves.length - 1;

    // Сэмплируем точки на каждой кривой
    for (let j = 0; j <= samplesPerCurve; j++) {
      // Пропускаем последнюю точку кроме последней кривой (избегаем дубликатов)
      if (j === samplesPerCurve && !isLast) continue;

      const t = j / samplesPerCurve;
      samplePoints.push(curve.get(t));
    }
  }

  // 2. Вычислить касательные из первой и последней offset-кривой
  const firstCurve = offsetCurves[0];
  const lastCurve = offsetCurves[offsetCurves.length - 1];

  const startDeriv = firstCurve.derivative(0);
  const endDeriv = lastCurve.derivative(1);

  const leftTangent = normalizeVector(startDeriv);
  const rightTangent = normalizeVector({ x: -endDeriv.x, y: -endDeriv.y });

  // 3. Попробовать fitCubic
  const fitted = fitCubic(samplePoints, leftTangent, rightTangent, errorThreshold);

  // 4. Проверить ошибку
  const params = chordLengthParameterize(samplePoints);
  const [maxError] = computeMaxError(samplePoints, fitted, params);

  if (maxError < errorThreshold) {
    return fitted; // Bezier объект с 4 точками
  }

  return null; // fallback — использовать оригинальные кривые
}
```

## Файлы для изменения

1. `/src-js/fontra-core/src/skeleton-contour-generator.js` — основная логика
2. Добавить импорт `fitCubic`, `computeMaxError`, `chordLengthParameterize` из `fit-cubic.js`

## Верификация

1. Запустить редактор
2. Создать скелетную кривую с изгибом
3. Проверить, что offset-контур содержит меньше точек
4. Проверить визуально, что форма не искажена
5. Запустить тесты: `npm test` в `src-js/fontra-core`
