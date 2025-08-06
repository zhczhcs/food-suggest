// workers/dataProcessor.js
// 这个文件运行在独立的 Worker 线程中

worker.onMessage(function (res) {
  // *** 关键修改：直接从 res 解构，而不是 res.data ***
  console.log('[Worker] 收到原始消息对象 (res):', res); // 继续保留，用于调试

  // 检查 res 对象本身是否有效，以及它是否包含 type 属性
  if (!res || typeof res.type === 'undefined' || res.type === null) {
    console.warn('[Worker] 收到无效或缺少类型信息的 Worker 消息，跳过处理。', res);
    // 可以选择向主线程发送一个错误消息，但通常 Worker 内部错误不直接回传，除非专门设计
    // worker.postMessage({ type: 'error', error: 'Invalid or missing type in worker message.' });
    return; // 立即返回，避免后续错误
  }

  // 安全地解构属性
  const { type, payload, CLOUD_STORAGE_FILE_PREFIX } = res; // <<< 核心修改点在这里！

  // 增加对 CLOUD_STORAGE_FILE_PREFIX 的检查，确保它被正确传递
  if (typeof CLOUD_STORAGE_FILE_PREFIX === 'undefined' || CLOUD_STORAGE_FILE_PREFIX === null) {
      console.error('[Worker线程] CLOUD_STORAGE_FILE_PREFIX 未定义，无法构建图片路径。');
      // 可以向主线程报告此错误
      worker.postMessage({ type: 'error', error: 'CLOUD_STORAGE_FILE_PREFIX is undefined in worker.' });
      return;
  }

  if (type === 'processFoodData') {
    console.log('[Worker线程] 收到主线程数据，开始处理...');
    const workerStartTime = Date.now();

    const allDocsData = payload;
    const allGroups = [];

    for (const doc of allDocsData) {
      if (doc && Array.isArray(doc.foodItems)) {
        const letter = doc._id;
        const jsonFileNames = doc.foodItems;
        
        const foods = jsonFileNames
          .filter(fileName => fileName.toLowerCase() !== 'index.json')
          .map(fileName => {
            const foodName = fileName.replace('.json', '');
            const imageCloudPath = `result/${letter}/${foodName}.jpg`;
            const cloudFileId = `${CLOUD_STORAGE_FILE_PREFIX}/${imageCloudPath}`;
            
            return {
              name: foodName,
              id: `${letter}-${foodName}`,
              nutrition: { main: {} },
              img: '/images/placeholder.png', // 初始图片仍是占位图
              cloudFileId: cloudFileId,
              isSelected: false
            };
          });

        if (foods.length > 0) {
          allGroups.push({ letter, foods });
        }
      }
    }

    allGroups.sort((a, b) => a.letter.localeCompare(b.letter));

    console.log(`[Worker线程] 数据处理完成，耗时 ${Date.now() - workerStartTime}ms。`);
    // 将处理好的数据发送回主线程
    worker.postMessage({ type: 'foodDataProcessed', payload: allGroups });
    console.log('[Worker线程] 数据已发送回主线程。');
  } else {
    // 处理未知类型的消息，避免 Worker 崩溃
    console.warn(`[Worker线程] 收到未知消息类型: ${type}. 消息内容:`, res); // 打印整个 res 对象
    // worker.postMessage({ type: 'error', error: `Unknown message type: ${type}` });
  }
});
