// components/NutritionCard/NutritionCard.ts
Component({
  properties: {
    title: { type: String, value: '' }, // 卡片标题
    tag: { type: String, optional: true }, // 标签（如“推荐”“高纤维”）
    nutrients: { 
      type: Array, 
      value: [], 
      // 数据格式：[{name: '热量', value: 150, unit: 'kcal'}, ...]
    },
    desc: { type: String, optional: true }, // 附加说明（如食用建议）
    actions: { 
      type: Array, 
      value: [],
      // 操作按钮：[{text: '加入记录', callback: 'addRecord'}, ...]
    },
    type: { type: String, value: 'normal' } // 样式类型（normal/suggest）
  },
  methods: {
    onActionTap(e: WechatMiniprogram.TouchEvent) {
      const index = e.currentTarget.dataset.index;
      this.triggerEvent('action', this.data.actions[index]);
    }
  }
})