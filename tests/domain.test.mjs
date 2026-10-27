import test from "node:test";
import assert from "node:assert/strict";
import { createParentLink, createPerson, describeRelationship } from "../lib/domain.mjs";
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
  assert.match(result.label, /cousins through Hassan Rahman/);
});

test("rejects ancestry cycles", () => {
  const state = seedState();
  assert.throws(() => createParentLink(state, { parentId: "leila", childId: "hassan", parentType: "biological" }), /cycle/);
});

test("living status clears death information", () => {
  const person = createPerson({ displayName: "Example", lifeStatus: "living", death: { value: "2020" } });
  assert.equal(person.death.value, "");
});
