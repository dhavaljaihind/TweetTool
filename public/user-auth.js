function setMsg(text) {
  const el = document.getElementById("msg");
  if (el) el.innerText = text || "";
}

function digitsOnly(v) {
  return String(v || "").replace(/\D/g, "");
}

function setButtonLoading(btnId, loading, normalText) {
  const btn = document.getElementById(btnId);
  if (!btn) return;

  if (!btn._normalText) btn._normalText = normalText || btn.innerText || "Submit";

  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-spinner"></span><span>${btn._normalText}</span>`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn._normalText;
  }
}
function redirectCountdown(seconds, url, msgPrefix) {
  let remaining = seconds;
  setMsg(`${msgPrefix} Redirecting in ${remaining}s.`);

  const timer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(timer);
      window.location.href = url;
      return;
    }
    setMsg(`${msgPrefix} Redirecting in ${remaining}s.`);
  }, 1000);
}

function normalizeEmail(v) {
  return String(v || "").trim().toLowerCase();
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(v));
}

function isMobileInput(v) {
  return /^\d{10}$/.test(digitsOnly(v));
}

function isEmailInput(v) {
  return isValidEmail(v);
}

function setVerifyStatus(id, text, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerText = text;
  el.classList.remove("success", "error");
  el.classList.add(ok ? "success" : "error");
}

function setDisabled(id, disabled) {
  const el = document.getElementById(id);
  if (el) el.disabled = !!disabled;
}

function bindOtpInputWatcher(inputId, buttonId) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(buttonId);
  if (!input || !btn) return;

  const sync = () => {
    btn.disabled = String(input.value || "").trim().length === 0;
  };

  input.addEventListener("input", sync);
  sync();
}

function startOtpCooldown(buttonId, seconds, originalText) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;

  let left = seconds;
  btn.disabled = true;
  btn.innerText = `${originalText} (${left}s)`;

  const timer = setInterval(() => {
    left -= 1;
    if (left <= 0) {
      clearInterval(timer);
      btn.disabled = false;
      btn.innerText = originalText;
      return;
    }
    btn.innerText = `${originalText} (${left}s)`;
  }, 1000);
}

/* ================= SIGNUP ================= */
const signupBtn = document.getElementById("signupBtn");
if (signupBtn) {
  let mobileVerified = false;
  let emailVerified = false;

  setVerifyStatus("mobileVerifiedStatus", "Mobile not verified", false);
setVerifyStatus("emailVerifiedStatus", "Email not verified", false);
setButtonLoading("signupBtn", false, "Sign Up");

bindOtpInputWatcher("mobileOtp", "verifyMobileOtpBtn");
bindOtpInputWatcher("emailOtp", "verifyEmailOtpBtn");

  document.getElementById("mobile")?.addEventListener("input", () => {
  mobileVerified = false;
  setVerifyStatus("mobileVerifiedStatus", "Mobile not verified", false);
  const otpInput = document.getElementById("mobileOtp");
  if (otpInput) otpInput.value = "";
  setDisabled("verifyMobileOtpBtn", true);
});

document.getElementById("email")?.addEventListener("input", () => {
  emailVerified = false;
  setVerifyStatus("emailVerifiedStatus", "Email not verified", false);
  const otpInput = document.getElementById("emailOtp");
  if (otpInput) otpInput.value = "";
  setDisabled("verifyEmailOtpBtn", true);
});

document.getElementById("sendMobileOtpBtn")?.addEventListener("click", async () => {
  setMsg("");

  if (mobileVerified) return setMsg("Mobile already verified");

  const mobile = digitsOnly(document.getElementById("mobile").value);
    if (mobile.length !== 10) return setMsg("Enter valid 10 digit mobile number.");

    setButtonLoading("sendMobileOtpBtn", true, "Send Mobile OTP");
    try {
      const res = await fetch("/user/request-signup-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "mobile", value: mobile })
      });
      const data = await res.json().catch(() => ({}));
      setButtonLoading("sendMobileOtpBtn", false, "Send Mobile OTP");

if (res.ok) {
  showToast(data.message || "Mobile OTP sent ✅", 4000);
  setMsg("");
  const otpInput = document.getElementById("mobileOtp");
  if (otpInput) otpInput.focus();
  startOtpCooldown("sendMobileOtpBtn", 30, "Send Mobile OTP");
} else {
  setMsg(data.message || "Failed to send mobile OTP");
}
    } catch (err) {
      console.error(err);
      setButtonLoading("sendMobileOtpBtn", false, "Send Mobile OTP");
      setMsg("Server error. Please try again.");
    }
  });

  document.getElementById("verifyMobileOtpBtn")?.addEventListener("click", async () => {
    setMsg("");
    const mobile = digitsOnly(document.getElementById("mobile").value);
    const otp = String(document.getElementById("mobileOtp").value || "").trim();

    if (mobile.length !== 10) return setMsg("Enter valid 10 digit mobile number.");
    if (!otp) return setMsg("Enter mobile OTP.");

    setButtonLoading("verifyMobileOtpBtn", true, "Verify Mobile OTP");
    try {
      const res = await fetch("/user/verify-signup-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "mobile", value: mobile, otp })
      });
      const data = await res.json().catch(() => ({}));
      setButtonLoading("verifyMobileOtpBtn", false, "Verify Mobile OTP");

if (res.ok) {
  mobileVerified = true;
  setVerifyStatus("mobileVerifiedStatus", "Mobile verified ✅", true);
  setMsg("");
  showToast(data.message || "Mobile verified ✅", 3000);
} else {
  mobileVerified = false;
  setVerifyStatus("mobileVerifiedStatus", "Mobile not verified", false);
  setMsg(data.message || "Mobile OTP verification failed");
}
    } catch (err) {
      console.error(err);
      setButtonLoading("verifyMobileOtpBtn", false, "Verify Mobile OTP");
      setMsg("Server error. Please try again.");
    }
  });

