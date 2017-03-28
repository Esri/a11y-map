# a11y-map
A prototype app to test adding keyboard interaction (similar to Google's a11y behavior)with Esri's ArcGIS API for JavaScript version 4. 

## Purpose 
Use as a starting point to discusss ways to handle map accessiblity. 

## Features 

To see the a11y features tab into the map. Once you do so you'll see an extent graphic and feature list are added to the map to allow users to navigate the map content via the keyboard. At this point this is just a prototype app and feedback and comments are greatly appreciated. 

You can access a live version of the app for testing here. The live test app supports a web map url parameter so you can append ?webmap=<some web map id> to the url to test with various web maps. The app requires that the map has a feature layer as the first layer and it uses the first string field it finds as the display field. 

[Live App](https://kellyhutchins.github.io/a11y-map/index.html)

Another interesting app that shows navigating content in an accessible manner is Patrick Arlt's demo app available here. 
[Accessible Search](https://github.com/patrickarlt/accessible-js-api-app)


## Navigation tips

Tab into the map to activate the extent search and display results. Once in the map you can use the arrow keys to move right, left, up or down in the map. Use - to zoom in and + to zoom out. While the location dialog is active press i for more details about the area. Under the hood pressing i does a reverse geocode to find the address for the center of the query box. 

## Contributing

Contributons are welcome. Please see the Esri [guidelines for contributing](https://github.com/esri/contributing).

## Licensing

Copyright 2013 Esri

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

A copy of the license is available in the repository's [license.txt](https://raw.github.com/Esri/application-boilerplate-js/master/license.txt) file.

[](Esri Tags: a11y Esri JavaScript application)
[](Esri Language: JavaScript)

