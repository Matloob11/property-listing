import test from "node:test";
import assert from "node:assert/strict";
import { sniffAudioMime } from "./leadRecording.js";

test("sniffAudioMime detects PF WAV (RIFF/WAVE)", () => {
  const buf = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt ")]);
  assert.equal(sniffAudioMime(buf), "audio/wav");
});

test("sniffAudioMime detects MP3 ID3 and frame sync", () => {
  const id3 = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(12)]);
  assert.equal(sniffAudioMime(id3), "audio/mpeg");
  const frame = Buffer.from([0xff, 0xfb, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(sniffAudioMime(frame), "audio/mpeg");
});

test("sniffAudioMime rejects XML / empty", () => {
  assert.equal(sniffAudioMime(Buffer.from("<?xml version='1.0'?>")), "");
  assert.equal(sniffAudioMime(Buffer.alloc(4)), "");
});
