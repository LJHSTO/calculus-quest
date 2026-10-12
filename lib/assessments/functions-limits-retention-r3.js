"use strict";

const previous = require("./functions-limits-retention-r2");
const fourthChoices = [
  "一定违反，因为不同输入必须对应不同输出", "9", "能，因为每个学号只有一个学生使用",
  "(12,12)", "(2,2)", "改成(5,5)",
  "不变，因为两次函数值都为负", "它的值保持不变，因为没有经过0", "能，因为相邻观测值之差相同",
  "3", "12", "能，因为极限只取决于最后一次采样",
  "能，只要把函数值设为2", "左极限存在且为2", "4",
  "只有函数在该点可导才能连续", "0", "能，只要删除该点的函数值"
];

module.exports = {
  version: "functions-limits-retention-r3",
  items: previous.items.map((item, index) => ({
    ...item, id: item.id.replace("-DR-r2-", "-DR-r3-"),
    row: [item.row[0], [...item.row[1], fourthChoices[index]], ...item.row.slice(2)]
  }))
};
