#!/usr/bin/env node

// Folder-Control - Main entry point
// Copyright (c) 2019 Joseph Huckaby
// Released under the MIT License

var fs = require('fs');
var Path = require('path');
var Server = require("pixl-server");

// chdir to the proper server root dir
process.chdir( process.env.HOME );

// Copy sample config if custom one doesn't exist
var user_config_file = Path.resolve("Library/Preferences/folderctl.json");
var sample_config_file = Path.join( Path.dirname(__dirname), "conf", "sample-config.json" );

if (!fs.existsSync(user_config_file)) {
	console.log("\nUser config file not found: " + user_config_file);
	console.log("\nHere's a sample one to get you started:\ncp " + sample_config_file + " " + user_config_file);
	console.log("\nSee docs for details: https://github.com/jhuckaby/folderctl#configuration\n");
	process.exit(1);
}

var server = new Server({
	__name: 'FolderControl',
	__version: require('../package.json').version,
	
	configFile: user_config_file,
	
	components: [
		require('./engine.js')
	]
});

server.startup( function() {
	// server startup complete
	process.title = server.__name;
} );
