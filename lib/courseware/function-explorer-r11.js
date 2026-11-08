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
    let appliedFormula = '';
    const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = '恢复示例 2x';
    const view = document.createElement('details'); view.id = 'graph-view-r12'; view.open = true;
    view.innerHTML = '<summary>图像视野</summary><label>缩放 <input type="range" min="25" max="400" step="5" value="100" aria-label="图像纵向缩放"></label><label>上下平移 <input type="range" min="-100" max="100" step="1" value="0" aria-label="图像上下平移"></label><output></output><button type="button">适合当前函数</button>';
    const zoom = view.querySelectorAll('input')[0], pan = view.querySelectorAll('input')[1];
    let baseCenter = 0, baseHalf = 10;
    function paintView() {
      graphYCenter = baseCenter + Number(pan.value) / 100 * baseHalf * 2;
      graphYHalf = baseHalf * (100 / Number(zoom.value));
      view.querySelector('output').textContent = '纵轴 ' + Number((graphYCenter - graphYHalf).toPrecision(5)) + ' 至 ' + Number((graphYCenter + graphYHalf).toPrecision(5)) + '；横轴 −10 至 10。平移和缩放只改变观察范围。';
      draw();
    }
    function fitView() {
      const values = Array.from({length:401}, (_, i) => functions[state.current_rule].rule(-10 + i / 20)).filter(Number.isFinite);
      if (!values.length) { status.textContent = '当前横轴范围没有可绘制的实数输出，请检查函数的定义范围。'; return false; }
      const low = Math.min(0, ...values), high = Math.max(0, ...values);
      if(!Number.isFinite(high-low)||Math.max(Math.abs(low),Math.abs(high))>Number.MAX_VALUE/64) { status.textContent='数值跨度超出可绘制范围，请缩小系数；输入值与定义范围仍按原式判断。'; return false; }
      baseCenter = low / 2 + high / 2; baseHalf = Math.max(1, (high - low) * .56);
      zoom.value = '100'; pan.value = '0'; paintView();
      return true;
    }
    zoom.addEventListener('input', paintView); pan.addEventListener('input', paintView);
    view.querySelector('button').onclick = fitView;
    document.getElementById('input_x-slider').closest('.control-group').after(view);
    paintView();
    apply.onclick = () => {
      try {
        const formula = window.CourseFunctionExpression.compile(input.value);
        appliedFormula = formula.source;
        resetSimulation();
        functions.custom = { rule: formula.evaluate, label: 'f(x) = ' + formula.source, desc: '自定义探索', calcStr: x => {
          const y = formula.evaluate(x); return '输入 ' + x + '，输出 ' + (Number.isFinite(y) ? Number(y.toFixed(4)) : '无实数值或超出可计算范围');
        } };
        state.current_rule = 'custom'; document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
        updateDisplay();
        if(fitView())status.textContent = '已绘制。现在拖动 x，核对你的预测；这是自由探索，不另计分。图形是数值采样，不能替代证明。';
        input.removeAttribute('aria-invalid');
      } catch (error) { status.textContent = error.message; input.setAttribute('aria-invalid', 'true'); }
    };
    reset.onclick = () => { applyPreset('linear'); baseCenter = 0; baseHalf = 10; zoom.value = '100'; pan.value = '0'; paintView(); status.textContent = '已恢复原示例，可以继续比较输入与输出。'; input.removeAttribute('aria-invalid'); };
    input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); apply.click(); } });
    details.append(summary, label, help, apply, reset, status); host.after(details);
    document.querySelectorAll('.preset-btn').forEach(button => button.addEventListener('click', fitView));
    window.CQCoursewareProgress = {
      get: () => ({rule:state.current_rule,formula:appliedFormula,trace:state.trace.slice(-20)}),
      set: saved => {
        if(!saved||typeof saved!=='object')return;
        if(saved.rule==='custom'&&typeof saved.formula==='string'){input.value=saved.formula;apply.onclick();}
        else if(['linear','square','shift','affine','cubic'].includes(saved.rule)){applyPreset(saved.rule);fitView();}
        state.trace=Array.isArray(saved.trace)?saved.trace.filter(x=>Number.isFinite(x)&&x>=-8&&x<=8).slice(-20):[];
        updateDisplay();
      }
    };
    view.style.cssText = 'padding:10px 12px;margin:8px 0;border:1px solid #475569;border-radius:8px;color:#e2e8f0;font-size:13px';
    view.querySelectorAll('label').forEach(label => label.style.cssText = 'display:flex;align-items:center;gap:8px;margin:9px 0');
    view.querySelectorAll('input').forEach(input => input.style.cssText = 'flex:1;min-width:0');
    view.querySelector('output').style.cssText = 'display:block;line-height:1.5;margin-bottom:6px';
    const style = document.createElement('style'); style.textContent = '#custom-function-r11{padding:10px 12px;border:1px solid #475569;border-radius:8px;margin:10px 0;color:#e2e8f0;font-size:13px}#custom-function-r11 summary{cursor:pointer;font-weight:600}#custom-function-r11 label{display:flex;align-items:center;gap:8px;margin:12px 0 6px}#custom-function-r11 input{flex:1;width:120px;color:#e2e8f0;background:#0f172a;padding:8px;border:1px solid #64748b;border-radius:5px}#custom-function-r11 p{line-height:1.55;margin:8px 0;overflow-wrap:anywhere}#custom-function-r11 button{padding:7px 10px;margin:4px 6px 0 0;border:1px solid #a78bfa;border-radius:5px;color:#e2e8f0;background:#334155}#custom-function-r11 :focus-visible{outline:2px solid #c4b5fd;outline-offset:3px}@media(max-width:767px){body:has(#custom-function-r11) .r8-figure{width:100%!important;flex:1 1 auto!important;min-height:0!important;height:0!important}}'; document.head.append(style);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
