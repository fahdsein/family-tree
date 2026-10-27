const themeGroups = [
  ["Original collection", [
    ["heritage", "Heritage Parchment"],
    ["evergreen", "Evergreen Archive"],
    ["nordic", "Nordic Calm"],
    ["golden", "Golden Heirloom"],
    ["midnight", "Midnight Genealogy"],
    ["royal", "Royal Plum"],
    ["blossom", "Blossom & Sage"]
  ]],
  ["Forest collection", [
    ["deep-pine", "Deep Whispering Pine"],
    ["mossy-grove", "Mossy Grove"],
    ["fern-cedar", "Fern & Cedar"],
    ["misty-redwood", "Misty Redwood Canopy"],
    ["golden-leaves", "Golden Sunlight Through Leaves"],
    ["emerald-archive", "Emerald Archive"],
    ["botanical", "Botanical Illustration"]
  ]]
];

let model = null;
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function node(tag, className, text) {
  const item = document.createElement(tag);
  if (className) item.className = className;
  if (text !== undefined) item.textContent = text;
  return item;
}

function activePeople() { return model.state.people.filter((person) => !person.archivedAt); }
function activeUnions() { return model.state.unions.filter((union) => !union.archivedAt); }
function activeLinks() { return model.state.parentLinks.filter((link) => !link.archivedAt); }
function personById(id) { return model.state.people.find((person) => person.id === id); }
function label(value) { return String(value || "unknown").replaceAll("_", " "); }
function canEdit() { return ["editor", "admin"].includes(model.currentUser?.role); }
function isAdmin() { return model.currentUser?.role === "admin"; }

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
  return result;
}

async function reload() {
  model = await request("/api/bootstrap");
  render();
}

function toast(message, error = false) {
  const item = $("#toast");
  item.textContent = message;
  item.classList.toggle("error", error);
  item.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => item.classList.remove("show"), 3200);
}

function formatDate(value) { return value?.value || "Unknown"; }
function lifespan(person) {
  const birth = formatDate(person.birth);
  if (person.lifeStatus === "living") return `${birth} – present`;
  return `${birth} – ${formatDate(person.death)}`;
}

function setOptions(select, items, selected = "", includeBlank = false) {
  select.replaceChildren();
  if (includeBlank) select.append(new Option("None / unknown", ""));
  for (const item of items) {
    const value = typeof item === "string" ? item : item.value;
    const text = typeof item === "string" ? label(item) : item.text;
    select.append(new Option(text, value, false, value === selected));
  }
}

function configureAccess() {
  $$(".admin-only").forEach((item) => item.classList.toggle("hidden", !canEdit()));
  const auditButton = $('[data-view="audit"]');
  if (auditButton) auditButton.classList.toggle("hidden", !isAdmin());
  if (!canEdit() && $(".view.active")?.id === "view-admin") switchView("tree");
  if (!isAdmin() && $(".view.active")?.id === "view-audit") switchView("tree");
  $("#authButton").textContent = model.currentUser ? `Sign out · ${model.currentUser.role}` : "Sign in";
  $("#privacyNotice").classList.toggle("hidden", Boolean(model.currentUser));
  $("#loginHint").textContent = model.developmentLoginHint
    ? `Demo admin: ${model.developmentLoginHint.admin}. Demo editor: ${model.developmentLoginHint.editor}.`
    : "Use the credentials configured by your family administrator.";
}

function generationMap() {
  const people = activePeople();
  const links = activeLinks();
  const generation = new Map(people.map((person) => [person.id, 0]));
  for (let pass = 0; pass < people.length; pass += 1) {
    let changed = false;
    for (const link of links) {
      const next = (generation.get(link.parentId) || 0) + 1;
      if (next > (generation.get(link.childId) || 0)) { generation.set(link.childId, next); changed = true; }
    }
    if (!changed) break;
  }
  for (const union of activeUnions()) {
    const level = Math.max(...union.partnerIds.map((id) => generation.get(id) || 0));
    union.partnerIds.forEach((id) => generation.set(id, level));
  }
  return generation;
}