document.getElementById("sendEmailOtpBtn")?.addEventListener("click", async () => {
  setMsg("");

  if (emailVerified) return setMsg("Email already verified");

  const email = normalizeEmail(document.getElementById("email").value);
    if (!isValidEmail(email)) return setMsg("Enter valid email address.");

    setButtonLoading("sendEmailOtpBtn", true, "Send Email OTP");
    try {
      const res = await fetch("/user/request-signup-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "email", value: email })
      });
      const data = await res.json().catch(() => ({}));
      setButtonLoading("sendEmailOtpBtn", false, "Send Email OTP");

if (res.ok) {
  showToast(data.message || "Email OTP sent ✅", 4000);
  setMsg("");
  const otpInput = document.getElementById("emailOtp");
  if (otpInput) otpInput.focus();
  startOtpCooldown("sendEmailOtpBtn", 30, "Send Email OTP");
} else {
  setMsg(data.message || "Failed to send email OTP");
}
    } catch (err) {
      console.error(err);
      setButtonLoading("sendEmailOtpBtn", false, "Send Email OTP");
      setMsg("Server error. Please try again.");
    }
  });

  document.getElementById("verifyEmailOtpBtn")?.addEventListener("click", async () => {
    setMsg("");
    const email = normalizeEmail(document.getElementById("email").value);
    const otp = String(document.getElementById("emailOtp").value || "").trim();

    if (!isValidEmail(email)) return setMsg("Enter valid email address.");
    if (!otp) return setMsg("Enter email OTP.");

    setButtonLoading("verifyEmailOtpBtn", true, "Verify Email OTP");
    try {
      const res = await fetch("/user/verify-signup-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ type: "email", value: email, otp })
      });
      const data = await res.json().catch(() => ({}));
      setButtonLoading("verifyEmailOtpBtn", false, "Verify Email OTP");

if (res.ok) {
  emailVerified = true;
  setVerifyStatus("emailVerifiedStatus", "Email verified ✅", true);
  setMsg("");
  showToast(data.message || "Email verified ✅", 3000);
} else {
  emailVerified = false;
  setVerifyStatus("emailVerifiedStatus", "Email not verified", false);
  setMsg(data.message || "Email OTP verification failed");
}
    } catch (err) {
      console.error(err);
      setButtonLoading("verifyEmailOtpBtn", false, "Verify Email OTP");
      setMsg("Server error. Please try again.");
    }
  });

  signupBtn.addEventListener("click", async () => {
    setMsg("");

    const name = (document.getElementById("name").value || "").trim();
    const email = normalizeEmail(document.getElementById("email").value);
    const mobile = digitsOnly(document.getElementById("mobile").value);
    const password = String(document.getElementById("password").value || "");

    if (!name) return setMsg("Name is required.");
    if (!isValidEmail(email)) return setMsg("Valid email is required.");
    if (mobile.length !== 10) return setMsg("Enter valid 10 digit mobile number.");
    if (password.length < 6) return setMsg("Password must be at least 6 characters.");
    if (!mobileVerified) return setMsg("Please verify your mobile number.");
    if (!emailVerified) return setMsg("Please verify your email address.");

    setButtonLoading("signupBtn", true, "Sign Up");

    try {
      const res = await fetch("/user/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          email,
          mobile,
          password,
          mobileVerified,
          emailVerified
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        showToast("Registered successfully ✅", 5000);
        redirectCountdown(2, data.next || "/profile-setup.html", "Registered successfully ✅");
      } else {
        setButtonLoading("signupBtn", false, "Sign Up");
        setMsg(data.message || "Signup failed");
      }
    } catch (err) {
      console.error(err);
      setButtonLoading("signupBtn", false, "Sign Up");
      setMsg("Server error. Please try again.");
    }
  });
}
/* ================= LOGIN ================= */
const loginBtn = document.getElementById("loginBtn");
if (loginBtn) {
  setButtonLoading("loginBtn", false, "Login");

  loginBtn.addEventListener("click", async () => {
    setMsg("");

    const loginId = String(document.getElementById("loginId").value || "").trim();
    const password = String(document.getElementById("password").value || "");

    if (!loginId) return setMsg("Email or mobile is required.");
    if (!password) return setMsg("Password is required.");

    setButtonLoading("loginBtn", true, "Login");

    try {
      const res = await fetch("/user/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ loginId, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        showToast("Login successful ✅", 5000);
        redirectCountdown(2, data.next || "/app.html", "Login successful ✅");
      } else {
        setButtonLoading("loginBtn", false, "Login");
        setMsg(data.message || "Login failed");
      }
    } catch (err) {
      console.error(err);
      setButtonLoading("loginBtn", false, "Login");
      setMsg("Server error. Please try again.");
    }
  });
}

