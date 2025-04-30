import { loadTaskCategories, loadTasksForCategory } from './apiService.js';

// --- Get Elements ---
const minutesDisplay = document.getElementById('minutes');
const secondsDisplay = document.getElementById('seconds');
const modeIndicator = document.getElementById('modeIndicator');
const mainActionBtn = document.getElementById('mainActionBtn');
const longBreakResetBtn = document.getElementById('longBreakResetBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn'); // Optional theme button ref
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.querySelector('.settings');
const workTimeInput = document.getElementById('workTime');
const breakTimeInput = document.getElementById('breakTime');
const longBreakTimeInput = document.getElementById('longBreakTime');
const workRatioInput = document.getElementById('workRatio');
const applySettingsBtn = document.getElementById('applySettings');
const mainStatDisplay = document.getElementById('mainStatDisplay');
const progressCircle = document.querySelector('.progress-ring__circle');
const categorySelect = document.getElementById('taskCategory');
const taskSelect = document.getElementById('taskSelection');

// --- State Variables ---
let initialWorkTime;
let timerInterval = null;
let timeLeft;
let totalSessionDuration; // Duration of the current work/break/longBreak session in seconds
let currentSession = 'work';
let isPaused = true;
let totalWorkTimeElapsed = 0; // Net work time accumulated (work seconds - break cost)
let grossWorkTimeAccumulated = 0; // Total seconds spent in 'work' mode during the current run
let workRatio; // How many work units earn 1 break unit
const breakRatio = 1; // How many break units are earned (usually 1)
let currentTheme = localStorage.getItem('theme') || 'dark'; // Default to dark theme

// --- Constants ---
const DEFAULT_WORK_TIME = 25;
const DEFAULT_WORK_RATIO = 3;
const DEFAULT_BREAK_TIME = 5;
const DEFAULT_LONG_BREAK_TIME = 15;
const MIN_LOGGABLE_WORK_SECONDS = 30; // Minimum duration to log

// --- Progress Bar Calculation ---
let radius = 0;
let circumference = 0;

// --- Utility Functions ---
function applyTheme(theme) {
    const themeIcon = themeToggleBtn ? themeToggleBtn.querySelector('i') : null;
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');

    // Remove the light-mode class by default (for dark theme)
    document.body.classList.remove('light-mode');

    if (theme === 'light') {
        // Add light-mode class only for the light theme
        document.body.classList.add('light-mode');
        if (themeIcon) {
            themeIcon.classList.remove('fa-sun');
            themeIcon.classList.add('fa-moon');
        }
        if (themeToggleBtn) {
             themeToggleBtn.setAttribute('aria-label', 'Switch to Dark Theme');
        }
        if (themeColorMeta) {
            themeColorMeta.content = '#ffffff'; // Light theme background color (or primary if preferred)
        }
    } else {
        // Dark theme (default)
        if (themeIcon) {
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
        }
         if (themeToggleBtn) {
            themeToggleBtn.setAttribute('aria-label', 'Switch to Light Theme');
        }
        if (themeColorMeta) {
            themeColorMeta.content = '#000000'; // Dark theme background color
        }
    }
}

function toggleTheme() {
    currentTheme = currentTheme === 'dark' ? 'light' : 'dark'; // Toggle logic reversed
    localStorage.setItem('theme', currentTheme);
    applyTheme(currentTheme);
}

function updateTimeDisplay(minutes, seconds) {
    if (minutesDisplay && secondsDisplay) {
        minutesDisplay.textContent = String(minutes).padStart(2, '0');
        secondsDisplay.textContent = String(seconds).padStart(2, '0');
    }
}

function updateModeIndicator(session) {
    let modeText = 'Work';
    if (session === 'break') modeText = 'Break';
    else if (session === 'longBreak') modeText = 'Long Break';

    if (modeIndicator) {
        modeIndicator.textContent = modeText;
    }
    // Update document title to reflect timer state
    if (minutesDisplay && secondsDisplay) {
        document.title = `${minutesDisplay.textContent}:${secondsDisplay.textContent} - ${modeText}`;
    }
}

