import { recordChanges } from "../core/change-recorder.js";
import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { ObservableController } from "../core/observable-object.js";
import {
  OptionalNumberFormatter,
  labelForElement,
  labeledCheckbox,
  labeledTextInput,
  setupSortableList,
  textInput,
} from "../core/ui-utils.js";
import { range, round } from "../core/utils.js";
import { BaseInfoPanel } from "./panel-base.js";
import { translate } from "/core/localization.js";
import {
  locationToString,
  makeSparseLocation,
  mapAxesFromUserSpaceToSourceSpace,
} from "/core/var-model.js";
import "/web-components/add-remove-buttons.js";
import "/web-components/designspace-location.js";
import { dialogSetup, message } from "/web-components/modal-dialog.js";

export class CrossAxisMappingPanel extends BaseInfoPanel {
  static title = "cross-axis-mapping.title";
  static id = "cross-axis-mapping-panel";
  static fontAttributes = ["axes", "sources"];

  initializePanel() {
    super.initializePanel();
    this.fontController.addChangeListener(
      { axes: null },
      (change, isExternalChange) => {
        this.setupUI();
        this.undoStack.clear();
      },
      false
    );
  }

  async setupUI() {
    const mappings = this.fontController.axes.mappings;

    this.fontAxesSourceSpace = mapAxesFromUserSpaceToSourceSpace(
      this.fontController.axes.axes
    );

    const container = html.div({
      style: "display: grid; gap: 0.5em;",
    });

    for (const index of range(mappings.length)) {
      container.appendChild(
        new CrossAxisMappingBox(
          this.fontController,
          this.fontAxesSourceSpace,
          mappings,
          index,
          this.postChange.bind(this),
          this.setupUI.bind(this)
        )
      );
    }

    setupSortableList(container);

    this.panelElement.innerHTML = "";
    this.panelElement.style = `
    gap: 1em;
    `;
    this.panelElement.appendChild(
      html.input({
        type: "button",
        style: `justify-self: start;`,
        value: translate("cross-axis-mapping.new"),
        onclick: (event) => this.newCrossAxisMapping(),
      })
    );
    this.panelElement.appendChild(container);
    this.panelElement.focus();
  }

