declare namespace mqtt {
  interface Client extends EventEmitter {
    connected: boolean;
  }
}