import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { PlusCircle, MinusCircle, Upload, Download, Play, XCircle, ChevronDown, ChevronUp, UserPlus, Trash2, Clock, BarChart, LineChart, RefreshCw, Users, GitMerge, DollarSign, Building, Briefcase, Trello, HeartPulse, Lightbulb, Wrench, CheckCircle, Save } from 'lucide-react';

// Helper function to parse dates, robust to different formats
const parseDate = (dateStr) => {
    if (!dateStr || typeof dateStr !== 'string') return null;
    // Handles both YYYY-MM-DD and YYYY/MM/DD
    const sanitizedStr = dateStr.replace(/-/g, '/');
    const date = new Date(sanitizedStr);
    // Check if the parsed date is valid
    return isNaN(date.getTime()) ? null : date;
};

// Helper to format date to an ISO string (YYYY-MM-DD)
const formatDate = (date) => {
    if (!date) return '';
    const dateObj = date instanceof Date ? date : parseDate(date);
    if (!dateObj || isNaN(dateObj.getTime())) return '';
    return dateObj.toISOString().split('T')[0];
};

// Helper to format date for Gantt chart (M/D)
const formatDateForGantt = (dateStr) => {
    if (!dateStr) return '';
    const d = dateStr instanceof Date ? dateStr : parseDate(dateStr);
    if (!d) return '';
    return `${d.getMonth() + 1}/${d.getDate()}`;
};

// Helper to add days to a date
const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};


const TEAM_COLORS = ['#3b82f6', '#000000', '#f97316', '#8b5cf6', '#10b981', '#ef4444', '#f59e0b', '#826c60', '#6366f1', '#d946ef', '#8b4513'];
// UPDATED: Added Receiving and QC to the sort order
const TEAM_SORT_ORDER = ['Receiving', 'CNC', 'Metal', 'Scenic', 'Paint', 'Carpentry', 'Assembly', 'Tech', 'QC', 'Hybrid'];

const EFFICIENCY_DATA_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT-velZ6evgYWuTWpEnd6_NWzlK8hHt02sTOoYU0CrAPY9P3HCrgzFkQTCI84j2WF9_p_wef7ef-7ll/pub?gid=0&single=true&output=csv';
const ROUTING_DATA_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTTmWdo7GyGwrG1iru8KBk166ndwV802lg3slbcrgekwdLXWWb9WF-i0snEipFq-AMVMTNH9qUWxHH_/pub?gid=1072114065&single=true&output=csv';

// Default state values
const createDefaultTeamDefs = () => {
    // UPDATED: Added Receiving and QC headcounts and mappings
    const headcounts = [
        { id: 1, name: 'Paint', count: 9 }, { id: 2, name: 'Scenic', count: 4 }, { id: 3, name: 'CNC', count: 3 },
        { id: 4, name: 'Metal', count: 1 }, { id: 5, name: 'Carpentry', count: 9 }, { id: 6, name: 'Assembly', count: 4 },
        { id: 7, name: 'Tech', count: 4 }, { id: 8, name: 'Receiving', count: 2 }, { id: 9, name: 'QC', count: 2 },
    ];
    headcounts.sort((a, b) => {
        const indexA = TEAM_SORT_ORDER.indexOf(a.name);
        const indexB = TEAM_SORT_ORDER.indexOf(b.name);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });

    return {
        headcounts,
        mapping: [
            { id: 1, team: 'Paint', operation: 'Scenic Paint' }, { id: 2, team: 'Paint', operation: 'Paint Prep' },
            { id: 3, team: 'Paint', operation: 'Finishing' }, { id: 4, team: 'Scenic', operation: 'Scenic Fabrication' },
            { id: 5, team: 'CNC', operation: 'CNC Operation' }, { id: 6, team: 'Metal', operation: 'Metal Fabrication' },
            { id: 7, team: 'Carpentry', operation: 'Carpentry/Woodwork' }, { id: 8, team: 'Assembly', operation: 'Final Assembly' },
            { id: 9, team: 'Tech', operation: 'Tech' }, { id: 10, team: 'Tech', operation: 'Tech Prep' },
            // New Mappings
            { id: 11, team: 'Receiving', operation: 'Receiving' }, 
            { id: 12, team: 'QC', operation: 'Quality Review / Testing' },
        ],
    };
};

const DEFAULT_SCHEDULING_PARAMETERS = {
    startDate: formatDate(new Date()), hoursPerDay: 8.0,
    productivityAssumption: 0.78,
    globalBuffer: 15, // Global Buffer adeed, default at 15%
    // UPDATED: Removed 'Receiving' and 'Quality Review / Testing' from ignore list
    teamsToIgnore: 'Unassigned, Wrapping / Packaging, Print',
    holidays: '2025-07-04, 2025-09-01, 2025-11-24, 2025-12-24, 2025-12-25, 2026-01-01',
};

// Reusable Collapsible Section Component
const CollapsibleSection = ({ title, children, icon: Icon, defaultOpen = true }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="bg-white p-5 rounded-lg shadow">
            <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
                <h2 className="text-xl font-bold flex items-center">
                    {Icon && <Icon className="w-5 h-5 mr-2 text-slate-500"/>}
                    {title}
                </h2>
                {isOpen ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
            </div>
            {isOpen && <div className="mt-4 border-t pt-4">{children}</div>}
        </div>
    );
};