  async newCrossAxisMapping() {
    //new empty mapping
    const newMapping = {
      description: "Unnamed",
      groupDescription: null,
      inputLocation: {},
      outputLocation: {},
    };

    const undoLabel = translate(`add cross axis mapping`); // key: cross-axis-mapping.add;

    const root = { axes: this.fontController.axes };
    const changes = recordChanges(root, (root) => {
      root.axes.mappings.push(newMapping);
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }
}

addStyleSheet(`
.fontra-ui-font-info-cross-axis-mapping-panel-cross-axis-mapping-box {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
  cursor: pointer;
  display: grid;
  grid-template-rows: auto auto;
  grid-template-columns: max-content max-content max-content max-content max-content auto;
  grid-row-gap: 0.1em;
  grid-column-gap: 1em;
}

.fontra-ui-font-info-cross-axis-mapping-panel-column {
  display: grid;
  grid-template-columns: minmax(4.5em, max-content) max-content;
  gap: 0.5em;
  align-items: start;
  align-content: start;
  overflow: scroll;
  margin-bottom: 0.5em;
}

.fontra-ui-font-info-cross-axis-mapping-panel-column-location {
  display: grid;
  grid-template-columns: auto;
  gap: 0.5em;
  overflow: hidden;
}

.fontra-ui-font-info-cross-axis-mapping-panel-cross-axis-mapping-box.min-height,
.fontra-ui-font-info-cross-axis-mapping-panel-column-location.min-height {
  height: 0px;
}

.fontra-ui-font-info-cross-axis-mapping-panel-header {
  font-weight: bold;
}

.fontra-ui-font-info-cross-axis-mapping-panel-icon {
  justify-self: end;
  align-self: start;
}

.fontra-ui-font-info-cross-axis-mapping-panel-icon.open-close-icon {
  height: 1.5em;
  width: 1.5em;
  transition: 120ms;
}

.fontra-ui-font-info-cross-axis-mapping-panel-icon.open-close-icon.item-closed {
  transform: rotate(180deg);
}

`);

class CrossAxisMappingBox extends HTMLElement {
  constructor(
    fontController,
    fontAxesSourceSpace,
    mappings,
    mappingIndex,
    postChange,
    setupUI
  ) {
    super();
    this.classList.add(
      "fontra-ui-font-info-cross-axis-mapping-panel-cross-axis-mapping-box"
    );
    this.draggable = true;
    this.fontController = fontController;
    this.fontAxesSourceSpace = fontAxesSourceSpace;
    this.mappings = mappings;
    this.mapping = mappings[mappingIndex];
    this.mappingIndex = mappingIndex;
    this.postChange = postChange;
    this.setupUI = setupUI;
    this.controllers = {};
    this.models = this._getModels();
    this._updateContents();
  }

  _getModels() {
    const mapping = this.mapping;
    return {
      description: { description: mapping.description || "" },
      groupDescription: { groupDescription: mapping.groupDescription || "" },
      inputLocation: { ...mapping.inputLocation },
      outputLocation: { ...mapping.outputLocation },
    };
  }

  editCrossAxisMapping(editFunc, undoLabel) {
    console.log(
      "editCrossAxisMapping works, but after a change the cards get folded – which is not nice."
    );

    const root = { axes: this.fontController.axes };
    const changes = recordChanges(root, (root) => {
      editFunc(root.axes.mappings[this.mappingIndex]);
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
    }
  }

  deleteCrossAxisMapping() {
    const undoLabel = translate(
      "delete cross axis mapping %0",
      this.mapping.description || this.mappingIndex
    ); // key: cross-axis-mapping.delete;
    const root = { axes: this.fontController.axes };
    const changes = recordChanges(root, (root) => {
      root.axes.mappings.splice(this.mappingIndex, 1);
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
      this.setupUI();
    }
  }

  toggleShowHide() {
    const element = this.querySelector("#open-close-icon");
    element.classList.toggle("item-closed");

    for (const child of this.children) {
      child.classList.toggle("min-height");
    }
  }

  _updateContents() {
    const models = this.models;

    // create controllers
    for (const key in models) {
      this.controllers[key] = new ObservableController(models[key]);
    }

    // create listeners
    this.controllers.description.addListener((event) => {
      // TODO: Maybe add check of value, if unique?
      this.editCrossAxisMapping((mapping) => {
        // TODO: There seems to be somethign wring with description and groupDescription.
        // After changing them the above mentioned error accures.
        mapping[event.key] = event.newValue.trim();
      }, `edit input description ${event.key}`);
    });

    this.controllers.groupDescription.addListener((event) => {
      // TODO: Maybe add check of value.
      this.editCrossAxisMapping((mapping) => {
        mapping[event.key] = event.newValue.trim();
      }, `edit input groupDescription ${event.key}`);
    });

    this.controllers.inputLocation.addListener((event) => {
      this.editCrossAxisMapping((mapping) => {
        mapping.inputLocation[event.key] = event.newValue;
      }, `edit input location ${event.key}`);
    });

    this.controllers.outputLocation.addListener((event) => {
      this.editCrossAxisMapping((mapping) => {
        mapping.outputLocation[event.key] = event.newValue;
      }, `edit output location ${event.key}`);
    });

    this.innerHTML = "";
    // row 1 // mailnly for icon
    this.append(
      html.createDomElement("icon-button", {
        class:
          "fontra-ui-font-info-cross-axis-mapping-panel-icon open-close-icon item-closed",
        id: "open-close-icon",
        src: "/tabler-icons/chevron-up.svg",
        open: false,
        onclick: (event) => this.toggleShowHide(),
      })
    );

    // for (const key of ["", "", "", ""]) {
    //   this.append(
    //     html.div({ class: "fontra-ui-font-info-cross-axis-mapping-panel-header" }, [
    //       getLabelFromKey(key),
    //     ])
    //   );
    // }
    this.append(html.div()); // empty cell for grid with arrow
    this.append(
      html.div(
        { class: "fontra-ui-font-info-cross-axis-mapping-panel-column" },
        labeledTextInput(
          getLabelFromKey("description"),
          this.controllers.description,
          "description",
          { continuous: false }
        )
      )
    );
    this.append(
      html.div(
        { class: "fontra-ui-font-info-cross-axis-mapping-panel-column" },
        labeledTextInput(
          getLabelFromKey("groupDescription"),
          this.controllers.groupDescription,
          "groupDescription",
          { continuous: false }
        )
      )
    );
    this.append(html.div()); // empty cell for grid with arrow

    this.append(
      html.createDomElement("icon-button", {
        "class": "fontra-ui-font-info-cross-axis-mapping-panel-icon",
        "src": "/tabler-icons/trash.svg",
        "onclick": (event) => this.deleteCrossAxisMapping(),
        "data-tooltip": translate("Delete mapping"), // key: cross-axis-mapping.delete
        "data-tooltipposition": "left",
      })
    );

    // // row 2 // descriptions
    // this.append(html.div()); // empty cell for grid with arrow
    // this.append(html.div()); // empty cell for grid with arrow
    // this.append(html.div()); // empty cell for grid with arrow
    // this.append(html.div()); // empty cell for grid with arrow
    // // this.append(
    // //   html.div(
    // //     { class: "fontra-ui-font-info-cross-axis-mapping-panel-column" },
    // //     labeledTextInput(getLabelFromKey("description"), this.controllers.description, "description", {continuous: false, })
    // //   )
    // // );
    // // this.append(
    // //   html.div(
    // //     { class: "fontra-ui-font-info-cross-axis-mapping-panel-column" },
    // //     labeledTextInput(getLabelFromKey("groupDescription"), this.controllers.groupDescription, "groupDescription", {continuous: false, })
    // //   )
    // // );
    // this.append(html.div()); // empty cell for grid with arrow
    // this.append(html.div()); // empty cell for grid with arrow

    // row 3 // locations headlines
    for (const key of ["", "", "inputLocation", "outputLocation", "", ""]) {
      this.append(
        html.div({ class: "fontra-ui-font-info-cross-axis-mapping-panel-header" }, [
          getLabelFromKey(key),
        ])
      );
    }

    // row 4 // locations
    this.append(html.div()); // empty cell for grid with arrow
    this.append(buildElementLocationsLabel(this.fontAxesSourceSpace));
    this.append(
      buildElementLocations(this.controllers.inputLocation, this.fontAxesSourceSpace)
    );
    this.append(
      buildElementLocations(this.controllers.outputLocation, this.fontAxesSourceSpace)
    );
    this.append(html.div()); // This will be checkboxs for "this axis participates in the mapping"
    this.append(html.div()); // empty cell for grid with arrow
  }
}

customElements.define("cross-axis-mapping-box", CrossAxisMappingBox);

function buildElementLocations(controller, fontAxes) {
  const locationElement = html.createDomElement("designspace-location", {
    continuous: false,
    labels: false,
    class: `fontra-ui-font-info-cross-axis-mapping-panel-column-location min-height`,
  });
  locationElement.axes = fontAxes;
  locationElement.controller = controller;
  return locationElement;
}

function buildElementLocationsLabel(fontAxes) {
  let items = [];
  for (const axis of fontAxes) {
    items.push(axis.tag);
  }

  return html.div(
    {
      class: "fontra-ui-font-info-cross-axis-mapping-panel-column-location min-height",
    },
    items
      .map((labelName) => {
        return html.label({ style: "text-align: right;" }, [labelName]);
      })
      .flat()
  );
}

function getLabelFromKey(key) {
  const keyLabelMap = {
    description: translate("Description"), // key: cross-axis-mapping.description
    groupDescription: translate("Group description"), // key: cross-axis-mapping.groupDescription
    inputLocation: translate("Input Location"), // key: cross-axis-mapping.inputLocation
    outputLocation: translate("Output Location"), // key: cross-axis-mapping.outputLocation
  };
  return keyLabelMap[key] || key;
}
