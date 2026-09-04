import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

const helperSource = await fs.readFile(new URL("./assets/auth-recovery.js", import.meta.url), "utf8");
const clientSource = await fs.readFile(new URL("./assets/supabase-client.js", import.meta.url), "utf8");
const authSource = await fs.readFile(new URL("./assets/auth.js", import.meta.url), "utf8");
const pageSource = await fs.readFile(new URL("./assets/password-recovery.js", import.meta.url), "utf8");
const loginHtml = await fs.readFile(new URL("./index.html", import.meta.url), "utf8");
const resetHtml = await fs.readFile(new URL("./reset-password/index.html", import.meta.url), "utf8");

const helperContext = vm.createContext({ URL, URLSearchParams });
vm.runInContext(helperSource, helperContext);
const recovery = helperContext.AMZWN_AUTH_RECOVERY;

assert.equal(recovery.hasRecoveryIntent("https://example.test/app/#type=recovery"), true);
assert.equal(recovery.hasRecoveryIntent("https://example.test/app/?type=recovery"), true);
assert.equal(recovery.hasRecoveryIntent("https://example.test/app/#type=signup"), false);
assert.equal(recovery.hasRecoveryIntent("https://example.test/app/"), false);
assert.equal(
  recovery.recoveryErrorMessage("https://example.test/app/#error=access_denied&error_code=otp_expired&error_description=private-detail"),
  "重置链接已过期，请返回登录页重新发送。"
);
assert.doesNotMatch(
  recovery.recoveryErrorMessage("https://example.test/app/#error=access_denied&error_description=private-detail"),
  /private-detail/
);
assert.equal(
  recovery.resetPageUrl("https://example.test/amzwn-web/?source=login#fragment"),
  "https://example.test/amzwn-web/reset-password/"
);
assert.equal(
  recovery.loginPageUrl("https://example.test/amzwn-web/reset-password/#fragment", true),
  "https://example.test/amzwn-web/?passwordReset=success"
);

const sampleCredential = "x".repeat(recovery.MIN_PASSWORD_LENGTH);
assert.equal(recovery.validatePasswordPair("x", "x").ok, false);
assert.equal(recovery.validatePasswordPair(sampleCredential, `${sampleCredential}x`).ok, false);
assert.equal(recovery.validatePasswordPair(sampleCredential, sampleCredential).ok, true);

let resetEmailCall = null;
await recovery.requestPasswordReset({
  auth: {
    async resetPasswordForEmail(email, options) {
      resetEmailCall = { email, options };
      return { error: null };
    }
  }
}, " user@example.test ", "https://example.test/amzwn-web/");
assert.equal(resetEmailCall.email, "user@example.test");
assert.equal(resetEmailCall.options.redirectTo, "https://example.test/amzwn-web/reset-password/");

let updateCall = null;
let clearCount = 0;
await recovery.updatePasswordAndClear({
  client: {
    auth: {
      async updateUser(payload) {
        updateCall = payload;
        return { error: null };
      }
    }
  },
  async clearPasswordRecoverySession() {
    clearCount += 1;
  }
}, sampleCredential);
assert.equal(updateCall.password, sampleCredential);
assert.equal(clearCount, 1);

let clearAfterFailedUpdate = 0;
await assert.rejects(() => recovery.updatePasswordAndClear({
  client: { auth: { async updateUser() { return { error: new Error("update rejected") }; } } },
  async clearPasswordRecoverySession() { clearAfterFailedUpdate += 1; }
}, sampleCredential), /update rejected/);
assert.equal(clearAfterFailedUpdate, 0);

const clearFailure = await recovery.updatePasswordAndClear({
  client: { auth: { async updateUser() { return { error: null }; } } },
  async clearPasswordRecoverySession() { throw new Error("local signout rejected"); }
}, sampleCredential).then(() => null, (error) => error);
assert.equal(clearFailure.code, "RECOVERY_SESSION_CLEAR_FAILED");
assert.doesNotMatch(clearFailure.message, new RegExp(sampleCredential));

function storageFixture() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

