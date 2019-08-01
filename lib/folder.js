// Folder-Control Folder
// Copyright (c) 2019 Joseph Huckaby
// Released under the MIT License

var fs = require('fs');
var cp = require('child_process');
var Path = require('path');
var EventEmitter = require("events").EventEmitter;
var Tools = require("pixl-tools");
var async = Tools.async;

var Player = require('play-sound')({});
var Notifier = require('node-notifier');

module.exports = class Folder extends EventEmitter {
	
	startup() {
		// start watch
		var self = this;
		
		this.filenameMatch = new RegExp( this.config.filename_match );
		this.filenameExclude = new RegExp( this.config.filename_exclude );
		this.pathMatch = new RegExp( this.config.path_match );
		this.pathExclude = new RegExp( this.config.path_exclude );
		
		this.lastChange = 0;
		this.buffer = {};
		this.timer = null;
		this.queue = async.queue( this.dequeue.bind(this), this.config.concurrency || 1 );
		
		// set cwd for subcommands
		if (!this.config.opts) this.config.opts = {};
		
		// If user specifies "env" key in opts, merge with process.env (also server 'env')
		this.config.opts.env = Tools.mergeHashes(
			Tools.mergeHashes( process.env, this.server.config.get('env') || {} ), 
			this.config.env || {}
		);
		
		// normalize, strip trailing slash
		this.config.path = Path.normalize( this.config.path.replace(/\/$/, '') );
		if (!this.config.opts.cwd) this.config.opts.cwd = this.config.path;
		
		// setup fs watcher
		var watch_opts = {
			persistent: true,
			recursive: true,
			encoding: 'utf8'
		};
		try {
			this.watch = fs.watch( this.config.path, watch_opts, this.onRawChange.bind(this) );
		}
		catch (err) {
			this.logError('watch', "Failed to setup filesystem watcher: " + this.config.path + ": " + err);
			this.watch = null;
			return;
		}
		
		// optionally perform action at startup
		if (this.config.actions.startup && !this.server.started) {
			this.queue.push( Tools.mergeHashes( this.config, Tools.mergeHashes( this.config.actions.startup, {
				action: 'startup',
				path: this.config.path
			})));
		}
		
		// optionally perform time-based actions
		['minute', 'hour', 'day'].forEach( function(unit) {
			if (self.config.actions[unit]) {
				self.on(unit, function() {
					// do not run if queue is doing something
					if (!self.queue.idle()) return;
					
					// do not run unless we're cooled down
					if (Tools.timeNow() - self.lastChange < self.config.cooldown) return;
					
					// okay, good to go
					self.queue.push( Tools.mergeHashes( self.config, Tools.mergeHashes( self.config.actions[unit], {
						action: unit,
						path: self.config.path
					})));
				});
			}
		});
	}
	
	onRawChange(event_type, partial_path) {
		// raw change event from fs.watch
		// (these tend to be very noisy, so debounce and dedupe)
		var file = Path.join( this.config.path, partial_path );
		var filename = Path.basename( file );
		
		if (!filename.match(this.filenameMatch) || filename.match(this.filenameExclude)) return;
		if (!file.match(this.pathMatch) || file.match(this.pathExclude)) return;
		
		this.logDebug(9, "Raw FS Event: " + file);
		
		this.buffer[file] = true;
		
		if (this.timer) clearTimeout( this.timer );
		this.timer = setTimeout( this.onChange.bind(this), this.config.debounce_ms );
	}
	
	onChange() {
		// enqueue events (post-debounce)
		var self = this;
		var changed = Object.keys( this.buffer );
		this.buffer = {};
		this.timer = null;
		this.lastChange = Tools.timeNow();
		
		this.logDebug(8, "Processing normalized change event", changed);
		
		async.eachSeries( changed,
			function(file, callback) {
				// see if file/dir exists or no
				fs.stat( file, function(err, stats) {
					var action = err ? 'deleted' : 'changed';
					
					// make sure action is supported by config
					if (self.config.actions[action]) {
						
						// enqueue action for concurrency limit
						self.queue.push( Tools.mergeHashes( self.config, Tools.mergeHashes( self.config.actions[action], {
							action: action,
							file: file.substring( self.config.path.length + 1 ),
							path: file,
							filename: Path.basename(file),
							filename_urlsafe: Path.basename(file).replace(/[^\w\-\.]+/g, '_'),
							dirname: Path.dirname(file),
							hash: Tools.digestHex(file + self.config.salt_string).substring(0, 16),
							random: Tools.generateUniqueID(16) // random
						})));
					}
					callback();
				}); // fs.stat
			}
		); // async.eachSeries
	}
	
	dequeue(task, callback) {
		// process one item (change)
		// task: { action, file }
		var self = this;
		var action = task.action;
		var file = task.path;
		this.logDebug(9, "Dequeuing event: " + action, { file });
		
		var exec = Tools.sub( Tools.alwaysArray(task.exec).join("\n"), task, false );
		this.logDebug(9, "Executing shell script for " + action + ": " + exec);
		
		var child_opts = Tools.copyHash( this.config.opts );
		child_opts.stdio = ['pipe', 'pipe', 'pipe'];
		
		var child = null;
		var child_cmd = task.shell || '/bin/bash';
		var child_args = [];
		var child_output = '';
		var child_timeout_err_msg = '';
		var callback_fired = false;
		
		var child_timer = setTimeout( function() {
			// timed out
			child_timeout_err_msg = "Command timed out after " + task.timeout + " seconds";
			child.kill(); // should fire exit event
		}, task.timeout * 1000 );
		
		// spawn child
		try {
			child = cp.spawn( child_cmd, child_args, child_opts );
		}
		catch (err) {
			clearTimeout( child_timer );
			this.logError('child', "Could not execute command: " + Tools.getErrorDescription(err) );
			if (!callback_fired) {
				callback_fired = true; 
				callback(); 
				return;
			}
		}
		
		if (child.stdout) {
			child.stdout.on('data', function(data) {
				child_output += data.toString();
				if (child_output.length > 32 * 1024 * 1024) child.kill(); // sanity
			});
		}
		if (child.stderr) {
			child.stderr.on('data', function(data) {
				child_output += data.toString();
				if (child_output.length > 32 * 1024 * 1024) child.kill(); // sanity
			});
		}
		
		child.on('error', function (err) {
			// child error
			clearTimeout( child_timer );
			self.logError('child', "Could not execute command: " + Tools.getErrorDescription(err) );
			if (!callback_fired) { callback_fired = true; callback(); }
		} );
		
		child.on('exit', function (code, signal) {
			// child exited
			clearTimeout( child_timer );
			var output = child_timeout_err_msg || child_output;
			
			self.logDebug(9, "Raw command output: " + output, { code, signal });
			
			// check for non-zero exit code
			if (code && !callback_fired) {
				self.logError('exec', "Command returned non-zero exit code: " + code);
				callback_fired = true; 
				return callback(); 
			}
			
			// check for exit by signal (i.e. SIGTERM)
			if (signal && !callback_fired) {
				self.logError('exec', "Command was killed via signal: " + signal);
				callback_fired = true; 
				return callback(); 
			}
			
			// check for user-level success/error matches
			if (task.success_match && !output.match(task.success_match) && !callback_fired) {
				self.logError('exec', "Command output did not match success: " + cmd);
				callback_fired = true; 
				return callback();
			}
			if (task.error_match && output.match(task.error_match) && !callback_fired) {
				self.logError('exec', "Command output matched error: " + cmd);
				callback_fired = true; 
				return callback();
			}
			
			// success!
			self.logDebug(9, "Command was successful");
			
			// possibly notify user
			if (task.notify) {
				var msg = Tools.sub( ''+task.notify, task, false );
				self.logDebug(9, "Displaying notification: " + msg);
				Notifier.notify({
					title: 'Folder Action Complete',
					message: msg,
					sound: false,
					icon: task.icon || Path.join( Path.dirname(__dirname), 'images', 'icon-256.png' )
				});
			}
			
			// possibly play custom sound
			if (task.sound) {
				self.logDebug(9, "Playing sound: " + task.sound);
				Player.play(task.sound, function(err) {
					if (err) self.logDebug(3, "Failed to play sound: " + task.sound + ": " + err);
				});
			}
			
			if (!callback_fired) { callback_fired = true; callback(); }
		});
		
		if (child.stdin) {
			// pipe shell script into child
			child.stdin.write( exec + "\n" );
			child.stdin.end();
		}
	}
	
	shutdown(callback) {
		// shutdown
		if (this.watch) this.watch.close();
		if (this.timer) clearTimeout(this.timer);
		
		// possibly wait for queue to drain
		if (this.queue.idle()) return callback();
		this.queue.drain = callback;
	}
	
	debugLevel(level) {
		// check if we're logging at or above the requested level
		return (this.logger.get('debugLevel') >= level);
	}
	
	logDebug(level, msg, data) {
		// proxy request to system logger with correct component
		this.logger.set( 'component', this.config.path );
		this.logger.debug( level, msg, data );
	}
	
	logError(code, msg, data) {
		// proxy request to system logger with correct component
		this.logger.set( 'component', this.config.path );
		this.logger.error( code, msg, data );
		
		Notifier.notify({
			title: 'Folder Action Error',
			message: msg,
			sound: true,
			icon: Path.join( Path.dirname(__dirname), 'images', 'icon-256.png' )
		});
	}
	
	logTransaction(code, msg, data) {
		// proxy request to system logger with correct component
		this.logger.set( 'component', this.config.path );
		this.logger.transaction( code, msg, data );
	}
	
}; // class
