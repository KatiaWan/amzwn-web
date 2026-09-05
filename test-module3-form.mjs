import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const context = vm.createContext({ URL });
const source = await fs.readFile(new URL("./assets/module3-form.js", import.meta.url), "utf8");
const toolHtml = await fs.readFile(new URL("./tool/index.html", import.meta.url), "utf8");
const styles = await fs.readFile(new URL("./assets/styles.css", import.meta.url), "utf8");
vm.runInContext(source, context);
const helpers = context.AMZWN_MODULE3;

assert.equal((toolHtml.match(/class="[^"]*module3-media-control[^"]*"/g) ?? []).length, 3);
assert.match(toolHtml, /styles\.css\?v=20260905-module3-layout-v1/);
assert.match(toolHtml, /<span class="file-field__label">当前状态<\/span>\s*<div class="module3-state-card">/);
assert.match(styles, /\.module3-media-control \{[^}]*grid-template-rows:\s*auto 92px;[^}]*margin:\s*0;/);
assert.match(styles, /\.module3-media-control > select,[^{]+\{[^}]*height:\s*92px;[^}]*min-height:\s*92px;/);

assert.equal(helpers.normalizeAsin(" b0aaa11111 "), "B0AAA11111");
assert.throws(() => helpers.normalizeAsin("invalid"), /ASIN/);
assert.deepEqual(
  Array.from(helpers.normalizeCompetitors(["B0BBB22222", "B0CCC33333", "B0DDD44444"], "B0AAA11111")),
  ["B0BBB22222", "B0CCC33333", "B0DDD44444"]
);
assert.throws(
  () => helpers.normalizeCompetitors(["B0BBB22222", "B0BBB22222", "B0DDD44444"], "B0AAA11111"),
  /不能重复/
);
assert.throws(
  () => helpers.normalizeCompetitors(["B0BBB22222", "B0CCC33333"], "B0AAA11111"),
  /3–5/
);
assert.equal(
  helpers.apiEndpoint("https://api.example.test:18443/api/auth-check", "/api/module3/media-import"),
  "https://api.example.test:18443/api/module3/media-import"
);
assert.equal(
  helpers.apiEndpoint("https://api.example.test:18443/api/auth-check", "/api/module3/status?taskId=fixture"),
  "https://api.example.test:18443/api/module3/status?taskId=fixture"
);
const prepared = helpers.prepareMediaPackage({ products: [] }, {
  taskId: "11111111-1111-4111-8111-111111111111",
  configRevision: 2,
  site: "US",
  nonce: "fixture-nonce"
});
assert.equal(prepared.configRevision, 2);
assert.equal(prepared.humanReview.status, "未确认");
assert.match(helpers.statusDetail({
  status: "需人工确认",
  ownAsin: "B0AAA11111",
  competitorAsins: ["B0BBB22222", "B0CCC33333", "B0DDD44444"],
  mediaValidationStatus: "human_verified_complete",
  reviewReason: "请核对档案与媒体展示"
}), /人工确认原因：请核对档案与媒体展示/);
const confirmable = {
  status: "图片待验",
  structureDigest: "a".repeat(64),
  confirmationBlockers: []
};
assert.equal(helpers.canConfirmMedia(confirmable), true);
assert.equal(helpers.canConfirmMedia({ ...confirmable, confirmationBlockers: ["图片为空"] }), false);
assert.equal(helpers.canAuthorizePaid({
  status: "待档案费用授权",
  mediaValidationStatus: "human_verified_complete",
  confirmationBlockers: []
}), true);
assert.equal(helpers.canAuthorizePaid({
  status: "待档案费用授权",
  mediaValidationStatus: "structure_validated",
  confirmationBlockers: []
}), false);

console.log(JSON.stringify({
  status: "ok",
  paths: ["A", "B"],
  asinValidation: true,
  competitorCount: "3-5",
  mediaPackageUsesAuthoritativeNonceAndRevision: true,
  externalCalls: 0
}, null, 2));
