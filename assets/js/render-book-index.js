/*jslint node, browser, es6 */
/*globals */

var puppeteer = require('puppeteer');
var fs = require('fs');

// Initialise an array that will store an index
// or 'database' of the book-index targets.
var targetsIndex = [];

// We'll piggyback on the same code used
// for generating search indexes.
// Get the file list from search-store.js,
// which is included in search-engine.js.
// The `store` includes a list of all pages
// that Jekyll parsed when building.
var {store, output} = require('./search-engine.js');

// The main process for generating an index of targets.
function generateTargetsIndex() {
    'use strict';

    // Start an async function to scrape all URLs.
    (async function () {

        // Launch the browser.
        var browser = await puppeteer.launch({headless: true});

        var i;
        var count = 0;
        for (i = 0; i < store.length; i += 1) {

            // Make the URL path absolute, because
            // we might be indexing file-system files,
            // not web-served pages. Assume this script
            // is run from the repo root, e.g as
            // node _site/assets/js/render-book-index.js
            // in which case the repo root is the current working directory (cwd)
            var path = process.cwd() + '/_site/' + store[i].url;

            // Get the filename from the path.
            var filename = path.split('/').pop();

            // User feedback
            console.log('Indexing ' + path);

            // Open a new tab.
            var page = await browser.newPage();

            // Set debug to true to return any browser-console
            // messages to the Node console.
            var debug = true;
            if (debug === true) {
                page.on('console', function (consoleObj) {
                    console.log(consoleObj.text());
                });
            }

            // Go to the page path.
            // Puppeteer requires the protocol (file://) on OSX.
            await page.goto('file://' + path);

            // Check that any index targets for the page have been processed.
            // This is done by assets/js/index-targets.js (in bundle.js).
            await page.waitForSelector('[data-index-targets]');

            // Get the page content. Note: we can only pass serialized data
            // back to the parent process.
            var indexEntries = await page.evaluate(function () {

                var targetArray = [];
                var indexLinkTargets = document.querySelectorAll('.index-target');
                indexLinkTargets.forEach(function (entry) {

                    // Check if this target starts or ends a reference range
                    var range = '';
                    if (entry.classList.contains('index-target-from')) {
                        range = 'from';
                    }
                    if (entry.classList.contains('index-target-to')) {
                        range = 'to';
                    }

                    // Get the entry's nesting as an array.
                    // It might be a nested entry, where each level
                    // of nesting appears after double back slashes \\.
                    // e.g. software \\ book-production
                    var rawEntriesByLevel = entry.getAttribute('data-index-markup').split('\\');

                    // Trim whitespace from each entry
                    // https://stackoverflow.com/a/41183617/1781075
                    var entriesByLevel = rawEntriesByLevel.map(str => str.trim());

                    var entryObject = {
                        entrySlug: entry.id.split('--iid-')[0],
                        entryText: entry.getAttribute('data-index-entry'),
                        entryTree: JSON.stringify(entriesByLevel),
                        id: entry.id,
                        range: range,
                        bookTitle: document.body.getAttribute('data-title'),
                        translationLanguage: document.body.getAttribute('data-translation')
                    }
                    targetArray.push(entryObject);
                });

                // Note that we do not sort the entries in the targetArray.
                // The items are added in order of appearance in the DOM,
                // even if their ID numbers don't run in order. Their array order
                // which should match the order they're used for page
                // references at each entry in the book index.

                return JSON.stringify(targetArray);
            });

            // Write index objects to targetsIndex.
            // We want this for each entry on each page:
            // {
            //   entrySlug: 'entry-text'
            //   entryText: 'Entry Text',
            //   filename: 'filename.html',
            //   id: '#entry-text--iid-1',
            //   path: samples/text/filename.html
            // }

            // Parse the serialized entries and add
            // the filename and path for this file.
            indexEntries = JSON.parse(indexEntries);
            indexEntries.forEach(function (entry) {
                entry.filename = filename;
            });

            // Add the entries to the master index,
            // if there are any.
            if (indexEntries.length > 0) {
                targetsIndex.push(indexEntries);
            }

            // Increment counter.
            count += 1;

            // Close the page when we're done.
            await page.close();
        }

        // If we've got all the pages, close the Puppeteer browser.
        if (count === store.length) {
            browser.close();
        }

        // Write the book index 'database' file.
        // We add module.exports so that we can use indexTargets
        // in Node processes (i.e. gulp with cheerio).
        fs.writeFile('assets/js/book-index-' + output + '.js',
                'var ebIndexTargets = ' + JSON.stringify(targetsIndex) + ';'
                + 'if (typeof window === "undefined")'
                + '{module.exports.' + output.replace('-', '') + 'IndexTargets = ebIndexTargets;}',
                function () {
            console.log('Writing book-index-' + output + '.js...');
            console.log('Done.');
        });

    })();
}

// Run the rendering process.
generateTargetsIndex();
