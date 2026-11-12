import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { appPasswordDecision } from "./appPassword";

const PASSWORD = "synthetic-gate";
const BASIC = `Basic ${Buffer.from(`anyone:${PASSWORD}`).toString("base64")}`;

describe("app password", () => {
    it("allows an unset password only outside production", () => {
        assert.equal(
            appPasswordDecision({
                nodeEnv: "development",
                password: undefined,
                authorization: null,
            }),
            "allow"
        );
        assert.equal(
            appPasswordDecision({
                nodeEnv: "test",
                password: "",
                authorization: null,
            }),
            "allow"
        );
        assert.equal(
            appPasswordDecision({
                nodeEnv: "production",
                password: undefined,
                authorization: null,
            }),
            "deny"
        );
    });

    it("denies a missing or wrong password and allows the right one", () => {
        assert.equal(
            appPasswordDecision({
                nodeEnv: "production",
                password: PASSWORD,
                authorization: null,
            }),
            "deny"
        );
        assert.equal(
            appPasswordDecision({
                nodeEnv: "development",
                password: PASSWORD,
                authorization: "Basic " + Buffer.from("user:nope").toString("base64"),
            }),
            "deny"
        );
        assert.equal(
            appPasswordDecision({
                nodeEnv: "production",
                password: PASSWORD,
                authorization: BASIC,
            }),
            "allow"
        );
    });
});
