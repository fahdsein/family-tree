import { randomUUID } from "node:crypto";

export const LIFE_STATUSES = ["living", "deceased", "presumed_deceased", "unknown"];
export const UNION_STATUSES = ["engaged", "married", "domestic_partnership", "separated", "divorced", "annulled", "widowed", "ended", "unknown"];
export const UNION_TYPES = ["marriage", "partnership"];
export const PARENT_TYPES = ["biological", "adoptive", "step", "foster", "guardian", "donor", "surrogate", "unknown"];
export const GENDERS = ["female", "male", "nonbinary", "unknown"];

export function clean(value, max = 240) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

export function dateValue(input = {}) {
  const value = clean(input.value, 30);
  const precision = ["exact", "month", "year", "circa", "before", "after", "range", "unknown"].includes(input.precision) ? input.precision : value ? "exact" : "unknown";
  return { value, precision };
}

export function createPerson(input = {}) {
  const displayName = clean(input.displayName, 100);
  if (!displayName) throw new Error("Display name is required");
  const lifeStatus = LIFE_STATUSES.includes(input.lifeStatus) ? input.lifeStatus : "unknown";
  return {
    id: input.id || randomUUID(),
    displayName,
    alternateNames: Array.isArray(input.alternateNames) ? input.alternateNames.map((v) => clean(v, 100)).filter(Boolean) : [],
    lifeStatus,
    birth: { ...dateValue(input.birth), place: clean(input.birth?.place, 140) },
    death: lifeStatus === "living" ? { value: "", precision: "unknown", place: "" } : { ...dateValue(input.death), place: clean(input.death?.place, 140) },
    pronouns: clean(input.pronouns, 40),
    gender: GENDERS.includes(input.gender) ? input.gender : "unknown",
    branch: clean(input.branch, 60) || "Family",
    bio: clean(input.bio, 2000),
    photo: {
      url: /^(https:\/\/|\/)/i.test(clean(input.photo?.url, 1000)) ? clean(input.photo?.url, 1000) : "",
      caption: clean(input.photo?.caption, 180)
    },
    privacy: ["private", "family", "public"].includes(input.privacy) ? input.privacy : lifeStatus === "living" ? "private" : "family",
    tags: Array.isArray(input.tags) ? input.tags.map((v) => clean(v, 50)).filter(Boolean).slice(0, 20) : [],
    archivedAt: null,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

export function createUnion(state, input = {}) {
  const partnerIds = [...new Set(Array.isArray(input.partnerIds) ? input.partnerIds : [])];
  if (partnerIds.length !== 2) throw new Error("A union requires two different partners");
  if (partnerIds[0] === partnerIds[1]) throw new Error("A person cannot be their own partner");
  for (const id of partnerIds) if (!state.people.some((p) => p.id === id && !p.archivedAt)) throw new Error("Partner not found");
  const duplicate = state.unions.some((u) => !u.archivedAt && partnerIds.every((id) => u.partnerIds.includes(id)) && u.status === input.status);
  if (duplicate) throw new Error("This partnership already exists");
  return {
    id: input.id || randomUUID(),
    partnerIds,
    type: UNION_TYPES.includes(input.type) ? input.type : "marriage",
    status: UNION_STATUSES.includes(input.status) ? input.status : "married",
    start: dateValue(input.start),
    end: dateValue(input.end),
    endReason: clean(input.endReason, 100),
    place: clean(input.place, 140),
    notes: clean(input.notes, 1000),
    privacy: ["private", "family", "public"].includes(input.privacy) ? input.privacy : "family",
    sourceNote: clean(input.sourceNote, 500),
    archivedAt: null,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function parentAdjacency(links) {
  const map = new Map();
  for (const link of links.filter((l) => !l.archivedAt)) {
    if (!map.has(link.parentId)) map.set(link.parentId, []);
    map.get(link.parentId).push(link.childId);
  }
  return map;
}

function reaches(start, target, links) {
  const map = parentAdjacency(links);
  const queue = [start];
  const seen = new Set();
  while (queue.length) {
    const current = queue.shift();
    if (current === target) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    queue.push(...(map.get(current) || []));
  }
  return false;
}

export function createParentLink(state, input = {}) {
  const parentId = clean(input.parentId, 80);
  const childId = clean(input.childId, 80);
  if (!parentId || !childId || parentId === childId) throw new Error("Choose two different people");
  for (const id of [parentId, childId]) if (!state.people.some((p) => p.id === id && !p.archivedAt)) throw new Error("Person not found");
  if (state.parentLinks.some((l) => !l.archivedAt && l.parentId === parentId && l.childId === childId && l.parentType === input.parentType)) throw new Error("This parent relationship already exists");
  if (reaches(childId, parentId, state.parentLinks)) throw new Error("This relationship would create an ancestry cycle");
  return {
    id: input.id || randomUUID(),
    parentId,
    childId,
    parentType: PARENT_TYPES.includes(input.parentType) ? input.parentType : "biological",
    unionId: state.unions.some((u) => u.id === input.unionId && !u.archivedAt) ? input.unionId : null,
    confidence: ["confirmed", "likely", "uncertain", "disputed"].includes(input.confidence) ? input.confidence : "confirmed",
    sourceNote: clean(input.sourceNote, 500),
    privacy: ["private", "family", "public"].includes(input.privacy) ? input.privacy : "family",
    archivedAt: null,
    createdAt: input.createdAt || new Date().toISOString()
  };
}

export function ancestorDistances(personId, links) {
  const parentByChild = new Map();
  for (const link of links.filter((l) => !l.archivedAt)) {
    if (!parentByChild.has(link.childId)) parentByChild.set(link.childId, []);
    parentByChild.get(link.childId).push(link.parentId);
  }
  const result = new Map();
  const queue = [{ id: personId, distance: 0 }];
  while (queue.length) {
    const item = queue.shift();
    if (result.has(item.id) && result.get(item.id) <= item.distance) continue;
    result.set(item.id, item.distance);
    for (const parent of parentByChild.get(item.id) || []) queue.push({ id: parent, distance: item.distance + 1 });
  }
  result.delete(personId);
  return result;
}

function ordinal(value) {
  const suffix = value % 100 >= 11 && value % 100 <= 13 ? "th" : value % 10 === 1 ? "st" : value % 10 === 2 ? "nd" : value % 10 === 3 ? "rd" : "th";
  return `${value}${suffix}`;
}

export function describeRelationship(state, fromId, toId) {
  if (fromId === toId) return { label: "Same person", paths: [] };
  const person = (id) => state.people.find((p) => p.id === id);
  if (!person(fromId) || !person(toId)) throw new Error("Person not found");
  const directUnion = state.unions.find((u) => !u.archivedAt && u.partnerIds.includes(fromId) && u.partnerIds.includes(toId));
  const directParent = state.parentLinks.find((l) => !l.archivedAt && l.parentId === fromId && l.childId === toId);
  const directChild = state.parentLinks.find((l) => !l.archivedAt && l.parentId === toId && l.childId === fromId);
  const from = person(fromId); const to = person(toId);
  const term = (subject, male, female, neutral) => subject?.gender === "male" ? male : subject?.gender === "female" ? female : neutral;
  const parentsOf = (id) => state.parentLinks.filter((l) => !l.archivedAt && l.childId === id).map((l) => l.parentId);
  const siblingsOf = (id) => {
    const parents = new Set(parentsOf(id));
    return state.people.filter((candidate) => candidate.id !== id && !candidate.archivedAt && parentsOf(candidate.id).some((parentId) => parents.has(parentId))).map((candidate) => candidate.id);
  };
  const partnersOf = (id) => state.unions.filter((u) => !u.archivedAt && u.partnerIds.includes(id)).map((u) => u.partnerIds.find((partnerId) => partnerId !== id));
  const ancestorLabel = (subject, distance) => {
    if (distance === 1) return term(subject, "Father", "Mother", "Parent");
    if (distance === 2) return term(subject, "Grandfather", "Grandmother", "Grandparent");
    return `${"Great-".repeat(distance - 2)}${term(subject, "grandfather", "grandmother", "grandparent")}`;
  };
  const descendantLabel = (subject, distance) => {
    if (distance === 1) return term(subject, "Son", "Daughter", "Child");
    if (distance === 2) return term(subject, "Grandson", "Granddaughter", "Grandchild");
    return `${"Great-".repeat(distance - 2)}${term(subject, "grandson", "granddaughter", "grandchild")}`;
  };
  const labels = [];
  if (directUnion) labels.push(`${directUnion.status === "married" ? "Spouse" : "Partner"} (${directUnion.status.replaceAll("_", " ")})`);
  if (directParent) labels.push(`${ancestorLabel(from, 1)} (${directParent.parentType})`);
  if (directChild) labels.push(`${descendantLabel(from, 1)} (${directChild.parentType})`);
  const fromAncestors = ancestorDistances(fromId, state.parentLinks);
  const toAncestors = ancestorDistances(toId, state.parentLinks);
  const fromAsAncestor = toAncestors.get(fromId);
  const fromAsDescendant = fromAncestors.get(toId);
  if (!directParent && fromAsAncestor) labels.push(ancestorLabel(from, fromAsAncestor));
  if (!directChild && fromAsDescendant) labels.push(descendantLabel(from, fromAsDescendant));
  const siblings = siblingsOf(toId);
  if (siblings.includes(fromId)) labels.push(term(from, "Brother", "Sister", "Sibling"));
  const targetParents = parentsOf(toId);
  if (targetParents.some((parentId) => siblingsOf(parentId).includes(fromId))) labels.push(term(from, "Uncle", "Aunt", "Parent's sibling"));
  if (parentsOf(fromId).some((parentId) => siblingsOf(parentId).includes(toId))) labels.push(term(from, "Nephew", "Niece", "Sibling's child"));
  const targetPartnerIds = partnersOf(toId);
  const inLaw = partnersOf(fromId).some((partnerId) => siblingsOf(toId).includes(partnerId)) || targetPartnerIds.some((partnerId) => siblingsOf(partnerId).includes(fromId));
  if (inLaw) labels.push(term(from, "Brother-in-law", "Sister-in-law", "Sibling-in-law"));
  if (targetPartnerIds.some((partnerId) => parentsOf(partnerId).includes(fromId))) labels.push(term(from, "Father-in-law", "Mother-in-law", "Parent-in-law"));
  if (partnersOf(fromId).some((partnerId) => parentsOf(toId).includes(partnerId))) labels.push(term(from, "Son-in-law", "Daughter-in-law", "Child-in-law"));
  const common = [...fromAncestors.keys()]
    .filter((id) => toAncestors.has(id))
    .map((id) => ({ id, fromDistance: fromAncestors.get(id), toDistance: toAncestors.get(id) }))
    .sort((a, b) => (a.fromDistance + a.toDistance) - (b.fromDistance + b.toDistance));
  if (common.length) {
    const closest = common[0];
    if (closest.fromDistance >= 2 && closest.toDistance >= 2) {
      const degree = Math.min(closest.fromDistance, closest.toDistance) - 1;
      const removed = Math.abs(closest.fromDistance - closest.toDistance);
      labels.push(`${ordinal(degree)} cousin${removed ? ` ${removed}× removed` : ""} through ${person(closest.id)?.displayName || "a common ancestor"}`);
    } else if (!fromAsAncestor && !fromAsDescendant && !siblings.includes(fromId)) labels.push(`Share ancestor ${person(closest.id)?.displayName || closest.id}`);
  }
  const graph = new Map(state.people.filter((p) => !p.archivedAt).map((p) => [p.id, []]));
  const connect = (a, b, relation) => { if (graph.has(a) && graph.has(b)) graph.get(a).push({ id: b, relation }); };
  for (const link of state.parentLinks.filter((item) => !item.archivedAt)) { connect(link.parentId, link.childId, "parent of"); connect(link.childId, link.parentId, "child of"); }
  for (const union of state.unions.filter((item) => !item.archivedAt)) { connect(union.partnerIds[0], union.partnerIds[1], "partner of"); connect(union.partnerIds[1], union.partnerIds[0], "partner of"); }
  const queue = [{ id: fromId, ids: [fromId], edges: [] }]; const seen = new Set(); let path = null;
  while (queue.length) {
    const current = queue.shift(); if (current.id === toId) { path = current; break; } if (seen.has(current.id)) continue; seen.add(current.id);
    for (const next of graph.get(current.id) || []) if (!seen.has(next.id)) queue.push({ id: next.id, ids: [...current.ids, next.id], edges: [...current.edges, next.relation] });
  }
  return { label: [...new Set(labels)].join(" · ") || "No documented relationship path", commonAncestors: common.slice(0, 5), path: path ? path.ids.map((id) => ({ id, displayName: person(id)?.displayName || id })) : [], pathEdges: path?.edges || [] };
}

export function addAudit(state, actor, action, entityType, entityId, summary) {
  state.audit.unshift({ id: randomUUID(), at: new Date().toISOString(), actor: actor.email, role: actor.role, action, entityType, entityId, summary: clean(summary, 300) });
  state.audit = state.audit.slice(0, 250);
}
