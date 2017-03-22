import WebMap = require("esri/WebMap");
import MapView = require("esri/views/MapView");
import FeatureLayer = require("esri/layers/FeatureLayer");
import FeatureLayerView = require("esri/views/layers/FeatureLayerView");
import Query = require("esri/tasks/support/Query");

import watchUtils = require("esri/core/watchUtils");
import esri = __esri;

import Graphic = require("esri/Graphic");
import Color = require("esri/Color");
import Polygon = require("esri/geometry/Polygon");
import Extent = require("esri/geometry/Extent");
import Point = require("esri/geometry/Point");
import SimpleFillSymbol = require("esri/symbols/SimpleFillSymbol");
import SimpleLineSymbol = require("esri/symbols/SimpleLineSymbol");

let watchHandler: esri.PausableWatchHandle;
let keyHandler: any;

let queryLayer: FeatureLayerView;

let queryResults: Graphic[];
let pageResults: Graphic[];

let currentPage: number;
let numberOfPages: number;
const numberPerPage: number = 7;

const map = new WebMap({
    portalItem: {
        id: "7eca81856e22478da183da6a33c24dfe"
    }
});

const view = new MapView({
    map: map,
    container: "viewDiv"
});


/** 
 * Get the first layer in the map to use as the layer to query for features
 * that appear within the highlighted graphic
*/
view.then(() => {
    view.whenLayerView(map.layers.getItemAt(0))
        .then(layerView => {
            queryLayer = layerView;
        });

    const uiNode: HTMLDivElement = view.ui.container;

    uiNode.setAttribute("aria-label", map.portalItem.description);
    uiNode.setAttribute("tabindex", "0");

    uiNode.addEventListener("focus", () => {

        const liveNode = document.getElementById("liveViewInfo");
        liveNode.classList.remove("hidden");
        createGraphic(view);
        mapFocus();

        if (!keyHandler) {
            keyHandler = view.on("key-down", (keyEvt: any) => {
                const key = keyEvt.key;

                if (key <= pageResults.length) {
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

                else if (key === "ArrowUp" || key === "ArrowDown" ||
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

                    liveNode.innerHTML = `Moving ${dir}`;
                }
            });
        }
    });
});

function mapFocus(): void {
    const mapNode: HTMLDivElement = <HTMLDivElement>document.querySelector(".esri-view-surface");
    mapNode.setAttribute("tabindex", "0");
    mapNode.classList.add("focus");
    mapNode.focus();

    if (!watchHandler) {
        watchHandler = watchUtils.pausable(view, "extent", () => {
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
function cleanUp(): void {
    if (view.popup.visible) {
        return;
    }
    const mapNode: HTMLDivElement = <HTMLDivElement>document.querySelector(".esri-view-surface");
    mapNode.removeAttribute("tabindex");
    mapNode.classList.remove("focus");
    const liveViewInfoNode = document.getElementById("liveViewInfo");
    liveViewInfoNode.innerHTML = null;
    liveViewInfoNode.classList.add("hidden");
    view.graphics.removeAll();
    watchHandler.pause();
    keyHandler.remove();
    keyHandler = null;
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
    // TODO: Need to work on some logic that calculates an appropriate tolerance
    const tolerance = 2000;
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

    if (queryLayer) {
        queryFeatures(graphic);
    }
}
/**
 *  Query the feature layer to get the features within the highlighted area 
 * currently setup for just the first layer in web map
 * @param queryGraphic Extent graphic used drawn on the map and used to sect features
 */
function queryFeatures(queryGraphic: Graphic): void {
    const query = new Query({
        geometry: queryGraphic.geometry
    });
    queryResults = null;
    pageResults = null;
    currentPage = 1;

    queryLayer.queryFeatures(query)
        .then(result => {
            queryResults = result;
            numberOfPages = Math.ceil(queryResults.length / numberPerPage);
            generateList();
        });
}

function updateLiveInfo(displayResults: Graphic[], prev: boolean, next: boolean): void {
    let liveInfo: HTMLDivElement = <HTMLDivElement>document.getElementById("liveViewInfo");
    let updateContent: string;

    if (displayResults && displayResults.length > 0) {
        let updateValues: string[] = displayResults.map((graphic: Graphic, index: number) => {
            // ES6 Template String
            return `<span class="feature-label"><span class="feature-index">${index + 1}</span>${graphic.attributes.NAME}</span>`;
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
        updateContent = "No results found in highlight area";
    }

    liveInfo.innerHTML = updateContent;
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

    updateLiveInfo(pageResults, !prevDisabled, !nextDisabled);
}

/**
 * Display popup for selected feature 
 * @param key number key pressed to identify selected feature
 */
function displayFeatureInfo(key: number): void {

    const selectedGraphic = pageResults[key - 1];

    if (selectedGraphic) {
        const popup = view.popup;

        popup.set({
            features: [selectedGraphic],
            location: selectedGraphic.geometry
        });

        watchUtils.once(popup, "visible", () => {
            if (!popup.visible) {
                const mapNode = <HTMLDivElement>document.querySelector(".esri-view-surface");
                mapNode.focus();
            }
        });

        popup.open(popup.selectedFeature);
    }
}