// Main app functionality
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dateDisplay = document.getElementById('currentDate');
    const taskInput = document.getElementById('taskInput');
    const addTaskBtn = document.getElementById('addTaskBtn');
    const taskList = document.getElementById('taskList');
    const emptyState = document.getElementById('emptyState');
    const totalTasksEl = document.getElementById('totalTasks');
    const completedTasksEl = document.getElementById('completedTasks');
    const remainingTasksEl = document.getElementById('remainingTasks');
    const offlineNotification = document.getElementById('offlineNotification');
    const updateToast = document.getElementById('updateToast');
    const updateBtn = document.getElementById('updateBtn');
    const userName = document.getElementById('userName');
    const logoutBtn = document.getElementById('logoutBtn');
    const authContainer = document.getElementById('authContainer');
    const appContainer = document.getElementById('appContainer');
    
    // Set current date
    function updateDate() {
        const now = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateDisplay.textContent = now.toLocaleDateString('en-US', options);
    }
    
    updateDate();
    
    // Update date at midnight
    setInterval(() => {
        const now = new Date();
        if (now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() === 0) {
            updateDate();
        }
    }, 1000);
    
    // PWA: Service Worker Registration - using relative path for AWS compatibility
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js')
                .then(registration => {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                    
                    // Check for updates
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                showUpdateNotification();
                            }
                        });
                    });
                })
                .catch(error => {
                    console.error('ServiceWorker registration failed: ', error);
                });
        });
    }
    
    // Show update notification
    function showUpdateNotification() {
        updateToast.style.display = 'block';
        updateToast.classList.add('show');
    }
    
    // Handle update button click
    updateBtn.addEventListener('click', () => {
        window.location.reload();
        updateToast.classList.remove('show');
    });
    
    // Handle online/offline status
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    function updateOnlineStatus() {
        if (navigator.onLine) {
            offlineNotification.style.display = 'none';
            // Sync any pending changes if authenticated
            if (auth.currentUser) {
                syncPendingChanges();
            }
        } else {
            offlineNotification.style.display = 'block';
        }
    }
    
    // Initial call to set online status
    updateOnlineStatus();
    
    // Handle adding new task
    addTaskBtn.addEventListener('click', addNewTask);
    taskInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addNewTask();
        }
    });
    
    function addNewTask() {
        const taskText = taskInput.value.trim();
        
        if (taskText === '') return;
        
        const user = typeof auth !== 'undefined' ? auth.currentUser : null;
        
        if (user) {
            // Firebase user flow
            const newTask = {
                text: taskText,
                completed: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                userId: user.uid
            };
            
            // Add to Firestore with improved error handling
            db.collection('users').doc(user.uid).collection('tasks').add(newTask)
                .then(docRef => {
                    // Add to UI
                    addTaskToUI(docRef.id, taskText, false);
                    taskInput.value = '';
                    emptyState.classList.add('hidden');
                    updateTaskStats();
                })
                .catch(error => {
                    console.error('Error adding task:', error);
                    
                    // More specific error handling
                    if (error.name === 'FirebaseError') {
                        // Handle Firebase-specific errors
                        console.error(`Firebase error (${error.code}): ${error.message}`);
                    }
                    
                    // Fallback: Store locally if offline
                    if (!navigator.onLine) {
                        const taskId = 'local_' + Date.now();
                        addTaskToUI(taskId, taskText, false);
                        
                        // Store in pending changes
                        const pendingChanges = JSON.parse(localStorage.getItem('pendingChanges') || '[]');
                        pendingChanges.push({
                            type: 'add',
                            task: newTask,
                            timestamp: Date.now()
                        });
                        localStorage.setItem('pendingChanges', JSON.stringify(pendingChanges));
                        
                        taskInput.value = '';
                        emptyState.classList.add('hidden');
                        updateTaskStats();
                    }
                });
        } else {
            // LocalStorage flow
            const newTask = {
                id: 'local_' + Date.now(),
                text: taskText,
                completed: false,
                createdAt: new Date().toISOString()
            };
            
            const tasks = JSON.parse(localStorage.getItem('dailyTasks')) || [];
            tasks.push(newTask);
            localStorage.setItem('dailyTasks', JSON.stringify(tasks));
            
            addTaskToUI(newTask.id, taskText, false);
            taskInput.value = '';
            emptyState.classList.add('hidden');
            updateTaskStats();
        }
    }
    
    // Load tasks from localStorage (when not using Firebase)
    function loadLocalTasks() {
        const tasks = JSON.parse(localStorage.getItem('dailyTasks')) || [];
        
        // Clear existing tasks
        taskList.innerHTML = '';
        
        if (tasks.length === 0) {
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
            
            tasks.forEach(task => {
                addTaskToUI(task.id || ('local_' + Date.now()), task.text, task.completed);
            });
        }
        
        updateTaskStats();
    }

    // Initialize auth state listener if Firebase is available
    if (typeof auth !== 'undefined') {
        auth.onAuthStateChanged(user => {
            if (user) {
                // User is signed in
                if (userName) userName.textContent = user.displayName || user.email;
                if (appContainer) appContainer.classList.remove('hidden');
                if (authContainer) authContainer.classList.add('hidden');
                loadUserTasks(user.uid);
            } else {
                // User is signed out
                if (appContainer) appContainer.classList.add('hidden');
                if (authContainer) authContainer.classList.remove('hidden');
                loadLocalTasks(); // Fall back to local tasks
            }
        });
    } else {
        // No Firebase, just load local tasks
        loadLocalTasks();
    }

    // Setup logout functionality if available
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (typeof auth !== 'undefined') {
                auth.signOut().catch(error => {
                    console.error('Error signing out:', error);
                });
            }
        });
    }
});

