let userPassword = '';
let currentTabName = '';
let sheetStartRowIndex = 1;
let globalRows = [];
let activeFilters = {}; 
let activeSort = { colIndex: null, direction: 'asc' };

async function authenticate() {
    const inputPass = document.getElementById('passwordInput').value.trim();
    const authError = document.getElementById('authError');
    authError.style.display = 'none';

    if (!inputPass) return;

    try {
        const response = await fetch(`${DEACON_CONFIG.WEB_APP_URL}?action=verifyPassword&password=${encodeURIComponent(inputPass)}`);
        const result = await response.json();

        if (result.status === "success") {
            userPassword = inputPass;
            showDashboard();
        } else {
            authError.innerText = "كلمة المرور غير صحيحة";
            authError.style.display = 'block';
        }
    } catch (err) {
        authError.innerText = "حدث خطأ أثناء التحقق من كلمة المرور";
        authError.style.display = 'block';
    }
}

function showDashboard() {
    document.getElementById('authSection').style.display = 'none';
    document.getElementById('attendanceSection').style.display = 'block';
    fetchTabs();
}

async function fetchTabs() {
    const tabsNav = document.getElementById('tabsNav');
    tabsNav.innerHTML = `<p class="loading-msg">جاري تحميل الأقسام...</p>`;

    try {
        const response = await fetch(`${DEACON_CONFIG.WEB_APP_URL}?action=getAttendanceTabs&password=${encodeURIComponent(userPassword)}`);
        const result = await response.json();

        if (result.status === "success" && result.tabs && result.tabs.length > 0) {
            let html = '';
            result.tabs.forEach((tabName, index) => {
                const activeClass = index === 0 ? 'active' : '';
                html += `<button class="tab-btn ${activeClass}" onclick="switchTab('${tabName.replace(/'/g, "\\'")}', this)">${tabName}</button>`;
            });
            tabsNav.innerHTML = html;
            loadAttendanceData(result.tabs[0]);
        } else {
            tabsNav.innerHTML = `<p class="error-msg">${result.message || 'فشل جلب الأوراق'}</p>`;
        }
    } catch (err) {
        tabsNav.innerHTML = `<p class="error-msg">فشل الاتصال بالخادم.</p>`;
    }
}

function formatCellValue(val) {
    if (val === null || val === undefined || val === "") return '-';
    if (typeof val === 'string' && val.includes('T') && val.includes('Z')) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
    }
    return val;
}

function processMergedHeaders(headersRow) {
    let processed = [...headersRow];
    let lastValidText = '';
    for (let i = 0; i < processed.length; i++) {
        let val = formatCellValue(processed[i]);
        if (val !== '-' && val !== '') {
            lastValidText = val;
        } else if (lastValidText !== '') {
            processed[i] = lastValidText;
        }
    }
    for (let i = processed.length - 1; i >= 0; i--) {
        let val = formatCellValue(processed[i]);
        if (val !== '-' && val !== '') {
            lastValidText = val;
        } else if (lastValidText !== '') {
            processed[i] = lastValidText;
        }
    }
    return processed;
}

function checkIfTotalRowOrCol(text) {
    const t = String(text).toLowerCase();
    return t.includes('إجمالي') || t.includes('مجموع') || t.includes('total') || t.includes('المجموع') || t.includes('الإجمالي') || t.includes('عدد') || t.includes('العدد');
}

function isDateHeader(headerText) {
    return /\d{4}-\d{2}-\d{2}/.test(String(headerText));
}

async function loadAttendanceData(tabName) {
    currentTabName = tabName;
    const container = document.getElementById('tableContainer');
    container.innerHTML = `<p class="loading-msg">جاري تحميل ${tabName}...</p>`;
    activeFilters = {};
    activeSort = { colIndex: null, direction: 'asc' };

    try {
        const response = await fetch(`${DEACON_CONFIG.WEB_APP_URL}?action=getAttendance&tabName=${encodeURIComponent(tabName)}&password=${encodeURIComponent(userPassword)}`);
        const result = await response.json();

        if (result.status === "success" && result.data && result.data.length > 0) {
            globalRows = result.data;
            sheetStartRowIndex = result.startRowIndex || 1;

            if (globalRows.length > 0) {
                globalRows[0] = processMergedHeaders(globalRows[0]);
            }

            renderTable();

        } else {
            container.innerHTML = `<p class="error-msg">لا توجد بيانات متاحة.</p>`;
        }
    } catch (err) {
        container.innerHTML = `<p class="error-msg">خطأ في الاتصال.</p>`;
    }
}

