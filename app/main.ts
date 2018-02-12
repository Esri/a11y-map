import WebMap = require("esri/WebMap");
import urlUtils = require("esri/core/urlUtils");

import MapView = require("esri/views/MapView");
import FeatureLayer = require("esri/layers/FeatureLayer");
import SubLayer = require("esri/layers/support/Sublayer")
import FeatureLayerView = require("esri/views/layers/FeatureLayerView");
import MapImageLayer = require("esri/layers/MapImageLayer");
import Query = require("esri/tasks/support/Query");

import watchUtils = require("esri/core/watchUtils");
import requireUtils = require("esri/core/requireUtils");
import promiseUtils = require("esri/core/promiseUtils");

import Graphic = require("esri/Graphic");
import Color = require("esri/Color");
import Polygon = require("esri/geometry/Polygon");
import Extent = require("esri/geometry/Extent");
import Point = require("esri/geometry/Point");
import SimpleFillSymbol = require("esri/symbols/SimpleFillSymbol");
import SimpleLineSymbol = require("esri/symbols/SimpleLineSymbol");

import Search = require("esri/widgets/Search");
import Home = require("esri/widgets/Home");
import PopupTemplate = require('esri/PopupTemplate');

import esri = __esri;
import { Multipoint } from "esri/geometry";
import { read } from "fs";

let watchHandler: esri.PausableWatchHandle;
let keyDownHandler: IHandle;
let keyUpHandler: IHandle;

const queryLayers: any[] = [];
let displayField: string;
let webmapId = "7eca81856e22478da183da6a33c24dfe";

let queryResults: Graphic[];
let pageResults: Graphic[];

let currentPage: number;
let numberOfPages: number;
let extent: Extent = null;


const liveNode = document.getElementById("liveViewInfo");
const liveDirNode = document.getElementById("dir");
const liveDetailsNode = document.getElementById("details");

const numberPerPage: number = 7;
let enableDirections = false;

const urlObject = urlUtils.urlToObject(document.location.href);
if (urlObject && urlObject.query) {
    if (urlObject.query.webmap) {
        webmapId = urlObject.query.webmap;
    }
    if (urlObject.query.directions) {
        enableDirections = true;
    }
}
const map = new WebMap({
    portalItem: {
        id: webmapId
    }
});

const view = new MapView({
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
        const keyboardBtn = document.getElementById("keyboard");
        keyboardBtn.classList.remove("hidden");

        view.ui.add({
            component: keyboardBtn,
            position: "top-left",
            index: 0
        });
        keyboardBtn.addEventListener("click", addFocusToMap);
        keyboardBtn.focus();
        keyboardBtn.addEventListener('blur', function blurHandler(e) {
            e.currentTarget.removeEventListener(e.type, blurHandler);
            keyboardBtn.focus();
        })
    }
});

const searchWidget = new Search({
    view: view,
    popupEnabled: true,
    popupOpenOnSelect: true,
    autoSelect: true
});
const homeWidget = new Home({
    view: view
});
view.ui.add({
    component: searchWidget,
    position: "top-left",
    index: 0
});
view.ui.add(homeWidget, "top-left");


// Only search locally within the view extent 
searchWidget.sources.getItemAt(0).withinViewEnabled = true;

searchWidget.on("search-start", () => {
    watchUtils.once(view.popup, "title", () => {

        view.popup.focus();
        watchUtils.whenFalseOnce(view.popup, "visible", () => {
            addFocusToMap();
        });
    });
});

