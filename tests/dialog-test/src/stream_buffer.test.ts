import { test, suite } from "node:test";
import * as assert from "node:assert/strict";
import { StreamBuffer } from "../../../dist/commons/stream_buffer.js";

const collect = async (buffer: StreamBuffer, chunks: (string | Buffer)[]): Promise<Buffer> => {
  for (const chunk of chunks) {
    buffer.write(chunk);
  }
  buffer.end();
  await new Promise<void>((resolve, reject) => {
    buffer.once("finish", resolve);
    buffer.once("error", reject);
  });
  return buffer.buffer;
};

await suite("StreamBuffer", async () => {
  await test("buffers string and Buffer chunks in order.", async () => {
    const buffer = new StreamBuffer();
    const result = await collect(buffer, ["hello ", Buffer.from("world"), "!"]);
    assert.strictEqual(result.toString("utf8"), "hello world!");
  });

  await test("uses the configured size limit.", async () => {
    const buffer = new StreamBuffer({ bufferSizeLimit: 5 });
    const error = new Promise<Error>((resolve) => buffer.once("error", resolve));
    buffer.end("abcdef");

    assert.match((await error).message, /Buffer size limit exceeded\./);
    assert.strictEqual(buffer.buffer.toString("utf8"), "abcdef");
  });

  await test("defaults to a one megabyte size limit.", async () => {
    const buffer = new StreamBuffer();
    const result = await collect(buffer, [Buffer.alloc(1_000_000)]);
    assert.strictEqual(result.length, 1_000_000);
  });

  await test("emits errors when a chunk exceeds the configured limit.", async () => {
    const buffer = new StreamBuffer({ bufferSizeLimit: -1 });
    const error = new Promise<Error>((resolve) => buffer.once("error", resolve));
    buffer.write("data");

    assert.match((await error).message, /Buffer size limit exceeded\./);
  });
});
