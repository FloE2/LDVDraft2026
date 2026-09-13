/* ============================================================
   Sélection Basket FFSU — logique app
   Firestore (compat SDK) — collections:
     - players/{pk}   (inclut désormais photoBase64 : photo individuelle)
     - meta/info
     - meta/customCriteria
   ============================================================ */

const GROUPS = ["A", "B", "C", "D"];
const GROUP_LABELS = {
  A: "A — 14/09 19h-20h15 (Nanterre)",
  B: "B — 14/09 20h15-21h30 (Nanterre)",
  C: "C — 17/09 13h-14h15 (Colombes)",
  D: "D — 17/09 14h15-15h45 (Colombes)"
};
const BASE_CRITERES = [
  ["niveauTechnique", "Niveau technique"],
  ["lecture", "Lecture de jeu"],
  ["communication", "Communication"],
  ["esprit", "Esprit d'équipe"],
  ["ecoute", "Écoute des consignes"],
  ["combativite", "Combativité"]
];
let customCriteria = []; // [[key,label], ...] added on the fly, synced via Firestore

function getAllCriteria() { return BASE_CRITERES.concat(customCriteria); }

function slugify(s) {
  let key = s.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!key) key = "critere_" + Date.now();
  const existingKeys = getAllCriteria().map((c) => c[0]);
  let finalKey = key, i = 2;
  while (existingKeys.includes(finalKey)) { finalKey = key + "_" + i; i++; }
  return finalKey;
}

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDz4y8IsgYGGyC9EgzIa_E5Sbv_Ifyi2KQ",
  authDomain: "ldvdraft2026.firebaseapp.com",
  projectId: "ldvdraft2026",
  storageBucket: "ldvdraft2026.firebasestorage.app",
  messagingSenderId: "402954876954",
  appId: "1:402954876954:web:eaf0958197d0bb7e59f9a3"
};

let db = null;
let players = {};       // pk -> player doc data
let currentGroup = { appel: "A", photos: "A", eval: "A" };
let currentModalPk = null;
let camStream = null;

/* ---------------- Setup / boot ---------------- */