function renderTable() {
    const container = document.getElementById('tableContainer');
    let rows = [...globalRows];
    if (rows.length === 0) return;

    let headerRow = rows[0];       
    let filterRow = rows[1];       
    let dataRows = rows.slice(2);  

    let regularRows = [];
    let totalRowsData = [];
    dataRows.forEach((r, idx) => {
        let rowLabel = String(r[1] || r[0]);
        let isTotalR = checkIfTotalRowOrCol(rowLabel);
        if (isTotalR) {
            totalRowsData.push({ row: r, originalIndex: idx + 2 });
        } else {
            regularRows.push({ row: r, originalIndex: idx + 2 });
        }
    });

    let filteredRows = regularRows.filter(item => {
        for (let colIdx in activeFilters) {
            let filterVal = activeFilters[colIdx];
            if (filterVal && filterVal !== 'all') {
                let cellVal = String(item.row[colIdx] || '').trim();
                if (cellVal !== filterVal) return false;
            }
        }
        return true;
    });

    if (activeSort.colIndex !== null) {
        let cIdx = activeSort.colIndex;
        let dir = activeSort.direction === 'asc' ? 1 : -1;
        filteredRows.sort((a, b) => {
            let valA = String(a.row[cIdx] || '').trim();
            let valB = String(b.row[cIdx] || '').trim();
            return valA.localeCompare(valB, 'ar', { numeric: true }) * dir;
        });
    }

    let finalRowsToDisplay = [headerRow, filterRow, ...filteredRows.map(item => item.row), ...totalRowsData.map(item => item.row)];

    let totalCols = new Array(headerRow.length).fill(false);
    let totalRowsIndices = new Array(finalRowsToDisplay.length).fill(false);

    for (let c = 2; c < headerRow.length; c++) {
        let headerVal = String(headerRow[c]);
        let filterVal = String(filterRow[c] || '');
        if (checkIfTotalRowOrCol(headerVal) || checkIfTotalRowOrCol(filterVal)) {
            totalCols[c] = true;
        }
    }

    for (let r = 0; r < finalRowsToDisplay.length; r++) {
        let rowLabel = String(finalRowsToDisplay[r][1] || finalRowsToDisplay[r][0]);
        if (checkIfTotalRowOrCol(rowLabel)) {
            totalRowsIndices[r] = true;
        }
    }

    let html = '<table>';
    
    finalRowsToDisplay.forEach((row, rowIndex) => {
        let isRowTotal = totalRowsIndices[rowIndex];
        let rowClass = isRowTotal ? 'total-separator-row' : '';
        html += `<tr class="${rowClass}">`;

        row.forEach((cell, colIndex) => {
            let formatted = formatCellValue(cell);
            let isFrozen = colIndex < 2;
            let idClass = colIndex === 0 ? 'col-id' : '';
            
            let isColTotal = totalCols[colIndex];
            let textVal = String(formatted).toLowerCase();
            let isTotalCell = isColTotal || isRowTotal || checkIfTotalRowOrCol(textVal);

            if (rowIndex === 0) {
                let headerClass = isTotalCell ? 'total-header' : '';
                let sortSymbol = (activeSort.colIndex === colIndex) ? (activeSort.direction === 'asc' ? '🔼' : '🔽') : '↕';

                html += `<th class="${headerClass} ${idClass}">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:4px;">
                        <span>${formatted}</span>
                        <button onclick="toggleSort(${colIndex})" title="ترتيب" style="background:none; border:none; color:#fff; cursor:pointer; font-size:11px;">${sortSymbol}</button>
                    </div>
                </th>`;
            } else if (rowIndex === 1) {
                let headerClass = isTotalCell ? 'total-header' : '';
                let currentFilterVal = activeFilters[colIndex] || 'all';

                let uniqueColVals = new Set();
                regularRows.forEach(item => {
                    let v = String(item.row[colIndex] || '').trim();
                    if (v && v !== '-') uniqueColVals.add(v);
                });

                html += `<th class="${headerClass} ${idClass}">
                    <div class="th-controls">`;
                
                if (colIndex >= 2 && uniqueColVals.size > 0 && !isDateHeader(String(headerRow[colIndex])) && !checkIfTotalRowOrCol(String(headerRow[colIndex]))) {
                    html += `<select onchange="updateFilter(${colIndex}, this.value)">
                        <option value="all">الكل</option>`;
                    uniqueColVals.forEach(val => {
                        let sel = currentFilterVal === val ? 'selected' : '';
                        html += `<option value="${val}" ${sel}>${val}</option>`;
                    });
                    html += `</select>`;
                } else {
                    html += `<span>${formatted}</span>`;
                }

                html += `</div></th>`;
            } else {
                let displayCell = formatted;
                let rawStr = String(formatted).trim();
                
                let headerColText = String(headerRow[colIndex] || '');
                let isDateCol = isDateHeader(headerColText);

                let isAttendanceCell = (rawStr === 'حاضر' || rawStr === 'غائب' || rawStr === 'ح' || rawStr === 'غ' || rawStr === '-');
                
                let editable = '';
                if (!isTotalCell) {
                    if (isDateCol && isAttendanceCell) {
                        editable = 'attendance-editable';
                    } else if (!isDateCol) {
                        editable = 'text-editable';
                    }
                }
                
                if (isDateCol) {
                    if (rawStr === 'غائب' || rawStr === 'غ') {
                        displayCell = `<span class="badge-absent">غائب</span>`;
                    } else if (rawStr === 'حاضر' || rawStr === 'ح') {
                        displayCell = `<span class="badge-present">حاضر</span>`;
                    }
                }

                let originalGlobalRowIndex = globalRows.findIndex(r => r === row);
                const actualRowInSheet = sheetStartRowIndex + originalGlobalRowIndex;
                const actualColInSheet = colIndex + 1;
                
                let cellStyleClass = isTotalCell ? 'total-cell' : '';

                html += `<td class="${idClass} ${cellStyleClass} ${editable}" 
                            data-row="${actualRowInSheet}" 
                            data-col-idx="${actualColInSheet}"
                            data-is-date="${isDateCol}"
                            onclick="handleCellClick(this, '${currentTabName.replace(/'/g, "\\'")}')">${displayCell}</td>`;
            }
        });
        html += '</tr>';
    });
    
    html += '</table>';
    container.innerHTML = html;
}

