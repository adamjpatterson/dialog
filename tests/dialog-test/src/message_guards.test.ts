import { test, suite } from "node:test";
import * as assert from "node:assert/strict";
import {
  isResultsMessage,
  isSpeechStartedMessage,
  isUtteranceEndMessage,
} from "../../../dist/implementations/stt/deepgram/types.js";
import {
  isCompletedWebSocketMessage,
  isConversationItemCreatedWebSocketMessage,
  isInputAudioTranscriptionDeltaWebSocketMessage,
  isSpeechStartedWebSocketMessage,
} from "../../../dist/implementations/stt/openai/types.js";
import {
  isChunkWebSocketMessage,
  isDoneWebSocketMessage,
  isErrorWebSocketMessage,
  isTimestampsWebSocketMessage,
} from "../../../dist/implementations/tts/cartesia/types.js";
import {
  isAudioOutputWebSocketMessage,
  isFinalOutputWebSocketMessage,
} from "../../../dist/implementations/tts/elevenlabs/types.js";
import {
  isCallMetadata,
  isMarkWebSocketMessage,
  isMediaWebSocketMessage,
  isRecordingStatus,
  isStartWebSocketMessage,
  isStopWebSocketMessage,
  isTranscriptStatus,
} from "../../../dist/implementations/voip/twilio/types.js";

await suite("Provider message guards", async () => {
  await test("recognizes Deepgram message types.", async () => {
    assert.strictEqual(isResultsMessage({ type: "Results" }), true);
    assert.strictEqual(isSpeechStartedMessage({ type: "SpeechStarted" }), true);
    assert.strictEqual(isUtteranceEndMessage({ type: "UtteranceEnd" }), true);
    assert.strictEqual(isResultsMessage({ type: "SpeechStarted" }), false);
  });

  await test("recognizes OpenAI transcription message types.", async () => {
    assert.strictEqual(isCompletedWebSocketMessage({ type: "conversation.item.input_audio_transcription.completed" }), true);
    assert.strictEqual(isSpeechStartedWebSocketMessage({ type: "input_audio_buffer.speech_started" }), true);
    assert.strictEqual(
      isInputAudioTranscriptionDeltaWebSocketMessage({ type: "conversation.item.input_audio_transcription.delta" }),
      true
    );
    assert.strictEqual(isConversationItemCreatedWebSocketMessage({ type: "conversation.item.created" }), true);
    assert.strictEqual(isCompletedWebSocketMessage({ type: "conversation.item.created" }), false);
  });

  await test("recognizes Cartesia message types.", async () => {
    const context_id = "00000000-0000-0000-0000-000000000001" as `${string}-${string}-${string}-${string}-${string}`;
    assert.strictEqual(isChunkWebSocketMessage({ type: "chunk", context_id }), true);
    assert.strictEqual(isTimestampsWebSocketMessage({ type: "timestamps", context_id }), true);
    assert.strictEqual(isDoneWebSocketMessage({ type: "done", context_id }), true);
    assert.strictEqual(isErrorWebSocketMessage({ type: "error", context_id }), true);
    assert.strictEqual(isDoneWebSocketMessage({ type: "chunk", context_id }), false);
  });

  await test("recognizes ElevenLabs message types.", async () => {
    const contextId = "00000000-0000-0000-0000-000000000001" as `${string}-${string}-${string}-${string}-${string}`;
    assert.strictEqual(isAudioOutputWebSocketMessage({ isFinal: null, contextId }), true);
    assert.strictEqual(isFinalOutputWebSocketMessage({ isFinal: true, contextId }), true);
    assert.strictEqual(isAudioOutputWebSocketMessage({ isFinal: true, contextId }), false);
  });

  await test("recognizes Twilio body and WebSocket message types.", async () => {
    assert.strictEqual(isCallMetadata({ CallSid: "call", To: "+1", From: "+2" }), true);
    assert.strictEqual(isRecordingStatus({ CallSid: "call", RecordingStatus: "completed", RecordingSid: "recording" }), true);
    assert.strictEqual(isTranscriptStatus({ CallSid: "call", TranscriptionSid: "transcription" }), true);
    assert.strictEqual(isStartWebSocketMessage({ event: "start" }), true);
    assert.strictEqual(isMediaWebSocketMessage({ event: "media" }), true);
    assert.strictEqual(isStopWebSocketMessage({ event: "stop" }), true);
    assert.strictEqual(isMarkWebSocketMessage({ event: "mark" }), true);
    assert.strictEqual(isCallMetadata({ CallSid: "call" }), false);
    assert.strictEqual(isMediaWebSocketMessage({ event: "stop" }), false);
  });
});
