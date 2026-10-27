import { createParentLink, createPerson, createUnion } from "./domain.mjs";

const p = (id, displayName, lifeStatus, birth, death, branch, bio = "") => createPerson({ id, displayName, lifeStatus, birth: { value: birth, precision: "year" }, death: { value: death || "", precision: death ? "year" : "unknown" }, branch, bio, privacy: lifeStatus === "living" ? "private" : "family" });

export function seedState() {
  const state = {
    workspace: { id: "roots-demo", name: process.env.TREE_NAME || "The Rahman Family Archive", createdAt: new Date().toISOString() },
    people: [
      p("hassan", "Hassan Rahman", "deceased", "1840", "1912", "Rahman", "The earliest documented ancestor in this archive."),
      p("yusuf", "Yusuf Rahman", "deceased", "1865", "1931", "Northern branch"),
      p("amina", "Amina Rahman", "deceased", "1869", "1940", "Coastal branch"),
      p("farid", "Farid Rahman", "deceased", "1891", "1962", "Northern branch"),
      p("mariam", "Mariam Yusuf", "deceased", "1897", "1970", "Coastal branch"),
      p("omar", "Omar Farid", "deceased", "1920", "1995", "Northern branch"),
      p("noura", "Noura Saleh", "deceased", "1925", "2001", "Coastal branch"),
      p("samira", "Samira Omar", "living", "1950", "", "Northern branch"),
      p("tariq", "Tariq Noura", "living", "1954", "", "Coastal branch"),
      p("leila", "Leila Samira", "living", "1978", "", "Northern branch", "Archivist and oral-history interviewer."),
      p("kareem", "Kareem Tariq", "living", "1976", "", "Coastal branch", "Teacher and keeper of the family recipe notebooks."),
      p("idris", "Idris Malik", "living", "1975", "", "Malik"),
      p("maya", "Maya Leila", "living", "2009", "", "Northern branch"),
      p("hana", "Hana Rahman", "living", "2019", "", "Rahman"),
      p("sami", "Sami Rahman", "living", "2022", "", "Rahman")
    ],
    unions: [],
    parentLinks: [],
    stories: [
      { id: "story-1", title: "The cedar chest", body: "Hassan's travel papers and family letters were preserved in a cedar chest for four generations.", personIds: ["hassan"], visibility: "family", createdAt: new Date().toISOString() }
    ],
    audit: []
  };
  const genders = { hassan: "male", yusuf: "male", amina: "female", farid: "male", mariam: "female", omar: "male", noura: "female", samira: "female", tariq: "male", leila: "female", kareem: "male", idris: "male", maya: "female", hana: "female", sami: "male" };
  for (const person of state.people) person.gender = genders[person.id] || "unknown";
  const parentPairs = [
    ["hassan", "yusuf"], ["hassan", "amina"], ["yusuf", "farid"], ["amina", "mariam"],
    ["farid", "omar"], ["mariam", "noura"], ["omar", "samira"], ["noura", "tariq"],
    ["samira", "leila"], ["tariq", "kareem"]
  ];
  for (const [parentId, childId] of parentPairs) state.parentLinks.push(createParentLink(state, { id: `parent-${parentId}-${childId}`, parentId, childId, parentType: "biological", confidence: "confirmed" }));
  const first = createUnion(state, { id: "union-leila-idris", partnerIds: ["leila", "idris"], type: "marriage", status: "divorced", start: { value: "2007", precision: "year" }, end: { value: "2015", precision: "year" }, endReason: "divorce", place: "Jakarta" });
  state.unions.push(first);
  state.parentLinks.push(createParentLink(state, { id: "parent-leila-maya", parentId: "leila", childId: "maya", parentType: "biological", unionId: first.id }));
  state.parentLinks.push(createParentLink(state, { id: "parent-idris-maya", parentId: "idris", childId: "maya", parentType: "biological", unionId: first.id }));
  const second = createUnion(state, { id: "union-leila-kareem", partnerIds: ["leila", "kareem"], type: "marriage", status: "married", start: { value: "2017-08", precision: "month" }, place: "Bandung", sourceNote: "Family marriage certificate" });
  state.unions.push(second);
  for (const childId of ["hana", "sami"]) {
    state.parentLinks.push(createParentLink(state, { id: `parent-leila-${childId}`, parentId: "leila", childId, parentType: "biological", unionId: second.id }));
    state.parentLinks.push(createParentLink(state, { id: `parent-kareem-${childId}`, parentId: "kareem", childId, parentType: "biological", unionId: second.id }));
  }
  return state;
}
