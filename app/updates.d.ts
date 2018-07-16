declare namespace __esri {
    interface widgetsSearch extends Widget, GoTo {
        /**
         * The [source](https://developers.arcgis.com/javascript/latest/api-reference/esri-widgets-Search.html#sources) object currently selected. Can be either a [feature layer](https://developers.arcgis.com/javascript/latest/api-reference/esri-layers-FeatureLayer.html) or a [locator task](https://developers.arcgis.com/javascript/latest/api-reference/esri-tasks-Locator.html).
         * 
         * [Read more...](https://developers.arcgis.com/javascript/latest/api-reference/esri-widgets-Search.html#activeSource)
         * 
         * @default null
         */
        readonly activeSource: FeatureLayerSource | LocatorSource;
    }

    interface SearchViewModel extends Accessor, Evented, GoTo {
        /**
         * The [source](https://developers.arcgis.com/javascript/latest/api-reference/esri-widgets-Search-SearchViewModel.html#sources) object currently selected. Can be either a [feature layer](https://developers.arcgis.com/javascript/latest/api-reference/esri-layers-FeatureLayer.html) or a [locator task](https://developers.arcgis.com/javascript/latest/api-reference/esri-tasks-Locator.html).
         * 
         * [Read more...](https://developers.arcgis.com/javascript/latest/api-reference/esri-widgets-Search-SearchViewModel.html#activeSource)
         */
        readonly activeSource: FeatureLayerSource | LocatorSource;

    }
}