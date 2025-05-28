// Authentication handling
document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const authContainer = document.getElementById('authContainer');
    const appContainer = document.getElementById('appContainer');
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const showSignupBtn = document.getElementById('showSignupBtn');
    const showLoginBtn = document.getElementById('showLoginBtn');
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    const loginButton = document.getElementById('loginButton');
    const loginError = document.getElementById('loginError');
    const signupName = document.getElementById('signupName');
    const signupEmail = document.getElementById('signupEmail');
    const signupPassword = document.getElementById('signupPassword');
    const signupButton = document.getElementById('signupButton');
    const signupError = document.getElementById('signupError');
    const logoutBtn = document.getElementById('logoutBtn');
    const userName = document.getElementById('userName');

    // Toggle between login and signup forms
    showSignupBtn.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
    });

    showLoginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    });

    // Handle login
    loginButton.addEventListener('click', () => {
        const email = loginEmail.value.trim();
        const password = loginPassword.value;

        if (!email || !password) {
            loginError.textContent = 'Please fill in all fields';
            return;
        }

        loginButton.disabled = true;
        loginError.textContent = '';

        auth.signInWithEmailAndPassword(email, password)
            .then(() => {
                // Login successful - auth state change listener will handle UI updates
                loginEmail.value = '';
                loginPassword.value = '';
            })
            .catch(error => {
                console.error('Login error:', error);
                loginError.textContent = getAuthErrorMessage(error.code);
                loginButton.disabled = false;
            });
    });

    // Handle signup
    signupButton.addEventListener('click', () => {
        const name = signupName.value.trim();
        const email = signupEmail.value.trim();
        const password = signupPassword.value;

        if (!name || !email || !password) {
            signupError.textContent = 'Please fill in all fields';
            return;
        }

        if (password.length < 6) {
            signupError.textContent = 'Password must be at least 6 characters';
            return;
        }

        signupButton.disabled = true;
        signupError.textContent = '';

        auth.createUserWithEmailAndPassword(email, password)
            .then((userCredential) => {
                // Add user profile info
                return userCredential.user.updateProfile({
                    displayName: name
                }).then(() => {
                    // Create user document in Firestore
                    return db.collection('users').doc(userCredential.user.uid).set({
                        name: name,
                        email: email,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });
            })
            .then(() => {
                // Signup successful - auth state change listener will handle UI updates
                signupName.value = '';
                signupEmail.value = '';
                signupPassword.value = '';
            })
            .catch(error => {
                console.error('Signup error:', error);
                signupError.textContent = getAuthErrorMessage(error.code);
                signupButton.disabled = false;
            });
    });

    // Handle logout
    logoutBtn.addEventListener('click', () => {
        auth.signOut().catch(error => {
            console.error('Logout error:', error);
        });
    });

    // Listen for authentication state changes
    auth.onAuthStateChanged(user => {
        if (user) {
            // User is signed in
            authContainer.classList.add('hidden');
            appContainer.classList.remove('hidden');
            userName.textContent = user.displayName || user.email;
            
            // Load user's tasks
            loadUserTasks(user.uid);
            
            // Reset form states
            loginButton.disabled = false;
            signupButton.disabled = false;
            loginError.textContent = '';
            signupError.textContent = '';
        } else {
            // User is signed out
            appContainer.classList.add('hidden');
            authContainer.classList.remove('hidden');
            loginForm.classList.remove('hidden');
            signupForm.classList.add('hidden');
            
            // Clear task list
            const taskList = document.getElementById('taskList');
            taskList.innerHTML = '';
            updateTaskStats();
        }
    });

    // Helper function to get user-friendly error messages
    function getAuthErrorMessage(errorCode) {
        switch (errorCode) {
            case 'auth/email-already-in-use':
                return 'This email is already registered';
            case 'auth/invalid-email':
                return 'Invalid email address';
            case 'auth/weak-password':
                return 'Password is too weak';
            case 'auth/user-not-found':
                return 'No account found with this email';
            case 'auth/wrong-password':
                return 'Incorrect password';
            case 'auth/too-many-requests':
                return 'Too many failed attempts. Please try again later';
            default:
                return 'An error occurred. Please try again';
        }
    }
});

// Function to load user's tasks from Firestore
function loadUserTasks(userId) {
    // Clear existing tasks
    const taskList = document.getElementById('taskList');
    taskList.innerHTML = '';
    
    // Show loading state
    document.getElementById('emptyState').textContent = 'Loading your tasks...';
    
    // Query Firestore for user's tasks
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
            document.getElementById('emptyState').textContent = 'Error loading tasks. Please refresh the page.';
        });
}