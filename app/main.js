define(["require", "exports", "esri/WebMap", "esri/core/urlUtils", "esri/views/MapView", "esri/core/watchUtils", "esri/core/promiseUtils", "esri/Graphic", "esri/geometry/Extent", "esri/symbols/SimpleFillSymbol", "esri/widgets/Search", "esri/widgets/Home", "esri/tasks/Locator"], function (require, exports, WebMap, urlUtils, MapView, watchUtils, promiseUtils, Graphic, Extent, SimpleFillSymbol, Search, Home, Locator) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    var watchHandler;
    var keyDownHandler;
    var keyUpHandler;
    var queryLayers = [];
    var webmapId = "7eca81856e22478da183da6a33c24dfe";
    var queryResults;
    var pageResults;
    var featureResults;
    var currentPage;
    var numberOfPages;
    var initialExtent = null;
    var liveNode = document.getElementById("liveViewInfo");
    var liveDirNode = document.getElementById("dir");
    var liveDetailsNode = document.getElementById("details");
    var numberPerPage = 7;
    /* some constants for toggling */
    var addTable = true;
    var visTableAttr = [["Name", 'NAME'], ['Address', 'Address'], ['Elevation (ft)', 'Elevation'], ['Horseback riding', 'HorseTrail'], ['ADA accessibility rating', 'ADAtrail'], ['Dogs allowed', 'TH_LEASH'], ['Biking Allowed', 'BikeTrail'], ['Picnic tables available', 'PICNIC']];
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
            view.popup.container.addEventListener('keyup', popupKeyHandlerFunction);
        }
        else {
            view.popup.container.removeEventListener('keyup', popupKeyHandlerFunction);
        }
    }
    /**
     * Adds key handlers to Pop-up boxes
     * @param keyEvt
     */
    function popupKeyHandlerFunction(keyEvt) {
        keyEvt.preventDefault();
        keyEvt.stopPropagation();
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
     * @param {number} key number key pressed to identify selected feature
     * @param {Graphic[]} [resultsArray=pageResults] Optional: array of graphics to display as pop-up feature
     */
    function displayFeatureInfo(key, resultsArray) {
        if (resultsArray === void 0) { resultsArray = pageResults; }
        var selectedGraphic = resultsArray[key - 1];
        if (selectedGraphic) {
            var location_1;
            if (selectedGraphic.geometry.type === "point") {
                location_1 = selectedGraphic.geometry;
            }
            else if (selectedGraphic.geometry.extent && selectedGraphic.geometry.extent.center) {
                location_1 = selectedGraphic.geometry.extent.center;
            }
            //if location is not within the ui extent, move extent to include location
            if (!view.extent.contains(location_1)) {
                view.goTo(location_1);
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
                //if last focus is set return there, else go to map
                var destination = document.getElementById("esri-a11y-last-focus");
                if (destination) {
                    document.getElementById("intro").innerHTML = "";
                    destination.focus();
                    destination.id = "";
                }
                else {
                    addFocusToMap();
                }
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
    /**
     * Create table of pop-up data
     */
    if (addTable) {
        view.when(function () {
            var tableComponent = document.createElement("div");
            tableComponent.className = "esri-a11y-map-table-component";
            tableComponent.id = "esri-a11y-table-component";
            //create toggle button
            var tableToggle = document.getElementById("esri-a11y-table-toggle");
            tableToggle.classList.remove("hidden");
            view.ui.add({
                component: tableToggle,
                position: "top-left"
            });
            var tableContainer = document.createElement("div");
            tableContainer.className = "esri-a11y-map-table-container";
            var tableNode = createTable();
            tableContainer.appendChild(tableNode);
            tableComponent.appendChild(tableContainer);
            view.ui.add(tableComponent);
        });
    }
    /**
     * Function to fill feature table
     * Queries operational layers and uses features to populate table
     */
    function createTable() {
        var tableNode = document.createElement("table");
        //tableNode.className = "esri-a11y-map-popup-table"; 
        var tableRow = document.createElement("tr");
        var tableData;
        for (var _i = 0, visTableAttr_1 = visTableAttr; _i < visTableAttr_1.length; _i++) {
            var labelArray = visTableAttr_1[_i];
            tableData = document.createElement("th");
            tableData.innerText = labelArray[0];
            tableRow.appendChild(tableData);
        }
        tableNode.appendChild(tableRow);
        map.layers.forEach(function (layer) {
            //how should we seperate table for seperate layers? 
            if (layer.type == "feature") { //are there any operational types that wouldnt be included ?
                if (!featureResults) {
                    featureResults = [];
                }
                var featLayer = layer;
                var query = featLayer.createQuery();
                query.returnGeometry = true;
                featLayer.queryFeatures(query).then(function (results) {
                    results.features.forEach(function (feature, index) {
                        featureResults.push(feature);
                        tableRow = document.createElement("tr");
                        for (var _i = 0, visTableAttr_2 = visTableAttr; _i < visTableAttr_2.length; _i++) {
                            var labelArray = visTableAttr_2[_i];
                            tableData = document.createElement("td");
                            if (labelArray[1] == 'Address') {
                                var addLink = document.createElement("a");
                                addLink.href = "#";
                                addLink.className = "esri-table-point-reference";
                                //addLink.dataset.id = "" + (index + 1); //to compensate for the displayFeatureInfo function subtracting 1 by default
                                addLink.innerText = feature.attributes[labelArray[1]];
                                addLink.tabIndex = -1;
                                tableData.appendChild(addLink);
                            }
                            else {
                                tableData.innerText = feature.attributes[labelArray[1]];
                            }
                            tableRow.appendChild(tableData);
                        }
                        tableRow.dataset.id = "" + (index + 1); //to compensate for the displayFeatureInfo function subtracting 1 by default
                        tableRow.tabIndex = -1;
                        tableRow.className = "esri-a11y-map-table-row";
                        tableNode.appendChild(tableRow);
                    });
                }).then(addUIToTable);
            }
        });
        return tableNode;
    }
    /**
     * Adds a functional UI to table which lets users use links to bring up the locations pop-ups
     */
    function addUIToTable() {
        //click handler for addresses 
        var tableClickHandler = function (e) {
            e.preventDefault;
            e.stopPropagation;
            e.currentTarget.id = "esri-a11y-last-focus";
            var id = this.getAttribute("data-id");
            displayFeatureInfo(id, featureResults);
        };
        var tableFocusHandler = function (e) {
            var target = e.currentTarget;
            var featureName = target.firstElementChild.innerHTML;
            // detail read of table items
            liveDetailsNode.innerHTML = featureName;
        };
        //click handler for table toggler
        var toggleBtn = document.getElementById("esri-a11y-table-toggle");
        var toggleClickHandler = function (e) {
            e.preventDefault;
            e.stopPropagation;
            var tableContainer = document.getElementById("esri-a11y-table-component");
            var containerClasses = tableContainer.classList;
            var tableRows = tableContainer.getElementsByClassName("esri-a11y-map-table-row");
            if (!containerClasses.contains("open")) {
                tableContainer.classList.add("open");
                for (var i = 0; i < tableRows.length; i++) {
                    tableRows[i].setAttribute("tabIndex", "0");
                    tableRows[i].addEventListener('click', tableClickHandler, false);
                    tableRows[i].addEventListener('focus', tableFocusHandler, false);
                }
                //add keyboard handlers
                tableContainer.addEventListener("keyup", tableKeyHandlers);
                //move focus to table
                tableRows[0].focus({ preventScroll: true });
                // directions of how to use table and show live region
                liveNode.classList.remove("hidden");
                document.getElementById("intro").innerHTML = "Use the up and down arrow keys to navigate the table and find features. Use the enter key to toggle more information on the feature. \n            To return to the map, press escape.";
            }
            else {
                tableContainer.classList.remove("open");
                for (var i = 0; i < tableRows.length; i++) {
                    tableRows[i].setAttribute("tabIndex", "-1");
                    tableRows[i].removeEventListener('click', tableClickHandler);
                    tableRows[i].removeEventListener('focus', tableFocusHandler);
                }
                //remove key handlers
                tableContainer.removeEventListener("keyup", tableKeyHandlers);
                // remove directions of how to use table and hide live region
                document.getElementById("intro").innerHTML = "";
                liveDetailsNode.innerHTML = "";
                liveNode.classList.add("hidden");
                //move focus back to toggle button
                toggleBtn.focus();
            }
        };
        //Hitting enter triggers click of button
        var toggleEnterHandler = function (e) {
            var key = e.which || e.keyCode;
            if (key == 13) {
                var event_1 = new Event("click");
                e.target.dispatchEvent(event_1);
            }
            return;
        };
        toggleBtn.addEventListener('click', toggleClickHandler, false);
        toggleBtn.addEventListener('keyup', toggleEnterHandler, false);
    }
    /**
     * Key handlers from Table
     */
    function tableKeyHandlers(keyEvt) {
        var key = keyEvt.key;
        if (key === "Escape") {
            // esc to exit to toggle button
            var toggleBtn = document.getElementById("esri-a11y-table-toggle");
            toggleBtn.dispatchEvent((new Event("click")));
        }
        else if (key === "ArrowUp") {
            // up arrow to go previous row
            var prev = keyEvt.target.previousElementSibling;
            if (!prev || !prev.hasAttribute("tabIndex")) {
                prev = keyEvt.target.parentElement.lastElementChild;
            }
            prev.focus();
        }
        else if (key === "ArrowDown") {
            // down arrow to go next row
            var next = keyEvt.target.nextElementSibling;
            if (!next || !next.hasAttribute("tabIndex")) {
                next = keyEvt.target.parentElement.firstElementChild.nextElementSibling;
            }
            next.focus();
        }
        else if (key === "Enter") {
            // enter trigger click 
            keyEvt.target.dispatchEvent((new Event("click")));
        }
    }
});
//# sourceMappingURL=main.js.map