function updateProgressBar(percent) {
    const circleElement = progressCircle || document.querySelector('.progress-ring__circle');
    if (!circleElement || circumference === 0) return; // Ensure circle is ready

    const clampedPercent = Math.max(0, Math.min(100, percent)); // Keep percent between 0-100
    const offset = circumference - (clampedPercent / 100) * circumference;
    circleElement.style.strokeDashoffset = offset;
}


function updateStatsDisplay() {
    let displayText = '';
    if (currentSession === 'work') {
        // Show total gross work time accumulated in this run
        const totalWorkMinutes = Math.floor(grossWorkTimeAccumulated / 60);
        const totalWorkSeconds = grossWorkTimeAccumulated % 60;
        const totalWorkText = `${String(totalWorkMinutes).padStart(2, '0')}:${String(totalWorkSeconds).padStart(2, '0')}`;
        displayText = `Total Work: ${totalWorkText}`;
    } else {
        // Show earned break time based on net work time
        const isNegative = totalWorkTimeElapsed < 0; // Can happen if break exceeds earned time
        const absoluteWorkElapsed = Math.abs(totalWorkTimeElapsed);
        let earnedBreakSeconds = 0;
        if (workRatio > 0 && absoluteWorkElapsed > 0) {
            earnedBreakSeconds = Math.floor((absoluteWorkElapsed * breakRatio) / workRatio);
        }
        const earnedMinutes = Math.floor(earnedBreakSeconds / 60);
        const earnedSecs = earnedBreakSeconds % 60;
        const sign = isNegative && earnedBreakSeconds > 0 ? "-" : ""; // Show negative if needed
        const earnedBreakText = earnedBreakSeconds === 0
            ? `00:00`
            : `${sign}${String(earnedMinutes).padStart(2, '0')}:${String(earnedSecs).padStart(2, '0')}`;
        displayText = `Earned Rest: ${earnedBreakText}`;
    }
    if (mainStatDisplay) {
        mainStatDisplay.textContent = displayText;
    }
}

function updateButtonStates() {
    const mainIcon = mainActionBtn ? mainActionBtn.querySelector('i') : null;
    const longBreakIcon = longBreakResetBtn ? longBreakResetBtn.querySelector('i') : null;

    if (mainIcon && mainActionBtn) {
        mainIcon.classList.remove('fa-play', 'fa-pause', 'fa-coffee'); // Reset icons
        if (isPaused) {
            mainIcon.classList.add('fa-play');
            mainActionBtn.setAttribute('aria-label', 'Start Work');
        } else { // Timer is running
            if (currentSession === 'longBreak') {
                // During long break, main button restarts work
                mainIcon.classList.add('fa-play');
                mainActionBtn.setAttribute('aria-label', 'Start Work');
            } else {
                // During work or normal break, main button pauses/starts break
                mainIcon.classList.add('fa-pause');
                // Aria label reflects action: Start Break (if work), Resume Work (if break)
                mainActionBtn.setAttribute('aria-label', currentSession === 'work' ? 'Start Break' : 'Resume Work');
            }
        }
    }

    if (longBreakIcon && longBreakResetBtn) {
        longBreakIcon.classList.remove('fa-bed', 'fa-redo'); // Reset icons
        if (currentSession === 'longBreak') {
            // During long break, this button resets the timer
            longBreakIcon.classList.add('fa-redo');
            longBreakResetBtn.setAttribute('aria-label', 'Reset Timer');
        } else {
            // Otherwise, it starts a long break
            longBreakIcon.classList.add('fa-bed');
            longBreakResetBtn.setAttribute('aria-label', 'Start Long Break');
        }
    }
}


