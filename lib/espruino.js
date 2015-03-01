'use strict';

var path = require('path'),
  util = require('util'),
  stream = require('readable-stream'),
  serialPort = require('serialport'),
  through2 = require('through2'),
  Promise = require('bluebird'),
  browserify = require('browserify'),
  _ = require('lodash'),

  logger = require('./logger');

var Duplex = stream.Duplex,
  SerialPort = serialPort.SerialPort,
  format = util.format;

var Espruino = function Espruino(opts) {
  var log, port;

  opts = opts || {};
  port = opts.port;
  if (!port || !_.isString(opts.port)) {
    throw new Error('invalid options; port required');
  }

  _.defaults(opts, {
    encoding: 'utf-8'
  });

  Duplex.call(this, opts);

  log = logger();
  log.extend(this);

  this._opts = _.defaults(opts, {
    baudrate: 9600,
    writeStream: process.stdout,
    save: false,
    minify: false,
    tarball: false
  });

  _.extend(this, {
    port: port,
    baudrate: opts.baudrate,
    writeStream: opts.writeStream,
    _serial: null,
    _queue: []
  });

  this.on('error', function (err) {
    this.error(err);
  });

};

Espruino.getPorts = function getPorts() {
  return new Promise(function (resolve, reject) {
    // serialPort is not promisifyable due to it being a C++ lib
    serialPort.list(function (err, ports) {
      if (err) {
        return reject(err);
      }
      resolve(ports);
    });
  });
};

Espruino.findPort = function findPort(port, autodetect) {
  return Espruino.getPorts()
    .then(function (ports) {

      var portObj,
        log = {},
        portNames;

      if (!port && autodetect) {
        portObj = Espruino.guessPort(ports);
        if (portObj) {
          port = portObj.comName;
          log.info = format('Auto-detected Espruino on port "%s"', port);
        } else {
          port = null;
          log.warn = format('Could not auto-detect Espruino');
        }
      } else if (port &&
        !_.contains((portNames = _.pluck(ports, 'comName')), port)) {
        port = port.replace(/tty\./, 'cu.');
        if (!_.contains(portNames, port)) {
          log.warn = format('Unknown serial port "%s"', port);
          port = null;
        }
      }

      return Promise.resolve({
        port: port,
        log: log,
        ports: ports
      });
    });
};

Espruino.guessPort = function guessPort(ports) {
  return _.find(ports, {
    manufacturer: 'STMicroelectronics',
    productId: '0x5740',
    vendorId: '0x0483'
  });
};

Espruino.prototype = _.create(Duplex.prototype, {
  _write: function _write(output, encoding, callback) {
    var serial;
    if ((serial = this._serial) === null) {
      return false;
    }

    output = output.toString();

    this.debug('Writing data "%s"', output.trim());
    return serial.write(output, function (err) {
      this.debug('Wrote data "%s"', output.trim());
      if (this._readableState.needReadable) {
        this._read();
      }
      callback(err);
    }.bind(this));
  },
  _read: function _read() {
    if (this._serial === null) {
      return;
    }
    _.each(_.range(this._queue.length, 0, -1), function () {
      return this.push(this._queue.shift());
    }, this);
  },
  close: function() {
    this._serial && this._serial.close();
  },
  upload: function upload(filepath) {
    this.info('Beginning upload');
    filepath = path.join(process.cwd(), path.normalize(filepath));
    return this.reset()
      .bind(this)
      .then(function() {
        return this._upload(filepath);
      })
      .then(function() {
        return this;
      });
  },
  _upload: function _upload(filepath) {
    var opts = this._opts;
    this.info('Transforming %s', path.basename(filepath));
    browserify(filepath)
      .transform(function (file) {
        var prepend = 'function onInit() {\n';
        return through2(function (chunk, enc, callback) {
          chunk = prepend + chunk.toString();
          prepend = '';
          callback(null, chunk);
        }, function (callback) {
          this.push('}');
          callback();
        });
      })
      .bundle()
      .pipe(this._serial);

    return Promise.resolve(opts.save && this.save());
  },
  _writePromise: function writePromise(data) {
    return this.open()
      .bind(this)
      .then(function () {
        return new Promise(function (resolve, reject) {
          this.on('_writeDone', resolve)
            .write(data, _.isString(data) ? 'utf8' : null, function (err) {
              if (err) {
                return reject(new Error(err));
              }
            });
        }.bind(this));
      });
  },
  reset: function reset() {
    return this._writePromise('reset();\n');
  },
  save: function save() {
    return this._writePromise('save();\n');
  },
  open: function open() {
    var port = this.port,
      baudrate = this.baudrate;

    return new Promise(function (resolve, reject) {

      if (this._serial) {
        return resolve(this._serial);
      }

      this.verbose('Opening port "%s" @ %s baud', port, baudrate);
      this._serial = new SerialPort(port, {
        baudrate: baudrate,
        dataCallback: function dataCallback(chunk) {

          var state = this._readableState,
            lastChar = chunk.toString().charAt(chunk.length - 1);
          this._queue.push(chunk);
          if (lastChar === '>' || lastChar === ':') {
            this._queue.push('\n');
            this._queue.push(null);
            process.nextTick(function () {
              this.emit('_writeDone');
            }.bind(this));
          }
          if (state.needReadable && state.reading) {
            this._read();
          }

        }.bind(this)
      })
        .on('open', function () {
          this.debug('Opened port "%s" @ %s baud', port, baudrate);
          resolve(this._serial);
        }.bind(this))
        .on('error', reject);
      this._serial.end = function() {};
    }.bind(this));
  }
});

module.exports = Espruino;
