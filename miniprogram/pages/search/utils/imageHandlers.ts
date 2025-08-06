// utils/imageHandlers.ts - 专注于图片加载和批量更新

import { SearchPageContext } from './types';
import { getImagePath } from './dataHandlers';

// *** 批量更新相关变量 ***
const pendingUpdates = new Map<string, string>(); // key: 更新路径, value: 图片URL
let pendingAllFoodGroupsUpdates: Record<string, any> = {}; // 存储allFoodGroups的更新
let updateTimer: number | null = null;

// *** 新增：存储已加载过的图片，防止重复加载 ***
const loadedImageUrls = new Set<string>(); // 存储已成功加载的图片URL (cloudFileId)

// *** 跟踪正在加载的图片，防止重复请求 ***
const loadingImages = new Map<string, Promise<string | void>>(); // key: foodItem.id, value: Promise

// *** 请求队列相关变量 ***
const MAX_CONCURRENT_REQUESTS = 5;
let activeRequests = 0;
const requestQueue: (() => void)[] = [];

/**
 * 将请求添加到队列并处理
 */
export function queueRequest(requestFn: () => Promise<any>): Promise<any> {
  return new Promise((resolve, reject) => {
    const wrappedRequest = async () => {
      try {
        const result = await requestFn();
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        activeRequests--;
        processNextRequest(); // 处理队列中的下一个请求
      }
    };
    
    requestQueue.push(wrappedRequest);
    processNextRequest(); // 尝试立即处理，如果并发数允许
  });
}

/**
 * 执行请求队列中的下一个请求
 */
function processNextRequest() {
  if (requestQueue.length === 0 || activeRequests >= MAX_CONCURRENT_REQUESTS) {
    return;
  }
  
  activeRequests++;
  const nextRequest = requestQueue.shift();
  if (nextRequest) {
    nextRequest();
  }
}

/**
 * 批量更新函数，收集一段时间内的所有更新，然后一次性调用setData
 */
export function batchUpdate(pageContext: SearchPageContext) {
  if (pendingUpdates.size === 0 && Object.keys(pendingAllFoodGroupsUpdates).length === 0) {
    updateTimer = null;
    return;
  }
  
  // 准备更新对象
  const updates: Record<string, any> = {};
  
  // 添加filteredFoodGroups的更新
  pendingUpdates.forEach((value, key) => {
    updates[key] = value;
  });
  
  // 添加allFoodGroups的更新（如果有）
  Object.assign(updates, pendingAllFoodGroupsUpdates);
  
  // 一次性setData所有更新
  if (Object.keys(updates).length > 0) {
    console.log(`[主线程][batchUpdate] 批量更新 ${pendingUpdates.size} 张图片和 ${Object.keys(pendingAllFoodGroupsUpdates).length} 个allFoodGroups项`);
    pageContext.setData(updates);
  }
  
  // 清空队列和数据
  pendingUpdates.clear();
  pendingAllFoodGroupsUpdates = {};
  updateTimer = null;
}

/**
 * 将更新添加到批量更新队列
 */
export function addToImageUpdateQueue(
  pageContext: SearchPageContext, 
  updatePath: string, 
  value: string, 
  allGroupsPath?: string
) {
  // 添加到批量更新队列
  pendingUpdates.set(updatePath, value);
  
  // 如果有对应的allFoodGroups更新，也添加
  if (allGroupsPath) {
    pendingAllFoodGroupsUpdates[allGroupsPath] = value;
  }
  
  // 如果没有定时器在运行，创建一个定时器统一更新
  if (!updateTimer) {
    updateTimer = setTimeout(() => {
      batchUpdate(pageContext);
    }, 300) as unknown as number; // 使用300ms的批量更新延迟
  }
}

/**
 * 辅助函数：当图片加载失败或不存在时，设置一个默认的本地图片。
 * 此函数会将更新添加到批量更新队列，而不是直接调用setData。
 */