// --- Core Timer Logic ---
function startTimer() {
    if (!isPaused) return; // Prevent multiple intervals

    // Ensure breaks have a valid duration before starting
    if (currentSession !== 'work' && (!totalSessionDuration || totalSessionDuration <= 0)) {
        console.warn(`Timer start attempted for ${currentSession} with invalid duration. Recalculating.`);
        // Pass false when recalculating break duration to avoid resetting work time accidentally
        setTimeForSession(currentSession, false);
        if (!totalSessionDuration || totalSessionDuration <= 0) {
             console.error(`Cannot start ${currentSession} timer, duration is zero or invalid.`);
             isPaused = true; // Remain paused
             updateButtonStates();
             return; // Exit if still invalid
        }
    }

    isPaused = false;
    updateButtonStates();
    clearInterval(timerInterval); // Clear any lingering intervals
    timerInterval = null;

    timerInterval = setInterval(() => {
        if (isPaused) { // Double-check pause state within interval
            clearInterval(timerInterval);
            timerInterval = null;
            return;
        }

        // Update time elapsed/accumulated based on session
        if (currentSession === 'work') {
            totalWorkTimeElapsed++; // Net time
            grossWorkTimeAccumulated++; // Time spent *in* work mode
        } else if (currentSession === 'break' || currentSession === 'longBreak') {
            // Decrease 'earned' time (totalWorkTimeElapsed) based on work:break ratio
            const workCostPerSecond = (workRatio > 0 && breakRatio > 0) ? workRatio / breakRatio : 0;
            if (workCostPerSecond > 0 && timeLeft > 0) {
                totalWorkTimeElapsed = totalWorkTimeElapsed - workCostPerSecond;
            }
        }

        timeLeft--; // Decrement time remaining for the current session

        let displayMinutes, displaySeconds;
        let percentElapsed = 0;

        // Calculate display time and progress based on session type
        if (currentSession === 'work') {
            if (timeLeft >= 0) { // Normal work time
                displayMinutes = Math.floor(timeLeft / 60);
                displaySeconds = timeLeft % 60;
                if (totalSessionDuration > 0) {
                    percentElapsed = ((totalSessionDuration - timeLeft) / totalSessionDuration) * 100;
                }
            } else { // Work overtime
                const overtimeSeconds = Math.abs(timeLeft);
                const baseWorkSeconds = (typeof initialWorkTime === 'number' ? initialWorkTime : DEFAULT_WORK_TIME) * 60;
                const totalSecondsSinceStart = baseWorkSeconds + overtimeSeconds;
                displayMinutes = Math.floor(totalSecondsSinceStart / 60);
                displaySeconds = totalSecondsSinceStart % 60;
                percentElapsed = 100; // Show progress as full during overtime
            }
        } else { // Break or Long Break
            // Display time remaining, ensuring it doesn't go below zero visually
            displayMinutes = Math.floor(Math.max(0, timeLeft) / 60);
            displaySeconds = Math.max(0, timeLeft) % 60;
            if (totalSessionDuration > 0) {
                percentElapsed = ((totalSessionDuration - Math.max(0, timeLeft)) / totalSessionDuration) * 100;
            }
        }

        // Update UI elements
        updateTimeDisplay(displayMinutes, displaySeconds);
        updateProgressBar(percentElapsed);
        updateModeIndicator(currentSession);
        updateStatsDisplay();

        // Check if break/long break session has ended
        if (currentSession !== 'work' && timeLeft < 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            isPaused = true; // Pause automatically when break ends
            updateProgressBar(100); // Ensure progress bar is full
            updateTimeDisplay(0, 0); // Show 00:00 for ended break
            updateStatsDisplay();
            updateButtonStates();
            updateModeIndicator(currentSession);
            // User must manually start next work session
        }
    }, 1000);
}

function pauseTimer() {
    if (isPaused) return;
    isPaused = true;
    updateButtonStates();
    clearInterval(timerInterval);
    timerInterval = null;
    // console.log("Timer Paused");
    // Update title to show paused state
    if (minutesDisplay && secondsDisplay && modeIndicator) {
        document.title = `(Paused) ${minutesDisplay.textContent}:${secondsDisplay.textContent} - ${modeIndicator.textContent}`;
    }
}


