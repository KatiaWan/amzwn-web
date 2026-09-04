(function () {
  "use strict";

  const app = window.AMZWN;
  const recovery = window.AMZWN_AUTH_RECOVERY;
  const form = document.querySelector("#recovery-form");
  const fields = document.querySelector("#recovery-fields");
  const passwordInput = document.querySelector('input[name="password"]');
  const confirmationInput = document.querySelector('input[name="confirmation"]');
  const submitButton = document.querySelector("#recovery-submit");
  const submitLabel = document.querySelector("#recovery-submit-label");
  const status = document.querySelector("#recovery-status");
  let recoveryReady = false;
  let passwordUpdated = false;

  function setStatus(message, kind) {
    status.textContent = message;
    status.className = `form-status${kind ? ` is-${kind}` : ""}`;
  }

  function clearPasswordFields() {
    passwordInput.value = "";
    confirmationInput.value = "";
  }

  function sanitizeRecoveryUrl() {
    window.history.replaceState(null, "", window.location.pathname);
  }

  function returnToLogin() {
    window.location.replace(recovery.loginPageUrl(window.location.href, true));
  }

  async function clearSessionAndReturn() {
    await app.clearPasswordRecoverySession();
    sanitizeRecoveryUrl();
    returnToLogin();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!recoveryReady) return;

    if (passwordUpdated) {
      setStatus("正在清理恢复会话…");
      app.setBusy(submitButton, true, "正在返回…");
      try {
        await clearSessionAndReturn();
      } catch (error) {
        setStatus(app.messageFor(error, "登录状态清理失败，请刷新页面后重试。"), "error");
      } finally {
        app.setBusy(submitButton, false);
        submitLabel.textContent = "重试清理并返回登录";
      }
      return;
    }

    if (!form.reportValidity()) return;
    const validation = recovery.validatePasswordPair(passwordInput.value, confirmationInput.value);
    if (!validation.ok) {
      setStatus(validation.message, "error");
      return;
    }

    setStatus("正在安全更新密码…");
    app.setBusy(submitButton, true, "正在更新…");
    try {
      await recovery.updatePasswordAndClear(app, passwordInput.value);
      clearPasswordFields();
      passwordUpdated = true;
      sanitizeRecoveryUrl();
      returnToLogin();
    } catch (error) {
      clearPasswordFields();
      if (error && error.code === "RECOVERY_SESSION_CLEAR_FAILED") {
        passwordUpdated = true;
        fields.disabled = false;
        submitLabel.textContent = "重试清理并返回登录";
        setStatus("密码已更新，但登录状态清理失败。请点击按钮重试清理后返回登录。", "error");
        return;
      }
      setStatus(app.messageFor(error, "密码没有更新，请重新输入后再试。"), "error");
    } finally {
      app.setBusy(submitButton, false);
      if (!passwordUpdated) submitLabel.textContent = "更新密码并返回登录";
    }
  });

  async function initialize() {
    const urlError = recovery.recoveryErrorMessage(window.location.href);
    if (urlError) {
      sanitizeRecoveryUrl();
      setStatus(urlError, "error");
      return;
    }

    const session = await app.waitForPasswordRecoverySession(10000);
    sanitizeRecoveryUrl();
    if (!session) {
      setStatus("重置链接无效或已过期，请返回登录页重新发送。", "error");
      return;
    }

    recoveryReady = true;
    fields.disabled = false;
    setStatus("重置链接验证成功，请设置新密码。", "success");
    passwordInput.focus();
  }

  initialize().catch(() => {
    sanitizeRecoveryUrl();
    setStatus("无法验证重置链接，请刷新页面；若仍失败，请重新发送。", "error");
  });
})();