// Function to load user's tasks from Firestore
function loadUserTasks(userId) {
    if (!db) return;
    
    // Clear existing tasks
    const taskList = document.getElementById('taskList');
    taskList.innerHTML = '';
    
    // Show loading state
    document.getElementById('emptyState').textContent = 'Loading your tasks...';
    document.getElementById('emptyState').classList.remove('hidden');
    
    // Query Firestore for user's tasks with error handling
    db.collection('users').doc(userId).collection('tasks')
        .orderBy('createdAt', 'desc')
        .get()
        .then(snapshot => {
            if (snapshot.empty) {
                document.getElementById('emptyState').textContent = 'You have no tasks yet. Add one above!';
                document.getElementById('emptyState').classList.remove('hidden');
                updateTaskStats();
                return;
            }
            
            document.getElementById('emptyState').classList.add('hidden');
            
            // Add tasks to the UI
            snapshot.forEach(doc => {
                const task = doc.data();
                addTaskToUI(doc.id, task.text, task.completed);
            });
            
            updateTaskStats();
        })
        .catch(error => {
            console.error('Error loading tasks:', error);
            
            if (!navigator.onLine) {
                document.getElementById('emptyState').textContent = 'You are offline. Your changes will sync when you reconnect.';
            } else {
                document.getElementById('emptyState').textContent = 'Error loading tasks. Please refresh the page.';
            }
        });
}

// Function to add a task to the UI
function addTaskToUI(id, text, completed) {
    const taskList = document.getElementById('taskList');
    const taskItem = document.createElement('li');
    taskItem.className = 'task-item';
    taskItem.dataset.id = id;
    
    // Sanitize the input text to prevent XSS
    const sanitizedText = document.createTextNode(text).textContent;
    
    if (completed) {
        taskItem.classList.add('completed');
    }
    
    taskItem.innerHTML = `
        <div class="task-content">
            <input type="checkbox" class="task-checkbox" ${completed ? 'checked' : ''}>
            <span class="task-text">${sanitizedText}</span>
        </div>
        <button class="delete-task">×</button>
    `;
    
    // Add event listeners
    const checkbox = taskItem.querySelector('.task-checkbox');
    checkbox.addEventListener('change', () => {
        toggleTaskComplete(id, checkbox.checked);
    });
    
    const deleteBtn = taskItem.querySelector('.delete-task');
    deleteBtn.addEventListener('click', () => {
        deleteTask(id);
    });
    
    taskList.appendChild(taskItem);
    updateTaskStats();
}

