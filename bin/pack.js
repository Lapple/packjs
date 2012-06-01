#!/usr/bin/env node

var Snockets, compiler, config, dispatcher, events, fs, path, program;

Snockets = require('snockets');

program = require('commander');

events = require('events');

fs = require('fs');

path = require('path');

dispatcher = new events.EventEmitter;

program.version('0.0.6').option('-w, --watch <directory>', 'Directory to watch file changes within').option('-o, --output <directory>', 'Directory to output changed files').option('-i, --input <file or directory>', 'Input file or directory to compile').option('-m, --minify', 'Minify the JavaScript output');

program.on('--help', function() {
  return console.log("----------------------------------------------------------------\n\n  Examples:\n\n    Compile with dependencies and minify a single file,\n    then output it to STDOUT:\n    $ packjs --minify --input coffee/main.coffee\n\n    Output the compiled JavaScript into a particular file:\n    $ packjs --input coffee/main.coffee > ../public/js/main.js\n\n    Watch a folder recursively and recompile on each change,\n    note that -o (output) option is required:\n    $ packjs --minify --watch coffee/ --output ../public/js/");
});

program.parse(process.argv);

config = {
  minify: !!program.minify,
  watch: program.watch,
  output: program.output
};

compiler = {
  single: function(file, callback) {
    var js, outputFile, result, snockets, that;
    snockets = new Snockets();
    that = this;
    js = snockets.getConcatenation(file, {
      minify: config.minify,
      async: false
    });
    result = "// Generated by CoffeeScript" + (program.minify ? ', minified with UglifyJS' : '') + "\n" + js;
    outputFile = path.resolve(config.output, path.basename(file).replace(/(^.*)\.coffee$/gi, '$1.js'));
    if (config.output) {
      return fs.writeFile(outputFile, result, function(err) {
        if (err) {
          throw err;
        } else {
          if (config.watch) {
            console.log("[" + (that.formatTime()) + "] Updated " + (path.basename(outputFile)));
          }
        }
        return typeof callback === "function" ? callback() : void 0;
      });
    } else {
      console.log(result);
      return typeof callback === "function" ? callback() : void 0;
    }
  },
  batch: function() {
    var file, _i, _len, _ref, _results;
    _ref = this.topLevelFiles;
    _results = [];
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      file = _ref[_i];
      _results.push(this.single(file));
    }
    return _results;
  },
  watchDir: function(directory, callback) {
    var that;
    that = this;
    return fs.readdir(directory, function(err, files) {
      var file, fullPath, _fn, _i, _len;
      if (err) {
        throw err;
      }
      _fn = function(fullPath) {
        return fs.stat(fullPath, function(err, stats) {
          if (err) {
            throw err;
          }
          if (stats.isDirectory()) {
            return compiler.watchDir(fullPath, callback);
          } else {
            if (path.dirname(fullPath) === path.resolve(config.watch)) {
              return dispatcher.emit('topLevelFile:added', fullPath);
            }
          }
        });
      };
      for (_i = 0, _len = files.length; _i < _len; _i++) {
        file = files[_i];
        fullPath = path.resolve(directory, file);
        _fn(fullPath);
      }
      return fs.watch(directory, function(event, fileName) {
        return typeof callback === "function" ? callback() : void 0;
      });
    });
  },
  padZero: function(number) {
    return (number < 10 ? '0' : '') + number;
  },
  formatTime: function() {
    var now;
    now = new Date;
    return "" + (this.padZero(now.getHours())) + ":" + (this.padZero(now.getMinutes())) + ":" + (this.padZero(now.getSeconds()));
  },
  topLevelFiles: []
};

dispatcher.on('mode:compile', function(params) {
  if (config.output && !path.existsSync(config.output)) {
    fs.mkdirSync(config.output);
  }
  return fs.stat(params.file, function(err, stats) {
    if (err) {
      throw err;
    }
    if (stats.isFile()) {
      return compiler.single(params.file, function() {
        return dispatcher.emit('exit');
      });
    } else {
      return fs.readdir(params.file, function(err, files) {
        var file, fullPath, processed, total, _i, _len, _results;
        if (err) {
          throw err;
        }
        processed = 0;
        total = files.length;
        _results = [];
        for (_i = 0, _len = files.length; _i < _len; _i++) {
          file = files[_i];
          fullPath = path.resolve(params.file, file);
          processed += 1;
          _results.push((function(fullPath) {
            return fs.stat(fullPath, function(err, fileStats) {
              if (err) {
                throw err;
              }
              if (fileStats.isFile()) {
                return compiler.single(fullPath, function() {
                  if (processed === total) {
                    return dispatcher.emit('exit');
                  }
                });
              }
            });
          })(fullPath));
        }
        return _results;
      });
    }
  });
});

dispatcher.on('mode:watch', function(params) {
  if (!path.existsSync(config.output)) {
    fs.mkdirSync(config.output);
  }
  return compiler.watchDir(params.directory, function() {
    return compiler.batch();
  });
});

dispatcher.on('topLevelFile:added', function(path) {
  compiler.topLevelFiles.push(path);
  return compiler.batch();
});

dispatcher.on('exit', function() {
  return process.exit();
});

if (program.watch) {
  dispatcher.emit('mode:watch', {
    directory: program.watch,
    output: program.output
  });
} else {
  dispatcher.emit('mode:compile', {
    file: program.input
  });
}

process.on('uncaughtException', function(err) {
  return console.log("Error:\n" + err.message);
});