/* ================= REQUEST OTP ================= */
const otpBtn = document.getElementById("otpBtn");
if (otpBtn) {
  setButtonLoading("otpBtn", false, "Send OTP");

  otpBtn.addEventListener("click", async () => {
    setMsg("");

    const identifier = String(document.getElementById("identifier").value || "").trim();
    if (!identifier) return setMsg("Email or mobile is required.");

    setButtonLoading("otpBtn", true, "Send OTP");

    try {
      const res = await fetch("/user/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier }),
      });

      const data = await res.json().catch(() => ({}));

      setButtonLoading("otpBtn", false, "Send OTP");

      if (res.ok) {
        showToast(data.message || "OTP sent ✅", 5000);
        setMsg("");
      } else {
        setMsg(data.message || "Failed to send OTP");
      }
    } catch (err) {
      console.error(err);
      setButtonLoading("otpBtn", false, "Send OTP");
      setMsg("Server error. Please try again.");
    }
  });
}

/* ================= RESET PASSWORD ================= */
const resetBtn = document.getElementById("resetBtn");
if (resetBtn) {
  setButtonLoading("resetBtn", false, "Reset Password");

  resetBtn.addEventListener("click", async () => {
    setMsg("");

    const identifier = String(document.getElementById("identifier").value || "").trim();
    const otp = String(document.getElementById("otp")?.value || "").trim();
    const newPassword = String(document.getElementById("newPassword").value || "");

    if (!identifier) return setMsg("Email or mobile is required.");
    if (!otp) return setMsg("OTP is required.");
    if (newPassword.length < 6) return setMsg("Password must be at least 6 characters.");

    setButtonLoading("resetBtn", true, "Reset Password");

    try {
      const res = await fetch("/user/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier, otp, newPassword }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        showToast("Password reset successfully ✅", 5000);
        redirectCountdown(5, "/login.html", "Password reset successfully ✅");
      } else {
        setButtonLoading("resetBtn", false, "Reset Password");
        setMsg(data.message || "Reset failed");
      }
    } catch (err) {
      console.error(err);
      setButtonLoading("resetBtn", false, "Reset Password");
      setMsg("Server error. Please try again.");
    }
  });
}