export function _setDefaultImageForFood(pageContext: SearchPageContext, foodName: string) {
  const defaultImg = '/images/default_food.png';
  let updatedInAllGroups = false;
  let updatedInFilteredGroups = false;

  // 1. 查找并准备更新 allFoodGroups
  for (let gIdx = 0; gIdx < pageContext.data.allFoodGroups.length; gIdx++) {
    const group = pageContext.data.allFoodGroups[gIdx];
    for (let fIdx = 0; fIdx < group.foods.length; fIdx++) {
      if (group.foods[fIdx].name === foodName) {
        // 添加到批量更新队列
        pendingAllFoodGroupsUpdates[`allFoodGroups[${gIdx}].foods[${fIdx}].img`] = defaultImg;
        updatedInAllGroups = true;
        console.log(`[主线程][_setDefaultImageForFood] 已为 allFoodGroups 中的 ${foodName} 设置默认图片（待批量更新）。`);
        break; 
      }
    }
    if (updatedInAllGroups) break;
  }

  // 2. 查找并准备更新 filteredFoodGroups
  for (let fgIdx = 0; fgIdx < pageContext.data.filteredFoodGroups.length; fgIdx++) {
    const filteredGroup = pageContext.data.filteredFoodGroups[fgIdx];
    for (let ffIdx = 0; ffIdx < filteredGroup.foods.length; ffIdx++) {
      if (filteredGroup.foods[ffIdx].name === foodName) {
        // 添加到批量更新队列
        pendingUpdates.set(`filteredFoodGroups[${fgIdx}].foods[${ffIdx}].img`, defaultImg);
        updatedInFilteredGroups = true;
        console.log(`[主线程][_setDefaultImageForFood] 已为 filteredFoodGroups 中的 ${foodName} 设置默认图片（待批量更新）。`);
        break; 
      }
    }
    if (updatedInFilteredGroups) break;
  }
  
  // 如果有更新且没有定时器在运行，创建一个定时器统一更新
  if ((updatedInAllGroups || updatedInFilteredGroups) && !updateTimer) {
    updateTimer = setTimeout(() => {
      batchUpdate(pageContext);
    }, 300) as unknown as number;
  }
}

/**
 * 当 WXML 中的 <image> 标签加载网络图片失败时触发
 */
export async function onImgError(pageContext: SearchPageContext, e: WechatMiniprogram.BaseEvent) {
  const { foodname, cloudfileid } = e.currentTarget.dataset;
  console.warn(`[主线程][onImgError] 食物 ${foodname} 的图片无法显示。尝试重新获取临时链接...`);

  if (!cloudfileid) {
    console.error(`[主线程][onImgError] 无法重新获取图片，缺少 cloudFileId。`);
    _setDefaultImageForFood(pageContext, foodname);
    return;
  }

  // 查找食物项在 allFoodGroups 中的精确位置
  let foundGroupIndex: number = -1;
  let foundFoodIndex: number = -1;

  for (let gIdx = 0; gIdx < pageContext.data.allFoodGroups.length; gIdx++) {
    const group = pageContext.data.allFoodGroups[gIdx];
    for (let fIdx = 0; fIdx < group.foods.length; fIdx++) {
      if (group.foods[fIdx].cloudFileId === cloudfileid) {
        foundGroupIndex = gIdx;
        foundFoodIndex = fIdx;
        break;
      }
    }
    if (foundGroupIndex !== -1) break;
  }

  if (foundGroupIndex === -1 || foundFoodIndex === -1) {
    console.error(`[主线程][onImgError] 无法在 allFoodGroups 中定位食物项 ${foodname} (cloudFileId: ${cloudfileid})。`);
    _setDefaultImageForFood(pageContext, foodname);
    return;
  }

  // 使用 loadLazyImage 来处理重新获取图片链接的逻辑，避免重复代码
  try {
    // 从已加载图片集合中移除，以便重新加载
    if (loadedImageUrls.has(cloudfileid)) {
      loadedImageUrls.delete(cloudfileid);
    }
    
    // 调用 loadLazyImage，它会处理获取新URL和批量更新
    await loadLazyImage(pageContext, foundGroupIndex, foundFoodIndex); 
    console.log(`[主线程][onImgError] 食物 ${foodname} 的图片已成功重新加载。`);
  } catch (err) {
    console.error(`[主线程][onImgError] 重新获取食物 ${foodname} 的图片链接失败，设置默认图片。`, err);
    _setDefaultImageForFood(pageContext, foodname);
  }
}

