(function (root) {
  "use strict";

  const MIN_PASSWORD_LENGTH = 8;

  function paramsFrom(fragment) {
    const value = String(fragment || "").replace(/^[?#]/, "");
    return new URLSearchParams(value);
  }

  function recoveryParams(href) {
    const url = new URL(href);
    const query = paramsFrom(url.search);
    const hash = paramsFrom(url.hash);
    return {
      type: hash.get("type") || query.get("type") || "",
      error: hash.get("error") || query.get("error") || "",
      errorCode: hash.get("error_code") || query.get("error_code") || "",
      errorDescription: hash.get("error_description") || query.get("error_description") || ""
    };
  }

  function hasRecoveryIntent(href) {
    return recoveryParams(href).type.toLowerCase() === "recovery";
  }

  function recoveryErrorMessage(href) {
    const params = recoveryParams(href);
    if (!params.error && !params.errorCode && !params.errorDescription) return "";
    const combined = `${params.error} ${params.errorCode} ${params.errorDescription}`.toLowerCase();
    if (combined.includes("expired") || combined.includes("otp_expired")) {
      return "重置链接已过期，请返回登录页重新发送。";
    }
    return "重置链接无效或已被使用，请返回登录页重新发送。";
  }

  function resetPageUrl(currentHref) {
    const current = new URL(currentHref);
    current.search = "";
    current.hash = "";
    return new URL("reset-password/", current).href;
  }

  function loginPageUrl(currentHref, resetSucceeded) {
    const target = new URL("../", currentHref);
    target.search = resetSucceeded ? "?passwordReset=success" : "";
    target.hash = "";
    return target.href;
  }

  function validatePasswordPair(password, confirmation) {
    const nextPassword = String(password || "");
    const confirmedPassword = String(confirmation || "");
    if (nextPassword.length < MIN_PASSWORD_LENGTH) {
      return { ok: false, message: `新密码至少需要 ${MIN_PASSWORD_LENGTH} 位。` };
    }
    if (nextPassword !== confirmedPassword) {
      return { ok: false, message: "两次输入的新密码不一致。" };
    }
    return { ok: true, message: "" };
  }

  async function requestPasswordReset(client, email, currentHref) {
    const result = await client.auth.resetPasswordForEmail(String(email || "").trim(), {
      redirectTo: resetPageUrl(currentHref)
    });
    if (result.error) throw result.error;
    return true;
  }

  async function updatePasswordAndClear(app, password) {
    const result = await app.client.auth.updateUser({ password: String(password || "") });
    if (result.error) throw result.error;
    try {
      await app.clearPasswordRecoverySession();
    } catch (cause) {
      const error = new Error("RECOVERY_SESSION_CLEAR_FAILED");
      error.code = "RECOVERY_SESSION_CLEAR_FAILED";
      error.cause = cause;
      throw error;
    }
    return true;
  }

  root.AMZWN_AUTH_RECOVERY = Object.freeze({
    MIN_PASSWORD_LENGTH,
    hasRecoveryIntent,
    recoveryErrorMessage,
    resetPageUrl,
    loginPageUrl,
    validatePasswordPair,
    requestPasswordReset,
    updatePasswordAndClear
  });
})(typeof window === "undefined" ? globalThis : window);
