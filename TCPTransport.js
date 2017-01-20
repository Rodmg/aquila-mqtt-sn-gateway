// TCPTransport.js
"use strict";

const Slip = require("node-slip");
const EventEmitter = require("events").EventEmitter;
const net = require('net');
const log = require('./Logger');

const crcUtils = require('./CrcUtils');
const calcCrc = crcUtils.calcCrc;
const checkCrc = crcUtils.checkCrc;

class TCPTransport extends EventEmitter {

  constructor(port) {
    super();

    this.fake = false;
    this.alreadyReady = false;

    this.port = port;

    // Serial port write buffer control
    this.writing = false;
    this.writeBuffer = [];

    const receiver = {
      data: (input) => {
        // Check CRC
        let crcOk = checkCrc(input);
        // Strip CRC data
        let data = input.slice(0, input.length - 2);

        if(crcOk) {
          this.emit("data", data);
        }
        else {
          this.emit("crcError", data);
        }
      },
      framing: (input) => {
        this.emit("framingError", input);
      },
      escape: (input) => {
        this.emit("escapeError", input);
      }
    };

    this.parser = new Slip.parser(receiver);
  }

  connect() {
    if(this.server != null) return; // Already connected
    this.server = net.createServer((sock) => {
      log.info('TCP client connected: ' + sock.remoteAddress +':'+ sock.remotePort);
      if(this.sock != null) {
        log.warn('There is a bridge already connected, ignoring new connection');
        return;
      }

      this.sock = sock;

      // TODO: Keep alive not working, try: https://www.npmjs.com/package/net-keepalive
      //this.sock.setTimeout(10000);
      this.sock.setKeepAlive(true, 0);

      this.sock.on("data", (data) => {
        this.parser.write(data);
      });

      this.sock.on("connect", () => {
        this.emit("ready");
      });

      this.sock.on("error", (err) => {
        log.debug("Socket error");
        this.emit("error", err);
      });

      this.sock.on("end", (err) => {
        log.debug("Socket end");
        this.emit("disconnect", err);
        this.sock = null;
      });

      this.sock.on("close", () => {
        log.debug("Socket close");
        this.emit("close");
        this.sock = null;
      });

      this.sock.on("timeout", () => {
        log.debug("Socket timeout");
        this.sock.end();
      });

      if(!this.alreadyReady) this.emit("ready");
      this.alreadyReady = true;
    }).listen(this.port);
    log.info("TCP Transport server listening on port", this.port);
  }

  close(callback) {
    if(!callback) callback = function(){};
    if(this.sock == null) return;
    this.sock.close((err) => {
      if(err) return callback(err);  
    });
  }

  write(data) {
    data = new Buffer(data);
    // Append CRC
    let crc = calcCrc(data);
    let crcBuf = new Buffer(2);

    crcBuf.writeUInt16LE(crc, 0, 2);

    let buffer = Buffer.concat([data, crcBuf]);

    // Convert to Slip
    let slipData = Slip.generator(buffer);

    self.writeBuffer.push(slipData);
    self.writeNow();
  }

  writeNow() {
    if(this.sock == null) return;

    // Nothing to do here
    if(this.writeBuffer.length <= 0) return;
    // We are busy, do nothing
    if(this.writing) return;
    this.writing = true;

    // do nothing if we are in fake mode
    if(this.fake) { this.writing = false; return; }


    let data = this.writeBuffer.shift();
    this.sock.write(data);

    //if(config.debug) console.log("Sending:", data);

    this.writing = false;
    if(this.writeBuffer.length > 0) this.writeNow();
  }

}

module.exports = TCPTransport;