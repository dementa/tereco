'use strict';

// Thin wrapper: the app is a trusted remote site loaded with context isolation
// and no node integration. Nothing is exposed to the page for now; this file
// exists as the isolated preload boundary and a place to add safe bridges later.
