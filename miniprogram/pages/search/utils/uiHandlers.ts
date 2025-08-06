// pages/search/utils/uiHandlers.ts

import { GroupPosition, SearchPageContext } from './types';

export function getLetterNavRect(pageContext: SearchPageContext) {
  wx.createSelectorQuery().in(pageContext).select('.letter-scroll').boundingClientRect(rect => {
    if (rect) {
      pageContext.setData({
        letterNavHeight: rect.height,
        letterNavItemHeight: 60 * pageContext.data.rpx2px
      });
    }
  }).exec();
}

export function updateLetterNavScroll(pageContext: SearchPageContext) {
  const { letters, activeLetter, letterNavHeight, letterNavItemHeight } = pageContext.data;
  const activeIndex = letters.indexOf(activeLetter);
  if (activeIndex === -1) return;

  let targetScrollTop = (activeIndex * letterNavItemHeight) - (letterNavHeight / 2) + (letterNavItemHeight / 2);

  if (targetScrollTop < 0) {
    targetScrollTop = 0;
  }

  const maxScrollTop = (letters.length * letterNavItemHeight) - letterNavHeight;
  if (targetScrollTop > maxScrollTop) {
    targetScrollTop = maxScrollTop;
  }

  pageContext.setData({ letterNavScrollTop: targetScrollTop });
}

export function calculateGroupPositions(pageContext: SearchPageContext) {
  const { filteredFoodGroups, rpx2px } = pageContext.data;
  const groupPositions: GroupPosition[] = [];
  let cumulativeTop = 0;
  const titleHeight = 60 * rpx2px;
  const foodRowHeight = 180 * rpx2px;

  for (const group of filteredFoodGroups) {
    groupPositions.push({ letter: group.letter, top: cumulativeTop });
    const foodRowCount = Math.ceil(group.foods.length / 3);
    cumulativeTop += titleHeight + (foodRowCount * foodRowHeight);
  }

  pageContext.setData({ groupPositions }, () => {
    // *** 核心修改 ***
    // 当位置计算完成后，我们需要根据当前的滚动位置（scrollTop）来决定哪个字母应该是高亮的，
    // 而不是简单地重置为第一个字母。
    // 这可以防止在滚动中加载新数据时，高亮跳回 'A'。
    
    // 从页面实例中获取当前的 scrollTop
    const currentScrollTop = pageContext.data.currentScrollTop || 0;
    let newActiveLetter = '';

    if (pageContext.data.filteredFoodGroups.length > 0) {
      // 倒序遍历，找到第一个顶部位置小于等于当前滚动位置的分组
      for (let i = groupPositions.length - 1; i >= 0; i--) {
        if (currentScrollTop >= groupPositions[i].top - 5) { // -5px 的容差
          newActiveLetter = groupPositions[i].letter;
          break;
        }
      }
      // 如果循环后没找到（例如滚动条在最顶部），则默认是第一个字母
      if (!newActiveLetter) {
        newActiveLetter = pageContext.data.filteredFoodGroups[0].letter;
      }
    }

    // 只有当计算出的新 activeLetter 和当前的不一致时，才更新
    if (newActiveLetter && pageContext.data.activeLetter !== newActiveLetter) {
      pageContext.setData({ activeLetter: newActiveLetter });
      updateLetterNavScroll(pageContext); // 更新右侧导航栏的滚动位置
    } else if (!newActiveLetter && pageContext.data.activeLetter !== '') {
      // 如果列表为空，清空 activeLetter
      pageContext.setData({ activeLetter: '' });
    }
  });
}