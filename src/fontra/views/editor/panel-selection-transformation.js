import {
  decomposeAffineTransform,
  decomposeComponents,
} from "../core/glyph-controller.js";
import SelectionInfoPanel from "./panel-selection-info.js";
import * as html from "/core/html-utils.js";
import { getSelectionByContour, makeExpandedIndexSet } from "/core/path-functions.js";
import { rectFromPoints, rectSize, unionRect } from "/core/rectangle.js";
import { Transform } from "/core/transform.js";
import {
  enumerate,
  findNestedActiveElement,
  getCharFromCodePoint,
  makeAffineTransform,
  makeUPlusStringFromCodePoint,
  parseSelection,
  range,
  round,
  splitGlyphNameExtension,
  throttleCalls,
} from "/core/utils.js";
import { Form } from "/web-components/ui-form.js";

export default class SelectionTransformationPanel extends SelectionInfoPanel {
  identifier = "selection-transformation";
  iconPath = "/tabler-icons/shape.svg";

  scaleX = 100;
  scaleY = undefined;
  scaleFactorX = 1;
  scaleFactorY = 1;
  rotation = 0;
  moveX = 0;
  moveY = 0;
  originX = "center";
  originY = "middle";
  originXButton = undefined;
  originYButton = undefined;
  skewX = 0;
  skewY = 0;

  static styles = `
    .selection-transformation {
      display: flex;
      flex-direction: column;
      gap: 1em;
      justify-content: space-between;
      box-sizing: border-box;
      height: 100%;
      width: 100%;
      padding: 1em;
      white-space: normal;
    }

  `;

  getContentElement() {
    return html.div(
      {
        class: "selection-transformation",
      },
      []
    );
  }

