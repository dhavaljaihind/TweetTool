let M = null;

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

function sortMastersForDropdown(masters = {}) {
  return {
    ...masters,
    countries: sortByNameForDropdown(masters.countries || []),
    states: sortByNameForDropdown(masters.states || []),
    cities: sortByNameForDropdown(masters.cities || []),
    loksabhas: sortByNameForDropdown(masters.loksabhas || []),
    vidhansabhas: sortByNameForDropdown(masters.vidhansabhas || []),
    wards: sortByNameForDropdown(masters.wards || []),
    designations: sortByNameForDropdown(masters.designations || [])
  };
}

function getSelectedValues() {
  const ids = [
    "stateCountry",
    "cityCountry",
    "cityState",
    "lokCountry",
    "lokState",
    "vidCountry",
    "vidState",
    "vidLok",
    "wardCountry",
    "wardState",
    "wardCity",
    "wardLok",
    "wardVid",
    "delCountry",
    "delState",
    "delCity",
    "delLok",
    "delVid",
    "delWard",
    "delDes"
  ];

  const values = {};
  ids.forEach((id) => {
    const el = document.getElementById(id);
    values[id] = el ? el.value : "";
  });

  return values;
}

function setSelectedValue(id, value) {
  const el = document.getElementById(id);
  if (!el || value == null || value === "") return;

  const exists = Array.from(el.options).some((opt) => String(opt.value) === String(value));
  if (exists) el.value = value;
}

async function loadMasters(preserved = null) {
  const previous = preserved || getSelectedValues();

  const res = await fetch("/admin/getMasters", { credentials: "include" });
  const data = await res.json().catch(() => ({}));
  if (!data.success) return;

  M = sortMastersForDropdown(data.masters || {});

  fill("stateCountry", M.countries);
  fill("cityCountry", M.countries);
  fill("lokCountry", M.countries);
  fill("vidCountry", M.countries);
  fill("wardCountry", M.countries);

  fill("delCountry", M.countries);
  fill("delState", M.states);
  fill("delCity", M.cities);
  fill("delLok", M.loksabhas);
  fill("delVid", M.vidhansabhas);
  fill("delWard", M.wards);
  fill("delDes", M.designations);

  setSelectedValue("stateCountry", previous.stateCountry);
  setSelectedValue("cityCountry", previous.cityCountry);
  setSelectedValue("lokCountry", previous.lokCountry);
  setSelectedValue("vidCountry", previous.vidCountry);
  setSelectedValue("wardCountry", previous.wardCountry);

  cascadeStateFor("cityCountry", "cityState");
  cascadeStateFor("lokCountry", "lokState");
  cascadeStateFor("vidCountry", "vidState");
  cascadeStateFor("wardCountry", "wardState");

  setSelectedValue("cityState", previous.cityState);
  setSelectedValue("lokState", previous.lokState);
  setSelectedValue("vidState", previous.vidState);
  setSelectedValue("wardState", previous.wardState);

  cascadeCity();
  cascadeLokForVid();
  cascadeWardLok();
  cascadeWardVid();

  setSelectedValue("wardCity", previous.wardCity);
  setSelectedValue("vidLok", previous.vidLok);
  setSelectedValue("wardLok", previous.wardLok);

  cascadeWardVid();
  setSelectedValue("wardVid", previous.wardVid);

  setSelectedValue("delCountry", previous.delCountry);
  setSelectedValue("delState", previous.delState);
  setSelectedValue("delCity", previous.delCity);
  setSelectedValue("delLok", previous.delLok);
  setSelectedValue("delVid", previous.delVid);
  setSelectedValue("delWard", previous.delWard);
  setSelectedValue("delDes", previous.delDes);

  bindOnce();
}

function bindOnce() {
  if (window.__mastersBound) return;
  window.__mastersBound = true;

  document.getElementById("cityCountry").addEventListener("change", () => {
    cascadeStateFor("cityCountry", "cityState");
  });

  document.getElementById("lokCountry").addEventListener("change", () => {
    cascadeStateFor("lokCountry", "lokState");
  });

  document.getElementById("vidCountry").addEventListener("change", () => {
    cascadeStateFor("vidCountry", "vidState");
    cascadeLokForVid();
  });

  document.getElementById("vidState").addEventListener("change", () => {
    cascadeLokForVid();
  });

  document.getElementById("wardCountry").addEventListener("change", () => {
    cascadeStateFor("wardCountry", "wardState");
    cascadeCity();
    cascadeWardLok();
    cascadeWardVid();
  });

  document.getElementById("wardState").addEventListener("change", () => {
    cascadeCity();
    cascadeWardLok();
    cascadeWardVid();
  });

  document.getElementById("wardLok").addEventListener("change", () => {
    cascadeWardVid();
  });
}

function fill(id, list) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = "";

  (list || []).forEach((x) => {
    const opt = document.createElement("option");
    opt.value = x.id;
    opt.textContent = x.name;
    sel.appendChild(opt);
  });
}

