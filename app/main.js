define(["require", "exports", "esri/WebMap", "esri/core/urlUtils", "esri/views/MapView", "esri/core/watchUtils", "esri/core/promiseUtils", "esri/Graphic", "esri/geometry/Extent", "esri/symbols/SimpleFillSymbol", "esri/widgets/Search", "esri/widgets/Home", "esri/tasks/Locator", "esri/widgets/Legend"], function (require, exports, WebMap, urlUtils, MapView, watchUtils, promiseUtils, Graphic, Extent, SimpleFillSymbol, Search, Home, Locator, Legend) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var watchHandler;
    var keyDownHandler;
    var keyUpHandler;
    var queryLayers = [];
    var webmapId = "7eca81856e22478da183da6a33c24dfe";
    var queryResults;
    var pageResults;
    var currentPage;
    var numberOfPages;
    var initialExtent = null;
    var liveNode = document.getElementById("liveViewInfo");
    var liveDirNode = document.getElementById("dir");
    var liveDetailsNode = document.getElementById("details");
    var numberPerPage = 7;
    var urlObject = urlUtils.urlToObject(document.location.href);
    if (urlObject && urlObject.query) {
        if (urlObject.query.webmap) {
            webmapId = urlObject.query.webmap;
        }
    }
    var map = new WebMap({
        portalItem: {
            id: webmapId
        }
    });
    var view = new MapView({
        map: map,
        container: "viewDiv"
    });
    // Add the live node to the view
    view.ui.add(liveNode, "manual");
    // When user tabs into the app for the first time
    // add button to navigate map via keyboard to the ui and focus it 
    document.addEventListener("keydown", function handler(e) {
        if (e.keyCode === 9) {
            e.currentTarget.removeEventListener(e.type, handler);
            var keyboardBtn_1 = document.getElementById("keyboard");
            keyboardBtn_1.classList.remove("hidden");
            view.ui.add({
                component: keyboardBtn_1,
                position: "top-left",
                index: 0
            });
            keyboardBtn_1.addEventListener("click", addFocusToMap);
            keyboardBtn_1.focus();
            keyboardBtn_1.addEventListener('blur', function blurHandler(e) {
                e.currentTarget.removeEventListener(e.type, blurHandler);
                keyboardBtn_1.focus();
            });
        }
    });
    var searchWidget = new Search({
        view: view,
        popupEnabled: true,
        popupOpenOnSelect: true,
        autoSelect: true
    });
    view.ui.add({
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
        watchUtils.once(view.popup, "title", function () {
            view.popup.focus();
            watchUtils.whenFalseOnce(view.popup, "visible", function () {
                addFocusToMap();
            });
        });
    });
    var homeWidget = new Home({
        view: view
    });
    view.ui.add(homeWidget, "top-left");
    /**
     * Get the first layer in the map to use as the layer to query for features
     * that appear within the highlighted graphic
    */
    view.when(function () {
        initialExtent = view.extent.clone();
        view.on("layerview-create", function (result) {
            var l;
            if (result.layerView.layer.type === "feature") {
                l = result.layer;
                if (l.popupEnabled) {
                    queryLayers.push(result.layerView);
                }
            }
            else if (result.layerView.layer.type === "map-image") {
                l = result.layerView.layer;
                l.sublayers.forEach(function (layer) {
                    if (layer.popupTemplate) {
                        queryLayers.push(layer);
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
        // Add a legend when the map view loads
          var featureLayer = map.layers.getItemAt(0); // Grab the first layer from the webmap
          var legend = new Legend({
            container: "legendDiv",
            view: view,
            layerInfos: [{
              layer: featureLayer,
              title: "Trailheads"
            }]
          });
          view.ui.add({
              component: legend,
              position: "top-right"
          });
    });
    function setupKeyHandlers() {
        if (!watchHandler) {
            watchHandler = watchUtils.pausable(view, "extent", function () {
                createGraphic(view);
            });
        }
        else {
            watchHandler.resume();
        }
        if (!keyUpHandler) {
            /**
             * Handle numeric nav keys
             */
            keyUpHandler = view.on("key-up", function (keyEvt) {
                var key = keyEvt.key;
                if (pageResults && pageResults.length && key <= pageResults.length) {
                    displayFeatureInfo(key);
                }
                // not on the first page and more than one page
                else if (key === "8" && numberOfPages > 1 && currentPage > 1) {
                    currentPage -= 1;
                    generateList();
                }
                // we have more than one page
                else if (key === "9" && numberOfPages > 1) {
                    currentPage += 1;
                    generateList();
                }
            });
        }
        if (!keyDownHandler) {
            /**
             * Handle info and dir keys
             */
            var worldLocator_1 = new Locator({
                url: "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer"
            });
            keyDownHandler = view.on("key-down", function (keyEvt) {
                var key = keyEvt.key;
                if (key === "i") {
                    // reverse geocode and display location information
                    var rectExt = view.graphics.getItemAt(0).geometry;
                    var loc = rectExt.center;
                    worldLocator_1.locationToAddress(loc, 1000).then(function (candidate) {
                        calculateLocation(candidate.attributes);
                    }, function (err) {
                        liveDirNode.innerHTML = "Unable to calculate location";
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
                    liveDirNode.innerHTML = "Moving " + dir + ".";
                }
                else if (key === "h") {
                    /// Go to the view's initial extent
                    view.goTo(initialExtent);
                }
            });
        }
    }
    /**
     * Toggles on/off the key handlers for Pop-up boxes based off their visibility
     */
    function popupKeyHandler() {
        if (view.popup.visible) {
            view.popup.container.addEventListener('keydown', popupKeyHandlerFunction);
        }
        else {
            view.popup.container.removeEventListener('keydown', popupKeyHandlerFunction);
        }
    }
    /**
     * Adds key handlers to Pop-up boxes
     * @param keyEvt
     */
    function popupKeyHandlerFunction(keyEvt) {
        var key = keyEvt.key;
        if (key === "Escape") {
            view.popup.close();
        }
    }
    /**
     * Clean up the highlight graphic and feature list if the map loses
     * focus and the popup isn't visible
     */
    function cleanUp() {
        if (view.popup.visible) {
            return;
        }
        liveNode.classList.add("hidden");
        liveDetailsNode.innerHTML = null;
        liveDirNode.innerHTML = null;
        view.graphics.removeAll();
        if (watchHandler) {
            watchHandler.pause();
        }
        if (keyDownHandler) {
            keyDownHandler.remove();
            keyDownHandler = null;
        }
        if (keyUpHandler) {
            keyUpHandler.remove();
            keyUpHandler = null;
        }
    }
    /**
     *  Add a highlight graphic to the map and use it to navigate/query content
     * @param view
     */
    function createGraphic(view) {
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
        if (queryLayers && queryLayers.length > 0) {
            queryFeatures(graphic.geometry);
        }
    }
    /**
     *  Query the feature layer to get the features within the highlighted area
     * currently setup for just the first layer in web map
     * @param queryGraphic Extent graphic used drawn on the map and used to select features
     */
    function queryFeatures(queryGeometry) {
        queryResults = [];
        pageResults = null;
        currentPage = 1;
        promiseUtils.eachAlways(queryLayers.map(function (layerView) {
            // if (layerView.layer.type && layerView.layer.type === "map-image") {
            var flQuery = layerView.layer.createQuery();
            flQuery.geometry = queryGeometry;
            flQuery.returnGeometry = true;
            flQuery.outFields = ["*"];
            flQuery.spatialRelationship = "intersects";
            return layerView.queryFeatures(flQuery).then(function (queryResults) {
                return queryResults;
            });
        })).then(function (results) {
            queryResults = [];
            results.forEach(function (result) {
                if (result && result.value && result.value.features) {
                    result.value.features.forEach(function (val) {
                        queryResults.push(val);
                    });
                }
            });
            numberOfPages = Math.ceil(queryResults.length / numberPerPage);
            liveDetailsNode.innerHTML = "";
            if (queryResults.length && queryResults.length > 21) {
                liveDetailsNode.innerHTML = queryResults.length + " results found in search area. Press the plus key to zoom in and reduce number of results.";
            }
            else {
                generateList();
            }
        });
    }
    function updateLiveInfo(displayResults, prev, next) {
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
        liveDetailsNode.innerHTML = updateContent;
        liveNode.setAttribute("aria-busy", "false");
    }
    /**
     * Generate a page of content for the currently highlighted area
     */
    function generateList() {
        var begin = ((currentPage - 1) * numberPerPage);
        var end = begin + numberPerPage;
        pageResults = queryResults.slice(begin, end);
        // Get page status
        var prevDisabled = currentPage === 1; // don't show 8
        var nextDisabled = currentPage === numberOfPages; // don't show 9
        liveNode.setAttribute("aria-busy", "true");
        updateLiveInfo(pageResults, !prevDisabled, !nextDisabled);
    }
    /**
     * Display popup for selected feature
     * @param key number key pressed to identify selected feature
     */
    function displayFeatureInfo(key) {
        var selectedGraphic = pageResults[key - 1];
        if (selectedGraphic) {
            var location_1;
            if (selectedGraphic.geometry.type === "point") {
                location_1 = selectedGraphic.geometry;
            }
            else if (selectedGraphic.geometry.extent && selectedGraphic.geometry.extent.center) {
                location_1 = selectedGraphic.geometry.extent.center;
            }
            liveDetailsNode.innerHTML = "Displaying content for selected feature. Press <strong>esc</strong> to close.";
            view.popup.open({
                location: location_1,
                features: [selectedGraphic]
            });
            watchUtils.whenTrueOnce(view.popup, "visible", function () {
                view.popup.focus();
                popupKeyHandler();
            });
            watchUtils.whenFalseOnce(view.popup, "visible", function () {
                addFocusToMap();
                popupKeyHandler();
            });
        }
    }
    function addFocusToMap() {
        document.getElementById("intro").innerHTML = "Use the arrow keys to navigate the map and find features. Use the plus (+) key to zoom in to the map and the minus (-) key to zoom out.\n        For details on your current area press the i key. Press the h key to return to the  starting map location.";
        window.addEventListener("mousedown", function (keyEvt) {
            // Don't show the feature list unless tab is pressed.
            // prevent default for text box so search works
            if (keyEvt.key !== "Tab") {
                if (keyEvt.target.type !== "text") {
                    keyEvt.preventDefault();
                    cleanUp();
                }
            }
        });
        view.watch("focused", function () {
            if (view.focused) {
                liveNode.classList.remove("hidden");
                createGraphic(view);
                setupKeyHandlers();
            }
            else {
                cleanUp();
            }
        });
        view.focus();
    }
    function calculateLocation(address) {
        var displayValue;
        if (view.scale > 12000000) {
            displayValue = address.CountryCode || address.Subregion;
        }
        else if (view.scale > 3000000) {
            displayValue = address.Region || address.Subregion;
        }
        else if (view.scale > 160000) {
            displayValue = address.City || address.Region || address.Subregion;
        }
        else if (view.scale > 40000) {
            displayValue = address.Neighborhood || address.Address;
        }
        else {
            displayValue = address.Match_addr || address.Address;
        }
        console.log("display", displayValue);
        liveDirNode.innerHTML = "Currently searching near " + displayValue;
    }
});
//# sourceMappingURL=main.js.map
