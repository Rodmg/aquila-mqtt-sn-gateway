import { EventEmitter } from 'events';

export interface DBInterface {
  destructor();
  connect(): Promise<void>;
  setDevice(device): Promise<any>;
  removeDevice(device: any): Promise<boolean>;
  getDeviceByAddr(addr: number): Promise<any>;
  getDeviceById(id: number): Promise<any>;
  getAllDevices(): Promise<any>;
  getNextDeviceAddress(): Promise<any>;
  getAllTopics(): Promise<any>;
  setTopic(deviceIdOrAddress: any, topic: string, topicId?: number, type?: string): Promise<any>;
  getTopic(deviceIdOrAddress: any, idOrName: any): Promise<any>;
  getTopicsFromDevice(deviceIdOrAddress: any): Promise<any>;
  getAllSubscriptions(): Promise<any>;
  setSubscription(deviceIdOrAddress: any, topicIdOrName: any, qos: number): Promise<any>;
  getSubscriptionsFromTopic(topicName: string): Promise<any>;
  getSubscriptionsFromDevice(deviceIdOrAddress: any): Promise<any>;
  removeSubscriptionsFromDevice(deviceIdOrAddress: any): Promise<any>;
  removeSubscription(deviceIdOrAddress: any, topicName: string, topicType: string): Promise<any>;
  pushMessage(message: any): Promise<any>;
  popMessagesFromDevice(deviceId: number): Promise<any>;
}

export interface TransportInterface extends EventEmitter {
  connect(): Promise<void>;
  close(callback?: Function);
  write(data: any);
  writeNow();
}
