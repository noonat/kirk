var assert = require('assert')
  , childProcess = require('child_process')
  , fs = require('fs')
  , path = require('path')
  , sys = require('sys');

// Have to be careful with ports when tests are running concurrently.
var nextPort = 9000;
exports.port = function() {
  return nextPort++;
};

// Find test files in the passed folder, or any of its subfolders.
exports.findAll = function findAll(folder, callback) {
  fs.readdir(folder, function(err, entries) {
    if (err) {
      throw err;
    }

    var results = []             // matching files found
      , pending = entries        // files/folders to search
      , re = /^test-(.*)\.js$/;  // test filenames must match this pattern

    // remove an item from the pending set and invoke the
    // callback if the pending set is empty
    function removePending(entry) {
      var i = pending.indexOf(entry);
      if (i >= 0) {
        pending.splice(i, 1);
      }
      if (pending.length === 0 && callback) {
        callback(results);
        callback = null;
      }
    }

    entries.forEach(function(entry) {
      if (entry.charAt(0) === '.') {
        removePending(entry);
        return;  // skip dotfiles
      }
      var absPath = path.join(folder, entry);
      fs.stat(absPath, function(err, stats) {
        if (err) {
          throw err;
        }
        if (stats.isDirectory()) {
          // recurse into directories
          findAll(absPath, function(childResults) {
            childResults.forEach(function(result) {
              results.push(path.join(entry, result));
            });
            removePending(entry);
          });
        } else {
          if (entry.match(re)) {
            results.push(entry);
          }
          removePending(entry);
        }
      });
    });
  });
};

exports.printOk = function printOk(i, text, opts) {
  if (opts.color) sys.print('\033[32m');
  sys.print('ok ' + i);
  if (opts.color) sys.print('\033[0m');
  sys.puts(text ? ' - ' + text : '');
};

exports.printNotOk = function printNotOk(err, i, text, opts) {
  if (opts.color) sys.print('\033[31m');
  sys.print('not ok ' + i);
  if (opts.color) sys.print('\033[0m');
  sys.puts(text ? ' - ' + text : '');
  String(err).split('\n').forEach(function(line) {
    line = line.replace('\r$');
    if (line) {
      sys.puts('    ' + line);
    }
  });
};

function ExecQueue(limit) {
  this.active = 0;
  this.limit = limit;
  this.queue = [];
}

ExecQueue.prototype.exec = function(cmd, opts, callback) {
  var self = this;
  if (arguments.length < 3) {
    callback = opts;
    opts = {};
  }
  if (self.active < self.limit) {
    try {
      self.active++;
      childProcess.exec(cmd, opts, function(err, stdout, stderr) {
        self.active--;
        // doing these in the next tick to keep the stack under control
        process.nextTick(function() {
          callback(err, stdout, stderr);
        });
        process.nextTick(function() {
          if (self.queue.length && self.active < self.limit) {
            self.exec.apply(self, self.queue.shift());
          }
        });
      });
    } catch (err) {
      self.active--;
      if (err.message === 'Error spawning') {
        self.limit = self.active - 1;
        self.queue.push([cmd, opts, callback]);
      } else {
        throw err;
      }
    }
  } else {
    self.queue.push([cmd, opts, callback]);
  }
};

var execQueue = new ExecQueue(20);  // FIXME: can we figure out a max here?

// Run a test file or module. If test is a string, it is assumed it is a file
// and node is executed as a child process. If not a string, it is assumed it
// is an object, and any functions with the prefix "test" will be run.
//
// callback will be called for each test with (ok, err, done, name), where
// ok is a boolean, err is a string or undefined, done is true if there are no
// more tests left to run, and name is the filename or method name.
exports.run = function run(test, opts, callback) {
  if (arguments.length < 3) {
    callback = opts;
    opts = {};
  }
  if (typeof test === 'string') {
    var cmd = process.argv[0] + ' ' + test;
    execQueue.exec(cmd, opts, function(err, stdout, stderr) {
      if (err) {
        callback(false, stderr, true, test);
      } else {
        callback(true, undefined, true, test);
      }
    });
  } else {
    var keys = Object.keys(test).filter(function(key) {
      return typeof test[key] === 'function' && key.substr(0, 4) === 'test';
    });
    var i = keys.length;
    while (i--) {
      try {
        value.call(test);
      } catch (err) {
        callback(false, err.stack || String(err), i === 0, key);
        continue;
      }
      callback(true, undefined, i === 0, key);
    }
  }
};

// Find all tests in a folder and run them, printing the results to stdout
// in TAP format. Callback will get the arguments (okCount, notOkCount).
exports.runAll = function runAll(folder, opts, callback) {
  if (arguments.length < 3) {
    callback = opts;
    opts = {};
  }
  exports.findAll(folder, function(files) {
    if (files.length === 0) {
      throw new Error("couldn't find any tests to run");
    }
    var count = 0
      , okCount = 0
      , notOkCount = 0
      , expectedCount = files.length;
    sys.puts('1..' + expectedCount);
    files.forEach(function(file) {
      exports.run(path.join(folder, file), function(ok, err, done, name) {
        count++;
        var text = path.basename(file, '.js').replace(/[\-_]/g, ' ');
        if (err) {
          notOkCount++;
          exports.printNotOk(err, count, text, opts);
        } else {
          okCount++;
          exports.printOk(count, text, opts);
        }
      });
    });
  });
};

if (module === require.main) {
  exports.runAll(__dirname, {color: true}, function(okCount, notOkCount) {
    process.exit(notOkCount);
  });
}
