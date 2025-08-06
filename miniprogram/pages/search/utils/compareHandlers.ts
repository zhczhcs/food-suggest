// pages/search/utils/compareHandlers.ts

import { FoodItem, SearchPageContext } from './types';

// 切换对比选择模式
export function toggleCompareMode(pageContext: SearchPageContext) {
  pageContext.setData({
    compareMode: !pageContext.data.compareMode,
    selectedFoods: [] // 切换模式时清空已选
  });
  // 同时清除所有食物的 isSelected 状态
  const updates: Record<string, any> = {};
  pageContext.data.allFoodGroups.forEach((group, gIdx) => {
    group.foods.forEach((food, fIdx) => {
      if (food.isSelected) {
        updates[`allFoodGroups[${gIdx}].foods[${fIdx}].isSelected`] = false;
        // 也要更新 filteredFoodGroups
        const currentFilteredGroup = pageContext.data.filteredFoodGroups.find(fg => fg.letter === group.letter);
        if (currentFilteredGroup) {
          const filteredFoodIndex = currentFilteredGroup.foods.findIndex(f => f.id === food.id);
          if (filteredFoodIndex !== -1) {
            const filteredGroupIndex = pageContext.data.filteredFoodGroups.indexOf(currentFilteredGroup);
            if (filteredGroupIndex !== -1) {
              updates[`filteredFoodGroups[${filteredGroupIndex}].foods[${filteredFoodIndex}].isSelected`] = false;
            }
          }
        }
      }
    });
  });
  if (Object.keys(updates).length > 0) {
    pageContext.setData(updates);
  }


  if (!pageContext.data.compareMode) {
    wx.showToast({
      title: '已退出对比模式',
      icon: 'none',
      duration: 1500
    });
  } else {
    wx.showToast({
      title: '选择食物进行对比',
      icon: 'none',
      duration: 2000
    });
  }
}

// 食物项的点击事件（非长按）
export function onFoodItemTap(pageContext: SearchPageContext, e: WechatMiniprogram.BaseEvent) {
  if (pageContext.data.compareMode) {
    // 如果在对比模式，则视为选择/取消选择
    onLongPressFood(pageContext, e); // 复用长按的逻辑
    return;
  }
  // 否则，正常跳转到详情页
  const { foodid, foodname } = e.currentTarget.dataset;
  wx.navigateTo({
    url: `/pages/search/foodDt/foodDt?id=${foodid}&name=${foodname}`
  });
}

