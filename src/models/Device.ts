import * as DataTypes from 'sequelize';
import { db } from './../db';
import { Message } from './Message';
import { Subscription } from './Subscription';
import { Topic } from './Topic';

export const Device = db.define('device', {
  id: {
    type: DataTypes.INTEGER(10).UNSIGNED,
    allowNull: false,
    primaryKey: true,
    autoIncrement: true
  },
  address: {
    type: DataTypes.INTEGER(10).UNSIGNED,
    allowNull: false
  },
  connected: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  state: {
    type: DataTypes.ENUM('active', 'asleep', 'lost', 'awake', 'disconnected'),
    allowNull: false,
    defaultValue: 'disconnected'
  },
  waitingPingres: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  lqi: {
    type: DataTypes.INTEGER(10).UNSIGNED,
    allowNull: true
  },
  rssi: {
    type: DataTypes.INTEGER(10).UNSIGNED,
    allowNull: true
  },
  duration: {
    type: DataTypes.INTEGER(10).UNSIGNED,
    allowNull: false
  },
  lastSeen: {
    type: DataTypes.DATE,
    allowNull: true
  },
  willTopic: {
    type: DataTypes.STRING,
    allowNull: true
  },
  willMessage: {
    type: DataTypes.STRING,
    allowNull: true
  },
  willQoS: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  willRetain: {
    type: DataTypes.BOOLEAN,
    allowNull: true
  }
}, {
  classMethods: {
    getAssociations: () => {
      return {     
        topics: {
          type: 'hasMany',
          model: Topic,
          as: 'topics',
          constraints: false
        },
        subscriptions: {
          type: 'hasMany',
          model: Subscription,
          as: 'subscriptions',
          constraints: false
        },
        messages: {
          type: 'hasMany',
          model: Message,
          as: 'messages',
          constraints: false
        }
      }
    }
  },
  instanceMethods: {
  },
  hooks: {
    beforeBulkCreate(items: Array<any>, options: any, fn: Function) {
      options.individualHooks = true;
      fn();
    },
    // beforeCreate(device: any, options: any, fn: Function) {
    //   Promise.all([device.generateUdid(), device.generateToken()])
    //     .then(() => {
    //       fn();
    //     })
    //     .catch(err => {
    //       fn(err);
    //     });
    // },
    beforeBulkDestroy(options: any, fn: Function) {
      options.individualHooks = true;
      fn();
    },
    beforeDestroy: function(device: any) {
      return Promise.all([
          Topic.destroy({ where: { deviceId: device.id } }),
          Subscription.destroy({ where: { deviceId: device.id } }),
          Message.destroy({ where: { deviceId: device.id } })
        ]);
    }
  }
});