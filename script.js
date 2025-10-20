document.addEventListener('DOMContentLoaded', function() {

    // --- Language and Translations ---
    let currentLanguage = 'zh';
    let translations = {};
    let equivalentsData = {};
    // moved built-in data -> data.json
    let gpuData = {};
    let modelPresets = {};
    let hardwarePresets = {};
    let infModelPresets = {};
    let infHardwarePresets = {};

    async function loadLocaleJson() {
        try {
            const [tRes, eRes, dRes] = await Promise.all([
                fetch('./translations.json'),
                fetch('./equivalents.json'),
                fetch('./data.json')
            ]);
            if (!tRes.ok || !eRes.ok || !dRes.ok) throw new Error('Failed to load locale/data files');
            translations = await tRes.json();
            equivalentsData = await eRes.json();
            const data = await dRes.json();
            // assign data sections (guarded)
            gpuData = data.gpuData || {};
            modelPresets = data.modelPresets || {};
            hardwarePresets = data.hardwarePresets || {};
            infModelPresets = data.infModelPresets || {};
            infHardwarePresets = data.infHardwarePresets || {};
        } catch (err) {
            console.error('Error loading locale or data JSON:', err);
            // Minimal fallback to avoid runtime errors
            translations = {
                en: { alert_invalid_input: 'Please enter valid numbers.', unit_days: 'days', unit_years: 'years', unit_ms: 'ms', unit_s: 's', unit_min: 'min', unit_hr: 'hr', chart_op_label: 'Operational Emissions', chart_em_label: 'Embodied Emissions', chart_title: 'Carbon Footprint Composition (tCO₂eq)', model_preset_custom_name: 'Custom Model' },
                zh: { alert_invalid_input: '請輸入有效的數值。', unit_days: '天', unit_years: '年', unit_ms: '毫秒', unit_s: '秒', unit_min: '分鐘', unit_hr: '小時', chart_op_label: '營運碳排', chart_em_label: '隱含碳排', chart_title: '碳足跡組成 (tCO₂eq)', model_preset_custom_name: '自訂模型' }
            };
            equivalentsData = { en: { lca: {}, training: {}, inference: {} }, zh: { lca: {}, training: {}, inference: {} } };
            // simple sample defaults for data
            gpuData = {
                "A100": { tdp_watt: 400, cradle_to_gate_kg: 120, water_L_per_year: [1000, 6000], e_waste_kg: 2.5 }
            };
            modelPresets = { 'custom': { name: 'Custom Model' } };
            hardwarePresets = { 'custom': { peakTFLOPs: 125, systemPower: 330 } };
            infModelPresets = { 'custom': { parametersB: 175, type: 'dense', baseModelParamsB: null, deviceType: 'V100', deviceNum: 1, systemPower: 330 } };
            infHardwarePresets = { 'custom': { peakTFLOPs: 125, systemPower: 330 } };
        }
    }

    function setLanguage(lang) {
        if (!translations[lang]) return;
        currentLanguage = lang;
        document.documentElement.lang = lang === 'zh' ? 'zh-TW' : 'en';

        // Update button styles
        const zhBtn = document.getElementById('lang-zh');
        const enBtn = document.getElementById('lang-en');
        if (zhBtn) zhBtn.classList.toggle('active-lang', lang === 'zh');
        if (enBtn) enBtn.classList.toggle('active-lang', lang === 'en');

        // Translate all elements with an ID
        const langData = translations[lang] || {};
        document.querySelectorAll('[id]').forEach(element => {
            const key = element.id;
            if (langData[key]) {
                if (element.querySelector('.tooltip')) {
                    if (element.childNodes && element.childNodes[0]) element.childNodes[0].nodeValue = langData[key];
                } else {
                    element.textContent = langData[key];
                }
            }
        });

        // Update dynamic content like model presets
        populateModelPresets();
    }

    const zhButton = document.getElementById('lang-zh');
    const enButton = document.getElementById('lang-en');
    if (zhButton) zhButton.addEventListener('click', () => setLanguage('zh'));
    if (enButton) enButton.addEventListener('click', () => setLanguage('en'));

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
                const years = currentValue / 365;
                const days = currentValue;
                const unitYears = (translations[currentLanguage] && translations[currentLanguage].unit_years) || 'years';
                const unitDays = (translations[currentLanguage] && translations[currentLanguage].unit_days) || 'days';
                element.textContent = currentValue < 365 ? `${days.toFixed(2)} ${unitDays}` : `${years.toFixed(2)} ${unitYears}`;
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

    let carbonChartInstance = null;

    function updateChart(operational, embodied) {
        const ctx = document.getElementById('carbonChart').getContext('2d');
        if (carbonChartInstance) carbonChartInstance.destroy();
        const langData = translations[currentLanguage] || {};
        carbonChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [langData.chart_op_label || 'Operational', langData.chart_em_label || 'Embodied'],
                datasets: [{ data: [operational, embodied], backgroundColor: ['#3B82F6', '#14B8A6'], borderColor: document.body.classList.contains('dark') ? '#1f2937' : '#FFFFFF', borderWidth: 4 }]
            },
            options: {
                responsive: true, cutout: '70%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: document.body.classList.contains('dark') ? '#D1D5DB' : '#4B5563' } },
                    title: { display: true, text: langData.chart_title || 'Carbon Footprint Composition', color: document.body.classList.contains('dark') ? '#F9FAFB' : '#1F2937', font: { size: 16 } }
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
            alert((translations[currentLanguage] && translations[currentLanguage].alert_invalid_input) || 'Please enter valid numbers.');
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
        document.getElementById('waterConsumption').innerHTML = `${totalWater.toFixed(0).toLocaleString('en-US')} <span class="text-base font-normal">L</span>`;
        document.getElementById('eWaste').innerHTML = `${eWaste.toFixed(2)} <span class="text-base font-normal">kg</span>`;

        updateChart(operationalCo2, embodiedCo2);

        const equivalentsContainer = document.getElementById('lca-equivalents');
        equivalentsContainer.innerHTML = '';
        const lcaDailyEquivalents = (equivalentsData[currentLanguage] && equivalentsData[currentLanguage].lca) || {};
        for (const key in lcaDailyEquivalents) {
            const item = lcaDailyEquivalents[key];
            const itemValue = item && item.value ? item.value : 1;
            const equivalentAmount = totalCo2 / itemValue;
            equivalentsContainer.innerHTML += `<div class="bg-white dark:bg-gray-700 p-3 rounded-lg text-center transition duration-300 ease-in-out shadow-sm hover:shadow-lg transform hover:-translate-y-1 border dark:border-gray-600"><div class="tooltip"><span class="text-3xl">${item.icon || ''}</span><span class="tooltiptext">${item.tooltip || ''} Emissions: ${itemValue.toFixed ? itemValue.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : itemValue} tCO₂eq</span></div><p class="text-xl font-bold text-gray-800 dark:text-gray-200 mt-2">${Math.round(equivalentAmount).toLocaleString('en-US')}</p><p class="text-xs text-gray-600 dark:text-gray-400 mt-1">${item.name || ''}</p></div>`;
        }
    }

    const calculateLcaBtn = document.getElementById('calculateLcaBtn');
    if (calculateLcaBtn) calculateLcaBtn.addEventListener('click', runLcaCalculation);

    // --- 工具 2: LLM 訓練碳排計算器邏輯 ---
    const modelPresetSelect = document.getElementById('modelPreset');
    const modelTypeSelect = document.getElementById('modelType');
    const baseModelParamsContainer = document.getElementById('baseModelParamsContainer');
    const deviceTypeSelect = document.getElementById('deviceType');

    function populateModelPresets() {
        if (!modelPresetSelect) return;
        modelPresetSelect.innerHTML = ''; // Clear existing options
        for (const key in modelPresets) {
            const option = document.createElement('option');
            option.value = key;
            if (key === 'custom') {
                option.textContent = (translations[currentLanguage] && translations[currentLanguage].model_preset_custom_name) || modelPresets[key].name;
            } else {
                option.textContent = modelPresets[key].name;
            }
            modelPresetSelect.appendChild(option);
        }
    }

    function updateTrainingForm() {
        if (!modelPresetSelect) return;
        const selectedModelKey = modelPresetSelect.value;
        const preset = modelPresets[selectedModelKey] || modelPresets['custom'];
        const isCustom = selectedModelKey === 'custom';

        if (!isCustom) {
            if (modelTypeSelect) modelTypeSelect.value = preset.type || '';
            const paramsEl = document.getElementById('parametersB');
            if (paramsEl) paramsEl.value = preset.params;
            const tokensEl = document.getElementById('tokensB');
            if (tokensEl) tokensEl.value = preset.tokens;
            if (deviceTypeSelect) deviceTypeSelect.value = preset.deviceType;
            const deviceNumEl = document.getElementById('deviceNum');
            if (deviceNumEl) deviceNumEl.value = preset.deviceNum;
            const systemPowerEl = document.getElementById('systemPower');
            if (systemPowerEl) systemPowerEl.value = (hardwarePresets[preset.deviceType] || hardwarePresets['custom']).systemPower;
            if (preset.type === 'MoE') {
                const baseEl = document.getElementById('baseModelParamsB');
                if (baseEl) baseEl.value = preset.baseParams;
            } else {
                const baseEl = document.getElementById('baseModelParamsB');
                if (baseEl) baseEl.value = '';
            }
        }

        if (modelTypeSelect) modelTypeSelect.disabled = !isCustom;
        const parametersEl = document.getElementById('parametersB');
        if (parametersEl) parametersEl.disabled = !isCustom;
        const baseParamsEl = document.getElementById('baseModelParamsB');
        if (baseParamsEl) baseParamsEl.disabled = !isCustom;
        const tokensEl = document.getElementById('tokensB');
        if (tokensEl) tokensEl.disabled = !isCustom;

        if (baseModelParamsContainer) baseModelParamsContainer.classList.toggle('hidden', modelTypeSelect.value !== 'MoE');
    }

    if (modelPresetSelect) modelPresetSelect.addEventListener('change', updateTrainingForm);

    if (deviceTypeSelect) deviceTypeSelect.addEventListener('change', () => {
        const systemPowerEl = document.getElementById('systemPower');
        if (systemPowerEl) systemPowerEl.value = (hardwarePresets[deviceTypeSelect.value] || hardwarePresets['custom']).systemPower;
    });

    function runTrainingCalculation() {
        const inputs = {
            modelType: (modelTypeSelect && modelTypeSelect.value) || 'dense',
            parametersB: parseFloat((document.getElementById('parametersB') && document.getElementById('parametersB').value) || NaN),
            baseModelParamsB: parseFloat((document.getElementById('baseModelParamsB') && document.getElementById('baseModelParamsB').value) || NaN),
            tokensB: parseFloat((document.getElementById('tokensB') && document.getElementById('tokensB').value) || NaN),
            deviceType: (deviceTypeSelect && deviceTypeSelect.value) || 'custom',
            deviceNum: parseInt((document.getElementById('deviceNum') && document.getElementById('deviceNum').value) || NaN),
            systemPower: parseFloat((document.getElementById('systemPower') && document.getElementById('systemPower').value) || NaN),
            hardwareEfficiency: parseFloat((document.getElementById('hardwareEfficiency') && document.getElementById('hardwareEfficiency').value) || NaN),
            pue: parseFloat((document.getElementById('pue') && document.getElementById('pue').value) || NaN),
            co2eqkwh: parseFloat((document.getElementById('trainingCo2eqkwh') && document.getElementById('trainingCo2eqkwh').value) || NaN),
            gpuCostPerHour: parseFloat((document.getElementById('gpuCostPerHour') && document.getElementById('gpuCostPerHour').value) || NaN),
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
            alert((translations[currentLanguage] && translations[currentLanguage].alert_invalid_input) || 'Please enter valid numbers.');
            return;
        }

        const activeParamsB = inputs.modelType === 'MoE' ? inputs.baseModelParamsB : inputs.parametersB;
        const totalFLOPs = 6 * activeParamsB * 1e9 * inputs.tokensB * 1e9;
        const TFLOPsPerSecond = (hardwarePresets[inputs.deviceType] || hardwarePresets['custom']).peakTFLOPs * (inputs.hardwareEfficiency / 100);
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
        const trainingDailyEquivalents = (equivalentsData[currentLanguage] && equivalentsData[currentLanguage].training) || {};
        for (const key in trainingDailyEquivalents) {
            const item = trainingDailyEquivalents[key];
            const itemValue = item && item.value ? item.value : 1;
            const equivalentAmount = results.operationalCo2 / itemValue;
            equivalentsContainer.innerHTML += `<div class="bg-white dark:bg-gray-700 p-3 rounded-lg text-center transition duration-300 ease-in-out shadow-sm hover:shadow-lg transform hover:-translate-y-1 border dark:border-gray-600"><div class="tooltip"><span class="text-3xl">${item.icon || ''}</span><span class="tooltiptext">${item.tooltip || ''} Emissions: ${itemValue.toFixed ? itemValue.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : itemValue} tCO₂eq</span></div><p class="text-xl font-bold text-gray-800 dark:text-gray-200 mt-2">${Math.round(equivalentAmount).toLocaleString('en-US')}</p><p class="text-xs text-gray-600 dark:text-gray-400 mt-1">${item.name || ''}</p></div>`;
        }
    }

    const calculateTrainingBtn = document.getElementById('calculateTrainingBtn');
    if (calculateTrainingBtn) calculateTrainingBtn.addEventListener('click', runTrainingCalculation);

    // --- 工具 3: LLM 推論碳排計算器邏輯 ---
    const infModelPresetSelect = document.getElementById('inf-modelPreset');
    const infCustomModelSection = document.getElementById('inf-customModelSection');
    const infModelTypeSelect = document.getElementById('inf-modelType');
    const infBaseModelParamsContainer = document.getElementById('inf-baseModelParamsContainer');
    const infDeviceTypeSelect = document.getElementById('inf-deviceType');

    function updateInferenceForm() {
        if (!infModelPresetSelect) return;
        const presetKey = infModelPresetSelect.value;
        const isCustom = presetKey === 'custom';
        const model = infModelPresets[presetKey] || infModelPresets['custom'];

        const infParametersEl = document.getElementById('inf-parametersB');
        const infBaseEl = document.getElementById('inf-baseModelParamsB');
        const infDeviceNumEl = document.getElementById('inf-deviceNum');
        const infSystemPowerEl = document.getElementById('inf-systemPower');

        if (infParametersEl) infParametersEl.value = model.parametersB;
        if (infModelTypeSelect) infModelTypeSelect.value = model.type;
        if (model.type === 'MoE' && infBaseEl) infBaseEl.value = model.baseModelParamsB;
        if (infDeviceTypeSelect) infDeviceTypeSelect.value = model.deviceType;
        if (infDeviceNumEl) infDeviceNumEl.value = model.deviceNum;
        if (infSystemPowerEl) infSystemPowerEl.value = model.systemPower;

        if (infCustomModelSection) infCustomModelSection.classList.toggle('hidden', !isCustom);
        if (infModelTypeSelect) infModelTypeSelect.disabled = !isCustom;
        if (infParametersEl) infParametersEl.disabled = !isCustom;
        if (infBaseEl) infBaseEl.disabled = !isCustom;

        if (infBaseModelParamsContainer) infBaseModelParamsContainer.classList.toggle('hidden', infModelTypeSelect.value !== 'MoE');
    }

    if (infModelPresetSelect) infModelPresetSelect.addEventListener('change', updateInferenceForm);

    if (infDeviceTypeSelect) infDeviceTypeSelect.addEventListener('change', () => {
        if (infDeviceTypeSelect.value !== 'custom') {
            const el = document.getElementById('inf-systemPower');
            if (el) el.value = infHardwarePresets[infDeviceTypeSelect.value].systemPower;
        }
    });

    function runInferenceCalculation() {
        const inputs = {
            modelType: (infModelTypeSelect && infModelTypeSelect.value) || 'dense',
            parametersB: parseFloat((document.getElementById('inf-parametersB') && document.getElementById('inf-parametersB').value) || NaN),
            baseModelParamsB: parseFloat((document.getElementById('inf-baseModelParamsB') && document.getElementById('inf-baseModelParamsB').value) || NaN),
            tokensT: parseFloat((document.getElementById('inf-tokensT') && document.getElementById('inf-tokensT').value) || NaN),
            deviceType: (infDeviceTypeSelect && infDeviceTypeSelect.value) || 'custom',
            deviceNum: parseInt((document.getElementById('inf-deviceNum') && document.getElementById('inf-deviceNum').value) || NaN),
            systemPower: parseFloat((document.getElementById('inf-systemPower') && document.getElementById('inf-systemPower').value) || NaN),
            hardwareEfficiency: parseFloat((document.getElementById('inf-hardwareEfficiency') && document.getElementById('inf-hardwareEfficiency').value) || NaN),
            pue: parseFloat((document.getElementById('inf-pue') && document.getElementById('inf-pue').value) || NaN),
            co2eqkwh: parseFloat((document.getElementById('inf-co2eqkwh') && document.getElementById('inf-co2eqkwh').value) || NaN),
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
            alert((translations[currentLanguage] && translations[currentLanguage].alert_invalid_input) || 'Please enter valid numbers.');
            return;
        }

        const activeParamsB = inputs.modelType === 'MoE' ? inputs.baseModelParamsB : inputs.parametersB;
        const totalZettaFLOPs = 2 * activeParamsB * inputs.tokensT;
        const totalFLOPs = totalZettaFLOPs * 1e21;
        const TFLOPsPerSecond = (infHardwarePresets[inputs.deviceType] || infHardwarePresets['custom']).peakTFLOPs * (inputs.hardwareEfficiency / 100);
        const inferenceSeconds = totalFLOPs / (inputs.deviceNum * TFLOPsPerSecond * 1e12);
        const totalPowerKW = (inputs.systemPower * inputs.deviceNum) / 1000;
        const totalEnergyKWh = totalPowerKW * (inferenceSeconds / 3600) * inputs.pue;
        const results = { totalCo2_g: totalEnergyKWh * inputs.co2eqkwh, totalEnergyKWh, totalTimeSeconds: inferenceSeconds };

        const infTotalCo2El = document.getElementById('inf-totalCo2');
        if (infTotalCo2El) infTotalCo2El.textContent = results.totalCo2_g.toFixed(4);

        const { totalTimeSeconds } = results;
        let timeString;
        const langData = translations[currentLanguage] || {};
        if (totalTimeSeconds < 1) timeString = `${(totalTimeSeconds * 1000).toFixed(2)} ${langData.unit_ms || 'ms'}`;
        else if (totalTimeSeconds < 60) timeString = `${totalTimeSeconds.toFixed(2)} ${langData.unit_s || 's'}`;
        else if (totalTimeSeconds < 3600) timeString = `${(totalTimeSeconds / 60).toFixed(2)} ${langData.unit_min || 'min'}`;
        else timeString = `${(totalTimeSeconds / 3600).toFixed(2)} ${langData.unit_hr || 'hr'}`;
        const infTimeEl = document.getElementById('inf-timeDisplay');
        if (infTimeEl) infTimeEl.textContent = timeString;

        const infEnergyEl = document.getElementById('inf-energyDisplay');
        if (infEnergyEl) infEnergyEl.textContent = `${(results.totalEnergyKWh * 1000).toFixed(2)} Wh`;

        const equivalentsContainer = document.getElementById('inf-equivalents');
        equivalentsContainer.innerHTML = '';
        const infDailyEquivalents_g = (equivalentsData[currentLanguage] && equivalentsData[currentLanguage].inference) || {};
        for (const key in infDailyEquivalents_g) {
            const item = infDailyEquivalents_g[key];
            const itemValue = item && item.value ? item.value : 1;
            const equivalentAmount = results.totalCo2_g / itemValue;
            const formattedAmount = equivalentAmount < 1 && equivalentAmount > 0 ? equivalentAmount.toFixed(4) : Math.round(equivalentAmount).toLocaleString('en-US');
            equivalentsContainer.innerHTML += `<div class="bg-white dark:bg-gray-700 p-3 rounded-lg text-center transition duration-300 ease-in-out shadow-sm hover:shadow-lg transform hover:-translate-y-1 border dark:border-gray-600"><div class="tooltip"><span class="text-3xl">${item.icon || ''}</span><span class="tooltiptext">${item.tooltip || ''} Emissions: ${itemValue.toFixed ? itemValue.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : itemValue} gCO₂eq</span></div><p class="text-xl font-bold text-gray-800 dark:text-gray-200 mt-2">${formattedAmount}</p><p class="text-xs text-gray-600 dark:text-gray-400 mt-1">${item.name || ''}</p></div>`;
        }
    }

    const calculateInferenceBtn = document.getElementById('calculateInferenceBtn');
    if (calculateInferenceBtn) calculateInferenceBtn.addEventListener('click', runInferenceCalculation);

    // --- Initial Setup (load locale & data JSON first) ---
    loadLocaleJson().then(() => {
        // set default language after JSON loaded
        setLanguage('zh');
        // populate presets and UI
        populateModelPresets();
        updateTrainingForm();
        updateInferenceForm();
        document.querySelectorAll('.results-container').forEach(container => {
            container.style.opacity = '1';
        });
    });

});