function updateFilter(colIndex, val) {
    if (val === 'all') {
        delete activeFilters[colIndex];
    } else {
        activeFilters[colIndex] = val;
    }
    renderTable();
}

function toggleSort(colIndex) {
    if (activeSort.colIndex === colIndex) {
        activeSort.direction = activeSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        activeSort.colIndex = colIndex;
        activeSort.direction = 'asc';
    }
    renderTable();
}

function handleCellClick(cellElement, tabName) {
    if (!cellElement) return;

    if (cellElement.classList.contains('attendance-editable')) {
        toggleAttendance(cellElement, tabName);
    } else if (cellElement.classList.contains('text-editable') && !cellElement.querySelector('input')) {
        makeCellEditable(cellElement, tabName);
    }
}

async function toggleAttendance(cellElement, tabName) {
    const rowIndex = cellElement.getAttribute('data-row');
    const colIndex = cellElement.getAttribute('data-col-idx');
    const currentBadge = cellElement.querySelector('span');
    
    let newStatus = 'حاضر';
    if (currentBadge && (currentBadge.innerText.trim() === 'حاضر' || currentBadge.innerText.trim() === 'ح')) {
        newStatus = 'غائب';
    }

    if (newStatus === 'حاضر') {
        cellElement.innerHTML = `<span class="badge-present">حاضر</span>`;
    } else {
        cellElement.innerHTML = `<span class="badge-absent">غائب</span>`;
    }

    sendUpdateToSheet(tabName, rowIndex, colIndex, newStatus);
}

function makeCellEditable(cellElement, tabName) {
    const currentText = cellElement.innerText === '-' ? '' : cellElement.innerText;
    cellElement.innerHTML = `<input type="text" class="editable-text-input" value="${currentText}" autofocus>`;
    
    const input = cellElement.querySelector('input');
    input.focus();

    input.onblur = function() {
        saveTextInput(cellElement, tabName, input.value);
    };

    input.onkeydown = function(e) {
        if (e.key === 'Enter') {
            input.blur();
        }
    };
}

async function saveTextInput(cellElement, tabName, val) {
    const rowIndex = cellElement.getAttribute('data-row');
    const colIndex = cellElement.getAttribute('data-col-idx');
    const finalVal = val.trim() === '' ? '-' : val.trim();

    cellElement.innerText = finalVal;
    sendUpdateToSheet(tabName, rowIndex, colIndex, finalVal);
}

async function sendUpdateToSheet(tabName, rowIndex, colIndex, statusVal) {
    try {
        const payload = {
            password: userPassword,
            tabName: tabName,
            rowIndex: parseInt(rowIndex),
            colIndex: parseInt(colIndex),
            status: statusVal
        };

        await fetch(DEACON_CONFIG.WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.error("Failed to update Google Sheets:", err);
    }
}

function switchTab(tabName, btnElement) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    loadAttendanceData(tabName);
}
