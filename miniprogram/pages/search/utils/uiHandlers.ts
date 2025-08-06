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
    if (pageContext.data.filteredFoodGroups.length > 0) {
      const firstLetter = pageContext.data.filteredFoodGroups[0].letter;
      if (pageContext.data.activeLetter !== firstLetter) {
        pageContext.setData({ activeLetter: firstLetter });
        updateLetterNavScroll(pageContext); // 调用当前模块内的函数
      }
    } else {
      pageContext.setData({ activeLetter: '' });
    }
  });
}
