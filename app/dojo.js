/*
  Copyright 2017 Esri

  Licensed under the Apache License, Version 2.0 (the "License");

  you may not use this file except in compliance with the License.

  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software

  distributed under the License is distributed on an "AS IS" BASIS,

  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.

  See the License for the specific language governing permissions and

  limitations under the License.​
*/
(function () {
    var _a = window.location, pathname = _a.pathname, search = _a.search;
    var distPath = pathname.substring(0, pathname.lastIndexOf("/"));
    var appPath = distPath.slice(0, distPath.lastIndexOf("/"));
    var templateAppPath = appPath.slice(0, appPath.lastIndexOf("/"));
    var localeUrlParamRegex = /locale=([\w-]+)/;
    var dojoLocale = search.match(localeUrlParamRegex) ? RegExp.$1 : undefined;
    var config = {
        async: true,
        locale: dojoLocale,
        packages: [
            {
                name: "Application",
                location: distPath + "/app",
                main: "Main"
            },
            {
                name: "ApplicationBase",
                location: appPath + "/node_modules/@esri/application-base-js",
                main: "ApplicationBase"
            },
            {
                name: "TemplateApplicationBase",
                location: templateAppPath + "/node_modules/@esri/application-base-js",
                main: "ApplicationBase"
            },
            {
                name: "config",
                location: distPath + "/config"
            }
        ]
    };
    window["dojoConfig"] = config;
})();
//# sourceMappingURL=dojo.js.map