(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CourseFunctionExpression = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const functions = { abs: Math.abs, sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos };
  function compile(input) {
    const source = String(input || '').trim().replaceAll('−', '-').replaceAll('×', '*').replaceAll('÷', '/');
    if (!source || source.length > 100) throw Error('请输入 1—100 个字符的函数表达式。');
    const tokens = source.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-z]+|[()+*/^\-]|\S/g) || [];
    if (tokens.length > 80) throw Error('表达式过长，请使用更简短的规则。');
    let pos = 0, depth = 0;
    const binary = (a, b, operation) => x => {
      const left = a(x), right = b(x);
      if (!Number.isFinite(left) || !Number.isFinite(right)) return NaN;
      const result = operation(left, right); return Number.isFinite(result) ? result : NaN;
    };
    function atom() {
      if (++depth > 16) throw Error('括号或运算嵌套过多。');
      const token = tokens[pos++]; let value;
      if (/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/.test(token || '')) {
        const n = Number(token); if (!Number.isFinite(n) || Math.abs(n) > 1e6) throw Error('常数需为绝对值不超过一百万的有限数。');
        value = () => n;
      } else if (token === 'x') value = x => x;
      else if (token === 'pi' || token === 'e') value = () => token === 'pi' ? Math.PI : Math.E;
      else if (token === '(') { value = sum(); if (tokens[pos++] !== ')') throw Error('左右括号需要成对。'); }
      else if (Object.hasOwn(functions, token)) {
        if (tokens[pos++] !== '(') throw Error('函数后请使用括号，例如 sqrt(x)。');
        const child = sum(); if (tokens[pos++] !== ')') throw Error('左右括号需要成对。');
        value = x => functions[token](child(x));
      } else throw Error('仅支持 x、数字、+ - * / ^、括号及 abs、sqrt、sin、cos、pi、e。乘法请写 *。');
      depth--; return value;
    }
    function power() { const left = atom(); if (tokens[pos] !== '^') return left; pos++; const right = unary(); return binary(left, right, (a, b) => a === 0 && b === 0 ? NaN : Math.pow(a, b)); }
    function unary() { if (tokens[pos] === '+' || tokens[pos] === '-') { const sign = tokens[pos++] === '-' ? -1 : 1; if (++depth > 16) throw Error('运算嵌套过多。'); const child = unary(); depth--; return x => sign * child(x); } return power(); }
    function product() { let left = unary(); while (tokens[pos] === '*' || tokens[pos] === '/') { const op = tokens[pos++], b = unary(); left = binary(left, b, (a, b) => op === '*' ? a * b : a / b); } return left; }
    function sum() { let left = product(); while (tokens[pos] === '+' || tokens[pos] === '-') { const op = tokens[pos++], b = product(); left = binary(left, b, (a, b) => op === '+' ? a + b : a - b); } return left; }
    const evaluate = sum(); if (pos !== tokens.length) throw Error('有无法识别的内容；乘法请写 *，例如 2*x。');
    return Object.freeze({ source, evaluate(x) { const y = evaluate(x); return Number.isFinite(x) && Number.isFinite(y) ? y : NaN; } });
  }
  return Object.freeze({ compile });
});
