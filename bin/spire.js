#!/usr/bin/env node

'use strict';

var yargs = require('yargs'),
  inquirer = require('inquirer'),
  _ = require('lodash'),
  Promise = require('bluebird'),
  serialPort = require('serialport'),

  spire = require('..');

var promptForPort,
  parseArgs,
  upload,
  main,
  guessPort,

  Espruino = spire.Espruino,
  logger = spire.logger,

  log;

Promise.longStackTraces();

guessPort = function guessPort(ports) {
  return _.find(ports, {
    manufacturer: 'STMicroelectronics'
  });
};

promptForPort = function promptForPort(ports) {
  var NONE = 'none',
    RESCAN = 'rescan';

  if (!process.stdout.isTTY) {
    return Promise.reject('Could not find Espruino');
  }
  return (function _promptForPort(ports) {
    var defaultPort;

    defaultPort = guessPort(ports);
    return new Promise(function (resolve, reject) {
      inquirer.prompt({
        type: 'list',
        name: 'port',
        message: 'Please choose the Espruino\'s serial port.',
        choices: _.map(ports, 'comName').concat({
          name: '(None of these; exit)',
          value: NONE
        }, {
          name: '(Rescan serial ports)',
          value: RESCAN
        }),
        'default': defaultPort && defaultPort.comName
      }, function (answers) {
        switch (answers.port) {
          case NONE:
            return reject('Could not find Espruino');
          case RESCAN:
            serialPort.list(function (err, ports) {
              if (err) {
                return reject(new Error(err));
              }
              log.debug('Found serial ports:', ports);
              _promptForPort(ports)
                .then(resolve, reject);
            });
            break;
          default:
            return resolve(answers.port);
        }

      });
    });
  }(ports));

};

parseArgs = function parseArgs() {
  return yargs
    .usage('$0 --port <port> <file.js>')
    .options({
      port: {
        alias: 'p',
        string: true,
        describe: 'Espruino\'s serial port'
      },
      color: {
        alias: 'c',
        'boolean': true,
        describe: 'Display output in color (if available)',
        'default': true
      },
      verbose: {
        alias: 'v',
        'boolean': true,
        describe: 'Verbose output'
      },
      debug: {
        'boolean': true,
        describe: 'Debug-level output'
      }
    })
    .demand(1)
    .version('version')
    .help('help')
    .alias('help', 'h')
    .epilogue('See https://github.com/boneskull/spire')
    .argv;
};

upload = function upload(port, file) {
  var esp = new Espruino(port);

  esp.upload(file);

};

main = function main() {
  var argv = parseArgs(),
    filepath = _.first(argv._),
    port = argv.port;

  argv.cli = true;
  log = logger(argv);

  log.debug('Received arguments:', argv);
  log.verbose('Querying serial ports');

  serialPort.list(function (err, ports) {
    var ok = true,
      portObj,
      portNames;

    if (err) {
      throw new Error(err);
    }

    log.debug('Found serial ports:', ports);

    if (!port) {
      portObj = guessPort(ports);
      if (!portObj) {
        log.info('Could not auto-detect Espruino');
        ok = false;
      } else {
        port = portObj.comName;
        log.info('Auto-detected Espruino on port "%s"', port);
      }
    } else if (port &&
      !_.contains((portNames = _.pluck(ports, 'comName')), port)) {
      port = port.replace(/tty\./, 'cu.');
      if (!_.contains(portNames, port)) {
        log.warn('Unknown serial port "%s"', port);
        ok = false;
      }
    }

    Promise.resolve(function () {
      if (!ok) {
        return promptForPort(ports);
      }
      return Promise.resolve(port);
    }())
      .then(function (port) {
        return upload(port, filepath);
      })
      .catch(function (err) {
        log.error(err);
      });
  });
};

if (require.main === module) {
  main();
}
