import * as DataTypes from 'sequelize';
import { db } from './../db';
import { Device } from './Device';
import { Topic } from './Topic';

export const Subscription = db.define('subscription', {
  id: {
    type: DataTypes.INTEGER(10).UNSIGNED,
    allowNull: false,
    primaryKey: true,
    autoIncrement: true
  },
  qos: {
    type: DataTypes.INTEGER,
    allowNull: true
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