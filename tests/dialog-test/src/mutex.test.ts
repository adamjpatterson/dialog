import { test, suite } from "node:test";
import * as assert from "node:assert/strict";
import { Mutex } from "../../../dist/commons/mutex.js";

const deferred = <T>(): { promise: Promise<T>; resolve: (value: T) => void } => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

await suite("Mutex", async () => {
  await test("runs the first call immediately and queues later calls in order.", async () => {
    const mutex = new Mutex();
    const releaseFirst = deferred<void>();
    const events: string[] = [];

    const first = mutex.call("work", async () => {
      events.push("first:start");
      await releaseFirst.promise;
      events.push("first:end");
      return "first";
    });
    const second = mutex.call("work", async () => {
      events.push("second");
      return "second";
    });
    const third = mutex.call("work", async () => {
      events.push("third");
      return "third";
    });

    await Promise.resolve();
    assert.deepStrictEqual(events, ["first:start"]);
    releaseFirst.resolve();

    assert.strictEqual(await first, "first");
    assert.strictEqual(await second, "second");
    assert.strictEqual(await third, "third");
    assert.deepStrictEqual(events, ["first:start", "first:end", "second", "third"]);
  });

  await test("keeps different marks independent.", async () => {
    const mutex = new Mutex();
    const release = deferred<void>();
    const events: string[] = [];

    const first = mutex.call("one", async () => {
      events.push("one:start");
      await release.promise;
      events.push("one:end");
    });
    const second = mutex.call("two", async () => {
      events.push("two");
    });

    await second;
    assert.deepStrictEqual(events, ["one:start", "two"]);
    release.resolve();
    await first;
  });

  await test("releases a mark when the protected call rejects.", async () => {
    const mutex = new Mutex();
    await assert.rejects(mutex.call("work", async () => Promise.reject(new Error("failure"))), /failure/);

    let called = false;
    await mutex.call("work", async () => {
      called = true;
    });
    assert.strictEqual(called, true);
  });

  await test("rejects calls that exceed the configured queue size.", async () => {
    const mutex = new Mutex({ queueSizeLimit: 1 });
    const release = deferred<void>();

    const first = mutex.call("work", async () => release.promise);
    const second = mutex.call("work", async () => undefined);
    await assert.rejects(mutex.call("work", async () => undefined), /Queue size limit exceeded for work/);

    release.resolve();
    await Promise.all([first, second]);
  });
});
