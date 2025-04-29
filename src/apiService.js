const CATEGORY_API_URL = 'http://localhost:13276/tasks_categories';
const TASKS_API_URL = 'http://localhost:13276/tasks';

/**
 * Fetches tasks from the API and populates the task dropdown, filtered by category.
 * @param {string} categoryId - The ID of the category to filter tasks by.
 * @param {HTMLSelectElement} taskSelectDropdown - The task select dropdown element.
 */
export async function loadTasksForCategory(categoryId, taskSelectDropdown) {
    if (!taskSelectDropdown) {
        console.error('Task selection dropdown element not provided to loadTasksForCategory.');
        return;
    }

    // Reset and disable dropdown while loading
    while (taskSelectDropdown.options.length > 1) {
        taskSelectDropdown.remove(1);
    }
    taskSelectDropdown.disabled = true;
    taskSelectDropdown.options[0].textContent = '--Loading Tasks--';

    const numericCategoryId = parseInt(categoryId, 10);
    if (isNaN(numericCategoryId)) {
        console.error('Invalid Category ID provided:', categoryId);
        taskSelectDropdown.options[0].textContent = '--Invalid Category--';
        return;
    }

    try {
        const response = await fetch(TASKS_API_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const result = await response.json();

        if (result.code === 200 && Array.isArray(result.data)) {
            const filteredTasks = result.data.filter(task => task.categoryId === numericCategoryId);

            if (filteredTasks.length > 0) {
                filteredTasks.forEach(task => {
                    // Basic validation for task object structure
                    if (task && typeof task.name !== 'undefined' && typeof task.id !== 'undefined') {
                        const option = document.createElement('option');
                        option.value = task.id;
                        option.textContent = task.name;
                        taskSelectDropdown.appendChild(option);
                    } // else { console.warn("Skipping invalid task item:", task); } // Removed warn
                });
                taskSelectDropdown.disabled = false; // Enable dropdown
                taskSelectDropdown.options[0].textContent = '--Select Task--';
            } else {
                // No tasks found for this category
                taskSelectDropdown.options[0].textContent = '--No Tasks Found--';
                // Keep dropdown disabled
            }
        } else {
            console.error('Tasks API response format is not correct:', result);
            taskSelectDropdown.options[0].textContent = '--Error Loading Tasks--';
        }
    } catch (error) {
        console.error('Failed to fetch tasks:', error);
        taskSelectDropdown.options[0].textContent = '--Task Load Failed--';
    }
}

/**
 * Fetches categories from the API and populates the category dropdown.
 * @param {HTMLSelectElement} categorySelectDropdown - The category select dropdown element.
 * @param {HTMLSelectElement} taskSelectDropdown - The task select dropdown element (to reset its state).
 */
export async function loadTaskCategories(categorySelectDropdown, taskSelectDropdown) {
    if (!categorySelectDropdown) {
        console.error('Task category dropdown element not provided to loadTaskCategories.');
        return;
    }
    // Reset task dropdown state while categories load or if loading fails
    if (taskSelectDropdown) {
        taskSelectDropdown.disabled = true;
        taskSelectDropdown.options[0].textContent = '--Select Category First--';
         while (taskSelectDropdown.options.length > 1) {
            taskSelectDropdown.remove(1);
        }
    }

    try {
        const response = await fetch(CATEGORY_API_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const result = await response.json();

        if (result.code === 200 && Array.isArray(result.data)) {
            // Clear existing category options (except default)
            while (categorySelectDropdown.options.length > 1) {
                categorySelectDropdown.remove(1);
            }
            // Populate with new options from the API
            result.data.forEach(category => {
                 // Basic validation for category object structure
                if (category && typeof category.name !== 'undefined' && typeof category.id !== 'undefined') {
                    const option = document.createElement('option');
                    option.value = category.id;
                    option.textContent = category.name;
                    categorySelectDropdown.appendChild(option);
                } // else { console.warn("Skipping invalid category item:", category); } // Removed warn
            });
            categorySelectDropdown.disabled = false;
            // Reset task dropdown state after successful category load
             if (taskSelectDropdown) {
                 taskSelectDropdown.disabled = true; // Still disabled until category selected
                 taskSelectDropdown.options[0].textContent = '--Select Task--';
             }
        } else {
            console.error('Category API response format is not correct:', result);
            categorySelectDropdown.disabled = true;
            categorySelectDropdown.options[0].textContent = 'Error loading';
             if (taskSelectDropdown) taskSelectDropdown.options[0].textContent = '--Category Error--';
        }
    } catch (error) {
        console.error('Failed to fetch task categories:', error);
        if (categorySelectDropdown) {
            categorySelectDropdown.disabled = true;
            categorySelectDropdown.options[0].textContent = 'Load failed';
             if (taskSelectDropdown) taskSelectDropdown.options[0].textContent = '--Category Error--';
        }
    }
}
