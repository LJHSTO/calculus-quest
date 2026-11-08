'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../server.js'), 'utf8');
const start = source.indexOf('const rateLimitMap = new Map();');
const end = source.indexOf('\nfunction checkAssistantRateLimit(', start);
const handlerStart = source.indexOf('async function handleApi(req, res, url) {');
const handlerEnd = source.indexOf("\n  if(['/api/learning/support-cycle'", handlerStart);
assert(start > 0 && end > start && handlerStart > 0 && handlerEnd > handlerStart);
function boot() {
  let now = 100000, result;
  const sessions = new Map([['session-a1', 'account-a'], ['session-a2', 'account-a'], ['session-b', 'account-b']]);
  const c = vm.createContext({ Map, Date: { now: () => now }, process: { env: {} },
    authenticate(req) { const id = sessions.get(req.headers.authorization); return id ? { participant: { id } } : null; },
    sendJson(_res, status, body) { result = { status, body }; } });
  vm.runInContext(source.slice(start, end), c);
  vm.runInContext(source.slice(handlerStart, handlerEnd) + '\n} catch(error) { throw error; }\n}', c);
  const request = (method, token) => ({ method, headers: token ? { authorization: token } : {}, socket: { remoteAddress: 'synthetic-nat' } });
  return { context: c, advance(ms) { now += ms; },
    check(path, method = 'GET', token) { const req = request(method, token); return { allowed: c.checkRateLimit(req, path), retryAfterSeconds: req.rateLimitRetryAfterSeconds }; },
    keys() { return vm.runInContext('[...rateLimitMap.keys()]', c); },
    async response(path, method = 'GET', token) { const headers = {}; result = null; await c.handleApi(request(method, token), { setHeader(name, value) { headers[name] = value; } }, { pathname: path }); return { ...result, headers }; } };
}
async function main() {
  const publicRead = boot();
  for (let i = 0; i < 120; i++) assert(publicRead.check('/api/health').allowed);
  assert.equal(publicRead.check('/api/health').allowed, false);
  assert(publicRead.check('/api/auth/login', 'POST').allowed, '公开读取耗尽不能阻止登录准入');
  assert(publicRead.check('/api/auth/register', 'POST').allowed, '公开读取耗尽不能阻止注册准入');
  assert(publicRead.check('/api/auth/me', 'POST', 'session-a1').allowed, '有效会话核验不能消费匿名公开读额度');
  for (let i = 0; i < 118; i++) assert(publicRead.check('/api/auth/login', 'POST').allowed);
  assert.equal(publicRead.check('/api/auth/register', 'POST').allowed, false, '登录和注册共享有限认证IP额度');
  assert(publicRead.check('/api/auth/me', 'POST', 'session-a1').allowed, '匿名认证额度耗尽不能阻止已验证会话核验');

  const invalid = boot();
  for (let i = 0; i < 120; i++) assert(invalid.check('/api/auth/me', 'POST', 'invalid-' + i).allowed);
  assert.equal(invalid.check('/api/auth/me', 'POST', 'invalid-next').allowed, false);
  assert.equal(invalid.check('/api/auth/login', 'POST').allowed, false, '无效token仍占认证IP额度');
  assert.equal(invalid.keys().length, 1, '随机token不能创建无限额外桶');
  assert(invalid.check('/api/health').allowed, '认证限流也不污染公共读取额度');

  const account = boot();
  for (let i = 0; i < 120; i++) assert(account.check(i % 2 ? '/api/auth/me' : '/api/learning/pilot', i % 2 ? 'POST' : 'GET', i % 2 ? 'session-a2' : 'session-a1').allowed);
  assert.equal(account.check('/api/auth/me', 'POST', 'session-a1').allowed, false, '同账号不同会话共享账号读取额度');
  assert.equal(account.check('/api/learning/pilot', 'GET', 'session-a2').allowed, false);
  assert(account.check('/api/auth/me', 'POST', 'session-b').allowed, '同NAT其他有效账号仍可核验');
  assert(account.check('/api/learning/quiz/submit', 'POST', 'session-a1').allowed, '读取耗尽不消耗作答额度');
  assert(account.check('/api/learning/snapshot', 'POST', 'session-a1').allowed, '读取耗尽不消耗同步额度');

  const first = await publicRead.response('/api/health');
  assert.equal(first.status, 429); assert.equal(first.body.retryAfterSeconds, 60); assert.equal(first.headers['Retry-After'], '60');
  publicRead.advance(59800);
  const last = await publicRead.response('/api/health');
  assert.equal(last.body.retryAfterSeconds, 1); assert.equal(last.headers['Retry-After'], '1');
  publicRead.advance(200);
  const reset = publicRead.check('/api/health'); assert(reset.allowed); assert.equal(reset.retryAfterSeconds, 0);
  console.log('认证限流隔离通过：默认120/60秒、公开读/认证有界、有效me按账号读、多会话共享、无效token同桶、账号动作/同步隔离、Retry-After与窗口恢复。');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
