import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateApplicationDto } from "../../applications/dto/applications.dto.js";
import { CreateFamilyDto } from "../../families/dto/families.dto.js";
import { EMAIL_ERROR } from "./fields.js";

const emailErrors = async (email: unknown): Promise<string[]> =>
  (await validate(plainToInstance(CreateApplicationDto, { email }), { whitelist: true, stopAtFirstError: true }))
    .filter((e) => e.property === "email")
    .flatMap((e) => Object.values(e.constraints ?? {}));

describe("OptionalEmail", () => {
  test("accepts real addresses, with surrounding spaces, and blank or missing values", async () => {
    for (const email of ["name@gmail.com", " Name.Surname@npsindore.org ", "", "   ", null, undefined])
      assert.deepEqual(await emailErrors(email), [], String(email));
  });
  test("refuses addresses that could never receive mail", async () => {
    for (const email of ["arpan@gmail com", "name@gmail", "name.gmail.com", "name@@gmail.com", "a b@gmail.com"])
      assert.deepEqual(await emailErrors(email), [EMAIL_ERROR], email);
  });
  test("is used by the family DTO too", async () => {
    const errors = await validate(plainToInstance(CreateFamilyDto, { email: "head@gmail com" }), { whitelist: true, stopAtFirstError: true });
    assert.deepEqual(errors.find((e) => e.property === "email")?.constraints, { isEmailOrBlank: EMAIL_ERROR });
  });
});
