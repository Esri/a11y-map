import WebMap = require("esri/WebMap");
import MapView = require("esri/views/MapView");
import FeatureLayer = require("esri/layers/FeatureLayer");
import FeatureLayerView = require("esri/views/layers/FeatureLayerView");
import Query = require("esri/tasks/support/Query");

import watchUtils = require("esri/core/watchUtils");
import PausableWatchHandle = __esri.PausableWatchHandle;

import Graphic = require("esri/Graphic");
import Color = require("esri/Color");
import Polygon = require("esri/geometry/Polygon");
import Extent = require("esri/geometry/Extent");
import Point = require("esri/geometry/Point");
import SimpleFillSymbol = require("esri/symbols/SimpleFillSymbol");
import SimpleLineSymbol = require("esri/symbols/SimpleLineSymbol");

let watchHandler: PausableWatchHandle = null;
let keyHandler: any = null;

let queryLayer: FeatureLayerView = null;

//  handle pagination of query results 
let queryResults: Graphic[] = null;
let pageResults: Graphic[] = null;

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
view.then(() => {
    // Get the first layer in the map to use as the layer to query for features 
    // that appear within the highlighted graphic  
    view.whenLayerView(map.layers.getItemAt(0)).then((layerView) => {
        queryLayer = layerView;
    });
    const uiNode: HTMLDivElement = <HTMLDivElement>document.querySelector(".esri-ui");
    if (uiNode) {
        uiNode.setAttribute("aria-label", map.portalItem.description);
        uiNode.setAttribute("tabindex", "0");

        uiNode.addEventListener("focus", () => {
            // When the node with the class .esri-ui is focused setup key handler and set focus to 
            // node with .esri-view-surface class. I think this should work just by setting focus on
            // .esri-view-surface but was getting odd behavior (Revist this)
            const liveNode = document.getElementById("liveViewInfo");
            liveNode.classList.remove("hidden");
            createGraphic(view);
            mapFocus();
            if (!keyHandler) {
                keyHandler = view.on("key-down", (keyEvt: any) => {
                    if (keyEvt.key <= pageResults.length) {
                        displayFeatureInfo(keyEvt.key);
                    } else if (keyEvt.key === "8" && numberOfPages > 1 && currentPage > 1) { // not on the first page and more than one page 
                        currentPage -= 1;
                        generateList();
                    } else if (keyEvt.key === "9" && numberOfPages > 1) { // we have more than one page 
                        currentPage += 1;
                        generateList();
                    } else if (keyEvt.key === "ArrowUp" || keyEvt.key === "ArrowDown" || keyEvt.key === "ArrowRight" || keyEvt.key === "ArrowLeft") {
                        let dir;
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
    const mapNode: HTMLDivElement = <HTMLDivElement>document.querySelector(".esri-view-surface");
    mapNode.setAttribute("tabindex", "0");
    mapNode.classList.add("focus");
    mapNode.focus();

    if (!watchHandler) {
        watchHandler = watchUtils.pausable(view, "extent", () => {
            createGraphic(view);
        });
    } else {
        watchHandler.resume();
    }
    mapNode.addEventListener("blur", cleanUp);
}
function cleanUp() {
    // Clean up the highlight graphic and feature list if the map loses focus and the popup
    // isn't visible 
    if (!view.popup.visible) {
        const mapNode: HTMLDivElement = <HTMLDivElement>document.querySelector(".esri-view-surface");
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
function createGraphic(view: MapView) {
    // Add a highlight graphic to the map and use it to navigate/query content
    view.graphics.removeAll();
    view.popup.visible = false;

    const fillSymbol = new SimpleFillSymbol({
        color: new Color([0, 0, 0, 0.2]),
        outline: new SimpleLineSymbol({
            color: new Color([0, 0, 0, 0.8]),
            width: 1
        }),
    });
    const centerPoint = view.center;
    // TODO: Need to work on some logic that calculates an appropriate tolerance
    const tolerance = 2000;
    const ext = new Extent({
        xmin: centerPoint.x - tolerance,
        ymin: centerPoint.y - tolerance,
        xmax: centerPoint.x + tolerance,
        ymax: centerPoint.y + tolerance,
        spatialReference: view.center.spatialReference
    });
    const graphic = new Graphic({
        geometry: ext,
        symbol: fillSymbol
    });
    view.graphics.add(graphic);
    if (queryLayer) {
        queryFeatures(graphic);
    }

}
function queryFeatures(queryGraphic: Graphic) {
    // Query the feature layer to get the features within the highlighted area 
    // currently setup for just the first layer in web map 
    const query = new Query();
    queryResults = null;
    pageResults = null;
    currentPage = 1;
    query.geometry = queryGraphic.geometry;
    queryLayer.queryFeatures(query).then((result: any) => {
        queryResults = result;
        numberOfPages = Math.ceil(queryResults.length / numberPerPage);
        generateList();
    });
}
function updateLiveInfo(displayResults: Graphic[], prev: boolean, next: boolean) {
    let liveInfo: HTMLDivElement = <HTMLDivElement>document.getElementById("liveViewInfo");
    let updateContent = null;
    let updateValues: string[] = [];
    if (displayResults && displayResults.length && displayResults.length > 0) {
        displayResults.forEach((graphic: Graphic, index: number) => {
            // ES6 Template String 
            const templateString = `<span class="feature-label"><span class="feature-index">${index + 1}</span>${graphic.attributes.NAME}</span>`;
            updateValues.push(templateString);
        });
        if (next) {
            // add 9 to get more features 
            const templateString = "<span class='feature-label'><span class='feature-index'>9</span>See more results</span>";
            updateValues.push(templateString);
        }
        if (prev) {
            // add 8 to go back 
            const templateString = "<span class='feature-label'><span class='feature-index'>8</span>View previous results</span>";
            updateValues.push(templateString);
        }
        updateContent = updateValues.join(" ");
    } else {
        updateContent = "No results found in highlight area";
    }
    liveInfo.innerHTML = updateContent;
}

function generateList() {
    // Generate a page of content for the currently highlighted area 
    const begin = ((currentPage - 1) * numberPerPage);
    const end = begin + numberPerPage;
    pageResults = queryResults.slice(begin, end);

    // Get page status 
    const prevDisabled: boolean = (currentPage === 1) ? true : false; // don't show 8
    const nextDisabled: boolean = (currentPage === numberOfPages) ? true : false; // don't show 9

    updateLiveInfo(pageResults, !prevDisabled, !nextDisabled);

}
function displayFeatureInfo(key: number) {
    // Display the popup for the currently selected feature 
    // Seems odd that I have to set features, location and open but without 
    // popup either wasn't showing or wasn't positioned correctly

    const selectedGraphic = pageResults[key - 1];
    if (selectedGraphic) {
        view.popup.features = [selectedGraphic];
        view.popup.location = <Point>selectedGraphic.geometry;

        watchUtils.once(view.popup, "visible", () => {
            if (view.popup.visible === false) {
                const mapNode: HTMLDivElement = <HTMLDivElement>document.querySelector(".esri-view-surface");
                mapNode.focus();
            }
        });
        view.popup.open(view.popup.selectedFeature);
    }
}