function fillFiltered(id, list, predicate) {
  const sel = document.getElementById(id);
  if (!sel) return;
  sel.innerHTML = "";

  (list || [])
    .filter(predicate)
    .forEach((x) => {
      const opt = document.createElement("option");
      opt.value = x.id;
      opt.textContent = x.name;
      sel.appendChild(opt);
    });
}

function cascadeStateFor(countrySelectId, stateSelectId) {
  const countryId = document.getElementById(countrySelectId)?.value || "";
  fillFiltered(stateSelectId, M.states, (s) => String(s.countryId) === String(countryId));
}

function cascadeCity() {
  const stateId = document.getElementById("wardState")?.value || "";
  fillFiltered("wardCity", M.cities, (c) => String(c.stateId) === String(stateId));
}

function cascadeLokForVid() {
  const stateId = document.getElementById("vidState")?.value || "";
  fillFiltered("vidLok", M.loksabhas, (l) => String(l.stateId) === String(stateId));
}

function cascadeWardLok() {
  const stateId = document.getElementById("wardState")?.value || "";
  fillFiltered("wardLok", M.loksabhas, (l) => String(l.stateId) === String(stateId));
}

function cascadeWardVid() {
  const lokId = document.getElementById("wardLok")?.value || "";
  fillFiltered("wardVid", M.vidhansabhas, (v) => String(v.lokId) === String(lokId));
}

/* ================= ADD APIs ================= */

async function addCountry() {
  const name = document.getElementById("countryName").value.trim();
  if (!name) return showToast("Enter country");

  const preserved = getSelectedValues();
  const r = await addMaster("countries", name);
  if (!r) return;

  showToast("Country added");
  document.getElementById("countryName").value = "";
  await loadMasters(preserved);
}

async function addState() {
  const country = document.getElementById("stateCountry").value;
  const name = document.getElementById("stateName").value.trim();
  if (!country || !name) return showToast("Fill all fields");

  const preserved = getSelectedValues();
  const r = await addMaster("states", name, country);
  if (!r) return;
  showToast("State added");
  document.getElementById("stateName").value = "";
  await loadMasters(preserved);
}

async function addCity() {
  const state = document.getElementById("cityState").value;
  const name = document.getElementById("cityName").value.trim();
  if (!state || !name) return showToast("Fill all fields");

  const preserved = getSelectedValues();
  const r = await addMaster("cities", name, state);
  if (!r) return;
  showToast("City added");
  document.getElementById("cityName").value = "";
  await loadMasters(preserved);
}

async function addLok() {
  const state = document.getElementById("lokState").value;
  const name = document.getElementById("lokName").value.trim();
  if (!state || !name) return showToast("Fill all fields");

  const preserved = getSelectedValues();
  const r = await addMaster("loksabhas", name, state);
  if (!r) return;
  showToast("Lok Sabha added");
  document.getElementById("lokName").value = "";
  await loadMasters(preserved);
}

async function addVid() {
  const lok = document.getElementById("vidLok").value;
  const name = document.getElementById("vidName").value.trim();
  if (!lok || !name) return showToast("Fill all fields");

  const preserved = getSelectedValues();
  const r = await addMaster("vidhansabhas", name, lok);
  if (!r) return;
  showToast("Vidhan Sabha added");
  document.getElementById("vidName").value = "";
  await loadMasters(preserved);
}

async function addWard() {
  const cityId = document.getElementById("wardCity").value;
  const vidhansabhaId = document.getElementById("wardVid").value;
  const name = document.getElementById("wardName").value.trim();

  if (!cityId || !vidhansabhaId || !name) {
    return showToast("Fill all fields");
  }

  const preserved = getSelectedValues();

  const res = await fetch("/admin/addWard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ cityId, vidhansabhaId, name })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    showToast(data.message || "Failed");
    return null;
  }

  showToast("Ward added");
  document.getElementById("wardName").value = "";
  await loadMasters(preserved);
}

async function addDesignation() {
  const name = document.getElementById("desName").value.trim();
  if (!name) return showToast("Enter designation");

  const preserved = getSelectedValues();
  const r = await addMaster("designations", name);
  if (!r) return;
  showToast("Designation added");
  document.getElementById("desName").value = "";
  await loadMasters(preserved);
}

async function addMaster(level, name, parentId) {
  const res = await fetch("/admin/addMaster", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ level, name, parentId: parentId || "" }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    showToast(data.message || "Failed");
    return null;
  }
  return data;
}

/* ================= RENAME + DELETE APIs ================= */

async function renameCountry() { await renameMasterFrom("countries", "delCountry", "Country"); }
async function renameState() { await renameMasterFrom("states", "delState", "State"); }
async function renameCity() { await renameMasterFrom("cities", "delCity", "City"); }
async function renameLok() { await renameMasterFrom("loksabhas", "delLok", "Lok Sabha"); }
async function renameVid() { await renameMasterFrom("vidhansabhas", "delVid", "Vidhan Sabha"); }
async function renameWard() { await renameMasterFrom("wards", "delWard", "Ward"); }
async function renameDesignation() { await renameMasterFrom("designations", "delDes", "Designation"); }