/** 
 * Get the first layer in the map to use as the layer to query for features
 * that appear within the highlighted graphic
*/
view.then(() => {
    extent = view.extent.clone();
    if (enableDirections) {
        generateDirections(view);
    }

    view.on("layerview-create", (result) => {

        if (result.layerView.layer.type === "feature") {
            const l: FeatureLayer = <FeatureLayer>result.layer;
            if (l.popupEnabled) {
                queryLayers.push(result.layerView as FeatureLayerView);
            }
        } else if (result.layerView.layer.type === "map-image") {
            const mapImageLayer = result.layerView.layer as MapImageLayer;
            mapImageLayer.sublayers.forEach(layer => {
                if (layer.popupTemplate) {
                    queryLayers.push(layer);
                }
            });
        }

    });

});
function setupKeyHandlers() {
    if (!watchHandler) {
        watchHandler = watchUtils.pausable(view, "extent", () => {
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
        keyUpHandler = view.on("key-up", (keyEvt: any) => {

            const key = keyEvt.key;
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

        keyDownHandler = view.on("key-down", (keyEvt: any) => {
            const key = keyEvt.key;
            if (key === "i") {
                // reverse geocode and display location information
                const rectExt = view.graphics.getItemAt(0).geometry as Extent;
                let loc = rectExt.center;
                const worldLocator = searchWidget.sources.getItemAt(0) as esri.LocatorSource;

                worldLocator.locator.locationToAddress(loc, 1000).then((candidate: esri.AddressCandidate) => {
                    console.log("Attributes", JSON.stringify(candidate.attributes));
                    calculateLocation(candidate.attributes);
                }, (err: Error) => {
                    liveDirNode.innerHTML = "Unable to calculate location";
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
                liveDirNode.innerHTML = `Moving ${dir}.`;
            } else if (key === "h") {
                /// Go to the view's initial extent 
                view.goTo(extent);
            }
        });
    }
}
/**
 * Clean up the highlight graphic and feature list if the map loses 
 * focus and the popup isn't visible
 */
function cleanUp(): void {
    if (view.popup.visible) {
        return;
    }
    view.blur();

    liveNode.classList.add("hidden");


    liveDetailsNode.innerHTML = null;
    liveDirNode.innerHTML = null;
    view.graphics.removeAll();
    watchHandler.pause();
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
function createGraphic(view: MapView): void {
    view.graphics.removeAll();
    view.popup.visible = false;

    const fillSymbol = new SimpleFillSymbol({
        color: new Color([0, 0, 0, 0.2]),
        outline: new SimpleLineSymbol({
            color: new Color([0, 0, 0, 0.8]),
            width: 1
        })
    });
    const centerPoint = view.center;
    const tolerance = view.scale / 60;
    const extent = new Extent({
        xmin: centerPoint.x - tolerance,
        ymin: centerPoint.y - tolerance,
        xmax: centerPoint.x + tolerance,
        ymax: centerPoint.y + tolerance,
        spatialReference: view.center.spatialReference
    });
    const graphic = new Graphic({
        geometry: extent,
        symbol: fillSymbol
    });

    view.graphics.add(graphic);

    if (queryLayers && queryLayers.length > 0) {
        queryFeatures(graphic);
    }
}
/**
 *  Query the feature layer to get the features within the highlighted area 
 * currently setup for just the first layer in web map
 * @param queryGraphic Extent graphic used drawn on the map and used to select features
 */
function queryFeatures(queryGraphic: Graphic): void {
    const query = new Query({
        geometry: queryGraphic.geometry
    });

    queryResults = [];
    pageResults = null;
    currentPage = 1;

    promiseUtils.eachAlways(queryLayers.map((layerView) => {
        let flayer: FeatureLayerView | SubLayer;
        if (layerView.layer.type && layerView.layer.type === "map-image") {
            query.returnGeometry = true;
            query.outFields = ["*"]
            flayer = layerView as SubLayer;
            return layerView.queryFeatures(query).then((queryResults: esri.FeatureSet) => {
                if (queryResults.features && queryResults.features.length && queryResults.features.length > 0) {
                    return queryResults.features;
                }
            });
        } else {
            flayer = layerView as FeatureLayerView;
            return layerView.queryFeatures(query).then((queryResults: Graphic[]) => {

                return queryResults;
            });
        }
    })).then((results: __esri.EachAlwaysResult[]) => {
        queryResults = [];
        results.forEach(result => {
            if (result && result.value) {
                result.value.forEach((val: Graphic) => {
                    queryResults.push(val);
                });
            }
        });
        numberOfPages = Math.ceil(queryResults.length / numberPerPage);
        liveDetailsNode.innerHTML = "";
        if (queryResults.length && queryResults.length > 21) {
            liveDetailsNode.innerHTML = queryResults.length + " results found in search area. Press the plus key to zoom in and reduce number of results.";
        } else {
            generateList();
        }

    });
}
function updateLiveInfo(displayResults: Graphic[], prev: boolean, next: boolean): void {
    let updateContent: string;
    if (displayResults && displayResults.length > 0) {
        let updateValues: string[] = displayResults.map((graphic: Graphic, index: number) => {
            let titleTemplate = graphic.popupTemplate.title as string;
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

    liveDetailsNode.innerHTML = updateContent;
    liveNode.setAttribute("aria-busy", "false");

}
/**
 * Generate a page of content for the currently highlighted area
 */
function generateList(): void {
    const begin = ((currentPage - 1) * numberPerPage);
    const end = begin + numberPerPage;
    pageResults = queryResults.slice(begin, end);

    // Get page status  
    const prevDisabled = currentPage === 1; // don't show 8
    const nextDisabled = currentPage === numberOfPages; // don't show 9
    liveNode.setAttribute("aria-busy", "true");
    updateLiveInfo(pageResults, !prevDisabled, !nextDisabled);
}

/**
 * Display popup for selected feature 
 * @param key number key pressed to identify selected feature
 */
function displayFeatureInfo(key: number): void {

    const selectedGraphic = pageResults[key - 1];

    if (selectedGraphic) {
        let location: Point;
        if (selectedGraphic.geometry.type === "point") {
            location = selectedGraphic.geometry as Point;
        } else if (selectedGraphic.geometry.extent && selectedGraphic.geometry.extent.center) {
            location = selectedGraphic.geometry.extent.center;
        }
        view.popup.open({
            location: location,
            features: [selectedGraphic]
        });
        watchUtils.whenTrueOnce(view.popup, "visible", () => { view.popup.focus(); })
        watchUtils.whenFalseOnce(view.popup, "visible", addFocusToMap);
    }
}
function addFocusToMap() {

    document.getElementById("intro").innerHTML = `Use the arrow keys to navigate the map and find features. Use the + key to zoom in to the map and the - key to zoom out.
        For details on your current area press the i key. Press the h key to return to the  starting map location.`

    window.addEventListener("mousedown", (keyEvt: any) => {
        // Don't show the feature list unless tab is pressed. 
        // prevent default for text box so search works
        if (keyEvt.key !== "Tab") {
            if (keyEvt.target.type !== "text") {
                keyEvt.preventDefault();
                view.blur();
            }
        }
    });

    view.watch("focused", () => {
        if (view.focused) {
            liveNode.classList.remove("hidden");
            createGraphic(view);
            setupKeyHandlers();
        } else {
            cleanUp();
        }

    });
    1
    view.focus();
}

function calculateLocation(address: any) {

    let displayValue;
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
    liveDirNode.innerHTML = `Currently searching near ${displayValue}`;
}

function generateDirections(view: MapView) {

    // Once the JSAPI directons widget supports adding a pre-created location we'll pull this out and use the 
    // Directions widget instead
    requireUtils.when(require, [
        "esri/tasks/RouteTask",
        "esri/layers/GraphicsLayer",
        "esri/tasks/support/RouteParameters",
        "esri/tasks/support/FeatureSet",
        "esri/widgets/Expand",
        "esri/widgets/Search"
    ]).then(([RouteTask, GraphicsLayer, RouteParameters, FeatureSet, Expand, Search]) => {
        const routeUrl = "https://utility.arcgis.com/usrsvcs/appservices/558KNZRaOjSBlsNN/rest/services/World/Route/NAServer/Route_World";

        const panel = document.createElement("div");
        panel.classList.add("panel");
        const directionsList = document.createElement("div");
        directionsList.id = "directionsList";
        const distanceDetails = document.createElement("div");
        distanceDetails.id = "distanceDetails";
        distanceDetails.classList.add("text-darker-gray", "driving-details", "text-rule", "text-darker-gray");

        directionsList.setAttribute("role", "alert");
        directionsList.classList.add("directions-list");
        directionsList.setAttribute("aria-atomic", "true");
        directionsList.setAttribute("aria-live", "polite");

        const searchContainer = document.createElement("div");

        const endSearchContainer = document.createElement("div");


        panel.appendChild(searchContainer);

        panel.appendChild(endSearchContainer);
        panel.appendChild(distanceDetails);
        panel.appendChild(directionsList);

        const expand = new Expand({
            view: view,
            content: panel,
            expandIconClass: "esri-icon-directions"
        });

        const routeLayer = new GraphicsLayer({
            id: "routes"
        });

        view.map.add(routeLayer);

        const routeParams = new RouteParameters({
            stops: new FeatureSet(),
            returnDirections: true,
            directionsOutputType: "complete"
        });

        const routeTask = new RouteTask({
            url: routeUrl
        });

        const startSearch = createSearch(searchContainer, "Enter start");
        const endSearch = createSearch(endSearchContainer, "Enter destination");

        const action: any = {
            title: "Directions",
            id: "directions",
            className: "esri-icon-directions"
        };

        view.popup.actions.push(action);


        view.popup.on("trigger-action", (event) => {
            if (event.action.id = "directions") {
                routeLayer.removeAll();
                const selFeature = view.popup.selectedFeature.clone();
                view.popup.close();
                view.ui.add(expand, "top-right");


                expand.watch("expanded", () => {
                    if (expand.expanded) {
                        endSearch.focus();
                    } else {
                        view.focus();
                    }
                });
                expand.expand();


                const location = view.popup.location;
                startSearch.searchTerm = location.x + ", " + location.y;
                const endGraphic = new Graphic({
                    geometry: location,
                    symbol: {
                        type: "simple-marker",
                        path: "M0-48c-9.8 0-17.7 7.8-17.7 17.4 0 15.5 17.7 30.6 17.7 30.6s17.7-15.4 17.7-30.6c0-9.6-7.9-17.4-17.7-17.4z",
                        color: "#00ff00",
                        outline: {
                            width: "1",
                            color: "#fff"
                        },
                        size: "26px"
                    }
                });
                routeLayer.add(endGraphic);

                endSearch.on("search-complete", (results: any) => {
                    routeLayer.clear
                    distanceDetails.innerHTML = "";
                    directionsList.innerHTML = "";
                    if (results.numResults > 0) {


                        const startGraphic = new Graphic({
                            geometry: results.results[0].results[0].feature.geometry, symbol: {
                                type: "simple-marker",
                                path: "M0-48c-9.8 0-17.7 7.8-17.7 17.4 0 15.5 17.7 30.6 17.7 30.6s17.7-15.4 17.7-30.6c0-9.6-7.9-17.4-17.7-17.4z",
                                color: "#0892d0",
                                outline: {
                                    width: "1",
                                    color: "#fff"
                                },
                                size: "26px"
                            }
                        });
                        routeLayer.add(startGraphic);
                        routeParams.stops.features.push(startGraphic);
                        routeParams.stops.features.push(endGraphic);
                        routeTask.solve(routeParams).then((routeResult: any) => {

                            const result = routeResult.routeResults[0];
                            const route = result.route;

                            route.symbol = {
                                type: "simple-line",
                                color: "#00b3fd",
                                width: 4,
                                outline: {
                                    color: "#fff",
                                    width: "1"
                                },
                                join: "bevel",
                                cap: "round"
                            };

                            routeLayer.add(route);

                            distanceDetails.innerHTML = `Time: ${Math.round(result.directions.totalTime)} Distance: ${Math.round(result.route.attributes.Total_Miles).toFixed(4)} miles `
                            const details = `<ol class="list-numbered directions-list"> ${result.directions.features.map((feature: Graphic) => `<li data-geometry=${feature.geometry}>${feature.attributes.text}</li>`).join("")} </ol>`

                            directionsList.innerHTML = details;

                        });
                    }
                })
            }
        });

    });

}

function createSearch(node: HTMLDivElement, placeholder: string) {

    const search = new Search({
        view: view,
        popupEnabled: false,
        popupOpenOnSelect: false,
        autoSelect: false,
        container: node
    });

    search.on("search-clear", () => {
        const layer = view.map.findLayerById("routes") as __esri.GraphicsLayer;
        layer.removeAll();

        document.getElementById("distanceDetails").innerHTML = "";
        document.getElementById("directionsList").innerHTML = "";
    });
    const source = search.sources as any;
    const locator = source.items[0];


    locator.placeholder = placeholder;
    locator.filter = { where: null, geometry: view.extent };
    return search;
}