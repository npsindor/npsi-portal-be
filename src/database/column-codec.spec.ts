import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Prisma } from "../generated/prisma/client.js";
import { toApiRow, toApiValue, toDbValue } from "./column-codec.js";

const rejects500 = (fn: () => unknown, message: RegExp) =>
  assert.throws(fn, (error: unknown) => {
    const e = error as { getStatus(): number; getResponse(): { error: string } };
    assert.equal(e.getStatus(), 500);
    assert.match(e.getResponse().error, message);
    return true;
  });

describe("toApiValue (Prisma -> legacy MySQL formats)", () => {
  test("DATE columns as YYYY-MM-DD", () => {
    assert.equal(toApiValue("dd", new Date("2026-12-01T00:00:00.000Z")), "2026-12-01");
  });
  test("DECIMAL(12,2) with two decimals", () => {
    assert.equal(toApiValue("d", new Prisma.Decimal("100")), "100.00");
    assert.equal(toApiValue("d", new Prisma.Decimal("250.5")), "250.50");
  });
  test("TINYINT booleans as 1/0", () => {
    assert.equal(toApiValue("b", true), 1);
    assert.equal(toApiValue("b", false), 0);
  });
  test("everything else, and nulls, unchanged", () => {
    const when = new Date("2026-01-01T10:00:00.000Z");
    assert.equal(toApiValue("dt", when), when);
    assert.deepEqual(toApiValue("j", { a: 1 }), { a: 1 });
    assert.equal(toApiValue("s", "x"), "x");
    assert.equal(toApiValue("dd", null), null);
    assert.equal(toApiValue(undefined, 5), 5);
  });
  test("toApiRow converts by column", () => {
    assert.deepEqual(toApiRow({ fee: "d", read: "b" }, { id: "1", fee: new Prisma.Decimal("1"), read: false }), { id: "1", fee: "1.00", read: 0 });
  });
});

describe("toDbValue (values the legacy SQL bound -> Prisma types)", () => {
  test("DATETIME and DATE text", () => {
    assert.deepEqual(toDbValue("c", "dt", "2026-02-01 10:00:00"), new Date("2026-02-01T10:00:00.000Z"));
    assert.deepEqual(toDbValue("c", "dt", "2026-02-01"), new Date("2026-02-01T00:00:00.000Z"));
    assert.deepEqual(toDbValue("c", "dd", "2026-02-01"), new Date("2026-02-01T00:00:00.000Z"));
    assert.deepEqual(toDbValue("c", "dd", "2026-02-01 23:59:59"), new Date("2026-02-01T00:00:00.000Z"));
    rejects500(() => toDbValue("dob", "dd", "yesterday"), /Incorrect date value: 'yesterday' for column 'dob'/);
    rejects500(() => toDbValue("at", "dt", "2026-13-45 99:99:99"), /Incorrect datetime value/);
    rejects500(() => toDbValue("at", "dt", 5), /Incorrect datetime value: 5/);
  });
  test("INT and DECIMAL", () => {
    assert.equal(toDbValue("c", "i", "40"), 40);
    assert.equal(toDbValue("c", "i", 2.5), 3);
    assert.equal(toDbValue("c", "i", true), 1);
    assert.equal(toDbValue("c", "d", 99.5), 99.5);
    assert.equal(toDbValue("c", "d", " 12.30 "), "12.30");
    rejects500(() => toDbValue("count", "i", "abc"), /Incorrect integer value: 'abc' for column 'count'/);
    rejects500(() => toDbValue("fee", "d", ""), /Incorrect decimal value/);
  });
  test("TINYINT booleans", () => {
    for (const v of [true, 1, "1"]) assert.equal(toDbValue("c", "b", v), true);
    for (const v of [false, 0, "0"]) assert.equal(toDbValue("c", "b", v), false);
    rejects500(() => toDbValue("read", "b", "yes"), /Incorrect integer value: 'yes' for column 'read'/);
  });
  test("JSON: text is parsed, values pass through, null is SQL NULL", () => {
    assert.deepEqual(toDbValue("c", "j", '["a"]'), ["a"]);
    assert.deepEqual(toDbValue("c", "j", { a: 1 }), { a: 1 });
    assert.equal(toDbValue("c", "j", null), Prisma.DbNull);
    rejects500(() => toDbValue("questions", "j", "{bad"), /Invalid JSON text/);
  });
  test("text columns get MySQL's string conversion", () => {
    assert.equal(toDbValue("c", "s", 9876543210), "9876543210");
    assert.equal(toDbValue("c", "s", true), "1");
    assert.equal(toDbValue("c", "s", { a: 1 }), '{"a":1}');
    assert.equal(toDbValue("c", "s", null), null);
    assert.equal(toDbValue("c", undefined, "x"), "x");
  });
});
