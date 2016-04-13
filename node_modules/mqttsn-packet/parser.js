'use strict';

var bl        = require('bl'),
    inherits  = require('util').inherits,
    EE        = require('events').EventEmitter,
    Packet    = require('./packet'),
    constants = require('./constants');

function Parser(opts) {
  if (!(this instanceof Parser)) {
    return new Parser(opts);
  }
  
  opts = opts || {};

  this._list = bl();
  this._newPacket();

  this._states = [
    '_parseHeader',
    '_parsePayload',
    '_newPacket'
  ];
  this._stateCounter = 0;
  this._isClient = opts.isClient || false;
}

inherits(Parser, EE);

Parser.prototype.parse = function parserParse(buf) {
  this._list.append(buf);

  while ((this.packet.length === 0 || this._list.length > 0) &&
         this[this._states[this._stateCounter]]()) {
    this._stateCounter += 1;

    if (this._stateCounter >= this._states.length) {
      this._stateCounter = 0;
    }
  }
  return this._list.length;
};

Parser.prototype._newPacket = function parserNewPacket() {
  if (this.packet) {
    this._list.consume(this.packet.length);
    delete this.packet.length;
    this.emit('packet', this.packet);
  }

  this.packet = new Packet();

  return true;
};

Parser.prototype._parseHeader = function parserParseHeader() {
  var header = this._parseHeaderInternal(0);
  if (header === null) {
    return false;
  }

  this.packet.length = header.length;
  this.packet.cmd = constants.types[header.cmdCode];

  this._list.consume(header.headerLength);

  return true;
};

Parser.prototype._parseHeaderInternal = function parserParseHeaderInternal(pos) {
  var length = this._list.readUInt8(pos),
      cmdCodeOffset = 1;
  if (length === 0x01) {
    if (this._list.length < (pos + 4)) {
      return null;
    }
    
    length = this._list.readUInt16BE(pos + 1);
    cmdCodeOffset = 3;
  } else if (this._list.length < 2) {
    return null;
  }
  
  var cmdCode = this._list.readUInt8(pos + cmdCodeOffset);
  return {
    length: length - (cmdCodeOffset + 1),
    headerLength: cmdCodeOffset + 1,
    cmdCode: cmdCode
  };
};

Parser.prototype._parsePayload = function parserParsePayload() {
  var result = false;
  
  if ((this.packet.length === 0) ||
      (this._list.length >= this.packet.length)) {
    
    if (this.packet.cmd !== 'Encapsulated message') {
      switch (this.packet.cmd) {
        case 'advertise':
          this._parseAdvertise();
          break;
        case 'searchgw':
          this._parseSearchGW();
          break;
        case 'gwinfo':
          this._parseGWInfo();
          break;
        case 'connect':
          this._parseConnect();
          break;
        case 'connack':
        case 'willtopicresp':
        case 'willmsgresp':
          this._parseRespReturnCode();
          break;
        case 'willtopicupd':
        case 'willtopic':
          this._parseWillTopic();
          break;
        case 'willmsg':
        case 'willmsgupd':
          this._parseWillMsg();
          break;
        case 'register':
          this._parseRegister();
          break;
        case 'regack':
          this._parseRegAck();
          break;
        case 'publish':
          this._parsePublish();
          break;
        case 'puback':
          this._parsePubAck();
          break;
        case 'pubcomp':
        case 'pubrec':
        case 'pubrel':
        case 'unsuback':
          this._parseMsgId();
          break;
        case 'unsubscribe':
        case 'subscribe':
          this._parseSubscribeUnsubscribe();
          break;
        case 'suback':
          this._parseSubAck();
          break;
        case 'pingreq':
          this._parsePingReq();
          break;
        case 'disconnect':
          this._parseDisconnect();
          break;
        case 'willtopicreq':
        case 'willmsgreq':
        case 'pingresp':
          // these are empty, nothing to do
          break;
        default:
          this.emit('error', new Error('command not supported'));
      }

      result = true;
    } else if (this.packet.cmd === 'Encasulated message') {
      result = this._parseEncapsulatedMsg();
    }
  }
  
  return result;
};

Parser.prototype._parseAdvertise = function parserParseAdvertise() {
  if (this.packet.length !== 3) {
    return this.emit('error', new Error('wrong packet length'));
  }
  
  this.packet.gwId = this._list.readUInt8(0);
  this.packet.duration = this._list.readUInt16BE(1);
};