// 食物项的长按事件
export function onLongPressFood(pageContext: SearchPageContext, e: WechatMiniprogram.BaseEvent) {
  const { foodid, foodname } = e.currentTarget.dataset;
  console.log(`[onLongPressFood] Event triggered for foodId: ${foodid}, foodName: ${foodname}`);

  let foundFoodGroupIndex: number = -1;
  let foundFoodItemIndex: number = -1;
  let foodItemToModify: FoodItem | undefined;

  // 找到具体的 FoodItem 及其在 allFoodGroups 中的索引
  for (let gIdx = 0; gIdx < pageContext.data.allFoodGroups.length; gIdx++) {
    const group = pageContext.data.allFoodGroups[gIdx];
    for (let fIdx = 0; fIdx < group.foods.length; fIdx++) {
      if (group.foods[fIdx].id === foodid) {
        foodItemToModify = group.foods[fIdx];
        foundFoodGroupIndex = gIdx;
        foundFoodItemIndex = fIdx;
        break;
      }
    }
    if (foodItemToModify) break;
  }

  if (!foodItemToModify) {
    console.warn(`[onLongPressFood] 未在 allFoodGroups 中找到食物项: ${foodid}`);
    return;
  }
  console.log(`[onLongPressFood] Found foodItemToModify:`, foodItemToModify);

  let currentSelectedFoods = [...pageContext.data.selectedFoods];
  const indexInSelected = currentSelectedFoods.findIndex(f => f.id === foodItemToModify!.id);
  console.log(`[onLongPressFood] Current selectedFoods before update:`, currentSelectedFoods);
  console.log(`[onLongPressFood] Index in selectedFoods: ${indexInSelected}`);

  let newSelectedState: boolean;

  if (indexInSelected > -1) {
    // 已经选中，则取消选中
    currentSelectedFoods.splice(indexInSelected, 1);
    newSelectedState = false;
    if (pageContext.data.compareMode) {
      wx.showToast({
        title: `已取消：${foodname}`,
        icon: 'none',
        duration: 800
      });
    }
  } else {
    // 未选中，则尝试选中
    if (currentSelectedFoods.length < 2) {
      currentSelectedFoods.push(foodItemToModify);
      newSelectedState = true;
      if (pageContext.data.compareMode) {
        wx.showToast({
          title: `已选择：${foodname}`,
          icon: 'none',
          duration: 800
        });
      }
    } else {
      wx.showToast({
        title: '最多只能选择2个食物进行对比',
        icon: 'none',
        duration: 1500
      });
      return;
    }
  }

  // 更新 foodItemToModify 的 isSelected 状态
  // 注意：直接修改 foodItemToModify 不会导致 setData 触发视图更新，
  // 必须通过 setData 传入路径
  // foodItemToModify.isSelected = newSelectedState; 

  // 构建 setData 的更新路径
  const updates: Record<string, any> = {
    selectedFoods: currentSelectedFoods
  };

  // 更新 allFoodGroups 中的 isSelected 状态
  updates[`allFoodGroups[${foundFoodGroupIndex}].foods[${foundFoodItemIndex}].isSelected`] = newSelectedState;

  // 如果当前 foodItemToModify 也在 filteredFoodGroups 中，也需要更新
  const currentFilteredGroup = pageContext.data.filteredFoodGroups.find(g => g.letter === pageContext.data.allFoodGroups[foundFoodGroupIndex].letter);
  if (currentFilteredGroup) {
    const filteredFoodIndex = currentFilteredGroup.foods.findIndex(f => f.id === foodid);
    if (filteredFoodIndex !== -1) {
      const filteredGroupIndex = pageContext.data.filteredFoodGroups.indexOf(currentFilteredGroup);
      if (filteredGroupIndex !== -1) {
        updates[`filteredFoodGroups[${filteredGroupIndex}].foods[${filteredFoodIndex}].isSelected`] = newSelectedState;
      }
    }
  }

  console.log(`[onLongPressFood] selectedFoods after update:`, currentSelectedFoods);
  console.log(`[onLongPressFood] setData updates:`, updates);
  pageContext.setData(updates);
  console.log(`[onLongPressFood] setData for selectedFoods and isSelected called. New selectedFoods:`, pageContext.data.selectedFoods);
}

// 点击对比按钮
export function onCompareButtonClick(pageContext: SearchPageContext) {
  const { selectedFoods } = pageContext.data;
  if (selectedFoods.length === 2) {
    const food1 = selectedFoods[0];
    const food2 = selectedFoods[1];

    wx.navigateTo({
      url: `/pages/search/compare/compare?food1Id=${food1.id}&food1Name=${food1.name}&food2Id=${food2.id}&food2Name=${food2.name}`
    });

    // 跳转后立即清空 selectedFoods 并退出 compareMode
    // 同时清除所有食物的 isSelected 状态
    const updates: Record<string, any> = {
      selectedFoods: [],
      compareMode: false
    };

    pageContext.data.allFoodGroups.forEach((group, gIdx) => {
      group.foods.forEach((food, fIdx) => {
        if (food.isSelected) { // 只有之前是选中的才需要更新
          updates[`allFoodGroups[${gIdx}].foods[${fIdx}].isSelected`] = false;
          // 同时更新 filteredFoodGroups，确保 UI 刷新
          const currentFilteredGroup = pageContext.data.filteredFoodGroups.find(fg => fg.letter === group.letter);
          if (currentFilteredGroup) {
            const filteredFoodIndex = currentFilteredGroup.foods.findIndex(f => f.id === food.id);
            if (filteredFoodIndex !== -1) {
              const filteredGroupIndex = pageContext.data.filteredFoodGroups.indexOf(currentFilteredGroup);
              if (filteredGroupIndex !== -1) {
                updates[`filteredFoodGroups[${filteredGroupIndex}].foods[${filteredFoodIndex}].isSelected`] = false;
              }
            }
          }
        }
      });
    });
    pageContext.setData(updates);
  } else {
    wx.showToast({
      title: '请选择2个食物进行对比',
      icon: 'none',
      duration: 1500
    });
  }
}
