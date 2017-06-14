
import * as path from'path';
import * as fs from'fs';
import { DBInterface } from './interfaces';
import { Device } from './models/Device';
import { Message } from './models/Message';
import { Subscription } from './models/Subscription';
import { Topic } from './models/Topic';
import { log } from './Logger';
import * as _ from 'lodash';

import { setupDB } from './db';

export class GatewayDB implements DBInterface {

  dataPath: string;

  constructor(dataPath: string) {
    // Create directory if not exists
    let dataDir = path.dirname(dataPath)
    if(!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }

    this.dataPath = dataPath;
  }

  destructor() {

  }

  connect(): Promise<void> {
    return setupDB()
      .then(() => {
        // Mark all devices as disconnected and waitingPingres: false on startup
        return Device.update({
          connected: false,
          waitingPingres: false,
          state: 'disconnected'
        }, {
          where: { connected: true }
        });
      });
  }

  // update or create, use for adding wills etc.
  setDevice(device): Promise<any> {
    return Promise.resolve(
      Device.findOne({ where: { $or: [ { address: device.address }, { id: device.id } ] } })
      .then((result) => {
        // Create new if not found
        if(!result) return Device.create(device);
        // else update
        if(device.dataValues != null) device = device.dataValues; // Support instance or object only
        return result.update(device);
      })
    );
  }

  getDeviceByAddr(addr: number): Promise<any> {
    return Promise.resolve(Device.findOne({ where: { address: addr } }));
  }

  getDeviceById(id: number): Promise<any> {
    return Promise.resolve(Device.findOne({ where: { id: id } }));
  }

  getAllDevices(): Promise<any> {
    return Promise.resolve(Device.findAll());
  }

  getNextDeviceAddress(): Promise<any> {
    return Promise.resolve(Device.findAll({ order: [['address', 'ASC']] })
    .then((found) => {
      found = found.map((item) => {
        return item.address;
      });
      let nextIndex = null;

      // Special case when there are no previous devices registered
      if(found.length === 0) return 1;

      // Find lower unused address
      for(let i = 0; i < found.length; i++) {
        let current = found[i];
        let prev = 0;
        if(i != 0) prev = found[i - 1];
        if(current > prev + 1) {
          // Found discontinuity, return next value inside discontinuity
          nextIndex = prev + 1;
          return nextIndex;
        }
      }
      // If we reached here, there is no discontinuity, return next value if available
      nextIndex = found[found.length - 1] + 1;
      // Forbidden addresses, 0xF0 is the bridge
      if(nextIndex > 0xFE || nextIndex === 0xF0) return null;
      return nextIndex;
    }));
  }

  getNextTopicId(deviceId: number): Promise<any> {
    return Promise.resolve(Topic.findAll({ where: { deviceId: deviceId }, order: [['mqttId', 'ASC']] })
      .then((found) => {
        found = found.map((item) => {
          return item.address;
        });

        let nextIndex = null;

        // Special case when there are no previous topics registered
        if(found.length === 0) return 1;
        // Find lower unused address
        for(let i = 0; i < found.length; i++) {
          let current = found[i];
          let prev = 0;
          if(i != 0) prev = found[i - 1];
          if(current > prev + 1) {
            // Found discontinuity, return next value inside discontinuity
            nextIndex = prev + 1;
            return nextIndex;
          }
        }
        // If we reached here, there is no discontinuity, return next value if available
        nextIndex = found[found.length - 1] + 1;
        // Max id is 255
        if(nextIndex > 0xFF) throw new Error("Max topics reached for device");
        return nextIndex;
      }));
  }

  getAllTopics(): Promise<any> {
    return Promise.resolve(Topic.findAll());
  }