Parser.prototype._parseSearchGW = function parserParseSearchGW() {
  if (this.packet.length !== 1) {
    return this.emit('error', new Error('wrong packet length'));
  }
  
  this.packet.radius = this._list.readUInt8(0);
};

Parser.prototype._parseGWInfo = function parserParseGWInfo() {
  if ((this._isClient && (this.packet.length < 2)) ||
      (!this._isClient && (this.packet.length !== 1))) {
    return this.emit('error', new Error('wrong packet length'));
  }
  
  this.packet.gwId = this._list.readUInt8(0);
  
  if (this._isClient) {
    var addLen = this._list.readUInt8(1);
    if (this.packet.length !== (2 + addLen)) {
      return this.emit('error', new Error('wrong packet length'));
    }
    
    this.packet.gwAdd = this._list.slice(2, this.packet.length);
  }  
};

Parser.prototype._parseConnect = function parserParseConnect() {
  if (this.packet.length < 4) {
    return this.emit('error', new Error('packet too short'));
  }
  
  if (!this._parseFlags(this._list.readUInt8(0))) { return; }
  if (this._list.readUInt8(1) !== constants.ID) {
    return this.emit('error', new Error('unsupported protocol ID'));
  }
  this.packet.duration = this._list.readUInt16BE(2);
  if (this.packet.length < 5) {
    if(this.packet.cleanSession) return; // Allow blank client id according to standard
    else this.emit('error', new Error('cannot read client ID'));
  }
  this.packet.clientId = this._list.toString('utf8', 4, this.packet.length);
  if (this.packet.clientId === null) {
    this.emit('error', new Error('cannot read client ID'));
  }
};

Parser.prototype._parseRespReturnCode = function parserParseRespReturnCode() {
  if (this.packet.length !== 1) {
    return this.emit('error', new Error('wrong packet length'));
  }
  
  this.packet.returnCode = this._parseReturnCode(this._list.readUInt8(0));
};

Parser.prototype._parseWillTopic = function parserParseWillTopic() {
  if (this.packet.length !== 0) {
    if (!this._parseFlags(this._list.readUInt8(0))) { return; }
    this.packet.willTopic = this._list.toString('utf8', 1, this.packet.length);
  }
};

Parser.prototype._parseWillMsg = function parserParseWillMsg() {
  this.packet.willMsg = this._list.toString('utf8', 0, this.packet.length);
};

Parser.prototype._parseRegister = function parserParseRegister() {
  if (this.packet.length < 4) {
    return this.emit('error', new Error('packet too short'));
  }
  
  this.packet.topicId = this._list.readUInt16BE(0);
  this.packet.msgId = this._list.readUInt16BE(2);
  this.packet.topicName = this._list.toString('utf8', 4, this.packet.length);
};

Parser.prototype._parseRegAck = function parserParseRegAck() {
  if (this.packet.length !== 5) {
    return this.emit('error', new Error('wrong packet length'));
  }
  
  this.packet.topicId = this._list.readUInt16BE(0);
  this.packet.msgId = this._list.readUInt16BE(2);
  this.packet.returnCode = this._parseReturnCode(this._list.readUInt8(4));
};

Parser.prototype._parsePublish = function parserParsePublish() {
  if (this.packet.length < 5) {
    return this.emit('error', new Error('packet too short'));
  }
  
  if (!this._parseFlags(this._list.readUInt8(0))) { return; }
  if (this.packet.topicIdType === 'short topic') {
    this.packet.topicId = this._list.toString('utf8', 1, 3);
  } else {
    this.packet.topicId = this._list.readUInt16BE(1);
  }
  this.packet.msgId = this._list.readUInt16BE(3);
  this.packet.payload = this._list.slice(5, this.packet.length);
};

Parser.prototype._parsePubAck = function parserParsePubAck() {
  if (this.packet.length !== 5) {
    return this.emit('error', new Error('wrong packet length'));
  }
  
  this.packet.topicId = this._list.readUInt16BE(0);
  this.packet.msgId = this._list.readUInt16BE(2);
  this.packet.returnCode = this._parseReturnCode(this._list.readUInt8(4));
};

Parser.prototype._parseMsgId = function parserParseMsgId() {
  if (this.packet.length !== 2) {
    return this.emit('error', new Error('wrong packet length'));
  }
  
  this.packet.msgId = this._list.readUInt16BE(0);
};

