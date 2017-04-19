"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const SerialPort = require("serialport");
const Slip = require("node-slip");
const events_1 = require("events");
const CrcUtils_1 = require("./CrcUtils");
class SerialTransport extends events_1.EventEmitter {
    constructor(baudrate, port) {
        super();
        this.fake = false;
        this.writing = false;
        this.writeBuffer = [];
        const receiver = {
            data: (input) => {
                let crcOk = CrcUtils_1.checkCrc(input);
                let data = input.slice(0, input.length - 2);
                if (crcOk) {
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
            baudRate: baudrate,
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
        return new Promise((resolve, reject) => {
            this.serialPort.open((err) => {
                if (err) {
                    this.emit("error", err);
                    return reject(err);
                }
                return resolve(null);
            });
        });
    }
    close(callback) {
        if (!callback)
            callback = function () { };
        this.serialPort.flush((err) => {
            if (err)
                return callback(err);
            this.serialPort.drain((err) => {
                if (err)
                    return callback(err);
                this.serialPort.close(() => callback());
            });
        });
    }
    write(data) {
        data = new Buffer(data);
        let crc = CrcUtils_1.calcCrc(data);
        let crcBuf = new Buffer(2);
        crcBuf.writeUInt16LE(crc, 0);
        let buffer = Buffer.concat([data, crcBuf]);
        let slipData = Slip.generator(buffer);
        this.writeBuffer.push(slipData);
        this.writeNow();
    }
    writeNow() {
        if (this.writeBuffer.length <= 0)
            return;
        if (this.writing)
            return;
        this.writing = true;
        if (this.fake) {
            this.writing = false;
            return;
        }
        this.serialPort.drain(() => {
            let data = this.writeBuffer.shift();
            this.serialPort.write(data);
            this.writing = false;
            if (this.writeBuffer.length > 0)
                this.writeNow();
        });
    }
}
exports.SerialTransport = SerialTransport;

//# sourceMappingURL=SerialTransport.js.map
