const MAX_VIDEO_SIZE = 30 * 1024 * 1024;
const CHAR_ALERT_LIMIT = 230;
const HARD_TWEET_LIMIT = 280;

const mediaInput = document.getElementById("mediaUpload");
const mediaPreviewBox = document.getElementById("mediaPreviewBox");
const mediaPreviewInner = document.getElementById("mediaPreviewInner");
const mediaSizeWarning = document.getElementById("mediaSizeWarning");

const singleProgressWrap = document.getElementById("singleUploadProgressWrap");
const singleProgressBar = document.getElementById("singleUploadProgressBar");
const singleProgressText = document.getElementById("singleUploadProgressText");

const bulkProgressWrap = document.getElementById("bulkUploadProgressWrap");
const bulkProgressBar = document.getElementById("bulkUploadProgressBar");
const bulkProgressText = document.getElementById("bulkUploadProgressText");

const trendEnabledToggle = document.getElementById("trendEnabledToggle");
const trendTitleInput = document.getElementById("trendTitleInput");
const trendOffMessageInput = document.getElementById("trendOffMessageInput");
const saveTrendSettingsBtn = document.getElementById("saveTrendSettingsBtn");

const contentInput = document.getElementById("content");
const contentCharCounter = document.getElementById("contentCharCounter");
const contentCharAlert = document.getElementById("contentCharAlert");

function setProgress(bar, text, wrap, percent) {
  if (!bar || !text || !wrap) return;
  wrap.style.display = "block";
  bar.style.width = percent + "%";
  text.innerText = percent + "%";
}

function resetProgress(bar, text, wrap) {
  if (!bar || !text || !wrap) return;
  bar.style.width = "0%";
  text.innerText = "0%";
  wrap.style.display = "none";
}

function clearMediaPreview() {
  if (mediaPreviewInner) mediaPreviewInner.innerHTML = "";
  if (mediaPreviewBox) mediaPreviewBox.style.display = "none";
  if (mediaSizeWarning) mediaSizeWarning.innerText = "";
}

function applyCharState(counterEl, alertEl, length) {
  if (!counterEl) return;

  counterEl.innerText = `${length} characters`;
  counterEl.classList.remove("limit-warning", "limit-danger");

  if (alertEl) alertEl.innerText = "";

  if (length >= HARD_TWEET_LIMIT) {
    counterEl.classList.add("limit-danger");
    if (alertEl) {
      alertEl.innerText = `Alert: character reached ${CHAR_ALERT_LIMIT}+ and now crossed ${HARD_TWEET_LIMIT}. You can still continue.`;
    }
  } else if (length >= CHAR_ALERT_LIMIT) {
    counterEl.classList.add("limit-warning");
    if (alertEl) {
      alertEl.innerText = `Alert: character reached ${CHAR_ALERT_LIMIT} limit type. You can still continue.`;
    }
  }
}

function updateMainCharCounter() {
  const length = (contentInput?.value || "").length;
  applyCharState(contentCharCounter, contentCharAlert, length);
}

function renderMediaPreview(file) {
  if (!file) {
    clearMediaPreview();
    return;
  }

  const allowedTypes = ["image/jpeg", "image/png", "video/mp4"];
  if (!allowedTypes.includes(file.type)) {
    showToast("Only JPEG, PNG and MP4 files are allowed.", "error");
    if (mediaInput) mediaInput.value = "";
    clearMediaPreview();
    return;
  }

  if (file.type === "video/mp4" && file.size > MAX_VIDEO_SIZE) {
    if (mediaSizeWarning) mediaSizeWarning.innerText = "Video size must be 30MB or less.";
  } else {
    if (mediaSizeWarning) mediaSizeWarning.innerText = "";
  }

  const fileURL = URL.createObjectURL(file);

  mediaPreviewInner.textContent = "";

  const wrap = document.createElement("div");
  wrap.className = "preview-media-card preview-media-card--admin";

  if (file.type === "video/mp4") {
    const video = document.createElement("video");
    video.src = fileURL;
    video.className = "preview-media-el preview-media-el--video";
    video.controls = true;
    video.preload = "metadata";
    wrap.appendChild(video);
  } else {
    const img = document.createElement("img");
    img.src = fileURL;
    img.alt = "Preview";
    img.className = "preview-media-el preview-media-el--image";
    wrap.appendChild(img);
  }

  mediaPreviewInner.appendChild(wrap);

  if (mediaPreviewBox) mediaPreviewBox.style.display = "block";
}

