import type { Doc } from 'sharedb/lib/client';

export class OpListenersManager<T> {
  private opListeners: Map<string, { doc: Doc<T>; cleanup: () => void }> = new Map();
  private collection: string;

  constructor(collection: string) {
    this.collection = collection;
  }

  add(doc: Doc<T>, handler: (op: unknown[]) => void) {
    const listener = this.opListeners.get(doc.id);
    if (listener?.doc === doc) {
      return;
    }
    listener?.cleanup();

    doc.on('op batch', handler);
    this.opListeners.set(doc.id, {
      doc,
      cleanup: () => {
        doc.removeListener('op batch', handler);
        doc.listenerCount('op batch') === 0 && doc.destroy();
      },
    });
  }

  remove(doc: Doc<T>) {
    const listener = this.opListeners.get(doc.id);
    if (listener?.doc !== doc) {
      return;
    }
    listener.cleanup();
    this.opListeners.delete(doc.id);
  }

  clear() {
    this.opListeners.forEach(({ cleanup }) => cleanup());
    this.opListeners.clear();
  }
}
