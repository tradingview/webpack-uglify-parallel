/* eslint-env node */

var SourceMapConsumer = require('webpack-core/lib/source-map').SourceMapConsumer;
var uglify = require('uglify-js');

process.on('message', function(msg) {
	var oldWarnFunction = uglify.AST_Node.warn_function;
	var warnings = [];
	var errors = [];
	var stream = '';
	var map = '';
	try {
		if (msg.options.sourceMap !== false) {
			var sourceMap = new SourceMapConsumer(msg.inputSourceMap);
			uglify.AST_Node.warn_function = function(warning) { // eslint-disable-line camelcase
				var match = /\[.+:([0-9]+),([0-9]+)\]/.exec(warning);
				var line = +match[1];
				var column = +match[2];
				var original = sourceMap.originalPositionFor({
					line: line,
					column: column
				});
				if (!original || !original.source || original.source === msg.file) return;
				warnings.push({
					message: warning.replace(/\[.+:([0-9]+),([0-9]+)\]/, ''),
					original: original.source,
					line: original.line,
					column: original.column
				});
			};
		} else {
			uglify.AST_Node.warn_function = function(warning) { // eslint-disable-line camelcase
				warnings.push(warning);
			};
		}
		uglify.base54.reset();
		var ast = uglify.parse(msg.input, {
			filename: msg.file
		});
		if (msg.options.compress !== false) {
			ast.figure_out_scope();
			var compress = uglify.Compressor(msg.options.compress); // eslint-disable-line new-cap
			ast = ast.transform(compress);
		}
		if (msg.options.mangle !== false) {
			ast.figure_out_scope();
			ast.compute_char_frequency(msg.options.mangle || {});
			ast.mangle_names(msg.options.mangle || {});
			if (msg.options.mangle && msg.options.mangle.props) {
				uglify.mangle_properties(ast, msg.options.mangle.props);
			}
		}
		var output = {};
		output.comments = Object.prototype.hasOwnProperty.call(msg.options, 'comments') ? msg.options.comments : /^\**!|@preserve|@license/;
		output.beautify = msg.options.beautify;
		for (var k in msg.options.output) {
			output[k] = msg.options.output[k];
		}
		if (msg.options.sourceMap !== false) {
			var map = uglify.SourceMap({ // eslint-disable-line new-cap
				file: msg.file,
				root: ''
			});
			output.source_map = map; // eslint-disable-line camelcase
		}
		var stream = uglify.OutputStream(output); // eslint-disable-line new-cap
		ast.print(stream);
		if (map) {
			map = map + '';
		} else {
			msg.input = '';
			msg.inputSourceMap = '';
		}
		stream = stream + '';
	} catch (err) {
		if (err.line) {
			var original = sourceMap && sourceMap.originalPositionFor({
				line: err.line,
				column: err.col
			});
			if (original && original.source) {
				errors.push({ original: original.source, line: original.line, column: original.column });
			} else {
				errors.push({ message: err.message, line: err.line, col: err.col });
			}
		} else if (err.msg) {
			errors.push({ msg: err.msg });
		} else {
			errors.push({ stack: err.stack });
		}
	} finally {
		uglify.AST_Node.warn_function = oldWarnFunction; // eslint-disable-line camelcase
		process.send({
			file: msg.file,
			errors: errors,
			warnings: warnings,
			source: stream,
			map: map,
			input: msg.input,
			inputSourceMap: msg.inputSourceMap
		});
	}
});
