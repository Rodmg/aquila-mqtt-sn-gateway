"use strict";

const Slip = require("node-slip");
const EventEmitter = require("events").EventEmitter;
const mqtt = require('mqtt');
const log = require('./Logger');

const crcUtils = require('./CrcUtils');
const calcCrc = crcUtils.calcCrc;
const checkCrc = crcUtils.checkCrc;

class MQTTTransport extends EventEmitter {

  constructor(url, inTopic, outTopic) {
    super();
    this.fake = false;
    this.alreadyReady = false;

    this.url = url;
    this.inTopic = inTopic;
    this.outTopic = outTopic;

    // Serial port write buffer control
    this.writing = false;
    this.writeBuffer = [];

    this.client = null;

    let receiver = {
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
    if(this.client != null) return; // Already connected
    this.client = mqtt.connect(this.url);

    this.client.on('connect', () => {
        log.debug('Connected to MQTT broker (MQTTTransport)');
        // Subscribe to bridge out topic
        this.client.subscribe(this.outTopic, { qos: 2 });
        if(!this.alreadyReady) this.emit("ready");
        this.alreadyReady = true;
      });

    this.client.on('offline', () => {
        log.warn('MQTT broker offline (MQTTTransport)');
      });

    this.client.on('reconnect', () => {
        log.warn('Trying to reconnect with MQTT broker (MQTTTransport)');
      });

    this.client.on('message', (topic, message, packet) => {
      //if(message.length > MAXLEN) return log.warn("message too long");
      if(topic !== this.outTopic) return log.error("bad topic");
      // Convert from base64
      message = Buffer.from(message.toString(), 'base64');
      //console.log(message, message.toString('utf-8'));
      this.parser.write(message);
    });

  }

  close(callback) {
    if(!callback) callback = function(){};
    if(this.client == null) return;
    this.client.end((err) => {
      if(err) return callback(err); 
      callback(); 
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

    // Convert to Base64
    slipData = new Buffer(slipData.toString('base64'));

    this.writeBuffer.push(slipData);
    this.writeNow();
  }

  writeNow() {
    if(this.client == null) return;

    // Nothing to do here
    if(this.writeBuffer.length <= 0) return;
    // We are busy, do nothing
    if(this.writing) return;
    this.writing = true;

    // do nothing if we are in fake mode
    if(this.fake) { this.writing = false; return; }


    var data = this.writeBuffer.shift();
    this.client.publish(this.inTopic, data, {
        qos: 2,
        retain: false
      });

    //if(config.debug) console.log("Sending:", data);

    this.writing = false;
    if(this.writeBuffer.length > 0) this.writeNow();
  }

}

module.exports = MQTTTransport; 