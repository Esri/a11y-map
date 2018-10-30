/*
  Copyright 2017 Esri

  Licensed under the Apache License, Version 2.0 (the "License");

  you may not use this file except in compliance with the License.

  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software

  distributed under the License is distributed on an "AS IS" BASIS,

  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and

  limitations under the License.​
*/

import ApplicationBase = require("ApplicationBase/ApplicationBase");

import i18n = require("dojo/i18n!./nls/resources");

const CSS = {
  loading: "configurable-application--loading"
};

import {
  createMapFromItem,
  createView,
  getConfigViewProperties,
  getItemTitle,
  findQuery,
  goToMarker
} from "ApplicationBase/support/itemUtils";

import {
  setPageLocale,
  setPageDirection,
  setPageTitle
} from "ApplicationBase/support/domHelper";

import WebMap = require("esri/WebMap");

import MapView = require("esri/views/MapView");

import watchUtils = require("esri/core/watchUtils");
import promiseUtils = require("esri/core/promiseUtils");

import Graphic = require("esri/Graphic");
import Extent = require("esri/geometry/Extent");

import SimpleFillSymbol = require("esri/symbols/SimpleFillSymbol");
import Search = require("esri/widgets/Search");
import Home = require("esri/widgets/Home");
import Locator = require("esri/tasks/Locator");

import esri = __esri;

class A11yMap {
  //--------------------------------------------------------------------------
  //
  //  Properties
  //
  //--------------------------------------------------------------------------

  watchHandler: esri.PausableWatchHandle;
  keyDownHandler: IHandle;
  keyUpHandler: IHandle;

  queryLayers: any[] = [];

  queryResults: Graphic[];
  pageResults: Graphic[];

  currentPage: number;
  numberOfPages: number;
  initialExtent: esri.Extent = null;

  liveNode = document.getElementById("liveViewInfo");
  liveDirNode = document.getElementById("dir");
  liveDetailsNode = document.getElementById("details");

  numberPerPage: number = 7;

  map: WebMap;
  view: MapView | esri.SceneView;

  //----------------------------------
  //  ApplicationBase
  //----------------------------------
  base: ApplicationBase = null;

  //--------------------------------------------------------------------------
  //
  //  Public Methods
  //
  //--------------------------------------------------------------------------

  public init(base: ApplicationBase): void {
      console.log("init")
    if (!base) {
      console.error("ApplicationBase is not defined");
      return;
    }
    setPageLocale(base.locale);
    setPageDirection(base.direction);

    this.base = base;

    const { config, results, settings } = base;
    const { find, marker } = config;
    const { webMapItems } = results;

    const validWebMapItems = webMapItems.map(response => {
      return response.value;
    });

    const firstItem = validWebMapItems[0];

    if (!firstItem) {
      console.error("Could not load an item to display");
      return;
    }

    config.title = !config.title ? getItemTitle(firstItem) : "";
    setPageTitle(config.title);

    const portalItem: __esri.PortalItem = this.base.results.applicationItem
      .value;
    const appProxies =
      portalItem && portalItem.applicationProxies
        ? portalItem.applicationProxies
        : null;

    const viewContainerNode = document.getElementById("viewContainer");
    const defaultViewProperties = getConfigViewProperties(config);

    validWebMapItems.forEach(item => {
      const viewNode = document.createElement("div");
      viewContainerNode.appendChild(viewNode);

      const container = {
        container: viewNode
      };

      const viewProperties = {
        ...defaultViewProperties,
        ...container
      };

      createMapFromItem({ item, appProxies }).then(map =>
        createView({
          ...viewProperties,
          map
        }).then(view => {
          findQuery(find, view).then(() => goToMarker(marker, view));
          this.view = view;
          this._initMap();
        })
      );
    });

    document.body.classList.remove(CSS.loading);
  }