// Function to toggle task completion
function toggleTaskComplete(taskId, completed) {
    const taskItem = document.querySelector(`.task-item[data-id="${taskId}"]`);
    
    if (!taskItem) {
        console.error(`Task with ID ${taskId} not found in the DOM`);
        return;
    }
    
    if (completed) {
        taskItem.classList.add('completed');
    } else {
        taskItem.classList.remove('completed');
    }
    
    const user = typeof auth !== 'undefined' ? auth.currentUser : null;
    
    if (user) {
        // Firebase user flow
        if (taskId.startsWith('local_')) {
            // Handle local task
            const pendingChanges = JSON.parse(localStorage.getItem('pendingChanges') || '[]');
            pendingChanges.push({
                type: 'update',
                taskId: taskId,
                updates: { completed: completed },
                timestamp: Date.now()
            });
            localStorage.setItem('pendingChanges', JSON.stringify(pendingChanges));
        } else {
            // Update in Firestore with improved error handling
            db.collection('users').doc(user.uid).collection('tasks').doc(taskId).update({
                completed: completed
            }).catch(error => {
                console.error('Error updating task:', error);
                
                // Store change locally if offline or other error
                const pendingChanges = JSON.parse(localStorage.getItem('pendingChanges') || '[]');
                pendingChanges.push({
                    type: 'update',
                    taskId: taskId,
                    updates: { completed: completed },
                    timestamp: Date.now()
                });
                localStorage.setItem('pendingChanges', JSON.stringify(pendingChanges));
            });
        }
    } else {
        // LocalStorage flow
        const tasks = JSON.parse(localStorage.getItem('dailyTasks')) || [];
        const taskIndex = tasks.findIndex(task => task.id === taskId);
        
        if (taskIndex !== -1) {
            tasks[taskIndex].completed = completed;
            localStorage.setItem('dailyTasks', JSON.stringify(tasks));
        }
    }
    
    updateTaskStats();
}

// Function to delete a task
function deleteTask(taskId) {
    const taskItem = document.querySelector(`.task-item[data-id="${taskId}"]`);
    
    if (!taskItem) {
        console.error(`Task with ID ${taskId} not found in the DOM`);
        return;
    }
    
    taskItem.remove();
    
    const user = typeof auth !== 'undefined' ? auth.currentUser : null;
    
    if (user) {
        // Firebase user flow
        if (taskId.startsWith('local_')) {
            // For local tasks, just remove from pending changes if it exists
            const pendingChanges = JSON.parse(localStorage.getItem('pendingChanges') || '[]');
            const filteredChanges = pendingChanges.filter(change => 
                !(change.type === 'add' && change.task && change.timestamp === parseInt(taskId.replace('local_', '')))
            );
            localStorage.setItem('pendingChanges', JSON.stringify(filteredChanges));
        } else {
            // Delete from Firestore with improved error handling
            db.collection('users').doc(user.uid).collection('tasks').doc(taskId).delete()
                .catch(error => {
                    console.error('Error deleting task:', error);
                    
                    // Store deletion locally if offline or other error
                    const pendingChanges = JSON.parse(localStorage.getItem('pendingChanges') || '[]');
                    pendingChanges.push({
                        type: 'delete',
                        taskId: taskId,
                        timestamp: Date.now()
                    });
                    localStorage.setItem('pendingChanges', JSON.stringify(pendingChanges));
                });
        }
    } else {
        // LocalStorage flow
        const tasks = JSON.parse(localStorage.getItem('dailyTasks')) || [];
        const updatedTasks = tasks.filter(task => task.id !== taskId);
        localStorage.setItem('dailyTasks', JSON.stringify(updatedTasks));
    }
    
    // Show empty state if no tasks
    const taskList = document.getElementById('taskList');
    if (taskList.children.length === 0) {
        document.getElementById('emptyState').classList.remove('hidden');
    }
    
    updateTaskStats();
}

// Function to update task statistics
function updateTaskStats() {
    const tasks = document.querySelectorAll('.task-item');
    const completedTasks = document.querySelectorAll('.task-item.completed');
    
    const totalTasksEl = document.getElementById('totalTasks');
    const completedTasksEl = document.getElementById('completedTasks');
    const remainingTasksEl = document.getElementById('remainingTasks');
    
    if (totalTasksEl) totalTasksEl.textContent = tasks.length;
    if (completedTasksEl) completedTasksEl.textContent = completedTasks.length;
    if (remainingTasksEl) remainingTasksEl.textContent = tasks.length - completedTasks.length;

    // Add this for browser tab title update with task counts
    const remainingCount = tasks.length - completedTasks.length;
    document.title = remainingCount > 0 ? `(${remainingCount}) Daily Tasks` : 'Daily Tasks';
}