async function renameMasterFrom(level, selectId, label) {
  const id = document.getElementById(selectId)?.value || "";
  if (!id) return showToast(`Select ${label}`);

  const preserved = getSelectedValues();

  let currentItem = null;
  const list = Array.isArray(M?.[level]) ? M[level] : [];
  currentItem = list.find((x) => String(x.id) === String(id));

  if (!currentItem) {
    showToast(`${label} not found`);
    return;
  }

  const currentName = String(currentItem.name || "").trim();
  const newName = prompt(`Rename ${label}:`, currentName);

  if (newName === null) return;

  const cleanedName = String(newName).trim();
  if (!cleanedName) {
    showToast(`${label} name required`);
    return;
  }

  if (cleanedName === currentName) {
    showToast("No changes made");
    return;
  }

  const res = await fetch("/admin/updateMaster", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ level, id, name: cleanedName }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    showToast(data.message || "Rename failed");
    return;
  }

  showToast(`${label} renamed`);
  await loadMasters(preserved);
}

async function deleteCountry() { await deleteMasterFrom("countries", "delCountry", "Country"); }
async function deleteState() { await deleteMasterFrom("states", "delState", "State"); }
async function deleteCity() { await deleteMasterFrom("cities", "delCity", "City"); }
async function deleteLok() { await deleteMasterFrom("loksabhas", "delLok", "Lok Sabha"); }
async function deleteVid() { await deleteMasterFrom("vidhansabhas", "delVid", "Vidhan Sabha"); }
async function deleteWard() { await deleteMasterFrom("wards", "delWard", "Ward"); }
async function deleteDesignation() { await deleteMasterFrom("designations", "delDes", "Designation"); }

async function deleteMasterFrom(level, selectId, label) {
  const id = document.getElementById(selectId)?.value || "";
  if (!id) return showToast("Select item");

  if (!confirm(`Delete ${label}? This will remove child data also.`)) return;

  const preserved = getSelectedValues();

  const res = await fetch(`/admin/deleteMaster/${level}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    credentials: "include",
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    showToast(data.message || "Delete failed");
    return;
  }

  showToast(`${label} deleted`);
  await loadMasters(preserved);
}

document.getElementById("btnAddCountry")?.addEventListener("click", addCountry);
document.getElementById("btnAddState")?.addEventListener("click", addState);
document.getElementById("btnAddCity")?.addEventListener("click", addCity);
document.getElementById("btnAddLok")?.addEventListener("click", addLok);
document.getElementById("btnAddVid")?.addEventListener("click", addVid);
document.getElementById("btnAddWard")?.addEventListener("click", addWard);
document.getElementById("btnAddDesignation")?.addEventListener("click", addDesignation);

window.renameCountry = renameCountry;
window.renameState = renameState;
window.renameCity = renameCity;
window.renameLok = renameLok;
window.renameVid = renameVid;
window.renameWard = renameWard;
window.renameDesignation = renameDesignation;

window.deleteCountry = deleteCountry;
window.deleteState = deleteState;
window.deleteCity = deleteCity;
window.deleteLok = deleteLok;
window.deleteVid = deleteVid;
window.deleteWard = deleteWard;
window.deleteDesignation = deleteDesignation;


document.getElementById("downloadMastersTemplateBtn")?.addEventListener("click", () => {
  const level = document.getElementById("bulkMasterLevel")?.value || "countries";
  const url = `/admin/downloadMastersTemplate/${encodeURIComponent(level)}`;
  window.open(url, "_blank", "noopener,noreferrer");
});

document.getElementById("uploadMastersExcelBtn")?.addEventListener("click", async () => {
  const level = document.getElementById("bulkMasterLevel")?.value || "";
  const fileInput = document.getElementById("bulkMasterFile");
  const file = fileInput?.files?.[0];

  if (!level) return showToast("Select level");
  if (!file) return showToast("Select Excel file");

  const fd = new FormData();
  fd.append("file", file);

  const res = await fetch(`/admin/uploadMastersExcel/${encodeURIComponent(level)}`, {
    method: "POST",
    credentials: "include",
    body: fd
  });

  const data = await res.json().catch(() => ({}));

  if (res.ok && data.success) {
    showToast(`Excel uploaded successfully (${data.added || 0} added)`);
    fileInput.value = "";
    loadMasters();
  } else {
    showToast(data.message || "Excel upload failed");
  }
});

loadMasters();

/* ================= IMPORT / EXPORT MASTERS WORKBOOK ================= */

const importMastersBtn = document.getElementById("importMastersBtn");
const importMastersFile = document.getElementById("importMastersFile");

if (importMastersBtn) {
  importMastersBtn.addEventListener("click", async () => {
    const file = importMastersFile?.files?.[0];

    if (!file) {
      showToast("Select Excel file first");
      return;
    }

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/admin/importMastersWorkbook", {
        method: "POST",
        body: form,
        credentials: "include"
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        showToast("Masters workbook imported successfully");
        importMastersFile.value = "";
        await loadMasters();
      } else {
        showToast(data.message || "Workbook import failed");
      }
    } catch (err) {
      console.error(err);
      showToast("Workbook import failed");
    }
  });
}