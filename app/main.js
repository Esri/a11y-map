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
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
define(["require", "exports", "ApplicationBase/support/itemUtils", "ApplicationBase/support/domHelper", "esri/core/watchUtils", "esri/core/promiseUtils", "esri/Graphic", "esri/geometry/Extent", "esri/symbols/SimpleFillSymbol", "esri/widgets/Search", "esri/widgets/Home", "esri/tasks/Locator"], function (require, exports, itemUtils_1, domHelper_1, watchUtils, promiseUtils, Graphic, Extent, SimpleFillSymbol, Search, Home, Locator) {
    "use strict";
    var CSS = {
        loading: "configurable-application--loading"
    };
    var A11yMap = /** @class */ (function () {
        function A11yMap() {
            //--------------------------------------------------------------------------
            //
            //  Properties
            //
            //--------------------------------------------------------------------------
            this.queryLayers = [];
            this.initialExtent = null;
            this.liveNode = document.getElementById("liveViewInfo");
            this.liveDirNode = document.getElementById("dir");
            this.liveDetailsNode = document.getElementById("details");
            this.numberPerPage = 7;
            //----------------------------------
            //  ApplicationBase
            //----------------------------------
            this.base = null;
        }
        //--------------------------------------------------------------------------
        //
        //  Public Methods
        //
        //--------------------------------------------------------------------------
        A11yMap.prototype.init = function (base) {
            var _this = this;
            if (!base) {
                console.error("ApplicationBase is not defined");
                return;
            }
            domHelper_1.setPageLocale(base.locale);
            domHelper_1.setPageDirection(base.direction);
            this.base = base;
            var config = base.config, results = base.results, settings = base.settings;
            var find = config.find, marker = config.marker;
            var webMapItems = results.webMapItems;
            var validWebMapItems = webMapItems.map(function (response) {
                return response.value;
            });
            var firstItem = validWebMapItems[0];
            if (!firstItem) {
                console.error("Could not load an item to display");
                return;
            }
            config.title = !config.title ? itemUtils_1.getItemTitle(firstItem) : "";
            domHelper_1.setPageTitle(config.title);
            var portalItem = this.base.results.applicationItem
                .value;
            var appProxies = portalItem && portalItem.applicationProxies
                ? portalItem.applicationProxies
                : null;
            var viewContainerNode = document.getElementById("viewContainer");
            var defaultViewProperties = itemUtils_1.getConfigViewProperties(config);
            validWebMapItems.forEach(function (item) {
                var viewNode = document.createElement("div");
                viewContainerNode.appendChild(viewNode);
                var container = {
                    container: viewNode
                };
                var viewProperties = __assign({}, defaultViewProperties, container);
                itemUtils_1.createMapFromItem({ item: item, appProxies: appProxies }).then(function (map) {
                    return itemUtils_1.createView(__assign({}, viewProperties, { map: map })).then(function (view) {
                        itemUtils_1.findQuery(find, view).then(function () { return itemUtils_1.goToMarker(marker, view); });
                        _this.view = view;
                        _this._initMap();
                    });
                });
            });
            document.body.classList.remove(CSS.loading);
        };
        A11yMap.prototype._initMap = function () {
            var _this = this;
            // Add the live node to the view 
            this.view.ui.add(this.liveNode, "manual");
            // When user tabs into the app for the first time 
            // add button to navigate map via keyboard to the ui and focus it
            var self = this;
            document.addEventListener("keydown", function handler(e) {
                if (e.keyCode === 9) {
                    e.currentTarget.removeEventListener(e.type, handler);
                    var keyboardBtn_1 = document.getElementById("keyboard");
                    keyboardBtn_1.classList.remove("hidden");
                    self.view.ui.add({
                        component: keyboardBtn_1,
                        position: "top-left",
                        index: 0
                    });
                    keyboardBtn_1.addEventListener("click", function () { self._addFocusToMap(self); });
                    keyboardBtn_1.focus();
                    keyboardBtn_1.addEventListener('blur', function blurHandler(e) {
                        e.currentTarget.removeEventListener(e.type, blurHandler);
                        keyboardBtn_1.focus();
                    });
                }
            });
            //const view = this.view;
            var searchWidget = new Search({
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
            searchWidget.watch("activeSource", function (s) {
                var source = searchWidget.activeSource;
                if (source) {
                    source.withinViewEnabled = true;
                }
            });
            searchWidget.on("search-start", function () {
                watchUtils.once(_this.view.popup, "title", function () {
                    _this.view.popup.focus();
                    watchUtils.whenFalseOnce(_this.view.popup, "visible", function () {
                        _this._addFocusToMap(_this);
                    });
                });
            });
            var homeWidget = new Home({
                view: this.view
            });
            this.view.ui.add(homeWidget, "top-left");
            /**
             * Get the first layer in the map to use as the layer to query for features
             * that appear within the highlighted graphic
            */
            this.view.when(function () {
                _this.initialExtent = _this.view.extent.clone();
                _this.view.on("layerview-create", function (result) {
                    var l;
                    if (result.layerView.layer.type === "feature") {
                        l = result.layer;
                        if (l.popupEnabled) {
                            _this.queryLayers.push(result.layerView);
                        }
                    }
                    else if (result.layerView.layer.type === "map-image") {
                        l = result.layerView.layer;
                        l.sublayers.forEach(function (layer) {
                            if (layer.popupTemplate) {
                                _this.queryLayers.push(layer);
                            }
                        });
                    }
                    // add layer as locator to search widget 
                    searchWidget.sources.push({
                        featureLayer: l,
                        placeholder: "Search " + l.title + " layer",
                        withinViewEnabled: true
                    });
                });
            });
        };
        A11yMap.prototype._setupKeyHandlers = function () {
            var _this = this;
            if (!this.watchHandler) {
                this.watchHandler = watchUtils.pausable(this.view, "extent", function () {
                    _this._createGraphic(_this.view);
                });
            }
            else {
                this.watchHandler.resume();
            }
            if (!this.keyUpHandler) {
                /**
                 * Handle numeric nav keys
                 */
                this.keyUpHandler = this.view.on("key-up", function (keyEvt) {
                    var key = keyEvt.key;
                    if (_this.pageResults && _this.pageResults.length && key <= _this.pageResults.length) {
                        _this._displayFeatureInfo(key);
                    }
                    // not on the first page and more than one page
                    else if (key === "8" && _this.numberOfPages > 1 && _this.currentPage > 1) {
                        _this.currentPage -= 1;
                        _this._generateList();
                    }
                    // we have more than one page
                    else if (key === "9" && _this.numberOfPages > 1) {
                        _this.currentPage += 1;
                        _this._generateList();
                    }
                });
            }
            if (!this.keyDownHandler) {
                /**
                 * Handle info and dir keys
                 */
                var worldLocator_1 = new Locator({
                    url: "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer"
                });
                this.keyDownHandler = this.view.on("key-down", function (keyEvt) {
                    var key = keyEvt.key;
                    if (key === "i") {
                        // reverse geocode and display location information
                        var rectExt = _this.view.graphics.getItemAt(0).geometry;
                        var loc = rectExt.center;
                        worldLocator_1.locationToAddress(loc, 1000).then(function (candidate) {
                            _this._calculateLocation(candidate.attributes);
                        }, function (err) {
                            _this.liveDirNode.innerHTML = "Unable to calculate location";
                        });
                    }
                    else if (key === "ArrowUp" || key === "ArrowDown" ||
                        key === "ArrowRight" || key === "ArrowLeft") {
                        var dir = void 0;
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
                        _this.liveDirNode.innerHTML = "Moving " + dir + ".";
                    }
                    else if (key === "h") {
                        /// Go to the view's initial extent 
                        _this.view.goTo(_this.initialExtent);
                    }
                });
            }
            if (!this.extentHandler) {
                //create navigation extent using map's native extent settings
                var navigationExtent_1 = this.view.map.portalItem.extent;
                this.extentHandler = this.view.watch('center', function (newValue, oldValue, propertyName) {
                    //if center goes outside extent, then move it back to the original position
                    if (!navigationExtent_1.contains(newValue)) {
                        _this.view.set(propertyName, oldValue);
                    }
                });
            }
        };
        /**
         * Toggles on/off the key handlers for Pop-up boxes based off their visibility
         */
        A11yMap.prototype._popupKeyHandler = function () {
            var _this = this;
            if (this.view.popup.visible) {
                this.view.popup.container.addEventListener('keydown', function (keyEvt) { _this._popupKeyHandlerFunction(_this, keyEvt); });
            }
            else {
                this.view.popup.container.removeEventListener('keydown', function (keyEvt) { _this._popupKeyHandlerFunction(_this, keyEvt); });
            }
        };
        /**
        * Adds key handlers to Pop-up boxes
        * @param keyEvt
        */
        A11yMap.prototype._popupKeyHandlerFunction = function (self, keyEvt) {
            var key = keyEvt.key;
            if (key === "Escape") {
                self.view.popup.close();
            }
        };
        /**
         * Clean up the highlight graphic and feature list if the map loses
         * focus and the popup isn't visible
         */
        A11yMap.prototype._cleanUp = function () {
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
            if (this.extentHandler) {
                this.extentHandler.remove();
                this.extentHandler = null;
            }
        };
        /**
         *  Add a highlight graphic to the map and use it to navigate/query content
         * @param view
         */
        A11yMap.prototype._createGraphic = function (view) {
            view.graphics.removeAll();
            view.popup.visible = false;
            var centerPoint = view.center;
            var tolerance = view.scale / 60;
            var graphic = new Graphic({
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
                this._queryFeatures(graphic.geometry);
            }
        };
        /**
         *  Query the feature layer to get the features within the highlighted area
         * currently setup for just the first layer in web map
         * @param queryGraphic Extent graphic used drawn on the map and used to select features
         */
        A11yMap.prototype._queryFeatures = function (queryGeometry) {
            var _this = this;
            this.queryResults = [];
            this.pageResults = null;
            this.currentPage = 1;
            promiseUtils.eachAlways(this.queryLayers.map(function (layerView) {
                // if (layerView.layer.type && layerView.layer.type === "map-image") {
                var flQuery = layerView.layer.createQuery();
                flQuery.geometry = queryGeometry;
                flQuery.returnGeometry = true;
                flQuery.outFields = ["*"];
                flQuery.spatialRelationship = "intersects";
                //For SceneView
                if (_this.view.type == "3d") {
                    layerView = layerView.layer;
                }
                return layerView.queryFeatures(flQuery).then(function (queryResults) {
                    return queryResults;
                });
            })).then(function (results) {
                _this.queryResults = [];
                results.forEach(function (result) {
                    if (result && result.value && result.value.features) {
                        result.value.features.forEach(function (val) {
                            _this.queryResults.push(val);
                        });
                    }
                });
                _this.numberOfPages = Math.ceil(_this.queryResults.length / _this.numberPerPage);
                _this.liveDetailsNode.innerHTML = "";
                if (_this.queryResults.length && _this.queryResults.length > 21) {
                    _this.liveDetailsNode.innerHTML = _this.queryResults.length + " results found in search area. Press the plus key to zoom in and reduce number of results.";
                }
                else {
                    _this._generateList();
                }
            });
        };
        A11yMap.prototype._updateLiveInfo = function (displayResults, prev, next) {
            var updateContent;
            if (displayResults && displayResults.length > 0) {
                var updateValues = displayResults.map(function (graphic, index) {
                    var titleTemplate = graphic.getEffectivePopupTemplate().title;
                    // find curly brace values
                    for (var key in graphic.attributes) {
                        if (graphic.attributes.hasOwnProperty(key)) {
                            titleTemplate = titleTemplate.replace(new RegExp('{' + key + '}', 'gi'), graphic.attributes[key]);
                        }
                    }
                    return "<span class=\"feature-label\"><span class=\"feature-index\">" + (index + 1) + "</span>  " + titleTemplate + "</span>";
                });
                if (next) {
                    // add 9 to get more features
                    updateValues.push("<span class=\"feature-label\"><span class=\"feature-index\">9</span>See more results</span>");
                }
                if (prev) {
                    // add 8 to go back
                    updateValues.push("<span class=\"feature-label\"><span class=\"feature-index\">8</span>View previous results</span>");
                }
                updateContent = updateValues.join(" ");
            }
            else {
                updateContent = "No features found";
            }
            this.liveDetailsNode.innerHTML = updateContent;
            this.liveNode.setAttribute("aria-busy", "false");
        };
        /**
        * Generate a page of content for the currently highlighted area
        */
        A11yMap.prototype._generateList = function () {
            var begin = ((this.currentPage - 1) * this.numberPerPage);
            var end = begin + this.numberPerPage;
            this.pageResults = this.queryResults.slice(begin, end);
            // Get page status  
            var prevDisabled = this.currentPage === 1; // don't show 8
            var nextDisabled = this.currentPage === this.numberOfPages; // don't show 9
            this.liveNode.setAttribute("aria-busy", "true");
            this._updateLiveInfo(this.pageResults, !prevDisabled, !nextDisabled);
        };
        /**
        * Display popup for selected feature
        * @param key number key pressed to identify selected feature
        */
        A11yMap.prototype._displayFeatureInfo = function (key) {
            var _this = this;
            var selectedGraphic = this.pageResults[key - 1];
            if (selectedGraphic) {
                var location_1;
                if (selectedGraphic.geometry.type === "point") {
                    location_1 = selectedGraphic.geometry;
                }
                else if (selectedGraphic.geometry.extent && selectedGraphic.geometry.extent.center) {
                    location_1 = selectedGraphic.geometry.extent.center;
                }
                this.liveDetailsNode.innerHTML = "Displaying content for selected feature. Press <strong>esc</strong> to close.";
                this.view.popup.open({
                    location: location_1,
                    features: [selectedGraphic]
                });
                watchUtils.whenTrueOnce(this.view.popup, "visible", function () {
                    _this.view.popup.focus();
                    _this._popupKeyHandler();
                });
                watchUtils.whenFalseOnce(this.view.popup, "visible", function () {
                    _this._addFocusToMap(_this);
                    _this._popupKeyHandler();
                });
            }
        };
        A11yMap.prototype._addFocusToMap = function (self) {
            document.getElementById("intro").innerHTML = "Use the arrow keys to navigate the map and find features. Use the plus (+) key to zoom in to the map and the minus (-) key to zoom out.\n        For details on your current area press the i key. Press the h key to return to the  starting map location.";
            window.addEventListener("mousedown", function (keyEvt) {
                if (keyEvt.key !== "Tab") {
                    if (keyEvt.target.type !== "text") {
                        keyEvt.preventDefault();
                        self._cleanUp();
                    }
                }
            });
            self.view.watch("focused", function () {
                if (self.view.focused) {
                    self.liveNode.classList.remove("hidden");
                    self._createGraphic(self.view);
                    self._setupKeyHandlers();
                }
                else {
                    self._cleanUp();
                }
            });
            self.view.focus();
        };
        A11yMap.prototype._calculateLocation = function (address) {
            var displayValue;
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
            this.liveDirNode.innerHTML = "Currently searching near " + displayValue;
        };
        return A11yMap;
    }());
    return A11yMap;
});
//# sourceMappingURL=main.js.map