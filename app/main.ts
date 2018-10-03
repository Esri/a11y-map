import WebMap = require("esri/WebMap");
import urlUtils = require("esri/core/urlUtils");

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
import { watch } from "fs";


let watchHandler: esri.PausableWatchHandle;
let keyDownHandler: IHandle;
let keyUpHandler: IHandle;

const queryLayers: any[] = [];
let webmapId = "7eca81856e22478da183da6a33c24dfe";

let queryResults: Graphic[];
let pageResults: Graphic[];

let currentPage: number;
let numberOfPages: number;
let initialExtent: esri.Extent = null;


const liveNode = document.getElementById("liveViewInfo");
const liveDirNode = document.getElementById("dir");
const liveDetailsNode = document.getElementById("details");

const numberPerPage: number = 7;

//Add constant to limit navigation extent
const limitNav : boolean = true;
const xmax : number = -11675223.511033827;
const xmin : number = -11766718.63389106;
const ymax : number = 4905061.491547991;
const ymin : number = 4837491.158543985;

const urlObject = urlUtils.urlToObject(document.location.href);
if (urlObject && urlObject.query) {
    if (urlObject.query.webmap) {
        webmapId = urlObject.query.webmap;
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
    view,
    popupEnabled: true,
    popupOpenOnSelect: true,
    autoSelect: true
});

view.ui.add({
    component: searchWidget,
    position: "top-left",
    index: 0
});

searchWidget.watch("activeSource", (s) => {
    const source = searchWidget.activeSource as esri.LocatorSource;
    if (source) {
        source.withinViewEnabled = true;
    }
});

searchWidget.on("search-start", () => {
    watchUtils.once(view.popup, "title", () => {
        view.popup.focus();
        watchUtils.whenFalseOnce(view.popup, "visible", () => {
            addFocusToMap();
        });
    });
});
const homeWidget = new Home({
    view
});
view.ui.add(homeWidget, "top-left");
/** 
 * Get the first layer in the map to use as the layer to query for features
 * that appear within the highlighted graphic
*/
view.when(() => {
    initialExtent = view.extent.clone();
    view.on("layerview-create", (result) => {
        let l: esri.FeatureLayer | esri.MapImageLayer;
        if (result.layerView.layer.type === "feature") {
            l = result.layer as esri.FeatureLayer;
            if (l.popupEnabled) {
                queryLayers.push(result.layerView as esri.FeatureLayerView);
            }
        } else if (result.layerView.layer.type === "map-image") {
            l = result.layerView.layer as esri.MapImageLayer;
            l.sublayers.forEach(layer => {
                if (layer.popupTemplate) {
                    queryLayers.push(layer);
                }
            });
        }
        // add layer as locator to search widget 
        searchWidget.sources.push({
            featureLayer: l,
            placeholder: `Search ${l.title} layer`,
            withinViewEnabled: true
        } as esri.FeatureLayerSource);

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

        const worldLocator = new Locator({
            url: "https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer"
        });
        keyDownHandler = view.on("key-down", (keyEvt: any) => {
            const key = keyEvt.key;
            if (key === "i") {
                // reverse geocode and display location information
                const rectExt = view.graphics.getItemAt(0).geometry as esri.Extent;
                let loc = rectExt.center;
                worldLocator.locationToAddress(loc, 1000).then((candidate: esri.AddressCandidate) => {
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
                view.goTo(initialExtent);
            }
        });
    }
}
/**
 * Toggles on/off the key handlers for Pop-up boxes based off their visibility
 */
function popupKeyHandler():void {
    if(view.popup.visible){
        (<HTMLElement>view.popup.container).addEventListener('keydown', popupKeyHandlerFunction);
    } else {
        (<HTMLElement>view.popup.container).removeEventListener('keydown', popupKeyHandlerFunction);
    }
}
/**
 * Adds key handlers to Pop-up boxes 
 * @param keyEvt
 */
function popupKeyHandlerFunction(keyEvt: any): void {
    const key = keyEvt.key;
    if (key === "Escape") {
        view.popup.close();
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
function createGraphic(view: MapView): void {
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
    if (queryLayers && queryLayers.length > 0) {
        queryFeatures(graphic.geometry as esri.Extent);
    }
}
/**
 *  Query the feature layer to get the features within the highlighted area 
 * currently setup for just the first layer in web map
 * @param queryGraphic Extent graphic used drawn on the map and used to select features
 */
function queryFeatures(queryGeometry: esri.Extent): void {
    queryResults = [];
    pageResults = null;
    currentPage = 1;
    promiseUtils.eachAlways(queryLayers.map((layerView) => {
        // if (layerView.layer.type && layerView.layer.type === "map-image") {
        const flQuery = layerView.layer.createQuery();
        flQuery.geometry = queryGeometry;
        flQuery.returnGeometry = true;
        flQuery.outFields = ["*"];
        flQuery.spatialRelationship = "intersects";
        return layerView.queryFeatures(flQuery).then((queryResults: esri.FeatureSet | Graphic[]) => {
            return queryResults;
        });
    })).then((results: esri.EachAlwaysResult[]) => {
        queryResults = [];
        results.forEach(result => {
            if (result && result.value && result.value.features) {
                result.value.features.forEach((val: Graphic) => {
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
        let location: esri.Point;
        if (selectedGraphic.geometry.type === "point") {
            location = selectedGraphic.geometry as esri.Point;
        } else if (selectedGraphic.geometry.extent && selectedGraphic.geometry.extent.center) {
            location = selectedGraphic.geometry.extent.center;
        }
        liveDetailsNode.innerHTML = "Displaying content for selected feature. Press <strong>esc</strong> to close.";
        view.popup.open({
            location: location,
            features: [selectedGraphic]
        });
        watchUtils.whenTrueOnce(view.popup, "visible", () => { 
            view.popup.focus(); 
            popupKeyHandler();
        })
        watchUtils.whenFalseOnce(view.popup, "visible", () => {
            addFocusToMap();
            popupKeyHandler();
        });
    }
}
function addFocusToMap() {

    document.getElementById("intro").innerHTML = `Use the arrow keys to navigate the map and find features. Use the plus (+) key to zoom in to the map and the minus (-) key to zoom out.
        For details on your current area press the i key. Press the h key to return to the  starting map location.`

    window.addEventListener("mousedown", (keyEvt: any) => {
        // Don't show the feature list unless tab is pressed. 
        // prevent default for text box so search works
        if (keyEvt.key !== "Tab") {
            if (keyEvt.target.type !== "text") {
                keyEvt.preventDefault();
                cleanUp();
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
    console.log("display", displayValue);
    liveDirNode.innerHTML = `Currently searching near ${displayValue}`;
}

/*
* If user chooses to limit the navigation area, then this creates a listener 
* for movement on view that tests if the new center is within the extent window
*/
if(limitNav){
    view.when(function(){
        //create navigation extent using map's native spacial reference
        const navigationExtent = new Extent({
            xmax: xmax,
            xmin: xmin,
            ymax: ymax,
            ymin: ymin,
            spatialReference: view.extent.spatialReference,
        });
        view.watch('center', function(newValue, oldValue, propertyName) {
            //if center goes outside extent, then move it back to the original position
            if( !navigationExtent.contains(newValue) ) {
                view.set(propertyName, oldValue); 
            }
        });
    });
}
