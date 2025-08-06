// pages/test/test.ts
Page({
  data: {
    testMealTypeOptions: ['早餐', '午餐', '晚餐', '夜宵'], // 增加一个选项，看是否能选超过2个
    testSelectedMealTypes: [] as string[],
  },
  onTestMealTypeChange: function(e: WechatMiniprogram.CustomEvent) {
    const newSelections = e.detail.value as string[];
    console.log('--- Test Page Log ---');
    console.log('e.detail.value (从组件接收):', newSelections);
    this.setData({
      testSelectedMealTypes: newSelections
    }, () => {
      console.log('data.testSelectedMealTypes (setData后):', this.data.testSelectedMealTypes);
    });
  }
});
