// Folder-Control Server Component
// Copyright (c) 2019 Joseph Huckaby
// Released under the MIT License

var fs = require('fs');
var cp = require('child_process');
var Path = require('path');
var Component = require("pixl-server/component");
var Tools = require("pixl-tools");
var async = Tools.async;
var Folder = require('./folder.js');

module.exports = class FolderControl extends Component {
	
	startup(callback) {
		// start app service
		var self = this;
		this.logDebug(3, "FolderControl engine starting up", process.argv );
		
		// use global config for our component
		this.config = this.server.config;
		
		// setup folders
		this.setupFolders();
		
		// reinit on config reload
		this.config.on('reload', function() {
			self.shutdownFolders( self.setupFolders.bind(self) );
		});
		this.config.on('error', function(err) {
			self.logError('config', ''+err);
		});
		
		// fire events on schedule
		['minute', 'hour', 'day'].forEach( function(unit) {
			self.server.on(unit, function() {
				self.folders.forEach( function(folder) {
					folder.emit(unit);
				});
			});
		});
		
		callback();
	}
	
	setupFolders() {
		// start watching folders
		var self = this;
		this.folders = [];
		
		this.config.get('folders').forEach( function(folder_config) {
			if (("enabled" in folder_config) && !folder_config.enabled) return;
			
			self.logDebug(4, "Setting up folder watch: " + folder_config.path, folder_config);
			
			if (!folder_config.debounce_ms) folder_config.debounce_ms = self.config.get('debounce_ms') || 250;
			if (!folder_config.filename_match) folder_config.filename_match = self.config.get('filename_match') || '.+';
			if (!folder_config.filename_exclude) folder_config.filename_exclude = self.config.get('filename_exclude') || '(?!)';
			if (!folder_config.path_match) folder_config.path_match = self.config.get('path_match') || '.+';
			if (!folder_config.path_exclude) folder_config.path_exclude = self.config.get('path_exclude') || '(?!)';
			
			if (!folder_config.concurrency) folder_config.concurrency = self.config.get('concurrency') || 1;
			if (!folder_config.timeout) folder_config.timeout = self.config.get('timeout') || 30;
			if (!folder_config.shell) folder_config.shell = self.config.get('shell') || '/bin/bash';
			if (!folder_config.cooldown) folder_config.cooldown = self.config.get('cooldown') || 60;
			if (!folder_config.salt_string) folder_config.salt_string = self.config.get('salt_string') || '';
			
			var folder = new Folder();
			folder.server = self.server;
			folder.parent = self;
			folder.logger = self.logger;
			folder.config = folder_config;
			folder.startup();
			
			self.folders.push( folder );
		});
	}
	
	shutdownFolders(callback) {
		// stop all watches
		var self = this;
		async.eachSeries( this.folders,
			function(folder, callback) {
				folder.shutdown( callback );
			},
			callback
		);
	}
	
	logError(code, msg, data) {
		// proxy request to system logger with correct component
		this.logger.set( 'component', this.__name );
		this.logger.error( code, msg, data );
		
		Notifier.notify({
			title: 'Folder Action Error',
			message: msg,
			sound: true,
			icon: Path.join( Path.dirname(__dirname), 'images', 'icon-256.png' )
		});
	}
	
	shutdown(callback) {
		// shutdown service
		var self = this;
		
		this.logDebug(2, "Shutting down FolderControl");
		
		self.shutdownFolders( callback );
	}
	
}; // class

