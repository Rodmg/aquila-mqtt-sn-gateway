import * as commander from 'commander';

declare namespace commander {
    interface IExportedCommand extends commander.ICommand {
        verbose?: string; 
        transport?: string;
        port?: string;
        broker?: string;
        allowUnknownDevices?: string;
        subnet?: string;
        key?: string;
        dataPath?: string;
        monitorPrefix?: string;
    }
}