if (mediaInput) {
  mediaInput.addEventListener("change", () => {
    const file = mediaInput.files[0];
    renderMediaPreview(file);
  });
}

if (contentInput) {
  contentInput.addEventListener("input", updateMainCharCounter);
  updateMainCharCounter();
}

function uploadWithProgress({ url, formData, onProgress, onSuccess, onError }) {
  const xhr = new XMLHttpRequest();
  xhr.open("POST", url, true);
  xhr.withCredentials = true;

  xhr.upload.addEventListener("progress", (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      onProgress(percent);
    }
  });

  xhr.onload = () => {
    let data = {};
    try {
      data = JSON.parse(xhr.responseText || "{}");
    } catch (_) {}

    if (xhr.status >= 200 && xhr.status < 300 && data.success) {
      onSuccess(data);
    } else {
      onError(data.message || "Upload failed");
    }
  };

  xhr.onerror = () => onError("Network error");
  xhr.send(formData);
}

/* ================= MANUAL TWEET ================= */
const addBtn = document.getElementById("addBtn");
if (addBtn) {
  addBtn.addEventListener("click", async () => {
    const content = (document.getElementById("content")?.value || "").trim();
    const mediaFile = mediaInput ? mediaInput.files[0] : null;

if (!content) {
  showToast("Please enter tweet content.", "error");
  return;
}

if (content.length >= CHAR_ALERT_LIMIT) {
  showToast(`Alert: character reached ${CHAR_ALERT_LIMIT} limit type. Post will still be published.`, "error");
}

    if (mediaFile) {
      const allowedTypes = ["image/jpeg", "image/png", "video/mp4"];

      if (!allowedTypes.includes(mediaFile.type)) {
        showToast("Only JPEG, PNG and MP4 files are allowed.", "error");
        return;
      }

      if (mediaFile.type === "video/mp4" && mediaFile.size > MAX_VIDEO_SIZE) {
        showToast("Video size must be 30MB or less.", "error");
        return;
      }
    }

    const formData = new FormData();
    formData.append("content", content);
    if (mediaFile) formData.append("media", mediaFile);

    uploadWithProgress({
      url: "/admin/addTweet",
      formData,
      onProgress: (percent) => setProgress(singleProgressBar, singleProgressText, singleProgressWrap, percent),
onSuccess: () => {
  showToast("Tweet Published Successfully 🚀", "success");
  document.getElementById("content").value = "";
  if (mediaInput) mediaInput.value = "";
  clearMediaPreview();
  updateMainCharCounter();
  setTimeout(() => resetProgress(singleProgressBar, singleProgressText, singleProgressWrap), 800);
},
      onError: (message) => {
        showToast(message || "Failed to publish tweet.", "error");
        setTimeout(() => resetProgress(singleProgressBar, singleProgressText, singleProgressWrap), 800);
      }
    });
  });
}

/* ================= BULK TWEET + MEDIA ================= */
const batchBtn = document.getElementById("batchUploadBtn");
if (batchBtn) {
  batchBtn.addEventListener("click", () => {
    const textFile = document.getElementById("batchUpload")?.files[0];
    const mediaFiles = Array.from(document.getElementById("bulkMediaUpload")?.files || []);

    if (!textFile) {
      showToast("Please select bulk text file first.", "error");
      return;
    }

    const allowedText = [
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ];

    const validTextExt = [".txt", ".doc", ".docx"];
    const lowerName = textFile.name.toLowerCase();
    const textAllowed = allowedText.includes(textFile.type) || validTextExt.some(ext => lowerName.endsWith(ext));

    if (!textAllowed) {
      showToast("Bulk text file must be TXT, DOC, or DOCX.", "error");
      return;
    }

    for (const file of mediaFiles) {
      const allowedTypes = ["image/jpeg", "image/png", "video/mp4"];
      if (!allowedTypes.includes(file.type)) {
        showToast(`Invalid media file: ${file.name}`, "error");
        return;
      }
      if (file.type === "video/mp4" && file.size > MAX_VIDEO_SIZE) {
        showToast(`Video too large: ${file.name} (max 30MB)`, "error");
        return;
      }
    }

    const formData = new FormData();
    formData.append("batchFile", textFile);
    mediaFiles.forEach(file => formData.append("mediaFiles", file));

    uploadWithProgress({
      url: "/admin/batchUploadWithMedia",
      formData,
      onProgress: (percent) => setProgress(bulkProgressBar, bulkProgressText, bulkProgressWrap, percent),
      onSuccess: (data) => {
        const total = data.total || 0;
        showToast(`Bulk upload complete ✅ ${total} posts created`, "success");
        document.getElementById("batchUpload").value = "";
        const bulkMediaInput = document.getElementById("bulkMediaUpload");
        if (bulkMediaInput) bulkMediaInput.value = "";
        setTimeout(() => resetProgress(bulkProgressBar, bulkProgressText, bulkProgressWrap), 800);
      },
      onError: (message) => {
        showToast(message || "Bulk upload failed", "error");
        setTimeout(() => resetProgress(bulkProgressBar, bulkProgressText, bulkProgressWrap), 800);
      }
    });
  });
}