function renderStats() {
  const values = [
    [activePeople().length, "People"],
    [activeUnions().length, "Partnerships"],
    [activeLinks().length, "Parent links"]
  ];
  const root = $("#stats"); root.replaceChildren();
  for (const [value, title] of values) {
    const item = node("div", "stat"); item.append(node("strong", "", String(value)), node("span", "", title)); root.append(item);
  }
}

function renderTree() {
  const query = $("#search").value.trim().toLowerCase();
  const people = activePeople().filter((person) => [person.displayName, person.branch, person.bio].join(" ").toLowerCase().includes(query));
  const generations = generationMap();
  const groups = new Map();
  for (const person of people) {
    const level = generations.get(person.id) || 0;
    if (!groups.has(level)) groups.set(level, []);
    groups.get(level).push(person);
  }
  const canvas = $("#treeCanvas"); canvas.replaceChildren();
  if (!people.length) { canvas.append(node("p", "empty-state", model.currentUser ? "No people match this search." : "No public people are available. Sign in to view the private family tree.")); return; }
  for (const [level, members] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const section = node("section", "generation");
    section.append(node("p", "generation-title", `Generation ${level + 1}`));
    const row = node("div", "generation-row");
    for (const person of members.sort((a, b) => a.displayName.localeCompare(b.displayName))) {
      const card = node("button", "person-card"); card.type = "button";
      card.append(photoAvatar(person));
      const detail = node("span", "person-card-copy");
      detail.append(node("strong", "", person.displayName), node("small", "", lifespan(person)), node("small", "branch", person.branch));
      card.append(detail, node("i", `status-dot ${person.lifeStatus}`, ""));
      card.addEventListener("click", () => showPerson(person.id)); row.append(card);
    }
    section.append(row); canvas.append(section);
  }
}

function photoAvatar(person, large = false) {
  const avatar = node("span", `avatar ${person.lifeStatus}${large ? " large" : ""}`, person.displayName.split(/\s+/).map((word) => word[0]).slice(0, 2).join(""));
  if (person.photo?.url) {
    const image = document.createElement("img"); image.src = person.photo.url; image.alt = person.photo.caption || `Photo of ${person.displayName}`; image.referrerPolicy = "no-referrer";
    image.addEventListener("error", () => image.remove()); avatar.append(image);
  }
  return avatar;
}

function svgElement(name, attributes = {}) {
  const item = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) item.setAttribute(key, value);
  return item;
}

