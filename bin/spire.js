#!/usr/bin/env node

'use strict';

var yargs = require('yargs'),
  inquirer = require('inquirer'),
  _ = require('lodash'),
  Promise = require('bluebird'),
  serialPort = require('serialport'),

  spire = require('..');

var parseArgs,
  main,
  promptForPort,

  logger = spire.logger,
  commands = spire.commands,
  Espruino = spire.Espruino,

  log;

Promise.longStackTraces();

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
  var globalArgs = yargs
      .usage('$0 <command> [--port <port>] [--baudrate <baudrate>] ' +
      '[--no-color] [--no-autodetect] [--verbose] [--debug]')
      .command('upload', 'Upload a script to Espruino')
      .options({
        port: {
          alias: 'p',
          string: true,
          describe: 'Espruino\'s serial port'
        },
        color: {
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
        },
        autodetect: {
          'boolean': true,
          describe: 'Auto-detect Espruino port (STM32 chip)',
          'default': true
        },
        baudrate: {
          alias: 'b',
          describe: 'Communication baud rate',
          'default': 9600
        }
      })
      .demand(1)
      .version('version')
      .help('help')
      .alias('help', 'h')
      .epilogue('Fork me on GitHub: https://github.com/boneskull/spire')
      .check(function (argv) {
        if (!_.contains(argv._[0], _.keys(commands))) {
          throw new Error('Unknown command');
        }
        return true;
      })
      .argv,
    cmd = globalArgs._[0],
    cmdArgs,
    command = commands[cmd];

  cmdArgs = yargs.reset()
    .usage(command.usage)
    .demand(1 + (command.demand || 0))
    .options(command.options)
    .argv;

  return {
    opts: _.extend(globalArgs, cmdArgs),
    command: command
  };
};

main = function main() {
  var data = parseArgs(),
    opts = data.opts,
    command = data.command,
    espruino;

  log = logger(_.extend({}, opts, {
    cli: true
  }));
  log.debug('Received arguments:', opts);
  log.verbose('Querying serial ports');

  Espruino.findPort(opts.port, opts.autodetect)
    .then(function (data) {
      var port = data.port;
      _.each(data.log, function (msg, func) {
        log[func](msg);
      });
      if (!port) {
        return promptForPort(data.ports);
      }
      return port;
    })
    .then(function (port) {
      _.extend(opts, {
        port: port
      });
      espruino = new Espruino(opts);
      espruino.pipe(process.stdout);

      return command.handler.call(espruino, opts);
    })
    .catch(function (err) {
      log.error(err);
    })
    .finally(function () {
      espruino.unpipe(process.stdout);
      espruino.close();
    });
};

if (require.main === module) {
  main();
}
