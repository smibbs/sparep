/**
 * Progress Charts Module
 * Handles all Chart.js rendering for the progress dashboard
 * Uses Chart.js for visualization with consistent dark theme styling
 */

import progressCopy from './progressCopy.js';

// Chart.js will be loaded via CDN in dashboard.html
// We'll reference it as window.Chart

const CHART_COLORS = {
    primary: '#007AFF',
    success: '#34C759',
    warning: '#FF9500',
    danger: '#FF3B30',
    gray: '#8E8E93',
    background: '#222',
    gridLines: 'rgba(255, 255, 255, 0.1)',
    text: '#ffffff'
};

const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
        legend: {
            labels: {
                color: CHART_COLORS.text,
                font: { size: 12 }
            }
        },
        tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: CHART_COLORS.text,
            bodyColor: CHART_COLORS.text,
            borderColor: CHART_COLORS.gridLines,
            borderWidth: 1
        }
    },
    scales: {
        x: {
            ticks: { color: CHART_COLORS.text },
            grid: { color: CHART_COLORS.gridLines }
        },
        y: {
            ticks: { color: CHART_COLORS.text },
            grid: { color: CHART_COLORS.gridLines }
        }
    }
};

/**
 * Destroy existing chart if it exists
 * @param {string} canvasId
 */
function destroyChart(canvasId) {
    const chartInstance = window.Chart.getChart(canvasId);
    if (chartInstance) {
        chartInstance.destroy();
    }
}

/**
 * Render retention over time line chart
 * @param {string} canvasId
 * @param {Array} data - [{date, retention, rollingAverage}]
 * @param {number} days - Time window
 */
export function renderRetentionChart(canvasId, data, days = 30) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    destroyChart(canvasId);

    if (!data || data.length === 0) {
        showEmptyState(canvas, progressCopy.getEmptyStateCopy('retention'));
        return;
    }

    const ctx = canvas.getContext('2d');
    new window.Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
            datasets: [
                {
                    label: 'Daily Retention',
                    data: data.map(d => d.retention),
                    borderColor: CHART_COLORS.primary,
                    backgroundColor: 'rgba(0, 122, 255, 0.1)',
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    tension: 0.1
                },
                {
                    label: '7-day Average',
                    data: data.map(d => d.rollingAverage),
                    borderColor: CHART_COLORS.success,
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.4
                }
            ]
        },
        options: {
            ...CHART_DEFAULTS,
            scales: {
                ...CHART_DEFAULTS.scales,
                y: {
                    ...CHART_DEFAULTS.scales.y,
                    beginAtZero: true,
                    max: 100,
                    title: { display: true, text: 'Retention (%)', color: CHART_COLORS.text }
                }
            },
            plugins: {
                ...CHART_DEFAULTS.plugins,
                annotation: {
                    annotations: {
                        goalLine: {
                            type: 'line',
                            yMin: 90,
                            yMax: 90,
                            borderColor: CHART_COLORS.success,
                            borderWidth: 1,
                            borderDash: [5, 5],
                            label: {
                                content: 'Goal: 90%',
                                enabled: true,
                                position: 'end'
                            }
                        }
                    }
                }
            }
        }
    });
}

/**
 * Render streak heatmap (simplified calendar view)
 * @param {string} containerId
 * @param {Array} data - [{date, count}]
 */
export function renderStreakHeatmap(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = `<p class="empty-state">${progressCopy.getEmptyStateCopy('streak')}</p>`;
        return;
    }

    // Create simplified heatmap (last 90 days, grouped by week)
    const today = new Date();
    const daysToShow = 90;
    const startDate = new Date(today.getTime() - daysToShow * 24 * 60 * 60 * 1000);

    const dataMap = {};
    data.forEach(d => {
        dataMap[d.date] = d.count;
    });

    let html = '<div class="heatmap-grid">';
    for (let i = 0; i < daysToShow; i++) {
        const date = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        const dateStr = date.toISOString().split('T')[0];
        const count = dataMap[dateStr] || 0;

        const intensity = count === 0 ? 'none' : count <= 5 ? 'low' : count <= 15 ? 'medium' : 'high';

        html += `<div class="heatmap-cell heatmap-${intensity}" data-date="${dateStr}" data-count="${count}" title="${dateStr}: ${count} reviews"></div>`;
    }
    html += '</div>';

    container.innerHTML = html;
}

