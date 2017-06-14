import * as DataTypes from 'sequelize';
import { db } from './../db';
import { Device } from './Device';
import { Subscription } from './Subscription';
import { Message } from './Message';

export const Topic = db.define('topic', {
  id: {
    type: DataTypes.INTEGER(10).UNSIGNED,
    allowNull: false,
    primaryKey: true,
    autoIncrement: true
  },
  // mqttId: IMPORTANT, this is the id assigned to the topic PER DEVICE, its index is manually set in GatewayDB and is max 255.
  mqttId: {
    type: DataTypes.INTEGER.UNSIGNED,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('short name', 'normal', 'pre-defined'),
    allowNull: false,
    defaultValue: 'normal'
  }
}, {
  classMethods: {
    getAssociations: () => {
      return {     
        device: {
          type: 'belongsTo',
          model: Device,
          as: 'device',
          hooks: true
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
    beforeBulkDestroy(options: any, fn: Function) {
      options.individualHooks = true;
      fn();
    },
    beforeDestroy: function(topic: any) {
      return Promise.all([
          Subscription.destroy({ where: { topicId: topic.id } }),
          Message.destroy({ where: { topicId: topic.id } })
        ]);
    }
  }
});