import { SerialTaskQueue } from './serial-task.queue';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

describe('SerialTaskQueue', () => {
  it('runs tasks one at a time in arrival order', async () => {
    const queue = new SerialTaskQueue();
    const events: string[] = [];
    const firstGate = deferred();

    const first = queue.run(async () => {
      events.push('first:start');
      await firstGate.promise;
      events.push('first:end');
      return 1;
    });
    const second = queue.run(async () => {
      events.push('second:start');
      return 2;
    });

    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    firstGate.resolve();

    await expect(first).resolves.toBe(1);
    await expect(second).resolves.toBe(2);
    expect(events).toEqual(['first:start', 'first:end', 'second:start']);
  });

  it('propagates a failure to its caller without blocking later tasks', async () => {
    const queue = new SerialTaskQueue();
    const failing = queue.run(async () => {
      throw new Error('boom');
    });
    const following = queue.run(async () => 'still runs');

    await expect(failing).rejects.toThrow('boom');
    await expect(following).resolves.toBe('still runs');
  });
});
