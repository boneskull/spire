'use strict';

describe('spireStream', function () {

  var SandboxedModule = require('sandboxed-module'),
    serialPort = require('../linux-hardware');

  var hardware = serialPort.hardware,
    spireStream = SandboxedModule.require('../../lib/stream', {
      requires: {
        serialport: serialPort
      }
    }),
    sandbox,
    PORT = '/dev/tty.foo';

  beforeEach(function () {
    sandbox = sinon.sandbox.create('spireStream');

    hardware.reset();
    hardware.createPort(PORT);
  });

  afterEach(function () {
    sandbox.restore();
  });

  describe('constructor', function () {
    it('should fail if no port supplied', function () {
      expect(spireStream).to.throw();
    });

    it('should instantiate a SerialPort', function (done) {
      var spy = sandbox.spy(serialPort, 'SerialPort');
      spireStream(PORT)
        .on('drain', done);
      expect(spy).to.have.been.calledWithNew;
    });

    it('should use 9600 baud as a default', function () {
      expect(spireStream(PORT)._opts.baudrate).to.equal(9600);
    });

  });

  describe('write', function () {
    it('should buffer immediate writes', function (done) {
      var stream = spireStream(PORT),

        spy = sandbox.spy(stream._serial, 'write');

      stream.on('drain', function () {

        expect(spy).to.have.been.called;
        done();
      });
      expect(stream.write('bleah')).to.be.false;

    });
  });

});
