
import { EventEmitter } from 'events';
import { log } from './Logger';
import { TransportInterface, DBInterface } from './interfaces';

/*
  Manages connections with bridge and initial parsing

  Events:
    data ({lqi, rssi, addr, mqttsnFrame})

  Serial frame formats:

    MQTT-SN forwarder: msgType = 0xFE
      len, msgType, ctrl, addrL, addrH, mqttsnpacket
    NACK
      len, 0x00
    ACK:
      len, 0x01
    CONFIG:
      len, 0x02, [PAN], [encryption key x 16]
    ENTER PAIR:
      len, 0x03, 0x01
    EXIT PAIR
      len, 0x03, 0x00
    PAIR REQ
      len, 0x03, 0x02, addrL, addrH, length (3), pair cmd (0x03), randomId
    PAIR RES
      len, 0x03, 0x03, addrL, addrH, length (4), pair cmd (0x03), randomId, newAddr, newPan (, [encryption key x 16] )

  TODO: add not connected state management
 */

const ACKTIMEOUT = 5000;
const MAX_BUFFER_ALLOWED = 10;

const NACK_CMD = 0x00;
const ACK_CMD = 0x01;
const CONFIG_CMD = 0x02;
const PAIR_CMD = 0x03;

const NO_KEY = [0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF,0xFF];

export interface ForwarderMessage {
  lqi: number;
  rssi: number;
  len: number;
  msgType: number,
  ctrl: number,
  addr: number,
  mqttsnFrame: Buffer
}

export class Forwarder extends EventEmitter {

  db: DBInterface;
  transport: TransportInterface;
  readyToSend: boolean = true;
  frameBuffer: Array<Buffer> = [];
  ackTimeout: NodeJS.Timer = null;
  pan: number = 0x01;
  key: Array<number> = NO_KEY;
  pairMode: boolean = false;

  constructor(db: DBInterface, transport: TransportInterface, pan?: number, encryptionKey?: Array<number>) {
    super();

    // For pair address management
    this.db = db;
    this.transport = transport;

    if(pan != null) this.pan = pan;
    if(encryptionKey != null) {
      if(encryptionKey.length !== 16) log.warn("Invalid encryption key received, starting without encryption");
      else this.key = encryptionKey;
    }

  }

  connect(): Promise<void> {
    
    this.transport.on('error', (err: any) => {
        log.error("There was an error connecting to the Bridge, make sure it's connected to the computer.");
        throw err;
      });

    this.transport.on('disconnect', (err: any) => {
        log.error("The Bridge was disconnected from the computer.");
        throw err;
      });

    this.transport.on('data', (data: Buffer) => {
        //log.trace('Data: ', data);
        
        if(this.pairMode) return this.handlePairMode(data);

        // 5 of mqtt-sn forwarder, 2 of lqi and rssi
        if(data.length < 4) return log.error('Forwarder: got message with not enough data');
        let lqi = data[0];
        let rssi = data[1];
        let len = data[2];
        let msgType = data[3];
        if(msgType !== 0xFE) {
          if(msgType === NACK_CMD) {
            // NACK
            //console.log("NACK");
            this.readyToSend = true;
            clearTimeout(this.ackTimeout);
            this.sendNow(); // Send any remaining messages
          }
          else if(msgType === ACK_CMD) {
            // ACK
            //console.log("ACK");
            this.readyToSend = true;
            clearTimeout(this.ackTimeout);
            this.sendNow(); // Send any remaining messages
          }
          else if(msgType === CONFIG_CMD) {
            log.trace("GOT CONFIG");
            // CONFIG req, respond with CONFIG
            this.sendConfig();
            this.sendNow(); // Send any remaining messages
          }
          else return log.error('Forwarder: bad forwarder msg type');
          return;
        } 
        if(data.length < 7) return log.error('Forwarder: got message with not enough data');
        let ctrl = data[4];
        let addr = data.readUInt16LE(5);
        let mqttsnFrame = data.slice(7);

        // If not in pair mode, ignore any message from address 0 (pair mode address)
        if(addr === 0 && !this.pairMode) return;

        let message: ForwarderMessage = {
            lqi: lqi,
            rssi: rssi,
            len: len,
            msgType: msgType,
            ctrl: ctrl,
            addr: addr,
            mqttsnFrame: mqttsnFrame
          }

        this.emit('data', message);
        
      });
    this.transport.on('crcError', (data: Buffer) => log.error('crcError', data) );
    this.transport.on('framingError', (data: Buffer) => log.error('framingError', data) );
    this.transport.on('escapeError', (data: Buffer) => log.error('escapeError', data) );

    

    return this.transport.connect()
    .then(() => {
      // Assure that config is sent on start, in addition to when the bridge requests it
      // Some USB-Serial chips have problems sending the config request on startup, this is a workaround for that
      // We wait 2.1 seconds for accounting to most Arduino bootloader's startup time (2s)
      setTimeout(() => {
        setTimeout(() => this.sendConfig(), 2100);
      }, 100);
      return null;
    });
    
  }

