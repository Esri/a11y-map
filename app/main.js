define(["require", "exports", "esri/WebMap", "esri/views/MapView", "esri/tasks/support/Query", "esri/core/watchUtils", "esri/Graphic", "esri/Color", "esri/geometry/Extent", "esri/symbols/SimpleFillSymbol", "esri/symbols/SimpleLineSymbol"], function (require, exports, WebMap, MapView, Query, watchUtils, Graphic, Color, Extent, SimpleFillSymbol, SimpleLineSymbol) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var watchHandler = null;
    var keyHandler = null;
    var queryLayer = null;
    //  handle pagination of query results 
    var queryResults = null;
    var pageResults = null;
    var currentPage;
    var numberOfPages;
    var numberPerPage = 7;
    var map = new WebMap({
        portalItem: {
            id: "7eca81856e22478da183da6a33c24dfe"
        }
    });
    var view = new MapView({
        map: map,
        container: "viewDiv"
    });
    view.then(function () {
        // Get the first layer in the map to use as the layer to query for features 
        // that appear within the highlighted graphic  
        view.whenLayerView(map.layers.getItemAt(0)).then(function (layerView) {
            queryLayer = layerView;
        });
        var uiNode = document.querySelector(".esri-ui");
        if (uiNode) {
            uiNode.setAttribute("aria-label", map.portalItem.description);
            uiNode.setAttribute("tabindex", "0");
            uiNode.addEventListener("focus", function () {
                // When the node with the class .esri-ui is focused setup key handler and set focus to 
                // node with .esri-view-surface class. I think this should work just by setting focus on
                // .esri-view-surface but was getting odd behavior (Revist this)
                var liveNode = document.getElementById("liveViewInfo");
                liveNode.classList.remove("hidden");
                createGraphic(view);
                mapFocus();
                if (!keyHandler) {
                    keyHandler = view.on("key-down", function (keyEvt) {
                        if (keyEvt.key <= pageResults.length) {
                            displayFeatureInfo(keyEvt.key);
                        }
                        else if (keyEvt.key === "8" && numberOfPages > 1 && currentPage > 1) {
                            currentPage -= 1;
                            generateList();
                        }
                        else if (keyEvt.key === "9" && numberOfPages > 1) {
                            currentPage += 1;
                            generateList();
                        }
                        else if (keyEvt.key === "ArrowUp" || keyEvt.key === "ArrowDown" || keyEvt.key === "ArrowRight" || keyEvt.key === "ArrowLeft") {
                            var dir = void 0;
                            switch (keyEvt.key) {
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
                            liveNode.innerHTML = "Moving " + dir;
                        }
                    });
                }
            });
        }
    });
    function mapFocus() {
        // Set focus to the map node and add border around map node to show that it's focused. 
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
    function cleanUp() {
        // Clean up the highlight graphic and feature list if the map loses focus and the popup
        // isn't visible 
        if (!view.popup.visible) {
            var mapNode = document.querySelector(".esri-view-surface");
            mapNode.removeAttribute("tabindex");
            mapNode.classList.remove("focus");
            document.getElementById("liveViewInfo").innerHTML = null;
            document.getElementById("liveViewInfo").classList.add("hidden");
            view.graphics.removeAll();
            watchHandler.pause();
            keyHandler.remove();
            keyHandler = null;
        }
    }
    function createGraphic(view) {
        // Add a highlight graphic to the map and use it to navigate/query content
        view.graphics.removeAll();
        view.popup.visible = false;
        var fillSymbol = new SimpleFillSymbol({
            color: new Color([0, 0, 0, 0.2]),
            outline: new SimpleLineSymbol({
                color: new Color([0, 0, 0, 0.8]),
                width: 1
            }),
        });
        var centerPoint = view.center;
        var tolerance = 2000;
        var ext = new Extent({
            xmin: centerPoint.x - tolerance,
            ymin: centerPoint.y - tolerance,
            xmax: centerPoint.x + tolerance,
            ymax: centerPoint.y + tolerance,
            spatialReference: view.center.spatialReference
        });
        var graphic = new Graphic({
            geometry: ext,
            symbol: fillSymbol
        });
        view.graphics.add(graphic);
        if (queryLayer) {
            queryFeatures(graphic);
        }
    }
    function queryFeatures(queryGraphic) {
        // Query the feature layer to get the features within the highlighted area 
        // currently setup for just the first layer in web map 
        var query = new Query();
        queryResults = null;
        pageResults = null;
        currentPage = 1;
        query.geometry = queryGraphic.geometry;
        queryLayer.queryFeatures(query).then(function (result) {
            queryResults = result;
            numberOfPages = Math.ceil(queryResults.length / numberPerPage);
            generateList();
        });
    }
    function updateLiveInfo(displayResults, prev, next) {
        var liveInfo = document.getElementById("liveViewInfo");
        var updateContent = null;
        var updateValues = [];
        if (displayResults && displayResults.length && displayResults.length > 0) {
            displayResults.forEach(function (graphic, index) {
                // ES6 Template String 
                var templateString = "<span class=\"feature-label\"><span class=\"feature-index\">" + (index + 1) + "</span>" + graphic.attributes.NAME + "</span>";
                updateValues.push(templateString);
            });
            if (next) {
                // add 9 to get more features 
                var templateString = "<span class='feature-label'><span class='feature-index'>9</span>See more results</span>";
                updateValues.push(templateString);
            }
            if (prev) {
                // add 8 to go back 
                var templateString = "<span class='feature-label'><span class='feature-index'>8</span>View previous results</span>";
                updateValues.push(templateString);
            }
            updateContent = updateValues.join(" ");
        }
        else {
            updateContent = "No results found in highlight area";
        }
        liveInfo.innerHTML = updateContent;
    }
    function generateList() {
        // Generate a page of content for the currently highlighted area 
        var begin = ((currentPage - 1) * numberPerPage);
        var end = begin + numberPerPage;
        pageResults = queryResults.slice(begin, end);
        // Get page status 
        var prevDisabled = (currentPage === 1) ? true : false; // don't show 8
        var nextDisabled = (currentPage === numberOfPages) ? true : false; // don't show 9
        updateLiveInfo(pageResults, !prevDisabled, !nextDisabled);
    }
    function displayFeatureInfo(key) {
        // Display the popup for the currently selected feature 
        // Seems odd that I have to set features, location and open but without 
        // popup either wasn't showing or wasn't positioned correctly
        var selectedGraphic = pageResults[key - 1];
        if (selectedGraphic) {
            view.popup.features = [selectedGraphic];
            view.popup.location = selectedGraphic.geometry;
            watchUtils.once(view.popup, "visible", function () {
                if (view.popup.visible === false) {
                    // const mapNode: HTMLDivElement = <HTMLDivElement>document.querySelector(".esri-view-surface");
                    // mapNode.focus();
                }
            });
            view.popup.open(view.popup.selectedFeature);
        }
    }
});
//# sourceMappingURL=main.js.map