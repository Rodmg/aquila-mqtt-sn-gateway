import * as commander from 'commander';
import { EventEmitter } from 'events';

declare module 'mqtt' {
  export interface Client extends EventEmitter {
    connected: boolean;
  }
}

declare module 'commander' {
    export interface IExportedCommand extends commander.ICommand {
        verbose?: string; 
        transport?: string;
        port?: string;
        broker?: string;
        allowUnknownDevices?: boolean;
        subnet?: number;
        key?: number[];
        dataPath?: string;
        monitorPrefix?: string;
    }
}

declare module 'serialport' {
  export class SerialPort {
    open(callback?: (err?: any) => void): void;
  }
}