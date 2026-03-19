const MANAGE_CHAR_ALERT_LIMIT = 230;
const MANAGE_HARD_TWEET_LIMIT = 280;

function safeText(value) {
  return String(value ?? "");
}

function safeMediaPath(value) {
  const s = String(value || "").trim();
  if (!s) return "";
  if (!s.startsWith("/uploads/posts/")) return "";
  if (/[<>"'`\\]/.test(s)) return "";
  return s;
}

function clearElement(el) {
  while (el && el.firstChild) el.removeChild(el.firstChild);
}

function updateManageCharUI(counterEl, alertEl, length) {
  if (!counterEl) return;

  counterEl.innerText = `${length} characters`;
  counterEl.classList.remove("limit-warning", "limit-danger");

  if (alertEl) alertEl.innerText = "";

  if (length >= MANAGE_HARD_TWEET_LIMIT) {
    counterEl.classList.add("limit-danger");
    if (alertEl) {
      alertEl.innerText = `Alert: character reached ${MANAGE_CHAR_ALERT_LIMIT}+ and now crossed ${MANAGE_HARD_TWEET_LIMIT}. You can still continue.`;
    }
  } else if (length >= MANAGE_CHAR_ALERT_LIMIT) {
    counterEl.classList.add("limit-warning");
    if (alertEl) {
      alertEl.innerText = `Alert: character reached ${MANAGE_CHAR_ALERT_LIMIT} limit type. You can still continue.`;
    }
  }
}

async function loadTweets() {
  try {
    const res = await fetch("/getTweets", { credentials: "include" });
    const tweets = await res.json();

    const container = document.getElementById("tweetList");
    clearElement(container);

    if (!Array.isArray(tweets) || tweets.length === 0) {
      const p = document.createElement("p");
      p.innerText = "No tweets found.";
      container.appendChild(p);
      return;
    }

    tweets.reverse().forEach(t => {
      const card = document.createElement("div");
      card.className = "tweet-manage-card glass-card";

      const mediaPath = safeMediaPath(t.media);

      const textarea = document.createElement("textarea");
      textarea.className = "manage-textarea";
      textarea.value = safeText(t.content);

      const manageCharCounter = document.createElement("div");
      manageCharCounter.className = "manage-char-counter";
      manageCharCounter.innerText = "0 characters";

      const manageCharAlert = document.createElement("div");
      manageCharAlert.className = "manage-char-alert-text";

      const previewWrap = document.createElement("div");
      previewWrap.className = "manage-preview-wrap";

      if (!mediaPath) {
        const noMedia = document.createElement("div");
        noMedia.className = "manage-no-media";
        noMedia.innerText = "No media uploaded";
        previewWrap.appendChild(noMedia);
      } else if (mediaPath.toLowerCase().endsWith(".mp4")) {
        const videoCard = document.createElement("div");
        videoCard.className = "manage-video-card";

        const video = document.createElement("video");
        video.src = mediaPath;
        video.className = "manage-img manage-video-thumb";
        video.controls = true;
        video.preload = "metadata";
        video.muted = true;
        video.playsInline = true;

        const badge = document.createElement("div");
        badge.className = "manage-media-badge";
        badge.innerText = "MP4 Video";

        videoCard.appendChild(video);
        videoCard.appendChild(badge);
        previewWrap.appendChild(videoCard);
      } else {
        const imageCard = document.createElement("div");
        imageCard.className = "manage-image-card";

        const img = document.createElement("img");
        img.src = mediaPath;
        img.className = "manage-img";
        img.alt = "Post media";

        const badge = document.createElement("div");
        badge.className = "manage-media-badge";
        badge.innerText = "Image";

        imageCard.appendChild(img);
        imageCard.appendChild(badge);
        previewWrap.appendChild(imageCard);
      }

      const mediaInput = document.createElement("input");
      mediaInput.type = "file";
      mediaInput.className = "manage-media-input";
      mediaInput.accept = "image/jpeg,image/png,video/mp4";

      const sizeWarning = document.createElement("small");
      sizeWarning.className = "manage-size-warning";
      sizeWarning.style.display = "block";
      sizeWarning.style.color = "#d32f2f";
      sizeWarning.style.marginTop = "4px";

      const progressWrap = document.createElement("div");
      progressWrap.className = "manage-upload-progress-wrap";
      progressWrap.style.display = "none";

      const progressBar = document.createElement("div");
      progressBar.className = "upload-progress-bar";

      const progressFill = document.createElement("div");
      progressFill.className = "manage-upload-progress-fill";

      const progressText = document.createElement("div");
      progressText.className = "manage-upload-progress-text";
      progressText.innerText = "0%";

      progressBar.appendChild(progressFill);
      progressWrap.appendChild(progressBar);
      progressWrap.appendChild(progressText);

      const buttons = document.createElement("div");
      buttons.className = "manage-buttons";

      const updateBtn = document.createElement("button");
      updateBtn.className = "update-btn";
      updateBtn.type = "button";
      updateBtn.innerText = "Update";

      const replaceBtn = document.createElement("button");
      replaceBtn.className = "replace-btn";
      replaceBtn.type = "button";
      replaceBtn.innerText = mediaPath ? "Replace Media" : "Upload Media";

      let removeMediaBtn = null;
      if (mediaPath) {
        removeMediaBtn = document.createElement("button");
        removeMediaBtn.className = "remove-media-btn";
        removeMediaBtn.type = "button";
        removeMediaBtn.innerText = "Remove Media";
      }

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "delete-btn";
      deleteBtn.type = "button";
      deleteBtn.innerText = "Delete";

      buttons.appendChild(updateBtn);
      buttons.appendChild(replaceBtn);
      if (removeMediaBtn) buttons.appendChild(removeMediaBtn);
      buttons.appendChild(deleteBtn);

      card.appendChild(textarea);
      card.appendChild(manageCharCounter);
      card.appendChild(manageCharAlert);
      card.appendChild(previewWrap);
      card.appendChild(mediaInput);
      card.appendChild(sizeWarning);
      card.appendChild(progressWrap);
      card.appendChild(buttons);

      container.appendChild(card);

// Elements already created safely above

autoExpand(textarea);

function refreshManageCounter() {
  updateManageCharUI(manageCharCounter, manageCharAlert, (textarea.value || "").length);
}

textarea.addEventListener("input", refreshManageCounter);
refreshManageCounter();

      function setCardProgress(percent) {
        progressWrap.style.display = "block";
        progressFill.style.width = percent + "%";
        progressText.innerText = percent + "%";
      }

      function resetCardProgress() {
        progressFill.style.width = "0%";
        progressText.innerText = "0%";
        progressWrap.style.display = "none";
      }

      mediaInput.addEventListener("change", () => {
        const file = mediaInput.files[0];
        sizeWarning.innerText = "";

        if (!file) return;

        const allowedTypes = ["image/jpeg", "image/png", "video/mp4"];
        if (!allowedTypes.includes(file.type)) {
          showToast("Only JPEG, PNG and MP4 files are allowed.", 3000);
          mediaInput.value = "";
          return;
        }

        if (file.type === "video/mp4" && file.size > 30 * 1024 * 1024) {
          sizeWarning.innerText = "Video size must be 30MB or less.";
        }
      });

updateBtn.addEventListener("click", async () => {
if ((textarea.value || "").length >= MANAGE_CHAR_ALERT_LIMIT) {
  showToast(`Alert: character reached ${MANAGE_CHAR_ALERT_LIMIT} limit type. Update will still continue.`, 3000);
}

  const r = await fetch(`/admin/updateTweet/${t.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ content: textarea.value })
  });

  if (r.ok) {
    showToast("Tweet Updated Successfully ✅", 3000);
    loadTweets();
  } else {
    showToast("Update failed ❌", 3000);
  }
});

replaceBtn.addEventListener("click", async () => {
  const file = mediaInput.files[0];

  if (!file) {
    showToast("Please select a media file first.", 3000);
    return;
  }

  const allowedTypes = ["image/jpeg", "image/png", "video/mp4"];
  if (!allowedTypes.includes(file.type)) {
    showToast("Only JPEG, PNG and MP4 files are allowed.", 3000);
    mediaInput.value = "";
    return;
  }

  if (file.type === "video/mp4" && file.size > 30 * 1024 * 1024) {
    showToast("Video size must be 30MB or less.", 3000);
    return;
  }

  const fd = new FormData();
  fd.append("media", file);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", `/admin/uploadTweetMedia/${t.id}`, true);
  xhr.withCredentials = true;

  xhr.upload.addEventListener("progress", (e) => {
    if (e.lengthComputable) {
      const percent = Math.round((e.loaded / e.total) * 100);
      setCardProgress(percent);
    }
  });

  xhr.onload = () => {
    let data = {};
    try {
      data = JSON.parse(xhr.responseText || "{}");
    } catch (_) {}

    if (xhr.status >= 200 && xhr.status < 300 && data.success) {
      showToast(t.media ? "Media replaced successfully ✅" : "Media uploaded successfully ✅", 3000);
      loadTweets();
    } else {
      showToast(data.message || "Media replace failed ❌", 3000);
      setTimeout(resetCardProgress, 800);
    }
  };

  xhr.onerror = () => {
    showToast("Upload failed ❌", 3000);
    setTimeout(resetCardProgress, 800);
  };

  xhr.send(fd);
});

// removeMediaBtn already created above when media exists
if (removeMediaBtn) {
  removeMediaBtn.addEventListener("click", async () => {
    const ok = confirm("Remove media from this post?");
    if (!ok) return;

    try {
      const res = await fetch(`/admin/removeTweetMedia/${t.id}`, {
        method: "POST",
        credentials: "include"
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        showToast("Media removed successfully ✅", 3000);
        loadTweets();
      } else {
        showToast(data.message || "Remove media failed ❌", 3000);
      }
    } catch (err) {
      console.error(err);
      showToast("Remove media failed ❌", 3000);
    }
  });
}

      deleteBtn.addEventListener("click", async () => {
        const ok = confirm("Delete this tweet?");
        if (!ok) return;

        const r = await fetch(`/admin/deleteTweet/${t.id}`, {
          method: "DELETE",
          credentials: "include"
        });

        if (r.ok) {
          showToast("Tweet Deleted ❌", 3000);
          loadTweets();
        } else {
          showToast("Delete failed ❌", 3000);
        }
      });
    });

  } catch (err) {
    console.error(err);
    const container = document.getElementById("tweetList");
    if (container) {
      clearElement(container);
      const p = document.createElement("p");
      p.innerText = "Failed to load tweets. Check console.";
      container.appendChild(p);
    }
  }
}

/* DELETE ALL POSTS */
document.addEventListener("click", async (e) => {
  if (e.target.id === "deleteAllTweets") {
    const ok = confirm("Delete ALL tweets permanently?");
    if (!ok) return;

    const r = await fetch("/admin/deleteAllTweets", {
      method: "DELETE",
      credentials: "include"
    });

    if (r.ok) {
      showToast("All Tweets Deleted ❌", 3000);
      loadTweets();
    } else {
      showToast("Failed to delete all tweets ❌", 3000);
    }
  }
});

function autoExpand(field) {
  field.style.height = "auto";
  field.style.height = field.scrollHeight + "px";
  field.addEventListener("input", () => {
    field.style.height = "auto";
    field.style.height = field.scrollHeight + "px";
  });
}

window.loadTweets = loadTweets;

if (document.getElementById("tweetList")) loadTweets();