  async update(senderInfo) {
    if (
      senderInfo?.senderID === this &&
      senderInfo?.fieldKeyPath?.length !== 3 &&
      senderInfo?.fieldKeyPath?.[0] !== "component" &&
      senderInfo?.fieldKeyPath?.[2] !== "name"
    ) {
      return;
    }
    if (!this.infoForm.contentElement.offsetParent) {
      // If the info form is not visible, do nothing
      return;
    }

    await this.fontController.ensureInitialized;

    const glyphName = this.sceneController.sceneSettings.selectedGlyphName;
    const glyphController = await this.sceneController.sceneModel.getGlyphInstance(
      glyphName,
      this.sceneController.sceneSettings.editLayerName
    );

    const formContents = [];

    formContents.push({ type: "header", label: `Transformations` });

    let radio_button_origin = html.createDomElement("div", {
      class: "origin-radio-buttons ui-form-center",
    });

    for (const keyY of ["top", "middle", "bottom"]) {
      for (const keyX of ["left", "center", "right"]) {
        const key = `${keyX}-${keyY}`;
        let radio_button = html.createDomElement("input", {
          "type": "radio",
          "value": key,
          "name": "origin",
          "v-model": "role",
          "checked": keyX === this.originX && keyY === this.originY ? "checked" : "",
          "onclick": (event) => this._changeOrigin(keyX, keyY),
          "data-tooltip": `Origin ${keyY} ${keyX}`,
          "data-tooltipposition": "bottom",
        });
        radio_button_origin.appendChild(radio_button);
      }
    }

    formContents.push({
      type: "single-icon",
      element: radio_button_origin,
    });

    formContents.push({ type: "divider" });

    formContents.push({
      type: "edit-number-x-y",
      key: '["selectionTransformationOrigin"]',
      label: "Origin",
      fieldX: {
        key: '["selectionTransformationOriginX"]',
        value: this.originXButton,
        getValue: (layerGlyph, layerGlyphController, fieldItem) => {
          return fieldItem.value;
        },
        setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
          this.originX = value;
          this.originXButton = value;
          this.update();
          return value;
        },
      },
      fieldY: {
        key: '["selectionTransformationOriginY"]',
        value: this.originYButton,
        getValue: (layerGlyph, layerGlyphController, fieldItem) => {
          return fieldItem.value;
        },
        setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
          this.originY = value;
          this.originYButton = value;
          this.update();
          return value;
        },
      },
    });

    formContents.push({ type: "divider" });

    let button_move = html.createDomElement("icon-button", {
      src: "/tabler-icons/arrow-move-right.svg",
      onclick: (event) =>
        this._transformLayerGlyph({
          translateX: this.moveX,
          translateY: this.moveY,
          undoName: "move",
        }),
      class: "ui-form-icon ui-form-icon-button",
      /*       "data-tooltip": "Move",
      "data-tooltipposition": "left", */
    });

    formContents.push({
      type: "edit-number-x-y",
      key: '["selectionTransformationMove"]',
      label: button_move,
      fieldX: {
        key: '["selectionTransformationMoveX"]',
        value: this.moveX,
        getValue: (layerGlyph, layerGlyphController, fieldItem) => {
          return fieldItem.value;
        },
        setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
          this.moveX = value;
          return value;
        },
      },
      fieldY: {
        key: '["selectionTransformationMoveY"]',
        value: this.moveY,
        getValue: (layerGlyph, layerGlyphController, fieldItem) => {
          return fieldItem.value;
        },
        setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
          this.moveY = value;
          return value;
        },
      },
    });

    let button_scale = html.createDomElement("icon-button", {
      src: "/tabler-icons/dimensions.svg",
      onclick: (event) =>
        this._transformLayerGlyph({
          scaleX: this.scaleFactorX,
          scaleY: this.scaleY ? this.scaleFactorY : this.scaleFactorX,
          undoName: "scale",
        }),
      class: "ui-form-icon ui-form-icon-button",
      /*       "data-tooltip": "Scale",
      "data-tooltipposition": "left", */
    });

    formContents.push({
      type: "edit-number-x-y",
      key: '["selectionTransformationScale"]',
      label: button_scale,
      fieldX: {
        key: '["selectionTransformationScaleX"]',
        id: "selection-transformation-scaleX",
        value: this.scaleX,
        getValue: (layerGlyph, layerGlyphController, fieldItem) => {
          return fieldItem.value;
        },
        setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
          this.scaleX = value;
          this.scaleFactorX = value / 100;
          return value;
        },
      },
      fieldY: {
        key: '["selectionTransformationScaleY"]',
        id: "selection-transformation-scaleY",
        value: this.scaleY,
        getValue: (layerGlyph, layerGlyphController, fieldItem) => {
          return fieldItem.value;
        },
        setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
          this.scaleY = value;
          this.scaleFactorY = value / 100;
          return value;
        },
      },
    });

    let button_rotate = html.createDomElement("icon-button", {
      src: "/tabler-icons/rotate.svg",
      onclick: (event) =>
        this._transformLayerGlyph({
          rotation: this.rotation,
          undoName: "rotate",
        }),
      class: "ui-form-icon ui-form-icon-button",
      /*       "data-tooltip": "Rotate",
      "data-tooltipposition": "left", */
    });

    formContents.push({
      type: "edit-number",
      key: '["selectionTransformationRotate"]',
      label: button_rotate,
      value: this.rotation,
      getValue: (layerGlyph, layerGlyphController, fieldItem) => {
        return fieldItem.value;
      },
      setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
        this.rotation = value;
        return value;
      },
    });

    let button_skew = html.createDomElement("icon-button", {
      src: "/tabler-icons/angle.svg",
      onclick: (event) =>
        this._transformLayerGlyph({
          skewX: this.skewX,
          skewY: this.skewY,
          undoName: "slant",
        }),
      class: "ui-form-icon ui-form-icon-button",
      /*       "data-tooltip": "Slant",
      "data-tooltipposition": "left", */
    });

    formContents.push({
      type: "edit-number-x-y",
      key: '["selectionTransformationSkew"]',
      label: button_skew,
      fieldX: {
        key: '["selectionTransformationSkewX"]',
        id: "selection-transformation-skewX",
        value: this.skewX,
        getValue: (layerGlyph, layerGlyphController, fieldItem) => {
          return fieldItem.value;
        },
        setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
          this.skewX = value;
          return value;
        },
      },
      fieldY: {
        key: '["selectionTransformationSkewY"]',
        id: "selection-transformation-skewY",
        value: this.skewY,
        getValue: (layerGlyph, layerGlyphController, fieldItem) => {
          return fieldItem.value;
        },
        setValue: (layerGlyph, layerGlyphController, fieldItem, value) => {
          this.skewY = value;
          return value;
        },
      },
    });

    formContents.push({ type: "divider" });

    formContents.push({
      type: "icons",
      label: "Flip",
      auxiliaryElements: [
        html.createDomElement("icon-button", {
          src: "/tabler-icons/flip-vertical.svg",
          onclick: (event) =>
            this._transformLayerGlyph({
              scaleX: -1,
              scaleY: 1,
              undoName: "flip vertically",
            }),
          /* "data-tooltip": "Flip vertically",
          "data-tooltipposition": "left", */
        }),
        html.createDomElement("icon-button", {
          src: "/tabler-icons/flip-horizontal.svg",
          onclick: (event) =>
            this._transformLayerGlyph({
              scaleX: 1,
              scaleY: -1,
              undoName: "flip horizontally",
            }),
          /* "data-tooltip": "Flip horizontally",
          "data-tooltipposition": "left", */
        }),
      ],
    });

    this._formFieldsByKey = {};
    for (const field of formContents) {
      if (field.fieldX) {
        this._formFieldsByKey[field.fieldX.key] = field.fieldX;
        this._formFieldsByKey[field.fieldY.key] = field.fieldY;
      } else {
        this._formFieldsByKey[field.key] = field;
      }
    }

    this.infoForm.setFieldDescriptions(formContents);
    if (glyphController) {
      await this._setupSelectionInfoHandlers(glyphName);
    }
  }

  _getSelectedBounds(layerGlyph, pointIndices, componentIndices) {
    const selectionRects = [];
    if (pointIndices.length) {
      const selRect = rectFromPoints(
        pointIndices.map((i) => layerGlyph.path.getPoint(i)).filter((point) => !!point)
      );
      if (selRect) {
        selectionRects.push(selRect);
      }
    }
    // the following does not work, yet
    // because I am not able to get the bounds of the components
    /*     console.log("layerGlyph", layerGlyph);
    console.log("layerGlyph.name", layerGlyph.name);
    const getGlyphFunc = (glyphName) => this.fontController.getGlyph(glyphName);
    for (const componentIndex of componentIndices) {
      const compo = layerGlyph.components[componentIndex];
      console.log("compo", compo);
      const decomposed = {};
      decomposed[componentIndex] = await decomposeComponents(
        layerGlyph.components,
        componentIndices,
        layerGlyph.locations,
        getGlyphFunc
      );
      console.log("decomposed", decomposed);

    } */

    //NOTE see: decomposeSelectedComponents
    //const componentController = glyph.components[componentIndex];

    /*     // Get the decomposed path/components for each editing layer
    const getGlyphFunc = (glyphName) => this.fontController.getGlyph(glyphName);
    const decomposed = {};)
    decomposed[layerName] = await decomposeComponents(
      layerGlyph.components,
      componentIndices,
      layerLocations[layerName],
      getGlyphFunc
    ); */

    /*     for (const componentIndex of componentIndices) {
      const component = glyphController.components[componentIndex];
      console.log("component", component);
      console.log("component.controlBounds", component.controlBounds);

      if (!component || !component.controlBounds) {
        continue;
      }
      selectionRects.push(component.bounds);
    }
    if (!selectionRects.length && glyphController?.controlBounds) {
      selectionRects.push(glyphController.bounds);
    } */

    if (selectionRects.length) {
      const selectionBounds = unionRect(...selectionRects);
      return selectionBounds;
    }
  }

  _getPinPoint(layerGlyph, pointIndices, componentIndices, originX, originY) {
    let bounds = this._getSelectedBounds(layerGlyph, pointIndices, componentIndices);
    if (!bounds) {
      bounds = {
        xMin: 0,
        xMax: layerGlyph.xAdvance,
        yMin: 0,
        yMax: layerGlyph.yAdvance ? layerGlyph.yAdvance : 0,
      };
    }
    const width = bounds.xMax - bounds.xMin;
    const height = bounds.yMax - bounds.yMin;

    // default from center
    let pinPointX = bounds.xMin + width / 2;
    let pinPointY = bounds.yMin + height / 2;

    if (typeof originX === "number") {
      pinPointX = originX;
    } else if (originX === "left") {
      pinPointX = bounds.xMin;
    } else if (originX === "right") {
      pinPointX = bounds.xMax;
    }

    if (typeof originY === "number") {
      pinPointY = originY;
    } else if (originY === "top") {
      pinPointY = bounds.yMax;
    } else if (originY === "bottom") {
      pinPointY = bounds.yMin;
    }

    return { x: pinPointX, y: pinPointY };
  }

  _getPointIndicesInclOffCurves(path, pointIndices) {
    let newPointIndices = new Set();
    const selectionByContour = getSelectionByContour(path, pointIndices);
    for (const [contourIndex, contourPointIndices] of selectionByContour.entries()) {
      const startPoint = path.getAbsolutePointIndex(contourIndex, 0);
      const indexSet = makeExpandedIndexSet(
        path,
        contourPointIndices,
        contourIndex,
        startPoint
      );

      for (const i of indexSet) {
        const pointAbsolutIndex = path.getAbsolutePointIndex(contourIndex, i);
        newPointIndices.add(pointAbsolutIndex);
        const point = path.getPoint(pointAbsolutIndex);
        if (point.smooth) {
          // get the off curve points if the point is smooth
          for (const index of [pointAbsolutIndex - 1, pointAbsolutIndex + 1]) {
            const pointCloseTo = path.getPoint(index);
            if (!pointCloseTo) {
              continue;
            }
            if (pointCloseTo.type === "cubic" || pointCloseTo.type === "quadratic") {
              newPointIndices.add(index);
            }
          }
        }
      }
    }
    return Array.from(newPointIndices).sort((a, b) => a - b);
  }

  async _transformLayerGlyph({
    originX = this.originX,
    originY = this.originY,
    translateX = 0,
    translateY = 0,
    rotation = 0,
    scaleX = 1,
    scaleY = 1,
    skewX = 0,
    skewY = 0,
    tCenterX = 0,
    tCenterY = 0,
    undoName = "transformation",
  } = {}) {
    let { pointIndices, componentIndices } = this._getSelection();
    if ((!pointIndices || pointIndices.length < 1) && !componentIndices.length) {
      return;
    }

    await this.sceneController.editGlyphAndRecordChanges((glyph) => {
      const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
        glyph.layers
      );
      for (const [layerName, layerGlyph] of Object.entries(editLayerGlyphs)) {
        const pinPoint = this._getPinPoint(
          layerGlyph,
          pointIndices,
          componentIndices,
          originX,
          originY
        );
        pointIndices = this._getPointIndicesInclOffCurves(
          layerGlyph.path,
          pointIndices
        );

        let t = new Transform();
        t = t.translate(pinPoint.x + translateX, pinPoint.y + translateY);
        t = t.scale(scaleX, scaleY);
        t = t.rotate((rotation * Math.PI) / 180);
        t = t.skew((skewX * Math.PI) / 180, (skewY * Math.PI) / 180);
        t = t.translate(-pinPoint.x, -pinPoint.y);

        // transform contour points
        for (const index of pointIndices) {
          let point = layerGlyph.path.getPoint(index);
          let pointTransformed = t.transformPointObject(point);
          layerGlyph.path.coordinates[index * 2] = pointTransformed.x;
          layerGlyph.path.coordinates[index * 2 + 1] = pointTransformed.y;
        }

        // transform components
        for (const index of componentIndices) {
          const compo = layerGlyph.components[index];
          const compoT = makeAffineTransform(compo.transformation);
          const newCompoT = t.transform(compoT);
          compo.transformation = decomposeAffineTransform(newCompoT);
        }
      }
      return undoName;
    });
  }

  _changeOrigin(keyX, keyY) {
    this.originX = keyX;
    this.originY = keyY;
    this.originXButton = undefined;
    this.originYButton = undefined;
    this.update();
  }

  async toggle(on, focus) {
    if (on) {
      this.update();
    }
  }
}

customElements.define("panel-selection-transformation", SelectionTransformationPanel);