function buildFamilyGraph() {
  const depth = Math.min(7, Math.max(1, Number($("#generationDepth").value || 7)));
  const levels = generationMap();
  const people = activePeople().filter((person) => (levels.get(person.id) || 0) < depth);
  const visible = new Set(people.map((person) => person.id));
  const groups = new Map();
  for (const person of people) { const level = levels.get(person.id) || 0; if (!groups.has(level)) groups.set(level, []); groups.get(level).push(person); }
  const maxColumns = Math.max(1, ...[...groups.values()].map((items) => items.length));
  const width = Math.max(920, maxColumns * 210 + 100); const height = Math.max(300, groups.size * 165 + 90);
  const svg = svgElement("svg", { viewBox: `0 0 ${width} ${height}`, width, height, role: "img", "aria-label": `Family tree graph showing ${depth} generations` });
  const style = getComputedStyle(document.documentElement); const primary = style.getPropertyValue("--primary").trim() || "#124e3f"; const secondary = style.getPropertyValue("--secondary").trim() || "#c5a880"; const text = style.getPropertyValue("--text").trim() || "#13221e"; const background = style.getPropertyValue("--bg").trim() || "#eef3f1";
  svg.append(svgElement("rect", { width, height, fill: background }));
  const positions = new Map();
  for (const [level, members] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = members.sort((a, b) => a.displayName.localeCompare(b.displayName)); const rowWidth = sorted.length * 190; const start = (width - rowWidth) / 2;
    sorted.forEach((person, index) => positions.set(person.id, { x: start + index * 190 + 15, y: 35 + level * 165 }));
  }
  const edges = svgElement("g", { fill: "none", "stroke-linecap": "round" });
  for (const link of activeLinks().filter((item) => visible.has(item.parentId) && visible.has(item.childId))) {
    const a = positions.get(link.parentId); const b = positions.get(link.childId); if (!a || !b) continue;
    const middle = (a.y + 94 + b.y) / 2; edges.append(svgElement("path", { d: `M ${a.x + 75} ${a.y + 94} C ${a.x + 75} ${middle}, ${b.x + 75} ${middle}, ${b.x + 75} ${b.y}`, stroke: primary, "stroke-width": 2.2, opacity: .66 }));
  }
  for (const union of activeUnions().filter((item) => item.partnerIds.every((id) => visible.has(id)))) {
    const a = positions.get(union.partnerIds[0]); const b = positions.get(union.partnerIds[1]); if (!a || !b) continue;
    edges.append(svgElement("line", { x1: a.x + 75, y1: a.y + 47, x2: b.x + 75, y2: b.y + 47, stroke: secondary, "stroke-width": 3, "stroke-dasharray": "7 5" }));
  }
  svg.append(edges);
  for (const person of people) {
    const position = positions.get(person.id); const group = svgElement("g", { class: "graph-person", tabindex: "0", role: "button", "aria-label": person.displayName });
    group.append(svgElement("rect", { x: position.x, y: position.y, width: 150, height: 94, rx: 14, fill: "#ffffff", stroke: primary, "stroke-width": 1.5 }));
    group.append(svgElement("circle", { cx: position.x + 26, cy: position.y + 28, r: 16, fill: primary }));
    const initials = svgElement("text", { x: position.x + 26, y: position.y + 33, "text-anchor": "middle", fill: "#ffffff", "font-family": "Inter, sans-serif", "font-size": 11, "font-weight": 700 }); initials.textContent = person.displayName.split(/\s+/).map((word) => word[0]).slice(0, 2).join(""); group.append(initials);
    const name = svgElement("text", { x: position.x + 14, y: position.y + 60, fill: text, "font-family": "Lora, serif", "font-size": 13, "font-weight": 600 }); name.textContent = person.displayName.length > 20 ? `${person.displayName.slice(0, 19)}…` : person.displayName; group.append(name);
    const years = svgElement("text", { x: position.x + 14, y: position.y + 79, fill: text, opacity: .68, "font-family": "Inter, sans-serif", "font-size": 10 }); years.textContent = lifespan(person); group.append(years);
    group.addEventListener("click", () => showPerson(person.id)); group.addEventListener("keydown", (event) => { if (["Enter", " "].includes(event.key)) showPerson(person.id); }); svg.append(group);
  }
  return svg;
}

function renderGraph() {
  const root = $("#familyGraph"); root.replaceChildren(); $("#graphNotice").classList.toggle("hidden", Boolean(model.currentUser));
  if (!activePeople().length) { root.append(node("p", "empty-state", "No visible people are available for the graph.")); return; }
  root.append(buildFamilyGraph());
}

async function graphCanvas() {
  const svg = $("#familyGraph svg"); if (!svg) throw new Error("No graph is available to export");
  const clone = svg.cloneNode(true); clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const source = new XMLSerializer().serializeToString(clone); const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image(); await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    const view = svg.viewBox.baseVal; const scale = 2; const canvas = document.createElement("canvas"); canvas.width = view.width * scale; canvas.height = view.height * scale;
    const context = canvas.getContext("2d"); context.scale(scale, scale); context.drawImage(image, 0, 0, view.width, view.height); return canvas;
  } finally { URL.revokeObjectURL(url); }
}