Parser.prototype._parseSubscribeUnsubscribe = function parserParseSubscribeUnsubscribe() {
  if (this.packet.length < 3) {
    return this.emit('error', new Error('packet too short'));
  }
  
  if (!this._parseFlags(this._list.readUInt8(0))) { return; }
  this.packet.msgId = this._list.readUInt16BE(1);
  
  switch (this.packet.topicIdType) {
    case 'short name':
      if (this.packet.length !== 5) {
        return this.emit('error', new Error('wrong packet length'));
      }
      this.packet.topicName = this._list.toString('utf8', 3, this.packet.length);
      break;
    case 'normal':
      this.packet.topicName = this._list.toString('utf8', 3, this.packet.length);
      break;
    case 'pre-defined':
      if (this.packet.length !== 5) {
        return this.emit('error', new Error('wrong packet length'));
      }
      this.packet.topicId = this._list.readUInt16BE(3);
      break;
  }
};
Parser.prototype._parseSubAck = function parserParseSubAck() {
  if (this.packet.length !== 6) {
    return this.emit('error', new Error('wrong packet length'));
  }
  
  if (!this._parseFlags(this._list.readUInt8(0))) { return; }
  this.packet.topicId = this._list.readUInt16BE(1);
  this.packet.msgId = this._list.readUInt16BE(3);
  this.packet.returnCode = this._parseReturnCode(this._list.readUInt8(5));
};

Parser.prototype._parsePingReq = function parserParsePingReq() {
  if (this.packet.length !== 0) {
    this.packet.clientId = this._list.toString('utf8', 0, this.packet.length);
  }
};

Parser.prototype._parseDisconnect = function parserParseDisconnect() {
  if (this.packet.length !== 0) {
    if (this.packet.length === 2) {
      this.packet.duration = this._list.readUInt16BE(0);
    } else  {
      this.emit('error', new Error('wrong packet length'));
    }
  }
};

Parser.prototype._parseEncapsulatedMsg = function parserParseEncapsulatedMsg() {
  if (this.packet.length < 1) {
    this.emit('error', new Error('packet too short'));
    return false;
  }
  
  var ctrl = this._list.readUInt8(0);
  this.packet.radius = ctrl & constants.RADIUS_MASK;
  this.packet.wirelessNodeId = this._list.toString('utf8', 1, this.packet.length);
  
  var header = this._parseHeaderInternal(this.packet.length);
  if (header === null) {
    return false;
  }
  if (header.cmdCode === constants.codes['Encapsulated message']) {
    this.emit('error', new Error('nested encapsulated message is not supported'));
  }
  if (this._list.length < (this.packet.length + header.length + header.headerLength)) {
    return false;
  }
  this.packet.length = this.packet.length + header.length + header.headerLength;
  this.packet.encapsulated = this._list.slice(this.packet.length, this.packet.length);
  
  return true;
};

Parser.prototype._parseReturnCode = function parserParseReturnCode(retCode) {
  return constants.return_types[retCode];
};

Parser.prototype._parseFlags = function parserParseFlags(flags) {
  var packet = this.packet,
      result = true;
  
  if ((packet.cmd === 'publish') ||
      (packet.cmd === 'subscribe')) {
    packet.dup = (flags & constants.DUP_MASK) === constants.DUP_MASK;
  }
  
  if ((packet.cmd === 'willtopic') ||
      (packet.cmd === 'publish') ||
      (packet.cmd === 'subscribe') ||
      (packet.cmd === 'suback')) {
    packet.qos = (flags & constants.QOS_MASK) >> constants.QOS_SHIFT;
  }
  
  if ((packet.cmd === 'willtopic') ||
      (packet.cmd === 'publish')) {
    packet.retain = (flags & constants.RETAIN_MASK) === constants.RETAIN_MASK;
  }
  if (packet.cmd === 'connect') {
    packet.will = (flags & constants.WILL_MASK) === constants.WILL_MASK;
    packet.cleanSession = (flags & constants.CLEAN_MASK) === constants.CLEAN_MASK;
  }
  if ((packet.cmd === 'publish') ||
      (packet.cmd === 'subscribe') ||
      (packet.cmd === 'unsubscribe')) {
    switch (flags & constants.TOPICIDTYPE_MASK) {
      case 0x00:
        packet.topicIdType = 'normal';
        break;
      case 0x01:
        packet.topicIdType = 'pre-defined';
        break;
      case 0x02:
        packet.topicIdType = 'short topic';
        break;
      default:
        this.emit('error', new Error('unsupported topic id type'));
        result = false;
    }
  }
  return result;
};

module.exports = Parser;
