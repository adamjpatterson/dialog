import { test, suite } from "node:test";
import * as assert from "node:assert/strict";
import { randomUUID, UUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { OpenAIAgent } from "../../../dist/implementations/agent/abstract/openai/openai_agent.js";
import { Message } from "../../../dist/interfaces/message/message.js";
import { VoIP, VoIPEvents } from "../../../dist/interfaces/voip/voip.js";
import { STT, STTEvents } from "../../../dist/interfaces/stt/stt.js";
import { TTS, TTSEvents } from "../../../dist/interfaces/tts/tts.js";

class FakeVoIP extends EventEmitter<VoIPEvents<never, never>> implements VoIP<never, never> {
  public posted: Message[] = [];
  public aborted: UUID[] = [];
  public disposed = 0;

  public post = (message: Message): void => {
    this.posted.push(message);
  };

  public abort = (uuid: UUID): void => {
    this.aborted.push(uuid);
  };

  public hangup = (): void => undefined;

  public transferTo = (tel: string): void => {
    void tel;
  };

  public dispose = (): void => {
    this.disposed += 1;
  };
}

class FakeSTT extends EventEmitter<STTEvents> implements STT {
  public posted: Message[] = [];
  public disposed = 0;

  public post = (message: Message): void => {
    this.posted.push(message);
  };

  public dispose = (): void => {
    this.disposed += 1;
  };
}

class FakeTTS extends EventEmitter<TTSEvents> implements TTS {
  public posted: Message[] = [];
  public aborted: UUID[] = [];
  public disposed = 0;

  public post = (message: Message): void => {
    this.posted.push(message);
  };

  public abort = (uuid: UUID): void => {
    this.aborted.push(uuid);
  };

  public dispose = (): void => {
    this.disposed += 1;
  };
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

class TestAgent extends OpenAIAgent<FakeVoIP> {
  public received: Message[] = [];
  public inferenceStarted = deferred<undefined>();
  public inferenceFinished = deferred<undefined>();
  public responseData = "deterministic response";
  public holdInference = false;
  public inferenceGate = deferred<undefined>();

  public inference = async (message: Message): Promise<void> => {
    this.received.push(message);
    this.inferenceStarted.resolve(undefined);
    this.tts.post({ uuid: message.uuid, data: this.responseData, done: true });
    if (this.holdInference) {
      await this.inferenceGate.promise;
    }
    this.inferenceFinished.resolve(undefined);
  };
}

const createAgent = (): { agent: TestAgent; voip: FakeVoIP; stt: FakeSTT; tts: FakeTTS } => {
  const voip = new FakeVoIP();
  const stt = new FakeSTT();
  const tts = new FakeTTS();
  const agent = new TestAgent({ voip, stt, tts, apiKey: "test-key", model: "test-model" });
  return { agent, voip, stt, tts };
};

const message = (data: string, uuid = randomUUID()): Message => ({ uuid, data, done: true });

await suite("OpenAIAgent orchestration", async () => {
  await test("forwards media, transcripts, agent responses, and synthesized audio.", async () => {
    const { agent, voip, stt, tts } = createAgent();
    agent.activate();
    const media = message("base64-audio", randomUUID());
    const transcript = message("hello from the caller");

    voip.emit("message", media);
    assert.deepStrictEqual(stt.posted, [media]);

    stt.emit("message", transcript);
    await agent.inferenceFinished.promise;
    assert.deepStrictEqual(agent.received, [transcript]);
    assert.deepStrictEqual(tts.posted, [
      { uuid: transcript.uuid, data: "deterministic response", done: true },
    ]);

    const audio = message("base64-synthesized-audio", transcript.uuid);
    tts.emit("message", audio);
    assert.deepStrictEqual(voip.posted, [audio]);
  });

  await test("ignores empty transcript messages.", async () => {
    const { agent, stt } = createAgent();
    agent.activate();

    stt.emit("message", message(""));
    await Promise.resolve();
    assert.deepStrictEqual(agent.received, []);
  });

  await test("aborts active output when speech activity is detected.", async () => {
    const { agent, stt, tts, voip } = createAgent();
    agent.holdInference = true;
    agent.activate();
    const transcript = message("interruptible request");

    stt.emit("message", transcript);
    await agent.inferenceStarted.promise;
    stt.emit("vad");

    assert.deepStrictEqual(tts.aborted, [transcript.uuid]);
    assert.deepStrictEqual(voip.aborted, [transcript.uuid]);
    agent.inferenceGate.resolve(undefined);
    await agent.inferenceFinished.promise;
  });

  await test("does not abort output after VoIP confirms dispatch.", async () => {
    const { agent, stt, tts, voip } = createAgent();
    agent.activate();
    const transcript = message("completed request");

    stt.emit("message", transcript);
    await agent.inferenceFinished.promise;
    voip.emit("message_dispatched", transcript.uuid);
    stt.emit("vad");

    assert.deepStrictEqual(tts.aborted, []);
    assert.deepStrictEqual(voip.aborted, []);
  });

  await test("disposes all components when a component emits an error.", () => {
    for (const source of ["voip", "stt", "tts"] as const) {
      const { agent, voip, stt, tts } = createAgent();
      agent.activate();
      const error = new Error(`${source} failure`);
      if (source == "voip") {
        voip.emit("error", error);
      } else if (source == "stt") {
        stt.emit("error", error);
      } else {
        tts.emit("error", error);
      }

      assert.strictEqual(voip.disposed, 1);
      assert.strictEqual(stt.disposed, 1);
      assert.strictEqual(tts.disposed, 1);
    }
  });

  await test("deactivate removes the orchestration listeners.", async () => {
    const { agent, voip, stt, tts } = createAgent();
    agent.activate();
    agent.deactivate();

    const media = message("base64-audio");
    voip.emit("message", media);
    stt.emit("message", message("caller transcript"));
    stt.emit("vad");
    tts.emit("message", message("synthesized audio"));

    await Promise.resolve();
    assert.deepStrictEqual(stt.posted, []);
    assert.deepStrictEqual(agent.received, []);
    assert.deepStrictEqual(tts.aborted, []);
    assert.deepStrictEqual(voip.posted, []);
  });
});