function downloadData(url, filename) { const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; document.body.append(anchor); anchor.click(); anchor.remove(); }

async function exportGraph(format) {
  try {
    const canvas = await graphCanvas(); const date = new Date().toISOString().slice(0, 10);
    if (format === "png") { downloadData(canvas.toDataURL("image/png"), `family-tree-${date}.png`); }
    else {
      if (!window.jspdf?.jsPDF) throw new Error("PDF generator is unavailable");
      const { jsPDF } = window.jspdf; const pdf = new jsPDF({ orientation: canvas.width >= canvas.height ? "landscape" : "portrait", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth(); const pageHeight = pdf.internal.pageSize.getHeight(); const ratio = Math.min((pageWidth - 36) / canvas.width, (pageHeight - 54) / canvas.height);
      pdf.setFont("helvetica", "bold"); pdf.setFontSize(14); pdf.text(model.state.workspace?.name || "Family Tree", 18, 20); pdf.addImage(canvas.toDataURL("image/jpeg", .92), "JPEG", 18, 30, canvas.width * ratio, canvas.height * ratio); pdf.save(`family-tree-${date}.pdf`);
    }
    toast(`${format.toUpperCase()} export generated`);
  } catch (error) { toast(error.message || "Export failed", true); }
}

function relationshipSection(title, values) {
  const section = node("section", "profile-section"); section.append(node("h3", "", title));
  if (!values.length) section.append(node("p", "muted", "No documented records."));
  else {
    const list = node("div", "relationship-list"); values.forEach((value) => list.append(value)); section.append(list);
  }
  return section;
}

function showPerson(id) {
  const person = personById(id); if (!person) return;
  const root = $("#personDetail"); root.replaceChildren();
  const heading = node("div", "profile-heading"); heading.append(photoAvatar(person, true)); const headingCopy = node("div", ""); headingCopy.append(node("p", "eyebrow", person.branch), node("h2", "", person.displayName), node("p", "detail-lifespan", `${label(person.lifeStatus)} · ${lifespan(person)}`)); heading.append(headingCopy); root.append(heading);
  if (person.photo?.url && person.photo.caption) root.append(node("p", "photo-caption muted", person.photo.caption));
  const identity = [person.gender && person.gender !== "unknown" ? label(person.gender) : "", person.pronouns, ...(person.alternateNames || [])].filter(Boolean);
  if (identity.length) root.append(node("p", "muted", identity.join(" · ")));
  if (person.bio) root.append(node("p", "detail-bio", person.bio));
  const unionItems = activeUnions().filter((union) => union.partnerIds.includes(id)).map((union) => {
    const partner = personById(union.partnerIds.find((partnerId) => partnerId !== id));
    const children = [...new Set(activeLinks().filter((link) => link.unionId === union.id).map((link) => link.childId))].map(personById).filter(Boolean);
    const item = node("article", "relationship-item");
    item.append(node("strong", "", `${partner?.displayName || "Unknown partner"} · ${label(union.status)}`));
    item.append(node("p", "muted", `${formatDate(union.start)} – ${union.end?.value || (union.status === "married" ? "present" : "unknown")} · ${label(union.type)}`));
    if (children.length) item.append(node("p", "", `Children: ${children.map((child) => child.displayName).join(", ")}`));
    return item;
  });
  root.append(relationshipSection("Marriage & partnership history", unionItems));
  const parentItems = activeLinks().filter((link) => link.childId === id).map((link) => node("p", "relationship-item", `${personById(link.parentId)?.displayName || "Unknown"} · ${label(link.parentType)} parent`));
  const childItems = activeLinks().filter((link) => link.parentId === id).map((link) => node("p", "relationship-item", `${personById(link.childId)?.displayName || "Unknown"} · ${label(link.parentType)} child`));
  root.append(relationshipSection("Parents", parentItems), relationshipSection("Children", childItems));
  if (canEdit()) {
    const controls = node("div", "detail-controls");
    const edit = node("button", "button primary", "Edit complete record"); edit.type = "button"; edit.addEventListener("click", () => openPersonEditor(person.id)); controls.append(edit);
    const status = document.createElement("select"); setOptions(status, model.options.lifeStatuses, person.lifeStatus);
    const save = node("button", "button secondary", "Update life status"); save.type = "button";
    save.addEventListener("click", async () => { try { await request(`/api/people/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ lifeStatus: status.value }) }); $("#personDialog").close(); await reload(); toast("Life status updated"); } catch (error) { toast(error.message, true); } });
    controls.append(status, save);
    if (isAdmin()) {
      const remove = node("button", "button danger", "Delete person"); remove.type = "button";
      remove.addEventListener("click", async () => { if (!confirm(`Permanently delete ${person.displayName}? Their partnerships and parent-child links will also be deleted. This cannot be undone.`)) return; try { await request(`/api/people/${encodeURIComponent(id)}`, { method: "DELETE" }); $("#personDialog").close(); await reload(); toast("Person permanently deleted"); } catch (error) { toast(error.message, true); } });
      controls.append(remove);
    }
    root.append(controls);
  }
  $("#personDialog").showModal();
}

function personPayload(values) {
  const list = (value) => String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
  return {
    displayName: values.displayName, alternateNames: list(values.alternateNames), gender: values.gender, pronouns: values.pronouns,
    lifeStatus: values.lifeStatus, branch: values.branch, privacy: values.privacy, bio: values.bio, tags: list(values.tags),
    birth: { value: values.birthValue, precision: values.birthPrecision, place: values.birthPlace },
    death: { value: values.deathValue, precision: values.deathPrecision || "unknown", place: values.deathPlace },
    photo: { url: values.photoUrl, caption: values.photoCaption }
  };
}

function setField(form, name, value) { const field = form.elements.namedItem(name); if (field) field.value = value ?? ""; }

function openPersonEditor(id) {
  const person = personById(id); if (!person) return; const form = $("#editPersonForm");
  setField(form, "id", person.id); setField(form, "displayName", person.displayName); setField(form, "alternateNames", (person.alternateNames || []).join(", ")); setField(form, "gender", person.gender || "unknown"); setField(form, "pronouns", person.pronouns); setField(form, "lifeStatus", person.lifeStatus); setField(form, "branch", person.branch); setField(form, "privacy", person.privacy); setField(form, "bio", person.bio); setField(form, "tags", (person.tags || []).join(", ")); setField(form, "birthValue", person.birth?.value); setField(form, "birthPrecision", person.birth?.precision); setField(form, "birthPlace", person.birth?.place); setField(form, "deathValue", person.death?.value); setField(form, "deathPrecision", person.death?.precision); setField(form, "deathPlace", person.death?.place); setField(form, "photoUrl", person.photo?.url); setField(form, "photoCaption", person.photo?.caption);
  $("#personDialog").close(); $("#editPersonDialog").showModal();
}

function renderStories() {
  const root = $("#stories"); root.replaceChildren();
  const stories = model.state.stories || [];
  if (!stories.length) { root.append(node("p", "card empty-state", "No stories are visible yet.")); return; }
  for (const story of stories) {
    const item = node("article", "card story-card"); item.append(node("p", "eyebrow", story.category || "Family story"), node("h3", "", story.title), node("p", "", story.body)); root.append(item);
  }
}

function peopleOptions() { return activePeople().sort((a, b) => a.displayName.localeCompare(b.displayName)).map((person) => ({ value: person.id, text: person.displayName })); }
function unionOptions() { return activeUnions().map((union) => ({ value: union.id, text: union.partnerIds.map((id) => personById(id)?.displayName || "Unknown").join(" + ") })); }

function renderForms() {
  const people = peopleOptions();
  setOptions($("#relationshipFrom"), people, people[0]?.value);
  setOptions($("#relationshipTo"), people, people[1]?.value || people[0]?.value);
  setOptions($("#personForm [name=lifeStatus]"), model.options.lifeStatuses, "living");
  setOptions($("#personForm [name=gender]"), model.options.genders, "unknown");
  setOptions($("#editPersonForm [name=lifeStatus]"), model.options.lifeStatuses, "unknown");
  setOptions($("#editPersonForm [name=gender]"), model.options.genders, "unknown");
  setOptions($("#unionForm [name=type]"), model.options.unionTypes, "marriage");
  setOptions($("#unionForm [name=status]"), model.options.unionStatuses, "married");
  setOptions($("#parentForm [name=parentType]"), model.options.parentTypes, "biological");
  for (const selector of ["#unionForm [name=partnerA]", "#unionForm [name=partnerB]", "#parentForm [name=parentId]", "#parentForm [name=childId]"]) setOptions($(selector), people);
  setOptions($("#parentForm [name=unionId]"), unionOptions(), "", true);
}

function renderAudit() {
  const body = $("#auditRows"); body.replaceChildren();
  for (const entry of model.state.audit || []) {
    const row = document.createElement("tr");
    [new Date(entry.at).toLocaleString(), `${entry.actor} (${entry.role})`, entry.action, entry.entityType, entry.summary].forEach((value) => row.append(node("td", "", value)));
    body.append(row);
  }
}

function renderRelationshipRecords() {
  const root = $("#relationshipRecords"); root.replaceChildren(node("h3", "", "Existing relationship records"));
  const addGroup = (title, records) => {
    const section = node("section", "record-group"); section.append(node("h4", "", title));
    for (const record of records) {
      const row = node("div", "record-row");
      const copy = node("p", ""); copy.append(node("strong", "", record.title), node("small", "", record.detail)); row.append(copy);
      if (isAdmin()) {
        const remove = node("button", "button danger", "Delete"); remove.type = "button";
        remove.addEventListener("click", async () => { if (!confirm(`Permanently delete ${record.title}? This cannot be undone.`)) return; try { await request(record.path, { method: "DELETE" }); await reload(); toast("Relationship permanently deleted"); } catch (error) { toast(error.message, true); } });
        row.append(remove);
      }
      section.append(row);
    }
    if (!records.length) section.append(node("p", "muted", "No active records.")); root.append(section);
  };
  addGroup("Marriages and partnerships", activeUnions().map((union) => ({
    title: union.partnerIds.map((id) => personById(id)?.displayName || "Unknown").join(" + "),
    detail: `${label(union.type)} · ${label(union.status)} · ${formatDate(union.start)} – ${union.end?.value || "present"}`,
    path: `/api/unions/${encodeURIComponent(union.id)}`
  })));
  addGroup("Parent and child links", activeLinks().map((link) => ({
    title: `${personById(link.parentId)?.displayName || "Unknown"} → ${personById(link.childId)?.displayName || "Unknown"}`,
    detail: `${label(link.parentType)} · ${label(link.confidence)}`,
    path: `/api/parent-links/${encodeURIComponent(link.id)}`
  })));
}

function render() {
  $("#treeName").textContent = model.state.workspace?.name || "Family archive";
  configureAccess(); renderStats(); renderTree(); renderGraph(); renderStories(); renderForms(); renderRelationshipRecords(); renderAudit();
}

function switchView(name) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `view-${name}`));
  $$(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  history.replaceState(null, "", `#${name}`);
}

function formData(form) { return Object.fromEntries(new FormData(form).entries()); }

function bind() {
  const picker = $("#themePicker");
  for (const [groupName, groupThemes] of themeGroups) {
    const group = document.createElement("optgroup"); group.label = groupName;
    groupThemes.forEach(([value, text]) => group.append(new Option(text, value))); picker.append(group);
  }
  const savedTheme = localStorage.getItem("roots-theme") || "evergreen"; picker.value = savedTheme; document.documentElement.dataset.theme = savedTheme;
  picker.addEventListener("change", () => { document.documentElement.dataset.theme = picker.value; localStorage.setItem("roots-theme", picker.value); });
  $$(".nav-button").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
  $("#search").addEventListener("input", renderTree);
  $("#authButton").addEventListener("click", async () => { if (model.currentUser) { await request("/api/auth/logout", { method: "POST" }); await reload(); toast("Signed out"); } else $("#loginDialog").showModal(); });
  $("#loginForm").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; $("#loginError").textContent = ""; try { await request("/api/auth/login", { method: "POST", body: JSON.stringify(formData(form)) }); $("#loginDialog").close(); form.reset(); await reload(); toast("Signed in"); } catch (error) { $("#loginError").textContent = error.message; } });
  $(".close-dialog").addEventListener("click", () => $("#personDialog").close());
  $(".close-login").addEventListener("click", () => $("#loginDialog").close());
  $$(".close-edit").forEach((button) => button.addEventListener("click", () => $("#editPersonDialog").close()));
  $("#generationDepth").addEventListener("change", renderGraph);
  $("#exportPng").addEventListener("click", () => exportGraph("png"));
  $("#exportPdf").addEventListener("click", () => exportGraph("pdf"));
  $("#explainButton").addEventListener("click", async () => {
    const result = $("#relationshipResult");
    if (!model.currentUser) { result.textContent = "Sign in to calculate relationships across private family records."; return; }
    try {
      const data = await request("/api/relationships/explain", { method: "POST", body: JSON.stringify({ fromId: $("#relationshipFrom").value, toId: $("#relationshipTo").value }) }); result.classList.remove("empty"); result.replaceChildren(node("p", "eyebrow", "Documented connection"), node("h3", "", data.label));
      if (data.path?.length) { const path = node("div", "relation-path"); data.path.forEach((person, index) => { const personButton = node("button", "path-person", person.displayName); personButton.type = "button"; personButton.addEventListener("click", () => showPerson(person.id)); path.append(personButton); if (data.pathEdges[index]) path.append(node("span", "path-edge", data.pathEdges[index])); }); result.append(node("p", "muted", "Shortest documented path"), path); }
    } catch (error) { toast(error.message, true); }
  });
  $("#personForm").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const values = formData(form); try { await request("/api/people", { method: "POST", body: JSON.stringify(personPayload(values)) }); form.reset(); await reload(); toast("Person added"); } catch (error) { toast(error.message, true); } });
  $("#editPersonForm").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const values = formData(form); try { await request(`/api/people/${encodeURIComponent(values.id)}`, { method: "PATCH", body: JSON.stringify(personPayload(values)) }); $("#editPersonDialog").close(); await reload(); toast("Complete person record updated"); } catch (error) { toast(error.message, true); } });
  $("#unionForm").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const values = formData(form); try { await request("/api/unions", { method: "POST", body: JSON.stringify({ partnerIds: [values.partnerA, values.partnerB], type: values.type, status: values.status, start: { value: values.start }, end: { value: values.end }, place: values.place, endReason: values.endReason, sourceNote: values.sourceNote }) }); form.reset(); await reload(); toast("Partnership created"); } catch (error) { toast(error.message, true); } });
  $("#parentForm").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const values = formData(form); try { await request("/api/parent-links", { method: "POST", body: JSON.stringify(values) }); form.reset(); await reload(); toast("Parent and child connected"); } catch (error) { toast(error.message, true); } });
}

bind();
reload().then(() => {
  const requested = location.hash.slice(1);
  if (["tree", "graph", "explore", "history", "admin", "audit"].includes(requested)) switchView(requested);
}).catch((error) => toast(error.message, true));
