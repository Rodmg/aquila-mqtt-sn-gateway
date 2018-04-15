
import * as bunyan from 'bunyan';

export const log = bunyan.createLogger({ 
  name: 'aquila-gateway',
  level: 'trace'
});