function loadLocal(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } }
function saveLocal(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

function boot() {
  const coach = loadLocal("ffsu_coachName");
  if (!coach) {
    document.getElementById("setupView").style.display = "block";
    document.getElementById("appRoot").style.display = "none";
    return;
  }
  initFirebase(FIREBASE_CONFIG, coach);
}

document.getElementById("saveConfigBtn").addEventListener("click", () => {
  const name = document.getElementById("coachNameInput").value.trim();
  const err = document.getElementById("setupError");
  err.textContent = "";
  if (!name) { err.textContent = "Merci d'indiquer votre nom."; return; }
  saveLocal("ffsu_coachName", name);
  initFirebase(FIREBASE_CONFIG, name);
});

document.getElementById("resetConfigBtn").addEventListener("click", () => {
  if (confirm("Changer de nom d'entraîneur ? (les données Firestore ne seront pas supprimées)")) {
    saveLocal("ffsu_coachName", null);
    location.reload();
  }
});

function initFirebase(cfg, coachName) {
  try {
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    db = firebase.firestore();
  } catch (e) {
    alert("Erreur d'initialisation Firebase : " + e.message);
    return;
  }
  document.getElementById("setupView").style.display = "none";
  document.getElementById("appRoot").style.display = "flex";
  document.getElementById("coachNameDisplay").textContent = coachName;

  buildGroupPickers();
  buildCritGrid();
  attachTabNav();
  attachAppelHandlers();
  attachPhotoHandlers();
  attachEvalHandlers();
  attachExportHandlers();
  attachModalHandlers();

  listenPlayers();
  listenCustomCriteria();
}

/* ---------------- Firestore listeners ---------------- */

function listenPlayers() {
  db.collection("players").onSnapshot((snap) => {
    players = {};
    snap.forEach((doc) => { players[doc.id] = doc.data(); });
    renderAll();
  }, (err) => {
    console.error(err);
    showToast("Erreur de synchronisation : " + err.message);
  });
}

function listenCustomCriteria() {
  db.collection("meta").doc("customCriteria").onSnapshot((doc) => {
    customCriteria = (doc.exists && doc.data().list) || [];
    buildCritGrid();
    if (currentModalPk && players[currentModalPk]) renderCritStars(players[currentModalPk]);
  });
}

function addCustomCriterion() {
  const label = prompt("Nom du nouveau critère à évaluer :");
  if (!label || !label.trim()) return;
  const key = slugify(label.trim());
  db.collection("meta").doc("customCriteria").set({
    list: firebase.firestore.FieldValue.arrayUnion({ key, label: label.trim() })
  }, { merge: true })
    .then(() => showToast(`Critère "${label.trim()}" ajouté pour tout le monde`))
    .catch((e) => showToast("Erreur : " + e.message));
}

function coachName() { return loadLocal("ffsu_coachName") || "?"; }

function updatePlayer(pk, patch) {
  patch.lastEditBy = coachName();
  patch.lastEditAt = new Date().toISOString();
  db.collection("players").doc(String(pk)).set(patch, { merge: true })
    .catch((e) => showToast("Erreur d'enregistrement : " + e.message));
}

/* ---------------- Seed initial data ---------------- */

document.getElementById("seedBtn").addEventListener("click", async () => {
  const status = document.getElementById("seedStatus");
  const existing = await db.collection("players").limit(1).get();
  if (!existing.empty) {
    if (!confirm("Des joueurs existent déjà dans la base. Importer quand même (les fiches existantes ne seront pas écrasées) ?")) return;
  }
  status.textContent = "Import en cours...";
  const batch = db.batch();
  let n = 0;
  for (const s of FFSU_STUDENTS) {
    const ref = db.collection("players").doc(String(s.pk));
    const existingDoc = players[String(s.pk)];
    if (existingDoc) continue; // don't overwrite
    batch.set(ref, {
      pk: s.pk,
      nom: s.nom,
      prenom: s.prenom,
      formation: s.formation,
      email: s.email,
      groupeOriginal: s.groupe,
      groupe: s.groupe,
      creneau: s.creneau,
      lieu: s.lieu,
      present: false,
      numero: null,
      statut: "actif",
      poste: "",
      joueClub: "",
      niveauClub: "",
      taille: null,
      crit: {},
      note: 0,
      evalRapide: 0,
      equipe: "",
      notes: "",
      lastEditBy: coachName(),
      lastEditAt: new Date().toISOString()
    });
    n++;
  }
  if (n === 0) { status.textContent = "Rien à importer (déjà présent)."; return; }
  try {
    await batch.commit();
    status.textContent = `${n} étudiant(s) importé(s).`;
    showToast(`${n} étudiants importés`);
  } catch (e) {
    status.textContent = "Erreur : " + e.message;
  }
});

/* ---------------- Tabs ---------------- */

function attachTabNav() {
  document.querySelectorAll("nav.tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("nav.tabs button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
      document.getElementById("view-" + btn.dataset.view).classList.add("active");
      renderAll();
    });
  });
}

function renderAll() {
  renderAppelView();
  renderPhotosView();
  renderEvalView();
  renderTeamsView();
}

/* ---------------- Group pickers ---------------- */