// Main Application Component
export default function App() {
    // --- STATE MANAGEMENT ---
    const [teamDefs, setTeamDefs] = useState(createDefaultTeamDefs());
    const [params, setParams] = useState(DEFAULT_SCHEDULING_PARAMETERS);
    const [teamMemberChanges, setTeamMemberChanges] = useState([]);
    const [hybridWorkers, setHybridWorkers] = useState([{id: 1, name: 'Hybrid1', primaryTeam: 'Tech', secondaryTeam: 'Metal'}]);
    const [ptoEntries, setPtoEntries] = useState([]);
    const [workHourOverrides, setWorkHourOverrides] = useState([]);
    
    const [projectTasks, setProjectTasks] = useState([]);
    const [routingData, setRoutingData] = useState([]);
    const [builderState, setBuilderState] = useState({
        selectedTemplates: [],
        store: '',
        startDate: formatDate(new Date()),
        dueDate: formatDate(addDays(new Date(), 14)),
    });

    const [efficiencyData, setEfficiencyData] = useState({});
    const [teamMemberNameMap, setTeamMemberNameMap] = useState({});
    const [projectFileName, setProjectFileName] = useState('');
    const [finalSchedule, setFinalSchedule] = useState([]);
    const [summaryData, setSummaryData] = useState({ project: [], store: [] });
    const [summaryView, setSummaryView] = useState('store');
    const [teamUtilization, setTeamUtilization] = useState([]);
    const [weeklyOutput, setWeeklyOutput] = useState([]);
    const [dailyCompletions, setDailyCompletions] = useState([]);
    const [startDateOverrides, setStartDateOverrides] = useState({});
    const [endDateOverrides, setEndDateOverrides] = useState({});
    const [teamWorkload, setTeamWorkload] = useState([]);

    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [projectedCompletion, setProjectedCompletion] = useState(null);
    const [isLogsVisible, setIsLogsVisible] = useState(false);
    const [utilizationView, setUtilizationView] = useState('bar');
    const [lastRunState, setLastRunState] = useState(null);
    const [needsRerun, setNeedsRerun] = useState(false);
    const [ganttFilter, setGanttFilter] = useState('');
    const [completedTasks, setCompletedTasks] = useState([]);
    const [simulationProgress, setSimulationProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState('');
    const [progressStep, setProgressStep] = useState('');
    const pollingIntervalRef = useRef(null);
    
     // 👇 ADD THESE NEW STATE VARIABLES HERE 👇
    const [optimizationConfig, setOptimizationConfig] = useState({
        targetDeadlineBuffer: 3,
        maxIterations: 15,
        budgetLimit: 100000,
        allowHiring: true,
        allowOvertime: false,
        maxOvertimeHours: 2,
        costPerHour: 25,
    });
    const [minHeadcount, setMinHeadcount] = useState({});
    const [maxHeadcount, setMaxHeadcount] = useState({});
    const [optimizationResults, setOptimizationResults] = useState(null);
    const [isOptimizing, setIsOptimizing] = useState(false);
  // 👆 END NEW STATE VARIABLES 👆

    const utilizationChartContainerRef = useRef(null);
    const [utilizationChartDimensions, setUtilizationChartDimensions] = useState({ width: 0, height: 0 });
    const workloadChartContainerRef = useRef(null);
    const [workloadChartDimensions, setWorkloadChartDimensions] = useState({ width: 0, height: 0 });
    const ganttChartContainerRef = useRef(null);
    const [ganttChartDimensions, setGanttChartDimensions] = useState({ width: 0, height: 0 });
    const fileInputRef = useRef(null); // For loading config

    const inputStyles = "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-slate-100";
    const smallInputStyles = "rounded-md border-gray-300 shadow-sm text-sm p-2 bg-slate-100";

    const teamColorMap = React.useMemo(() => {
        return TEAM_SORT_ORDER.reduce((acc, team, i) => {
            acc[team] = TEAM_COLORS[i % TEAM_COLORS.length];
            return acc;
        }, {});
    }, []);

    const filteredProjects = React.useMemo(() => {
        if (!ganttFilter) {
            return summaryData.project;
        }
        const filter = ganttFilter.toLowerCase();
        return summaryData.project.filter(p =>
            p.Project.toLowerCase().includes(filter) ||
            p.Store.toLowerCase().includes(filter)
        );
    }, [summaryData.project, ganttFilter]);

    const projectTemplates = React.useMemo(() => {
        if (!routingData) return [];
        const templates = [...new Set(routingData.map(r => r.TemplateName))];
        return templates.sort();
    }, [routingData]);

    const builtProjects = React.useMemo(() => {
        const projectsMap = projectTasks.reduce((acc, task) => {
            if (task.Project && !acc[task.Project]) {
                acc[task.Project] = { name: task.Project, store: task.Store };
            }
            return acc;
        }, {});
        return Object.values(projectsMap).sort((a, b) => a.name.localeCompare(b.name));
    }, [projectTasks]);


    useEffect(() => {
        if (lastRunState) {
            const currentState = JSON.stringify({ params, teamDefs, ptoEntries, teamMemberChanges, workHourOverrides, hybridWorkers, efficiencyData, startDateOverrides, endDateOverrides, projectTasks });
            if (currentState !== lastRunState) {
                setNeedsRerun(true);
            } else {
                setNeedsRerun(false);
            }
        }
    }, [params, teamDefs, ptoEntries, teamMemberChanges, workHourOverrides, hybridWorkers, efficiencyData, startDateOverrides, endDateOverrides, projectTasks, lastRunState]);

        // 👇 ADD THIS NEW useEffect HERE 👇
    useEffect(() => {
        const newMin = {};
        const newMax = {};
        teamDefs.headcounts.forEach(team => {
            newMin[team.name] = Math.floor(team.count * 0.5);
            newMax[team.name] = Math.ceil(team.count * 2);
        });
        setMinHeadcount(newMin);
        setMaxHeadcount(newMax);
    }, [teamDefs]);
    // 👆 END NEW useEffect 👆
    
    useEffect(() => {
        const createResizeHandler = (ref, setDimensions) => () => {
            if (ref.current) {
                setDimensions({
                    width: ref.current.clientWidth,
                    height: ref.current.clientHeight,
                });
            }
        };

        const observers = [
            { ref: utilizationChartContainerRef, handler: createResizeHandler(utilizationChartContainerRef, setUtilizationChartDimensions) },
            { ref: workloadChartContainerRef, handler: createResizeHandler(workloadChartContainerRef, setWorkloadChartDimensions) },
            { ref: ganttChartContainerRef, handler: createResizeHandler(ganttChartContainerRef, setGanttChartDimensions) },
        ];

        const resizeObservers = observers.map(({ ref, handler }) => {
            const observer = new ResizeObserver(handler);
            if (ref.current) {
                observer.observe(ref.current);
                handler();
            }
            return observer;
        });

        return () => {
            resizeObservers.forEach(observer => observer.disconnect());
        };
    }, []);

    const addLog = useCallback((message) => {
        setLogs(prev => [...prev, message]);
    }, []);

    const robustCsvParse = useCallback((csvText) => {
        const data = []; const errors = []; const lines = csvText.trim().replace(/\r/g, '').split('\n');
        if (lines.length < 2) return { data: [], errors: [{ message: "CSV has no data rows." }] };
        const splitCsvRow = (rowString) => {
            const fields = []; let i = 0; let field = '';
            while (i < rowString.length) {
                if (rowString[i] === '"') {
                    i++; let startIndex = i;
                    while (i < rowString.length) { if (rowString[i] === '"') { if (i + 1 < rowString.length && rowString[i + 1] === '"') i++; else break; } i++; }
                    field = rowString.substring(startIndex, i).replace(/""/g, '"'); i++;
                } else { let startIndex = i; while (i < rowString.length && rowString[i] !== ',') i++; field = rowString.substring(startIndex, i); }
                fields.push(field); if (i < rowString.length && rowString[i] === ',') i++;
            }
            if (rowString.endsWith(',')) fields.push(''); return fields;
        };
        const header = splitCsvRow(lines[0]).map(h => h.trim());
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i] || !lines[i].trim()) continue; const rowValues = splitCsvRow(lines[i]);
            if (rowValues.length !== header.length) { errors.push({ message: `Row ${i + 1} has incorrect columns (expected ${header.length}, found ${rowValues.length}). Skipping.` }); continue; }
            const rowObject = {};
            for (let j = 0; j < header.length; j++) rowObject[header[j]] = rowValues[j] || '';
            data.push(rowObject);
        }
        return { data, errors };
    }, []);

    useEffect(() => {
        const fetchRemoteData = async () => {
            addLog("Attempting to fetch remote efficiency data...");
            try {
                const response = await fetch(EFFICIENCY_DATA_URL);
                if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
                const csvText = await response.text();
                const results = robustCsvParse(csvText);
                if (results.errors.length > 0) results.errors.forEach(err => addLog(`Parsing Warning (Efficiency CSV): ${err.message}`));
                
                const efficiencyMap = {};
                const nameMap = {};
                results.data.forEach(row => {
                    const memberId = row['TeamMemberNumber'];
                    const memberName = row['TeamMemberName'];
                    const efficiencyString = row['Efficiency'];
                    if (memberId && efficiencyString) {
                        const efficiencyValue = parseFloat(efficiencyString.replace('%', '')) / 100;
                        if (!isNaN(efficiencyValue)) efficiencyMap[memberId] = efficiencyValue;
                    }
                    if (memberId && memberName) nameMap[memberId] = memberName;
                });
                setEfficiencyData(efficiencyMap);
                setTeamMemberNameMap(nameMap);
                addLog(`Successfully loaded ${Object.keys(efficiencyMap).length} efficiency ratings.`);
            } catch (error) {
                setError("Could not load efficiency data. Using defaults.");
                addLog(`Error fetching efficiency data: ${error.message}`);
            }

            addLog("Attempting to fetch remote routing data...");
            try {
                const response = await fetch(ROUTING_DATA_URL);
                if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
                const csvText = await response.text();
                const results = robustCsvParse(csvText);
                if (results.errors.length > 0) results.errors.forEach(err => addLog(`Parsing Warning (Routing CSV): ${err.message}`));

                const requiredCols = ['TemplateName', 'SKU', 'SKU Name', 'Operation', 'Order', 'Estimated Hours', 'Value'];
                const cleanedRoutingData = results.data.map(row => ({
                    ...row,
                    'Estimated Hours': parseFloat(row['Estimated Hours']),
                    'Order': parseInt(row['Order'], 10),
                    'Value': parseFloat(String(row['Value']).replace(/,/g, '')) || 0,
                })).filter(row => requiredCols.every(col => row[col] !== undefined && row[col] !== null && row[col] !== ''));

                setRoutingData(cleanedRoutingData);
                addLog(`Successfully loaded ${[...new Set(cleanedRoutingData.map(r => r.TemplateName))].length} project templates.`);
            } catch (error) {
                setError(prev => `${prev} | Could not load routing data. Project builder will be disabled.`);
                addLog(`Error fetching routing data: ${error.message}`);
            }
        };

        fetchRemoteData();
    }, [addLog, robustCsvParse]);

    const simpleCsvUnparse = (data) => {
        if (!data || data.length === 0) return '';
        const headers = Object.keys(data[0]); const headerRow = headers.join(',');
        const rows = data.map(obj => headers.map(header => {
            let value = obj[header] === null || obj[header] === undefined ? '' : String(obj[header]);
            if (value.includes(',') || value.includes('"')) return `"${value.replace(/"/g, '""')}"`;
            return value;
        }).join(','));
        return [headerRow, ...rows].join('\n');
    }

    const handleTeamHeadcountChange = (id, value) => setTeamDefs({...teamDefs, headcounts: teamDefs.headcounts.map(t => t.id === id ? { ...t, count: parseFloat(value) || 0 } : t)});
    const handleParamChange = (e) => setParams({ ...params, [e.target.name]: e.target.value });
    const handleAddTeamMemberChange = () => setTeamMemberChanges([...teamMemberChanges, {id: Date.now(), name: `NewMember${teamMemberChanges.length+1}`, team: teamDefs.headcounts[0]?.name || '', type: 'Starts', date: formatDate(new Date())}]);
    const handleTeamMemberChangeUpdate = (id, field, value) => setTeamMemberChanges(teamMemberChanges.map(m => m.id === id ? {...m, [field]: value} : m));
    const handleRemoveTeamMemberChange = (id) => setTeamMemberChanges(teamMemberChanges.filter(m => m.id !== id));
    const handleAddHybridWorker = () => setHybridWorkers([...hybridWorkers, { id: Date.now(), name: `Hybrid${hybridWorkers.length+1}`, primaryTeam: 'Carpentry', secondaryTeam: 'Assembly'}]);
    const handleHybridWorkerUpdate = (id, field, value) => setHybridWorkers(hybridWorkers.map(w => w.id === id ? {...w, [field]:value} : w));
    const handleRemoveHybridWorker = (id) => setHybridWorkers(hybridWorkers.filter(w => w.id !== id));
    const handleAddPto = () => setPtoEntries([...ptoEntries, { id: Date.now(), memberName: '', date: formatDate(new Date()) }]);
    const handlePtoUpdate = (id, field, value) => setPtoEntries(ptoEntries.map(p => p.id === id ? { ...p, [field]: value } : p));
    const handleRemovePto = (id) => setPtoEntries(ptoEntries.filter(p => p.id !== id));
    const handleAddWorkHourOverride = () => setWorkHourOverrides([...workHourOverrides, {id: Date.now(), team: teamDefs.headcounts[0]?.name || '', hours: 10, startDate: formatDate(new Date()), endDate: formatDate(new Date())}]);
    const handleWorkHourOverrideUpdate = (id, field, value) => setWorkHourOverrides(workHourOverrides.map(o => o.id === id ? {...o, [field]: value} : o));
    const handleRemoveWorkHourOverride = (id) => setWorkHourOverrides(workHourOverrides.filter(o => o.id !== id));
    const handleStartDateChange = (projectId, newDate) => setStartDateOverrides(prev => ({ ...prev, [projectId]: newDate }));
    const handleEndDateChange = (projectId, newDate) => setEndDateOverrides(prev => ({ ...prev, [projectId]: newDate }));

    const loadAndCleanData = useCallback((data) => {
        addLog("Loading and cleaning project data..."); if(!data || data.length === 0) { addLog("No data provided to clean."); return []; }
        try {
            const renamedCols = { "Game": "Project", "Project": "Project", "Expected Hours": "Estimated Hours", "Labor Time": "Estimated Hours", "Estimated Hours": "Estimated Hours", "Due Date": "DueDate", "Start Date": "StartDate", "Value": "Value", "Store": "Store" };
            const processed = data.map(row => {
                let newRow = {...row}; for (const key in renamedCols) if (row[key]) newRow[renamedCols[key]] = row[key]; return newRow;
            }).map(row => ({...row, 'Estimated Hours': parseFloat(row['Estimated Hours']), 'Order': parseInt(row['Order'], 10), 'DueDate': parseDate(row['DueDate']), 'StartDate': parseDate(row['StartDate']), 'Value': parseFloat(String(row['Value']).replace(/,/g, '')) || 0, 'Store': row['Store'] || 'N/A' }))
            .filter(row => row.Project && row.SKU && row.Store && !isNaN(row['Order']) && row['DueDate'] && row['StartDate'] && !isNaN(row['Estimated Hours']));
            if (processed.length === 0 && data.length > 0) { setError("No valid data rows found after cleaning. Check required columns: Project, SKU, Store, Order, DueDate, StartDate, and Estimated Hours."); addLog("Error: No valid data rows found."); return null; }
            addLog(`Successfully loaded and cleaned ${processed.length} rows.`); return processed;
        } catch (e) { setError(`Error processing data: ${e.message}.`); addLog(`Error processing data: ${e.message}.`); return null; }
    }, [addLog]);

    const handleFileChange = useCallback((e) => {
        const file = e.target.files[0]; if (!file) return;
        setError('');
        const reader = new FileReader();
        reader.onload = (event) => {
            const results = robustCsvParse(event.target.result);
            if (results.errors.length > 0) {
                results.errors.forEach(err => addLog(`Parsing Warning (${file.name}): ${err.message}`));
                setError(`CSV file '${file.name}' has issues.`);
            }

            const cleanedData = loadAndCleanData(results.data);
            if (cleanedData && cleanedData.length > 0) {
                const incomingProjectNames = new Set(cleanedData.map(t => t.Project));
                const existingProjectNames = new Set(builtProjects.map(p => p.name));
                const duplicates = [...incomingProjectNames].filter(name => existingProjectNames.has(name));

                if (duplicates.length > 0) {
                    setError(`Upload failed. The following projects already exist: ${duplicates.join(', ')}. Please remove them or use unique names in your CSV.`);
                    return;
                }

                setProjectTasks(prevTasks => [...prevTasks, ...cleanedData]);
                setProjectFileName(file.name);
                if (results.errors.length === 0) setError('');
            } else if (results.data.length === 0) {
                setError("No valid data could be processed from the project CSV file.");
            }
        };
        reader.onerror = () => setError(`File reading error: ${reader.error}`);
        reader.readAsText(file);
    }, [addLog, builtProjects, loadAndCleanData, robustCsvParse]);

    const handleBuilderChange = (e) => {
        setBuilderState({ ...builderState, [e.target.name]: e.target.value });
    };
    
    const handleTemplateSelectionChange = (templateName) => {
        setBuilderState(prev => {
            const newSelection = new Set(prev.selectedTemplates);
            if (newSelection.has(templateName)) {
                newSelection.delete(templateName);
            } else {
                newSelection.add(templateName);
            }
            return { ...prev, selectedTemplates: Array.from(newSelection) };
        });
    };

    const handleSelectAllTemplates = (e) => {
        if (e.target.checked) {
            setBuilderState(prev => ({ ...prev, selectedTemplates: projectTemplates }));
        } else {
            setBuilderState(prev => ({ ...prev, selectedTemplates: [] }));
        }
    };

    const handleAddProjectFromBuilder = () => {
        const { selectedTemplates, store, startDate, dueDate } = builderState;
        if (selectedTemplates.length === 0 || !store || !startDate || !dueDate) {
            setError("Please select at least one game and fill all fields in the Project Builder.");
            return;
        }

        const newTasks = [];
        const currentProjectNames = new Set(builtProjects.map(p => p.name));

        selectedTemplates.forEach(template => {
            let uniqueName = '';
            do {
                const randomNumber = Math.floor(1000 + Math.random() * 9000);
                uniqueName = `${template} #${randomNumber}`;
            } while (currentProjectNames.has(uniqueName));
            
            currentProjectNames.add(uniqueName);

            const templateTasks = routingData.filter(r => r.TemplateName === template);
            const tasksForProject = templateTasks.map(taskTemplate => ({
                ...taskTemplate,
                Project: uniqueName,
                Store: store,
                StartDate: parseDate(startDate),
                DueDate: parseDate(dueDate),
            }));
            newTasks.push(...tasksForProject);
        });
        
        setProjectTasks(prevTasks => [...prevTasks, ...newTasks]);
        setError('');
        setBuilderState(prev => ({...prev, selectedTemplates: []}));
    };

    const handleRemoveProject = (projectName) => {
        setProjectTasks(prevTasks => prevTasks.filter(task => task.Project !== projectName));
    };
    
    const handleProjectStoreChange = (projectName, newStore) => {
        setProjectTasks(prevTasks =>
            prevTasks.map(task =>
                task.Project === projectName ? { ...task, Store: newStore } : task
            )
        );
    };

