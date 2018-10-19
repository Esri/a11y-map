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

import FeatureLayer = require("esri/layers/FeatureLayer");
import Point = require("esri/geometry/Point");
import Collection = require("esri/core/Collection");

import esri = __esri;


let watchHandler: esri.PausableWatchHandle;
let keyDownHandler: IHandle;
let keyUpHandler: IHandle;

const queryLayers: any[] = [];
let webmapId = "7eca81856e22478da183da6a33c24dfe";

let queryResults: Graphic[];
let pageResults: Graphic[];
let featureResults: Graphic[];

let currentPage: number;
let numberOfPages: number;
let initialExtent: esri.Extent = null;


const liveNode = document.getElementById("liveViewInfo");
const liveDirNode = document.getElementById("dir");
const liveDetailsNode = document.getElementById("details");

const numberPerPage: number = 7;

/* some constants for toggling */
const addTable: boolean = true;
const visTableAttr: Array<[string, string]> = [["Name", 'NAME'], ['Address', 'Address'], ['Elevation (ft)', 'Elevation'], ['Horseback riding', 'HorseTrail'], ['ADA accessibility rating', 'ADAtrail'], ['Dogs allowed', 'TH_LEASH'], ['Biking Allowed', 'BikeTrail'], ['Picnic tables available', 'PICNIC']]; 

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
        (<HTMLElement>view.popup.container).addEventListener('keyup', popupKeyHandlerFunction);
    } else {
        (<HTMLElement>view.popup.container).removeEventListener('keyup', popupKeyHandlerFunction);
    }
}
/**
 * Adds key handlers to Pop-up boxes 
 * @param keyEvt
 */
