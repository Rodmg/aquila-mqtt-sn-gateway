
import * as Slip from 'node-slip';
import { EventEmitter } from 'events';
import * as mqtt from 'mqtt';
import { log } from './Logger';
import { calcCrc, checkCrc } from './CrcUtils';
import { TransportInterface } from './interfaces';

export class MQTTTransport extends EventEmitter implements TransportInterface {

  fake: boolean = false;
  url: string;
  inTopic: string;
  outTopic: string;

  // Serial port write buffer control
  writing: boolean = false;
  writeBuffer: Array<any> = [];

  externalClient: boolean = false;
  client: mqtt.Client = null;
  parser: any;

  constructor(url: string, inTopic: string, outTopic: string, client?: mqtt.Client) {
    super();

    this.url = url;
    this.inTopic = inTopic;
    this.outTopic = outTopic;

    if(client != null) {
      this.externalClient = true;
      this.client = client;
    }

    let receiver = {
      data: (input: Buffer) => {
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
      framing: (input: Buffer) => {
        this.emit("framingError", input);
      },
      escape: (input: Buffer) => {
        this.emit("escapeError", input);
      }
    };

    this.parser = new Slip.parser(receiver);
  }

  connect(): Promise<void>  {

    if(this.client == null) this.client = mqtt.connect(this.url);

    this.client.on('connect', () => {
        log.debug('Connected to MQTT broker (MQTTTransport)');
        // Subscribe to bridge out topic
        this.client.subscribe(this.outTopic, { qos: 2 });
      });

    this.client.on('offline', () => {
        log.warn('MQTT broker offline (MQTTTransport)');
      });

    this.client.on('reconnect', () => {
        log.warn('Trying to reconnect with MQTT broker (MQTTTransport)');
      });

    this.client.on('message', (topic: string, message: Buffer, packet: any) => {
      //if(message.length > MAXLEN) return log.warn("message too long");
      if(topic !== this.outTopic) return; //log.error("bad topic");
      // Convert from base64
      message = Buffer.from(message.toString(), 'base64');
      //console.log(message, message.toString('utf-8'));
      this.parser.write(message);
    });

    if(this.externalClient || this.client.connected) {
      // Do connect event for the first time
      // Make subscriptions for the first time
      this.client.subscribe(this.outTopic, { qos: 2 });
      return Promise.resolve(null);
    }
    else {
      return new Promise<void>((resolve, reject) => {
        this.client.once('connect', () => {
          // Make subscriptions for the first time
          this.client.subscribe(this.outTopic, { qos: 2 });
          resolve(null);
        });
      });
    }

  }

  close(callback: Function) {
    if(!callback) callback = function(){};
    if(this.client == null || this.externalClient) return;
    this.client.end(false, (err: any) => {
      if(err) return callback(err); 
      callback(); 
    });
  }

  write(data: any) {
    data = new Buffer(data);
    // Append CRC
    let crc = calcCrc(data);
    let crcBuf = new Buffer(2);

    crcBuf.writeUInt16LE(crc, 0);

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
