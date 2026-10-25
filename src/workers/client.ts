// Promise-based calls into the engine worker.
import type { EngineRequest, EngineResult, WorkerMessage } from './protocol';

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  onProgress?: (p: number) => void;
}

class EngineClient {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();

  private get w(): Worker {
    if (!this.worker) {
      this.worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
        const msg = e.data;
        const p = this.pending.get(msg.id);
        if (!p) return;
        if ('progress' in msg) {
          p.onProgress?.(msg.progress);
          return;
        }
        this.pending.delete(msg.id);
        if (msg.ok) p.resolve(msg.result);
        else p.reject(new Error(msg.error));
      };
      this.worker.onerror = (e) => {
        for (const p of this.pending.values()) p.reject(new Error(e.message || 'Engine worker failed'));
        this.pending.clear();
        this.worker = null;
      };
    }
    return this.worker;
  }

  call<K extends EngineRequest['type']>(
    req: Extract<EngineRequest, { type: K }>,
    onProgress?: (p: number) => void,
  ): Promise<EngineResult[K]> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
      this.w.postMessage({ id, req });
    });
  }
}

export const engine = new EngineClient();
