#!/usr/bin/env node

'use strict';

var yargs = require('yargs'),
  inquirer = require('inquirer'),
  _ = require('lodash'),
  Promise = require('bluebird'),
  winston = require('winston'),
  chalk = require('chalk'),
  path = require('path'),
  serialPort = require('serialport'),

  Espruino = require('../lib/espruino');

var promptForPort,
  parseArgs,
  upload,
  main,
  configureLogger;

Promise.longStackTraces();

configureLogger = function configureLogger(argv) {
  var log,
    logLevel,
    logConfig;

  if (argv.debug) {
    logLevel = 'debug';
  } else if (argv.verbose) {
    logLevel = 'verbose';
  } else {
    logLevel = 'info';
  }

  logConfig = {
    transports: [
      new winston.transports.Console({
        level: logLevel,
        colorize: argv.color && 'all',
        handleExceptions: true,
        showLevel: false,
        prettyPrint: true
      })
    ]
  };

  if (argv.debug) {
    logConfig.transports.push(new winston.transports.File({
      filename: path.join(process.cwd(), 'spire-debug.log'),
      level: logLevel,
      timestamp: true,
      handleExceptions: true
    }));
  }

  log = winston.loggers.add('spire', logConfig);
  //log.setLevels(LEVELS);
  //_.find(log.transports, {name: 'console']}).showLevel = false;

  return log;
}

promptForPort = function promptForPort(ports) {
  return new Promise(function (resolve) {
    inquirer.prompt([{
      type: 'list',
      name: 'port',
      message: 'Please choose the Espruino\'s serial port.',
      choices: _.map(ports, 'comName'),
      'default': _.find(ports, {manufacturer: 'STMicroelectronics'}).comName
    }], function (answers) {
      resolve(answers);
    });
  })
    .get('port');
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
    .check(function (argv) {
      argv.color = argv.c = argv.color && chalk.supportsColor;
      return true;
    })
    .argv;
};


upload = function upload(port, file) {
  var esp = new Espruino(port);

  esp.upload(file);

};

main = function main() {
  var argv = parseArgs(),
    filepath = _.first(argv._),
    port = argv.port,
    log;

  log = configureLogger(argv);
  log.debug('Received arguments:', argv);
  log.verbose('Querying serial ports');

  serialPort.list(function (err, ports) {
    var ok = true;
    if (err) {
      throw new Error(err);
    }

    log.debug('Found serial ports:', ports);

    if (!port) {
      ok = false;
    } else if (port && !_(ports).map('comName').contains(port)) {
      log.warn('Unknown serial port "%s"', port);
      ok = false;
    }


    (!ok ? promptForPort(ports) : Promise.resolve(port))
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