/**
 * Render due forecast area chart
 * @param {string} canvasId
 * @param {Array} data - [{date, count}]
 */
export function renderDueForecastChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    destroyChart(canvasId);

    if (!data || data.length === 0) {
        showEmptyState(canvas, progressCopy.getEmptyStateCopy('dueForecast'));
        return;
    }

    const ctx = canvas.getContext('2d');
    new window.Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
            datasets: [{
                label: 'Cards Due',
                data: data.map(d => d.count),
                backgroundColor: CHART_COLORS.primary,
                borderColor: CHART_COLORS.primary,
                borderWidth: 1
            }]
        },
        options: {
            ...CHART_DEFAULTS,
            scales: {
                ...CHART_DEFAULTS.scales,
                y: {
                    ...CHART_DEFAULTS.scales.y,
                    beginAtZero: true,
                    title: { display: true, text: 'Cards', color: CHART_COLORS.text }
                }
            }
        }
    });
}

/**
 * Render response time trend line chart
 * @param {string} canvasId
 * @param {Array} data - [{date, medianResponseTime}]
 */
export function renderResponseTimeChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    destroyChart(canvasId);

    if (!data || data.length < 3) {
        showEmptyState(canvas, progressCopy.getEmptyStateCopy('responseTime'));
        return;
    }

    const ctx = canvas.getContext('2d');
    new window.Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
            datasets: [{
                label: 'Median Response Time',
                data: data.map(d => d.medianResponseTime),
                borderColor: CHART_COLORS.warning,
                backgroundColor: 'rgba(255, 149, 0, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 4
            }]
        },
        options: {
            ...CHART_DEFAULTS,
            scales: {
                ...CHART_DEFAULTS.scales,
                y: {
                    ...CHART_DEFAULTS.scales.y,
                    beginAtZero: true,
                    title: { display: true, text: 'Seconds', color: CHART_COLORS.text }
                }
            }
        }
    });
}

/**
 * Render stability trend line chart
 * @param {string} canvasId
 * @param {Array} data - [{date, avgStability}]
 */
export function renderStabilityChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    destroyChart(canvasId);

    if (!data || data.length < 3) {
        showEmptyState(canvas, progressCopy.getEmptyStateCopy('stability'));
        return;
    }

    const ctx = canvas.getContext('2d');
    new window.Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
            datasets: [{
                label: 'Average Stability',
                data: data.map(d => d.avgStability),
                borderColor: CHART_COLORS.success,
                backgroundColor: 'rgba(52, 199, 89, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 4
            }]
        },
        options: {
            ...CHART_DEFAULTS,
            scales: {
                ...CHART_DEFAULTS.scales,
                y: {
                    ...CHART_DEFAULTS.scales.y,
                    beginAtZero: true,
                    title: { display: true, text: 'Days', color: CHART_COLORS.text }
                }
            }
        }
    });
}

/**
 * Render difficulty vs accuracy scatter chart
 * @param {string} canvasId
 * @param {Array} data - [{subjectName, avgDifficulty, accuracy, sampleSize}]
 */
export function renderDifficultyAccuracyChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    destroyChart(canvasId);

    if (!data || data.length === 0) {
        showEmptyState(canvas, progressCopy.getEmptyStateCopy('difficultyAccuracy'));
        return;
    }

    const ctx = canvas.getContext('2d');

    // Create color map for subjects
    const colors = [CHART_COLORS.primary, CHART_COLORS.success, CHART_COLORS.warning, CHART_COLORS.danger, CHART_COLORS.gray];

    new window.Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: data.map((subject, idx) => ({
                label: subject.subjectName,
                data: [{ x: subject.avgDifficulty, y: subject.accuracy }],
                backgroundColor: colors[idx % colors.length],
                pointRadius: Math.sqrt(subject.sampleSize) / 2, // Size by sample count
                pointHoverRadius: Math.sqrt(subject.sampleSize) / 1.5
            }))
        },
        options: {
            ...CHART_DEFAULTS,
            scales: {
                x: {
                    ...CHART_DEFAULTS.scales.x,
                    title: { display: true, text: 'Difficulty', color: CHART_COLORS.text },
                    min: 0,
                    max: 10
                },
                y: {
                    ...CHART_DEFAULTS.scales.y,
                    title: { display: true, text: 'Accuracy (%)', color: CHART_COLORS.text },
                    min: 0,
                    max: 100
                }
            },
            plugins: {
                ...CHART_DEFAULTS.plugins,
                tooltip: {
                    ...CHART_DEFAULTS.plugins.tooltip,
                    callbacks: {
                        label: (context) => {
                            const subject = data[context.datasetIndex];
                            return [
                                `${subject.subjectName}`,
                                `Difficulty: ${subject.avgDifficulty}`,
                                `Accuracy: ${subject.accuracy}%`,
                                `Reviews: ${subject.sampleSize}`
                            ];
                        }
                    }
                }
            }
        }
    });
}

/**
 * Render session ratings stacked bar chart
 * @param {string} canvasId
 * @param {Array} data - [{sessionDate, ratings: {0,1,2,3}}]
 */
export function renderSessionRatingsChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    destroyChart(canvasId);

    if (!data || data.length === 0) {
        showEmptyState(canvas, progressCopy.getEmptyStateCopy('sessionRatings'));
        return;
    }

    const ctx = canvas.getContext('2d');
    new window.Chart(ctx, {
        type: 'bar',
        data: {
            labels: data.map(s => new Date(s.sessionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
            datasets: [
                {
                    label: 'Again (0)',
                    data: data.map(s => s.ratings[0]),
                    backgroundColor: CHART_COLORS.danger
                },
                {
                    label: 'Hard (1)',
                    data: data.map(s => s.ratings[1]),
                    backgroundColor: CHART_COLORS.warning
                },
                {
                    label: 'Good (2)',
                    data: data.map(s => s.ratings[2]),
                    backgroundColor: CHART_COLORS.primary
                },
                {
                    label: 'Easy (3)',
                    data: data.map(s => s.ratings[3]),
                    backgroundColor: CHART_COLORS.success
                }
            ]
        },
        options: {
            ...CHART_DEFAULTS,
            scales: {
                ...CHART_DEFAULTS.scales,
                x: { stacked: true, ...CHART_DEFAULTS.scales.x },
                y: {
                    stacked: true,
                    ...CHART_DEFAULTS.scales.y,
                    title: { display: true, text: 'Cards', color: CHART_COLORS.text }
                }
            }
        }
    });
}

/**
 * Render subject mastery horizontal bar chart
 * @param {string} canvasId
 * @param {Array} data - [{subjectName, accuracy, avgStability, totalReviews}]
 */
export function renderSubjectMasteryChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    destroyChart(canvasId);

    if (!data || data.length === 0) {
        showEmptyState(canvas, progressCopy.getEmptyStateCopy('subjectMastery'));
        return;
    }

    // Only show top 10 (weakest subjects, sorted by accuracy ascending)
    const topData = data.slice(0, 10);

    const ctx = canvas.getContext('2d');
    new window.Chart(ctx, {
        type: 'bar',
        data: {
            labels: topData.map(s => s.subjectName),
            datasets: [{
                label: 'Accuracy (%)',
                data: topData.map(s => s.accuracy),
                backgroundColor: topData.map(s => {
                    if (s.accuracy >= 90) return CHART_COLORS.success;
                    if (s.accuracy >= 70) return CHART_COLORS.primary;
                    if (s.accuracy >= 50) return CHART_COLORS.warning;
                    return CHART_COLORS.danger;
                }),
                borderColor: CHART_COLORS.gridLines,
                borderWidth: 1
            }]
        },
        options: {
            ...CHART_DEFAULTS,
            indexAxis: 'y',
            scales: {
                x: {
                    ...CHART_DEFAULTS.scales.x,
                    beginAtZero: true,
                    max: 100,
                    title: { display: true, text: 'Accuracy (%)', color: CHART_COLORS.text }
                },
                y: {
                    ...CHART_DEFAULTS.scales.y
                }
            },
            plugins: {
                ...CHART_DEFAULTS.plugins,
                tooltip: {
                    ...CHART_DEFAULTS.plugins.tooltip,
                    callbacks: {
                        label: (context) => {
                            const subject = topData[context.dataIndex];
                            return [
                                `Accuracy: ${subject.accuracy}%`,
                                `Avg Stability: ${subject.avgStability} days`,
                                `Reviews: ${subject.totalReviews}`
                            ];
                        }
                    }
                }
            }
        }
    });
}

