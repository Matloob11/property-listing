import test from "node:test";
import assert from "node:assert/strict";
import { getTlNote, listTlNotes, saveTlNote, tlNoteKey } from "./tlNotes.js";

test("tl note key is scoped per agent and day", () => {
  assert.equal(tlNoteKey("2376", "2026-10-01"), "tl_agent_note:2376:2026-10-01");
  assert.equal(tlNoteKey("", "2026-10-01"), "");
});

test("save and load TL notes for agent day", async () => {
  const store = new Map();
  const db = {
    async getSetting(key, fallback = null) {
      return store.has(key) ? store.get(key) : fallback;
    },
    async setSetting(key, value) {
      store.set(key, value);
    },
  };
  const saved = await saveTlNote(db, {
    agentId: "2376",
    day: "2026-10-01",
    text: "Asked Areeba to call Bayut queue",
    authorId: "1",
    authorName: "TL Saad",
  });
  assert.equal(saved.text, "Asked Areeba to call Bayut queue");
  const loaded = await getTlNote(db, "2376", "2026-10-01");
  assert.equal(loaded.text, "Asked Areeba to call Bayut queue");
  assert.equal(loaded.authorName, "TL Saad");
  const month = await listTlNotes(db, { agentId: "2376", month: "2026-10" });
  assert.equal(month.length, 1);
  assert.equal(month[0].day, "2026-10-01");
});
