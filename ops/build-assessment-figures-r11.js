'use strict';
const fs=require('node:fs'),path=require('node:path');
const figures=require('../lib/assessments/assessment-figures-r11');
const root=path.resolve(__dirname,'..');
const assets=figures.assets();
for(const asset of assets){const target=path.resolve(root,asset.file);if(!target.startsWith(root+path.sep))throw Error('图形目标路径越界');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,asset.svg,'utf8');}
const manifest={version:figures.version,files:assets.map(({svg,...asset})=>asset)};
fs.writeFileSync(path.join(root,figures.prefix,'manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
console.log(JSON.stringify({version:figures.version,figures:assets.length,output:figures.prefix}));