/**
 * 为进入可视区域的单个食物项懒加载图片。
 */
export async function loadLazyImage(pageContext: SearchPageContext, groupIndex: number, foodIndex: number) {
  const foodItem = pageContext.data.filteredFoodGroups[groupIndex]?.foods[foodIndex];

  if (!foodItem || !foodItem.cloudFileId) {
    console.log(`[主线程][loadLazyImage] 无效的食物项或 cloudFileId，跳过懒加载。`);
    return;
  }
  
  // 如果是本地图片，不需要懒加载
  if (foodItem.isLocal) {
    console.log(`[主线程][loadLazyImage] ${foodItem.name} 是本地图片，跳过懒加载。`);
    return;
  }
  
  const { cloudFileId, name, id: foodId } = foodItem;
  
  // 检查图片是否已经加载过
  if (loadedImageUrls.has(cloudFileId)) {
    console.log(`[主线程][loadLazyImage] ${name} 图片已加载过，跳过重复加载。`);
    return;
  }
  
  // 检查是否正在加载，防止重复请求
  if (loadingImages.has(foodId)) {
    console.log(`[主线程][loadLazyImage] ${name} (${foodId}) 正在加载中，跳过重复请求。`);
    return loadingImages.get(foodId);
  }

  const loadPromise = (async () => {
    try {
      console.log(`[主线程][loadLazyImage] 正在为 ${name} (${cloudFileId}) 获取临时URL...`);
      
      // 使用请求队列来限制并发请求数
      const res = await queueRequest(() => 
        wx.cloud.getTempFileURL({ fileList: [cloudFileId] })
      );
      
      if (res.fileList && res.fileList[0].tempFileURL) {
        const newTempUrl = res.fileList[0].tempFileURL;
        
        // 找到在 filteredFoodGroups 中的位置
        const updateKey = `filteredFoodGroups[${groupIndex}].foods[${foodIndex}].img`;
        
        // 查找在 allFoodGroups 中的位置
        let allFoodGroupsUpdateKey = '';
        const allGroup = pageContext.data.allFoodGroups.find(g => g.letter === pageContext.data.filteredFoodGroups[groupIndex].letter);
        if (allGroup) {
            const allGroupIndex = pageContext.data.allFoodGroups.indexOf(allGroup);
            const allFood = allGroup.foods.find(f => f.id === foodId);
            if (allFood) {
                const allFoodIndex = allGroup.foods.indexOf(allFood);
                if (allFood.img !== newTempUrl) {
                    allFoodGroupsUpdateKey = `allFoodGroups[${allGroupIndex}].foods[${allFoodIndex}].img`;
                }
            }
        }
        
        // 添加到批量更新队列
        addToImageUpdateQueue(pageContext, updateKey, newTempUrl, allFoodGroupsUpdateKey);
        
        // 将此图片标记为已加载
        loadedImageUrls.add(cloudFileId);
        
        console.log(`[主线程][loadLazyImage] ${name} 图片URL已添加到批量更新队列: ${newTempUrl}`);
        return newTempUrl;
      } else {
        console.warn(`[主线程][loadLazyImage] 获取链接失败 for ${name}: ${res.fileList[0].errMsg}`);
        _setDefaultImageForFood(pageContext, name);
        throw new Error(res.fileList[0].errMsg || '获取临时URL失败');
      }
    } catch (err) {
      console.error(`[主线程][loadLazyImage] 请求链接异常 for ${name}:`, err);
      _setDefaultImageForFood(pageContext, name);
      throw err;
    } finally {
      loadingImages.delete(foodId);
    }
  })();

  loadingImages.set(foodId, loadPromise);
  return loadPromise;
}