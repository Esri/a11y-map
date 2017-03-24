define(["require", "exports", "esri/WebMap", "esri/views/MapView", "esri/tasks/support/Query", "esri/core/watchUtils", "esri/Graphic", "esri/Color", "esri/geometry/Extent", "esri/symbols/SimpleFillSymbol", "esri/symbols/SimpleLineSymbol", "esri/tasks/Locator"], function (require, exports, WebMap, MapView, Query, watchUtils, Graphic, Color, Extent, SimpleFillSymbol, SimpleLineSymbol, Locator) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var watchHandler;
    var keyHandler;
    var queryLayer;
    var queryResults;
    var pageResults;
    var currentPage;
    var numberOfPages;
    var liveNode = document.getElementById("liveViewInfo");
    var liveDirNode = document.getElementById("dir");
    var liveDetailsNode = document.getElementById("details");
    var numberPerPage = 7;
    var locator = new Locator({
        url: "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer"
    });
    var map = new WebMap({
        portalItem: {
            id: "7eca81856e22478da183da6a33c24dfe"
        }
    });
    var view = new MapView({
        map: map,
        container: "viewDiv"
    });
    /**
     * Get the first layer in the map to use as the layer to query for features
     * that appear within the highlighted graphic
    */
    view.then(function () {
        view.whenLayerView(map.layers.getItemAt(0))
            .then(function (layerView) {
            queryLayer = layerView;
        });
        var uiNode = view.ui.container;
        uiNode.setAttribute("aria-label", map.portalItem.description);
        uiNode.setAttribute("tabindex", "0");
        uiNode.addEventListener("focus", function () {
            liveNode.classList.remove("hidden");
            createGraphic(view);
            mapFocus();
            if (!keyHandler) {
                keyHandler = view.on("key-down", function (keyEvt) {
                    var key = keyEvt.key;
                    if (pageResults && pageResults.length && key <= pageResults.length) {
                        displayFeatureInfo(key);
                    }
                    else if (key === "i") {
                        // reverse geocode and display location information
                        var loc = view.graphics.getItemAt(0).geometry.center;
                        locator.locationToAddress(loc, 1000).then(function (candidate) {
                            var address = candidate.address;
                            liveDirNode.innerHTML = "Near " + address.Match_addr;
                        });
                    }
                    else if (key === "8" && numberOfPages > 1 && currentPage > 1) {
                        currentPage -= 1;
                        generateList();
                    }
                    else if (key === "9" && numberOfPages > 1) {
                        currentPage += 1;
                        generateList();
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
                        liveDirNode.innerHTML = "Moving " + dir + " <b>i</b> for more info";
                    }
                });
            }
        });
    });
    function mapFocus() {
        var mapNode = document.querySelector(".esri-view-surface");
        mapNode.setAttribute("tabindex", "0");
        mapNode.classList.add("focus");
        mapNode.focus();
        if (!watchHandler) {
            watchHandler = watchUtils.pausable(view, "extent", function () {
                createGraphic(view);
            });
        }
        else {
            watchHandler.resume();
        }
        mapNode.addEventListener("blur", cleanUp);
    }
    /**
     * Clean up the highlight graphic and feature list if the map loses
     * focus and the popup isn't visible
     */
    function cleanUp() {
        if (view.popup.visible) {
            return;
        }
        var mapNode = document.querySelector(".esri-view-surface");
        mapNode.removeAttribute("tabindex");
        mapNode.classList.remove("focus");
        liveNode.classList.add("hidden");
        liveDetailsNode.innerHTML = null;
        liveDirNode.innerHTML = null;
        view.graphics.removeAll();
        watchHandler.pause();
        keyHandler.remove();
        keyHandler = null;
    }
    /**
     *  Add a highlight graphic to the map and use it to navigate/query content
     * @param view
     */
    function createGraphic(view) {
        view.graphics.removeAll();
        view.popup.visible = false;
        var fillSymbol = new SimpleFillSymbol({
            color: new Color([0, 0, 0, 0.2]),
            outline: new SimpleLineSymbol({
                color: new Color([0, 0, 0, 0.8]),
                width: 1
            })
        });
        var centerPoint = view.center;
        var tolerance = view.scale / 60;
        var extent = new Extent({
            xmin: centerPoint.x - tolerance,
            ymin: centerPoint.y - tolerance,
            xmax: centerPoint.x + tolerance,
            ymax: centerPoint.y + tolerance,
            spatialReference: view.center.spatialReference
        });
        var graphic = new Graphic({
            geometry: extent,
            symbol: fillSymbol
        });
        view.graphics.add(graphic);
        if (queryLayer) {
            queryFeatures(graphic);
        }
    }
    /**
     *  Query the feature layer to get the features within the highlighted area
     * currently setup for just the first layer in web map
     * @param queryGraphic Extent graphic used drawn on the map and used to sect features
     */
    function queryFeatures(queryGraphic) {
        var query = new Query({
            geometry: queryGraphic.geometry
        });
        queryResults = null;
        pageResults = null;
        currentPage = 1;
        queryLayer.queryFeatures(query)
            .then(function (result) {
            queryResults = result;
            numberOfPages = Math.ceil(queryResults.length / numberPerPage);
            generateList();
        });
    }
    function updateLiveInfo(displayResults, prev, next) {
        var updateContent;
        if (displayResults && displayResults.length > 0) {
            var updateValues = displayResults.map(function (graphic, index) {
                // ES6 Template String
                return "<span class=\"feature-label\"><span class=\"feature-index\">" + (index + 1) + "</span>" + graphic.attributes.NAME + "</span>";
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
            updateContent = "No results found in highlight area";
        }
        liveDetailsNode.innerHTML = updateContent;
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
        updateLiveInfo(pageResults, !prevDisabled, !nextDisabled);
    }
    /**
     * Display popup for selected feature
     * @param key number key pressed to identify selected feature
     */
    function displayFeatureInfo(key) {
        var selectedGraphic = pageResults[key - 1];
        if (selectedGraphic) {
            var popup_1 = view.popup;
            popup_1.set({
                features: [selectedGraphic],
                location: selectedGraphic.geometry
            });
            watchUtils.once(popup_1, "visible", function () {
                if (!popup_1.visible) {
                    var mapNode = document.querySelector(".esri-view-surface");
                    mapNode.focus();
                }
            });
            popup_1.open(popup_1.selectedFeature);
        }
    }
});
//# sourceMappingURL=main.js.map