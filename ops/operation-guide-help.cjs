'use strict';
const assert=require('node:assert/strict');
module.exports=async function(tour){
 const demo=tour.locator('[data-guide-demo]');
 for(const name of ['看看知点的提示','这一步还不懂','用一道题独立检验','一直显示在检查题旁','再试一次','暂时隐藏，完成后可继续讨论','下一题：讲解第 2 题','结束本次讨论'])await demo.getByRole('button',{name,exact:true}).click();
 assert.equal(await demo.getAttribute('data-phase'),'done');assert.equal(await tour.locator('[data-guide-next]').isEnabled(),true);
};