function buildGroupPickers() {
  ["appel", "photos", "eval"].forEach((ctx) => {
    const el = document.getElementById(ctx + "GroupPicker");
    el.innerHTML = "";
    GROUPS.forEach((g) => {
      const b = document.createElement("button");
      b.textContent = "";
      const label = document.createElement("span");
      label.textContent = "Groupe " + g;
      const cnt = document.createElement("span");
      cnt.className = "cnt";
      cnt.id = ctx + "Cnt" + g;
      b.appendChild(label);
      b.appendChild(cnt);
      b.className = g === currentGroup[ctx] ? "active" : "";
      b.addEventListener("click", () => {
        currentGroup[ctx] = g;
        el.querySelectorAll("button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        if (ctx === "appel") renderAppelView();
        if (ctx === "photos") renderPhotosView();
        if (ctx === "eval") renderEvalView();
      });
      el.appendChild(b);
    });
  });
}

function playersInGroup(g) {
  return Object.values(players).filter((p) => p.groupe === g);
}

function updateGroupCounts() {
  GROUPS.forEach((g) => {
    const list = playersInGroup(g);
    const label = `${list.length} · ${list.filter(p=>p.present).length} présents`;
    ["appelCnt", "photosCnt", "evalCnt"].forEach((prefix) => {
      const el = document.getElementById(prefix + g);
      if (el) el.textContent = label;
    });
  });
}

/* ================= APPEL VIEW ================= */

function attachAppelHandlers() {
  document.getElementById("appelSearch").addEventListener("input", renderAppelView);
  document.getElementById("addStudentBtn").addEventListener("click", openAddStudentModal);
  document.getElementById("addStudentClose").addEventListener("click", closeAddStudentModal);
  document.getElementById("addStudentModal").addEventListener("click", (e) => {
    if (e.target.id === "addStudentModal") closeAddStudentModal();
  });
  document.getElementById("confirmAddStudentBtn").addEventListener("click", confirmAddStudent);
}

function openAddStudentModal() {
  document.getElementById("newStudentNom").value = "";
  document.getElementById("newStudentPrenom").value = "";
  document.getElementById("newStudentFormation").value = "";
  document.getElementById("newStudentGroupe").value = currentGroup.appel;
  document.getElementById("addStudentError").textContent = "";
  document.getElementById("addStudentModal").classList.add("open");
}

function closeAddStudentModal() {
  document.getElementById("addStudentModal").classList.remove("open");
}

function confirmAddStudent() {
  const nom = document.getElementById("newStudentNom").value.trim().toUpperCase();
  const prenom = document.getElementById("newStudentPrenom").value.trim();
  const formation = document.getElementById("newStudentFormation").value.trim();
  const groupe = document.getElementById("newStudentGroupe").value;
  const err = document.getElementById("addStudentError");
  if (!nom || !prenom) { err.textContent = "Le nom et le prénom sont obligatoires."; return; }

  const pk = "manuel_" + Date.now();
  const patch = {
    pk, nom, prenom, formation: formation || "(ajouté manuellement)",
    email: "", groupeOriginal: groupe, groupe, creneau: "", lieu: "",
    present: true, numero: null, statut: "actif",
    poste: "", joueClub: "", niveauClub: "", taille: null,
    crit: {}, note: 0, evalRapide: 0, equipe: "", notes: "",
    manuallyAdded: true,
    lastEditBy: coachName(), lastEditAt: new Date().toISOString()
  };
  db.collection("players").doc(pk).set(patch)
    .then(() => {
      showToast(`${nom} ${prenom} ajouté au groupe ${groupe}`);
      closeAddStudentModal();
    })
    .catch((e) => { err.textContent = "Erreur : " + e.message; });
}

function statusPill(p) {
  if (p.statut === "elimine_niveau") return `<span class="pill out-n">Niveau insuffisant</span>`;
  if (p.statut === "elimine_esprit") return `<span class="pill out-e">État d'esprit</span>`;
  if (p.equipe) return `<span class="pill ok">Équipe ${p.equipe}</span>`;
  return `<span class="pill wait">En attente</span>`;
}

function renderAppelView() {
  if (!document.getElementById("view-appel").classList.contains("active")) { updateGroupCounts(); return; }
  updateGroupCounts();
  const g = currentGroup.appel;
  const q = document.getElementById("appelSearch").value.trim().toLowerCase();
  let list = playersInGroup(g).sort((a, b) => a.nom.localeCompare(b.nom));
  if (q) list = list.filter((p) => (p.nom + " " + p.prenom).toLowerCase().includes(q));

  const tbody = document.getElementById("appelTableBody");
  tbody.innerHTML = "";
  document.getElementById("appelStats").textContent =
    `${list.filter(p=>p.present).length}/${list.length} présents dans ce groupe`;

  list.forEach((p) => {
    const tr = document.createElement("tr");
    tr.className = "player-row" + (p.statut === "elimine_niveau" ? " eliminated-niveau" : p.statut === "elimine_esprit" ? " eliminated-esprit" : "");
    tr.innerHTML = `
      <td><input type="checkbox" ${p.present ? "checked" : ""} data-pk="${p.pk}" class="presentChk"></td>
      <td>${avatarHtml(p, 32)}</td>
      <td class="name">${escapeHtml(p.nom)}</td>
      <td>${escapeHtml(p.prenom)}</td>
      <td class="muted">${escapeHtml(p.formation || "")}</td>
      <td>${statusPill(p)}</td>
      <td>
        <select class="moveGroupSel" data-pk="${p.pk}">
          ${GROUPS.map((gg) => `<option value="${gg}" ${gg === p.groupe ? "selected" : ""}>${gg}</option>`).join("")}
        </select>
      </td>
      <td><button class="btn ghost small openModalBtn" data-pk="${p.pk}">Fiche</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".presentChk").forEach((chk) => {
    chk.addEventListener("change", (e) => {
      updatePlayer(e.target.dataset.pk, { present: e.target.checked });
    });
  });
  tbody.querySelectorAll(".moveGroupSel").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const pk = e.target.dataset.pk;
      const newG = e.target.value;
      updatePlayer(pk, { groupe: newG, numero: null });
      showToast(`Déplacé vers le groupe ${newG}`);
    });
  });
  tbody.querySelectorAll(".openModalBtn").forEach((btn) => {
    btn.addEventListener("click", () => openPlayerModal(btn.dataset.pk));
  });
}

/* ================= PHOTOS VIEW (photos individuelles) ================= */

let currentPhotoTargetPk = null;

function attachPhotoHandlers() {
  document.getElementById("startCamBtn").addEventListener("click", startCamera);
  document.getElementById("snapBtn").addEventListener("click", snapPhoto);
  document.getElementById("cancelCamBtn").addEventListener("click", stopCamera);
  document.getElementById("uploadPhotoInput").addEventListener("change", handleFileUpload);
  document.getElementById("closeCapturePanelBtn").addEventListener("click", closeCapturePanel);
}

function openCapturePanel(pk) {
  currentPhotoTargetPk = pk;
  const p = players[pk];
  if (!p) return;
  document.getElementById("photoCaptureTarget").textContent = `Photo de ${p.nom} ${p.prenom}`;
  const frame = document.getElementById("photoFrame");
  frame.innerHTML = p.photoBase64 ? `<img src="${p.photoBase64}" style="width:100%;height:100%;object-fit:cover;">` : `<span class="muted">Aperçu</span>`;
  document.getElementById("photoCapturePanel").style.display = "block";
  document.getElementById("photoCapturePanel").scrollIntoView({ behavior: "smooth", block: "center" });
}

function closeCapturePanel() {
  stopCamera();
  currentPhotoTargetPk = null;
  document.getElementById("photoCapturePanel").style.display = "none";
}

async function startCamera() {
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = document.getElementById("camPreview");
    video.srcObject = camStream;
    video.style.display = "block";
    document.getElementById("photoFrame").style.display = "none";
    document.getElementById("snapBtn").style.display = "inline-block";
    document.getElementById("cancelCamBtn").style.display = "inline-block";
    document.getElementById("startCamBtn").style.display = "none";
  } catch (e) {
    showToast("Impossible d'accéder à la caméra : " + e.message);
  }
}

function stopCamera() {
  if (camStream) camStream.getTracks().forEach((t) => t.stop());
  camStream = null;
  document.getElementById("camPreview").style.display = "none";
  document.getElementById("photoFrame").style.display = "flex";
  document.getElementById("snapBtn").style.display = "none";
  document.getElementById("cancelCamBtn").style.display = "none";
  document.getElementById("startCamBtn").style.display = "inline-block";
}

// Crops to a centered square and downsizes — keeps individual photos small (~10-20 Ko each)
function squareThumbFromSource(source, sw, sh, size, quality) {
  const canvas = document.getElementById("camCanvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const cropSize = Math.min(sw, sh);
  const sx = (sw - cropSize) / 2;
  const sy = (sh - cropSize) / 2;
  ctx.drawImage(source, sx, sy, cropSize, cropSize, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", quality);
}

function snapPhoto() {
  if (!currentPhotoTargetPk) return;
  const video = document.getElementById("camPreview");
  const dataUrl = squareThumbFromSource(video, video.videoWidth, video.videoHeight, 320, 0.6);
  savePhotoForStudent(currentPhotoTargetPk, dataUrl);
  stopCamera();
}

function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file || !currentPhotoTargetPk) return;
  const targetPk = currentPhotoTargetPk;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const dataUrl = squareThumbFromSource(img, img.width, img.height, 320, 0.6);
      savePhotoForStudent(targetPk, dataUrl);
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
  e.target.value = "";
}

function savePhotoForStudent(pk, dataUrl) {
  const p = players[pk];
  updatePlayer(pk, { photoBase64: dataUrl });
  showToast(`Photo de ${p ? p.nom : ""} enregistrée`);
  const frame = document.getElementById("photoFrame");
  if (frame) frame.innerHTML = `<img src="${dataUrl}" style="width:100%;height:100%;object-fit:cover;">`;
}

function deleteStudentPhoto(pk) {
  const p = players[pk];
  if (!p || !confirm(`Supprimer la photo de ${p.nom} ${p.prenom} ?`)) return;
  updatePlayer(pk, { photoBase64: null });
  showToast("Photo supprimée");
}

function avatarHtml(p, size) {
  if (p && p.photoBase64) {
    return `<img src="${p.photoBase64}" class="avatar" style="width:${size}px;height:${size}px;">`;
  }
  const initials = ((p && p.nom ? p.nom[0] : "?") + (p && p.prenom ? p.prenom[0] : "")).toUpperCase();
  return `<span class="avatar" style="width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px;">${initials}</span>`;
}

function renderPhotosView() {
  if (!document.getElementById("view-photos").classList.contains("active")) { updateGroupCounts(); return; }
  updateGroupCounts();
  const g = currentGroup.photos;
  const list = playersInGroup(g).filter((p) => p.present).sort((a, b) => a.nom.localeCompare(b.nom));

  const container = document.getElementById("photosPeopleList");
  container.innerHTML = "";
  if (!list.length) {
    container.innerHTML = `<p class="muted">Aucun étudiant présent pour l'instant dans ce groupe. Cochez-les dans l'onglet Appel pour qu'ils apparaissent ici.</p>`;
    return;
  }
  list.forEach((p) => {
    const row = document.createElement("div");
    row.className = "people-row";
    row.innerHTML = `
      ${avatarHtml(p, 44)}
      <span class="pname">${escapeHtml(p.nom)} ${escapeHtml(p.prenom)}</span>
      <button class="btn small takePhotoBtn" data-pk="${p.pk}">${p.photoBase64 ? "📸 Reprendre" : "📸 Prendre"}</button>
      ${p.photoBase64 ? `<button class="btn ghost small deletePhotoRowBtn" data-pk="${p.pk}">🗑</button>` : ""}
    `;
    container.appendChild(row);
  });
  container.querySelectorAll(".takePhotoBtn").forEach((btn) => {
    btn.addEventListener("click", () => openCapturePanel(btn.dataset.pk));
  });
  container.querySelectorAll(".deletePhotoRowBtn").forEach((btn) => {
    btn.addEventListener("click", () => deleteStudentPhoto(btn.dataset.pk));
  });
}

/* ================= EVAL VIEW ================= */

function attachEvalHandlers() {
  document.getElementById("evalSearch").addEventListener("input", renderEvalView);
  document.getElementById("evalSortSelect").addEventListener("change", renderEvalView);
}

function renderEvalView() {
  if (!document.getElementById("view-eval").classList.contains("active")) { updateGroupCounts(); return; }
  updateGroupCounts();
  const g = currentGroup.eval;
  const q = document.getElementById("evalSearch").value.trim().toLowerCase();
  const sortBy = document.getElementById("evalSortSelect").value;
  let list = playersInGroup(g);
  if (q) list = list.filter((p) => (p.nom + " " + p.prenom).toLowerCase().includes(q));
  list.sort((a, b) => {
    if (sortBy === "nom") return a.nom.localeCompare(b.nom);
    if (sortBy === "rapide") return (b.evalRapide || 0) - (a.evalRapide || 0);
    if (sortBy === "note") return computeAvgNote(b.crit) - computeAvgNote(a.crit);
    if (sortBy === "poste") return (a.poste || "zzz").localeCompare(b.poste || "zzz");
    return a.nom.localeCompare(b.nom);
  });

  const tbody = document.getElementById("evalTableBody");
  tbody.innerHTML = "";
  list.forEach((p) => {
    const tr = document.createElement("tr");
    tr.className = "player-row" + (p.statut === "elimine_niveau" ? " eliminated-niveau" : p.statut === "elimine_esprit" ? " eliminated-esprit" : "");
    tr.innerHTML = `
      <td>${avatarHtml(p, 32)}</td>
      <td class="name">${escapeHtml(p.nom)} ${escapeHtml(p.prenom)}</td>
      <td>${escapeHtml(p.poste || "—")}</td>
      <td>${p.joueClub ? escapeHtml(p.joueClub) + (p.niveauClub ? " ("+escapeHtml(p.niveauClub)+")" : "") : "—"}</td>
      <td>${renderStarsReadonly(p.evalRapide || 0)}</td>
      <td>${renderStarsReadonly(computeAvgNote(p.crit))}</td>
      <td>${statusPill(p)}</td>
      <td><button class="btn small openModalBtn" data-pk="${p.pk}">Évaluer</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll(".openModalBtn").forEach((btn) => {
    btn.addEventListener("click", () => openPlayerModal(btn.dataset.pk));
  });
}

function renderStarsReadonly(n) {
  return `<span class="star-frac-row">${starsFractionHtml(n || 0)}</span>`;
}

function starsFractionHtml(value) {
  let html = "";
  for (let i = 1; i <= 5; i++) {
    const frac = Math.max(0, Math.min(1, value - (i - 1)));
    html += `<span class="star-frac"><span class="bg">★</span><span class="fg" style="width:${frac * 100}%">★</span></span>`;
  }
  return html;
}

function computeAvgNote(crit) {
  const vals = Object.values(crit || {}).filter((v) => v > 0);
  if (!vals.length) return 0;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

/* ================= PLAYER MODAL ================= */

function buildCritGrid() {
  const grid = document.getElementById("critGrid");
  grid.innerHTML = "";
  getAllCriteria().forEach(([key, label]) => {
    const row = document.createElement("div");
    row.className = "crit-item";
    row.innerHTML = `<span class="lbl">${escapeHtml(label)}</span><span class="stars" data-crit="${key}"></span>`;
    grid.appendChild(row);
  });
}

function attachModalHandlers() {
  document.getElementById("modalClose").addEventListener("click", closePlayerModal);
  document.getElementById("playerModal").addEventListener("click", (e) => {
    if (e.target.id === "playerModal") closePlayerModal();
  });
  document.getElementById("elimNiveauChk").addEventListener("change", onElimChange);
  document.getElementById("elimEspritChk").addEventListener("change", onElimChange);
  document.getElementById("modalPoste").addEventListener("change", (e) => saveModalField("poste", e.target.value));
  document.getElementById("modalTaille").addEventListener("change", (e) => saveModalField("taille", e.target.value ? parseInt(e.target.value, 10) : null));
  document.getElementById("modalJoueClub").addEventListener("change", (e) => saveModalField("joueClub", e.target.value));
  document.getElementById("modalNiveauClub").addEventListener("change", (e) => saveModalField("niveauClub", e.target.value));
  document.getElementById("modalNotes").addEventListener("change", (e) => saveModalField("notes", e.target.value));
  document.getElementById("modalEquipe").addEventListener("change", (e) => saveModalField("equipe", e.target.value));
  document.getElementById("resetPlayerBtn").addEventListener("click", resetCurrentPlayer);
  document.getElementById("addCriterionBtn").addEventListener("click", addCustomCriterion);
  document.getElementById("validatePlayerBtn").addEventListener("click", () => {
    showToast("Fiche validée et enregistrée");
    closePlayerModal();
  });
}

function playerResetPatch(p) {
  return {
    present: false,
    numero: null,
    groupe: p.groupeOriginal || p.groupe,
    statut: "actif",
    poste: "",
    joueClub: "",
    niveauClub: "",
    taille: null,
    crit: {},
    note: 0,
    evalRapide: 0,
    equipe: "",
    notes: ""
  };
}

function resetCurrentPlayer() {
  const p = players[currentModalPk];
  if (!p) return;
  if (!confirm(`Réinitialiser complètement la fiche de ${p.nom} ${p.prenom} ? (statut, poste, club, taille, observables, note, équipe et groupe repartent à zéro — la photo est conservée)`)) return;
  updatePlayer(currentModalPk, playerResetPatch(p));
  showToast("Fiche réinitialisée");
  closePlayerModal();
}

function onElimChange() {
  const pk = currentModalPk;
  const niveauChk = document.getElementById("elimNiveauChk");
  const espritChk = document.getElementById("elimEspritChk");
  let statut = "actif";
  if (this === niveauChk && niveauChk.checked) { statut = "elimine_niveau"; espritChk.checked = false; }
  else if (this === espritChk && espritChk.checked) { statut = "elimine_esprit"; niveauChk.checked = false; }
  updatePlayer(pk, { statut });
  refreshElimUI();
}

function refreshElimUI() {
  const p = players[currentModalPk];
  const niveauChk = document.getElementById("elimNiveauChk");
  const espritChk = document.getElementById("elimEspritChk");
  const niveauLbl = document.getElementById("elimNiveauLabel");
  const espritLbl = document.getElementById("elimEspritLabel");
  niveauChk.checked = p.statut === "elimine_niveau";
  espritChk.checked = p.statut === "elimine_esprit";
  niveauLbl.classList.toggle("checked-n", niveauChk.checked);
  espritLbl.classList.toggle("checked-e", espritChk.checked);
  document.getElementById("modalFullForm").style.opacity = (p.statut && p.statut !== "actif") ? "0.45" : "1";
}

function saveModalField(field, value) {
  updatePlayer(currentModalPk, { [field]: value });
}

function openPlayerModal(pk) {
  currentModalPk = String(pk);
  const p = players[currentModalPk];
  if (!p) return;
  document.getElementById("modalName").textContent = `${p.nom} ${p.prenom}`;
  document.getElementById("modalAvatar").innerHTML = avatarHtml(p, 52);
  document.getElementById("modalMeta").textContent =
    `${p.formation || ""} · Groupe ${p.groupe}${p.numero != null ? " · N°" + p.numero : ""}`;
  document.getElementById("modalPoste").value = p.poste || "";
  document.getElementById("modalTaille").value = p.taille || "";
  document.getElementById("modalJoueClub").value = p.joueClub || "";
  document.getElementById("modalNiveauClub").value = p.niveauClub || "";
  document.getElementById("modalNotes").value = p.notes || "";
  document.getElementById("modalEquipe").value = p.equipe || "";
  refreshElimUI();
  renderCritStars(p);
  renderQuickStars(p);
  // recompute the detailed note fresh from criteria each time (self-heals any stale stored value)
  const avg = computeAvgNote(p.crit || {});
  renderDetailedNote(avg);
  if (avg !== (p.note || 0)) updatePlayer(currentModalPk, { note: avg });
  const lastEdit = document.getElementById("modalLastEdit");
  lastEdit.textContent = p.lastEditBy ? `Dernière modif : ${p.lastEditBy} — ${formatDate(p.lastEditAt)}` : "";
  document.getElementById("playerModal").classList.add("open");
}

function closePlayerModal() {
  document.getElementById("playerModal").classList.remove("open");
  currentModalPk = null;
}

function renderCritStars(p) {
  const crit = p.crit || {};
  document.querySelectorAll("#critGrid .stars").forEach((starsEl) => {
    const key = starsEl.dataset.crit;
    const val = crit[key] || 0;
    drawStars(starsEl, val, (newVal) => {
      if (!players[currentModalPk]) return;
      const newCrit = Object.assign({}, players[currentModalPk].crit || {}, { [key]: newVal });
      const avg = computeAvgNote(newCrit);
      players[currentModalPk] = Object.assign({}, players[currentModalPk], { crit: newCrit, note: avg }); // optimistic local update
      renderDetailedNote(avg); // instant visual feedback, always recomputed (fixes the frozen-note bug)
      updatePlayer(currentModalPk, { crit: newCrit, note: avg });
    });
  });
}

function renderDetailedNote(avg) {
  document.getElementById("modalStars").innerHTML = starsFractionHtml(avg);
  document.getElementById("modalNoteValue").textContent = avg > 0 ? `${avg.toFixed(1)} / 5` : "—";
}

function renderQuickStars(p) {
  const el = document.getElementById("modalQuickStars");
  drawStars(el, p.evalRapide || 0, (newVal) => {
    if (players[currentModalPk]) players[currentModalPk] = Object.assign({}, players[currentModalPk], { evalRapide: newVal });
    updatePlayer(currentModalPk, { evalRapide: newVal });
  });
}

function drawStars(container, value, onSet) {
  container.innerHTML = "";
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement("span");
    s.textContent = "★";
    if (i <= value) s.classList.add("on");
    s.addEventListener("click", () => {
      const newVal = i === value ? 0 : i;
      drawStars(container, newVal, onSet); // redraw immediately, no waiting on network
      onSet(newVal);
    });
    container.appendChild(s);
  }
}

/* ================= TEAMS VIEW ================= */

function renderTeamsView() {
  if (!document.getElementById("view-teams").classList.contains("active")) return;
  const eligible = Object.values(players).filter((p) => p.statut === "actif" || !p.statut);
  const cols = document.getElementById("teamCols");
  cols.innerHTML = "";
  ["1", "2", "3"].forEach((teamId) => {
    const list = eligible.filter((p) => p.equipe === teamId).sort((a,b)=>a.nom.localeCompare(b.nom));
    const col = document.createElement("div");
    col.className = "team-col";
    const posteCounts = {};
    list.forEach((p) => { posteCounts[p.poste || "?"] = (posteCounts[p.poste || "?"] || 0) + 1; });
    const posteSummary = Object.entries(posteCounts).map(([k, v]) => `${k}:${v}`).join(" · ");
    col.innerHTML = `<h3>Équipe ${teamId} <span class="count">${list.length}</span></h3>
      <p class="muted" style="margin-top:-4px;">${posteSummary || "—"}</p>`;
    list.forEach((p) => {
      const chip = document.createElement("div");
      chip.className = "player-chip";
      chip.innerHTML = `<span>${escapeHtml(p.nom)} ${escapeHtml(p.prenom)}${p.poste ? " · " + escapeHtml(p.poste) : ""}</span>
        <select data-pk="${p.pk}">
          <option value="">Retirer</option>
          <option value="1" ${teamId==="1"?"selected":""}>Éq.1</option>
          <option value="2" ${teamId==="2"?"selected":""}>Éq.2</option>
          <option value="3" ${teamId==="3"?"selected":""}>Éq.3</option>
        </select>`;
      col.appendChild(chip);
    });
    cols.appendChild(col);
  });
  cols.querySelectorAll("select").forEach((sel) => {
    sel.addEventListener("change", (e) => updatePlayer(e.target.dataset.pk, { equipe: e.target.value }));
  });

  const pool = eligible.filter((p) => !p.equipe).sort((a,b)=>{
    const scoreA = computeAvgNote(a.crit) || a.evalRapide || 0;
    const scoreB = computeAvgNote(b.crit) || b.evalRapide || 0;
    return scoreB - scoreA || a.nom.localeCompare(b.nom);
  });
  const poolList = document.getElementById("poolList");
  poolList.innerHTML = "";
  pool.forEach((p) => {
    const chip = document.createElement("div");
    chip.className = "player-chip";
    chip.innerHTML = `<span>${escapeHtml(p.nom)} ${escapeHtml(p.prenom)}${p.poste ? " · " + escapeHtml(p.poste) : ""} ${renderStarsReadonly(computeAvgNote(p.crit) || p.evalRapide || 0)}</span>
      <select data-pk="${p.pk}">
        <option value="">Non affecté</option>
        <option value="1">Éq.1</option>
        <option value="2">Éq.2</option>
        <option value="3">Éq.3</option>
      </select>`;
    poolList.appendChild(chip);
  });
  poolList.querySelectorAll("select").forEach((sel) => {
    sel.addEventListener("change", (e) => updatePlayer(e.target.dataset.pk, { equipe: e.target.value }));
  });

  document.getElementById("teamsStats").textContent =
    `${eligible.length} joueur(s) retenu(s) · ${pool.length} non affecté(s)`;
}

/* ================= EXPORT ================= */

function attachExportHandlers() {
  document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
  document.getElementById("resetAllBtn").addEventListener("click", resetAllPlayers);
}

async function resetAllPlayers() {
  const status = document.getElementById("resetAllStatus");
  const all = Object.values(players);
  if (!all.length) { status.textContent = "Aucun étudiant à réinitialiser."; return; }
  const sure = confirm(
    `Réinitialiser TOUTES les données de sélection pour ${all.length} étudiants ?\n` +
    `(appel, groupes déplacés, photos, numéros, poste, club, taille, observables, notes, équipes)\n` +
    `La liste des étudiants importés sera conservée. Cette action est irréversible.`
  );
  if (!sure) return;
  const sure2 = confirm("Dernière confirmation : vraiment tout réinitialiser ?");
  if (!sure2) return;

  status.textContent = "Réinitialisation en cours...";
  try {
    // reset every player doc
    const batches = [];
    let batch = db.batch();
    let count = 0;
    all.forEach((p) => {
      const ref = db.collection("players").doc(String(p.pk));
      batch.set(ref, playerResetPatch(p), { merge: true });
      count++;
      if (count % 400 === 0) { batches.push(batch); batch = db.batch(); }
    });
    batches.push(batch);
    for (const b of batches) await b.commit();

    status.textContent = `Terminé : ${all.length} fiche(s) réinitialisée(s). Les photos individuelles ont été conservées.`;
    showToast("Toutes les évaluations ont été réinitialisées");
  } catch (e) {
    status.textContent = "Erreur : " + e.message;
  }
}

function exportCsv() {
  const cols = ["pk","nom","prenom","formation","groupeOriginal","groupe","numero","statut",
    "poste","joueClub","niveauClub","taille","evalRapide","note","equipe","notes",
    ...getAllCriteria().map(c => "crit_" + c[0]), "lastEditBy","lastEditAt"];
  const rows = [cols.join(";")];
  Object.values(players).sort((a,b)=>a.nom.localeCompare(b.nom)).forEach((p) => {
    const row = cols.map((c) => {
      if (c.startsWith("crit_")) {
        const key = c.replace("crit_", "");
        return (p.crit && p.crit[key]) || "";
      }
      if (c === "note") return computeAvgNote(p.crit) || "";
      let v = p[c];
      if (v == null) v = "";
      return String(v).replace(/;/g, ",").replace(/\n/g, " ");
    });
    rows.push(row.join(";"));
  });
  const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "selection_basket_ffsu.csv";
  a.click();
  URL.revokeObjectURL(url);
}

/* ================= UTILS ================= */

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

boot();
