let socialVerified = {
  twitter: false,
  instagram: false,
  facebook: false
};

let MASTER_DATA = {
  countries: [],
  states: [],
  cities: [],
  loksabhas: [],
  vidhansabhas: [],
  wards: [],
  designations: []
};

function sortByNameForDropdown(list = []) {
  return [...list].sort((a, b) =>
    String(a?.name || "").trim().localeCompare(
      String(b?.name || "").trim(),
      undefined,
      {
        numeric: true,
        sensitivity: "base"
      }
    )
  );
}

const countryEl = document.getElementById("country");
const stateEl = document.getElementById("state");
const cityEl = document.getElementById("city");
const loksabhaEl = document.getElementById("loksabha");
const vidhansabhaEl = document.getElementById("vidhansabha");
const wardEl = document.getElementById("ward");
const designationEl = document.getElementById("designation");

const boothNoEl = document.getElementById("boothNo");
const primaryMemberNoEl = document.getElementById("primaryMemberNo");
const sakriyaSabhyaNoEl = document.getElementById("sakriyaSabhyaNo");

const twitterInput = document.getElementById("twitter");
const instagramInput = document.getElementById("instagram");
const facebookInput = document.getElementById("facebook");

const verifyTwitterBtn = document.getElementById("verifyTwitterBtn");
const verifyInstagramBtn = document.getElementById("verifyInstagramBtn");
const verifyFacebookBtn = document.getElementById("verifyFacebookBtn");

const twitterVerifiedBox = document.getElementById("twitterVerifiedBox");
const instagramVerifiedBox = document.getElementById("instagramVerifiedBox");
const facebookVerifiedBox = document.getElementById("facebookVerifiedBox");

const submitBtn = document.getElementById("submitBtn");

function setOptions(sel, items, placeholder, allowEmpty = true) {
  if (!sel) return;

  const list = Array.isArray(items) ? items : [];
  const prevValue = sel.value || "";

  sel.innerHTML = "";

  const shouldAutoSelectSingle = list.length === 1;

  if (!shouldAutoSelectSingle) {
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = placeholder;
    opt0.disabled = !allowEmpty;
    opt0.selected = true;
    sel.appendChild(opt0);
  }

  list.forEach((x) => {
    const opt = document.createElement("option");
    opt.value = x.id;
    opt.textContent = x.name;
    sel.appendChild(opt);
  });

  if (shouldAutoSelectSingle) {
    sel.value = list[0].id;
    sel.disabled = true;
    return;
  }

  sel.disabled = false;

  const hasPrev = list.some((x) => String(x.id) === String(prevValue));
  sel.value = hasPrev ? prevValue : "";
}

function disableSelect(sel, placeholder) {
  if (!sel) return;
  setOptions(sel, [], placeholder, true);
  sel.disabled = true;
}

function enableSelect(sel) {
  if (!sel) return;
  sel.disabled = false;
}

