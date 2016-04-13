'use strict';

var protocol = require('./constants');

function getReturnCode(returnType) {
  var returnCode = protocol.return_codes[returnType];
  if (returnCode !== undefined) {
    return returnCode;
  } else {
    return protocol.return_codes['Rejected: not supported'];
  }
}

function streamWriteLength(buffer, length) {
  if (length >= 256) {
    buffer.writeUInt8(1, 0);
    buffer.writeUInt16BE(length, 1);
    return 3;
  } else {
    buffer.writeUInt8(length, 0);
    return 1;
  }
}

function advertise(opts) {
  var gwId = opts.gwId || 0,
      duration = opts.duration || 60,
      result = new Buffer([5, protocol.codes.advertise, gwId, 0, 0]);
  result.writeUInt16BE(duration, 3);
  return result;
}

function searchGW(opts) {
  var radius = opts.radius || 0;

  return new Buffer([3, protocol.codes.searchgw, radius]);
}

function gwInfo(opts) {
  var gwId = opts.gwId || 0,
      gwAdd = opts.gwAdd,
      isClient = opts.isClient || false,
      length = 3,
      pos = 0,
      result;

  if (isClient) {
    length += 1;
    if (typeof gwAdd === 'string') {
      length += Buffer.byteLength(gwAdd);
    } else {
      length += gwAdd.length;
    }
  }
  result = new Buffer(length);
  pos = streamWriteLength(result, length);
  result.writeUInt8(protocol.codes.gwinfo, pos);
  pos += 1;
  result.writeUInt8(gwId, pos);
  pos += 1;
  if (isClient) {
    if (typeof gwAdd === 'string') {
      result.writeUInt8(Buffer.byteLength(gwAdd), pos);
      pos += 1;
      result.write(gwAdd, pos, 'utf8');
    } else {
      result.writeUInt8(gwAdd.length, pos);
      pos += 1;
      gwAdd.copy(result, pos);
    }
  }
  return result;
}

function connect(opts) {
  var flags = 0,
      duration = opts.duration || 0,
      length = 6 + Buffer.byteLength(opts.clientId),
      pos = 0,
      result = new Buffer(length);

  flags |= opts.will ? protocol.WILL_MASK : 0;
  flags |= opts.cleanSession ? protocol.CLEAN_MASK : 0;

  pos = streamWriteLength(result, length);
  result.writeUInt8(protocol.codes.connect, pos);
  pos += 1;
  result.writeUInt8(flags, pos);
  pos += 1;
  result.writeUInt8(protocol.ID, pos);
  pos += 1;
  result.writeUInt16BE(duration, pos);
  pos += 2;
  result.write(opts.clientId, pos, 'utf8');
  return result;
}

function respCode(opts) {
  var returnCode = getReturnCode(opts.returnCode);

  return new Buffer([3, protocol.codes[opts.cmd], returnCode]);
}

function request(opts) {
  return new Buffer([2, protocol.codes[opts.cmd]]);
}

function willtopic(opts) {
  var length = 2,
      pos = 0,
      result;
  if (opts.willTopic) {
    length = 3 + Buffer.byteLength(opts.willTopic);
  }
  result = new Buffer(length);
  pos = streamWriteLength(result, length);
  result.writeUInt8(protocol.codes[opts.cmd], pos);
  pos += 1;
  if (opts.willTopic) {
    var flags = 0,
        qos = opts.qos || 0,
        retain = opts.retain || false;
    flags |= (qos << protocol.QOS_SHIFT) & protocol.QOS_MASK;
    flags |= retain ? protocol.RETAIN_MASK : 0;

    result.writeUInt8(flags, pos);
    pos += 1;
    result.write(opts.willTopic, pos, 'utf8');
  }
  return result;
}

function willmsg(opts) {
  var willMsg = opts.willMsg || '',
      length = 2 + Buffer.byteLength(willMsg),
      pos = 0,
      result = new Buffer(length);

  pos = streamWriteLength(result, length);
  result.writeUInt8(protocol.codes[opts.cmd], pos);
  pos += 1;
  result.write(willMsg, pos, 'utf8');
  return result;
}

function register(opts) {
  var topicName = opts.topicName || '',
      topicId = opts.topicId || 0,
      msgId = opts.msgId || 0,
      length = 6 + Buffer.byteLength(topicName),
      result = new Buffer(length),
      pos = 0;

  pos = streamWriteLength(result, length);
  result.writeUInt8(protocol.codes.register, pos);
  pos += 1;
  result.writeUInt16BE(topicId, pos);
  pos += 2;
  result.writeUInt16BE(msgId, pos);
  pos += 2;
  result.write(topicName, pos, 'utf8');
  return result;
}

function regack(opts) {
  var topicId = opts.topicId || 0,
      msgId = opts.msgId || 0,
      retCode = getReturnCode(opts.returnCode),
      result = new Buffer([7, protocol.codes.regack, 0, 0, 0, 0, retCode]);

  result.writeUInt16BE(topicId, 2);
  result.writeUInt16BE(msgId, 4);
  return result;
}

