'use strict';

module.exports = function gruntfile(grunt) {
  var path = require('path'),
    loadGruntConfig = require('load-grunt-config');

  var join = path.join;

  if (grunt.option('time')) {
    require('time-grunt')(grunt);
  }

  loadGruntConfig(grunt, {
    configPath: join(__dirname, 'tasks'),
    jitGrunt: {
      staticMappings: {
        devUpdate: 'grunt-dev-update',
        mochacov: 'grunt-mocha-cov'
      }
    },
    data: {
      pkg: require(join(__dirname, 'package.json'))
    }
  });
};