function handleMainActionClick() {
    // --- Special handling for Long Break ---
    if (currentSession === 'longBreak') {
        // Reset gross work time when starting work after a long break
        setTimeForSession('work', true);
        startTimer();
        return;
    }
    // --- END: Special handling for Long Break ---


    // --- Existing logic for Work/Break sessions ---
    if (isPaused) {
        if (currentSession === 'break' && timeLeft > 0) {
            // If paused during a break, resume the break
            startTimer();
        } else {
            // This is where work starts after a short break ends OR if work was paused
            if (currentSession === 'break' || timeLeft < 0) {
                 // Pass false to prevent resetting gross work time after short break ends
                 setTimeForSession('work', false);
            }
            // If work was just paused (timeLeft >= 0), we don't call setTimeForSession,
            // so grossWorkTimeAccumulated is preserved naturally.
            startTimer(); // Start/resume work
        }
    } else { // Timer is running
        if (currentSession === 'work') {
            // Running work: Just set up and start the break. NO redirection here.

            // 1. Set up the break state (pass false to avoid resetting work time)
            setTimeForSession('break', false);

            // 2. Start the break timer if there's duration
            if (totalSessionDuration > 0) {
                startTimer(); // Start the break countdown
            } else {
                // console.log("No earned break time. Pausing.");
                // setTimeForSession already paused it
            }

        } else if (currentSession === 'break') {
            // Running normal break: Stop break, switch to work, start work.
            // console.log("Interrupting break to resume work.");
            // Switch to work session, pass false to keep accumulated work time
            setTimeForSession('work', false);
            // Start the work timer
            startTimer();
        }
        // No 'else' needed as long break running case is handled at the top
    }
}


function handleLongBreakResetClick() {
    if (currentSession === 'longBreak') {
        // If currently in a long break (running or paused), reset the whole timer
        resetTimer();
    } else {
        // If in work or normal break, switch to long break mode AND redirect

        const taskSelectEl = document.getElementById('taskSelection');
        const selectedTaskId = taskSelectEl ? taskSelectEl.value : null;
        // Use grossWorkTimeAccumulated (work time since last long break/reset) for the duration sent to LifeUp
        const workDurationSeconds = Math.floor(grossWorkTimeAccumulated);

        // --- ADDED CHECK ---
        // Check if the duration is sufficient before proceeding
        if (workDurationSeconds < MIN_LOGGABLE_WORK_SECONDS) {
            //console.error(`Work session too short (${workDurationSeconds}s). Minimum ${MIN_LOGGABLE_WORK_SECONDS}s required to log.`);
            // Optionally, provide user feedback (e.g., alert or update a status message)
            alert(`Work session must be at least ${MIN_LOGGABLE_WORK_SECONDS} seconds to log.`);
            // Still start the long break, just don't log it
            setTimeForSession('longBreak', true); // Reset work time for next cycle
            startTimer(); // Start the long break countdown
            return; // Stop before redirection logic
        }
        // --- END ADDED CHECK ---


        // 1. Set up the long break state (pass true to reset work time for next cycle)
        setTimeForSession('longBreak', true);

        // 2. Start the long break timer
        startTimer(); // Start the long break countdown

        // 3. Redirect to LifeUp *after* a short delay, if task selected
        if (selectedTaskId && selectedTaskId !== "") {
            // Use workDurationSeconds here (already validated >= MIN_LOGGABLE_WORK_SECONDS)
            const lifeupUrl = `lifeup://api/add_pomodoro?task_id=${selectedTaskId}&duration=${workDurationSeconds * 1000}&reward_tomatoes=true`;
            // console.log("Setting up redirection to LifeUp (Long Break):", lifeupUrl);

            // Use setTimeout to allow local state changes to process before navigating
            setTimeout(() => {
                // console.log("Executing redirection now (Long Break).");
                window.location.href = lifeupUrl;
            }, 100); // Small delay

        } else {
            console.warn("No task selected. Skipping redirection for Long Break.");
            // Long break timer was already started above
        }
    }
}

function resetTimer() {
    pauseTimer();
    currentSession = 'work';
    readSettings();
    totalWorkTimeElapsed = 0;
    // grossWorkTimeAccumulated is reset by setTimeForSession below
    // Pass true to reset gross work time on manual reset
    setTimeForSession(currentSession, true);
    // console.log("Timer Reset");
}

