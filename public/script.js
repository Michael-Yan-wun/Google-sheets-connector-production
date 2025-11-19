document.addEventListener('DOMContentLoaded', () => {
    const refreshBtn = document.getElementById('refreshBtn');
    const executeBtn = document.getElementById('executeBtn');
    const tableHead = document.getElementById('tableHead');
    const tableBody = document.getElementById('tableBody');
    const statusDiv = document.getElementById('status');

    // Stats Elements
    const totalUsersEl = document.getElementById('totalUsers');
    const pendingUsersEl = document.getElementById('pendingUsers');
    const repliedUsersEl = document.getElementById('repliedUsers');

    // Chart Instances
    let statusChartInstance = null;
    let trendChartInstance = null;

    // Fetch data on load
    fetchData();

    refreshBtn.addEventListener('click', fetchData);

    executeBtn.addEventListener('click', async () => {
        if (!confirm('您確定要發送 Email 給所有待處理的使用者嗎？')) return;

        executeBtn.disabled = true;
        executeBtn.innerHTML = '<span class="btn-icon">...</span> 處理中...';
        showStatus('處理中...', 'info');

        try {
            const response = await fetch('/api/execute', { method: 'POST' });
            const result = await response.json();

            if (response.ok) {
                showStatus(`成功: ${result.message}。已處理 ${result.processed} 封郵件。`, 'success');
                fetchData(); // Refresh table
            } else {
                showStatus(`錯誤: ${result.error || '未知錯誤'}`, 'error');
            }
        } catch (error) {
            showStatus(`錯誤: ${error.message}`, 'error');
        } finally {
            executeBtn.disabled = false;
            executeBtn.innerHTML = '<span class="btn-icon">▶</span> 執行自動回覆';
        }
    });

    async function fetchData() {
        try {
            const response = await fetch('/api/preview');
            const result = await response.json();

            if (result.error) {
                showStatus(`載入資料錯誤: ${result.error}`, 'error');
                return;
            }

            renderTable(result.headers, result.data);
            updateStats(result.headers, result.data);
        } catch (error) {
            showStatus(`載入資料錯誤: ${error.message}`, 'error');
        }
    }

    function renderTable(headers, data) {
        tableHead.innerHTML = '';
        tableBody.innerHTML = '';

        if (!headers || headers.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="100%">未找到資料</td></tr>';
            return;
        }

        headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            tableHead.appendChild(th);
        });

        data.forEach(row => {
            const tr = document.createElement('tr');
            headers.forEach(header => {
                const td = document.createElement('td');
                td.textContent = row[header] || '';
                tr.appendChild(td);
            });
            tableBody.appendChild(tr);
        });
    }

    function updateStats(headers, data) {
        const statusIndex = headers.indexOf('是否自動回覆');
        // Try to find a date column
        const dateHeader = headers.find(h => h.includes('日期') || h.includes('Date') || h.includes('Time') || h.includes('時間'));

        const total = data.length;
        let replied = 0;
        let pending = 0;
        const dateCounts = {};

        data.forEach(row => {
            // Status Count
            if (statusIndex !== -1) {
                const status = row['是否自動回覆'];
                if (status && status.trim() !== '') {
                    replied++;
                } else {
                    pending++;
                }
            }

            // Date Count
            if (dateHeader) {
                let dateStr = row[dateHeader];
                if (dateStr) {
                    // Simple date parsing (taking the first part if it contains space, e.g. "2023/11/19 10:00")
                    // Adjust parsing based on actual sheet format if needed
                    try {
                        const dateObj = new Date(dateStr);
                        if (!isNaN(dateObj)) {
                            const dateKey = dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
                            dateCounts[dateKey] = (dateCounts[dateKey] || 0) + 1;
                        } else {
                            // Fallback for simple string matching if parsing fails or non-standard format
                            const simpleDate = dateStr.split(' ')[0];
                            dateCounts[simpleDate] = (dateCounts[simpleDate] || 0) + 1;
                        }
                    } catch (e) {
                        console.warn('Date parsing error', e);
                    }
                }
            }
        });

        if (statusIndex === -1) pending = total;

        // Animate numbers
        animateValue(totalUsersEl, parseInt(totalUsersEl.textContent), total, 1000);
        animateValue(pendingUsersEl, parseInt(pendingUsersEl.textContent), pending, 1000);
        animateValue(repliedUsersEl, parseInt(repliedUsersEl.textContent), replied, 1000);

        renderCharts(replied, pending, dateCounts);
    }

    function animateValue(obj, start, end, duration) {
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            obj.innerHTML = Math.floor(progress * (end - start) + start);
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    function renderCharts(replied, pending, dateCounts) {
        const ctxStatus = document.getElementById('statusChart').getContext('2d');
        const ctxTrend = document.getElementById('trendChart').getContext('2d');

        // Common Chart Options
        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#94a3b8', font: { family: 'JetBrains Mono' } }
                }
            }
        };

        // Status Chart (Pie)
        if (statusChartInstance) statusChartInstance.destroy();
        statusChartInstance = new Chart(ctxStatus, {
            type: 'doughnut',
            data: {
                labels: ['已回覆', '待處理'],
                datasets: [{
                    data: [replied, pending],
                    backgroundColor: ['#00ff9d', '#ffb800'],
                    borderColor: '#141928',
                    borderWidth: 2
                }]
            },
            options: {
                ...commonOptions,
                cutout: '70%'
            }
        });

        // Trend Chart (Bar - Real Data)
        // Sort dates
        const sortedDates = Object.keys(dateCounts).sort();
        const trendData = sortedDates.map(date => dateCounts[date]);

        if (trendChartInstance) trendChartInstance.destroy();
        trendChartInstance = new Chart(ctxTrend, {
            type: 'bar',
            data: {
                labels: sortedDates.length > 0 ? sortedDates : ['No Data'],
                datasets: [{
                    label: '每日新增使用者',
                    data: trendData.length > 0 ? trendData : [0],
                    backgroundColor: '#00f3ff',
                    borderRadius: 4,
                    barThickness: 20,
                    maxBarThickness: 30
                }]
            },
            options: {
                ...commonOptions,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255, 255, 255, 0.1)' },
                        ticks: { color: '#94a3b8', stepSize: 1 }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8' }
                    }
                }
            }
        });
    }

    function showStatus(message, type) {
        statusDiv.textContent = message;
        statusDiv.className = 'status-message ' + type;
        statusDiv.style.display = 'block';

        if (type === 'success') {
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 5000);
        }
    }
});