let authEvent = null;
let storedSession = null;
let signOutOptions = null;
const sessionStorage = storageFixture();
const fakeClient = {
  auth: {
    onAuthStateChange(callback) { authEvent = callback; return { data: { subscription: {} } }; },
    async getSession() { return { data: { session: storedSession }, error: null }; },
    async signOut(options) { signOutOptions = options; return { error: null }; }
  }
};
const clientWindow = {
  AMZWN_CONFIG: { supabaseUrl: "https://isolated.example.test", supabasePublicKey: "public-test-value" },
  supabase: { createClient() { return fakeClient; } },
  sessionStorage,
  setTimeout,
  clearTimeout,
  location: { replace() {} }
};
vm.runInContext(clientSource, vm.createContext({ window: clientWindow, Intl, Date }));
const app = clientWindow.AMZWN;

const ordinarySession = { user: { id: "ordinary-user" } };
const ordinaryWait = app.waitForPasswordRecoverySession(5);
authEvent("SIGNED_IN", ordinarySession);
assert.equal(await ordinaryWait, null, "ordinary sign-in must not authorize password recovery");

const recoverySession = { user: { id: "recovery-user" } };
storedSession = recoverySession;
const recoveryWait = app.waitForPasswordRecoverySession(100);
authEvent("PASSWORD_RECOVERY", recoverySession);
assert.equal(await recoveryWait, recoverySession);
assert.equal(sessionStorage.getItem("amzwn.password-recovery"), "1");
assert.deepEqual(await app.waitForPasswordRecoverySession(5), recoverySession);
await app.clearPasswordRecoverySession();
assert.equal(signOutOptions.scope, "local");
assert.equal(sessionStorage.getItem("amzwn.password-recovery"), null);

function elementFixture(initial = {}) {
  const listeners = new Map();
  const classes = new Set();
  const element = {
    textContent: "",
    className: "",
    hidden: false,
    required: false,
    disabled: false,
    autocomplete: "",
    value: "",
    dataset: {},
    focused: false,
    ...initial,
    classList: {
      toggle(name, active) { if (active) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); }
    },
    addEventListener(type, callback) { listeners.set(type, callback); },
    setAttribute(name, value) { element[name] = String(value); },
    querySelector(selector) { return selector === "span" ? element.labelSpan || null : null; },
    focus() { element.focused = true; },
    async trigger(type, event = {}) {
      const callback = listeners.get(type);
      if (!callback) throw new Error(`missing listener: ${type}`);
      return callback({ preventDefault() {}, ...event });
    }
  };
  return element;
}

const loginElements = {
  title: elementFixture(),
  subtitle: elementFixture(),
  submitLabel: elementFixture(),
  submitButton: elementFixture(),
  email: elementFixture({ value: "user@example.test" }),
  password: elementFixture({ value: sampleCredential, required: true }),
  passwordField: elementFixture(),
  forgot: elementFixture(),
  back: elementFixture({ hidden: true }),
  status: elementFixture(),
  form: elementFixture()
};
loginElements.form.reportValidity = () => true;
loginElements.form.reset = () => { loginElements.email.value = ""; loginElements.password.value = ""; };
const loginTabs = [
  elementFixture({ dataset: { mode: "login" } }),
  elementFixture({ dataset: { mode: "signup" } })
];
const loginSelectors = new Map([
  ["#auth-title", loginElements.title],
  ["#auth-subtitle", loginElements.subtitle],
  ["#auth-submit-label", loginElements.submitLabel],
  ["#auth-submit", loginElements.submitButton],
  ['input[name="email"]', loginElements.email],
  ['input[name="password"]', loginElements.password],
  ["#password-field", loginElements.passwordField],
  ["#forgot-password", loginElements.forgot],
  ["#back-to-login", loginElements.back],
  ["#auth-form", loginElements.form],
  ["#form-status", loginElements.status]
]);
let runtimeResetCall = null;
const loginWindow = {
  AMZWN: {
    client: { auth: {} },
    async currentSession() { return null; },
    async waitForPasswordRecoverySession() { return null; },
    messageFor(_error, fallback) { return fallback; },
    setBusy(button, busy) { button.disabled = busy; }
  },
  AMZWN_AUTH_RECOVERY: {
    ...recovery,
    async requestPasswordReset(_client, email, href) { runtimeResetCall = { email, href }; }
  },
  location: { href: "https://example.test/amzwn-web/", replace() {} },
  history: { replaceState() {} }
};
const loginDocument = {
  querySelector(selector) { return loginSelectors.get(selector); },
  querySelectorAll(selector) { return selector === ".auth-tab" ? loginTabs : []; }
};
class LoginFormData {
  get(name) { return name === "email" ? loginElements.email.value : loginElements.password.value; }
}
vm.runInContext(authSource, vm.createContext({ window: loginWindow, document: loginDocument, URL, FormData: LoginFormData }));
await new Promise((resolve) => setTimeout(resolve, 0));
await loginElements.forgot.trigger("click");
assert.equal(loginElements.passwordField.hidden, true);
assert.equal(loginElements.password.required, false);
assert.equal(loginElements.back.hidden, false);
loginElements.email.value = "user@example.test";
await loginElements.form.trigger("submit");
assert.deepEqual(runtimeResetCall, {
  email: "user@example.test",
  href: "https://example.test/amzwn-web/"
});

