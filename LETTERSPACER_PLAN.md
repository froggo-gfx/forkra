# Letterspacer Panel для Fontra (JS-only)

## Обзор

Портируем алгоритм HTLetterspacer в Fontra как боковую панель. Вся логика на JavaScript — без Python backend.

**Исходный алгоритм:** `/home/anton/HTLetterspacer/HT_LetterSpacer_script.py`

---

## Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│  LetterspacerPanel (JS)                                         │
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │ UI (Form)   │───▶│ Engine      │───▶│ Apply       │         │
│  │ параметры   │    │ алгоритм    │    │ изменения   │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│                            │                                    │
│                     PathHitTester                               │
│                     (ray casting)                               │
└─────────────────────────────────────────────────────────────────┘
```

**Преимущества JS-only:**
- Мгновенный отклик (нет WebSocket round-trip)
- Возможность preview в реальном времени
- Меньше кода, проще поддержка
- Всё в одном месте

---

## Файлы для создания

### 1. `src-js/views-editor/src/panel-letterspacer.js`

Основной файл — панель + движок алгоритма:

```javascript
import { PathHitTester } from "@fontra/core/path-hit-tester.js";
import * as html from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { Form } from "@fontra/web-components/ui-form.js";
import Panel from "./panel.js";

// ============================================================
// LETTERSPACER ENGINE (порт из HTLetterspacer)
// ============================================================

function polygonArea(points) {
  // Shoelace formula
  let s = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    s += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(s) * 0.5;
}

function setDepth(margins, extreme, maxDepth) {
  // Ограничить глубину margins до maxDepth от extreme
  return margins.map(p => ({
    x: Math.max(p.x, extreme - maxDepth),  // для левого
    y: p.y
  }));
}

function diagonize(margins) {
  // Закрыть открытые каунтеры под 45°
  const result = [];
  for (let i = 0; i < margins.length; i++) {
    result.push(margins[i]);
    if (i < margins.length - 1) {
      const curr = margins[i];
      const next = margins[i + 1];
      const deltaY = next.y - curr.y;
      const deltaX = next.x - curr.x;
      if (Math.abs(deltaX) > deltaY) {
        // Нужна диагональ
        const midY = curr.y + Math.abs(deltaX);
        result.push({ x: curr.x, y: midY });
      }
    }
  }
  return result;
}

function closePolygon(margins, extreme, minY, maxY) {
  // Замкнуть margins в полигон добавив вертикальную линию
  const polygon = [...margins];
  polygon.push({ x: extreme, y: maxY });
  polygon.push({ x: extreme, y: minY });
  return polygon;
}

function calculateSidebearing(polygon, targetArea, amplitudeY) {
  const currentArea = polygonArea(polygon);
  const shortfall = targetArea - currentArea;
  return shortfall / amplitudeY;
}

class LetterspacerEngine {
  constructor(params, fontMetrics) {
    this.params = params;
    this.upm = fontMetrics.upm;
    this.xHeight = fontMetrics.xHeight;
    this.angle = fontMetrics.italicAngle || 0;
  }

  computeSpacing(path, bounds, refMinY, refMaxY) {
    const freq = 5;  // шаг сканирования
    const amplitudeY = refMaxY - refMinY;

    // Целевая белая площадь
    const areaUPM = this.params.area * Math.pow(this.upm / 1000, 2);
    const targetArea = (amplitudeY * areaUPM * 100) / this.xHeight;

    // Максимальная глубина
    const maxDepth = this.xHeight * this.params.depth / 100;

    // Собрать margins
    const { leftMargins, rightMargins, leftExtreme, rightExtreme } =
      this.collectMargins(path, bounds, refMinY, refMaxY, freq);

    if (leftMargins.length < 2 || rightMargins.length < 2) {
      return { lsb: null, rsb: null };
    }

    // Обработка margins
    let processedLeft = setDepth(leftMargins, leftExtreme, maxDepth);
    let processedRight = setDepth(rightMargins, rightExtreme, -maxDepth);

    processedLeft = diagonize(processedLeft);
    processedRight = diagonize(processedRight);

    // Замкнуть полигоны
    const leftPolygon = closePolygon(processedLeft, leftExtreme, refMinY, refMaxY);
    const rightPolygon = closePolygon(processedRight, rightExtreme, refMinY, refMaxY);

    // Вычислить sidebearings
    const lsb = calculateSidebearing(leftPolygon, targetArea, amplitudeY);
    const rsb = calculateSidebearing(rightPolygon, targetArea, amplitudeY);

    return { lsb, rsb };
  }

