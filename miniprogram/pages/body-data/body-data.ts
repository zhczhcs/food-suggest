// 定义身体数据及疾病信息的类型接口
interface Diseases {
  diabetes: string;
  hypertension: string;
  hyperlipidemia: string;
  gout: string;
}

interface BodyData {
  height: string;
  weight: string;
  age: string;
  gender: string;
  bmi: string;
  diseases: Diseases;
}
Page({
  data: {
    bodyData: {} as BodyData,
    isEditing: false,
    healthTip: ''
  },

  onLoad() {
    this.loadBodyData();
  },

  // 加载身体数据并计算健康提示
  loadBodyData() {
    const storedData = wx.getStorageSync('bodyData');
    const defaultData: BodyData = {
      height: '',
      weight: '',
      age: '',
      gender: 'male',
      bmi: '0',
      diseases: {
        diabetes: 'no',
        hypertension: 'no',
        hyperlipidemia: 'no',
        gout: 'no'
      }
    };
    const bodyData: BodyData = { ...defaultData, ...storedData };
    this.setData({ bodyData });
    this.calculateHealthTip(bodyData);
  },

  // 进入编辑模式（隐藏原数据）
  onEdit() {
    this.setData({ isEditing: true });
  },

  // 取消编辑（重新显示原数据）
  onCancel() {
    this.setData({ isEditing: false });
    // 可选：若需恢复编辑前状态，可重新加载数据
    this.loadBodyData();
  },

  onUpdate(e: WechatMiniprogram.FormSubmitEvent) {
    const formValues = e.detail.value;
    const updatedData: Partial<BodyData> = { ...formValues };

    // 1. 数据校验（与初始化页面保持一致）
    const height = Number(updatedData.height);
    const weight = Number(updatedData.weight);
    const age = Number(updatedData.age);

    // 身高校验
    if (!updatedData.height || isNaN(height) || height < 100 || height > 250) {
      wx.showToast({ title: '请输入有效的身高（100-250cm）', icon: 'none' });
      return;
    }

    // 体重校验
    if (!updatedData.weight || isNaN(weight) || weight < 30 || weight > 200) {
      wx.showToast({ title: '请输入有效的体重（30-200kg）', icon: 'none' });
      return;
    }

    // 年龄校验
    if (!updatedData.age || isNaN(age) || age < 1 || age > 120) {
      wx.showToast({ title: '请输入有效的年龄（1-120岁）', icon: 'none' });
      return;
    }

    // 性别校验
    if (!updatedData.gender) {
      wx.showToast({ title: '请选择性别', icon: 'none' });
      return;
    }

    // 2. 处理疾病数据（保持结构完整）
    updatedData.diseases = {
      diabetes: formValues.diabetes || 'no',
      hypertension: formValues.hypertension || 'no',
      hyperlipidemia: formValues.hyperlipidemia || 'no',
      gout: formValues.gout || 'no'
    };

    // 3. 重新计算BMI
    updatedData.bmi = (weight / ((height / 100) ** 2)).toFixed(1);

    // 4. 更新本地存储
    wx.setStorageSync('bodyData', updatedData);
    const newData = wx.getStorageSync('bodyData');
    this.setData({ 
      bodyData: newData, 
      isEditing: false 
    });
    this.calculateHealthTip(newData);
    // 5. 提示并退出编辑模式，同时重新计算健康提示
    wx.showToast({ title: '数据已更新', icon: 'success' });
    
  },

  // 计算健康提示的核心方法
  calculateHealthTip(bodyData: BodyData) {
    const bmi = Number(bodyData.bmi);
    const hasDisease = Object.values(bodyData.diseases).some(val => val === 'yes');

    let tip = '';
    if (hasDisease) {
      tip = '您的身体必须注意饮食了！请查看饮食建议进行饮食调节。';
    } else {
      if (bmi >= 18.5 && bmi < 24) {
        tip = '您很健康，请继续保持！';
      } else if (bmi < 18.5) {
        tip = '您的BMI偏低，需要饮食调节';
      } else {
        tip = '您的BMI偏高，需要饮食调节';
      }
    }
    this.setData({ healthTip: tip });
  }
});