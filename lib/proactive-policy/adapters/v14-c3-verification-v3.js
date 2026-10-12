"use strict";

const previous = require("./v14-c3-verification-v2");
const version = "v14-c3-verification-v3";
const partsL4 = {
  subSkill: "parts_differentials_and_substitution",
  prompt: "对∫x sin(2x)dx取u=x、dv=sin(2x)dx。哪组du、v及代入分部积分后的式子正确？",
  options: Object.freeze([
    Object.freeze({ value: "a", label: "du=dx，v=-cos(2x)/2，得到 -x cos(2x)/2+(1/2)∫cos(2x)dx" }),
    Object.freeze({ value: "b", label: "du=dx，v=-cos(2x)/2，得到 -x cos(2x)/2-(1/2)∫cos(2x)dx" }),
    Object.freeze({ value: "c", label: "du=dx，v=-cos(2x)，得到 -x cos(2x)+∫cos(2x)dx" })
  ]),
  answer: "a"
};

// Retain v2 unchanged so issued checks continue to mean exactly what was shown.
const checks = Object.freeze(Object.fromEntries(Object.entries(previous.checks).map(([point, levels]) => [
  point, Object.freeze(Object.fromEntries(Object.entries(levels).map(([level, check]) => [
    level, Object.freeze({
      ...check,
      ...(point === "GH-07-K04" && level === "L4" ? partsL4 : {}),
      id: `${point}-probe-${level.toLowerCase()}-v3`,
      instrumentVersion: version
    })
  ])))
])));

module.exports = Object.freeze({ version, checks });
