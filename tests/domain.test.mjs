import test from "node:test";
import assert from "node:assert/strict";
import { createParentLink, createPerson, createUnion, describeRelationship, scopedFamilyState } from "../lib/domain.mjs";
import { seedState } from "../lib/seed.mjs";

test("stores multiple marriages and children under their correct union", () => {
  const state = seedState();
  const leilaUnions = state.unions.filter((union) => union.partnerIds.includes("leila"));
  assert.equal(leilaUnions.length, 2);
  assert.deepEqual(leilaUnions.map((union) => union.status).sort(), ["divorced", "married"]);
  const mayaParents = state.parentLinks.filter((link) => link.childId === "maya");
  assert.equal(mayaParents.length, 2);
  assert.ok(mayaParents.every((link) => link.unionId === "union-leila-idris"));
});

test("a married couple may also share an ancestor", () => {
  const result = describeRelationship(seedState(), "leila", "kareem");
  assert.match(result.label, /Spouse/);
  assert.match(result.label, /cousin through Hassan Rahman/);
  assert.deepEqual(result.path.map((person) => person.id), ["leila", "kareem"]);
});

test("calculates named sibling and grandparent relationships", () => {
  const state = seedState();
  assert.match(describeRelationship(state, "yusuf", "amina").label, /Brother/);
  assert.match(describeRelationship(state, "hassan", "farid").label, /Grandfather/);
  assert.match(describeRelationship(state, "amina", "farid").label, /Aunt/);
  assert.match(describeRelationship(state, "farid", "amina").label, /Nephew/);
  assert.match(describeRelationship(state, "mariam", "farid").label, /1st cousin/);
});

test("scopes a viewer to grandparents and the nearby extended-family branch", () => {
  const state = scopedFamilyState(seedState(), "hana", 2);
  const visible = new Set(state.people.map((person) => person.id));
  for (const id of ["hana", "leila", "kareem", "samira", "tariq", "maya", "sami", "idris"]) assert.ok(visible.has(id), `${id} should be visible`);
  for (const id of ["omar", "noura", "hassan"]) assert.ok(!visible.has(id), `${id} is above the grandparent boundary`);
  assert.match(describeRelationship(state, "sami", "hana").label, /Brother/);
});

test("rejects ancestry cycles", () => {
  const state = seedState();
  assert.throws(() => createParentLink(state, { parentId: "leila", childId: "hassan", parentType: "biological" }), /cycle/);
});

test("living status clears death information", () => {
  const person = createPerson({ displayName: "Example", lifeStatus: "living", death: { value: "2020" } });
  assert.equal(person.death.value, "");
});

test("stores an optional secure profile photo", () => {
  const person = createPerson({ displayName: "Example", photo: { url: "https://images.example.test/person.jpg", caption: "Portrait" } });
  assert.equal(person.photo.caption, "Portrait");
  assert.match(person.photo.url, /^https:/);
});

test("permits an existing marriage and parent link to be rebuilt for editing", () => {
  const state = seedState();
  const union = state.unions.find((item) => item.id === "union-leila-kareem");
  const updatedUnion = createUnion(state, { ...union, status: "separated", notes: "Updated record" });
  assert.equal(updatedUnion.id, union.id);
  assert.equal(updatedUnion.status, "separated");
  const link = state.parentLinks.find((item) => item.id === "parent-leila-hana");
  const updatedLink = createParentLink(state, { ...link, confidence: "likely" });
  assert.equal(updatedLink.id, link.id);
  assert.equal(updatedLink.confidence, "likely");
});
