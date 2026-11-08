(function () {
  'use strict';
  function install() {
    const host = document.querySelector('.presets-section');
    if (!host || document.getElementById('custom-function-r11')) return;
    const details = document.createElement('details'); details.id = 'custom-function-r11';
    const summary = document.createElement('summary'); summary.textContent = '试试自己的函数（可选）';
    const label = document.createElement('label'); label.textContent = 'f(x) = ';
    const input = document.createElement('input'); input.type = 'text'; input.maxLength = 100; input.value = 'x^2-1'; input.setAttribute('aria-label', '自定义函数表达式'); label.append(input);
    const help = document.createElement('p'); help.textContent = '先预测，再绘图和拖动 x。支持 + - * / ^、括号、abs、sqrt、sin、cos；乘法写 *。可拖动输入范围 x∈[-8,8]，无实数输出的位置留空；屏幕范围不等于函数的完整定义域。';
    const status = document.createElement('p'); status.setAttribute('role', 'status');
    const apply = document.createElement('button'); apply.type = 'button'; apply.textContent = '绘制这个函数';
    const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = '恢复示例 2x';
    apply.onclick = () => {
      try {
        const formula = window.CourseFunctionExpression.compile(input.value);
        resetSimulation();
        functions.custom = { rule: formula.evaluate, label: 'f(x) = ' + formula.source, desc: '自定义探索', calcStr: x => {
          const y = formula.evaluate(x); return '输入 ' + x + '，输出 ' + (Number.isFinite(y) ? Number(y.toFixed(4)) : '无实数值或超出可计算范围');
        } };
        state.current_rule = 'custom'; document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        updateDisplay();
        status.textContent = '已绘制。现在拖动 x，核对你的预测；这是自由探索，不另计分。图形是数值采样，不能替代证明。';
        input.removeAttribute('aria-invalid');
      } catch (error) { status.textContent = error.message; input.setAttribute('aria-invalid', 'true'); }
    };
    reset.onclick = () => { applyPreset('linear'); status.textContent = '已恢复原示例，可以继续比较输入与输出。'; input.removeAttribute('aria-invalid'); };
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); apply.click(); } });
    details.append(summary, label, help, apply, reset, status); host.after(details);
    const style = document.createElement('style'); style.textContent = '#custom-function-r11{padding:10px 12px;border:1px solid #475569;border-radius:8px;margin:10px 0;color:#e2e8f0;font-size:13px}#custom-function-r11 summary{cursor:pointer;font-weight:600}#custom-function-r11 label{display:flex;align-items:center;gap:8px;margin:12px 0 6px}#custom-function-r11 input{flex:1;width:120px;color:#e2e8f0;background:#0f172a;padding:8px;border:1px solid #64748b;border-radius:5px}#custom-function-r11 p{line-height:1.55;margin:8px 0;overflow-wrap:anywhere}#custom-function-r11 button{padding:7px 10px;margin:4px 6px 0 0;border:1px solid #a78bfa;border-radius:5px;color:#e2e8f0;background:#334155}#custom-function-r11 :focus-visible{outline:2px solid #c4b5fd;outline-offset:3px}@media(max-width:767px){body:has(#custom-function-r11) .r8-figure{width:100%!important;flex:1 1 auto!important;min-height:0!important;height:0!important}}'; document.head.append(style);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
