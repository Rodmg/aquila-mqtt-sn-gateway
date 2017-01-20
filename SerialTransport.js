// SerialTransport.js
"use strict";

const SerialPort = require("serialport");
const Slip = require("node-slip");
const EventEmitter = require("events").EventEmitter;

const crcUtils = require('./CrcUtils');
const calcCrc = crcUtils.calcCrc;
const checkCrc = crcUtils.checkCrc;

class SerialTransport extends EventEmitter {

  constructor(baudrate, port) {
    super();

    this.fake = false;

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

    this.serialPort = new SerialPort(port, {
        baudrate: baudrate,
        autoOpen: false
      });

    this.serialPort.on("data", (data) => {
        this.parser.write(data);
      });

    this.serialPort.on("open", () => {
        this.emit("ready");
      });

    this.serialPort.on("error", (err) => {
        this.emit("error", err);
      });

    this.serialPort.on("disconnect", (err) => {
        this.emit("disconnect", err);
      });

    this.serialPort.on("close", () => {
        this.emit("close");
      });
  }

  connect() {
    this.serialPort.open((err) => {
      if(err) {
        this.emit("error", err);
        return;
      }
    });
  }

  close(callback) {
    if(!callback) callback = function(){};
    this.serialPort.flush((err) => {
      if(err) return callback(err);
      this.serialPort.drain((err) => {
        if(err) return callback(err);
        this.serialPort.close( () => callback() );
      });
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

    this.writeBuffer.push(slipData);
    this.writeNow();
  }

  writeNow() {
    // Nothing to do here
    if(this.writeBuffer.length <= 0) return;
    // We are busy, do nothing
    if(this.writing) return;
    this.writing = true;

    // do nothing if we are in fake mode
    if(this.fake) { this.writing = false; return; }

    this.serialPort.drain(() => {
        let data = this.writeBuffer.shift();
        this.serialPort.write(data);

        //if(config.debug) console.log("Sending:", data);

        this.writing = false;
        if(this.writeBuffer.length > 0) this.writeNow();
      });
  }

}

module.exports = SerialTransport;