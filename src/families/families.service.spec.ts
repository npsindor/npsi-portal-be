import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { FAM, fakeModelRepo } from "../testing/fake-repo.js";
import { as, rejectsWith } from "../testing/fakes.js";
import { familyRow } from "../testing/rows.js";
import { FamilyHomeVisibilityDto } from "./dto/families.dto.js";
import type { FamiliesRepository } from "./families.repository.js";
import { FamiliesService } from "./families.service.js";

const build = () => {
  const repo = fakeModelRepo(familyRow, [
    familyRow({ id: "f-own", familyId: FAM, memberCount: 2, status: "ACTIVE" }),
    familyRow({ id: "f-other", familyId: "OTHER" }),
  ]);
  repo.latestDisplayIds.mock.mockImplementation(async () => ["NPSI-FAM-000023"]);
  return { service: new FamiliesService(as<FamiliesRepository>(repo)), repo };
};

describe("FamiliesService", () => {
  test("list filters by display id and status", async () => {
    const { service, repo } = build();
    await service.list({ familyId: FAM, status: "ACTIVE", order: "familyName" });
    assert.deepEqual(repo.list.mock.calls[0].arguments, [{ familyId: FAM, status: "ACTIVE" }, [{ familyName: "asc" }, { id: "asc" }], 100, undefined]);
  });
  test("admins create with the next display id", async () => {
    const created = await build().service.create({ familyName: "New", registrationDate: "2026-02-01T10:00:00.000Z" });
    assert.deepEqual([created.familyId, created.registrationDate], ["NPSI-FAM-000024", new Date("2026-02-01T10:00:00.000Z")]);
  });
  test("update (admins only, by the guard); 404; remove", async () => {
    const { service } = build();
    assert.equal((await service.update("f-other", { status: "ACTIVE" })).status, "ACTIVE");
    await rejectsWith(service.update("missing", {}), 404, "Record not found");
    await service.remove("f-other");
  });
  test("On website for many families at once: one update with each id once; nothing chosen is a 400", async () => {
    const { service, repo } = build();
    const setShowOnHome = mock.fn(async (ids: string[]) => ids.length - 1);
    Object.assign(repo, { setShowOnHome });
    assert.deepEqual(await service.setHomeVisibility({ familyIds: ["f-own", " f-other ", "f-own", "missing"], showOnHome: false }), { updated: 2 });
    assert.equal(setShowOnHome.mock.callCount(), 1);
    assert.deepEqual(setShowOnHome.mock.calls[0].arguments, [["f-own", "f-other", "missing"], false]);
    await rejectsWith(service.setHomeVisibility({ familyIds: ["  "], showOnHome: true }), 400, "Choose at least one family.");
  });
  test("the select-all request is validated: a non-empty list of ids and a real true/false", async () => {
    const errors = async (body: unknown) =>
      (await validate(plainToInstance(FamilyHomeVisibilityDto, body), { whitelist: true, stopAtFirstError: true })).flatMap((e) =>
        Object.values(e.constraints ?? {}),
      );
    assert.deepEqual(await errors({ familyIds: ["a", "b"], showOnHome: true }), []);
    assert.deepEqual(await errors({ familyIds: [], showOnHome: true }), ["Choose at least one family."]);
    assert.deepEqual(await errors({ familyIds: "a", showOnHome: true }), ["familyIds must be a list of family ids."]);
    assert.deepEqual(await errors({ familyIds: ["a"], showOnHome: "yes" }), ["showOnHome must be true or false."]);
    assert.deepEqual(await errors({ familyIds: Array.from({ length: 2001 }, (_, i) => `f${i}`), showOnHome: true }), ["At most 2000 families at a time."]);
  });
});