/* ================= LEADER MANAGEMENT ================= */
async function loadLeadersDashboard() {
  try {
    const res = await fetch("/getMentions", { credentials: "include" });
    const leaders = await res.json();

    const container = document.getElementById("leaderListDashboard");
    if (!container) return;

    container.textContent = "";

    if (!Array.isArray(leaders) || leaders.length === 0) {
      const p = document.createElement("p");
      p.style.marginTop = "10px";
      p.innerText = "No leaders added.";
      container.appendChild(p);
      return;
    }

    leaders.forEach((l, index) => {
      const row = document.createElement("div");
      row.className = "leader-row";

      const span = document.createElement("span");
      span.innerText = String(l || "");

      const btn = document.createElement("button");
      btn.type = "button";
      btn.innerText = "Delete";
      btn.addEventListener("click", () => deleteLeader(index));

      row.appendChild(span);
      row.appendChild(btn);
      container.appendChild(row);
    });
  } catch (e) {
    console.error(e);
    showToast("Failed to load leaders.", "error");
  }
}

const addLeaderBtn = document.getElementById("addLeaderBtn");
if (addLeaderBtn) {
  addLeaderBtn.addEventListener("click", async () => {
    const input = document.getElementById("newLeader");
    const name = (input?.value || "").trim();

    if (!name) {
      showToast("Please enter leader name.", "error");
      return;
    }

    const res = await fetch("/admin/addMention", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name })
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data.success) {
      input.value = "";
      showToast("Leader added successfully ✅", "success");
      loadLeadersDashboard();
    } else {
      showToast(data.message || "Failed to add leader.", "error");
    }
  });
}

async function deleteLeader(index) {
  const res = await fetch(`/admin/deleteMention/${index}`, {
    method: "DELETE",
    credentials: "include"
  });

  const data = await res.json().catch(() => ({}));

  if (res.ok && data.success) {
    showToast("Leader deleted ✅", "success");
    loadLeadersDashboard();
  } else {
    showToast(data.message || "Failed to delete leader.", "error");
  }
}

window.deleteLeader = deleteLeader;

/* ================= TREND SETTINGS ================= */
async function loadTrendSettings() {
  try {
    const res = await fetch("/admin/getTrendSettings", { credentials: "include" });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success) return;

    if (trendEnabledToggle) trendEnabledToggle.checked = !!data.settings?.enabled;
    if (trendTitleInput) trendTitleInput.value = data.settings?.title || "";
    if (trendOffMessageInput) trendOffMessageInput.value = data.settings?.message || "";
  } catch (e) {
    console.error(e);
  }
}

if (saveTrendSettingsBtn) {
  saveTrendSettingsBtn.addEventListener("click", async () => {
    try {
      const res = await fetch("/admin/saveTrendSettings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          enabled: !!trendEnabledToggle?.checked,
          title: (trendTitleInput?.value || "").trim(),
          message: (trendOffMessageInput?.value || "").trim()
        })
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        showToast("Trend settings saved ✅", "success");
      } else {
        showToast(data.message || "Failed to save trend settings.", "error");
      }
    } catch (e) {
      console.error(e);
      showToast("Failed to save trend settings.", "error");
    }
  });
}

/* ================= INITIAL LOAD ================= */
loadLeadersDashboard();
loadTrendSettings();