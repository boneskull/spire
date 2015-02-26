'use strict';

var winston = require('winston'),
  _ = require('lodash'),
  chalk = require('chalk'),
  path = require('path');

var transports = winston.transports,
  loggers = {
    cli: function cliLogger(opts) {
      _.defaults(opts, {
        colorize: chalk.supportsColor && opts.color && 'all',
        showLevel: false
      });
      return new transports.Console(opts);
    },
    file: function cliLogger(opts) {
      _.defaults(opts, {
        filename: path.join(process.cwd(), 'spire-debug.log'),
        timestamp: true,
        json: false
      });
      return new transports.File(opts);
    }
  },

  logger = function logger(opts) {
    var logConfig;

    if (winston.loggers.loggers.spire) {
      return winston.loggers.get('spire');
    }

    opts = opts || {};

    _.defaults(opts, {
      debug: false,
      verbose: false,
      color: false,
      handleExceptions: true
    });

    if (opts.debug) {
      opts.logLevel = 'debug';
    } else if (opts.verbose) {
      opts.logLevel = 'verbose';
    } else {
      opts.logLevel = 'info';
    }

    if (opts.color) {
      winston.config.addColors(winston.config.cli.colors);
    }

    logConfig = {
      transports: []
    };

    if (opts.debug || opts.cli) {
      logConfig.transports.push(loggers.cli({
        level: opts.logLevel,
        colorize: opts.color && chalk.supportsColor && 'all'
      }));
    }

    if (opts.debug || opts.logFile) {
      logConfig.transports.push(loggers.file({
        level: opts.logLevel,
        filename: opts.logFile
      }));
    }

    return winston.loggers.add('spire', logConfig);
  };

module.exports = logger;