/**
 * Sets the timer display and duration based on the target session type.
 * @param {string} session - The target session type ('work', 'break', 'longBreak').
 * @param {boolean} [resetGrossWork=true] - Whether to reset the gross accumulated work time (used for 'Total Work' display).
 */
function setTimeForSession(session, resetGrossWork = true) {
    pauseTimer(); // Always pause before changing session state
    currentSession = session;
    updateModeIndicator(session);
    readSettings(); // Ensure latest settings are used for duration calculation

    if (session === 'work') {
        totalSessionDuration = (initialWorkTime || DEFAULT_WORK_TIME) * 60;
        timeLeft = totalSessionDuration;
        // Only reset if requested (default is true)
        if (resetGrossWork) {
            grossWorkTimeAccumulated = 0; // Reset gross work time
            // console.log("Resetting grossWorkTimeAccumulated");
        } else {
            // console.log("NOT resetting grossWorkTimeAccumulated");
        }

    } else if (session === 'break') {
        const configuredBreakMinutes = breakTimeInput ? (parseInt(breakTimeInput.value) || DEFAULT_BREAK_TIME) : DEFAULT_BREAK_TIME;
        const configuredBreakSeconds = configuredBreakMinutes * 60;
        let currentEarnedSeconds = 0;
        if (workRatio > 0 && totalWorkTimeElapsed > 0) {
            currentEarnedSeconds = Math.floor((totalWorkTimeElapsed * breakRatio) / workRatio);
        }
        totalSessionDuration = Math.min(Math.max(0, currentEarnedSeconds), configuredBreakSeconds);
        timeLeft = totalSessionDuration;

    } else if (session === 'longBreak') {
        const longBreakMinutes = longBreakTimeInput ? (parseInt(longBreakTimeInput.value) || DEFAULT_LONG_BREAK_TIME) : DEFAULT_LONG_BREAK_TIME;
        totalSessionDuration = longBreakMinutes * 60;
        timeLeft = totalSessionDuration;

    } else { // Fallback
        console.error("Invalid session type:", session);
        currentSession = 'work';
        totalSessionDuration = (initialWorkTime || DEFAULT_WORK_TIME) * 60;
        timeLeft = totalSessionDuration;
        // Reset here too for safety in fallback case
        grossWorkTimeAccumulated = 0;
    }

    // Update UI elements for the new session state
    const minutes = Math.floor(Math.max(0, timeLeft) / 60);
    const seconds = Math.max(0, timeLeft) % 60;
    updateTimeDisplay(minutes, seconds);
    updateProgressBar(0); // Reset progress bar
    updateStatsDisplay();
    updateButtonStates();
    updateModeIndicator(session);
}

// --- Settings Logic ---
function readSettings() {
    // Read values from input fields, using defaults if invalid
    initialWorkTime = workTimeInput ? (parseInt(workTimeInput.value) || DEFAULT_WORK_TIME) : DEFAULT_WORK_TIME;
    const newWorkRatio = workRatioInput ? (parseInt(workRatioInput.value) || DEFAULT_WORK_RATIO) : DEFAULT_WORK_RATIO;

    // Validate work ratio
    if (newWorkRatio > 0) {
        workRatio = newWorkRatio;
    } else {
        console.warn("Invalid work ratio input. Using default or previous value.");
        if (workRatioInput) workRatioInput.value = workRatio || DEFAULT_WORK_RATIO; // Reset input field
        workRatio = workRatio || DEFAULT_WORK_RATIO; // Ensure state variable is valid
    }

    // Ensure input fields reflect the actual values being used
    if (workTimeInput) workTimeInput.value = initialWorkTime;
    if (breakTimeInput) breakTimeInput.value = breakTimeInput.value || DEFAULT_BREAK_TIME;
    if (longBreakTimeInput) longBreakTimeInput.value = longBreakTimeInput.value || DEFAULT_LONG_BREAK_TIME;
    if (workRatioInput) workRatioInput.value = workRatio;
}

function toggleSettingsPanel() {
    if (settingsPanel) {
        settingsPanel.classList.toggle('hidden');
    } else {
        console.error("Settings panel element not found when trying to toggle.");
    }
}