function popupKeyHandlerFunction(keyEvt: any): void {
    keyEvt.preventDefault();
    keyEvt.stopPropagation();
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
 * @param {number} key number key pressed to identify selected feature
 * @param {Graphic[]} [resultsArray=pageResults] Optional: array of graphics to display as pop-up feature
 */
function displayFeatureInfo(key: number, resultsArray: Graphic[] = pageResults): void {

    const selectedGraphic = resultsArray[key - 1];

    if (selectedGraphic) {
        let location: esri.Point;
        if (selectedGraphic.geometry.type === "point") {
            location = selectedGraphic.geometry as esri.Point;
        } else if (selectedGraphic.geometry.extent && selectedGraphic.geometry.extent.center) {
            location = selectedGraphic.geometry.extent.center;
        }
        
        //if location is not within the ui extent, move extent to include location
        if( !view.extent.contains(location) ) {
            view.goTo(location);
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
            //if last focus is set return there, else go to map
            let destination = document.getElementById("esri-a11y-last-focus");
            if(destination){
                document.getElementById("intro").innerHTML = "";
                destination.focus();
                destination.id = "";
            } else {
                addFocusToMap();
            }
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

/**
 * Create table of pop-up data 
 */
if(addTable){
    view.when(function(){ //function for when all feaeture layers are laoaded? 
        const tableComponent = document.createElement("div");
        tableComponent.className = "esri-a11y-map-table-component";
        tableComponent.id = "esri-a11y-table-component";
        //create toggle button
        const tableToggle = document.getElementById("esri-a11y-table-toggle");
        tableToggle.classList.remove("hidden");
        view.ui.add({
            component: tableToggle,
            position: "top-left"
        });
        const tableContainer = document.createElement("div");
        tableContainer.className = "esri-a11y-map-table-container";
        const tableNode = createTable();
        tableContainer.appendChild(tableNode);
        tableComponent.appendChild(tableContainer);
        view.ui.add(tableComponent);
    });
}

/**
 * Function to fill feature table
 * Queries operational layers and uses features to populate table
 */
function createTable(): HTMLElement {
    const tableNode = document.createElement("table");
    //tableNode.className = "esri-a11y-map-popup-table"; 
    let tableRow = document.createElement("tr");
    let tableData: HTMLElement;
    for (let labelArray of visTableAttr){
        tableData = document.createElement("th");
        tableData.innerText = labelArray[0];
        tableRow.appendChild(tableData);
    }
    tableNode.appendChild(tableRow);
    map.layers.forEach(function(layer){
        //how should we seperate table for seperate layers? 
        if(layer.type == "feature") { //are there any operational types that wouldnt be included ?
            if(!featureResults) {
                featureResults = [];
            }
            let featLayer = <FeatureLayer> layer;
            let query = featLayer.createQuery();
            query.returnGeometry = true;
            featLayer.queryFeatures(query).then(function(results){
                results.features.forEach((feature, index) => {
                    featureResults.push(feature);
                    tableRow = document.createElement("tr");
                    for (let labelArray of visTableAttr) {
                        tableData = document.createElement("td");
                        if (labelArray[1] == 'Address'){
                            let addLink = document.createElement("a");
                            addLink.href = "#"; 
                            addLink.className = "esri-table-point-reference";
                            //addLink.dataset.id = "" + (index + 1); //to compensate for the displayFeatureInfo function subtracting 1 by default
                            addLink.innerText = feature.attributes[labelArray[1]];
                            addLink.tabIndex = -1;
                            tableData.appendChild(addLink);
                        } else {
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
function addUIToTable(): void{
    //click handler for addresses 
    const tableClickHandler = function(e: Event) {
        e.preventDefault;
        e.stopPropagation;
        (e.currentTarget as Element ).id = "esri-a11y-last-focus";
        let id = this.getAttribute("data-id");
        displayFeatureInfo(id, featureResults);
    };
    const tableFocusHandler = function(e: Event) {
        const target = e.currentTarget as Element;
        let featureName = target.firstElementChild.innerHTML;
        // detail read of table items
        liveDetailsNode.innerHTML = featureName;
    }

    //click handler for table toggler
    const toggleBtn = document.getElementById("esri-a11y-table-toggle");
    const toggleClickHandler = function(e: Event) {
        e.preventDefault;
        e.stopPropagation;
        const tableContainer = document.getElementById("esri-a11y-table-component");
        let containerClasses = tableContainer.classList;
        let tableRows = tableContainer.getElementsByClassName("esri-a11y-map-table-row");
        if(!containerClasses.contains("open")) {
            tableContainer.classList.add("open");
            for (let i = 0; i < tableRows.length; i++){
                tableRows[i].setAttribute("tabIndex", "0");
                tableRows[i].addEventListener('click', tableClickHandler, false);
                tableRows[i].addEventListener('focus', tableFocusHandler, false);
            }
            //add keyboard handlers
            tableContainer.addEventListener("keyup", tableKeyHandlers);

            
            //move focus to table
            (tableRows[0] as HTMLElement).focus({preventScroll:true});
            
            // directions of how to use table and show live region
            liveNode.classList.remove("hidden");
            document.getElementById("intro").innerHTML = `Use the up and down arrow keys to navigate the table and find features. Use the enter key to toggle more information on the feature. 
            To return to the map, press escape.`;
            
        } else {
            tableContainer.classList.remove("open");
            for (let i = 0; i < tableRows.length; i++){
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
    const toggleEnterHandler = function(e: KeyboardEvent) : void {
        let key = e.which || e.keyCode;
        if(key == 13) {
            let event = new Event("click");
            e.target.dispatchEvent(event);
        }
        return;
    };
    toggleBtn.addEventListener('click', toggleClickHandler, false);
    toggleBtn.addEventListener('keyup', toggleEnterHandler, false);
}

/**
 * Key handlers from Table 
 */
function tableKeyHandlers (keyEvt: any) {
    const key = keyEvt.key;
    if (key === "Escape") {
        // esc to exit to toggle button
        const toggleBtn = document.getElementById("esri-a11y-table-toggle");
        toggleBtn.dispatchEvent( (new Event("click")) );
    } else if (key === "ArrowUp") {
        // up arrow to go previous row
        let prev = keyEvt.target.previousElementSibling;
        if( !prev || !prev.hasAttribute("tabIndex") ){
            prev = keyEvt.target.parentElement.lastElementChild;
        }
        prev.focus();
        
    } else if (key === "ArrowDown") {
        // down arrow to go next row
        let next = keyEvt.target.nextElementSibling;
        if( !next || !next.hasAttribute("tabIndex") ){
            next = keyEvt.target.parentElement.firstElementChild.nextElementSibling;
        }
        next.focus();
    } else if (key === "Enter") {
        // enter trigger click 
        keyEvt.target.dispatchEvent( (new Event("click")) );
    }
}