  collectMargins(path, bounds, minY, maxY, freq) {
    const hitTester = new PathHitTester(path, bounds);
    const leftMargins = [];
    const rightMargins = [];
    let leftExtreme = bounds.xMin;
    let rightExtreme = bounds.xMax;

    for (let y = minY; y <= maxY; y += freq) {
      const intersections = hitTester.lineIntersections(
        { x: bounds.xMin - 100, y },
        { x: bounds.xMax + 100, y }
      );

      if (intersections.length >= 2) {
        // Сортируем по x
        const sorted = intersections
          .map(i => i.x !== undefined ? i : { x: i.point?.x })
          .filter(i => i.x !== undefined)
          .sort((a, b) => a.x - b.x);

        if (sorted.length >= 2) {
          const left = sorted[0].x;
          const right = sorted[sorted.length - 1].x;

          leftMargins.push({ x: left, y });
          rightMargins.push({ x: right, y });

          leftExtreme = Math.min(leftExtreme, left);
          rightExtreme = Math.max(rightExtreme, right);
        }
      }
    }

    return { leftMargins, rightMargins, leftExtreme, rightExtreme };
  }
}

// ============================================================
// PANEL UI
// ============================================================

export default class LetterspacerPanel extends Panel {
  identifier = "letterspacer";
  iconPath = "/tabler-icons/spacing-horizontal.svg";

  constructor(editorController) {
    super(editorController);
    this.infoForm = new Form();
    this.contentElement.appendChild(
      html.div(
        { class: "panel-section panel-section--flex panel-section--scrollable" },
        [this.infoForm]
      )
    );
    this.fontController = this.editorController.fontController;
    this.sceneController = this.editorController.sceneController;

    this.params = {
      area: 400,
      depth: 15,
      overshoot: 0,
      applyLSB: true,
      applyRSB: true,
      referenceGlyph: "",
    };
  }

  getContentElement() {
    return html.div({ class: "panel" }, []);
  }

  async update(senderInfo) {
    if (!this.infoForm.contentElement.offsetParent) return;
    await this.fontController.ensureInitialized;

    const formContents = [
      { type: "header", label: translate("sidebar.letterspacer.title") },

      { type: "edit-number", key: "area",
        label: translate("sidebar.letterspacer.area"),
        value: this.params.area },

      { type: "edit-number", key: "depth",
        label: translate("sidebar.letterspacer.depth"),
        value: this.params.depth },

      { type: "edit-number", key: "overshoot",
        label: translate("sidebar.letterspacer.overshoot"),
        value: this.params.overshoot },

      { type: "divider" },

      { type: "checkbox", key: "applyLSB",
        label: translate("sidebar.letterspacer.apply-lsb"),
        value: this.params.applyLSB },

      { type: "checkbox", key: "applyRSB",
        label: translate("sidebar.letterspacer.apply-rsb"),
        value: this.params.applyRSB },

      { type: "divider" },

      { type: "edit-text", key: "referenceGlyph",
        label: translate("sidebar.letterspacer.reference"),
        value: this.params.referenceGlyph },

      { type: "spacer" },
    ];

    // Apply button
    const applyButton = html.createDomElement("button", {
      onclick: () => this.applySpacing(),
    });
    applyButton.textContent = translate("sidebar.letterspacer.apply");

    formContents.push({
      type: "auxiliaryElement",
      auxiliaryElement: applyButton,
    });

    this.infoForm.setFieldDescriptions(formContents);
    this.infoForm.onFieldChange = (fieldItem, value) => {
      this.params[fieldItem.key] = value;
    };
  }

  async applySpacing() {
    const positionedGlyph = this.sceneController.sceneModel.getSelectedPositionedGlyph();
    if (!positionedGlyph) return;

    // Font metrics
    const fontMetrics = await this.getFontMetrics();

    // Reference bounds
    const refBounds = await this.getReferenceBounds(fontMetrics);

    // Engine
    const engine = new LetterspacerEngine(this.params, fontMetrics);

    await this.sceneController.editGlyphAndRecordChanges((glyph) => {
      const layerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(glyph.layers);

      for (const [layerName, layerGlyph] of Object.entries(layerGlyphs)) {
        const path = layerGlyph.path;
        const bounds = path.getBounds?.() || path.getControlBounds?.();
        if (!bounds) continue;

        const { lsb, rsb } = engine.computeSpacing(
          path, bounds, refBounds.minY, refBounds.maxY
        );

        if (lsb === null || rsb === null) continue;

        const currentLSB = bounds.xMin;
        const glyphWidth = bounds.xMax - bounds.xMin;

        if (this.params.applyLSB) {
          const deltaLSB = lsb - currentLSB;
          // Сдвинуть path
          this.shiftPath(layerGlyph.path, deltaLSB);
        }

        if (this.params.applyRSB || this.params.applyLSB) {
          // Пересчитать xAdvance
          const newBounds = layerGlyph.path.getBounds?.() || layerGlyph.path.getControlBounds?.();
          if (this.params.applyRSB) {
            layerGlyph.xAdvance = newBounds.xMax + rsb;
          } else {
            layerGlyph.xAdvance = newBounds.xMax + (layerGlyph.xAdvance - bounds.xMax);
          }
        }
      }

      return "letterspacer";
    }, undefined, true);
  }

