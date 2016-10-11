/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Original author Tobias Koppers @sokra
*/

var SourceMapSource = require('webpack-core/lib/SourceMapSource');
var RawSource = require('webpack-core/lib/RawSource');
var RequestShortener = require('webpack/lib/RequestShortener');
var ModuleFilenameHelpers = require('webpack/lib/ModuleFilenameHelpers');
var fork = require('child_process').fork;

function UglifyJsParallelPlugin(options) {
	if (typeof options !== 'object') options = {};
	if (typeof options.compressor !== 'undefined') {
		options.compress = options.compressor;
	}
	this.options = options;
	this.workers = [];
	this.assets = {};
	this.maxWorkers = options.workers || 1;
	this._queue_len = 0;
	this._next_worker = -1;
}

module.exports = UglifyJsParallelPlugin;

UglifyJsParallelPlugin.prototype.apply = function(compiler) {
	var plugin = this;
	var options = this.options;
	options.test = options.test || /\.js($|\?)/i;

	this.requestShortener = new RequestShortener(compiler.context);
	compiler.plugin('compilation', function(compilation) {
		plugin.compilation = compilation;
		if (options.sourceMap !== false) {
			compilation.plugin('build-module', function(module) {
				// to get detailed location info about errors
				module.useSourceMap = true;
			});
		}
		compilation.plugin('optimize-chunk-assets', function(chunks, callback) {
			plugin.callback = callback;
			plugin.assets = compilation.assets;
			var files = [];
			chunks.forEach(function(chunk) {
				chunk.files.forEach(function(file) {
					files.push(file);
				});
			});
			compilation.additionalChunkAssets.forEach(function(file) {
				files.push(file);
			});
			files = files.filter(ModuleFilenameHelpers.matchObject.bind(undefined, options));
			files.forEach(function(file) {
				var asset = compilation.assets[file];
				if (asset.__UglifyJsPlugin) {
					compilation.assets[file] = asset.__UglifyJsPlugin;
					return;
				}
				if (options.sourceMap !== false) {
					if (asset.sourceAndMap) {
						var sourceAndMap = asset.sourceAndMap();
						var inputSourceMap = sourceAndMap.map;
						var input = sourceAndMap.source;
					} else {
						var inputSourceMap = asset.map();
						var input = asset.source();
					}
				} else {
					var input = asset.source();
				}
				plugin.nextWorker().send({
					input: input,
					inputSourceMap: inputSourceMap,
					file: file,
					options: options
				});
				plugin._queue_len++;
			});
			if (!plugin._queue_len) {
				callback();
			}
		});
		compilation.plugin('normal-module-loader', function(context) {
			context.minimize = true;
		});
	});
};

UglifyJsParallelPlugin.prototype.nextWorker = function() {
	if (this.workers.length < this.maxWorkers) {
		var worker = fork(__dirname + '/lib/worker');
		worker.on('message', this.onWorkerMessage.bind(this));
		worker.on('error', this.onWorkerError.bind(this));
		this.workers.push(worker);
	}
	this._next_worker++;
	return this.workers[this._next_worker % this.maxWorkers];
};

UglifyJsParallelPlugin.prototype.onWorkerMessage = function(msg) {
	msg.errors.forEach(function(err) {
		if (err.line) {
			if (err.original && err.original.source) {
				this.compilation.errors.push(new Error(msg.file + ' from UglifyJs\n' + err.message + ' [' + this.requestShortener.shorten(err.original) + ':' + err.line + ',' + err.column + ']'));
			} else {
				this.compilation.errors.push(new Error(msg.file + ' from UglifyJs\n' + err.message + ' [' + msg.file + ':' + err.line + ',' + err.col + ']'));
			}
		} else if (err.msg) {
			this.compilation.errors.push(new Error(msg.file + ' from UglifyJs\n' + err.msg));
		} else {
			this.compilation.errors.push(new Error(msg.file + ' from UglifyJs\n' + err.stack));
		}
	}, this);

	msg.warnings.forEach(function(warn) {
		if (warn.original) {
			this.compilation.warnings.push(new Error(msg.file + ' from UglifyJs\n' + warn.message +
					'[' + this.requestShortener.shorten(warn.original) + ':' + warn.line + ',' + warn.column + ']'));
		} else {
			this.compilation.warnings.push(new Error(msg.file + ' from UglifyJs\n' + warn));
		}
	}, this);

	if (msg.source) {
		this.assets[msg.file] = this.assets[msg.file].__UglifyJsPlugin = (this.options.sourceMap !== false) ?
			new SourceMapSource(msg.source, msg.file, JSON.parse(msg.map), msg.input, msg.inputSourceMap) :
			new RawSource(msg.source);
	}

	this._queue_len--;
	if (!this._queue_len) {
		this.disconnect();
		this.callback();
	}
};

UglifyJsParallelPlugin.prototype.onWorkerError = function(err) {
	this.compilation.errors.push(err);
};

UglifyJsParallelPlugin.prototype.disconnect = function() {
	this.workers.forEach(function(worker) {
		worker.kill();
	});
	this.workers = [];
};