const resetElements = {
  form: elementFixture(),
  fields: elementFixture({ disabled: true }),
  password: elementFixture(),
  confirmation: elementFixture(),
  submit: elementFixture(),
  submitLabel: elementFixture(),
  status: elementFixture()
};
resetElements.form.reportValidity = () => true;
const resetSelectors = new Map([
  ["#recovery-form", resetElements.form],
  ["#recovery-fields", resetElements.fields],
  ['input[name="password"]', resetElements.password],
  ['input[name="confirmation"]', resetElements.confirmation],
  ["#recovery-submit", resetElements.submit],
  ["#recovery-submit-label", resetElements.submitLabel],
  ["#recovery-status", resetElements.status]
]);
let runtimeUpdate = null;
let runtimeClearCount = 0;
let runtimeRedirect = null;
const resetWindow = {
  AMZWN: {
    client: { auth: { async updateUser(payload) { runtimeUpdate = payload; return { error: null }; } } },
    async waitForPasswordRecoverySession() { return recoverySession; },
    async clearPasswordRecoverySession() { runtimeClearCount += 1; },
    messageFor(_error, fallback) { return fallback; },
    setBusy(button, busy) { button.disabled = busy; }
  },
  AMZWN_AUTH_RECOVERY: recovery,
  location: {
    href: "https://example.test/amzwn-web/reset-password/#type=recovery",
    pathname: "/amzwn-web/reset-password/",
    replace(url) { runtimeRedirect = url; }
  },
  history: { replaceState() {} }
};
const resetDocument = { querySelector(selector) { return resetSelectors.get(selector); } };
vm.runInContext(pageSource, vm.createContext({ window: resetWindow, document: resetDocument, URL }));
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(resetElements.fields.disabled, false);
resetElements.password.value = sampleCredential;
resetElements.confirmation.value = sampleCredential;
await resetElements.form.trigger("submit");
assert.equal(runtimeUpdate.password, sampleCredential);
assert.equal(runtimeClearCount, 1);
assert.equal(runtimeRedirect, "https://example.test/amzwn-web/?passwordReset=success");
assert.equal(resetElements.password.value, "");
assert.equal(resetElements.confirmation.value, "");

assert.match(loginHtml, /id="forgot-password"/);
assert.ok(loginHtml.indexOf("assets/auth-recovery.js") < loginHtml.indexOf("assets/auth.js"));
assert.match(resetHtml, /name="password"[^>]+autocomplete="new-password"/);
assert.match(resetHtml, /name="confirmation"[^>]+autocomplete="new-password"/);
assert.ok(resetHtml.indexOf("assets/auth-recovery.js") < resetHtml.indexOf("assets/password-recovery.js"));
for (const source of [helperSource, clientSource, authSource, pageSource]) {
  assert.doesNotMatch(source, /console\.(?:log|error|warn)/);
}

console.log(JSON.stringify({
  status: "ok",
  forgotPasswordEntry: true,
  exactRecoveryEventRequired: true,
  ordinarySessionRejected: true,
  passwordConfirmation: true,
  secureUpdateAndLocalSignOut: true,
  recoveryUrlSanitized: true,
  externalCalls: 0
}, null, 2));
