'use strict';

var events = require('events'),
  path = require('path'),
  util = require('util'),
  serialPort = require('serialport'),
  Promise = require('bluebird'),
  browserify = require('browserify'),
  chalk = require('chalk'),
  through2 = require('through2'),
  _ = require('lodash'),

  logger = require('./logger');

var EventEmitter = events.EventEmitter,
  SerialPort = serialPort.SerialPort,
  format = util.format;

var Espruino = function Espruino(port, opts) {
  var log;
  EventEmitter.call(this);

  log = logger();
  log.extend(this);

  opts = opts || {};
  _.defaults(opts, {
    baudrate: 9600,
    writeStream: process.stdout
  });

  _.extend(this, {
    port: port,
    baudrate: opts.baudrate,
    writeStream: opts.writeStream,
    _serial: null
  });

  this.on('error', function (err) {
    this.error(err);
  });
};

Espruino.prototype = _.create(EventEmitter.prototype, {
  upload: function upload(entryPoint) {
    this.info('Beginning upload');
    this.reset()
      .then(function () {

      });

    //this.bundle(entryPoint);


  },
  reset: function reset() {
    return this.execute('reset()');
  },
  execute: function execute(command, timeout) {
    return this.open()
      .bind(this)
      .then(function (serial) {
        return new Promise(function (resolve, reject) {
          var handler = function handler(chunk) {
              chunk = chunk.toString();
              this.writeStream.write(chunk);
              if (chunk.charAt(chunk.length - 1) === '>') {
                clearTimeout(t);
                this.debug('Executed command "%s"', command);
                serial.removeListener('data', handler);
                resolve();
              }
            }.bind(this),
            t;

          this.verbose('Executing command "%s"', command);
          serial.on('data', handler);

          if (_.isNumber(timeout) && timeout > 0) {
            t = setTimeout(function () {
              reject(new Error('Command "%s" timed out', command));
            }, timeout);
          }

          serial.write(format('%s\n', command));

        }.bind(this));
      }.bind(this));
  },
  open: function open() {
    var port = this.port,
      baudrate = this.baudrate;

    this.verbose('Opening port "%s" @ %s baud', port, baudrate);
    return new Promise(function (resolve, reject) {

      if (this._serial) {
        return resolve(this._serial);
      }

      this._serial = new SerialPort(port, {
        baudrate: baudrate
      })
        .on('open', function () {
          this.debug('Opened port "%s" @ %s baud', port, baudrate);
          resolve(this._serial);
        }.bind(this))
        .on('error', reject);
    }.bind(this));
  },
  bundle: function bundle(entryPoint, opts, stream) {
    var filepath = path.join(process.cwd(), path.normalize(entryPoint)),
      b = browserify(filepath),
      passThrough = function passThrough() {
        return through2(function (chunk, encoding, callback) {
          callback(null, chunk);
        });
      };

    _.defaults(opts, {
      minify: false,
      tarball: false
    });

    stream = stream || process.stdout;

    b.transform(function () {
      var data = 'function onInit() {\n';

      return through2(function (chunk, encoding, callback) {
        chunk = data + chunk;
        data = '';
        callback(null, chunk);
      }, function (callback) {
        this.push('\n}\n');
        callback();
      });
    })
      .transform(opts.minify ? require('uglifyify') : passThrough)
      .transform(opts.tarball ? require('uglifyify') : passThrough)
      .bundle();

  }
});

module.exports = Espruino;
