import { EventEmitter } from 'events';

export interface DBInterface {
  destructor();
  connect(): Promise<void>;
  setDevice(device);
  getDeviceByAddr(addr: number);
  getDeviceById(id: number);
  getAllDevices();
  getNextDeviceAddress();
  getAllTopics();
  setTopic(deviceIdOrAddress: any, topic: string, topicId?: number, type?: string);
  getTopic(deviceIdOrAddress: any, idOrName: any);
  getTopicsFromDevice(deviceIdOrAddress: any);
  getAllSubscriptions();
  setSubscription(deviceIdOrAddress: any, topicIdOrName: any, qos: number);
  getSubscriptionsFromTopic(topicName: string);
  getSubscriptionsFromDevice(deviceIdOrAddress: any);
  removeSubscriptionsFromDevice(deviceIdOrAddress: any);
  removeSubscription(deviceIdOrAddress: any, topicName: string, topicType: string);
  pushMessage(message: any);
  popMessagesFromDevice(deviceId: number);
}

export interface TransportInterface extends EventEmitter {
  connect(): Promise<void>;
  close(callback?: Function);
  write(data: any);
  writeNow();
}