/**
 * Render learning curve (forgetting curve)
 * @param {string} canvasId
 * @param {Array} data - [{elapsedDaysBin, accuracy, sampleSize}]
 */
export function renderLearningCurveChart(canvasId, data) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    destroyChart(canvasId);

    if (!data || data.length < 3) {
        showEmptyState(canvas, progressCopy.getEmptyStateCopy('learningCurve'));
        return;
    }

    const ctx = canvas.getContext('2d');
    new window.Chart(ctx, {
        type: 'line',
        data: {
            labels: data.map(d => d.elapsedDaysBin),
            datasets: [{
                label: 'Accuracy',
                data: data.map(d => d.accuracy),
                borderColor: CHART_COLORS.primary,
                backgroundColor: 'rgba(0, 122, 255, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            ...CHART_DEFAULTS,
            scales: {
                ...CHART_DEFAULTS.scales,
                y: {
                    ...CHART_DEFAULTS.scales.y,
                    beginAtZero: true,
                    max: 100,
                    title: { display: true, text: 'Accuracy (%)', color: CHART_COLORS.text }
                },
                x: {
                    ...CHART_DEFAULTS.scales.x,
                    title: { display: true, text: 'Time Since Last Review', color: CHART_COLORS.text }
                }
            },
            plugins: {
                ...CHART_DEFAULTS.plugins,
                tooltip: {
                    ...CHART_DEFAULTS.plugins.tooltip,
                    callbacks: {
                        label: (context) => {
                            const point = data[context.dataIndex];
                            return [
                                `Accuracy: ${point.accuracy}%`,
                                `Sample: ${point.sampleSize} reviews`
                            ];
                        }
                    }
                }
            }
        }
    });
}

/**
 * Show empty state message in canvas
 * @param {HTMLCanvasElement} canvas
 * @param {string} message
 */
function showEmptyState(canvas, message) {
    const container = canvas.parentElement;
    container.innerHTML = `<p class="empty-state-message">${message}</p>`;
}

/**
 * Render a simple sparkline in a small canvas
 * @param {string} canvasId
 * @param {Array<number>} values
 * @param {string} color
 */
export function renderSparkline(canvasId, values, color = CHART_COLORS.primary) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !values || values.length === 0) return;

    destroyChart(canvasId);

    const ctx = canvas.getContext('2d');
    new window.Chart(ctx, {
        type: 'line',
        data: {
            labels: values.map((_, i) => i),
            datasets: [{
                data: values,
                borderColor: color,
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.4,
                fill: false
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            },
            scales: {
                x: { display: false },
                y: { display: false }
            },
            elements: {
                line: { borderWidth: 2 }
            },
            animation: false
        }
    });
}

export default {
    renderRetentionChart,
    renderStreakHeatmap,
    renderDueForecastChart,
    renderResponseTimeChart,
    renderStabilityChart,
    renderDifficultyAccuracyChart,
    renderSessionRatingsChart,
    renderSubjectMasteryChart,
    renderLearningCurveChart,
    renderSparkline
};
