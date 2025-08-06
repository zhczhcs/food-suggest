// 合并逻辑，只保留一个 App 实例
App({
  globalData: {},
  onLaunch() {
    // 保留本地日志功能
    wx.cloud.init({
      env: "cloud1-5gpt0k1x743339d9", // 您的环境ID
      traceUser: true
    });
    const logs = wx.getStorageSync('logs') || [];
    logs.unshift(Date.now());
    wx.setStorageSync('logs', logs);

    // 身体数据判断逻辑
    const bodyData = wx.getStorageSync('bodyData');
    if (!bodyData) {
      // 无数据时跳转至初始化页面
      wx.redirectTo({
        url: '/pages/init-body-data/init-body-data'
      });
    }
    // 有数据时默认进入 app.json 配置的首页（无需额外操作）
  }
});