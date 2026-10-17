import assert from "node:assert/strict";
import {
  extractPfMessageUrl,
  parsePfWhatsAppText,
  purposeFromPfUrl,
} from "./crmPfEnrich.js";

assert.equal(
  extractPfMessageUrl("Reply: [url=https://www.propertyfinder.ae/leads/v1/lead/message/abc/xyz]https://www.propertyfinder.ae/leads/v1/lead/message/abc/xyz[/url]"),
  "https://www.propertyfinder.ae/leads/v1/lead/message/abc/xyz"
);
assert.equal(purposeFromPfUrl("https://www.propertyfinder.ae/en/rent/dubai/townhouses-for-rent-mudon.html"), "rent");
assert.equal(purposeFromPfUrl("https://www.propertyfinder.ae/en/buy/dubai/townhouses-for-sale-mudon.html"), "sale");

const rich = parsePfWhatsAppText(
  "Hello! Property Finder passed on your enquiry about the following 3 bedroom Townhouse in Mudon Al Ranim 3: https://www.propertyfinder.ae/go/8VMCBNFHVQEX1KT9MMJ9B4AEMC/en?utm_medium=lead_reply&utm_source=wa. How can I help you today?"
);
assert.equal(rich.beds, 3);
assert.equal(rich.type, "Townhouse");
assert.equal(rich.community, "Mudon");
assert.ok(rich.goUrl.includes("/go/"));

const empty = parsePfWhatsAppText(
  "Hello! Property Finder passed on your enquiry about the following - in -: https://www.propertyfinder.ae/go/abc/en?utm_medium=lead_reply&utm_source=wa."
);
assert.equal(empty.beds, null);
assert.equal(empty.community, "");
assert.ok(empty.goUrl);

console.log("crmPfEnrich tests ok");
