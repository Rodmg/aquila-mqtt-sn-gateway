// SerialTransport.js

import * as SerialPort from 'serialport';
import * as Slip from 'node-slip';
import { EventEmitter } from 'events';
import { calcCrc, checkCrc } from './CrcUtils';
import { TransportInterface } from './interfaces';

export class SerialTransport extends EventEmitter implements TransportInterface {

  fake: boolean = false;
  // Serial port write buffer control
  writing: boolean = false;
  writeBuffer: Array<any> = [];

  parser: any;
  serialPort: SerialPort;

  constructor(baudrate: number, port: string) {
    super();

    const receiver = {
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

  connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.serialPort.open((err: any) => {
        if(err) {
          this.emit("error", err);
          return reject(err);
        }
        return resolve(null);
      });
    });
  }

  close(callback: Function) {
    if(!callback) callback = function(){};
    this.serialPort.flush((err) => {
      if(err) return callback(err);
      this.serialPort.drain((err) => {
        if(err) return callback(err);
        this.serialPort.close( () => callback() );
      });
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
