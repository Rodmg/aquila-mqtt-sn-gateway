import * as DataTypes from 'sequelize';
import { db } from './../db';
import { Device } from './Device';
import { Topic } from './Topic';

export const Message = db.define('message', {
  id: {
    type: DataTypes.INTEGER(10).UNSIGNED,
    allowNull: false,
    primaryKey: true,
    autoIncrement: true
  },
  message: {
    type: DataTypes.STRING,
    allowNull: false
  },
  msgId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  dup: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  retain: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  qos: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  topicIdType: {
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
        topic: {
          type: 'belongsTo',
          model: Topic,
          as: 'topic',
          hooks: true
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
    }
  }
});