  shiftPath(path, deltaX) {
    // Сдвинуть все x координаты
    const coords = path.coordinates;
    for (let i = 0; i < coords.length; i += 2) {
      coords[i] += deltaX;
    }
  }

  async getFontMetrics() {
    const fontSource = this.fontController.fontSourcesInstancer?.fontSourceAtLocation?.(
      this.sceneController.sceneSettings.fontLocationSourceMapped
    );
    const lineMetrics = fontSource?.lineMetricsHorizontalLayout || {};

    return {
      upm: this.fontController.unitsPerEm,
      xHeight: lineMetrics.xHeight?.value || this.fontController.unitsPerEm * 0.5,
      italicAngle: fontSource?.italicAngle || 0,
    };
  }

  async getReferenceBounds(fontMetrics) {
    // Если указан reference glyph — использовать его bounds
    if (this.params.referenceGlyph) {
      const refGlyph = await this.fontController.getGlyph(this.params.referenceGlyph);
      if (refGlyph) {
        const layer = Object.values(refGlyph.layers)[0];
        const bounds = layer?.glyph?.path?.getBounds?.();
        if (bounds) {
          const overshoot = fontMetrics.xHeight * this.params.overshoot / 100;
          return {
            minY: bounds.yMin - overshoot,
            maxY: bounds.yMax + overshoot
          };
        }
      }
    }

    // Fallback: использовать xHeight
    const overshoot = fontMetrics.xHeight * this.params.overshoot / 100;
    return {
      minY: -overshoot,
      maxY: fontMetrics.xHeight + overshoot
    };
  }

  async toggle(on, focus) {
    if (on) this.update();
  }
}

customElements.define("panel-letterspacer", LetterspacerPanel);
```

---

## Файлы для модификации

### 2. `src-js/views-editor/src/editor.js`

Добавить импорт и регистрацию:

```javascript
// ~line 30 (imports)
import LetterspacerPanel from "./panel-letterspacer.js";

// ~line 1080 (в initSidebars, после TransformationPanel)
this.addSidebarPanel(new LetterspacerPanel(this), "right");
```

### 3. `src-js/fontra-core/assets/lang/en.js`

Добавить строки локализации:

```javascript
"sidebar.letterspacer.title": "Letterspacer",
"sidebar.letterspacer.area": "Area",
"sidebar.letterspacer.depth": "Depth (%)",
"sidebar.letterspacer.overshoot": "Overshoot (%)",
"sidebar.letterspacer.apply-lsb": "LSB",
"sidebar.letterspacer.apply-rsb": "RSB",
"sidebar.letterspacer.reference": "Reference",
"sidebar.letterspacer.apply": "Apply",
```

---

## Порядок имплементации

1. **panel-letterspacer.js**
   - Создать файл
   - Реализовать LetterspacerEngine (функции алгоритма)
   - Реализовать LetterspacerPanel (UI)

2. **editor.js**
   - Добавить import
   - Добавить addSidebarPanel

3. **en.js**
   - Добавить строки локализации

---

## Верификация

### Тест 1: Запуск
```bash
cd /home/anton/forkra
python -m fontra
```
Открыть браузер → панель Letterspacer должна появиться справа.

### Тест 2: Базовый spacing
1. Открыть шрифт
2. Выбрать глиф "n" или "o"
3. Панель Letterspacer → Area=400, Depth=15
4. Apply
5. Sidebearings должны измениться

### Тест 3: Reference glyph
1. Reference = "x"
2. Apply на "n"
3. Spacing должен основываться на высоте "x"

### Тест 4: Undo
1. Apply spacing
2. Ctrl+Z
3. Spacing должен откатиться

---

## Итого файлов

| Действие | Файл |
|----------|------|
| Создать | `src-js/views-editor/src/panel-letterspacer.js` |
| Изменить | `src-js/views-editor/src/editor.js` (~2 строки) |
| Изменить | `src-js/fontra-core/assets/lang/en.js` (~8 строк) |

**Всего:** 1 новый файл (~250 строк), 2 минимальных изменения.