  _initMap() {
    // Add the live node to the view 
    this.view.ui.add(this.liveNode, "manual");
    // When user tabs into the app for the first time 
    // add button to navigate map via keyboard to the ui and focus it
    let self = this; 
    document.addEventListener("keydown", function handler(e) {
        if (e.keyCode === 9) {
            e.currentTarget.removeEventListener(e.type, handler);
            const keyboardBtn = document.getElementById("keyboard");
            keyboardBtn.classList.remove("hidden");
    
            self.view.ui.add({
                component: keyboardBtn,
                position: "top-left",
                index: 0
            });
            keyboardBtn.addEventListener("click", () => { self._addFocusToMap(self) });
            keyboardBtn.focus();
            keyboardBtn.addEventListener('blur', function blurHandler(e) {
                e.currentTarget.removeEventListener(e.type, blurHandler);
                keyboardBtn.focus();
            })
        }
    });
    //const view = this.view;
    const searchWidget = new Search({
        view: this.view,
        popupEnabled: true,
        //popupOpenOnSelect: true,
        autoSelect: true
    });
    
    this.view.ui.add({
        component: searchWidget,
        position: "top-left",
        index: 0
    });
    
    searchWidget.watch("activeSource", (s) => {
        const source = searchWidget.activeSource as esri.LocatorSearchSource;
        if (source) {
            source.withinViewEnabled = true; 
        }
    });
    
    searchWidget.on("search-start", () => {
        watchUtils.once(this.view.popup, "title", () => {
            this.view.popup.focus();
            watchUtils.whenFalseOnce(this.view.popup, "visible", () => {
                this._addFocusToMap(this);
            });
        });
    });
    const homeWidget = new Home({
        view: this.view
    });
    this.view.ui.add(homeWidget, "top-left");
    /** 
     * Get the first layer in the map to use as the layer to query for features
     * that appear within the highlighted graphic
    */
    this.view.when(() => {
        this.initialExtent = this.view.extent.clone();
        this.view.on("layerview-create", (result) => {
            let l: esri.FeatureLayer | esri.MapImageLayer;
            if (result.layerView.layer.type === "feature") {
                l = result.layer as esri.FeatureLayer;
                if (l.popupEnabled) {
                    this.queryLayers.push(result.layerView as esri.FeatureLayerView);
                }
            } else if (result.layerView.layer.type === "map-image") {
                l = result.layerView.layer as esri.MapImageLayer;
                l.sublayers.forEach(layer => {
                    if (layer.popupTemplate) {
                        this.queryLayers.push(layer);
                    }
                });
            }
            // add layer as locator to search widget 
            searchWidget.sources.push({
                featureLayer: l,
                placeholder: `Search ${l.title} layer`,
                withinViewEnabled: true
            } as esri.FeatureLayerSearchSource);
    
        });
    
    });
  }

  //ADD FUNCTIONS HERE
  _setupKeyHandlers() {
    if (!this.watchHandler) {
        this.watchHandler = watchUtils.pausable(this.view, "extent", () => {
          this._createGraphic(this.view);
        });
    }
    else {
        this.watchHandler.resume();
    }
    if (!this.keyUpHandler) {
        /**
         * Handle numeric nav keys 
         */
        this.keyUpHandler = this.view.on("key-up", (keyEvt: any) => {

            const key = keyEvt.key;
            if (this.pageResults && this.pageResults.length && key <= this.pageResults.length) {
              this._displayFeatureInfo(key);
            }
            // not on the first page and more than one page
            else if (key === "8" && this.numberOfPages > 1 && this.currentPage > 1) {
              this.currentPage -= 1;
              this._generateList();
            }

            // we have more than one page
            else if (key === "9" && this.numberOfPages > 1) {
              this.currentPage += 1;
              this._generateList();
            }
        });
    }
    if (!this.keyDownHandler) {
        /**
         * Handle info and dir keys 
         */

        const worldLocator = new Locator({
            url: "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer"
        });
        this.keyDownHandler = this.view.on("key-down", (keyEvt: any) => {
            const key = keyEvt.key;
            if (key === "i") {
                // reverse geocode and display location information
                const rectExt = this.view.graphics.getItemAt(0).geometry as esri.Extent;
                let loc = rectExt.center;
                worldLocator.locationToAddress(loc, 1000).then((candidate: esri.AddressCandidate) => {
                  this._calculateLocation(candidate.attributes);
                }, (err: Error) => {
                  this.liveDirNode.innerHTML = "Unable to calculate location";
                });
            } else if (key === "ArrowUp" || key === "ArrowDown" ||
                key === "ArrowRight" || key === "ArrowLeft") {
                let dir: "north" | "south" | "east" | "west";

                switch (key) {
                    case "ArrowUp":
                        dir = "north";
                        break;
                    case "ArrowDown":
                        dir = "south";
                        break;
                    case "ArrowRight":
                        dir = "east";
                        break;
                    case "ArrowLeft":
                        dir = "west";
                        break;
                }
                this.liveDirNode.innerHTML = `Moving ${dir}.`;
            } else if (key === "h") {
                /// Go to the view's initial extent 
                this.view.goTo(this.initialExtent);
            }
        });
    }
  }

