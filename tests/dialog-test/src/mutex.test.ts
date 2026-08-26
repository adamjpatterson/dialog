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
    const releaseFirst = deferred<undefined>();
    const events: string[] = [];

    const first = mutex.call("work", async () => {
      events.push("first:start");
      await releaseFirst.promise;
      events.push("first:end");
      return "first";
    });
    const second = mutex.call("work", () => {
      events.push("second");
      return Promise.resolve("second");
    });
    const third = mutex.call("work", () => {
      events.push("third");
      return Promise.resolve("third");
    });

    await Promise.resolve();
    assert.deepStrictEqual(events, ["first:start"]);
    releaseFirst.resolve(undefined);

    assert.strictEqual(await first, "first");
    assert.strictEqual(await second, "second");
    assert.strictEqual(await third, "third");
    assert.deepStrictEqual(events, ["first:start", "first:end", "second", "third"]);
  });

  await test("keeps different marks independent.", async () => {
    const mutex = new Mutex();
    const release = deferred<undefined>();
    const events: string[] = [];

    const first = mutex.call("one", async () => {
      events.push("one:start");
      await release.promise;
      events.push("one:end");
    });
    const second = mutex.call("two", () => {
      events.push("two");
      return Promise.resolve();
    });

    await second;
    assert.deepStrictEqual(events, ["one:start", "two"]);
    release.resolve(undefined);
    await first;
  });

  await test("releases a mark when the protected call rejects.", async () => {
    const mutex = new Mutex();
    await assert.rejects(mutex.call("work", () => Promise.reject(new Error("failure"))), /failure/);

    let called = false;
    await mutex.call("work", () => {
      called = true;
      return Promise.resolve();
    });
    assert.strictEqual(called, true);
  });

  await test("rejects calls that exceed the configured queue size.", async () => {
    const mutex = new Mutex({ queueSizeLimit: 1 });
    const release = deferred<undefined>();

    const first = mutex.call("work", () => release.promise);
    const second = mutex.call("work", () => Promise.resolve());
    await assert.rejects(mutex.call("work", () => Promise.resolve()), /Queue size limit exceeded for work/);

    release.resolve(undefined);
    await Promise.all([first, second]);
  });
});
