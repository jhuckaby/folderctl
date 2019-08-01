# Overview

**Folder Control** (`folderctl`) is a background daemon for monitoring folders on macOS.  It can run custom shell commands when any files or folders change within.  This is similar to Apple's [Folder Actions](https://developer.apple.com/library/archive/documentation/LanguagesUtilities/Conceptual/MacAutomationScriptingGuide/WatchFolders.html) system built into the OS, but Folder Control allows for much more customization, including firing events when any file or folder is modified, showing custom notifications, and playing custom sound effects.  It also keeps a detailed log file containing every filesystem event, every shell command executed, and the raw output from all commands.

## Features

- Monitor multiple folders and run custom shell scripts on changes within.
- Assign different actions for handling a change vs delete.
- Support for folder path and filename filters (match and exclude).
- Display custom notifications and/or sound effects for each event.
- Properly detects errors, optionally with custom regular expression match.
- Optionally run custom shell scripts every minute, hour or day.
- Optionally run a custom shell script on startup.
- Detailed log file for debugging / troubleshooting.

## Table of Contents

<!-- toc -->

# Usage

## Prerequisites

You will need to have [Node.js](https://nodejs.org/en/download/) installed on your machine before installing Folder Control.

## Installation

Use [npm](https://www.npmjs.com/) to install the module (this ships with Node.js).  Note that Folder Control is designed to run as a standalone background daemon, so take care to understand where `npm` installs software.  It is recommended you install the module globally using the `-g` switch:

```
sudo npm install -g folderctl
```

To see where `npm` installed the package, you can type `npm root -g`.  This is usually `/usr/local/lib/node_modules`.  Once installed globally, you should have a `folderctl` command in your PATH.  Use this to start, stop and otherwise control the daemon.  See [Command-Line Usage](#command-line-usage) below.

Note that Folder Control will install itself as a [LaunchAgent](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html), so it will autostart on boot.  This is removed upon uninstall.

## Quick Start

A sample configuration file is provided with the module, which you can copy into place for your user with this command:

```
cp -v `npm root -g`/folderctl/conf/sample-config.json ~/Library/Preferences/folderctl.json
```

Edit your file to taste, then start the daemon thusly:

```
folderctl start
```

## Configuration

The configuration for Folder Control is stored in a single JSON file.  It should be placed here:

```
~/Library/Preferences/folderctl.json
```

Upon initial installation, you will need to create this file.  Here is a sample one you can copy from:

```js
{
	"folders": [
		{
			"path": "~/Dropbox",
			"actions": {
				"changed": {
					"exec": "say \"We changed [filename].\"", 
					"notify": "We changed [filename].",
					"sound": "/System/Library/Sounds/Ping.aiff"
				}
			}
		}
	],
	
	"concurrency": 1,
	"timeout": 30,
	"debounce_ms": 250,
	"filename_exclude": "^\\.",
	
	"salt_string": "",
	"log_dir": "Library/Logs",
	"log_filename": "folderctl.log",
	"log_columns": ["hires_epoch", "date", "hostname", "pid", "component", "category", "code", "msg", "data"],
	"log_crashes": true,
	"crash_filename": "folderctl.crash.log",
	"pid_file": "Library/Logs/folderctl.pid",
	"debug_level": 9
}
```

The config file is split into three sections: a `folders` array containing configurations for each of your folders to watch, a set of default properties that all folders share, and some global configuration properties.  See below for details on each.

### Folders

The `folders` property should be an array of objects, with each object representing a folder to watch for changes, and fire events on.  Here is an example folder:

```js
{
	"path": "Dropbox",
	"actions": {
		"changed": {
			"exec": "say \"We changed [filename].\"", 
			"notify": "We changed [filename].",
			"sound": "/System/Library/Sounds/Ping.aiff"
		}
	}
}
```

In the above example the `Dropbox` folder (paths are relative to your home directory) would be monitored for changes to all files and folders within.  Upon changes, a shell script would execute (specified by the `exec` property), a desktop notification would be displayed (using the text in the `notify` property), and a sound effect would play (specified by the `sound` property).

Here are all the properties you can define inside each folder:

| Property | Type | Description |
|----------|------|-------------|
| `path` | String | **(Required)** The filesystem path to the folder you want to watch.  Paths are relative to your home directory. |
| `actions` | Object | **(Required)** An object containing actions to take for specific events.  See below for details. |
| `concurrency` | Integer | *(Optional)* The number of concurrent threads to use when executing your commands (defaults to `1`). |
| `timeout` | Integer | *(Optional)* The maximum number of seconds to allow your commands to take, before timing out (defaults to `30`). |
| `debounce_ms` | Integer | *(Optional)* The number of milliseconds to delay raw filesystem events before taking action (defaults to `250` ms). |
| `filename_include` | String | *(Optional)* A regular expression which limits file and folder *names* (defaults to `.+`, i.e. include everything). |
| `filename_exclude` | String | *(Optional)* A regular expression which filters out file and folder *names* (defaults to `(?!)`, i.e. don't exclude anything). |
| `path_include` | String | *(Optional)* A regular expression which limits file and folder *paths* (defaults to `.+`, i.e. include everything). |
| `path_exclude` | String | *(Optional)* A regular expression which filters out file and folder *paths* (defaults to `(?!)`, i.e. don't exclude anything). |
| `shell` | String | *(Optional)* The shell interpreter for running your custom commands (defaults to `/bin/bash`). |
| `env` | Object | *(Optional)*  Additional environment variables to pass down to your commands. |
| `cooldown` | Integer | *(Optional)* The cooldown (minimum idle time) in seconds before allowing scheduled events to run (defaults to `60`). |

#### Actions

The `actions` object can define a number of events to listen for, and fire events on.  Here are the available actions you can define in each folder:

| Action | Description |
|--------|-------------|
| `changed` | This event will fire for every change, including new files / folders, modified files / folders, and renamed files / folders. |
| `deleted` | This event will fire for every deletion, including deleted files and folders. |
| `startup` | This event will fire once upon startup. |
| `minute` | This event will fire once every minute, on the minute. |
| `hour` | This event will fire every hour, on the hour. |
| `day` | This event will fire once a day at midnight. |

Each action should be an object that describes what to do for the event.  Here is an example of an action configuration:

```js
"changed": {
	"exec": "say \"We changed [filename].\"", 
	"notify": "We changed [filename].",
	"sound": "/System/Library/Sounds/Ping.aiff"
}
```

Here are the available properties you can define per action:

| Property | Type | Description |
|----------|------|-------------|
| `exec` | String | **(Required)** The shell command(s) to execute for the event.  This is piped to a shell interpreter as STDIN, so you can specify an entire multi-line shell script here (just make sure you follow proper JSON string escaping). |
| `notify` | String | *(Optional)* Optionally display a OS desktop notification upon completion of the shell command.  Specify any custom text to display in the notification body. |
| `icon` | String | *(Optional)* Optionally customize the icon shown in the notification (defaults to the Folder Control Icon). |
| `sound` | String | *(Optional)* Optionally play a custom sound effect upon completion of the shell command. |
| `success_match` | String | *(Optional)* Optionally specify a regular expression to detect a "successful" command by matching against its output. |
| `error_match` | String | *(Optional)* Optionally specify a regular expression to detect an error in your command by matching against its output. |

#### Macros

The `exec` and `notify` properties both allow for macro expansion using a special `[square_bracket]` syntax.  The following macros are available:

| Macro | Description |
|-------|-------------|
| `[action]` | The name of the event that is being executed (e.g. `changed`, `deleted`, etc.). |
| `[path]` | The **full path** to the file or folder being acted upon. |
| `[file]` | A **partial path** to the file or folder being acted upon, relative to the base `path` in the base folder's configuration. |
| `[filename]` | Just the filename (or folder name) of the item being acted upon. |
| `[filename_urlsafe]` | A URL-safe version of the filename (or folder name), with all characters besides alphanumerics, dash (`-`) and period (`.`) changed to underscores (`_`). |
| `[dirname]` | A partial path to the *parent* folder of the item being acted upon, relative to the base `path` in the base folder's configuration. |
| `[hash]` | A unique 16-character hash generated using the full file path and a `salt_string` you can customize. |
| `[random]` | A randomly generated 16-character hash (different every time). |

Note that the special `startup`, `minute`, `hour` and `day` actions only populate the `[action]` and `[path]` macros (the path will be set to the base folder path).

### Folder Defaults

These properties can be defined at the top level of the JSON configuration file.  They are defaults for each of your folder configurations.

| Property | Type | Description |
|----------|------|-------------|
| `concurrency` | Integer | The number of concurrent threads to use when executing your commands.  This defaults to `1`, and can be overridden per folder. |
| `timeout` | Integer | The maximum number of seconds to allow your commands to take, before timing out.  This defaults to `30` seconds, and can be overridden per folder. |
| `debounce_ms` | Integer | The number of milliseconds to delay raw filesystem events before taking action.  This defaults to `250` ms, and can be overridden per folder. |
| `filename_include` | String | An optional regular expression which limits file and folder *names* (only those that match are included).  This defaults to `.+` (match anything), and can be overridden per folder. |
| `filename_exclude` | String | An optional regular expression which filters out file and folder *names* (those that match are excluded).  This defaults to `(?!)` (never match), and can be overridden per folder. |
| `path_include` | String | An optional regular expression which limits file and folder *paths* (only those that match are included).  This defaults to `.+` (match anything), and can be overridden per folder. |
| `path_exclude` | String | An optional regular expression which filters out file and folder *paths* (those that match are excluded).  This defaults to `(?!)` (never match), and can be overridden per folder. |
| `shell` | String | The shell interpreter for running your custom commands.  This defaults to `/bin/bash`, and can be overridden per folder. |
| `env` | Object | Optionally include additional environment variables to pass down to your commands.  These can also be specified in each folder, and they are merged with this one. |
| `cooldown` | Integer | The cooldown (minimum idle time) in seconds before allowing scheduled events to run.  This defaults to `60` seconds, and can be overridden per folder. |

### Global Configuration

Here are all the top-level global configuration properties which are not folder specific.

| Property | Type | Description |
|----------|------|-------------|
| `salt_string` | String | An optional salt string used to compute unique hashes for each file or folder. |
| `log_dir` | String | The directory in which to place our log files, relative to your home directory. |
| `log_filename` | String | The filename of the Folder Control log file. |
| `log_columns` | Array | An array of log columns to include in the event log. |
| `log_crashes` | Boolean | If set to true, Folder Control will log crashes. |
| `crash_filename` | String | The filename of the crash log, should a crash occur. |
| `pid_file` | Path to the PID file used by the control script to start/stop the daemon.  Please do not change this. | String |
| `debug_level` | Integer | A verbosity control for the log file, where `1` is quiet and `10` is very loud indeed. |

See [Logging](#logging) below for more on the Folder Control log.

## Recipes

Here are a few recipes, i.e. example folder configurations you can copy or learn from.

### Basic Folder Sync

Here is a simple recipe that keeps my local `Documents/Notes` folder one-way synced with a backup machine:

```js
{
	"path": "Documents/Notes",
	"actions": {
		"changed": {
			"exec": "rsync -avR \"[file]\" \"backup.local:~/Documents/Notes/\""
		}
	}
}
```

Here we make use of the special `[file]` macro, which is a relative path to the file (or folder) that changed, relative to the base directory.  This way we only have to sync something that was added or modified, and not have to re-sync the entire folder on every change.

Note that I am using the rsync `R` (`--relative`) flag, which preserves the relative path to the file on the remote side, *and* automatically creates any necessary parent folders.

In order for rsync to work, you will need to create an SSH keypair and copy your public key to the remote backup server.

### Sync on Startup

You can use the `startup` action to perform a pre-sync of your entire folder on startup, for example:

```js
{
	"path": "Documents/Notes",
	"actions": {
		"startup": {
			"exec": "rsync -av ~/Documents/Notes/ backup.local:~/Documents/Notes/"
		},
		"changed": {
			"exec": "rsync -avR \"[file]\" \"backup.local:~/Documents/Notes/\""
		}
	}
}
```

This would sync the entire `Documents/Notes` folder on startup, rather than just a changed file or folder.  This is in case I made any changes while offline or something.  Note that this recipe doesn't take into account changes on the remote side.  See [Two-Way Sync](#two-way-sync) below.

### Sync Deletes

Synchronizing deletes requires special care, and a special `deleted` action with a separate shell command:

```js
{
	"path": "Documents/Notes",
	"actions": {
		"changed": {
			"exec": "rsync -avR \"[file]\" \"backup.local:~/Documents/Notes/\""
		},
		"deleted": {
			"exec": "rsync -av --delete \"[dirname]/\" \"backup.local:~/Documents/Notes/[dirname]/\""
		}
	}
}
```

Here we are using the special `[dirname]` macro, which is a relative path to the *parent* folder of the item that was deleted.  This is important because rsync cannot delete a remote file by pointing to the file itself -- it has to point to the parent directory *containing* the deleted file or folder.

### Copy Screenshot URL to Clipboard

Here is a recipe that watches for new macOS screenshots, which typically arrive on your Desktop.  Then, it copies each new screenshot up to an [Amazon S3](https://aws.amazon.com/s3/) bucket, and, assuming your bucket is also a website, it copies a URL to the clipboard for the screenshot, and moves the screenshot off the desktop:

```js
{
	"path": "Desktop",
	"filename_match": "^Screen\s+Shot.+\\.png$",
	"actions": {
		"changed": {
			"exec": [
				"aws s3 cp \"[file]\" \"s3://my-s3-bucket/screenshots/[filename_urlsafe]\"",
				"echo -n \"https://my-s3-domain.com/screenshots/[filename_urlsafe]\" | pbcopy",
				"mv \"[file]\" Documents/Screenshots/"
			]
		}
	}
}
```

So, there is a lot to digest here.  First, note that we are using the `filename_match` feature to only trigger on files with names starting with `Screen Shot`, and ending with `.png`.  Also, note that the `exec` property is actually an array in this case, with 3 separate shell commands:

```js
[
	"aws s3 cp \"[file]\" \"s3://my-s3-bucket/screenshots/[filename_urlsafe]\"",
	"echo -n \"https://my-s3-domain.com/screenshots/[filename_urlsafe]\" | pbcopy",
	"mv \"[file]\" Documents/Screenshots/"
]
```

This format is really just for convenience -- you could achieve the same thing by embedding escaped EOL (`\n`) characters into one `exec` string, or concatenating the shell commands together with `&&`.  Using an array just looks prettier in JSON format.  So here is what is happening, line by line:

- We run the [AWS command-line utility](https://aws.amazon.com/cli/) to upload the screenshot to S3, using the special `[filename_urlsafe]` macro to construct a safe S3 path (i.e. URL-friendly filename).
- We are using the bash `echo` command to construct and print the URL, and then piping that to the macOS `pbcopy` command, which copies text to the clipboard.
- Finally, we are moving the screenshot file off of the Desktop, and into `Documents/Screenshots/`.

In order for all this to work, you will need an Amazon AWS account, an S3 bucket with [static website hosting](https://docs.aws.amazon.com/AmazonS3/latest/dev/WebsiteHosting.html) enabled, the AWS CLI utility installed, and your AWS credentials available locally for your user.

### Copy Hashed URL to Clipboard

If you want slightly more anonymized S3 paths and URLs, you can use the special `[hash]` macro.  This is similar to what Dropbox does when you right-click a file and select "Copy Public URL".  The `[hash]` is a 16-character signature generated from the full local file path, and a `salt_string` if provided in your configuration.  Example use:

```js
{
	"path": "Dropbox/Public",
	"actions": {
		"changed": {
			"exec": [
				"aws s3 cp \"[file]\" \"s3://my-s3-bucket/public/[hash]/[filename_urlsafe]\"",
				"echo -n \"https://my-s3-domain.com/public/[hash]/[filename_urlsafe]\" | pbcopy"
			]
		},
		"deleted": {
			"exec": "aws s3 rm \"s3://my-s3-domain.com/public/[hash]/[filename_urlsafe]\""
		}
	}
}
```

The idea here is to insert a somewhat "random" element in the S3 path and URL, so it is just a bit more secure than linking directly to a file by its name.  Generally this would be for publicly-facing S3 buckets and URLs.  We use a hash so the same value will be computed if the file is deleted later -- notice we are also listening for the `deleted` event and performing a remote S3 delete on the file, also using the `[hash]` macro.  This works because the `[hash]` will be exactly the same for the same file path and salt string.

To make this system more secure, it is recommended that you provide a unique `salt_string` in your configuration file.

### Displaying Notifications

To display a notification when your shell script completes, you can set the `notify` property in one or more of your actions.  The value should be a string containing the text to display, and you can use `[macros]` here as well.  Example:

```js
{
	"path": "Documents/Notes",
	"actions": {
		"changed": {
			"exec": "rsync -avR \"[file]\" \"backup.local:~/Documents/Notes/\"",
			"notify": "Item successfully backed up: [filename]"
		}
	}
}
```

In this example we would display a notification with the text: `Item successfully backed up:` followed by the filename of the file (or folder) that was changed.  You can use any of the macros described above in [Macros](#macros).

You can optionally customize the icon that accompanies the notification.  It defaults to the Folder Control icon, but you can replace it with your own icon by including an `icon` property.  Make sure you specify a full path.  Example:

```js
{
	"path": "Documents/Notes",
	"actions": {
		"changed": {
			"exec": "rsync -avR \"[file]\" \"backup.local:~/Documents/Notes/\"",
			"notify": "File successfully backed up: [filename]",
			"icon": "/path/to/your/custom-icon.png"
		}
	}
}
```

Note that the notification is only shown when your shell command completes successfully.

### Playing Sounds

To play a sound effect when your shell script completes, you can set the `sound` property in one or more of your actions.  The value should be a full filesystem path to the sound file (AIFF, MP3 and WAV are all supported).  Example use:

```js
{
	"path": "Documents/Notes",
	"actions": {
		"changed": {
			"exec": "rsync -avR \"[file]\" \"backup.local:~/Documents/Notes/\"",
			"sound": "/System/Library/Sounds/Ping.aiff"
		}
	}
}
```

This would play the `Ping.aiff` sound effect after each file or folder finished syncing.  You can combine a sound effect with a notification, or use each one separately.

The following sounds are available in your macOS installation:

```
/System/Library/Sounds/Basso.aiff
/System/Library/Sounds/Blow.aiff
/System/Library/Sounds/Bottle.aiff
/System/Library/Sounds/Frog.aiff
/System/Library/Sounds/Funk.aiff
/System/Library/Sounds/Glass.aiff
/System/Library/Sounds/Hero.aiff
/System/Library/Sounds/Morse.aiff
/System/Library/Sounds/Ping.aiff
/System/Library/Sounds/Pop.aiff
/System/Library/Sounds/Purr.aiff
/System/Library/Sounds/Sosumi.aiff
/System/Library/Sounds/Submarine.aiff
/System/Library/Sounds/Tink.aiff
```

Note that the sound only plays when your shell command completes successfully.

### Excluding Hidden Files

To exclude certain files, use the `filename_exclude` property in your top-level or folder-specific configuration.  Hidden files are typically prefixed with a period (`.`), which includes the dreaded macOS `.DS_Store` files, so you can use this regular expression to skip them all:

```js
"filename_exclude": "^\\."
```

To exclude hidden folders as well, include the `path_exclude` property, and set it to a regular expression like this:

```js
"path_exclude": "/\\."
```

Note that the `path_exclude` is matched against the *full path* to the file or folder being acted upon, hence we are matching `/.` (slash followed by period) anywhere in the string.

These two properties can be defined in your top-level configuration as defaults, or specified per folder.

### Detecting Specific Errors

In most cases Folder Control will automatically catch and notify you about errors in your shell scripts -- that is, if the command fails with a non-zero exit code.  But sometimes you may need to detect your own errors by matching a string against the command's output.  To do this, include the `success_match` and/or `error_match` properties in your actions, and set them to regular expressions.  Example use:

```js
{
	"path": "Documents/Notes",
	"actions": {
		"changed": {
			"exec": "rsync -avR \"[file]\" \"backup.local:~/Documents/Notes/\"",
			"error_match": "connection unexpectedly closed"
		}
	}
}
```

This would trigger an error if the output from the command included the string "connection unexpectedly closed", even if the command returned a zero (successful) exit code.  The `success_match` property works in the other direction -- if specified, the output **must** match your pattern for the command to be considered a success.  If both are specified, both are checked against the command output.

Both `success_match` and `error_match` are matched against STDOUT and STDERR, so you don't need to do the `2>&1` redirect dance.

### Two-Way Sync

Folder Control does **not** support true two-way sync, unless you use some sort of 3rd party utility such as [Unison](http://www.cis.upenn.edu/~bcpierce/unison/) or [osync](https://github.com/deajan/osync).  The following is just one way to achieve a very poor man's bi-directional one-way sync.

To sync in both directions, you can use one of the scheduler actions.  Meaning, do the sync from your local machine to your remote backup on change as per usual, but then also fire off a routine reverse sync every minute, hour or day.  Example use:

```js
{
	"path": "Documents/Notes",
	"actions": {
		"changed": {
			"exec": "rsync -avR \"[file]\" \"backup.local:~/Documents/Notes/\""
		},
		"minute": {
			"exec": "rsync -av \"backup.local:~/Documents/Notes/\" \"[path]/\""
		}
	}
}
```

The scheduler actions `minute`, `hour` and `day` all follow a "cooldown", which means if any change events occur (which fires off a forward sync in this case) the scheduler actions will all be skipped up until a cooldown period has elapsed.  The default cooldown is 60 seconds, but you can configure it by setting the `cooldown` config property.

Note that the only custom macros available in the scheduler actions are `[action]` and `[path]` (the path will be set to the base folder path).

### Custom Environment Variables

If your shell commands require any custom environment variables, you can supply them in a `env` configuration property, which can be defined globally (top-level) or per folder.  For example, this can be used to reset the `PATH`:

```js
"env": {
	"PATH": "/usr/bin:/usr/local/bin:/Users/jhuckaby/bin"
}
```

These environments variables will be merged in with the existing ones when the Folder Control daemon was started, and then passed down to your shell processes.

## Command-Line Usage

Folder Control comes with a simple command-line control script called `folderctl`.  It should already be available in your PATH, assuming you installed the module via `sudo npm install -g folderctl`.  It accepts a single command-line argument to start, stop, and a few other things.  Examples:

```
folderctl start
folderctl stop
folderctl restart
```

Here is the full command list:

| Command | Description |
|---------|-------------|
| `help` | Show usage information. |
| `start` | Start Folder Control as a background service. |
| `stop` | Stop Folder Control and wait until it actually exits. |
| `restart` | Calls stop, then start (hard restart). |
| `status` | Checks whether Folder Control is currently running. |
| `debug` | Start the service in debug mode (see [Debugging](#debugging) below). |

### Debugging

To start Folder Control in debug mode, issue this command:

```
folderctl debug
```

This will start the service as a foreground process (not a daemon), and echo the event log straight to the console.  This is a great way to troubleshoot issues.  Hit Ctrl-C to exit.

### Upgrading

To upgrade to the latest Folder Control version, you can use the `sudo npm update -g` command.  Your user configuration file will *not* be touched.  Assuming you installed Folder Control globally, and it is currently running, then issue these commands to upgrade to the latest stable:

```
folderctl stop
sudo npm update -g folderctl
folderctl start
```

### Uninstall

Folder Control isn't for you?  No problem, you can remove it with these commands:

```
folderctl stop
sudo npm remove -g folderctl
```

To remove all trace, you may want to delete these files as well:

```
rm -v ~/Library/Preferences/folderctl.json
rm -v ~/Library/Logs/folderctl*
```

# Logging

Folder Control uses the logging system built into [pixl-server](https://github.com/jhuckaby/pixl-server#logging).  Essentially there is one combined "event log" which contains debug messages and errors.  The `component` column will be set to either `FolderControl`, or one of your own folder paths.  Most debug messages will be folder-specific.

By default it will log to `~/Library/Logs/folderctl.log`.

The general logging configuration is controlled by these three top-level global properties:

| Property Name | Type | Description |
|---------------|------|-------------|
| `log_dir` | String | Directory path where event log will be stored.  Can be a fully-qualified path, or relative from your home directory. |
| `log_filename` | String | Event log filename, joined with `log_dir`. |
| `debug_level` | Integer | Debug logging level, larger numbers are more verbose, 1 is quietest, 10 is loudest. |

Log entries with the `category` set to `debug` are debug messages, and have a verbosity level from 1 to 10.

Here is an example log excerpt showing a typical startup with one folder.  In all these log examples the first 3 columns (`hires_epoch`, `date`, `hostname` and `pid`) are omitted for display purposes.  The columns shown are `component`, `category`, `code`, `msg`, and `data`.

```
[FolderControl][debug][2][Spawning background daemon process (PID 690 will exit)][["/usr/local/bin/node","/Users/jhuckaby/node_modules/folderctl/lib/main.js"]]
[FolderControl][debug][1][FolderControl v1.0.0 Starting Up][{"pid":693,"ppid":1,"node":"v10.14.1","arch":"x64","platform":"darwin","argv":["/usr/local/bin/node","/Users/jhuckaby/node_modules/folderctl/lib/main.js"],"execArgv":[]}]
[FolderControl][debug][9][Writing PID File: Library/Logs/folderctl.pid: 693][]
[FolderControl][debug][9][Confirmed PID File contents: Library/Logs/folderctl.pid: 693][]
[FolderControl][debug][2][Daemon PID: 693][]
[FolderControl][debug][3][Starting component: FolderControl][]
[FolderControl][debug][3][FolderControl engine starting up][["/usr/local/bin/node","/Users/jhuckaby/node_modules/folderctl/lib/main.js"]]
[FolderControl][debug][4][Setting up folder watch: Dropbox][{"path":"Dropbox","actions":{"changed":{"exec":"say \"We changed [filename].\"","notify":"We changed [filename].","sound":"/System/Library/Sounds/Ping.aiff"}}}]
[FolderControl][debug][2][Startup complete, entering main loop][]
```

And here is an example log excerpt for a folder change event:

```
[/Users/jhuckaby/Dropbox][debug][9][Raw FS Event: /Users/jhuckaby/Dropbox/PlainText/Notes.txt][]
[/Users/jhuckaby/Dropbox][debug][8][Processing normalized change event][["/Users/jhuckaby/Dropbox/PlainText/Notes.txt"]]
[/Users/jhuckaby/Dropbox][debug][9][Dequeuing event: changed][{"file":"/Users/jhuckaby/Dropbox/PlainText/Notes.txt"}]
[/Users/jhuckaby/Dropbox][debug][9][Executing shell script for changed: say "We changed Notes.txt."][]
[/Users/jhuckaby/Dropbox][debug][9][Raw command output:  ][{"code":0,"signal":null}]
[/Users/jhuckaby/Dropbox][debug][9][Command was successful][]
[/Users/jhuckaby/Dropbox][debug][9][Displaying notification: We changed Notes.txt.][]
[/Users/jhuckaby/Dropbox][debug][9][Playing sound: /System/Library/Sounds/Ping.aiff][]
```

If you are concerned about log file size, and/or you run Folder Control with a high `debug_level` (verbosity), you might want to enable log rotation.  This can be done easily on macOS by creating the following file:

```
sudo vi /etc/newsyslog.d/folderctl.conf
```

And then paste in these contents:

```
# logfilename                      [owner:group]    mode count size when  flags [/pid_file] [sig_num]
/Users/*/Library/Logs/folderctl.log                 644  5     *    $D0   J
```

# License

**The MIT License (MIT)**

*Copyright (c) 2019 Joseph Huckaby.*

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
