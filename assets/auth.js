(function () {
  "use strict";

  const app = window.AMZWN;
  const tabs = Array.from(document.querySelectorAll(".auth-tab"));
  const title = document.querySelector("#auth-title");
  const subtitle = document.querySelector("#auth-subtitle");
  const submitLabel = document.querySelector("#auth-submit-label");
  const submitButton = document.querySelector("#auth-submit");
  const passwordInput = document.querySelector('input[name="password"]');
  const form = document.querySelector("#auth-form");
  const status = document.querySelector("#form-status");
  let mode = "login";

  const copy = {
    login: {
      title: "继续你的关键词作战",
      subtitle: "登录后提交任务，并查看只属于你的分析报告。",
      button: "登录并进入工具",
      hint: "使用已注册邮箱登录；新用户请先切换到“注册”。",
      autocomplete: "current-password"
    },
    signup: {
      title: "创建你的作战空间",
      subtitle: "注册后先完成邮箱确认，再回来提交第一条任务。",
      button: "注册并发送确认邮件",
      hint: "我们会把确认邮件发送到你的邮箱。",
      autocomplete: "new-password"
    }
  };

  function setMode(nextMode) {
    mode = nextMode;
    for (const tab of tabs) {
      const active = tab.dataset.mode === mode;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    }
    title.textContent = copy[mode].title;
    subtitle.textContent = copy[mode].subtitle;
    submitLabel.textContent = copy[mode].button;
    passwordInput.autocomplete = copy[mode].autocomplete;
    status.textContent = copy[mode].hint;
    status.className = "form-status";
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => setMode(tab.dataset.mode));
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const values = new FormData(form);
    const email = String(values.get("email") || "").trim();
    const password = String(values.get("password") || "");
    status.className = "form-status";
    status.textContent = mode === "login" ? "正在验证账号…" : "正在创建账号…";
    app.setBusy(submitButton, true, mode === "login" ? "正在登录…" : "正在注册…");

    try {
      if (mode === "login") {
        const result = await app.client.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        window.location.replace("tool/");
        return;
      }

      const result = await app.client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: new URL("./", window.location.href).href }
      });
      if (result.error) throw result.error;
      if (result.data.session) {
        window.location.replace("tool/");
        return;
      }
      form.reset();
      setMode("login");
      status.className = "form-status is-success";
      status.textContent = "注册成功。请打开邮箱完成确认，再回来登录。";
    } catch (error) {
      status.className = "form-status is-error";
      status.textContent = app.messageFor(error, "登录服务暂时没有响应，请稍后重试。");
    } finally {
      app.setBusy(submitButton, false);
      submitLabel.textContent = copy[mode].button;
    }
  });

  app.currentSession()
    .then((session) => {
      if (session) window.location.replace("tool/");
    })
    .catch(() => {
      status.className = "form-status is-error";
      status.textContent = "登录服务暂时没有响应，请刷新页面重试。";
    });
})();