const handleClearAllProjects = () => {
        setProjectTasks([]);
        setProjectFileName('');
        setError('');
    };

    // 👇 ADD THESE NEW HANDLER FUNCTIONS HERE 👇
    const handleOptimizationConfigChange = (field, value) => {
        setOptimizationConfig(prev => ({ ...prev, [field]: value }));
    };

    const handleMinHeadcountChange = (team, value) => {
        setMinHeadcount(prev => ({ ...prev, [team]: parseFloat(value) || 0 }));
    };

    const handleMaxHeadcountChange = (team, value) => {
        setMaxHeadcount(prev => ({ ...prev, [team]: parseFloat(value) || 0 }));
    };

    const runResourceOptimizer = async () => {
        if (projectTasks.length === 0) {
            setError("No project data loaded. Use the Project Builder or upload a CSV.");
            return;
        }

        setIsOptimizing(true);
        setOptimizationResults(null);
        setError('');

        const payload = {
            projectTasks: projectTasks.map(t => ({
                ...t,
                StartDate: formatDate(t.StartDate),
                DueDate: formatDate(t.DueDate),
            })),
            params, teamDefs, ptoEntries, teamMemberChanges, workHourOverrides,
            hybridWorkers, efficiencyData, teamMemberNameMap, startDateOverrides, endDateOverrides,
            optimizationConfig: {
                ...optimizationConfig,
                minHeadcount,
                maxHeadcount
            }
        };

        try {
            addLog("Sending data to optimizer...");
            const startResponse = await fetch('https://production-scheduler-backend-aepw.onrender.com/api/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (startResponse.status !== 202) {
                const errorResult = await startResponse.json();
                throw new Error(errorResult.error || 'Failed to start optimization job.');
            }

            const { jobId } = await startResponse.json();
            addLog(`Optimization job started with ID: ${jobId}`);

            const pollInterval = setInterval(async () => {
                try {
                    const statusResponse = await fetch(`https://production-scheduler-backend-aepw.onrender.com/api/schedule/status/${jobId}`);
                    if (!statusResponse.ok) throw new Error(`Status check failed`);
                    
                    const jobStatus = await statusResponse.json();

                    if (jobStatus.status === 'complete') {
                        clearInterval(pollInterval);
                        const results = jobStatus.result;
                        
                        setOptimizationResults(results);
                        setLogs(results.logs || []);
                        
                        if (!results.success) {
                            setError(`Optimization found partial solution. ${results.remainingGaps?.length || 0} projects still miss targets.`);
                        }
                        
                        setIsOptimizing(false);
                    } else if (jobStatus.status === 'error') {
                        clearInterval(pollInterval);
                        throw new Error(jobStatus.error || 'Optimization failed');
                    }
                } catch (pollError) {
                    clearInterval(pollInterval);
                    setError(`Error during optimization: ${pollError.message}`);
                    setIsOptimizing(false);
                }
            }, 2000);

        } catch (e) {
            console.error('Failed to start optimizer:', e);
            setError(`Failed to start optimization: ${e.message}`);
            setIsOptimizing(false);
        }
    };

    const applyOptimizedResources = () => {
        if (!optimizationResults || !optimizationResults.optimizedTeamDefs) return;
        
        setTeamDefs(optimizationResults.optimizedTeamDefs);
        setFinalSchedule(optimizationResults.schedule.finalSchedule || []);
        setSummaryData({
            project: optimizationResults.schedule.projectSummary || [],
            store: []
        });
        setTeamUtilization(optimizationResults.schedule.teamUtilization || []);
        setTeamWorkload(optimizationResults.schedule.teamWorkload || []);
        
        setOptimizationResults(null);
        setError('');
        addLog("Applied optimized resource configuration.");
    };
    // 👆 END NEW HANDLER FUNCTIONS 👆

    const runSchedulingEngine = useCallback(async () => {
        if (projectTasks.length === 0) {
            setError("No project data loaded. Use the Project Builder or upload a CSV.");
            return;
        }
        setIsLoading(true);
        setProgressStep('starting');
        setProgressMessage("Initializing schedule...");
        setSimulationProgress(0);

        // Clear previous results
        setFinalSchedule([]);
        setSummaryData({ project: [], store: [] });
        setTeamUtilization([]);
        setWeeklyOutput([]);
        setDailyCompletions([]);
        setTeamWorkload([]);

        setLogs([]);
        setError('');
        setProjectedCompletion(null);
        setCompletedTasks([]);
        
        const currentState = JSON.stringify({ params, teamDefs, ptoEntries, teamMemberChanges, workHourOverrides, hybridWorkers, efficiencyData, teamMemberNameMap, startDateOverrides, endDateOverrides, projectTasks });
        setLastRunState(currentState);
        setNeedsRerun(false);

        const payload = {
            projectTasks: projectTasks.map(t => ({
                ...t,
                StartDate: formatDate(t.StartDate),
                DueDate: formatDate(t.DueDate),
            })),
            params, teamDefs, ptoEntries, teamMemberChanges, workHourOverrides,
            hybridWorkers, efficiencyData, teamMemberNameMap, startDateOverrides, endDateOverrides
        };

        try {
            addLog("Sending data to scheduling server to start job...");
            const startResponse = await fetch('https://production-scheduler-backend-aepw.onrender.com/api/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (startResponse.status !== 202) {
                const errorResult = await startResponse.json();
                throw new Error(errorResult.error || 'Failed to start scheduling job.');
            }

            const { jobId } = await startResponse.json();
            addLog(`Scheduling job started with ID: ${jobId}`);

            // Start polling for status
            pollingIntervalRef.current = setInterval(async () => {
                try {
                    const statusResponse = await fetch(`https://production-scheduler-backend-aepw.onrender.com/api/schedule/status/${jobId}`);
                    if (!statusResponse.ok) {
                        throw new Error(`Status check failed with status: ${statusResponse.status}`);
                    }
                    const jobStatus = await statusResponse.json();

                    setProgressMessage(jobStatus.message || 'Processing...');
                    setSimulationProgress(jobStatus.progress || 0);
                    setProgressStep(jobStatus.step || 'simulating');

                    if (jobStatus.status === 'complete') {
                        clearInterval(pollingIntervalRef.current);
                        addLog("Job complete. Processing final results.");
                        
                        const results = jobStatus.result;
                        setLogs(results.logs || []);
                        if (results.error) setError(results.error);
                        
                        setFinalSchedule(results.finalSchedule || []);
                        
                        const projectSummaryList = (results.projectSummary || []).map(p => {
                            const effectiveDueDateStr = endDateOverrides[p.Project] || p.DueDate;
                            const effectiveDueDate = parseDate(effectiveDueDateStr);
                            const finishDate = parseDate(p.FinishDate);
                            const diffDays = (effectiveDueDate && finishDate)
                                ? Math.round((effectiveDueDate.getTime() - finishDate.getTime()) / (1000 * 60 * 60 * 24))
                                : 0;
                            return { ...p, OriginalStartDate: p.StartDate, daysVariance: diffDays };
                        }).sort((a,b) => a.Store.localeCompare(b.Store) || a.Project.localeCompare(b.Project));

                        const storeSummaryMap = {};
                        projectSummaryList.forEach(p => {
                            const store = p.Store;
                            const startDate = parseDate(p.StartDate);
                            const finishDate = parseDate(p.FinishDate);
                            const effectiveDueDateStr = endDateOverrides[p.Project] || p.DueDate;
                            const dueDate = parseDate(effectiveDueDateStr);

                            if (!startDate || !finishDate || !dueDate) return;

                            if (!storeSummaryMap[store]) {
                                storeSummaryMap[store] = { Store: store, StartDate: startDate, FinishDate: finishDate, DueDate: dueDate };
                            } else {
                                if (startDate < storeSummaryMap[store].StartDate) storeSummaryMap[store].StartDate = startDate;
                                if (finishDate > storeSummaryMap[store].FinishDate) storeSummaryMap[store].FinishDate = finishDate;
                                if (dueDate > storeSummaryMap[store].DueDate) storeSummaryMap[store].DueDate = dueDate;
                            }
                        });
                        const storeSummaryList = Object.values(storeSummaryMap).map(s => {
                            const diffDays = Math.round((s.DueDate.getTime() - s.FinishDate.getTime()) / (1000 * 60 * 60 * 24));
                            return { ...s, StartDate: formatDate(s.StartDate), FinishDate: formatDate(s.FinishDate), DueDate: formatDate(s.DueDate), daysVariance: diffDays };
                        }).sort((a, b) => a.Store.localeCompare(b.Store));
                        
                        setSummaryData({ project: projectSummaryList, store: storeSummaryList });
                        setTeamUtilization(results.teamUtilization || []);
                        setProjectedCompletion(results.projectedCompletion || null);
                        setWeeklyOutput(results.weeklyOutput || []);
                        setDailyCompletions(results.dailyCompletions || []);
                        setTeamWorkload(results.teamWorkload || []);

                        setCompletedTasks(results.completedTasks || []);
                        
                        setProgressMessage("Schedule complete!");
                        setProgressStep('done');
                        setTimeout(() => setIsLoading(false), 1000);

                    } else if (jobStatus.status === 'error') {
                        clearInterval(pollingIntervalRef.current);
                        throw new Error(jobStatus.error || 'The scheduling job failed on the server.');
                    }
                } catch (pollError) {
                    clearInterval(pollingIntervalRef.current);
                    setError(`Error checking job status: ${pollError.message}`);
                    setIsLoading(false);
                }
            }, 1500);

        } catch (e) {
            console.error('Failed to start scheduling engine:', e);
            setError(`Failed to start scheduling job: ${e.message}`);
            setIsLoading(false);
        }
    }, [projectTasks, params, teamDefs, ptoEntries, teamMemberChanges, workHourOverrides, hybridWorkers, efficiencyData, teamMemberNameMap, addLog, startDateOverrides, endDateOverrides]);

    // --- CONFIGURATION SAVE/LOAD ---
    const handleSaveConfig = () => {
        const config = {
            teamDefs,
            params,
            teamMemberChanges,
            hybridWorkers,
            ptoEntries,
            workHourOverrides,
        };
        const dataStr = JSON.stringify(config, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = 'schedule_config.json';
        link.href = url;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleLoadConfig = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const config = JSON.parse(event.target.result);
                // Basic validation
                if (config.teamDefs && config.params) {
                    // Merge loaded teamDefs with current defaults to preserve new teams (QC, Receiving, etc.)
                    const defaultTeamDefs = createDefaultTeamDefs();

                    // Merge headcounts: keep loaded values, add any missing new teams from defaults
                    const loadedHeadcountNames = new Set(config.teamDefs.headcounts.map(h => h.name));
                    const mergedHeadcounts = [
                        ...config.teamDefs.headcounts,
                        ...defaultTeamDefs.headcounts.filter(h => !loadedHeadcountNames.has(h.name))
                    ];

                    // Merge mappings: keep loaded mappings, add any new mappings from defaults
                    const loadedMappingKeys = new Set(
                        config.teamDefs.mapping.map(m => `${m.team}-${m.operation}`)
                    );
                    const mergedMappings = [
                        ...config.teamDefs.mapping,
                        ...defaultTeamDefs.mapping.filter(
                            m => !loadedMappingKeys.has(`${m.team}-${m.operation}`)
                        )
                    ];

                    // Reassign IDs to ensure uniqueness
                    mergedMappings.forEach((m, idx) => { m.id = idx + 1; });

                    setTeamDefs({
                        headcounts: mergedHeadcounts,
                        mapping: mergedMappings
                    });
                    setParams(config.params);
                    setTeamMemberChanges(config.teamMemberChanges || []);
                    setHybridWorkers(config.hybridWorkers || []);
                    setPtoEntries(config.ptoEntries || []);
                    setWorkHourOverrides(config.workHourOverrides || []);
                    addLog("Configuration loaded successfully. New teams (if any) have been added.");
                    setError('');
                } else {
                    throw new Error("Invalid configuration file structure.");
                }
            } catch (err) {
                console.error("Error loading config:", err);
                setError("Failed to load or parse the configuration file. Please ensure it's a valid JSON config file.");
            }
        };
        reader.onerror = () => setError(`File reading error: ${reader.error}`);
        reader.readAsText(file);
        e.target.value = null; // Reset file input
    };
    
    // --- PROJECT TASKS DOWNLOAD ---
    const handleDownloadProjects = () => {
        if (projectTasks.length === 0) {
            setError("No projects to download.");
            setTimeout(() => setError(''), 3000);
            return;
        }

        const dataToExport = projectTasks.map(task => ({
            "Project": task.Project,
            "Store": task.Store,
            "SKU": task.SKU,
            "SKU Name": task['SKU Name'],
            "Operation": task.Operation,
            "Order": task.Order,
            "Estimated Hours": task['Estimated Hours'],
            "Value": task.Value,
            "LagAfterHours": task.LagAfterHours || 0,
            "AssemblyGroup": task.AssemblyGroup || '',
            "StartDate": formatDate(task.StartDate),
            "DueDate": formatDate(task.DueDate)
        }));
        
        const csv = simpleCsvUnparse(dataToExport);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'project_tasks.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const downloadCSV = (type) => {
        let dataToExport; let filename;
        if (type === 'schedule') {
            if (finalSchedule.length === 0) return;
            dataToExport = finalSchedule.map(row => ({
                Date: row.Date,
                Job: row.Project,
                Store: row.Store,
                SKU: row.SKU,
                'SKU Name': row['SKU Name'],
                Operation: row.Operation,
                Team: row.Team,
                TeamMember: row.TeamMember,
                'Team Member Name': row.TeamMemberName,
                Order: row.Order,
                'Task Hours Completed': row['Task Hours Completed'],
                'Time Spent (Hours)': row['Time Spent (Hours)'],
                DynamicPriority: Number(row.DynamicPriority?.toFixed(2) || 0),
                StartDate: formatDate(row.StartDate),
                DueDate: formatDate(row.DueDate)
            }));
            filename = 'master_daily_work_log.csv';
        } else if (type === 'utilization') {
             if (teamUtilization.length === 0) return;
             dataToExport = teamUtilization.flatMap(week => week.teams.map(team => ({ Week: week.week, Team: team.name, WorkedHours: team.worked, CapacityHours: team.capacity, Utilization: (team.utilization / 100).toFixed(2) })));
             filename = 'weekly_team_utilization.csv';
        } else if (type === 'completions') {
            if (dailyCompletions.length === 0) return;
            dataToExport = dailyCompletions.map(item => ({
                Date: item.Date,
                Job: item.Job,
                Store: item.Store,
                SKU: item.SKU,
                'SKU Name': item['SKU Name'],
                Value: item.Value
            }));
            filename = 'daily_completions_report.csv';
        } else if (type === 'project_summary') {
            if (summaryData.project.length === 0) return;
            dataToExport = [...summaryData.project]
                .sort((a, b) => {
                    const dateA = parseDate(startDateOverrides[a.Project] || a.StartDate);
                    const dateB = parseDate(startDateOverrides[b.Project] || b.StartDate);
                    return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
                })
                .map(row => ({
                    Store: row.Store,
                    Job: row.Project,
                    'Start Date': startDateOverrides[row.Project] || row.StartDate,
                    'Due Date': endDateOverrides[row.Project] || row.DueDate,
                    'Finish Date': row.FinishDate,
                    'Days +/-': row.daysVariance,
                }));
            filename = 'job_schedule_summary.csv';
        } else if (type === 'store_summary') {
            if (summaryData.store.length === 0) return;
            dataToExport = [...summaryData.store]
                .sort((a, b) => {
                    const dateA = parseDate(a.StartDate);
                    const dateB = parseDate(b.StartDate);
                    return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
                })
                .map(row => ({
                    Store: row.Store,
                    'Start Date': row.StartDate,
                    'Due Date': row.DueDate,
                    'Finish Date': row.FinishDate,
                    'Days +/-': row.daysVariance,
                }));
            filename = 'store_schedule_summary.csv';
        } else {
            return;
        }

        const csv = simpleCsvUnparse(dataToExport);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = filename;
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    const downloadSampleCSV = (type) => {
        let headers, rows, filename;
        if (type === 'project') {
            headers = "Project,Store,SKU,SKU Name,Operation,Order,Estimated Hours,Value,StartDate,DueDate";
            rows = [
                "Job-001,Store-A,SKU-01-A,Widget A,Carpentry/Woodwork,1,10,1500.00,2025-07-01,2025-07-15",
                "Job-001,Store-A,SKU-01-A,Widget A,Paint Prep,2,5,1500.00,2025-07-01,2025-07-15",
            ];
            filename = 'sample_project_data.csv';
        } else { 
            headers = "TemplateName,SKU,SKU Name,Operation,Order,Estimated Hours,Value";
            rows = [
                "Standard Widget,WIDGET-STD,Standard Widget,Carpentry/Woodwork,1,10,1500.00",
                "Standard Widget,WIDGET-STD,Standard Widget,Paint Prep,2,5,1500.00",
                "Standard Widget,WIDGET-STD,Standard Widget,Final Assembly,3,8,1500.00",
            ];
            filename = 'sample_routing_data.csv';
        }
        
        const csvContent = [headers, ...rows].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="bg-slate-50 min-h-screen font-sans text-slate-800">
            {isLoading && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm">
                    <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-md">
                        <div className="flex justify-center items-center mb-4">
                            {progressStep === 'checking' && <CheckCircle className="w-8 h-8 text-blue-600 animate-pulse" />}
                            {progressStep === 'preparing' && <Wrench className="w-8 h-8 text-blue-600 animate-spin" />}
                            {progressStep === 'simulating' && <Play className="w-8 h-8 text-blue-600" />}
                            {progressStep === 'finalizing' && <Download className="w-8 h-8 text-blue-600" />}
                            {progressStep === 'done' && <CheckCircle className="w-8 h-8 text-green-600" />}
                        </div>
                        <h3 className="text-xl font-bold mb-4 text-center text-slate-800">Scheduling in Progress...</h3>
                        <p className="text-sm mb-2 text-slate-600 text-center">{progressMessage} ({simulationProgress}%)</p>
                        <div className="w-full bg-slate-200 rounded-full h-4 overflow-hidden">
                           <div className="bg-blue-600 h-4 rounded-full transition-all duration-300" style={{width: `${simulationProgress}%`}}></div>
                        </div>
                    </div>
                </div>
            )}
            <header className="bg-white shadow-md sticky top-0 z-20"><div className="container mx-auto px-4 sm:px-6 lg:px-8"><div className="flex justify-between items-center py-4"><h1 className="text-2xl font-bold text-slate-900">Production Scheduling Engine v2</h1><div className="flex items-center space-x-4">
                <button onClick={handleSaveConfig} className="flex items-center px-4 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 font-semibold"><Save className="w-5 h-5 mr-2" />Save Config</button>
                <button onClick={() => fileInputRef.current.click()} className="flex items-center px-4 py-2 bg-slate-600 text-white rounded-md hover:bg-slate-700 font-semibold"><Upload className="w-5 h-5 mr-2" />Load Config</button>
                <input type="file" ref={fileInputRef} onChange={handleLoadConfig} className="hidden" accept=".json" />
                <div className="relative group"><button disabled={finalSchedule.length === 0 && completedTasks.length === 0} className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed"><Download className="w-5 h-5 mr-2" />Download Reports</button>
            <div className="absolute hidden group-hover:block bg-white text-black rounded-md shadow-lg py-1 w-full z-30">
                <button onClick={() => downloadCSV('schedule')} className="block w-full text-left px-4 py-2 text-sm hover:bg-slate-100">Full Schedule</button>
                <button onClick={() => downloadCSV('utilization')} className="block w-full text-left px-4 py-2 text-sm hover:bg-slate-100">Weekly Utilization</button>
                <button onClick={() => downloadCSV('completions')} className="block w-full text-left px-4 py-2 text-sm hover:bg-slate-100">Daily Completions</button>
                <button onClick={() => downloadCSV('project_summary')} className="block w-full text-left px-4 py-2 text-sm hover:bg-slate-100">Job Schedule Summary</button>
                <button onClick={() => downloadCSV('store_summary')} className="block w-full text-left px-4 py-2 text-sm hover:bg-slate-100">Store Schedule Summary</button>
            </div></div><button onClick={runSchedulingEngine} disabled={isLoading || projectTasks.length === 0} className={`flex items-center px-4 py-2 text-white rounded-md font-semibold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed ${needsRerun ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'}`}>{isLoading ? (<svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>) : (needsRerun ? <RefreshCw className="w-5 h-5 mr-2" /> : <Play className="w-5 h-5 mr-2" />)}{isLoading ? 'Running...' : (needsRerun ? 'Rerun Schedule' : 'Run Schedule')}</button></div></div></div></header>
            <main className="container mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg-col-span-1 flex flex-col space-y-6">
                    
                    <CollapsibleSection title="Project Builder" icon={Wrench} defaultOpen={true}>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div><label className="block text-sm font-medium text-slate-600">Store Name</label><input type="text" name="store" placeholder="e.g., Store-A" value={builderState.store} onChange={handleBuilderChange} className={inputStyles}/></div>
                                <div></div>
                                <div><label className="block text-sm font-medium text-slate-600">Start Date</label><input type="date" name="startDate" value={builderState.startDate} onChange={handleBuilderChange} className={inputStyles}/></div>
                                <div><label className="block text-sm font-medium text-slate-600">Due Date</label><input type="date" name="dueDate" value={builderState.dueDate} onChange={handleBuilderChange} className={inputStyles}/></div>
                            </div>
                            
                            <div className="space-y-2 pt-2">
                                <label className="block text-sm font-medium text-slate-600">Select Games for Store</label>
                                <div className="max-h-40 overflow-y-auto border rounded-md p-2 bg-slate-50">
                                    <div className="flex items-center border-b pb-2 mb-2">
                                        <input type="checkbox" id="select-all" className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            checked={projectTemplates.length > 0 && builderState.selectedTemplates.length === projectTemplates.length}
                                            onChange={handleSelectAllTemplates}
                                        />
                                        <label htmlFor="select-all" className="ml-2 block text-sm font-bold text-slate-800">Select All</label>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        {projectTemplates.map(template => (
                                            <div key={template} className="flex items-center py-1">
                                                <input
                                                    id={template}
                                                    type="checkbox"
                                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                    checked={builderState.selectedTemplates.includes(template)}
                                                    onChange={() => handleTemplateSelectionChange(template)}
                                                />
                                                <label htmlFor={template} className="ml-2 block text-sm text-slate-700">{template}</label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <button onClick={handleAddProjectFromBuilder} disabled={routingData.length === 0} className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold disabled:bg-gray-400">
                                <PlusCircle className="w-5 h-5 mr-2" /> Add Projects to Schedule
                            </button>
                            {routingData.length === 0 && <p className="text-xs text-center text-yellow-600">Loading routing data or none found. Builder is disabled.</p>}
                        </div>
                        <div className="mt-6">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-slate-700">Added Projects ({builtProjects.length})</h3>
                                <div className="flex items-center space-x-2">
                                    {builtProjects.length > 0 && (
                                         <button onClick={handleDownloadProjects} className="flex items-center text-xs font-semibold text-blue-500 hover:text-blue-700">
                                             <Download className="w-4 h-4 mr-1"/> Download
                                        </button>
                                    )}
                                    {builtProjects.length > 0 && (
                                        <button onClick={handleClearAllProjects} className="flex items-center text-xs font-semibold text-red-500 hover:text-red-700">
                                            <XCircle className="w-4 h-4 mr-1"/> Clear All
                                        </button>
                                    )}
                                </div>
                            </div>
                            {builtProjects.length > 0 ? (
                                <ul className="mt-2 space-y-2 max-h-40 overflow-y-auto pr-2">
                                    {builtProjects.map(proj => (
                                        <li key={proj.name} className="flex items-center justify-between bg-slate-100 p-2 rounded-md gap-2">
                                            <span className="font-medium text-sm text-slate-800 flex-shrink truncate" title={proj.name}>{proj.name}</span>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <input
                                                    type="text"
                                                    value={proj.store}
                                                    onChange={(e) => handleProjectStoreChange(proj.name, e.target.value)}
                                                    className={`${smallInputStyles} w-24`}
                                                />
                                                <button onClick={() => handleRemoveProject(proj.name)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4"/></button>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm text-slate-500 mt-2 text-center py-4 bg-slate-50 rounded-md">No projects added yet.</p>
                            )}
                        </div>
                    </CollapsibleSection>
                    <CollapsibleSection title="Resource Optimizer" icon={Lightbulb} defaultOpen={false}>
    <div className="space-y-4">
        <div className="p-3 bg-blue-50 rounded-md border border-blue-200">
            <p className="text-sm text-blue-800">
                <strong>Goal-Seeking Mode:</strong> The optimizer will automatically adjust team sizes to meet your target deadlines within budget constraints.
            </p>
        </div>

        {/* Optimization Goal */}
        <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
                Target Deadline Buffer (days)
            </label>
            <input
                type="number"
                value={optimizationConfig.targetDeadlineBuffer}
                onChange={(e) => handleOptimizationConfigChange('targetDeadlineBuffer', e.target.value)}
                className={inputStyles}
                placeholder="e.g., 3"
            />
            <p className="text-xs text-slate-500 mt-1">
                Projects should finish this many days before their due date
            </p>
        </div>

        {/* Budget Constraint */}
        <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
                Maximum Additional Budget ($)
            </label>
            <input
                type="number"
                value={optimizationConfig.budgetLimit}
                onChange={(e) => handleOptimizationConfigChange('budgetLimit', e.target.value)}
                className={inputStyles}
                placeholder="e.g., 100000"
            />
        </div>

        {/* Cost Parameters */}
        <div className="grid grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                    Base Hourly Rate ($)
                </label>
                <input
                    type="number"
                    value={optimizationConfig.costPerHour}
                    onChange={(e) => handleOptimizationConfigChange('costPerHour', e.target.value)}
                    className={inputStyles}
                />
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">
                    Max Iterations
                </label>
                <input
                    type="number"
                    value={optimizationConfig.maxIterations}
                    onChange={(e) => handleOptimizationConfigChange('maxIterations', e.target.value)}
                    className={inputStyles}
                />
            </div>
        </div>

        {/* Team Constraints */}
        <div>
            <h3 className="font-bold text-slate-700 mb-2">Team Size Constraints</h3>
            <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                {teamDefs.headcounts.map((team) => (
                    <div key={team.id} className="grid grid-cols-[120px_1fr_1fr] gap-2 items-center">
                        <span className="text-sm font-medium text-slate-700">{team.name}</span>
                        <input
                            type="number"
                            step="0.5"
                            value={minHeadcount[team.name] || 0}
                            onChange={(e) => handleMinHeadcountChange(team.name, e.target.value)}
                            className={`${smallInputStyles} text-center`}
                            placeholder="Min"
                        />
                        <input
                            type="number"
                            step="0.5"
                            value={maxHeadcount[team.name] || 0}
                            onChange={(e) => handleMaxHeadcountChange(team.name, e.target.value)}
                            className={`${smallInputStyles} text-center`}
                            placeholder="Max"
                        />
                    </div>
                ))}
            </div>
        </div>

        {/* Allowed Adjustments */}
        <div>
            <h3 className="font-bold text-slate-700 mb-2">Allowed Adjustments</h3>
            <label className="flex items-center text-sm">
                <input
                    type="checkbox"
                    checked={optimizationConfig.allowHiring}
                    onChange={(e) => handleOptimizationConfigChange('allowHiring', e.target.checked)}
                    className="mr-2"
                />
                Allow hiring permanent staff
            </label>
        </div>

        {/* Run Optimizer Button */}
        <button
            onClick={runResourceOptimizer}
            disabled={isOptimizing || projectTasks.length === 0}
            className="w-full flex items-center justify-center px-4 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 font-semibold disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
            {isOptimizing ? (
                <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Optimizing...
                </>
            ) : (
                <>
                    <Lightbulb className="w-5 h-5 mr-2" />
                    Find Optimal Resources
                </>
            )}
        </button>

        {/* Results Display */}
        {optimizationResults && (
            <div className={`mt-4 p-4 rounded-lg border-2 ${optimizationResults.success ? 'bg-green-50 border-green-500' : 'bg-yellow-50 border-yellow-500'}`}>
                <h3 className={`font-bold text-lg mb-3 ${optimizationResults.success ? 'text-green-800' : 'text-yellow-800'}`}>
                    {optimizationResults.success 
                        ? "✓ Solution Found!" 
                        : "⚠ Partial Solution Found"}
                </h3>

                {optimizationResults.changes && optimizationResults.changes.length > 0 && (
                    <div className="mb-3">
                        <h4 className="font-semibold text-slate-800 mb-2">Recommended Changes:</h4>
                        <div className="space-y-2">
                            {optimizationResults.changes.map((change, idx) => (
                                <div key={idx} className="text-sm bg-white p-3 rounded border">
                                    <div className="font-medium text-slate-800">
                                        • {change.description}
                                    </div>
                                    <div className="text-slate-600 text-xs mt-1">
                                        Cost: ${change.cost.toLocaleString()} | {change.estimatedImpact}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mt-3 pt-3 border-t border-slate-300">
                    <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                        <div>
                            <span className="text-slate-600">Total Additional Cost:</span>
                            <div className="font-bold text-lg text-slate-800">
                                ${optimizationResults.totalCost?.toLocaleString() || '0'}
                            </div>
                        </div>
                        <div>
                            <span className="text-slate-600">Iterations:</span>
                            <div className="font-bold text-lg text-slate-800">
                                {optimizationResults.iterations || 0}
                            </div>
                        </div>
                    </div>
                    
                    {!optimizationResults.success && optimizationResults.remainingGaps && (
                        <div className="text-sm text-yellow-700 mb-3">
                            {optimizationResults.remainingGaps.length} projects still miss target deadline
                        </div>
                    )}

                    <button
                        onClick={applyOptimizedResources}
                        className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-semibold"
                    >
                        Apply These Changes & View Schedule
                    </button>
                </div>
            </div>
        )}
    </div>
</CollapsibleSection>
                    <CollapsibleSection title="Add Projects from File" defaultOpen={false}>
                        <div className="space-y-4">
                            <p className="text-xs text-center text-slate-500">Use this to add unique projects (e.g., renovations) from a CSV file. This will append to, not replace, the projects added above.</p>
                            <div>
                                <label htmlFor="project-file-upload" className="w-full flex items-center justify-center px-4 py-6 bg-slate-100 text-slate-600 rounded-lg border-2 border-dashed border-slate-300 cursor-pointer hover:bg-slate-200 hover:border-slate-400">
                                    <Upload className="w-8 h-8 mr-3" />
                                    <span className="text-center font-medium">{projectFileName ? `Added: ${projectFileName}` : 'Upload Project CSV'}</span>
                                </label>
                                <input id="project-file-upload" type="file" className="hidden" accept=".csv" onChange={handleFileChange} />
                            </div>
                             <button onClick={() => downloadSampleCSV('project')} className="w-full flex items-center justify-center px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-semibold">
                                <Download className="w-5 h-5 mr-2" />
                                Download Sample Project CSV
                            </button>
                             <button onClick={() => downloadSampleCSV('routing')} className="w-full flex items-center justify-center px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-semibold">
                                <Download className="w-5 h-5 mr-2" />
                                Download Sample Routing CSV
                            </button>
                        </div>
                        {error && <div className="mt-3 text-red-600 bg-red-100 p-3 rounded-md">{error}</div>}
                    </CollapsibleSection>

                    <CollapsibleSection title="Scheduling Parameters" defaultOpen={false}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-slate-600">Start Date</label><input type="date" name="startDate" value={params.startDate} onChange={handleParamChange} className={inputStyles}/></div><div><label className="block text-sm font-medium text-slate-600">Hours per Day</label><input type="number" name="hoursPerDay" value={params.hoursPerDay} onChange={handleParamChange} className={inputStyles}/></div><div><label className="block text-sm font-medium text-slate-600">Productivity Assumption</label><input type="number" step="0.01" name="productivityAssumption" value={params.productivityAssumption} onChange={handleParamChange} className={inputStyles}/></div><div className="sm:col-span-2"><label className="block text-sm font-medium text-slate-600">Teams to Ignore (comma-separated)</label><input type="text" name="teamsToIgnore" value={params.teamsToIgnore} onChange={handleParamChange} placeholder="e.g., Unassigned, Print" className={inputStyles}/></div><div>
            <label className="block text-sm font-medium text-slate-600">Global Buffer (%)</label>
            <input
                type="number"
                name="globalBuffer"
                value={params.globalBuffer}
                onChange={handleParamChange}
                className={inputStyles}
                placeholder="e.g., 15"
            />
            <p className="text-xs text-slate-500 mt-1">Adds sit time after every task</p>
        </div></div>
                    </CollapsibleSection>

                    <CollapsibleSection title="Time Off" defaultOpen={false}>
                        <div className="space-y-4"><div><label className="block text-sm font-medium text-slate-600">Holidays (YYYY-MM-DD, ...)</label><textarea name="holidays" value={params.holidays} onChange={handleParamChange} className={`${inputStyles} h-16`}/></div>
                        <div className="flex flex-col"><label className="block text-sm font-medium text-slate-600">Individual PTO</label><div className="space-y-2 mt-1 pr-1 max-h-28 overflow-y-auto">{ptoEntries.map(p=>(<div key={p.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2"><input type="text" placeholder="Member Name" value={p.memberName} onChange={e=>handlePtoUpdate(p.id, 'memberName', e.target.value)} className={smallInputStyles} /><input type="date" value={p.date} onChange={e=>handlePtoUpdate(p.id, 'date', e.target.value)} className={smallInputStyles} /><button onClick={()=>handleRemovePto(p.id)} className="text-red-500 hover:text-red-700 shrink-0"><Trash2 className="w-5 h-5"/></button></div>))}</div><button onClick={handleAddPto} className="mt-2 flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"><PlusCircle className="w-4 h-4 mr-1"/> Add PTO Day</button></div>
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="Initial Team Roster" defaultOpen={false}>
                        <div className="space-y-2 pr-2">{teamDefs.headcounts.map((team) => (<div key={team.id} className="flex items-center space-x-2">
                            <span className="font-medium text-slate-700">{team.name}</span>
                            <svg className="flex-grow h-px text-slate-300" viewBox="0 0 100 1"><line x1="0" y1="0" x2="100" y2="0" stroke="currentColor" strokeWidth="2" strokeDasharray="2 2" /></svg>
                            <input type="number" step="0.1" value={team.count} onChange={(e) => handleTeamHeadcountChange(team.id, e.target.value)} className={`${smallInputStyles} w-20`}/>
                        </div>))}</div>
                    </CollapsibleSection>

                    <CollapsibleSection title="Hybrid Workers" defaultOpen={false}>
                        <div className="space-y-2 overflow-y-auto">{hybridWorkers.map(w => (<div key={w.id} className="grid grid-cols-1 md:grid-cols-2 gap-2 items-center"><input type="text" placeholder="Hybrid Worker Name" value={w.name} onChange={e=>handleHybridWorkerUpdate(w.id, 'name', e.target.value)} className={smallInputStyles} /><div><select value={w.primaryTeam} onChange={e=>handleHybridWorkerUpdate(w.id, 'primaryTeam', e.target.value)} className={smallInputStyles}>{teamDefs.headcounts.map(t=><option key={t.id} value={t.name}>Primary: {t.name}</option>)}</select></div><div><select value={w.secondaryTeam} onChange={e=>handleHybridWorkerUpdate(w.id, 'secondaryTeam', e.target.value)} className={smallInputStyles}>{teamDefs.headcounts.map(t=><option key={t.id} value={t.name}>Secondary: {t.name}</option>)}</select></div><div className="flex justify-end"><button onClick={()=>handleRemoveHybridWorker(w.id)} className="text-red-500 hover:text-red-700 shrink-0"><Trash2 className="w-5 h-5"/></button></div></div>))}</div><button onClick={handleAddHybridWorker} className="mt-3 flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"><GitMerge className="w-4 h-4 mr-1"/> Add Hybrid Worker</button>
                    </CollapsibleSection>

                    <CollapsibleSection title="Team Roster Changes" defaultOpen={false}>
                        <div className="space-y-2 overflow-y-auto">{teamMemberChanges.map(change => (<div key={change.id} className="grid grid-cols-1 md:grid-cols-2 gap-2 items-center"><select value={change.type} onChange={e => handleTeamMemberChangeUpdate(change.id, 'type', e.target.value)} className={smallInputStyles}><option>Starts</option><option>Leaves</option></select><input type="text" placeholder="Member Name" value={change.name} onChange={e => handleTeamMemberChangeUpdate(change.id, 'name', e.target.value)} className={smallInputStyles} /><div><select value={change.team} onChange={e => handleTeamMemberChangeUpdate(change.id, 'team', e.target.value)} className={smallInputStyles}>{teamDefs.headcounts.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select></div><div className="flex items-center gap-2"><input type="date" value={change.date} onChange={e => handleTeamMemberChangeUpdate(change.id, 'date', e.target.value)} className={smallInputStyles} /><button onClick={() => handleRemoveTeamMemberChange(change.id)} className="text-red-500 hover:text-red-700 shrink-0"><Trash2 className="w-5 h-5"/></button></div></div>))}</div><button onClick={handleAddTeamMemberChange} className="mt-3 flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"><UserPlus className="w-4 h-4 mr-1"/> Add Roster Change</button>
                    </CollapsibleSection>

                    <CollapsibleSection title="Work Hour Overrides" defaultOpen={false}>
                        <div className="space-y-2 overflow-y-auto">{workHourOverrides.map(o => (<div key={o.id} className="grid grid-cols-1 md:grid-cols-2 gap-2 items-center"><select value={o.team} onChange={e => handleWorkHourOverrideUpdate(o.id, 'team', e.target.value)} className={smallInputStyles}>{teamDefs.headcounts.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select><div className="flex items-center gap-1"><input type="number" placeholder="Hrs/Day" value={o.hours} onChange={e => handleWorkHourOverrideUpdate(o.id, 'hours', e.target.value)} className={smallInputStyles} /><span className="text-xs text-slate-500">hrs</span></div><input type="date" value={o.startDate} onChange={e => handleWorkHourOverrideUpdate(o.id, 'startDate', e.target.value)} className={smallInputStyles} /><div className="flex items-center gap-2"><input type="date" value={o.endDate} onChange={e => handleWorkHourOverrideUpdate(o.id, 'endDate', e.target.value)} className={smallInputStyles} /><button onClick={() => handleRemoveWorkHourOverride(o.id)} className="text-red-500 hover:text-red-700 shrink-0"><Trash2 className="w-5 h-5"/></button></div></div>))}</div><button onClick={handleAddWorkHourOverride} className="mt-3 flex items-center text-sm font-medium text-blue-600 hover:text-blue-800"><Clock className="w-4 h-4 mr-1"/> Add Override</button>
                    </CollapsibleSection>
                </div>

                <div className="lg:col-span-2 flex flex-col space-y-6">
                    <CollapsibleSection title="Project Timeline" icon={Trello} defaultOpen={true}>
                        <div className="mb-4 px-1">
                            <label htmlFor="gantt-filter" className="block text-sm font-medium text-slate-600 mb-1">Filter by Job Name or Store</label>
                            <input
                                type="text"
                                id="gantt-filter"
                                value={ganttFilter}
                                onChange={(e) => setGanttFilter(e.target.value)}
                                placeholder="e.g., Prison Break, Store-A..."
                                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-slate-100 text-sm p-2"
                            />
                        </div>
                        <div ref={ganttChartContainerRef} className="flex-grow min-h-[24rem] relative">
                            {filteredProjects.length > 0 ? (
                                <ProjectGanttChartComponent
                                    projects={filteredProjects}
                                    width={ganttChartDimensions.width}
                                    height={ganttChartDimensions.height}
                                    onDateChange={handleStartDateChange}
                                    onEndDateChange={handleEndDateChange}
                                    startDateOverrides={startDateOverrides}
                                    endDateOverrides={endDateOverrides}
                                />
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-500">
                                    <p>{summaryData.project.length > 0 ? 'No jobs match your filter.' : 'Run the schedule to see the project timeline.'}</p>
                                </div>
                            )}
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="Job Schedule Summary" icon={Briefcase} defaultOpen={false}>
                        <div className="flex justify-end mb-4">
                            <div className="flex items-center rounded-lg bg-slate-100 p-1">
                                <button onClick={() => setSummaryView('project')} className={`px-3 py-1 text-sm font-semibold rounded-md flex items-center ${summaryView === 'project' ? 'bg-white shadow text-blue-600' : 'text-slate-600 hover:bg-slate-200'}`}><Briefcase className="w-4 h-4 mr-2"/>Job View</button>
                                <button onClick={() => setSummaryView('store')} className={`px-3 py-1 text-sm font-semibold rounded-md flex items-center ${summaryView === 'store' ? 'bg-white shadow text-blue-600' : 'text-slate-600 hover:bg-slate-200'}`}><Building className="w-4 h-4 mr-2"/>Store View</button>
                            </div>
                        </div>
                        <div className="overflow-auto relative max-h-96">
                            {summaryData[summaryView].length > 0 ? (
                                <>
                                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                                        <thead className="bg-slate-50 sticky top-0">
                                            <tr>
                                                {summaryView === 'project' ? (
                                                    <>
                                                        <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Store</th>
                                                        <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Job</th>
                                                    </>
                                                ) : (
                                                    <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Store</th>
                                                )}
                                                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Start Date</th>
                                                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Due Date</th>
                                                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Finish Date</th>
                                                <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Days +/-</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-slate-200">
                                            {summaryData[summaryView].map((row) => (
                                                <tr key={summaryView === 'project' ? row.Project : row.Store} className="hover:bg-slate-50">
                                                    {summaryView === 'project' ? (
                                                        <>
                                                            <td className="px-3 py-2 whitespace-nowrap">{row.Store}</td>
                                                            <td className="px-3 py-2 whitespace-nowrap font-medium">{row.Project}</td>
                                                        </>
                                                    ) : (
                                                        <td className="px-3 py-2 whitespace-nowrap font-medium">{row.Store}</td>
                                                    )}
                                                    <td className="px-3 py-2 whitespace-nowrap">
                                                        {summaryView === 'project' ? (
                                                            <input
                                                                type="date"
                                                                value={startDateOverrides[row.Project] || row.StartDate}
                                                                onChange={(e) => handleStartDateChange(row.Project, e.target.value)}
                                                                className="p-1 rounded-md border-gray-300 bg-slate-50 focus:ring-blue-500 focus:border-blue-500"
                                                            />
                                                        ) : (
                                                            row.StartDate
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-2 whitespace-nowrap">
                                                        {summaryView === 'project' ? (
                                                            <input
                                                                type="date"
                                                                value={endDateOverrides[row.Project] || row.DueDate}
                                                                onChange={(e) => handleEndDateChange(row.Project, e.target.value)}
                                                                className="p-1 rounded-md border-gray-300 bg-slate-50 focus:ring-blue-500 focus:border-blue-500"
                                                            />
                                                        ) : (
                                                            row.DueDate
                                                        )}
                                                    </td>
                                                    <td className={`px-3 py-2 whitespace-nowrap font-semibold ${row.daysVariance < 0 ? 'text-red-600' : 'text-green-600'}`}>{row.FinishDate}</td>
                                                    <td className={`px-3 py-2 whitespace-nowrap font-semibold ${row.daysVariance < 0 ? 'text-red-600' : 'text-green-600'}`}>{row.daysVariance >= 0 ? `+${row.daysVariance}` : row.daysVariance}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </>
                            ) : (
                                <div className="h-40 flex items-center justify-center text-slate-500">
                                    <p>Upload data and run the schedule to see results here.</p>
                                </div>
                            )}
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="Weekly Output" icon={DollarSign} defaultOpen={false}>
                        <div className="overflow-auto relative max-h-64">
                            {weeklyOutput.length > 0 ? (
                                <table className="min-w-full divide-y divide-slate-200 text-sm">
                                    <thead className="bg-slate-50 sticky top-0">
                                        <tr>
                                            <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Week Start</th>
                                            <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Total Paid Hours</th>
                                            <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Completed Value</th>
                                            <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Value / Paid Hour</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-slate-200">
                                        {weeklyOutput.map(({ week, totalValue, totalHoursWorked, valuePerHour }) => (
                                            <tr key={week} className="hover:bg-slate-50">
                                                <td className="px-3 py-2 whitespace-nowrap font-medium">{week}</td>
                                                <td className="px-3 py-2 whitespace-nowrap text-slate-600">{totalHoursWorked.toFixed(1)}</td>
                                                <td className="px-3 py-2 whitespace-nowrap font-semibold text-green-700">
                                                    {totalValue.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                                </td>
                                                <td className="px-3 py-2 whitespace-nowrap font-semibold text-blue-700">
                                                    {valuePerHour.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="h-40 flex items-center justify-center text-slate-500">
                                    <p>Run the schedule to see weekly output values.</p>
                                </div>
                            )}
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="Team Workload Ratio" icon={Clock} defaultOpen={true}>
                        <div ref={workloadChartContainerRef} className="flex-grow min-h-[24rem] relative">
                            {teamWorkload.length > 0 ? (
                                <TeamWorkloadChartComponent
                                    data={(() => {
                                        let lastActiveIndex = 0;
                                        teamWorkload.forEach((week, i) => {
                                            if (week.teams.some(t => t.workloadRatio > 0)) lastActiveIndex = i;
                                        });
                                        return teamWorkload.slice(0, lastActiveIndex + 1);
                                    })()}
                                    teams={teamDefs.headcounts}
                                    width={workloadChartDimensions.width}
                                    height={workloadChartDimensions.height}
                                />
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-500">
                                    <p>Run the schedule to see team workload data.</p>
                                </div>
                            )}
                        </div>
                    </CollapsibleSection>

                    <CollapsibleSection title="Weekly Team Utilization" icon={Users} defaultOpen={true}>
                        <div className="flex justify-end mb-4">
                            <div className="flex items-center space-x-2"><button onClick={()=>setUtilizationView('bar')} className={`p-1 rounded-md ${utilizationView === 'bar' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}><BarChart className="w-5 h-5" /></button><button onClick={()=>setUtilizationView('line')} className={`p-1 rounded-md ${utilizationView === 'line' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}><LineChart className="w-5 h-5" /></button></div>
                        </div>
                        <div ref={utilizationChartContainerRef} className="flex-grow min-h-[24rem] relative">
                            {teamUtilization.length > 0 ? (utilizationView === 'bar' ? (<div className="space-y-4 pr-2 overflow-y-auto absolute inset-0">{teamUtilization.map(({ week, teams }) => (<div key={week}><h4 className="font-semibold text-slate-600">Week of {week}</h4><div className="mt-2 space-y-2">{teams.map(team => {
                                const utilForDisplay = team.utilization;
                                const effectiveCapacity = parseFloat(team.capacity) * params.productivityAssumption;
                                const utilForColoring = Math.round(effectiveCapacity > 0 ? (parseFloat(team.worked) / effectiveCapacity) * 100 : 0);
                                const utilColor = utilForColoring < 30 ? 'bg-red-500' : utilForColoring <= 50 ? 'bg-yellow-500' : 'bg-green-500';

                                return (<div key={team.name}><div className="flex justify-between text-xs mb-1"><span className="font-medium text-slate-700">{team.name}</span><span className="text-slate-500">{utilForDisplay}% ({team.worked} / {team.capacity} hrs)</span></div><div className="w-full bg-slate-200 rounded-full h-3">
                                {team.name === 'Hybrid' && team.breakdown && parseFloat(team.worked) > 0 ? (
                                    <div className="flex h-3 rounded-full overflow-hidden" style={{ width: `${utilForDisplay}%` }}>
                                        {Object.entries(team.breakdown)
                                            .sort(([teamA], [teamB]) => TEAM_SORT_ORDER.indexOf(teamA) - TEAM_SORT_ORDER.indexOf(teamB))
                                            .map(([breakdownTeam, hours]) => (
                                                <div
                                                    key={breakdownTeam}
                                                    className="h-full"
                                                    style={{
                                                        width: `${(hours / team.worked) * 100}%`,
                                                        backgroundColor: teamColorMap[breakdownTeam] || '#94a3b8'
                                                    }}
                                                    title={`${breakdownTeam}: ${Number(hours).toFixed(1)} hrs (${Math.round((hours/team.worked)*100)}%)`}>
                                                </div>
                                            ))}
                                    </div>
                                ) : (
                                    <div className={`${utilColor} h-3 rounded-full`} style={{ width: `${utilForDisplay}%` }}></div>
                                )}
                                </div></div>);})}</div></div>))}</div>) : <UtilizationLineChartComponent data={teamUtilization} teams={[...teamDefs.headcounts, ...teamMemberChanges.map(c => ({name: c.team})), ...(teamUtilization.some(w => w.teams.some(t => t.name === 'Hybrid')) ? [{name: 'Hybrid'}] : [])]} width={utilizationChartDimensions.width} height={utilizationChartDimensions.height} />) : <div className="h-full flex items-center justify-center text-slate-500"><p>Run the schedule to see team utilization.</p></div>}
                        </div>
                    </CollapsibleSection>
                    <div className="bg-white p-5 rounded-lg shadow"><div className="flex justify-between items-center border-b pb-2"><h2 className="text-xl font-bold">Logs</h2><button onClick={() => setIsLogsVisible(!isLogsVisible)} className="text-sm text-blue-600 font-semibold hover:text-blue-800 flex items-center">{isLogsVisible ? 'Hide Logs' : 'Show Logs'}{isLogsVisible ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}</button></div>{isLogsVisible && (<div className="mt-4 h-64 flex-grow overflow-y-auto bg-slate-900 text-slate-200 rounded-md p-3 font-mono text-xs">{logs.length > 0 ? logs.map((log, i) => (<p key={i} className={log.startsWith('Warning') || log.startsWith('Error') || log.startsWith('Parsing Warning') || log.includes('could not be scheduled') || log.startsWith('  -') ? 'text-yellow-400' : 'text-green-400'}><span className="text-slate-500 mr-2">{`[${i+1}]`}</span> {log}</p>)) : <p className="text-slate-400">No logs to display yet.</p>}</div>)}</div>
                </div>
            </main>
        </div>
    );
}

// --- Gantt Chart Component (FIXED) ---
function ProjectGanttChartComponent({ projects, width, height, onDateChange, onEndDateChange, startDateOverrides, endDateOverrides }) {
    const [dragState, setDragState] = useState(null);
    const svgRef = useRef(null);

    const margin = { top: 20, right: 20, bottom: 20, left: 150 };

    // Memoize the date range calculation for performance and correctness.
    // This is the primary fix: it filters out invalid dates before calculating min/max.
    const { minDate, maxDate } = useMemo(() => {
        if (!projects || projects.length === 0) return { minDate: null, maxDate: null };

        const validTimestamps = projects.flatMap(p => [
            parseDate(p.OriginalStartDate),
            parseDate(p.DueDate),
            parseDate(startDateOverrides[p.Project] || p.StartDate),
            parseDate(endDateOverrides[p.Project] || p.FinishDate)
        ]).filter(d => d instanceof Date && !isNaN(d.getTime())).map(d => d.getTime());

        if (validTimestamps.length === 0) return { minDate: null, maxDate: null };

        const min = new Date(Math.min(...validTimestamps));
        const max = new Date(Math.max(...validTimestamps));
        
        min.setDate(min.getDate() - 7);
        max.setDate(max.getDate() + 7);

        return { minDate: min, maxDate: max };
    }, [projects, startDateOverrides, endDateOverrides]);

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!dragState || !minDate || !maxDate || width <= 0) return;

            // Use the memoized and valid minDate/maxDate for calculations
            const totalDays = (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);
            if (totalDays <= 0) return;

            const chartWidth = width - margin.left - margin.right;
            const pixelsPerDay = chartWidth / totalDays;
            
            const deltaX = e.clientX - dragState.startX;
            const dayDelta = Math.round(deltaX / pixelsPerDay);

            let newVisualStart = new Date(dragState.initialStartDate);
            let newVisualFinish = new Date(dragState.initialFinishDate);

            if (dragState.type === 'move') {
                newVisualStart = addDays(dragState.initialStartDate, dayDelta);
                const duration = dragState.initialFinishDate.getTime() - dragState.initialStartDate.getTime();
                newVisualFinish = new Date(newVisualStart.getTime() + duration);
            } else if (dragState.type === 'resize-end') {
                newVisualFinish = addDays(dragState.initialFinishDate, dayDelta);
                if (newVisualFinish <= newVisualStart) {
                    newVisualFinish = addDays(newVisualStart, 1);
                }
            } else if (dragState.type === 'resize-start') {
                newVisualStart = addDays(dragState.initialStartDate, dayDelta);
                if (newVisualStart >= newVisualFinish) {
                    newVisualStart = addDays(newVisualFinish, -1);
                }
            }

            setDragState(prev => ({
                ...prev,
                visualStartDate: newVisualStart,
                visualFinishDate: newVisualFinish,
            }));
        };

        const handleMouseUp = () => {
            if (!dragState) return;

            if (dragState.type === 'move') {
                if (formatDate(dragState.visualStartDate) !== formatDate(dragState.initialStartDate)) {
                    onDateChange(dragState.project.Project, formatDate(dragState.visualStartDate));
                    const duration = dragState.initialFinishDate.getTime() - dragState.initialStartDate.getTime();
                    const newEndDate = new Date(dragState.visualStartDate.getTime() + duration);
                    onEndDateChange(dragState.project.Project, formatDate(newEndDate));
                }
            } else if (dragState.type === 'resize-start') {
                if (formatDate(dragState.visualStartDate) !== formatDate(dragState.initialStartDate)) {
                    onDateChange(dragState.project.Project, formatDate(dragState.visualStartDate));
                }
            } else if (dragState.type === 'resize-end') {
                if (formatDate(dragState.visualFinishDate) !== formatDate(dragState.initialFinishDate)) {
                    onEndDateChange(dragState.project.Project, formatDate(dragState.visualFinishDate));
                }
            }
            setDragState(null);
        };

        if (dragState) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = dragState.type === 'move' ? 'grabbing' : 'ew-resize';
        } else {
            document.body.style.cursor = 'default';
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragState, onDateChange, onEndDateChange, width, minDate, maxDate, margin.left, margin.right]);

    if (!projects || projects.length === 0 || width <= 0 || !minDate || !maxDate) {
        return null;
    }

    const barHeight = 35;
    const barPadding = 15;
    const chartHeight = projects.length * (barHeight + barPadding) + margin.top + margin.bottom;
    
    const totalDays = (maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);
    const chartWidth = width - margin.left - margin.right;
    const pixelsPerDay = chartWidth / totalDays;

    const getX = (date) => {
        const dateObj = date instanceof Date ? date : parseDate(date);
        if (!dateObj || isNaN(dateObj.getTime())) return 0;
        const daysFromStart = (dateObj.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24);
        return margin.left + daysFromStart * pixelsPerDay;
    };

    const handleMouseDown = (e, project, type) => {
        e.preventDefault();
        e.stopPropagation();

        const initialStartDate = parseDate(startDateOverrides[project.Project] || project.OriginalStartDate);
        const initialFinishDate = parseDate(endDateOverrides[project.Project] || project.DueDate);

        if (!initialStartDate || !initialFinishDate) return; // Don't start drag if dates are invalid

        setDragState({
            type,
            project,
            startX: e.clientX,
            initialStartDate,
            initialFinishDate,
            visualStartDate: initialStartDate,
            visualFinishDate: initialFinishDate,
        });
    };

    const monthTicks = [];
    let currentDate = new Date(minDate);
    currentDate.setDate(1);
    while (currentDate <= maxDate) {
        monthTicks.push(new Date(currentDate));
        currentDate.setMonth(currentDate.getMonth() + 1);
    }

    return (
        <div className="w-full overflow-x-auto">
            <svg ref={svgRef} width={width} height={chartHeight} className="font-sans">
                <g className="grid-lines">
                    {monthTicks.map((tickDate, i) => (
                        <g key={i} transform={`translate(${getX(tickDate)}, 0)`}>
                            <line y1={margin.top - 10} y2={chartHeight - margin.bottom} className="stroke-slate-200" />
                            <text y={margin.top - 5} textAnchor="middle" className="text-xs fill-slate-500">
                                {tickDate.toLocaleString('default', { month: 'short' })} '{tickDate.getFullYear().toString().slice(-2)}
                            </text>
                        </g>
                    ))}
                </g>

                {projects.map((p, i) => {
                    const isInteracting = dragState?.project.Project === p.Project;
                    
                    const planStartDate = parseDate(startDateOverrides[p.Project] || p.OriginalStartDate);
                    const planDueDate = parseDate(endDateOverrides[p.Project] || p.DueDate);
                    
                    const actualStartDate = parseDate(p.StartDate);
                    const actualFinishDate = parseDate(p.FinishDate);

                    if (!planStartDate || !planDueDate) return null; // Don't render bar if plan dates are invalid

                    const visualPlanStartDate = isInteracting ? dragState.visualStartDate : planStartDate;
                    const visualPlanDueDate = isInteracting ? dragState.visualFinishDate : planDueDate;
                    
                    const planStartX = getX(visualPlanStartDate);
                    const planFinishX = getX(visualPlanDueDate);
                    const planBarWidth = Math.max(2, planFinishX - planStartX);
                    
                    const actualStartX = getX(actualStartDate);
                    const actualFinishX = getX(actualFinishDate);
                    const actualBarWidth = (actualStartDate && actualFinishDate) ? Math.max(0, actualFinishX - actualStartX) : 0;
                    
                    const y = margin.top + i * (barHeight + barPadding);
                    const isLate = actualFinishDate && planDueDate && actualFinishDate > planDueDate;
                    
                    const planDateLabel = `${formatDateForGantt(visualPlanStartDate)} - ${formatDateForGantt(visualPlanDueDate)}`;
                    const textWidthEstimate = planDateLabel.length * 5;
                    const handleWidth = 8;

                    return (
                        <g key={p.Project} className="group">
                            <title>{`Project: ${p.Project}\nStore: ${p.Store}\n\nPlan: ${formatDate(planStartDate)} to ${formatDate(planDueDate)}\nActual: ${p.StartDate} to ${p.FinishDate}`}</title>
                            <text x={margin.left - 10} y={y + barHeight / 2 - 2} textAnchor="end" className="text-xs fill-slate-800 font-bold pointer-events-none">
                                {p.Project}
                            </text>
                            <text x={margin.left - 10} y={y + barHeight / 2 + 12} textAnchor="end" className="text-[10px] fill-slate-500 pointer-events-none">
                                {p.Store}
                            </text>
                            <rect
                                x={planStartX}
                                y={y}
                                width={planBarWidth}
                                height={barHeight}
                                onMouseDown={(e) => handleMouseDown(e, p, 'move')}
                                className={`fill-slate-300 ${isInteracting ? 'opacity-60' : 'group-hover:fill-slate-400'} cursor-grab`}
                                rx="4"
                            />
                             {actualBarWidth > 0 && (
                                <rect
                                    x={actualStartX}
                                    y={y + 6}
                                    width={actualBarWidth}
                                    height={barHeight - 12}
                                    className={isLate ? 'fill-red-500' : 'fill-green-500'}
                                    rx="2"
                                    pointerEvents="none"
                                />
                             )}
                            {planBarWidth > textWidthEstimate && (
                                <text x={planStartX + planBarWidth / 2} y={y + barHeight / 2 + 4} textAnchor="middle" className="text-[10px] fill-slate-700 font-medium pointer-events-none">
                                    {planDateLabel}
                                </text>
                            )}
                            <rect x={planStartX} y={y} width={handleWidth} height={barHeight} onMouseDown={(e) => handleMouseDown(e, p, 'resize-start')} className="fill-transparent cursor-ew-resize" />
                            <rect x={planStartX + planBarWidth - handleWidth} y={y} width={handleWidth} height={barHeight} onMouseDown={(e) => handleMouseDown(e, p, 'resize-end')} className="fill-transparent cursor-ew-resize" />
                            {planDueDate && <>
                                <line
                                    x1={getX(planDueDate)}
                                    y1={y - 2}
                                    x2={getX(planDueDate)}
                                    y2={y + barHeight + 2}
                                    className={`stroke-2 ${isLate ? 'stroke-red-600' : 'stroke-slate-500'}`}
                                />
                                <path d={`M ${getX(planDueDate)} ${y-2} l -3 -3 l 6 0 z`} className={`fill-current ${isLate ? 'text-red-600' : 'text-slate-500'}`} />
                            </>}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}


// --- Utilization Chart Component (REBUILT WITH INTERACTIVITY) ---
function UtilizationLineChartComponent({ data, teams, width, height }) {
    const [tooltip, setTooltip] = useState(null);
    const [hoveredTeam, setHoveredTeam] = useState(null);
    const [selectedTeam, setSelectedTeam] = useState(null);
    const svgRef = useRef(null);

    const handleLegendClick = (teamName) => {
        setSelectedTeam(prev => (prev === teamName ? null : teamName));
    };

    const uniqueTeams = useMemo(() => {
        const teamSet = new Set(teams.map(t => t.name));
        const sorted = [...teamSet].sort((a, b) => {
            const indexA = TEAM_SORT_ORDER.indexOf(a);
            const indexB = TEAM_SORT_ORDER.indexOf(b);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });
        return sorted.map((name, i) => ({ name, color: TEAM_COLORS[i % TEAM_COLORS.length] }));
    }, [teams]);

    const chartData = useMemo(() => {
        if (!data || data.length === 0) return { lines: [], points: [], minDate: null, maxDate: null };

        const allWeeks = data.map(d => parseDate(d.week)).filter(Boolean).map(d => d.getTime());
        if (allWeeks.length === 0) return { lines: [], points: [], minDate: null, maxDate: null };

        const minDate = Math.min(...allWeeks);
        const maxDate = Math.max(...allWeeks);
        
        const teamMap = new Map(uniqueTeams.map(t => [t.name, { ...t, values: [] }]));

        data.forEach(weekData => {
            const date = parseDate(weekData.week);
            if (!date) return;
            weekData.teams.forEach(team => {
                if (teamMap.has(team.name)) {
                    teamMap.get(team.name).values.push({
                        date: date.getTime(),
                        utilization: team.utilization
                    });
                }
            });
        });

        const lines = Array.from(teamMap.values()).map(team => ({
            ...team,
            values: team.values.sort((a, b) => a.date - b.date)
        }));

        const points = lines.flatMap(line => line.values.map(v => ({ ...v, name: line.name, color: line.color })));

        return { lines, points, minDate, maxDate };
    }, [data, uniqueTeams]);

    if (width === 0 || height === 0 || !chartData.minDate) return null;

    const legendHeight = 40;
    const margin = { top: 20, right: 20, bottom: 50, left: 50 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom - legendHeight;

    const xScale = (date) => margin.left + ((date - chartData.minDate) / (chartData.maxDate - chartData.minDate || 1)) * chartWidth;
    const yScale = (util) => margin.top + chartHeight - (Math.min(util, 100) / 100) * chartHeight;

    const handleMouseLeave = () => {
        setTooltip(null);
    };

    return (
        <div className="w-full h-full flex flex-col relative" onMouseLeave={handleMouseLeave}>
            {tooltip && (
                <div
                    className="absolute bg-slate-800 text-white text-xs rounded-md p-2 shadow-lg pointer-events-none transition-opacity duration-200 z-10"
                    style={{ top: tooltip.y - 10, left: tooltip.x + 10, transform: 'translateY(-100%)' }}
                >
                    <div className="font-bold">{tooltip.team}</div>
                    <div>Week: {tooltip.date}</div>
                    <div>Utilization: {tooltip.utilization}%</div>
                </div>
            )}
            <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${width} ${height - legendHeight}`}>
                {/* Axes and Gridlines */}
                <g className="text-xs">
                    <text x={margin.left - 35} y={margin.top + chartHeight / 2} transform={`rotate(-90, ${margin.left - 35}, ${margin.top + chartHeight / 2})`} textAnchor="middle" className="fill-slate-500">Utilization</text>
                    <text x={margin.left + chartWidth / 2} y={margin.top + chartHeight + 40} textAnchor="middle" className="fill-slate-500">Week</text>
                    {[0, 25, 50, 75, 100].map(tick => (
                        <g key={tick} transform={`translate(0, ${yScale(tick)})`}>
                            <line x1={margin.left} x2={width - margin.right} className="stroke-slate-200" />
                            <text x={margin.left - 8} y="4" textAnchor="end" className="fill-slate-500">{tick}%</text>
                        </g>
                    ))}
                    {data.map((d, i) => {
                         if(data.length < 10 || i % Math.ceil(data.length / 8) === 0) {
                             const date = parseDate(d.week);
                             if (!date) return null;
                             return (<text key={d.week} x={xScale(date.getTime())} y={margin.top + chartHeight + 20} textAnchor="middle" className="fill-slate-500">{date.toLocaleDateString(undefined, {month:'short', day:'numeric'})}</text>)
                         } return null;
                    })}
                </g>
                {/* Data Lines */}
                {chartData.lines.map(line => {
                    const isSelected = selectedTeam === line.name;
                    const isHovered = hoveredTeam === line.name;
                    const isDimmed = selectedTeam && !isSelected;

                    return (
                        <path
                            key={line.name}
                            d={`M ${line.values.map(p => `${xScale(p.date)},${yScale(p.utilization)}`).join(' L ')}`}
                            className="fill-none transition-all duration-200"
                            strokeWidth={isSelected || isHovered ? 4 : 2}
                            stroke={line.color}
                            opacity={isDimmed ? 0.2 : 1}
                        />
                    );
                })}
                {/* Data Points for Hovering */}
                {chartData.points.map((point, i) => (
                    <circle
                        key={i}
                        cx={xScale(point.date)}
                        cy={yScale(point.utilization)}
                        r="8"
                        className="fill-transparent"
                        onMouseOver={(e) => {
                            const rect = svgRef.current.getBoundingClientRect();
                            setTooltip({
                                x: e.clientX - rect.left,
                                y: e.clientY - rect.top,
                                team: point.name,
                                date: new Date(point.date).toLocaleDateString(),
                                utilization: point.utilization
                            });
                            setHoveredTeam(point.name);
                        }}
                    />
                ))}
            </svg>
            <div className="flex-shrink-0 flex flex-wrap justify-center items-center pt-2 gap-x-4 gap-y-1 h-[40px]">
                {uniqueTeams.map(team => {
                    const isSelected = selectedTeam === team.name;
                    const isDimmed = selectedTeam && !isSelected;
                    return (
                        <div
                            key={team.name}
                            className="flex items-center text-xs cursor-pointer"
                            onClick={() => handleLegendClick(team.name)}
                            onMouseEnter={() => setHoveredTeam(team.name)}
                            onMouseLeave={() => setHoveredTeam(null)}
                        >
                            <div className="w-3 h-3 rounded-sm mr-2" style={{ backgroundColor: team.color }}></div>
                            <span className={`transition-opacity duration-200 ${isDimmed ? 'opacity-30' : 'opacity-100'} ${isSelected ? 'font-bold' : ''}`}>{team.name}</span>
                        </div>
                    )
                })}
            </div>
        </div>
    );
}

// --- Team Workload Chart Component (REBUILT WITH INTERACTIVITY) ---
function TeamWorkloadChartComponent({ data, teams, width, height }) {
    const [tooltip, setTooltip] = useState(null);
    const [hoveredTeam, setHoveredTeam] = useState(null);
    const [selectedTeam, setSelectedTeam] = useState(null);
    const svgRef = useRef(null);

    const handleLegendClick = (teamName) => {
        setSelectedTeam(prev => (prev === teamName ? null : teamName));
    };

    const uniqueTeams = useMemo(() => {
        const teamSet = new Set(teams.map(t => t.name));
        const sorted = [...teamSet].sort((a, b) => {
            const indexA = TEAM_SORT_ORDER.indexOf(a);
            const indexB = TEAM_SORT_ORDER.indexOf(b);
            if (indexA === -1) return 1;
            if (indexB === -1) return -1;
            return indexA - indexB;
        });
        return sorted.map((name, i) => ({ name, color: TEAM_COLORS[i % TEAM_COLORS.length] }));
    }, [teams]);

    const { lines, points, minDate, maxDate, maxWorkloadRatio } = useMemo(() => {
        if (!data || data.length === 0) return { lines: [], points: [], minDate: null, maxDate: null, maxWorkloadRatio: 125 };

        const allWeeks = data.map(d => parseDate(d.week)).filter(Boolean).map(d => d.getTime());
        if (allWeeks.length === 0) return { lines: [], points: [], minDate: null, maxDate: null, maxWorkloadRatio: 125 };

        let maxRatio = 125;
        data.forEach(week => week.teams.forEach(team => {
            const ratio = parseFloat(team.workloadRatio);
            if (ratio > maxRatio) maxRatio = ratio;
        }));
        maxRatio = Math.ceil(maxRatio / 50) * 50;

        const minDate = Math.min(...allWeeks);
        const maxDate = Math.max(...allWeeks);
        
        const teamMap = new Map(uniqueTeams.map(t => [t.name, { ...t, values: [] }]));

        data.forEach(weekData => {
            const date = parseDate(weekData.week);
            if (!date) return;
            weekData.teams.forEach(team => {
                if (teamMap.has(team.name)) {
                    teamMap.get(team.name).values.push({
                        date: date.getTime(),
                        workloadRatio: parseFloat(team.workloadRatio)
                    });
                }
            });
        });

        const lines = Array.from(teamMap.values()).map(team => ({
            ...team,
            values: team.values.sort((a, b) => a.date - b.date)
        }));

        const points = lines.flatMap(line => line.values.map(v => ({ ...v, name: line.name, color: line.color })));

        return { lines, points, minDate, maxDate, maxWorkloadRatio: maxRatio };
    }, [data, uniqueTeams]);

    if (width === 0 || height === 0 || !minDate) return null;

    const legendHeight = 40;
    const margin = { top: 20, right: 20, bottom: 50, left: 50 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom - legendHeight;

    const xScale = (date) => margin.left + ((date - minDate) / (maxDate - minDate || 1)) * chartWidth;
    const yScale = (percentage) => margin.top + chartHeight - (percentage / maxWorkloadRatio) * chartHeight;

    const yAxisTicks = [];
    const tickIncrement = Math.max(25, Math.ceil(maxWorkloadRatio / 5 / 25) * 25);
    for(let i = 0; i <= maxWorkloadRatio; i += tickIncrement) {
        yAxisTicks.push(i);
    }

    return (
        <div className="w-full h-full flex flex-col relative" onMouseLeave={() => setTooltip(null)}>
            {tooltip && (
                <div
                    className="absolute bg-slate-800 text-white text-xs rounded-md p-2 shadow-lg pointer-events-none transition-opacity duration-200 z-10"
                    style={{ top: tooltip.y - 10, left: tooltip.x + 10, transform: 'translateY(-100%)' }}
                >
                    <div className="font-bold">{tooltip.team}</div>
                    <div>Week: {tooltip.date}</div>
                    <div>Workload: {tooltip.workloadRatio.toFixed(0)}%</div>
                </div>
            )}
            <svg ref={svgRef} width="100%" height="100%" viewBox={`0 0 ${width} ${height - legendHeight}`}>
                <g className="text-xs">
                    <text x={margin.left - 40} y={margin.top + chartHeight / 2} transform={`rotate(-90, ${margin.left - 40}, ${margin.top + chartHeight / 2})`} textAnchor="middle" className="fill-slate-500">Workload Ratio</text>
                     <text x={margin.left + chartWidth / 2} y={margin.top + chartHeight + 40} textAnchor="middle" className="fill-slate-500">Week</text>
                    {yAxisTicks.map(tick => (
                        <g key={tick} transform={`translate(0, ${yScale(tick)})`}>
                            <line x1={margin.left} x2={width - margin.right} className="stroke-slate-200" />
                            <text x={margin.left - 8} y="4" textAnchor="end" className="fill-slate-500">{tick}%</text>
                        </g>
                    ))}
                    <g transform={`translate(0, ${yScale(100)})`}>
                        <line x1={margin.left} x2={width - margin.right} className="stroke-red-500" strokeWidth="1.5" strokeDasharray="4 2"/>
                        <text x={margin.left - 8} y="4" textAnchor="end" className="fill-red-500 font-bold">100%</text>
                    </g>
                    {data.map((d, i) => {
                         if(data.length < 10 || i % Math.ceil(data.length / 8) === 0) {
                             const date = parseDate(d.week);
                             if (!date) return null;
                             return (<text key={d.week} x={xScale(date.getTime())} y={margin.top + chartHeight + 20} textAnchor="middle" className="fill-slate-500">{date.toLocaleDateString(undefined, {month:'short', day:'numeric'})}</text>)
                         } return null;
                    })}
                </g>
                {lines.map(line => {
                    const isSelected = selectedTeam === line.name;
                    const isHovered = hoveredTeam === line.name;
                    const isDimmed = selectedTeam && !isSelected;

                    return (
                        <path
                            key={line.name}
                            d={`M ${line.values.map(p => `${xScale(p.date)},${yScale(p.workloadRatio)}`).join(' L ')}`}
                            className="fill-none transition-all duration-200"
                            strokeWidth={isSelected || isHovered ? 4 : 2}
                            stroke={line.color}
                            opacity={isDimmed ? 0.2 : 1}
                        />
                    );
                })}
                {points.map((point, i) => (
                    <circle
                        key={i}
                        cx={xScale(point.date)}
                        cy={yScale(point.workloadRatio)}
                        r="8"
                        className="fill-transparent"
                        onMouseOver={(e) => {
                            const rect = svgRef.current.getBoundingClientRect();
                            setTooltip({
                                x: e.clientX - rect.left,
                                y: e.clientY - rect.top,
                                team: point.name,
                                date: new Date(point.date).toLocaleDateString(),
                                workloadRatio: point.workloadRatio
                            });
                            setHoveredTeam(point.name);
                        }}
                    />
                ))}
            </svg>
            <div className="flex-shrink-0 flex flex-wrap justify-center items-center pt-2 gap-x-4 gap-y-1 h-[40px]">
                {uniqueTeams.map(team => {
                    const isSelected = selectedTeam === team.name;
                    const isDimmed = selectedTeam && !isSelected;
                    return (
                        <div
                            key={team.name}
                            className="flex items-center text-xs cursor-pointer"
                            onClick={() => handleLegendClick(team.name)}
                            onMouseEnter={() => setHoveredTeam(team.name)}
                            onMouseLeave={() => setHoveredTeam(null)}
                        >
                            <div className="w-3 h-3 rounded-sm mr-2" style={{ backgroundColor: team.color }}></div>
                            <span className={`transition-opacity duration-200 ${isDimmed ? 'opacity-30' : 'opacity-100'} ${isSelected ? 'font-bold' : ''}`}>{team.name}</span>
                        </div>
                    )
                })}
            </div>
        </div>
    );
}