  /**
   * Toggles on/off the key handlers for Pop-up boxes based off their visibility
   */
  _popupKeyHandler():void {
    if(this.view.popup.visible){
        (<HTMLElement>this.view.popup.container).addEventListener('keydown', (keyEvt) => { this._popupKeyHandlerFunction(this, keyEvt) });
    } else {
        (<HTMLElement>this.view.popup.container).removeEventListener('keydown', (keyEvt) => { this._popupKeyHandlerFunction(this, keyEvt) });
    }
  }
  /**
  * Adds key handlers to Pop-up boxes 
  * @param keyEvt
  */
  _popupKeyHandlerFunction(self: any, keyEvt: any): void {
    const key = keyEvt.key;
    if (key === "Escape") {
      self.view.popup.close();
    }
  }

  /**
   * Clean up the highlight graphic and feature list if the map loses 
   * focus and the popup isn't visible
   */
  _cleanUp(): void {
    if (this.view.popup.visible) {
        return;
    }

    this.liveNode.classList.add("hidden");


    this.liveDetailsNode.innerHTML = null;
    this.liveDirNode.innerHTML = null;
    this.view.graphics.removeAll();
    if (this.watchHandler) {
      this.watchHandler.pause();
    }

    if (this.keyDownHandler) {
      this.keyDownHandler.remove();
      this.keyDownHandler = null;
    }
    if (this.keyUpHandler) {
      this.keyUpHandler.remove();
      this.keyUpHandler = null;
    }
  }

  /**
   *  Add a highlight graphic to the map and use it to navigate/query content
   * @param view  
   */
  _createGraphic(view: MapView | esri.SceneView): void {
    view.graphics.removeAll();
    view.popup.visible = false;


    const centerPoint = view.center;
    const tolerance = view.scale / 60;

    const graphic = new Graphic({
        geometry: new Extent({
            xmin: centerPoint.x - tolerance,
            ymin: centerPoint.y - tolerance,
            xmax: centerPoint.x + tolerance,
            ymax: centerPoint.y + tolerance,
            spatialReference: view.center.spatialReference
        }),
        symbol: new SimpleFillSymbol({
            color: ([0, 0, 0, 0.2]),
            outline: ({
                color: ([0, 0, 0, 0.8]),
                width: 1
            })
        })
    });

    view.graphics.add(graphic);
    if (this.queryLayers && this.queryLayers.length > 0) {
      this._queryFeatures(graphic.geometry as esri.Extent);
    }
  }

  /**
   *  Query the feature layer to get the features within the highlighted area 
   * currently setup for just the first layer in web map
   * @param queryGraphic Extent graphic used drawn on the map and used to select features
   */
  _queryFeatures(queryGeometry: esri.Extent): void {
    this.queryResults = [];
    this.pageResults = null;
    this.currentPage = 1;
    promiseUtils.eachAlways(this.queryLayers.map((layerView) => {
        // if (layerView.layer.type && layerView.layer.type === "map-image") {
        const flQuery = layerView.layer.createQuery();
        flQuery.geometry = queryGeometry;
        flQuery.returnGeometry = true;
        flQuery.outFields = ["*"];
        flQuery.spatialRelationship = "intersects";
        //For SceneView
        if(this.view.type == "3d"){
            layerView = layerView.layer;
        }
        return layerView.queryFeatures(flQuery).then((queryResults: esri.FeatureSet | Graphic[]) => {
            return queryResults;
        });
    })).then((results: esri.EachAlwaysResult[]) => {
      this.queryResults = [];
        results.forEach(result => {
            if (result && result.value && result.value.features) {
                result.value.features.forEach((val: Graphic) => {
                  this.queryResults.push(val);
                });
            }
        });
        this.numberOfPages = Math.ceil(this.queryResults.length / this.numberPerPage);
        this.liveDetailsNode.innerHTML = "";
        if (this.queryResults.length && this.queryResults.length > 21) {
          this.liveDetailsNode.innerHTML = this.queryResults.length + " results found in search area. Press the plus key to zoom in and reduce number of results.";
        } else {
          this._generateList();
        }

    });
  }

