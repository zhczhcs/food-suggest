// utils/dataHandlers.ts - 专注于数据加载功能

import { FoodGroup, FoodItem, SearchPageContext } from './types';
import { CLOUD_STORAGE_FILE_PREFIX, CACHE_KEY_FOOD_GROUPS, CACHE_EXPIRATION_TIME, BATCH_SIZE } from './constants';
import { loadLazyImage, queueRequest, addToImageUpdateQueue } from './imageHandlers';

// *** 共享的状态 - 已加载的字母记录 ***
export const loadedLetters = new Set<string>(['A', 'B']); // 初始已加载A和B

// *** 判断图片路径是本地还是云端 ***
export function getImagePath(letter: string, foodName: string): { isLocal: boolean; path: string; cloudFileId?: string } {
  if (letter === 'A' || letter === 'B') {
    // 使用本地图片路径
    return {
      isLocal: true,
      path: `/images/${letter}/${foodName}.webp`
    };
  } else {
    // 使用云存储路径
    const cloudPath = `result/${letter}/${foodName}.webp`;
    const cloudFileId = `${CLOUD_STORAGE_FILE_PREFIX}/${cloudPath}`;
    return {
      isLocal: false,
      path: '', // 云存储图片需要获取临时链接，初始为空
      cloudFileId: cloudFileId
    };
  }
}

/**
 * 根据当前激活的字母，提前加载前后几个字母区域的图片。
 * @param pageContext 页面上下文
 * @param currentActiveLetter 当前激活的字母
 */
export function proactiveLoadNeighborImages(pageContext: SearchPageContext, currentActiveLetter: string) {
  const { letters, filteredFoodGroups } = pageContext.data;
  const activeIndex = letters.indexOf(currentActiveLetter);
  
  if (activeIndex === -1) {
    console.log(`[主线程][proactiveLoad] 未知激活字母: ${currentActiveLetter}，跳过预加载。`);
    return;
  }

  // 定义预加载的范围：当前字母，以及前后各 1 个字母（缩小预加载范围）
  const preloadRangeStart = Math.max(0, activeIndex - 1);
  const preloadRangeEnd = Math.min(letters.length - 1, activeIndex + 1);

  // 检查是否需要加载额外字母数据
  const lettersToLoad: string[] = [];
  for (let i = preloadRangeStart; i <= preloadRangeEnd; i++) {
    const letterToCheck = letters[i];
    if (!loadedLetters.has(letterToCheck)) {
      lettersToLoad.push(letterToCheck);
    }
  }

  // 如果有需要加载的字母，先加载这些字母的数据
  if (lettersToLoad.length > 0) {
    console.log(`[主线程][proactiveLoad] 需要加载额外字母数据: ${lettersToLoad.join(', ')}`);
    loadMoreLetterData(pageContext, lettersToLoad);
    return; // 加载完新字母数据后会重新调用 proactiveLoadNeighborImages
  }

  console.log(`[主线程][proactiveLoad] 正在为字母范围 ${letters[preloadRangeStart]} - ${letters[preloadRangeEnd]} 提前加载图片...`);

  // 优先加载当前可见字母的图片
  const currentGroupIndex = filteredFoodGroups.findIndex(g => g.letter === currentActiveLetter);
  if (currentGroupIndex !== -1) {
    const currentGroup = filteredFoodGroups[currentGroupIndex];
    // 限制每个字母最多预加载的图片数量，避免一次性加载太多
    const MAX_PRELOAD_PER_LETTER = 12;
    const itemsToLoad = Math.min(currentGroup.foods.length, MAX_PRELOAD_PER_LETTER);
    
    for (let j = 0; j < itemsToLoad; j++) {
      if (!currentGroup.foods[j].isLocal) {
        loadLazyImage(pageContext, currentGroupIndex, j);
      }
    }
  }

  // 然后再加载前后字母的图片（每个字母加载更少的图片）
  for (let i = preloadRangeStart; i <= preloadRangeEnd; i++) {
    if (i === activeIndex) continue; // 当前字母已处理过，跳过
    
    const targetLetter = letters[i];
    const groupIndex = filteredFoodGroups.findIndex(g => g.letter === targetLetter);

    if (groupIndex !== -1) {
      const group = filteredFoodGroups[groupIndex];
      // 相邻字母加载更少的图片
      const MAX_NEIGHBOR_PRELOAD = 6;
      const itemsToLoad = Math.min(group.foods.length, MAX_NEIGHBOR_PRELOAD);
      
      for (let j = 0; j < itemsToLoad; j++) {
        if (!group.foods[j].isLocal) {
          loadLazyImage(pageContext, groupIndex, j);
        }
      }
    }
  }
}

