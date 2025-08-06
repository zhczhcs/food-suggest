//BaseHeader.ts
Component({
  properties: {
    title: { type: String, value: '' }, // 当前页面标题
    showBack: { type: Boolean, value: false } // 是否显示返回按钮
  },
  methods: {
    onBack() {
      wx.navigateBack(); // 返回上一页
    }
  }
});