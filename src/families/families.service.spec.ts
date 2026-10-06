import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { FAM, fakeModelRepo } from "../testing/fake-repo.js";
import { as, rejectsWith } from "../testing/fakes.js";
import { familyRow } from "../testing/rows.js";
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
});