  disconnect() {
    this.transport.removeAllListeners('data');
    this.transport.removeAllListeners('crcError');
    this.transport.removeAllListeners('framingError');
    this.transport.removeAllListeners('escapeError');
    this.transport.close();
  }

  enterPairMode() {
    this.pairMode = true;
    let frame = new Buffer([3, 0x03, 0x01]);
    this.frameBuffer.push(frame);
    this.sendNow();
  }

  exitPairMode() {
    this.pairMode = false;
    let frame = new Buffer([3, 0x03, 0x00]);
    this.frameBuffer.push(frame);
    this.sendNow();
  }

  getMode() {
    return this.pairMode ? 'pair' : 'normal';
  }

  handlePairMode(data: Buffer) {
    if(data.length < 4) return log.error('Forwarder: got message with not enough data');
    let lqi = data[0];
    let rssi = data[1];
    let len = data[2];
    let msgType = data[3];
    if(msgType !== 0x03) {
      if(msgType === 0x00) {
        // NACK
        //console.log("NACK");
        this.readyToSend = true;
        clearTimeout(this.ackTimeout);
        this.sendNow(); // Send any remaining messages
      }
      else if(msgType === 0x01) {
        // ACK
        //console.log("ACK");
        this.readyToSend = true;
        clearTimeout(this.ackTimeout);
        this.sendNow(); // Send any remaining messages
      }
      else return log.error('Forwarder: bad forwarder msg type');
      return;
    } 
    // Parse PAIR REQ
    if(data.length < 10) return log.error('Forwarder: got message with not enough data');
    let ctrl = data[4];
    if(ctrl !== 0x02) return log.error('Forwarder: bad message');
    let addr = data.readUInt16LE(5);
    if(addr !== 0) return log.error('Forwarder: bad address for pair mode');
    //let len = data[7];
    let paircmd = data [8];
    if(paircmd !== PAIR_CMD) return log.warn("Bad cmd on pair message");

    let randomId = data[9]; // For managin when multiple devices try to pair, temporal "addressing"

    // Assing address and send
    let newAddr = this.db.getNextDeviceAddress();
    if(newAddr == null || isNaN(newAddr)) return log.warn("WARNING: Max registered devices reached...");
    // Create empty device for occupying the new address
    let device = {
      address: newAddr,
      connected: false,
      state: 'disconnected',
      waitingPingres: false,
      lqi: 0,
      rssi: 0,
      duration: 10,
      lastSeen: new Date(),
      willTopic: null,
      willMessage: null,
      willQoS: null,
      willRetain: null
    };
    this.db.setDevice(device);

    // PAIR RES
    let frame = Buffer.from([7, 0x03, 0x03, 0x00, 0x00, 21, 0x03, randomId, newAddr, this.pan]);
    let key = Buffer.from(this.key);
    frame = Buffer.concat([frame, key]);
    //console.log("Pair RES:", frame);
    this.frameBuffer.push(frame);
    this.sendNow();

    this.exitPairMode();

    this.emit("devicePaired", device);
  }

  send(addr: number, packet: Buffer) {
    // Dont allow sending any message out of pair messages in pair mode
    if(this.pairMode) return false;

    // Check for max buffer allowed
    if(this.frameBuffer.length >= MAX_BUFFER_ALLOWED) {
      log.trace('Forwarder buffer full, packet dropped');
      this.sendNow();
      return false;
    }

    // len, msgType, ctrl, addrL, addrH, mqttsnpacket
    let addrL = (addr) & 0xFF;
    let addrH = (addr>>8) & 0xFF;
    let frame = new Buffer([5, 0xFE, 1, addrL, addrH]);
    frame = Buffer.concat([frame, packet]);
    this.frameBuffer.push(frame);
    this.sendNow();

    return true;
  }

  sendNow() {
    if(!this.readyToSend) return;
    let frame = this.frameBuffer.shift();
    if(typeof(frame) === 'undefined') return;
    this.readyToSend = false;
    this.transport.write(frame);
    this.ackTimeout = setTimeout( () => {
        this.readyToSend = true;
        this.sendNow(); // Make sure any pending messages are sent
      }, ACKTIMEOUT);
  }

  sendConfig() {
    let frame = Buffer.from([19, CONFIG_CMD, this.pan]);
    let key = Buffer.from(this.key);
    frame = Buffer.concat([frame, key])
    log.trace("Sending config:", frame);
    this.frameBuffer.push(frame);
    this.sendNow();
  }

}
