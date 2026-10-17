import assert from "node:assert/strict";
import test from "node:test";
import { optionSentChatLists, optionSentStageChange, passwordOk, phoneTail, rememberOptionSentChats, tailsFromLead, tallyOptionSentChats, unlockOptionSentChats, optionSentChatKey } from "./optionSentWhatsapp.js";

test("phone tail keeps the last 9 digits from either check", () => {
  assert.equal(phoneTail("+971 52 451 6816"), "524516816");
  assert.equal(phoneTail("0524516816"), "524516816");
  assert.equal(phoneTail("12345"), "");
});

test("every phone on the lead is kept, including a second number", () => {
  assert.deepEqual(
    tailsFromLead({ PHONE: [{ VALUE: "+971524516816" }, { VALUE: "971504447245" }] }),
    ["524516816", "504447245"]
  );
});

test("WhatsApp and No WhatsApp add up to the Option Sent list", () => {
  const tally = tallyOptionSentChats(
    [
      { id: "1", tails: ["111111111"] },
      { id: "2", tails: ["222222222"] },
      { id: "3", tails: ["333333333"] },
      { id: "4", tails: [] },
      { id: "5", tails: ["444444444", "111111111"] },
    ],
    ["111111111"],
    ["111111111", "222222222"]
  );
  assert.equal(tally.whatsapp, 3);
  assert.equal(tally.noWhatsapp, 2);
  assert.equal(tally.total, 5);
  assert.equal(tally.onAgent, 2);
  assert.equal(tally.onOther, 1);
  assert.equal(tally.noPhone, 1);
});

test("chat lists keep the lead number and the agent who has the thread", () => {
  const lists = optionSentChatLists(
    [{ id: "9", phones: [{ phone: "+971 52 451 6816", tail: "524516816" }] }],
    [{ tail: "524516816", conversationId: 15, agentName: "Other Agent", onAgent: false }]
  );
  assert.equal(lists.chats.length, 1);
  assert.equal(lists.chats[0].phone, "+971 52 451 6816");
  assert.equal(lists.chats[0].agentName, "Other Agent");
  assert.equal(lists.otherChats.length, 1);
});

test("a second number on the same lead still keeps its own chat", () => {
  const lists = optionSentChatLists(
    [{
      id: "9",
      phones: [
        { phone: "+971500000001", tail: "500000001" },
        { phone: "+971500000002", tail: "500000002" },
      ],
    }],
    [
      { tail: "500000001", conversationId: 1, agentName: "Asma Aslam", onAgent: true },
      { tail: "500000002", conversationId: 2, agentName: "Other Agent", onAgent: false },
    ]
  );
  assert.equal(lists.chats.length, 2);
  assert.equal(lists.otherChats.length, 1);
  assert.equal(lists.otherChats[0].phone, "+971500000002");
});

test("stage change is the Option Sent edit by that agent", () => {
  const at = optionSentStageChange([
    { AUTHOR_ID: "2298", CREATED: "2026-10-13T12:59:46+00:00", COMMENT: "Option Sent Details: options sent" },
    { AUTHOR_ID: "10", CREATED: "2026-10-13T13:00:00+00:00", COMMENT: "Stage: New → Option Sent" },
    { AUTHOR_ID: "2298", CREATED: "2026-10-13T12:59:45+00:00", COMMENT: "Stage: Contacted/In Progress → Option Sent" },
  ], "2298");
  assert.equal(at, "2026-10-13T12:59:45+00:00");
  assert.equal(optionSentStageChange([], "2298"), "");
});

test("numbers stay hidden until the password, then the lead contact is returned", () => {
  const key = optionSentChatKey({ agentId: "2298", from: "2026-09-15 00:00:00", to: "2026-10-16 23:59:59" });
  rememberOptionSentChats(key, {
    chats: [{ phone: "+971501112233", conversationId: 9, agentName: "Asma Aslam", onAgent: true }],
    otherChats: [],
  });
  assert.equal(passwordOk("nope"), false);
  assert.equal(unlockOptionSentChats(key, "nope").ok, false);
  const opened = unlockOptionSentChats(key, "admin123");
  assert.equal(opened.ok, true);
  assert.equal(opened.chats[0].phone, "+971501112233");
  assert.equal(opened.chats[0].conversationId, 9);
});