// Function to sync pending changes when coming back online
function syncPendingChanges() {
    if (typeof auth === 'undefined' || typeof db === 'undefined') return;
    
    const user = auth.currentUser;
    if (!user || !navigator.onLine) return;
    
    const pendingChanges = JSON.parse(localStorage.getItem('pendingChanges') || '[]');
    if (pendingChanges.length === 0) return;
    
    console.log(`Syncing ${pendingChanges.length} pending changes...`);
    
    // Process each pending change
    const promises = pendingChanges.map(change => {
        switch (change.type) {
            case 'add':
                return db.collection('users').doc(user.uid).collection('tasks').add(change.task)
                    .then(docRef => {
                        // Update local ID reference in the UI
                        const localTaskItem = document.querySelector(`.task-item[data-id="local_${change.timestamp}"]`);
                        if (localTaskItem) {
                            localTaskItem.dataset.id = docRef.id;
                        }
                        return { success: true, change };
                    });
            
            case 'update':
                if (change.taskId.startsWith('local_')) {
                    // Can't update tasks that don't exist in Firestore yet
                    return Promise.resolve({ success: false, change, reason: 'local_task' });
                }
                return db.collection('users').doc(user.uid).collection('tasks').doc(change.taskId).update(change.updates)
                    .then(() => ({ success: true, change }));
            
            case 'delete':
                if (change.taskId.startsWith('local_')) {
                    // Can't delete tasks that don't exist in Firestore yet
                    return Promise.resolve({ success: false, change, reason: 'local_task' });
                }
                return db.collection('users').doc(user.uid).collection('tasks').doc(change.taskId).delete()
                    .then(() => ({ success: true, change }));
            
            default:
                console.warn(`Unknown change type: ${change.type}`);
                return Promise.resolve({ success: false, change, reason: 'unknown_type' });
        }
    });
    
    // Process all changes and clean up successful ones
    Promise.allSettled(promises)
        .then(results => {
            const remainingChanges = [];
            
            results.forEach((result, index) => {
                if (result.status === 'rejected' || !result.value.success) {
                    // Keep failed changes for next sync attempt, unless they're for local tasks
                    // that haven't been synced yet
                    const change = pendingChanges[index];
                    if (!(result.value && result.value.reason === 'local_task')) {
                        remainingChanges.push(change);
                    }
                }
            });
            
            // Update the pending changes in localStorage
            localStorage.setItem('pendingChanges', JSON.stringify(remainingChanges));
            console.log(`Sync completed. ${pendingChanges.length - remainingChanges.length} changes synced, ${remainingChanges.length} changes pending.`);
            
            // If we had successful syncs, refresh the task list to ensure consistency
            if (remainingChanges.length < pendingChanges.length) {
                loadUserTasks(user.uid);
            }
        });
}

// Function to handle periodic task cleanup (optional enhancement)
function cleanupOldTasks() {
    const user = typeof auth !== 'undefined' ? auth.currentUser : null;
    
    if (user) {
        // For Firebase users, we could archive completed tasks older than X days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        db.collection('users').doc(user.uid).collection('tasks')
            .where('completed', '==', true)
            .where('createdAt', '<', thirtyDaysAgo)
            .get()
            .then(snapshot => {
                const batch = db.batch();
                
                // Move to archive collection
                snapshot.forEach(doc => {
                    const taskData = doc.data();
                    
                    // Add to archive
                    const archiveRef = db.collection('users').doc(user.uid).collection('taskArchive').doc();
                    batch.set(archiveRef, {
                        ...taskData,
                        archivedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    
                    // Delete from active tasks
                    batch.delete(doc.ref);
                });
                
                return batch.commit();
            })
            .then(() => {
                console.log('Old completed tasks archived');
            })
            .catch(error => {
                console.error('Error archiving old tasks:', error);
            });
    } else {
        // For localStorage users, we just clean up old completed tasks
        const tasks = JSON.parse(localStorage.getItem('dailyTasks')) || [];
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const filteredTasks = tasks.filter(task => {
            if (!task.completed) return true;
            const taskDate = new Date(task.createdAt);
            return taskDate > thirtyDaysAgo;
        });
        
        if (filteredTasks.length < tasks.length) {
            localStorage.setItem('dailyTasks', JSON.stringify(filteredTasks));
            console.log(`Cleaned up ${tasks.length - filteredTasks.length} old completed tasks`);
        }
    }
}

// Set up optional periodic cleanup (once per day)
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
setInterval(cleanupOldTasks, CLEANUP_INTERVAL);

// Helper function to debounce events (useful for task input)
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// Improved error handling for Firebase initialization
function initializeFirebase() {
    try {
        // Check if Firebase is already available globally
        if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
            console.log('Firebase already initialized');
            return true;
        }
        
        // Check if the Firebase config is available
        if (typeof firebaseConfig === 'undefined') {
            console.warn('Firebase config not found, running in offline mode');
            return false;
        }
        
        // Initialize Firebase
        firebase.initializeApp(firebaseConfig);
        
        // Initialize Firestore
        db = firebase.firestore();
        
        // Initialize Auth
        auth = firebase.auth();
        
        console.log('Firebase initialized successfully');
        return true;
    } catch (error) {
        console.error('Failed to initialize Firebase:', error);
        return false;
    }
}

// Call Firebase initialization on page load
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        initializeFirebase();
    });
}