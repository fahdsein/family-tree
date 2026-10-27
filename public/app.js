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
      card.append(node("span", `avatar ${person.lifeStatus}`, person.displayName.split(/\s+/).map((word) => word[0]).slice(0, 2).join("")));
      const detail = node("span", "person-card-copy");
      detail.append(node("strong", "", person.displayName), node("small", "", lifespan(person)), node("small", "branch", person.branch));
      card.append(detail, node("i", `status-dot ${person.lifeStatus}`, ""));
      card.addEventListener("click", () => showPerson(person.id)); row.append(card);
    }
    section.append(row); canvas.append(section);
  }
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
  root.append(node("p", "eyebrow", person.branch), node("h2", "", person.displayName), node("p", "detail-lifespan", `${label(person.lifeStatus)} · ${lifespan(person)}`));
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
    const status = document.createElement("select"); setOptions(status, model.options.lifeStatuses, person.lifeStatus);
    const save = node("button", "button secondary", "Update life status"); save.type = "button";
    save.addEventListener("click", async () => { try { await request(`/api/people/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ lifeStatus: status.value }) }); $("#personDialog").close(); await reload(); toast("Life status updated"); } catch (error) { toast(error.message, true); } });
    controls.append(status, save);
    if (isAdmin()) {
      const archive = node("button", "button danger", "Archive person"); archive.type = "button";
      archive.addEventListener("click", async () => { if (!confirm(`Archive ${person.displayName}? Existing relationship history will remain in the audit log.`)) return; try { await request(`/api/people/${encodeURIComponent(id)}`, { method: "DELETE" }); $("#personDialog").close(); await reload(); toast("Person archived"); } catch (error) { toast(error.message, true); } });
      controls.append(archive);
    }
    root.append(controls);
  }
  $("#personDialog").showModal();
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
        const archive = node("button", "button danger", "Archive"); archive.type = "button";
        archive.addEventListener("click", async () => { if (!confirm(`Archive ${record.title}?`)) return; try { await request(record.path, { method: "DELETE" }); await reload(); toast("Relationship archived"); } catch (error) { toast(error.message, true); } });
        row.append(archive);
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
  configureAccess(); renderStats(); renderTree(); renderStories(); renderForms(); renderRelationshipRecords(); renderAudit();
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
  $("#explainButton").addEventListener("click", async () => {
    const result = $("#relationshipResult");
    if (!model.currentUser) { result.textContent = "Sign in to calculate relationships across private family records."; return; }
    try { const data = await request("/api/relationships/explain", { method: "POST", body: JSON.stringify({ fromId: $("#relationshipFrom").value, toId: $("#relationshipTo").value }) }); result.classList.remove("empty"); result.replaceChildren(node("p", "eyebrow", "Documented connection"), node("h3", "", data.label)); } catch (error) { toast(error.message, true); }
  });
  $("#personForm").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const values = formData(form); try { await request("/api/people", { method: "POST", body: JSON.stringify({ displayName: values.displayName, lifeStatus: values.lifeStatus, branch: values.branch, birth: { value: values.birthValue, place: values.birthPlace }, death: { value: values.deathValue }, privacy: values.privacy, bio: values.bio }) }); form.reset(); await reload(); toast("Person added"); } catch (error) { toast(error.message, true); } });
  $("#unionForm").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const values = formData(form); try { await request("/api/unions", { method: "POST", body: JSON.stringify({ partnerIds: [values.partnerA, values.partnerB], type: values.type, status: values.status, start: { value: values.start }, end: { value: values.end }, place: values.place, endReason: values.endReason, sourceNote: values.sourceNote }) }); form.reset(); await reload(); toast("Partnership created"); } catch (error) { toast(error.message, true); } });
  $("#parentForm").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const values = formData(form); try { await request("/api/parent-links", { method: "POST", body: JSON.stringify(values) }); form.reset(); await reload(); toast("Parent and child connected"); } catch (error) { toast(error.message, true); } });
}

bind();
reload().then(() => {
  const requested = location.hash.slice(1);
  if (["tree", "explore", "history", "admin", "audit"].includes(requested)) switchView(requested);
}).catch((error) => toast(error.message, true));
