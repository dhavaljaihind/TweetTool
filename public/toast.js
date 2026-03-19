function showToast(msg, typeOrDuration, maybeDuration) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    document.body.appendChild(toast);
  }

  let type = "info";
  let duration = 3200;

  if (typeof typeOrDuration === "number") {
    duration = typeOrDuration;
  } else if (typeof typeOrDuration === "string" && typeOrDuration.trim()) {
    type = typeOrDuration.trim().toLowerCase();
    if (typeof maybeDuration === "number") {
      duration = maybeDuration;
    }
  }

  const themes = {
    success: {
      bg: "linear-gradient(135deg, #16a34a, #15803d)",
      shadow: "0 18px 40px rgba(22, 163, 74, 0.28)",
      border: "1px solid rgba(255,255,255,0.22)"
    },
    error: {
      bg: "linear-gradient(135deg, #ef4444, #dc2626)",
      shadow: "0 18px 40px rgba(220, 38, 38, 0.28)",
      border: "1px solid rgba(255,255,255,0.18)"
    },
    warning: {
      bg: "linear-gradient(135deg, #f59e0b, #d97706)",
      shadow: "0 18px 40px rgba(217, 119, 6, 0.28)",
      border: "1px solid rgba(255,255,255,0.18)"
    },
    info: {
      bg: "linear-gradient(135deg, #2563eb, #1d4ed8)",
      shadow: "0 18px 40px rgba(37, 99, 235, 0.28)",
      border: "1px solid rgba(255,255,255,0.2)"
    }
  };

  const theme = themes[type] || themes.info;

  toast.innerText = msg;

  toast.style.position = "fixed";
  toast.style.top = "24px";
  toast.style.left = "50%";
  toast.style.transform = "translate(-50%, -20px)";
  toast.style.width = "min(92vw, 420px)";
  toast.style.maxWidth = "420px";
  toast.style.padding = "14px 18px";
  toast.style.borderRadius = "16px";
  toast.style.background = theme.bg;
  toast.style.color = "#ffffff";
  toast.style.fontSize = "14px";
  toast.style.fontWeight = "700";
  toast.style.lineHeight = "1.5";
  toast.style.textAlign = "center";
  toast.style.boxShadow = theme.shadow;
  toast.style.border = theme.border;
  toast.style.backdropFilter = "blur(12px)";
  toast.style.webkitBackdropFilter = "blur(12px)";
  toast.style.zIndex = "99999";
  toast.style.opacity = "0";
  toast.style.pointerEvents = "none";
  toast.style.transition = "opacity 0.28s ease, transform 0.28s ease";

  if (window.innerWidth <= 520) {
    toast.style.top = "14px";
    toast.style.width = "calc(100vw - 20px)";
    toast.style.maxWidth = "calc(100vw - 20px)";
    toast.style.padding = "13px 14px";
    toast.style.fontSize = "13px";
    toast.style.borderRadius = "14px";
  }

  requestAnimationFrame(() => {
    toast.style.opacity = "1";
    toast.style.transform = "translate(-50%, 0)";
  });

  if (toast._hideTimer) clearTimeout(toast._hideTimer);
  if (toast._clearTimer) clearTimeout(toast._clearTimer);

  toast._hideTimer = setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translate(-50%, -12px)";
  }, duration);

  toast._clearTimer = setTimeout(() => {
    toast.innerText = "";
  }, duration + 320);
}

window.showToast = showToast;