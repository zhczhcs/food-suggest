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
  diseases: Diseases;
  bmi: string;
}

Page({
  data: {
    // 初始化表单默认值
    formData: {
      height: '',
      weight: '',
      age: '',
      gender: 'male',
      diabetes: 'no',
      hypertension: 'no',
      hyperlipidemia: 'no',
      gout: 'no'
    }
  },

  onSubmit(e: WechatMiniprogram.FormSubmitEvent) {
    const formValues = e.detail.value;
    const bodyData: Partial<BodyData> = {};

    // 1. 基础信息校验与转换
    const height = Number(formValues.height);
    const weight = Number(formValues.weight);
    const age = Number(formValues.age);

    // 身高校验（100-250cm）
    if (!formValues.height || isNaN(height) || height < 100 || height > 250) {
      wx.showToast({ title: '请输入有效的身高（100-250cm）', icon: 'none' });
      return;
    }
    bodyData.height = formValues.height;

    // 体重校验（30-200kg）
    if (!formValues.weight || isNaN(weight) || weight < 30 || weight > 200) {
      wx.showToast({ title: '请输入有效的体重（30-200kg）', icon: 'none' });
      return;
    }
    bodyData.weight = formValues.weight;

    // 年龄校验（1-120岁）
    if (!formValues.age || isNaN(age) || age < 1 || age > 120) {
      wx.showToast({ title: '请输入有效的年龄（1-120岁）', icon: 'none' });
      return;
    }
    bodyData.age = formValues.age;

    // 性别校验
    if (!formValues.gender) {
      wx.showToast({ title: '请选择性别', icon: 'none' });
      return;
    }
    bodyData.gender = formValues.gender;

    // 2. 疾病信息处理
    bodyData.diseases = {
      diabetes: formValues.diabetes || 'no',
      hypertension: formValues.hypertension || 'no',
      hyperlipidemia: formValues.hyperlipidemia || 'no',
      gout: formValues.gout || 'no'
    };

    // 3. 计算BMI指数
    bodyData.bmi = (weight / ((height / 100) **2)).toFixed(1);

    // 4. 保存数据到本地存储
    wx.setStorageSync('bodyData', bodyData);

    // 5. 跳转至首页
    wx.redirectTo({
      url: '/pages/index/index',
      success: () => {
        wx.showToast({ title: '数据初始化成功', icon: 'success' });
      }
    });
  }
});