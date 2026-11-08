'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const manifestPath='resources/open-maic/pro-supplements-r11/provenance.json';
const allowed=/^resources\/open-maic\/pro-supplements-r11\/(?:GH-0[12]-K0[123]\.html|audio\/audio-[0-9]+\.mp3)$/;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function verify(root){
  const bytes=fs.readFileSync(path.join(root,manifestPath)),manifest=JSON.parse(bytes.toString('utf8'));
  const files=manifest.files;if(!Array.isArray(files)||files.length!==24||new Set(files.map(f=>f.path)).size!==24)throw Error('Pro课件资源清单不完整');
  if(files.filter(f=>f.path.endsWith('.html')).length!==6||files.filter(f=>f.path.endsWith('.mp3')).length!==18)throw Error('Pro课件页面或讲稿语音数量不匹配');
  const digests={};for(const file of files){
    if(!allowed.test(file.path)||!/[a-f0-9]{64}/.test(file.sha256)||file.sha256.length!==64)throw Error('Pro课件资源路径或摘要无效');
    const content=fs.readFileSync(path.join(root,file.path));
    if(content.length!==file.bytes||hash(content)!==file.sha256)throw Error(`Pro课件完整性校验失败：${file.path}`);
    digests[file.path]=file.sha256;
  }
  return {version:manifest.version,source:'OpenMAIC Pro',manifestPath,manifestSha256:hash(bytes),files:digests};
}
module.exports={verify,manifestPath};