function normalizeUsername(v) {
  let s = String(v || "").trim();
  if (!s) return "";

  s = s.replace(/^https?:\/\/(www\.)?/i, "");
  s = s.replace(/^(mobile\.)/i, "");
  s = s.replace(/^x\.com\//i, "");
  s = s.replace(/^twitter\.com\//i, "");
  s = s.replace(/^instagram\.com\//i, "");
  s = s.replace(/^facebook\.com\//i, "");
  s = s.replace(/^fb\.com\//i, "");

  s = s.split("?")[0];
  s = s.split("#")[0];
  s = s.replace(/^@+/, "");
  s = s.replace(/^\/+|\/+$/g, "");
  s = s.trim();

  return s;
}

function getPlatformUsername(platform, value) {
  const clean = normalizeUsername(value);
  if (!clean) return "";

  if (platform === "facebook") return clean;
  return "@" + clean;
}
function setVerifiedUi(platform, ok) {
  const boxMap = {
    twitter: twitterVerifiedBox,
    instagram: instagramVerifiedBox,
    facebook: facebookVerifiedBox
  };

  const box = boxMap[platform];
  if (!box) return;

  socialVerified[platform] = !!ok;

  if (ok) {
    box.innerText = "Verified ✅";
    box.style.background = "#dcfce7";
    box.style.color = "#166534";
    box.style.border = "1px solid #86efac";
  } else {
    box.innerText = "Not Verified";
    box.style.background = "#f3f4f6";
    box.style.color = "#374151";
    box.style.border = "1px solid #e5e7eb";
  }

  const anySocialVerified =
    socialVerified.twitter ||
    socialVerified.instagram ||
    socialVerified.facebook;

  if (submitBtn) {
    submitBtn.style.display = anySocialVerified ? "inline-flex" : "none";
  }
}

function resetAllVerification() {
  setVerifiedUi("twitter", false);
  setVerifiedUi("instagram", false);
  setVerifiedUi("facebook", false);
}

function getPlatformInput(platform) {
  if (platform === "twitter") return twitterInput;
  if (platform === "instagram") return instagramInput;
  if (platform === "facebook") return facebookInput;
  return null;
}

function getPlatformButton(platform) {
  if (platform === "twitter") return verifyTwitterBtn;
  if (platform === "instagram") return verifyInstagramBtn;
  if (platform === "facebook") return verifyFacebookBtn;
  return null;
}

async function verifyPlatform(platform) {
  const input = getPlatformInput(platform);
  const btn = getPlatformButton(platform);
  const username = getPlatformUsername(platform, input?.value || "");

  if (!username) {
    showToast(`Enter ${platform} username first`, "warning", 3000);
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerText = "Verifying...";
  }

  try {
    const res = await fetch("/user/verify-social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ platform, username })
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      showToast("Session expired. Please login again.", "error", 2500);
      setTimeout(() => {
        window.location.href = "/login.html";
      }, 800);
      return;
    }

    if (res.ok && data.success) {
      if (input) input.value = data.username || getPlatformUsername(platform, input?.value || "");
      setVerifiedUi(platform, true);
      showToast(`${platform} verified successfully`, "success", 2500);
    } else {
      setVerifiedUi(platform, false);
      showToast(data.message || "Verification failed", "error", 3500);
    }
  } catch (err) {
    console.error(err);
    setVerifiedUi(platform, false);
    showToast("Verification failed. Please try again.", "error", 3500);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText =
        platform === "twitter"
          ? "Verify Twitter"
          : platform === "instagram"
          ? "Verify Instagram"
          : "Verify Facebook";
    }
  }
}

async function loadMasterData() {
  try {
    const res = await fetch("/api/masterData", {
      credentials: "include",
      headers: { Accept: "application/json" }
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      showToast("Session expired. Please login again.", 2500);
      setTimeout(() => {
        window.location.href = "/login.html";
      }, 800);
      return;
    }

    if (!res.ok || !data.success) {
      throw new Error(data.message || "Failed to load masters data");
    }

    MASTER_DATA = {
      countries: sortByNameForDropdown(
        Array.isArray(data.masters?.countries) ? data.masters.countries : []
      ),
      states: sortByNameForDropdown(
        Array.isArray(data.masters?.states) ? data.masters.states : []
      ),
      cities: sortByNameForDropdown(
        Array.isArray(data.masters?.cities) ? data.masters.cities : []
      ),
      loksabhas: sortByNameForDropdown(
        Array.isArray(data.masters?.loksabhas) ? data.masters.loksabhas : []
      ),
      vidhansabhas: sortByNameForDropdown(
        Array.isArray(data.masters?.vidhansabhas) ? data.masters.vidhansabhas : []
      ),
      wards: sortByNameForDropdown(
        Array.isArray(data.masters?.wards) ? data.masters.wards : []
      ),
      designations: sortByNameForDropdown(
        Array.isArray(data.masters?.designations) ? data.masters.designations : []
      )
    };

    setOptions(countryEl, MASTER_DATA.countries, "Select Country");
    setOptions(designationEl, MASTER_DATA.designations, "Select Designation");

    if (!countryEl.disabled) {
      enableSelect(countryEl);
    }

    if (!designationEl.disabled) {
      enableSelect(designationEl);
    }

    disableSelect(stateEl, "Select State");
    disableSelect(cityEl, "Select City / District / Taluka");
    disableSelect(loksabhaEl, "Select Lok Sabha");
    disableSelect(vidhansabhaEl, "Select Vidhan Sabha");
    disableSelect(wardEl, "Select Ward (Optional)");

    if (countryEl?.value) {
      countryEl.dispatchEvent(new Event("change"));
    }

    resetAllVerification();
  } catch (err) {
    console.error("Master load error:", err);
    showToast("Failed to load masters data", 3500);
  }
}

countryEl?.addEventListener("change", () => {
  const countryId = countryEl.value;

  disableSelect(stateEl, "Select State");
  disableSelect(cityEl, "Select City");
  disableSelect(loksabhaEl, "Select Lok Sabha");
  disableSelect(vidhansabhaEl, "Select Vidhan Sabha");
  disableSelect(wardEl, "Select Ward");

  if (!countryId) return;

  const states = sortByNameForDropdown(
    MASTER_DATA.states.filter((x) => String(x.countryId) === String(countryId))
  );
  setOptions(stateEl, states, "Select State");
  stateEl.dispatchEvent(new Event("change"));
});

stateEl?.addEventListener("change", () => {
  const stateId = stateEl.value;

  disableSelect(cityEl, "Select City");
  disableSelect(loksabhaEl, "Select Lok Sabha");
  disableSelect(vidhansabhaEl, "Select Vidhan Sabha");
  disableSelect(wardEl, "Select Ward");

  if (!stateId) return;

  const cities = sortByNameForDropdown(
    MASTER_DATA.cities.filter((x) => String(x.stateId) === String(stateId))
  );
  const loksabhas = sortByNameForDropdown(
    MASTER_DATA.loksabhas.filter((x) => String(x.stateId) === String(stateId))
  );

  setOptions(cityEl, cities, "Select City");
  setOptions(loksabhaEl, loksabhas, "Select Lok Sabha");

  cityEl.dispatchEvent(new Event("change"));
  loksabhaEl.dispatchEvent(new Event("change"));
});

function refreshWardOptions() {
  const cityId = cityEl?.value || "";
  const vidhansabhaId = vidhansabhaEl?.value || "";

  disableSelect(wardEl, "Select Ward (Optional)");

  if (!cityId || !vidhansabhaId) return;

  const wards = sortByNameForDropdown(
    MASTER_DATA.wards.filter(
      (x) =>
        String(x.cityId) === String(cityId) &&
        String(x.vidhansabhaId) === String(vidhansabhaId)
    )
  );

  setOptions(wardEl, wards, "Select Ward (Optional)");

  if (!wardEl.disabled) {
    enableSelect(wardEl);
  }
}

cityEl?.addEventListener("change", refreshWardOptions);

loksabhaEl?.addEventListener("change", () => {
  const lokId = loksabhaEl.value;

  disableSelect(vidhansabhaEl, "Select Vidhan Sabha");
  disableSelect(wardEl, "Select Ward");

  if (!lokId) return;

  const vidhansabhas = sortByNameForDropdown(
    MASTER_DATA.vidhansabhas.filter((x) => String(x.lokId) === String(lokId))
  );

  setOptions(vidhansabhaEl, vidhansabhas, "Select Vidhan Sabha");

  if (!vidhansabhaEl.disabled) {
    enableSelect(vidhansabhaEl);
  }

  vidhansabhaEl.dispatchEvent(new Event("change"));
});

vidhansabhaEl?.addEventListener("change", refreshWardOptions);

verifyTwitterBtn?.addEventListener("click", async () => {
  await verifyPlatform("twitter");
});

verifyInstagramBtn?.addEventListener("click", async () => {
  await verifyPlatform("instagram");
});

verifyFacebookBtn?.addEventListener("click", async () => {
  await verifyPlatform("facebook");
});

twitterInput?.addEventListener("input", () => {
  setVerifiedUi("twitter", false);
});

instagramInput?.addEventListener("input", () => {
  setVerifiedUi("instagram", false);
});

facebookInput?.addEventListener("input", () => {
  setVerifiedUi("facebook", false);
});

submitBtn?.addEventListener("click", async () => {
  const payload = {
    countryId: countryEl?.value || "",
    stateId: stateEl?.value || "",
    cityId: cityEl?.value || "",
    loksabhaId: loksabhaEl?.value || "",
    vidhansabhaId: vidhansabhaEl?.value || "",
    wardId: wardEl?.value || "",
    designationId: designationEl?.value || "",
    boothNo: (boothNoEl?.value || "").trim(),
    primaryMemberNo: (primaryMemberNoEl?.value || "").trim(),
    sakriyaSabhyaNo: (sakriyaSabhyaNoEl?.value || "").trim(),
twitter: getPlatformUsername("twitter", twitterInput?.value || ""),
instagram: getPlatformUsername("instagram", instagramInput?.value || ""),
facebook: getPlatformUsername("facebook", facebookInput?.value || ""),
    twitterVerified: !!socialVerified.twitter,
    instagramVerified: !!socialVerified.instagram,
    facebookVerified: !!socialVerified.facebook
  };

  if (
    !payload.countryId ||
    !payload.stateId ||
    !payload.cityId ||
    !payload.loksabhaId ||
    !payload.vidhansabhaId ||
    !payload.designationId
  ) {
    showToast("Please complete all required selections", 3000);
    return;
  }

  if (payload.twitter && !payload.twitterVerified) {
    showToast("Please verify your Twitter ID first", 3000);
    return;
  }

  if (payload.instagram && !payload.instagramVerified) {
    showToast("Please verify your Instagram ID first", 3000);
    return;
  }

  if (payload.facebook && !payload.facebookVerified) {
    showToast("Please verify your Facebook ID first", 3000);
    return;
  }

  submitBtn.disabled = true;
  submitBtn.innerText = "Submitting...";

  try {
    const res = await fetch("/user/saveProfile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      showToast("Session expired. Please login again.", 2500);
      setTimeout(() => {
        window.location.href = "/login.html";
      }, 800);
      return;
    }

    if (res.ok && data.success) {
      showToast("Profile saved successfully", 2500);
      setTimeout(() => {
        window.location.href = "/login.html";
      }, 1200);
    } else {
      showToast(data.message || "Failed to save profile", 3500);
    }
  } catch (err) {
    console.error(err);
    showToast("Server error while saving profile", 3500);
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerText = "Submit Profile";
  }
});

loadMasterData();