function publish(opts) {
  var flags = 0,
      topicId = opts.topicId || 0,
      msgId = opts.msgId || 0,
      topicIdType = 0,
      length = 7,
      payload = opts.payload || '',
      pos = 0,
      result;

  if (typeof opts.payload === 'string') {
    length += Buffer.byteLength(payload);
  } else {
    length += payload.length;
  }

  flags |= opts.dup ? protocol.DUP_MASK : 0;
  flags |= ((opts.qos || 0) << protocol.QOS_SHIFT) & protocol.QOS_MASK;
  flags |= opts.retain ? protocol.RETAIN_MASK : 0;
  if (protocol.topicIdCodes[opts.topicIdType] === undefined) {
    throw new Error('Invalid topic Id Type');
  } else {
    topicIdType = opts.topicIdType;
    flags |= protocol.topicIdCodes[opts.topicIdType];
  }

  result = new Buffer(length);
  pos = streamWriteLength(result, length);
  result.writeUInt8(protocol.codes.publish, pos);
  pos += 1;
  result.writeUInt8(flags, pos);
  pos += 1;
  if ((topicIdType === 'short topic') && (typeof topicId === 'string')) {
    if (Buffer.byteLength(topicId) !== 2) {
      throw new Error('short topic must be exactly 2 bytes long');
    }
    result.write(topicId, pos, 'utf8');
  } else {
    result.writeUInt16BE(topicId, pos);
  }
  pos += 2;
  result.writeUInt16BE(msgId, pos);
  pos += 2;
  if (typeof payload === 'string') {
    result.write(result, pos, 'utf8');
  } else {
    payload.copy(result, pos);
  }
  return result;
}

function puback(opts) {
  var topicId = opts.topicId || 0,
      msgId = opts.msgId || 0,
      returnCode = getReturnCode(opts.returnCode),
      result = new Buffer([7, protocol.codes.puback, 0, 0, 0, 0, returnCode]);
  result.writeUInt16BE(topicId, 2);
  result.writeUInt16BE(msgId, 4);
  return result;
}

function pubcomp(opts) {
  var msgId = opts.msgId || 0,
      result = new Buffer([4, protocol.codes[opts.cmd], 0, 0]);
  result.writeUInt16BE(msgId, 2);
  return result;
}

function subscribe(opts) {
  var length = 5,
      flags = 0,
      msgId = opts.msgId || 0,
      topicIdCode,
      topicId = opts.topicId,
      topicName = opts.topicName,
      result,
      pos = 0;

  flags |= opts.dup ? protocol.DUP_MASK : 0;
  flags |= ((opts.qos || 0) << protocol.QOS_SHIFT) & protocol.QOS_MASK;

  if (topicName) {
    if (typeof topicName !== 'string') {
      throw new Error('topicName must be of type string');
    }
    length += Buffer.byteLength(topicName);
  } else {
    if (protocol.topicIdCodes[opts.topicIdType] === undefined) {
      throw new Error('Invalid topic Id Type');
    }
    flags |= protocol.topicIdCodes[opts.topicIdType];
    length += 2;
  }
  result = new Buffer(length);
  pos = streamWriteLength(result, length);
  result.writeUInt8(protocol.codes[opts.cmd], pos);
  pos += 1;
  result.writeUInt8(flags, pos);
  pos += 1;
  result.writeUInt16BE(msgId, pos);
  pos += 2;
  if (topicName) {
    result.write(topicName, pos, 'utf8');
  } else {
    if ((typeof topicId === 'string') && (Buffer.byteLength(topicId) !== 2)) {
      throw new Error('short topic must be exactly 2 bytes long');
    }

    result.writeUInt16BE(topicId, pos);
  }
  return result;
}

function suback(opts) {
  var flags = 0,
      topicId = opts.topicId || 0,
      msgId = opts.msgId || 0,
      returnCode = getReturnCode(opts.returnCode),
      result;

  flags |= ((opts.qos || 0) << protocol.QOS_SHIFT) & protocol.QOS_MASK;
  result = new Buffer([8, protocol.codes.suback, flags, 0, 0, 0, 0, returnCode]);
  result.writeUInt16BE(topicId, 3);
  result.writeUInt16BE(msgId, 5);
  return result;
}

function pingreq(opts) {
  var length = 2,
      result,
      pos = 0;
  if (opts.clientId) {
    length += Buffer.byteLength(opts.clientId);
  }
  result = new Buffer(length);
  pos = streamWriteLength(result, length);
  result.writeUInt8(protocol.codes.pingreq, pos);
  pos += 1;
  if (opts.clientId) {
    result.write(opts.clientId, pos, 'utf8');
  }
  return result;
}

function disconnect(opts) {
  var duration = opts.duration || 0,
      result = new Buffer([4, protocol.codes.disconnect, 0, 0]);
  result.writeUInt16BE(duration, 2);
  return result;
}

function generate(packet) {

  switch (packet.cmd) {
    case 'advertise':
      return advertise(packet);
    case 'searchgw':
      return searchGW(packet);
    case 'gwinfo':
      return gwInfo(packet);
    case 'connect':
      return connect(packet);
    case 'connack':
    case 'willtopicresp':
    case 'willmsgresp':
      return respCode(packet);
    case 'willtopicreq':
    case 'willmsgreq':
    case 'pingresp':
      return request(packet);
    case 'willtopic':
    case 'willtopicupd':
      return willtopic(packet);
    case 'willmsg':
    case 'willmsgupd':
      return willmsg(packet);
    case 'register':
      return register(packet);
    case 'regack':
      return regack(packet);
    case 'publish':
      return publish(packet);
    case 'puback':
      return puback(packet);
    case 'pubcomp':
    case 'pubrec':
    case 'pubrel':
    case 'unsuback':
      return pubcomp(packet);
    case 'unsubscribe':
    case 'subscribe':
      return subscribe(packet);
    case 'suback':
      return suback(packet);
    case 'pingreq':
      return pingreq(packet);
    case 'disconnect':
      return disconnect(packet);
    default:
      throw new Error('command not supported');
  }
}

module.exports = generate;
