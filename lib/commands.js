'use strict';

var commands = {
  upload: {
    usage: '$0 upload [--no-minify] [--no-save] <file.js>',
    demand: 1,
    options: {
      minify: {
        describe: 'Minify before uploading',
        'boolean': true,
        'default': true
      },
      save: {
        describe: 'Save script to flash memory',
        'boolean': true,
        'default': true
      }
    },
    handler: function upload(opts) {
      return this.upload(opts._[1])
        .bind(this)
        .then(function() {
          return this;
        });
    }
  }
};

module.exports = commands;
