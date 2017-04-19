
import * as loki from 'lokijs';

declare global {
  interface LokiResultset<E> {
    find(): LokiResultset<E>;
  }
}