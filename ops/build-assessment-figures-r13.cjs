'use strict';
const fs=require('node:fs'),path=require('node:path'),figures=require('../lib/assessments/assessment-figures-r13');
const root=path.resolve(__dirname,'..');
for(const item of figures.assets()){const target=path.join(root,item.src);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,item.svg,'utf8');}
console.log(`已生成${figures.assetPaths.length}幅与检查题参数一致的图。`);