/**
 * 加载更多字母的数据
 * @param pageContext 页面上下文
 * @param lettersToLoad 需要加载的字母数组
 */
export async function loadMoreLetterData(pageContext: SearchPageContext, lettersToLoad: string[]) {
  if (!lettersToLoad || lettersToLoad.length === 0) return;
  
  console.log(`[主线程][loadMoreLetterData] 开始加载额外字母数据: ${lettersToLoad.join(', ')}`);
  
  // 获取每次加载的字母数量上限，避免一次加载太多
  const LETTERS_PER_BATCH = 1; // 减少为1个字母，进一步减轻负担
  const lettersToLoadNow = lettersToLoad.slice(0, LETTERS_PER_BATCH);
  
  // 更新已加载字母集合
  lettersToLoadNow.forEach(letter => loadedLetters.add(letter));
  
  const db = wx.cloud.database();
  const dataCollectionName = 'data';
  
  try {
    // 从云数据库加载指定字母的数据
    const _ = db.command;
    const queryRes = await queueRequest(() =>
      db.collection(dataCollectionName)
        .where({
           _id: _.in(lettersToLoadNow)
        })
        .get()
    );
    
    const allDocs = queryRes.data;
    console.log(`[主线程][loadMoreLetterData] 从云数据库加载 ${lettersToLoadNow.join(',')} 字母数据成功，共 ${allDocs.length} 个文档。`);
    
    // 处理新加载的字母数据
    const newFoodGroups: FoodGroup[] = [];
    const allFileIdsToGetTempUrl: string[] = [];
    const foodItemsMap: Record<string, {foodName: string, cloudFileId: string, isLocal: boolean, localPath?: string}[]> = {};
    
    // 处理每个字母的数据
    allDocs.forEach(doc => {
      const letter = doc._id;
      if (doc && Array.isArray(doc.foodItems)) {
        const jsonFileNames: string[] = doc.foodItems;
        foodItemsMap[letter] = [];
        
        for (const fileName of jsonFileNames) {
          if (fileName.toLowerCase() === 'index.json') {
            continue;
          }
          const foodName = fileName.replace('.json', '');
          const imageInfo = getImagePath(letter, foodName);
          
          if (!imageInfo.isLocal && imageInfo.cloudFileId) {
            allFileIdsToGetTempUrl.push(imageInfo.cloudFileId);
            foodItemsMap[letter].push({ 
              foodName, 
              cloudFileId: imageInfo.cloudFileId,
              isLocal: false
            });
          } else if (imageInfo.isLocal) {
            foodItemsMap[letter].push({ 
              foodName, 
              cloudFileId: '',
              isLocal: true,
              localPath: imageInfo.path
            });
          }
        }
      }
    });
    
    // 批量获取云端图片的临时链接（限制每批次数量）
    const imageUrlMap = new Map<string, string>();
    if (allFileIdsToGetTempUrl.length > 0) {
      // 仅获取当前显示区域可能需要的少量图片，其他图片延迟加载
      const INITIAL_BATCH_SIZE = 20; // 初始仅加载少量图片
      const initialBatchFileIds = allFileIdsToGetTempUrl.slice(0, INITIAL_BATCH_SIZE);
      
      try {
        const tempUrlRes = await queueRequest(() =>
          wx.cloud.getTempFileURL({
            fileList: initialBatchFileIds
          })
        );
        
        for (const item of tempUrlRes.fileList) {
          if (item.tempFileURL) {
            imageUrlMap.set(item.fileID, item.tempFileURL);
          } else {
            console.warn(`[主线程][loadMoreLetterData] 获取临时链接失败 for ${item.fileID}: ${item.errMsg}`);
          }
        }
      } catch (err) {
        console.error(`[主线程][loadMoreLetterData] 批量获取临时链接异常:`, err);
      }
    }
    
    // 构建新的食物组数据
    for (const letter of lettersToLoadNow) {
      const foodsForThisLetter = foodItemsMap[letter];
      if (foodsForThisLetter && foodsForThisLetter.length > 0) {
        const foods: FoodItem[] = foodsForThisLetter.map(item => {
          return {
            name: item.foodName,
            id: `${letter}-${item.foodName}`,
            nutrition: { main: {} },
            img: item.isLocal ? item.localPath : (imageUrlMap.get(item.cloudFileId) || '/images/placeholder.png'),
            cloudFileId: item.isLocal ? '' : item.cloudFileId,
            isLocal: item.isLocal,
            isSelected: false
          };
        });
        newFoodGroups.push({ letter, foods });
      }
    }
    
    // 将新数据合并到当前数据中
    const updatedAllFoodGroups = [...pageContext.data.allFoodGroups, ...newFoodGroups];
    updatedAllFoodGroups.sort((a, b) => a.letter.localeCompare(b.letter));
    
    // 更新过滤后的数据
    let updatedFilteredFoodGroups;
    if (pageContext.data.searchKey) {
      // 如果有搜索关键词，应用搜索过滤
      const searchKey = pageContext.data.searchKey.toLowerCase();
      updatedFilteredFoodGroups = updatedAllFoodGroups
        .map(group => ({ 
          ...group, 
          foods: group.foods.filter(food => food.name.toLowerCase().includes(searchKey)) 
        }))
        .filter(group => group.foods.length > 0);
    } else {
      // 没有搜索关键词，直接使用所有数据
      updatedFilteredFoodGroups = updatedAllFoodGroups;
    }
    
    // 批量更新页面数据，而不是直接调用setData
    // 这是一个必要的即时更新，因为需要立即更新字母列表
    pageContext.setData({
      allFoodGroups: updatedAllFoodGroups,
      filteredFoodGroups: updatedFilteredFoodGroups
    });
    
    // 更新本地缓存
    try {
      wx.setStorageSync(CACHE_KEY_FOOD_GROUPS, {
        data: updatedAllFoodGroups,
        timestamp: Date.now()
      });
      console.log(`[主线程][loadMoreLetterData] 更新后的食物数据成功存入本地缓存。`);
    } catch (e) {
      console.error('[主线程][loadMoreLetterData] 存储本地缓存失败:', e);
    }
    
    // 重新计算位置和初始化观察器
    wx.nextTick(() => {
      pageContext.calculateGroupPositions();
      pageContext.initIntersectionObserver();
      // 重新调用预加载，现在应该能够预加载新加载的字母内容了
      setTimeout(() => {
        if (pageContext.data.activeLetter) {
          proactiveLoadNeighborImages(pageContext, pageContext.data.activeLetter);
        }
      }, 300); // 稍微延迟预加载，避免立即加载导致的卡顿
    });
    
    // 如果还有剩余字母需要加载，递归调用
    if (lettersToLoad.length > LETTERS_PER_BATCH) {
      const remainingLetters = lettersToLoad.slice(LETTERS_PER_BATCH);
      setTimeout(() => {
        loadMoreLetterData(pageContext, remainingLetters);
      }, 1000); // 延迟1秒后加载下一批，避免一次性太多请求
    }
    
  } catch (err) {
    console.error(`[主线程][loadMoreLetterData] 加载额外字母数据失败:`, err);
    // 从loadedLetters中移除加载失败的字母，以便下次重试
    lettersToLoadNow.forEach(letter => loadedLetters.delete(letter));
  }
}