  _updateLiveInfo(displayResults: Graphic[], prev: boolean, next: boolean): void {
    let updateContent: string;
    if (displayResults && displayResults.length > 0) {
        let updateValues: string[] = displayResults.map((graphic: Graphic, index: number) => {
            let titleTemplate = graphic.getEffectivePopupTemplate().title as string;
            // find curly brace values
            for (let key in graphic.attributes) {
                if (graphic.attributes.hasOwnProperty(key)) {
                    titleTemplate = titleTemplate.replace(new RegExp('{' + key + '}', 'gi'), graphic.attributes[key]);
                }
            }
            return `<span class="feature-label"><span class="feature-index">${index + 1}</span>  ${titleTemplate}</span>`;
        });
        if (next) {
            // add 9 to get more features
            updateValues.push(
                `<span class="feature-label"><span class="feature-index">9</span>See more results</span>`
            );
        }

        if (prev) {
            // add 8 to go back
            updateValues.push(
                `<span class="feature-label"><span class="feature-index">8</span>View previous results</span>`
            );
        }

        updateContent = updateValues.join(" ");
    }
    else {
        updateContent = "No features found";
    }

    this.liveDetailsNode.innerHTML = updateContent;
    this.liveNode.setAttribute("aria-busy", "false");
  }

  /**
  * Generate a page of content for the currently highlighted area
  */
  _generateList(): void {
    const begin = ((this.currentPage - 1) * this.numberPerPage);
    const end = begin + this.numberPerPage;
    this.pageResults = this.queryResults.slice(begin, end);

    // Get page status  
    const prevDisabled = this.currentPage === 1; // don't show 8
    const nextDisabled = this.currentPage === this.numberOfPages; // don't show 9
    this.liveNode.setAttribute("aria-busy", "true");
    this._updateLiveInfo(this.pageResults, !prevDisabled, !nextDisabled);
  }

  /**
  * Display popup for selected feature 
  * @param key number key pressed to identify selected feature
  */
  _displayFeatureInfo(key: number): void {

    const selectedGraphic = this.pageResults[key - 1];

    if (selectedGraphic) {
        let location: esri.Point;
        if (selectedGraphic.geometry.type === "point") {
            location = selectedGraphic.geometry as esri.Point;
        } else if (selectedGraphic.geometry.extent && selectedGraphic.geometry.extent.center) {
            location = selectedGraphic.geometry.extent.center;
        }
        this.liveDetailsNode.innerHTML = "Displaying content for selected feature. Press <strong>esc</strong> to close.";
        this.view.popup.open({
            location: location,
            features: [selectedGraphic]
        });
        watchUtils.whenTrueOnce(this.view.popup, "visible", () => { 
          this.view.popup.focus(); 
          this._popupKeyHandler();
        })
        watchUtils.whenFalseOnce(this.view.popup, "visible", () => {
          this._addFocusToMap(this);
          this._popupKeyHandler();
        });
    }
  }

  _addFocusToMap(self: any) : void {
    document.getElementById("intro").innerHTML = `Use the arrow keys to navigate the map and find features. Use the plus (+) key to zoom in to the map and the minus (-) key to zoom out.
        For details on your current area press the i key. Press the h key to return to the  starting map location.`

    window.addEventListener("mousedown", (keyEvt: any) => {
        if (keyEvt.key !== "Tab") {
            if (keyEvt.target.type !== "text") {
                keyEvt.preventDefault();
                self._cleanUp();
            }
        }
    });
    self.view.watch("focused", () => {
        if (self.view.focused) {
          self.liveNode.classList.remove("hidden");
          self._createGraphic(self.view);
          self._setupKeyHandlers();
        } else {
          self._cleanUp();
        }
    });
    self.view.focus();
}

  _calculateLocation(address: any) {
    let displayValue;
    if (this.view.scale > 12000000) {
        displayValue = address.CountryCode || address.Subregion;
    }
    else if (this.view.scale > 3000000) {
        displayValue = address.Region || address.Subregion;
    }
    else if (this.view.scale > 160000) {
        displayValue = address.City || address.Region || address.Subregion;
    }
    else if (this.view.scale > 40000) {
        displayValue = address.Neighborhood || address.Address;
    }
    else {
        displayValue = address.Match_addr || address.Address;
    }
    this.liveDirNode.innerHTML = `Currently searching near ${displayValue}`;
  } 

}

export = A11yMap;
