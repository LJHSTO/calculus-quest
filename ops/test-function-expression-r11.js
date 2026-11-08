'use strict';
const assert = require('node:assert/strict');
const { compile } = require('../lib/courseware/function-expression-r11');
for (const [formula, x, expected] of [['2*x+1', 2, 5], ['-x^2', 3, -9], ['(-x)^2', 3, 9], ['2^-2', 0, .25], ['2^3^2', 0, 512], ['sqrt(abs(x))', -4, 2], ['sin(pi/2)', 0, 1], ['1e-2*x', 5, .05], ['x−1', 2, 1]]) assert.equal(compile(formula).evaluate(x), expected, formula);
for (const formula of ['alert(1)', 'x.constructor', 'Math.sin(x)', '2x', 'x;1', '', '1e999', 'x=2', 'x[0]', 'sqrt(x', 'x)', 'sin(x,1)', '('.repeat(20) + 'x' + ')'.repeat(20)]) assert.throws(() => compile(formula), formula);
for (const [formula, x] of [['1/x', 0], ['sqrt(x)', -1], ['(-2)^.5', 0], ['10^1000', 0], ['1/(1/x)', 0], ['sqrt(x)^0', -1], ['0^0', 0], ['1/(10^1000)', 1]]) assert.ok(Number.isNaN(compile(formula).evaluate(x)), formula);
console.log('r11 自定义函数：优先级、实数定义域、输入白名单和长度限制通过。');
