
import { EventEmitter } from 'events';
import { log } from './Logger';
import * as mqttsn from 'mqttsn-packet';
import { Forwarder } from './Forwarder';

const MAX_RETRIES = 3;
const TIMEOUT = 1000;

export interface PublishMessage {
  topicIdType: string;
  qos: number;
  retain: boolean;
  topicId: number,
  payload: Buffer
}

export interface MsgBufItem {
  message: PublishMessage,
  addr: number,
  retries: number,
  msgId: number
}

export class QoSSender extends EventEmitter {

  forwarder: Forwarder;
  msgBuffer: Array<MsgBufItem>;

  constructor(forwarder: Forwarder) {
    super();

    this.forwarder = forwarder;
    this.msgBuffer = [];
  }

  generateMsgId(): number {
    let ids: Array<number> = this.msgBuffer.map((item: MsgBufItem) => {
      return item.msgId;
    });
    ids.sort(function(a, b) { return a - b });

    let nextIndex = null;

    // Special case when there are no previous msgs registered
    if(ids.length === 0) return 1;
    // Find lower unused address
    for(let i = 0; i < ids.length; i++) {
      let current = ids[i];
      let prev = 0;
      if(i != 0) prev = ids[i - 1];
      if(current > prev + 1) {
        // Found discontinuity, return next value inside discontinuity
        nextIndex = prev + 1;
        return nextIndex;
      }
    }
    // If we reached here, there is no discontinuity, return next value if available
    nextIndex = ids[ids.length - 1] + 1;
    // Max id is 0xFFFF according to MQTT-SN spec
    if(nextIndex > 0xFFFF) throw new Error("Max msgid reached");
    return nextIndex;
  }

  send(addr: number, message: PublishMessage): Promise<boolean> {
    if(message.qos === 1) return this.sendQoS1(addr, message);
    else if(message.qos === 2) return this.sendQoS2(addr, message);
    else return this.sendQoS0(addr, message);
  }

  sendQoS0(addr: number, message: PublishMessage): Promise<boolean> {
    let packet = mqttsn.generate({ cmd: 'publish', 
                          topicIdType: message.topicIdType, 
                          dup: false, 
                          qos: message.qos, 
                          retain: message.retain, 
                          topicId: message.topicId,
                          msgId: 0,
                          payload: message.payload });
    this.forwarder.send(addr, packet);
    return Promise.resolve(true);
  }

  sendQoS1(addr: number, message: PublishMessage): Promise<boolean> {
    let msgId = this.generateMsgId();
    this.msgBuffer.push({
      message: message,
      addr: addr,
      retries: 0,
      msgId: msgId
    });

    return new Promise((resolve, reject) => {
      let resTopic = `puback-${msgId}`;
      let tout = null;
      let confirmCb = (data) => {
        if(tout) {
          clearTimeout(tout);
          this.removeListener(resTopic, confirmCb);
          this.popMsg(msgId);
          return resolve(true);
        }
      };

      let prepareTimeout = () => {
        tout = setTimeout(() => {
          tout = null;
          let msg = this.getMsg(msgId);
          if(msg.retries >= MAX_RETRIES) {
            this.removeListener(resTopic, confirmCb);
            this.popMsg(msgId);
            return reject(new Error('QOS1 send timeout'));
          }
          msg.retries++;
          prepareTimeout();
          // Retry
          let packet = mqttsn.generate({ cmd: 'publish', 
                          topicIdType: message.topicIdType, 
                          dup: true, 
                          qos: 1, 
                          retain: message.retain, 
                          topicId: message.topicId,
                          msgId: msgId,
                          payload: message.payload });
          this.forwarder.send(addr, packet);
        }, TIMEOUT);
      };

      prepareTimeout();
      
      this.once(resTopic, confirmCb);

      let packet = mqttsn.generate({ cmd: 'publish', 
                          topicIdType: message.topicIdType, 
                          dup: false, 
                          qos: 1, 
                          retain: message.retain, 
                          topicId: message.topicId,
                          msgId: msgId,
                          payload: message.payload });
      this.forwarder.send(addr, packet);
    });

  }

  sendQoS2(addr: number, message: PublishMessage): Promise<boolean> {
    let msgId = this.generateMsgId();
    this.msgBuffer.push({
      message: message,
      addr: addr,
      retries: 0,
      msgId: msgId
    });

    return new Promise((resolve, reject) => {
      let resTopic = `pubrec-${msgId}`;
      let tout = null;
      let confirmCb = (data) => {
        if(tout) {
          clearTimeout(tout);
          this.removeListener(resTopic, confirmCb);
          this.popMsg(msgId);

          let frame = mqttsn.generate({ cmd: 'pubrel', msgId: msgId });
          this.forwarder.send(addr, frame);
          // Should wait for PUBCOMP, but we just dont mind... TODO implement?

          return resolve(true);
        }
      };

      let prepareTimeout = () => {
        tout = setTimeout(() => {
          tout = null;
          let msg = this.getMsg(msgId);
          if(msg.retries >= MAX_RETRIES) {
            this.removeListener(resTopic, confirmCb);
            this.popMsg(msgId);
            return reject(new Error('QOS2 send timeout'));
          }
          msg.retries++;
          prepareTimeout();
          // Retry
          let packet = mqttsn.generate({ cmd: 'publish', 
                          topicIdType: message.topicIdType, 
                          dup: true, 
                          qos: 2, 
                          retain: message.retain, 
                          topicId: message.topicId,
                          msgId: msgId,
                          payload: message.payload });
          this.forwarder.send(addr, packet);
        }, TIMEOUT);
      };

      prepareTimeout();
      
      this.once(resTopic, confirmCb);

      let packet = mqttsn.generate({ cmd: 'publish', 
                          topicIdType: message.topicIdType, 
                          dup: false, 
                          qos: 2, 
                          retain: message.retain, 
                          topicId: message.topicId,
                          msgId: msgId,
                          payload: message.payload });
      this.forwarder.send(addr, packet);
    });
  }

  getMsg(msgId: number): MsgBufItem | null {
    for(let msg of this.msgBuffer) {
      if(msg.msgId === msgId) return msg;
    }
    return null;
  }

  popMsg(msgId: number): MsgBufItem | null {
    for(let msg of this.msgBuffer) {
      if(msg.msgId === msgId) {
        var i = this.msgBuffer.indexOf(msg);
        if(i != -1) {
          this.msgBuffer.splice(i, 1);
        }
        console.log(this.msgBuffer);
        return msg;
      }
    }
    return null;
  }

  attendPuback(addr: number, packet: any) {
    let msgId = packet.msgId;
    console.log('puback', msgId);
    this.emit(`puback-${msgId}`, packet);
  }

  attendPubrec(addr: number, packet: any) {
    let msgId = packet.msgId;
    console.log('pubrec', msgId);
    this.emit(`pubrec-${msgId}`, packet);
  }

  attendPubcomp(addr: number, packet: any) {
    // Not currently used
    let msgId = packet.msgId;
    console.log('pubcomp', msgId);
    this.emit(`pubcomp-${msgId}`, packet);
  }

}