document.addEventListener('DOMContentLoaded', function() {

    // --- 頁籤切換邏輯 ---
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            tabButtons.forEach(btn => {
                btn.classList.remove('active-tab', 'text-indigo-600', 'dark:text-indigo-400', 'border-indigo-500');
                btn.classList.add('inactive-tab', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300', 'dark:text-gray-400', 'dark:hover:text-gray-300', 'dark:hover:border-gray-500');
            });
            button.classList.add('active-tab', 'text-indigo-600', 'dark:text-indigo-400', 'border-indigo-500');
            button.classList.remove('inactive-tab', 'text-gray-500', 'hover:text-gray-700', 'hover:border-gray-300', 'dark:text-gray-400', 'dark:hover:text-gray-300', 'dark:hover:border-gray-500');
            tabContents.forEach(content => {
                content.id === targetTab ? content.classList.remove('hidden') : content.classList.add('hidden');
            });
        });
    });
    
    // --- 通用函式 ---
    function animateValue(element, start, end, duration, unit = '', isCurrency = false, isDuration = false) {
         if (!element) return;
        let startTimestamp = null;
        const step = timestamp => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const currentValue = progress * (end - start) + start;
            if (isCurrency) {
                element.textContent = `$${Math.floor(currentValue).toLocaleString('en-US')}`;
            } else if (isDuration) {
                element.textContent = currentValue < 365 ? `${currentValue.toFixed(2)} 天` : `${(currentValue / 365).toFixed(2)} 年`;
            } else {
                element.innerHTML = `${currentValue.toFixed(2)} <span class="text-base font-normal">${unit}</span>`;
            }
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    // --- 工具 1: AI 晶片 LCA 評估邏輯 ---
    const lcaResultsContainerEl = document.getElementById('lca-results-container');
    const gpuData = {
        "A100": { tdp_watt: 400, cradle_to_gate_kg: 120, water_L_per_year: [1000, 6000], e_waste_kg: 2.5 },
        "H100": { tdp_watt: 700, cradle_to_gate_kg: 164, water_L_per_year: [2000, 8000], e_waste_kg: 3 },
        "B200": { tdp_watt: 1100, cradle_to_gate_kg: 284, water_L_per_year: [3500, 10000], e_waste_kg: 2.5 },
        "B300": { tdp_watt: 1300, cradle_to_gate_kg: 300, water_L_per_year: [3500, 15000], e_waste_kg: 3.5 }
    };
    const lcaDailyEquivalents = {
        flight: { name: '趟台北-東京航班', value: 0.4, icon: `✈️`, tooltip: '一趟台北飛往東京的來回航班所產生的碳排。' },
        car: { name: '輛汽車年排碳', value: 1.9, icon: `🚗`, tooltip: '一輛普通家用汽車行駛一年所產生的平均碳排。' },
        tree: { name: '棵樹年吸碳量', value: 0.012, icon: `🌳`, tooltip: '一棵樹一年所能吸收的二氧化碳總量。' },
        bento: { name: '個排骨便當', value: 0.0015, icon: `🍱`, tooltip: '一個排骨便當從生產到消費所產生的碳排。' },
    };
    let carbonChartInstance = null;
    
    function updateChart(operational, embodied) {
        const ctx = document.getElementById('carbonChart').getContext('2d');
        if (carbonChartInstance) carbonChartInstance.destroy();
        carbonChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['營運碳排', '隱含碳排'],
                datasets: [{ data: [operational, embodied], backgroundColor: ['#3B82F6', '#14B8A6'], borderColor: document.body.classList.contains('dark') ? '#1f2937' : '#FFFFFF', borderWidth: 4 }]
            },
            options: {
                responsive: true, cutout: '70%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: document.body.classList.contains('dark') ? '#D1D5DB' : '#4B5563' } },
                    title: { display: true, text: '碳足跡組成 (tCO₂eq)', color: document.body.classList.contains('dark') ? '#F9FAFB' : '#1F2937', font: { size: 16 } }
                }
            },
        });
    }

    function runLcaCalculation() {
        const gpuChip = document.getElementById('gpuChip').value;
        const lifespan = parseFloat(document.getElementById('lifespan').value);
        const utilization = parseFloat(document.getElementById('utilization').value);
        const carbonIntensity = parseFloat(document.getElementById('carbonIntensity').value);

        if (isNaN(lifespan) || isNaN(utilization) || isNaN(carbonIntensity) || lifespan <= 0 || utilization < 0 || utilization > 24 || carbonIntensity <= 0) {
            alert("請輸入有效的數值。");
            return;
        }

        const data = gpuData[gpuChip];
        const totalHours = lifespan * 365 * utilization;
        const totalKWH = (data.tdp_watt * totalHours) / 1000;
        const operationalCo2 = (totalKWH * carbonIntensity) / 1000;
        const embodiedCo2 = data.cradle_to_gate_kg / 1000;
        const totalCo2 = operationalCo2 + embodiedCo2;
        const avgWater = (data.water_L_per_year[0] + data.water_L_per_year[1]) / 2;
        const totalWater = avgWater * lifespan;
        const eWaste = data.e_waste_kg;

        document.getElementById('totalCo2').innerHTML = `${totalCo2.toFixed(2)} <span class="text-base font-normal">tCO₂eq</span>`;
        document.getElementById('operationalCo2').innerHTML = `${operationalCo2.toFixed(2)} <span class="text-base font-normal">tCO₂eq</span>`;
        document.getElementById('embodiedCo2').innerHTML = `${embodiedCo2.toFixed(2)} <span class="text-base font-normal">tCO₂eq</span>`;
        document.getElementById('waterConsumption').innerHTML = `${totalWater.toFixed(0).toLocaleString('zh-TW')} <span class="text-base font-normal">L</span>`;
        document.getElementById('eWaste').innerHTML = `${eWaste.toFixed(2)} <span class="text-base font-normal">kg</span>`;
        
        updateChart(operationalCo2, embodiedCo2);

        const equivalentsContainer = document.getElementById('lca-equivalents');
        equivalentsContainer.innerHTML = '';
        for (const key in lcaDailyEquivalents) {
            const item = lcaDailyEquivalents[key];
            const equivalentAmount = totalCo2 / item.value;
            equivalentsContainer.innerHTML += `<div class="bg-white dark:bg-gray-700 p-3 rounded-lg text-center transition duration-300 ease-in-out shadow-sm hover:shadow-lg transform hover:-translate-y-1 border dark:border-gray-600"><div class="tooltip"><span class="text-3xl">${item.icon}</span><span class="tooltiptext">${item.tooltip} 碳排：${item.value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} tCO₂eq</span></div><p class="text-xl font-bold text-gray-800 dark:text-gray-200 mt-2">${Math.round(equivalentAmount).toLocaleString('zh-TW')}</p><p class="text-xs text-gray-600 dark:text-gray-400 mt-1">${item.name}</p></div>`;
        }
    }
    
    document.getElementById('calculateLcaBtn').addEventListener('click', runLcaCalculation);

    // --- 工具 2: LLM 訓練碳排計算器邏輯 ---
    const modelPresetSelect = document.getElementById('modelPreset');
    const modelTypeSelect = document.getElementById('modelType');
    const baseModelParamsContainer = document.getElementById('baseModelParamsContainer');
    const deviceTypeSelect = document.getElementById('deviceType');
    
    const modelPresets = {
        'GPT3': { name: 'GPT-3 (175B)', type: 'dense', params: 175, baseParams: '', tokens: 300, deviceType: 'V100', deviceNum: 10000 },
        'GPT4': { name: 'GPT-4 (1.8T)', type: 'MoE', params: 1800, baseParams: 111, tokens: 13000, deviceType: 'A100', deviceNum: 25000 },
        'custom': { name: '自訂模型' },
    };
    const hardwarePresets = {
        'V100': { peakTFLOPs: 125, systemPower: 330 }, 'A100': { peakTFLOPs: 312, systemPower: 550 },
        'H100': { peakTFLOPs: 1979, systemPower: 800 }, 'TPUv3': { peakTFLOPs: 123, systemPower: 288 },
        'TPUv4': { peakTFLOPs: 275, systemPower: 250 }, 'custom': { peakTFLOPs: 125, systemPower: 330 }
    };
    const trainingDailyEquivalents = {
        flight: { name: '趟台北-東京航班', value: 0.4, icon: `✈️`, tooltip: '一趟台北飛往東京的來回航班所產生的碳排。' },
        car: { name: '輛汽車年排碳', value: 1.9, icon: `🚗`, tooltip: '一輛普通家用汽車行駛一年所產生的平均碳排。' },
        tree: { name: '棵樹年吸碳量', value: 0.012, icon: `🌳`, tooltip: '一棵樹一年所能吸收的二氧化碳總量。' },
        bento: { name: '個排骨便當', value: 0.0015, icon: `🍱`, tooltip: '一個排骨便當從生產到消費所產生的碳排。' },
    };

    for (const key in modelPresets) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = modelPresets[key].name;
        modelPresetSelect.appendChild(option);
    }

    function updateTrainingForm() {
        const selectedModelKey = modelPresetSelect.value;
        const preset = modelPresets[selectedModelKey];
        const isCustom = selectedModelKey === 'custom';

        if (!isCustom) {
            modelTypeSelect.value = preset.type;
            document.getElementById('parametersB').value = preset.params;
            document.getElementById('tokensB').value = preset.tokens;
            deviceTypeSelect.value = preset.deviceType;
            document.getElementById('deviceNum').value = preset.deviceNum;
            document.getElementById('systemPower').value = (hardwarePresets[preset.deviceType] || hardwarePresets['custom']).systemPower;
            if (preset.type === 'MoE') {
                document.getElementById('baseModelParamsB').value = preset.baseParams;
            } else {
                document.getElementById('baseModelParamsB').value = '';
            }
        }
        
        document.getElementById('modelType').disabled = !isCustom;
        document.getElementById('parametersB').disabled = !isCustom;
        document.getElementById('baseModelParamsB').disabled = !isCustom;
        document.getElementById('tokensB').disabled = !isCustom;
        
        baseModelParamsContainer.classList.toggle('hidden', modelTypeSelect.value !== 'MoE');
    }

    modelPresetSelect.addEventListener('change', updateTrainingForm);
    
    deviceTypeSelect.addEventListener('change', () => {
         document.getElementById('systemPower').value = (hardwarePresets[deviceTypeSelect.value] || hardwarePresets['custom']).systemPower;
    });
    
    function runTrainingCalculation() {
        const inputs = {
            modelType: modelTypeSelect.value,
            parametersB: parseFloat(document.getElementById('parametersB').value),
            baseModelParamsB: parseFloat(document.getElementById('baseModelParamsB').value),
            tokensB: parseFloat(document.getElementById('tokensB').value),
            deviceType: deviceTypeSelect.value,
            deviceNum: parseInt(document.getElementById('deviceNum').value),
            systemPower: parseFloat(document.getElementById('systemPower').value),
            hardwareEfficiency: parseFloat(document.getElementById('hardwareEfficiency').value),
            pue: parseFloat(document.getElementById('pue').value),
            co2eqkwh: parseFloat(document.getElementById('trainingCo2eqkwh').value),
            gpuCostPerHour: parseFloat(document.getElementById('gpuCostPerHour').value),
        };

        let isValid = true;
        for (const key in inputs) {
            if (inputs.modelType === 'dense' && key === 'baseModelParamsB') continue;
            if (['modelType', 'deviceType'].includes(key)) continue;
            if (isNaN(inputs[key])) { isValid = false; break; }
            if (inputs[key] <= 0 && key !== 'baseModelParamsB') { isValid = false; break; }
        }
        if (inputs.modelType === 'MoE' && (isNaN(inputs.baseModelParamsB) || inputs.baseModelParamsB <= 0)) {
            isValid = false;
        }

        if (!isValid) {
            alert("請輸入有效的數值。");
            return;
        }

        const activeParamsB = inputs.modelType === 'MoE' ? inputs.baseModelParamsB : inputs.parametersB;
        const totalFLOPs = 6 * activeParamsB * 1e9 * inputs.tokensB * 1e9;
        const TFLOPsPerSecond = hardwarePresets[inputs.deviceType].peakTFLOPs * (inputs.hardwareEfficiency / 100);
        const trainingSeconds = totalFLOPs / (inputs.deviceNum * TFLOPsPerSecond * 1e12);
        const trainingDays = trainingSeconds / 86400;
        const totalPowerKW = (inputs.systemPower * inputs.deviceNum) / 1000;
        const totalEnergyKWh = totalPowerKW * (trainingDays * 24) * inputs.pue;
        
        const results = {
            operationalCo2: (totalEnergyKWh * inputs.co2eqkwh) / 1000,
            trainingDays: trainingDays,
            totalEnergyMWh: totalEnergyKWh / 1000,
            trainingCost: trainingDays * 24 * inputs.deviceNum * inputs.gpuCostPerHour,
        };
        
        animateValue(document.getElementById('operationalCo2Display'), 0, results.operationalCo2, 500, 'tCO₂eq');
        animateValue(document.getElementById('totalEnergyMWhDisplay'), 0, results.totalEnergyMWh, 500, 'MWh');
        animateValue(document.getElementById('trainingCostDisplay'), 0, results.trainingCost, 500, '', true);
        animateValue(document.getElementById('trainingDurationDisplay'), 0, results.trainingDays, 500, '', false, true);
        
        const equivalentsContainer = document.getElementById('training-equivalents');
        equivalentsContainer.innerHTML = '';
        for (const key in trainingDailyEquivalents) {
            const item = trainingDailyEquivalents[key];
            const equivalentAmount = results.operationalCo2 / item.value;
            equivalentsContainer.innerHTML += `<div class="bg-white dark:bg-gray-700 p-3 rounded-lg text-center transition duration-300 ease-in-out shadow-sm hover:shadow-lg transform hover:-translate-y-1 border dark:border-gray-600"><div class="tooltip"><span class="text-3xl">${item.icon}</span><span class="tooltiptext">${item.tooltip} 碳排：${item.value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} tCO₂eq</span></div><p class="text-xl font-bold text-gray-800 dark:text-gray-200 mt-2">${Math.round(equivalentAmount).toLocaleString('zh-TW')}</p><p class="text-xs text-gray-600 dark:text-gray-400 mt-1">${item.name}</p></div>`;
        }
    }
    
    document.getElementById('calculateTrainingBtn').addEventListener('click', runTrainingCalculation);


    // --- 工具 3: LLM 推論碳排計算器邏輯 ---
    const infModelPresetSelect = document.getElementById('inf-modelPreset');
    const infCustomModelSection = document.getElementById('inf-customModelSection');
    const infModelTypeSelect = document.getElementById('inf-modelType');
    const infBaseModelParamsContainer = document.getElementById('inf-baseModelParamsContainer');
    const infDeviceTypeSelect = document.getElementById('inf-deviceType');
    
    const infModelPresets = {
        'GPT3': { parametersB: 175, type: 'dense', baseModelParamsB: null, deviceType: 'A100', deviceNum: 8, systemPower: 550 },
        'GPT4': { parametersB: 1800, type: 'MoE', baseModelParamsB: 200, deviceType: 'A100', deviceNum: 16, systemPower: 550 },
        'custom': { parametersB: 175, type: 'dense', baseModelParamsB: null, deviceType: 'V100', deviceNum: 1, systemPower: 330 }
    };
    const infHardwarePresets = {
        'V100': { peakTFLOPs: 125, systemPower: 330 }, 'H100': { peakTFLOPs: 1979, systemPower: 800 },
        'A100': { peakTFLOPs: 312, systemPower: 550 }, 'TPUv3': { peakTFLOPs: 123, systemPower: 288 },
        'TPUv4': { peakTFLOPs: 275, systemPower: 250 }, 'custom': { peakTFLOPs: 125, systemPower: 330 }
    };
    const infDailyEquivalents_g = {
        'sms': { name: '個簡訊', value: 0.014, icon: `💬`, tooltip: '一則簡訊的平均碳排。' },
        'google_search': { name: '次 Google 搜尋', value: 0.2, icon: `🔍`, tooltip: '一次 Google 搜尋的平均碳排。' },
        'youtube_stream': { name: '小時 YouTube 串流', value: 10, icon: `▶️`, tooltip: '觀看一小時 YouTube 影片的平均碳排。' },
        'video_conference': { name: '小時線上會議', value: 12, icon: `💻`, tooltip: '一小時線上視訊會議的平均碳排。' },
    };

    function updateInferenceForm() {
        const presetKey = infModelPresetSelect.value;
        const isCustom = presetKey === 'custom';
        const model = infModelPresets[presetKey];

        document.getElementById('inf-parametersB').value = model.parametersB;
        infModelTypeSelect.value = model.type;
        if (model.type === 'MoE') {
            document.getElementById('inf-baseModelParamsB').value = model.baseModelParamsB;
        }
        infDeviceTypeSelect.value = model.deviceType;
        document.getElementById('inf-deviceNum').value = model.deviceNum;
        document.getElementById('inf-systemPower').value = model.systemPower;
        
        infCustomModelSection.classList.toggle('hidden', !isCustom);
        document.getElementById('inf-modelType').disabled = !isCustom;
        document.getElementById('inf-parametersB').disabled = !isCustom;
        document.getElementById('inf-baseModelParamsB').disabled = !isCustom;
        
        infBaseModelParamsContainer.classList.toggle('hidden', infModelTypeSelect.value !== 'MoE');
    }

    infModelPresetSelect.addEventListener('change', updateInferenceForm);
    
    infDeviceTypeSelect.addEventListener('change', () => {
        if (infDeviceTypeSelect.value !== 'custom') {
            document.getElementById('inf-systemPower').value = infHardwarePresets[infDeviceTypeSelect.value].systemPower;
        }
    });
    
    function runInferenceCalculation() {
        const inputs = {
            modelType: infModelTypeSelect.value,
            parametersB: parseFloat(document.getElementById('inf-parametersB').value),
            baseModelParamsB: parseFloat(document.getElementById('inf-baseModelParamsB').value),
            tokensT: parseFloat(document.getElementById('inf-tokensT').value),
            deviceType: infDeviceTypeSelect.value,
            deviceNum: parseInt(document.getElementById('inf-deviceNum').value),
            systemPower: parseFloat(document.getElementById('inf-systemPower').value),
            hardwareEfficiency: parseFloat(document.getElementById('inf-hardwareEfficiency').value),
            pue: parseFloat(document.getElementById('inf-pue').value),
            co2eqkwh: parseFloat(document.getElementById('inf-co2eqkwh').value),
        };

        let isValid = true;
        for (const key in inputs) {
            if (key === 'baseModelParamsB' && inputs.modelType !== 'MoE') continue;
            if (['modelType', 'deviceType'].includes(key)) continue;
            if (isNaN(inputs[key])) { isValid = false; break; }
            if (inputs[key] < 0) { isValid = false; break; }
        }
         if (inputs.pue < 1) { isValid = false; }
         if (inputs.deviceNum < 1) { isValid = false; }
        
        if(!isValid) {
            alert("請輸入有效的數值。");
            return;
        }

        const activeParamsB = inputs.modelType === 'MoE' ? inputs.baseModelParamsB : inputs.parametersB;
        const totalZettaFLOPs = 2 * activeParamsB * inputs.tokensT;
        const totalFLOPs = totalZettaFLOPs * 1e21;
        const TFLOPsPerSecond = infHardwarePresets[inputs.deviceType].peakTFLOPs * (inputs.hardwareEfficiency / 100);
        const inferenceSeconds = totalFLOPs / (inputs.deviceNum * TFLOPsPerSecond * 1e12);
        const totalPowerKW = (inputs.systemPower * inputs.deviceNum) / 1000;
        const totalEnergyKWh = totalPowerKW * (inferenceSeconds / 3600) * inputs.pue;
        const results = { totalCo2_g: totalEnergyKWh * inputs.co2eqkwh, totalEnergyKWh, totalTimeSeconds: inferenceSeconds };
        
        document.getElementById('inf-totalCo2').textContent = results.totalCo2_g.toFixed(4);
        
        const { totalTimeSeconds } = results;
        let timeString;
        if (totalTimeSeconds < 1) timeString = `${(totalTimeSeconds * 1000).toFixed(2)} 毫秒`;
        else if (totalTimeSeconds < 60) timeString = `${totalTimeSeconds.toFixed(2)} 秒`;
        else if (totalTimeSeconds < 3600) timeString = `${(totalTimeSeconds / 60).toFixed(2)} 分鐘`;
        else timeString = `${(totalTimeSeconds / 3600).toFixed(2)} 小時`;
        document.getElementById('inf-timeDisplay').textContent = timeString;
        
        document.getElementById('inf-energyDisplay').textContent = `${(results.totalEnergyKWh * 1000).toFixed(2)} Wh`;
        
        const equivalentsContainer = document.getElementById('inf-equivalents');
        equivalentsContainer.innerHTML = '';
        for (const key in infDailyEquivalents_g) {
            const item = infDailyEquivalents_g[key];
            const equivalentAmount = results.totalCo2_g / item.value;
            const formattedAmount = equivalentAmount < 1 && equivalentAmount > 0 ? equivalentAmount.toFixed(4) : Math.round(equivalentAmount).toLocaleString('zh-TW');
            equivalentsContainer.innerHTML += `<div class="bg-white dark:bg-gray-700 p-3 rounded-lg text-center transition duration-300 ease-in-out shadow-sm hover:shadow-lg transform hover:-translate-y-1 border dark:border-gray-600"><div class="tooltip"><span class="text-3xl">${item.icon}</span><span class="tooltiptext">${item.tooltip} 碳排：${item.value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} gCO₂eq</span></div><p class="text-xl font-bold text-gray-800 dark:text-gray-200 mt-2">${formattedAmount}</p><p class="text-xs text-gray-600 dark:text-gray-400 mt-1">${item.name}</p></div>`;
        }
    }

    document.getElementById('calculateInferenceBtn').addEventListener('click', runInferenceCalculation);
    
    // --- Initial Form Setup ---
    updateTrainingForm();
    updateInferenceForm();
    // Clear results on load to wait for button press
    document.querySelectorAll('.results-container').forEach(container => {
        container.style.opacity = '1';
    });
});
