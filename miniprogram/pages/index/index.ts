// 无需引入miniprogram-api-typings，直接使用小程序原生Page构造器
Page({
  data: {
    // 今日推荐数据（与wxml绑定，结构对应NutritionCard组件需求）
    todaySuggest: {
      title: "夏日清爽食谱",
      nutrients: [
        { name: "热量", value: "1500kcal" },
        { name: "蛋白质", value: "55g" },
        { name: "水分", value: "充足" }
      ],
      desc: "适合夏季的低卡饮食，帮助维持身体代谢"
    }
  },

  onLoad() {
    // 页面加载时可初始化数据，例如从本地缓存读取历史推荐
    const storedSuggest = wx.getStorageSync('lastSuggest');
    if (storedSuggest) {
      this.setData({ todaySuggest: storedSuggest });
    }
  },

  // 处理营养卡片的操作事件（如"查看详情"）
  onSuggestAction(e) {
    const action = e.detail;
    if (action.callback === 'viewDetail') {
      // 跳转到饮食建议详情页（对应功能模块中的“每日饮食建议推送”）
      wx.navigateTo({
        url: '/pages/suggest/suggest?detail=' + JSON.stringify(this.data.todaySuggest)
      });
    }
  }
});