// --- Wait for DOM Ready ---
document.addEventListener('DOMContentLoaded', () => {
    // Calculate Progress Bar values now that element exists
    const progressCircleElement = progressCircle || document.querySelector('.progress-ring__circle');
    if (progressCircleElement) {
        radius = progressCircleElement.r.baseVal.value;
        circumference = 2 * Math.PI * radius;
        progressCircleElement.style.strokeDasharray = `${circumference} ${circumference}`;
        progressCircleElement.style.strokeDashoffset = circumference;
    } else {
        console.error("Progress circle element not found.");
    }

    // --- Event Listeners ---
    // Get element references *inside* DOMContentLoaded for listeners
    const mainActionBtnEl = document.getElementById('mainActionBtn');
    const longBreakResetBtnEl = document.getElementById('longBreakResetBtn');
    const themeToggleBtnEl = document.getElementById('themeToggleBtn');
    const settingsBtnEl = document.getElementById('settingsBtn');
    const applySettingsBtnEl = document.getElementById('applySettings');
    const settingsPanelEl = document.querySelector('.settings');
    const categorySelectEl = document.getElementById('taskCategory');
    const taskSelectEl = document.getElementById('taskSelection');

    // Attach listeners if elements exist
    if (mainActionBtnEl) mainActionBtnEl.addEventListener('click', handleMainActionClick);
    if (longBreakResetBtnEl) longBreakResetBtnEl.addEventListener('click', handleLongBreakResetClick);
    if (themeToggleBtnEl) themeToggleBtnEl.addEventListener('click', toggleTheme);
    if (settingsBtnEl) settingsBtnEl.addEventListener('click', toggleSettingsPanel);

    // Add listener for the optional close button inside settings
    const closeSettingsBtnEl = document.querySelector('.settings .close-settings-btn');
    if (closeSettingsBtnEl) {
        closeSettingsBtnEl.addEventListener('click', toggleSettingsPanel);
    }


    if (applySettingsBtnEl) {
        applySettingsBtnEl.addEventListener('click', () => {
            readSettings(); // Read and apply new settings
            // If timer is paused, update the display for the current session
            if (isPaused) {
               // Recalculate and display time, respecting the resetGrossWork logic for the current state
               // Reset gross work time only if not currently in a work session when applying settings
               setTimeForSession(currentSession, currentSession !== 'work');
            } else {
               // If timer is running, just update stats (earned time might change due to ratio)
               updateStatsDisplay();
            }
            if (settingsPanelEl) settingsPanelEl.classList.add('hidden'); // Close panel
        });
    }

    // Listener for category dropdown changes
    if (categorySelectEl && taskSelectEl) {
        categorySelectEl.addEventListener('change', (event) => {
            const selectedCategoryId = event.target.value;
            if (selectedCategoryId) {
                // Load tasks for the selected category
                loadTasksForCategory(selectedCategoryId, taskSelectEl);
            } else {
                // Reset task dropdown if default category is selected
                taskSelectEl.disabled = true;
                taskSelectEl.options[0].textContent = '--Select Task--';
                while (taskSelectEl.options.length > 1) {
                    taskSelectEl.remove(1);
                }
            }
        });
    } else {
        if (!categorySelectEl) console.error("Category select element not found for event listener.");
        if (!taskSelectEl) console.error("Task select element not found for event listener setup.");
    }

    // --- Initialize ---
    readSettings(); // Read initial settings from HTML/defaults
    applyTheme(currentTheme); // Apply saved or default theme

    // Load categories from API (will also reset task dropdown initially)
    if (categorySelectEl && taskSelectEl) {
        loadTaskCategories(categorySelectEl, taskSelectEl);
    } else {
         if (!categorySelectEl) console.error("Category select element not found for initial load.");
         if (!taskSelectEl) console.error("Task select element not found for initial load.");
    }

    // Set initial timer state to paused 'work' mode, reset gross work time on load
    setTimeForSession('work', true);

    // Initial UI updates
    updateButtonStates();
    updateStatsDisplay();

    // Ensure task dropdown is initially disabled
    if (taskSelectEl) {
        taskSelectEl.disabled = true;
    }

}); // End of DOMContentLoaded listener