/**
 * 从云数据库加载食物数据并获取云存储图片链接，并支持本地缓存。
 * 所有操作都在主线程完成。
 */
export async function loadAllFoodData(pageContext: SearchPageContext) {
  pageContext.setData({ loading: true });
  const startTime = Date.now();
  console.log('[主线程][loadAllFoodData] 开始执行。');

  const db = wx.cloud.database();
  const dataCollectionName = 'data';

  try {
    // 1. 优先检查并使用本地缓存
    const cachedData = wx.getStorageSync(CACHE_KEY_FOOD_GROUPS);
    if (cachedData && cachedData.data && (Date.now() - cachedData.timestamp < CACHE_EXPIRATION_TIME)) {
      const cacheDuration = Date.now() - startTime;
      console.log(`[主线程][loadAllFoodData] 从本地缓存加载食物数据成功，耗时 ${cacheDuration}ms。`);
      
      // 更新已加载字母集合
      cachedData.data.forEach((group: FoodGroup) => {
        loadedLetters.add(group.letter);
      });
      
      pageContext.setData({
        allFoodGroups: cachedData.data,
        filteredFoodGroups: cachedData.data,
        loading: false
      });
      
      wx.nextTick(() => {
        pageContext.initIntersectionObserver(); 
        pageContext.calculateGroupPositions(); 
        pageContext.getLetterNavRect(); 
        // 从缓存加载后，也立即触发一次预加载
        if (pageContext.data.activeLetter) {
          proactiveLoadNeighborImages(pageContext, pageContext.data.activeLetter);
        } else if (pageContext.data.filteredFoodGroups.length > 0) {
          proactiveLoadNeighborImages(pageContext, pageContext.data.filteredFoodGroups[0].letter);
        }
        console.log('[主线程][loadAllFoodData] 从缓存加载后，初始化 IntersectionObserver 和位置计算，并触发预加载。');
      });
      return;
    } else {
      console.log('[主线程][loadAllFoodData] 本地缓存不存在或已过期，将从云端加载。');
    }
  } catch (e) {
    console.warn('[主线程][loadAllFoodData] 读取本地缓存失败:', e);
  }

  console.log('[主线程][loadAllFoodData] 开始从云数据库加载食物数据和图片URL...');

  const allGroups: FoodGroup[] = [];
  const { letters } = pageContext.data;
  const allFileIdsToGetTempUrl: string[] = [];
  const foodItemsData: {
    [letter: string]: {
      foodName: string;
      cloudFileId: string;
      isLocal: boolean;
      localPath?: string;
    }[]
  } = {};

  try {
    // 2. 从云数据库批量获取原始食物数据，但仅获取A和B字母
    const _ = db.command;
    let allDocs: any[] = [];
    const initialLetters = ['A', 'B']; // 初始只加载这两个字母
    
    if (initialLetters && initialLetters.length > 0) {
      try {
        const queryRes = await db.collection(dataCollectionName)
                               .where({
                                 _id: _.in(initialLetters)
                               })
                               .get();
        allDocs = queryRes.data;
        console.log(`[主线程][loadAllFoodData] 批量从云数据库获取 ${allDocs.length} 个字母(${initialLetters.join(',')})文档成功。`);
      } catch (err) {
        console.error('[主线程][loadAllFoodData] 批量从云数据库加载数据失败:', err);
        throw err; 
      }
    } else {
      console.warn('[主线程][loadAllFoodData] initialLetters 列表为空，跳过云数据库查询。');
    }

    // 遍历获取到的文档，填充 foodItemsData
    const docsByLetter = new Map<string, any>();
    allDocs.forEach(doc => {
      docsByLetter.set(doc._id, doc);
    });

    for (const letter of initialLetters) { 
      const doc = docsByLetter.get(letter); 
      if (doc && Array.isArray(doc.foodItems)) {
        const jsonFileNames: string[] = doc.foodItems;
        foodItemsData[letter] = [];

        for (const fileName of jsonFileNames) {
          if (fileName.toLowerCase() === 'index.json') {
            continue;
          }
          const foodName = fileName.replace('.json', '');
          const imageInfo = getImagePath(letter, foodName);
          
          foodItemsData[letter].push({ 
            foodName, 
            cloudFileId: imageInfo.cloudFileId || '',
            isLocal: imageInfo.isLocal,
            localPath: imageInfo.isLocal ? imageInfo.path : undefined
          });

          // 只有非本地图片才需要获取临时链接
          if (!imageInfo.isLocal && imageInfo.cloudFileId) {
            allFileIdsToGetTempUrl.push(imageInfo.cloudFileId);
          }
        }
      } else {
        console.warn(`[主线程][loadAllFoodData] 云数据库 'data' 集合中字母 ${letter} 的数据缺失或 'foodItems' 字段异常。`);
      }
      
      // 将字母标记为已加载
      loadedLetters.add(letter);
    }

    // 3. 批量获取图片临时链接 (仅针对非本地图片)
    // 初始只获取少量图片，减轻首次加载压力
    const imageUrlMap = new Map<string, string>();
    if (allFileIdsToGetTempUrl.length > 0) {
      const INITIAL_IMAGE_BATCH = 20; // 初始仅加载前20张图片
      const initialFileIds = allFileIdsToGetTempUrl.slice(0, INITIAL_IMAGE_BATCH);
      
      console.log(`[主线程][loadAllFoodData] 准备获取初始 ${initialFileIds.length}/${allFileIdsToGetTempUrl.length} 张图片的临时链接...`);
      
      try {
        const tempUrlRes = await wx.cloud.getTempFileURL({
          fileList: initialFileIds
        });

        for (const item of tempUrlRes.fileList) {
          if (item.tempFileURL) {
            imageUrlMap.set(item.fileID, item.tempFileURL);
          } else {
            console.warn(`[主线程][loadAllFoodData] 获取临时链接失败 for ${item.fileID}: ${item.errMsg}`);
          }
        }
        console.log(`[主线程][loadAllFoodData] 成功获取 ${imageUrlMap.size} 张图片的临时链接。`);
      } catch (err) {
        console.error('[主线程][loadAllFoodData] 获取临时链接失败:', err);
      }
    }

    // 4. 在主线程中处理数据，组装成 FoodGroup 结构并排序
    for (const letter of initialLetters) { 
      const foodsForThisLetter = foodItemsData[letter];
      if (foodsForThisLetter && foodsForThisLetter.length > 0) {
        const foods: FoodItem[] = foodsForThisLetter.map(item => ({
          name: item.foodName,
          id: `${letter}-${item.foodName}`,
          nutrition: { main: {} },
          img: item.isLocal ? item.localPath : (imageUrlMap.get(item.cloudFileId) || '/images/placeholder.png'), 
          cloudFileId: item.isLocal ? '' : item.cloudFileId,
          isLocal: item.isLocal,
          isSelected: false
        }));
        allGroups.push({ letter, foods });
      }
    }

    allGroups.sort((a, b) => a.letter.localeCompare(b.letter));

    // 5. 将新获取的数据存入本地缓存
    try {
      wx.setStorageSync(CACHE_KEY_FOOD_GROUPS, {
        data: allGroups,
        timestamp: Date.now()
      });
      console.log('[主线程][loadAllFoodData] 食物数据成功存入本地缓存。');
    } catch (e) {
      console.error('[主线程][loadAllFoodData] 存储本地缓存失败:', e);
    }

    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`[主线程][loadAllFoodData] 所有食物数据处理完成，总耗时 ${duration}ms。`);

    pageContext.setData({
      allFoodGroups: allGroups,
      filteredFoodGroups: allGroups,
      loading: false,
    });
    
    wx.nextTick(() => {
      pageContext.initIntersectionObserver();
      pageContext.calculateGroupPositions();
      pageContext.getLetterNavRect();
      
      // 数据加载后，延迟一段时间再触发预加载，避免初次渲染卡顿
      setTimeout(() => {
        if (pageContext.data.activeLetter) {
          proactiveLoadNeighborImages(pageContext, pageContext.data.activeLetter);
        } else if (pageContext.data.filteredFoodGroups.length > 0) {
          proactiveLoadNeighborImages(pageContext, pageContext.data.filteredFoodGroups[0].letter);
        }
        console.log('[主线程][loadAllFoodData] 延迟触发预加载。');
      }, 500);
      
      console.log('[主线程][loadAllFoodData] 数据更新后，初始化 IntersectionObserver 和位置计算。');
    });

  } catch (err: any) {
    console.error('[主线程][loadAllFoodData] 从云数据库加载或处理数据失败:', err);
    pageContext.setData({ loading: false });
    wx.showToast({ title: '数据加载异常', icon: 'error' });
  }
}