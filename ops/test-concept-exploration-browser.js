'use strict';
// 自动附加练习已撤下；此入口复用逐页验收，检查无预置支架及原课件操作布局。
process.env.LAYOUT_BASE_URL=process.env.CQ_TEST_URL||'http://127.0.0.1:59225';
require('./inspect-courseware-layout');
