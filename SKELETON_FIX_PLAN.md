# План: Исправление генерации offset-контуров для скелетного инструмента

## Проблема

При генерации контуров из скелета:
1. Сэмплированные точки показывают правильную форму offset-кривой
2. Но результат содержит множество точек, помеченных как `type: "cubic"`, которые не являются настоящими контрольными точками Bezier
3. Когда path-рендерер интерпретирует их как cubic control points, получается кривая, не совпадающая с ожидаемой формой
4. Дополнительно: свойство `smooth` копируется, но коллинеарность рукояток не обеспечивается

## Текущий алгоритм (некорректный)

**Файл:** `src-js/fontra-core/src/skeleton-contour-generator.js`, строки 260-314

```javascript
// Bezier segment - sample and offset
const numSamples = Math.max(8, segment.controlPoints.length * 4);

for (let i = startSample; i <= endSample; i++) {
  const t = i / numSamples;
  const point = bezier.get(t);
  // ... offset по нормали ...
  const pointType = isEndpoint ? null : "cubic";  // ПРОБЛЕМА: это не контрольные точки!
  left.push({ x, y, type: pointType, smooth });
}
```

## Решение: Cubic Bezier Fitting

Вместо создания множества "псевдо-cubic" точек, нужно:
1. Сэмплировать offset-позиции
2. Аппроксимировать (fit) одним cubic bezier по этим точкам
3. Сохранять только 4 точки: start (on-curve) + 2 control points (off-curve) + end (on-curve)

### Алгоритм fitting (метод наименьших квадратов)

Для аппроксимации N точек одним cubic bezier используется стандартный алгоритм:

1. Конечные точки фиксированы: P0 = первая точка, P3 = последняя точка
2. Параметризуем точки по длине дуги (chord-length parametrization)
3. Решаем систему уравнений для P1, P2 (control points) методом наименьших квадратов

Формулы:
```
B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3

Минимизируем: Σ(B(ti) - Si)²
где Si — сэмплированные точки, ti — их параметры
```

### Шаг 1: Добавить функцию fitCubicBezier

```javascript
/**
 * Fit a cubic bezier to a set of points.
 * Uses least-squares fitting with chord-length parametrization.
 * @param {Array} points - Array of {x, y} points
 * @returns {Object} - {p0, p1, p2, p3} control points
 */
function fitCubicBezier(points) {
  if (points.length < 2) return null;
  if (points.length === 2) {
    // Line segment - control points at 1/3 and 2/3
    const p0 = points[0];
    const p3 = points[1];
    return {
      p0,
      p1: { x: p0.x + (p3.x - p0.x) / 3, y: p0.y + (p3.y - p0.y) / 3 },
      p2: { x: p0.x + 2 * (p3.x - p0.x) / 3, y: p0.y + 2 * (p3.y - p0.y) / 3 },
      p3
    };
  }

  const n = points.length;
  const p0 = points[0];
  const p3 = points[n - 1];

  // Chord-length parametrization
  const t = chordLengthParametrize(points);

  // Set up least squares matrices for P1 and P2
  // ... (implementation details below)

  return { p0, p1, p2, p3 };
}
```

### Шаг 2: Изменить generateOffsetPointsForSegment

Для Bezier-сегментов:

```javascript
// OLD: sample and create many points
// NEW: sample, fit cubic, return 4 points

// 1. Sample offset positions (keep existing sampling code)
const sampledLeft = [];
const sampledRight = [];
for (let i = 0; i <= numSamples; i++) {
  // ... existing offset calculation ...
  sampledLeft.push({ x: leftX, y: leftY });
  sampledRight.push({ x: rightX, y: rightY });
}

// 2. Fit cubic bezier to samples
const fittedLeft = fitCubicBezier(sampledLeft);
const fittedRight = fitCubicBezier(sampledRight);

// 3. Return proper cubic segment (4 points each side)
left.push(
  { ...fittedLeft.p0, smooth: segment.startPoint.smooth },
  { ...fittedLeft.p1, type: "cubic" },
  { ...fittedLeft.p2, type: "cubic" },
  { ...fittedLeft.p3, smooth: segment.endPoint.smooth }
);
// Similar for right side
```

### Шаг 3: Обеспечить коллинеарность для smooth-точек

После fitting, если точка помечена как smooth, нужно скорректировать соседние control points:

```javascript
function enforceSmoothColinearity(points, isClosed) {
  // Для каждой on-curve smooth точки:
  // 1. Найти входящий и исходящий control points
  // 2. Усреднить направление
  // 3. Скорректировать позиции, сохраняя длины
}
```

## Файлы для изменения

| Файл | Изменение |
|------|-----------|
| `src-js/fontra-core/src/skeleton-contour-generator.js` | Добавить `fitCubicBezier()`, изменить `generateOffsetPointsForSegment()`, добавить `enforceSmoothColinearity()` |

## Хранение данных и обратная совместимость

Архитектура уже обеспечивает обратную совместимость:
- Скелет в `layer.customData["fontra.skeleton"]`
- Контуры в обычном `path`
- Бэкенд не требует изменений
- При экспорте в шрифт используется только `path`

## Проверка

1. Создать скелетный контур с Bezier-сегментами
2. Убедиться, что сгенерированные контуры визуально совпадают с сэмплированными точками
3. Проверить, что результат содержит правильное количество точек (4 на сегмент вместо множества)
4. Проверить коллинеарность рукояток для smooth-точек
5. Сохранить/открыть файл — проверить сохранность данных

## Технические детали: Cubic Bezier Fitting

### Chord-Length Parametrization

```javascript
function chordLengthParametrize(points) {
  const n = points.length;
  const t = new Array(n);
  t[0] = 0;

  let totalLength = 0;
  for (let i = 1; i < n; i++) {
    totalLength += Math.hypot(
      points[i].x - points[i-1].x,
      points[i].y - points[i-1].y
    );
  }

  let cumLength = 0;
  for (let i = 1; i < n; i++) {
    cumLength += Math.hypot(
      points[i].x - points[i-1].x,
      points[i].y - points[i-1].y
    );
    t[i] = cumLength / totalLength;
  }

  return t;
}
```

### Least Squares Fitting

Для решения системы используем формулы:
- A1·P1 + A2·P2 = C1
- A3·P1 + A4·P2 = C2

Где коэффициенты вычисляются из базисных функций Безье и параметров t.