  // update or create topic
  setTopic(deviceId: number, topic: string, topicId?: number, type?: string): Promise<any> {
    if(type == null) type = 'normal';  // default

    return Promise.resolve(
      Topic.findOne({ where: { deviceId: deviceId, $or: [ { id: topicId }, { name: topic } ] } })
      .then((result) => {
        // Create if not found
        if(!result) return this.getNextTopicId(deviceId)
          .then((nextId: number) => {
            return Topic.create({
              deviceId: deviceId,
              mqttId: nextId,
              name: topic,
              type: type
            });
          });

        // else update
        let update: any = {
          name: topic
        };
        if(type != null) update.type = type;
        return result.update(update);
      })
    );
  }

  // {id: }, {name: } or {mqttId: }
  getTopic(deviceId: number, idOrName: any): Promise<any> {
    let query: any = {
      where: {
        deviceId: deviceId
      }
    }

    if(idOrName.id !== undefined) query.where.id = idOrName.id;
    if(idOrName.mqttId !== undefined) query.where.mqttId = idOrName.mqttId;
    if(idOrName.name !== undefined) query.where.name = idOrName.name;

    return Promise.resolve(Topic.findOne(query));  
  }

  getTopicsFromDevice(deviceId: number): Promise<any> {
    return Promise.resolve(Topic.findAll({ where: { deviceId: deviceId } }));
  }

  getAllSubscriptions(): Promise<any> {
    return Promise.resolve(Subscription.findAll({ include: [ { model: Topic, as: 'topic' } ] })); // TODO When changing in Gateway, item.topic = item.topic.name, item.device = item.deviceId
  }

  setSubscription(deviceId: number, topicName: string, qos: number): Promise<any> {
    if(qos == null) qos = 0;
    let results: any = {};
    return this.getTopic(deviceId, { name: topicName })
    .then((topic) => {
      // If no topic, create
      if(!topic) return this.setTopic(deviceId, topicName);
      return topic;
    })
    .then((topic) => {
      results.topic = topic;
      return Subscription.findOne({ where: { deviceId: deviceId, topicId: topic.id } });
    })
    .then((subscription) => {
      let sub = {
        deviceId: deviceId,
        topicId: results.topic.id, // TODO check?
        qos: qos
      };
      // If no subscription, create
      if(!subscription) return Subscription.create(sub);
      // Else update
      return subscription.update(sub);
    });
  }

  getSubscriptionsFromTopic(topicName: string): Promise<any> {
    return Promise.resolve(
      Topic.findOne({ where: { name: topicName }, include: [ {
        model: Subscription,
        as: 'subscriptions',
        include: [{ model: Topic, as: 'topic' }]
      }] })
      .then((result) => {
        if(result == null) return [];
        return result.subscriptions;
      })
    );
  }

  getSubscriptionsFromDevice(deviceId: number): Promise<any> {
    return Promise.resolve(
      Device.findOne({ where: { id: deviceId }, include: [ {
        model: Subscription,
        as: 'subscriptions',
        include: [ { model: Topic, as: 'topic' } ]
      }] })
      .then((result) => {
        if(result == null) return [];
        return result.subscriptions;
      })
    );  
  }

  removeSubscriptionsFromDevice(deviceId: number): Promise<any> {
    return Promise.resolve(
      Subscription.destroy({ where: { deviceId: deviceId } })
    );
  }

  removeSubscription(deviceId: number, topicName: string, topicType: string): Promise<any> {
    return Promise.resolve(
      Topic.findOne({ where: { name: topicName, deviceId: deviceId, type: topicType } })
      .then((topic) => {
        if(!topic) return false;
        return Promise.resolve(Subscription.destroy({ where: { deviceId: deviceId, topicId: topic.id } }));
      })
      .then((result) => {
        return true;
      })
    );
  }

  pushMessage(message: any): Promise<any> {
    return Promise.resolve(Message.create(message));
  }

  popMessagesFromDevice(deviceId: number): Promise<any> {
    if(deviceId == null) return Promise.resolve(false);

    let result = [];

    return Promise.resolve(Message.findAll({ where: { deviceId: deviceId }, include: [ { model: Topic, as: 'topic' } ] })
    .then((messages) => {
      result = messages;
      return Message.destroy({ where: { deviceId: deviceId } });
    })
    .then(() => {
      return result;
    }));
  }

}
