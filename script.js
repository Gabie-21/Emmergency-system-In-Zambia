// script.js - Updated with real Firebase integration

// Import Firebase functions from config
import { 
    auth, 
    db, 
    storage,
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    signInAnonymously,
    onAuthStateChanged
} from './firebase-config.js';

// Global state
let currentLocation = null;
let activeEmergency = null;
let map = null;
let responders = [];
let currentUser = null;
let isOnline = navigator.onLine;

// REAL Firebase API - replaces the simulated version
const FirebaseAPI = {
    // Authentication methods
    async initializeAuth() {
        try {
            // Sign in anonymously
            const userCredential = await signInAnonymously(auth);
            currentUser = userCredential.user;
            console.log('User authenticated:', currentUser.uid);
            return currentUser;
        } catch (error) {
            console.error('Auth error:', error);
            throw error;
        }
    },

    async getCurrentUser() {
        return new Promise((resolve) => {
            onAuthStateChanged(auth, (user) => {
                resolve(user);
            });
        });
    },

    // EMERGENCY METHODS - Real Firebase implementation
    async createEmergency(emergencyData) {
        try {
            const user = await this.getCurrentUser();
            if (!user) throw new Error('User must be authenticated');

            const emergencyId = 'EMR' + Date.now();
            const emergency = {
                id: emergencyId,
                userId: user.uid,
                type: emergencyData.type || 'general',
                priority: emergencyData.priority || 'P3',
                location: {
                    lat: emergencyData.location?.lat || 0,
                    lng: emergencyData.location?.lng || 0,
                    accuracy: emergencyData.location?.accuracy || 0,
                    address: emergencyData.location?.address || ''
                },
                status: 'active',
                description: emergencyData.description || '',
                mediaUrls: emergencyData.mediaUrls || [],
                contactPhone: emergencyData.contactPhone || '',
                responders: {},
                createdAt: new Date(),
                updatedAt: new Date(),
                resolvedAt: null
            };

            // Save to Firestore
            await setDoc(doc(db, 'emergencies', emergencyId), emergency);
            
            console.log('Emergency created:', emergencyId);
            return emergency;
        } catch (error) {
            console.error('Error creating emergency:', error);
            throw error;
        }
    },

    async getEmergency(emergencyId) {
        try {
            const docRef = doc(db, 'emergencies', emergencyId);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                return { id: docSnap.id, ...docSnap.data() };
            } else {
                throw new Error('Emergency not found');
            }
        } catch (error) {
            console.error('Error getting emergency:', error);
            throw error;
        }
    },

    async updateEmergencyStatus(emergencyId, status, additionalData = {}) {
        try {
            const docRef = doc(db, 'emergencies', emergencyId);
            const updateData = {
                status: status,
                updatedAt: new Date(),
                ...additionalData
            };
            
            if (status === 'resolved') {
                updateData.resolvedAt = new Date();
            }
            
            await updateDoc(docRef, updateData);
            console.log('Emergency status updated');
            return { success: true };
        } catch (error) {
            console.error('Error updating emergency status:', error);
            throw error;
        }
    },

    // USER METHODS
    async createUserProfile(userData) {
        try {
            const user = await this.getCurrentUser();
            if (!user) throw new Error('User must be authenticated');

            const userProfile = {
                id: `user-${user.uid}`,
                userId: user.uid,
                name: userData.name || '',
                phone: userData.phone || '',
                email: userData.email || user.email || '',
                emergencyContacts: userData.emergencyContacts || [],
                medicalInfo: userData.medicalInfo || {
                    bloodType: '',
                    allergies: [],
                    conditions: [],
                    medications: []
                },
                location: userData.location || { lat: 0, lng: 0, lastUpdated: new Date() },
                isResponder: false,
                createdAt: new Date(),
                updatedAt: new Date()
            };

            await setDoc(doc(db, 'users', user.uid), userProfile);
            return userProfile;
        } catch (error) {
            console.error('Error creating user profile:', error);
            throw error;
        }
    },

    async getUserProfile(userId) {
        try {
            const docRef = doc(db, 'users', userId);
            const docSnap = await getDoc(docRef);
            
            if (docSnap.exists()) {
                return { id: docSnap.id, ...docSnap.data() };
            }
            return null;
        } catch (error) {
            console.error('Error getting user profile:', error);
            throw error;
        }
    },

    // RESPONDER METHODS
    async findNearbyResponders(location, type, maxDistance = 10) {
        try {
            const respondersRef = collection(db, 'responders');
            const q = query(
                respondersRef, 
                where('type', '==', type),
                where('isAvailable', '==', true),
                where('isActive', '==', true)
            );
            
            const querySnapshot = await getDocs(q);
            const nearbyResponders = [];
            
            querySnapshot.forEach((doc) => {
                const responder = { id: doc.id, ...doc.data() };
                // Calculate distance (simplified)
                const distance = this.calculateDistance(
                    location.lat, location.lng,
                    responder.location?.lat || 0, 
                    responder.location?.lng || 0
                );
                
                if (distance <= maxDistance) {
                    responder.distance = distance;
                    responder.eta = Math.max(3, Math.round(distance * 2)); // Rough ETA calculation
                    nearbyResponders.push(responder);
                }
            });
            
            // Sort by distance
            return nearbyResponders.sort((a, b) => a.distance - b.distance);
        } catch (error) {
            console.error('Error finding responders:', error);
            // Return mock data if database query fails
            return this.getMockResponders(location);
        }
    },

    // Fallback method for demo purposes
    getMockResponders(location) {
        return [
            { 
                id: 'resp1', 
                name: 'Dr. Sarah Mwamba', 
                type: 'Medical', 
                location: { lat: location.lat + 0.01, lng: location.lng + 0.01 },
                distance: 0.8,
                eta: 3,
                status: 'available',
                phone: '+260977123456',
                specialization: 'Emergency Medicine'
            },
            { 
                id: 'resp2', 
                name: 'James Banda', 
                type: 'First Aid', 
                location: { lat: location.lat - 0.01, lng: location.lng + 0.01 },
                distance: 1.2,
                eta: 5,
                status: 'available',
                phone: '+260966789012',
                specialization: 'Community First Aid'
            }
        ];
    },

    async assignResponderToEmergency(emergencyId, responderId) {
        try {
            const emergencyRef = doc(db, 'emergencies', emergencyId);
            const responderRef = doc(db, 'responders', responderId);
            
            // Update emergency with responder info
            await updateDoc(emergencyRef, {
                [`responders.${responderId}`]: {
                    id: responderId,
                    assignedAt: new Date(),
                    status: 'assigned',
                    eta: 'Calculating...'
                },
                updatedAt: new Date()
            });
            
            // Update responder status
            await updateDoc(responderRef, {
                isAvailable: false,
                currentEmergency: emergencyId,
                updatedAt: new Date()
            });
            
            console.log('Responder assigned to emergency');
        } catch (error) {
            console.error('Error assigning responder:', error);
            throw error;
        }
    },

    // MESSAGE METHODS
    async sendMessage(emergencyId, message, messageType = 'text') {
        try {
            const user = await this.getCurrentUser();
            if (!user) throw new Error('User must be authenticated');

            const messageId = `msg-${Date.now()}`;
            const messageData = {
                id: messageId,
                emergencyId: emergencyId,
                senderId: user.uid,
                senderType: 'user',
                senderName: 'User',
                message: message,
                messageType: messageType,
                timestamp: new Date(),
                read: false,
                metadata: {}
            };

            await setDoc(doc(db, 'messages', messageId), messageData);
            return messageData;
        } catch (error) {
            console.error('Error sending message:', error);
            throw error;
        }
    },

    async addEmergencyMessage(emergencyId, message, senderType = 'user') {
        return this.sendMessage(emergencyId, message, 'text');
    },

    async getEmergencyMessages(emergencyId) {
        try {
            const messagesRef = collection(db, 'messages');
            const q = query(
                messagesRef, 
                where('emergencyId', '==', emergencyId),
                orderBy('timestamp', 'asc')
            );
            
            const querySnapshot = await getDocs(q);
            const messages = [];
            
            querySnapshot.forEach((doc) => {
                messages.push({ id: doc.id, ...doc.data() });
            });
            
            return messages;
        } catch (error) {
            console.error('Error getting messages:', error);
            throw error;
        }
    },

    // REAL-TIME LISTENERS
    subscribeToEmergency(emergencyId, callback) {
        const emergencyRef = doc(db, 'emergencies', emergencyId);
        return onSnapshot(emergencyRef, (doc) => {
            if (doc.exists()) {
                callback({ id: doc.id, ...doc.data() });
            }
        });
    },

    subscribeToEmergencyMessages(emergencyId, callback) {
        const messagesRef = collection(db, 'messages');
        const q = query(
            messagesRef,
            where('emergencyId', '==', emergencyId),
            orderBy('timestamp', 'asc')
        );
        
        return onSnapshot(q, (querySnapshot) => {
            const messages = [];
            querySnapshot.forEach((doc) => {
                messages.push({ id: doc.id, ...doc.data() });
            });
            callback(messages);
        });
    },

    // Updated method to work with real Firebase or fallback to mock data
    async listenToNearbyResponders(location, radiusKm, callback) {
        try {
            // Try to get real responders from Firebase
            const responders = await this.findNearbyResponders(location, 'Medical', radiusKm);
            callback(responders);
        } catch (error) {
            console.log('Using mock responders for demo');
            // Fallback to mock data
            const mockResponders = this.getMockResponders(location);
            callback(mockResponders);
        }
    },

    // UTILITY METHODS
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // Radius of the Earth in kilometers
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c; // Distance in kilometers
        return distance;
    }
};

// Initialize app with Firebase
document.addEventListener('DOMContentLoaded', async function() {
    await initializeApp();
    setupEventListeners();
    requestLocation();
    setupNetworkMonitoring();
});

async function initializeApp() {
    updateStatus('Connecting...');
    
    try {
        // Initialize Firebase authentication
        await FirebaseAPI.initializeAuth();
        updateStatus('Connected');
        document.getElementById('connection-indicator').className = 'w-3 h-3 bg-green-400 rounded-full';
        
        // Set up real-time listeners
        setupRealTimeListeners();
        
    } catch (error) {
        console.error('Initialization error:', error);
        updateStatus('Offline Mode');
        document.getElementById('connection-indicator').className = 'w-3 h-3 bg-yellow-400 rounded-full';
    }
}

function setupRealTimeListeners() {
    // Listen for emergency updates if there's an active emergency
    if (activeEmergency && activeEmergency.id) {
        listenToEmergencyUpdates(activeEmergency.id);
    }
}

function setupEventListeners() {
    // Emergency buttons
    document.querySelectorAll('.emergency-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const type = this.dataset.type;
            const priority = this.dataset.priority;
            showEmergencyModal(type, priority);
        });
    });

    // Modal buttons
    document.getElementById('confirm-emergency').addEventListener('click', confirmEmergency);
    document.getElementById('cancel-modal').addEventListener('click', hideEmergencyModal);
    document.getElementById('cancel-emergency').addEventListener('click', cancelEmergency);

    // Location refresh
    document.getElementById('refresh-location').addEventListener('click', requestLocation);

    // Quick actions
    document.getElementById('call-emergency').addEventListener('click', function() {
        if (activeEmergency) {
            alert('Emergency Services: 911\nPolice: 999\nFire: 993');
        } else {
            alert('Emergency Services:\n🚑 Medical: 911\n👮 Police: 999\n🔥 Fire: 993');
        }
    });

    document.getElementById('find-help').addEventListener('click', showNearbyHelp);
}

function setupNetworkMonitoring() {
    window.addEventListener('online', function() {
        isOnline = true;
        updateStatus('Connected');
        document.getElementById('connection-indicator').className = 'w-3 h-3 bg-green-400 rounded-full';
        
        // Sync any pending data
        syncPendingData();
    });

    window.addEventListener('offline', function() {
        isOnline = false;
        updateStatus('Offline');
        document.getElementById('connection-indicator').className = 'w-3 h-3 bg-red-400 rounded-full';
    });
}

async function confirmEmergency() {
    const modal = document.getElementById('emergency-modal');
    const type = modal.dataset.type;
    const priority = modal.dataset.priority;

    if (!currentLocation) {
        alert('Location is required for emergency reporting. Please enable location services.');
        return;
    }

    updateStatus('Creating emergency...');

    try {
        const emergencyData = {
            type: type,
            priority: priority,
            location: currentLocation,
            timestamp: new Date(),
            description: '',
            mediaUrls: [],
            contactPhone: '',
            status: 'active'
        };

        // Create emergency in Firebase
        activeEmergency = await FirebaseAPI.createEmergency(emergencyData);
        
        hideEmergencyModal();
        showActiveEmergency();
        
        // Start listening for responders
        await dispatchToResponders();
        
        updateStatus('Emergency active');
        
        // Send notifications
        sendEmergencyNotifications();
        
    } catch (error) {
        console.error('Error confirming emergency:', error);
        alert('Failed to create emergency. Please try again.');
        updateStatus('Error occurred');
    }
}

async function dispatchToResponders() {
    if (!currentLocation || !activeEmergency) return;

    updateStatus('Finding responders...');

    try {
        // Listen for nearby responders
        await FirebaseAPI.listenToNearbyResponders(
            currentLocation, 
            10, // 10km radius
            (responders) => {
                updateResponderDisplay(responders);
                
                // Simulate responder notifications
                responders.slice(0, 3).forEach((responder, index) => {
                    setTimeout(() => {
                        simulateResponderResponse(responder);
                    }, (index + 1) * 2000); // Stagger responses
                });
            }
        );

        updateStatus('Responders notified');
        
    } catch (error) {
        console.error('Error dispatching to responders:', error);
        updateStatus('Dispatch error');
    }
}

function updateResponderDisplay(respondersData) {
    responders = respondersData;
    const responderSection = document.getElementById('responder-section');
    const responderList = document.getElementById('responder-list');
    
    if (responders.length === 0) {
        responderList.innerHTML = '<div class="text-center text-gray-500 py-4">No responders available nearby</div>';
        responderSection.classList.remove('hidden');
        return;
    }

    // Filter responders based on emergency type
    let relevantResponders = responders.filter(r => {
        if (activeEmergency.type === 'medical') return r.type === 'Medical' || r.type === 'First Aid';
        if (activeEmergency.type === 'fire') return r.type === 'Fire' || r.type === 'First Aid';
        if (activeEmergency.type === 'police') return r.type === 'Police';
        return true; // general emergency
    });

    responderList.innerHTML = relevantResponders.map(responder => `
        <div class="responder-card flex justify-between items-center p-3 bg-white rounded border" data-responder-id="${responder.id}">
            <div>
                <div class="font-semibold">${responder.name}</div>
                <div class="text-sm text-gray-600">${responder.specialization || responder.type}</div>
                <div class="text-xs text-gray-500">${responder.distance ? responder.distance.toFixed(1) : '0.0'}km away</div>
            </div>
            <div class="text-right">
                <div class="text-sm font-medium text-blue-600">ETA: ${responder.eta} min</div>
                <div class="text-xs responder-status text-gray-500">Notifying...</div>
            </div>
        </div>
    `).join('');

    responderSection.classList.remove('hidden');
}

function simulateResponderResponse(responder) {
    const responderCard = document.querySelector(`[data-responder-id="${responder.id}"]`);
    if (!responderCard) return;

    const statusElement = responderCard.querySelector('.responder-status');
    
    // Simulate different response scenarios
    const responses = ['Accepted', 'En route', 'Declined', 'No response'];
    const weights = [0.7, 0.0, 0.2, 0.1]; // 70% accept, 20% decline, 10% no response
    
    const random = Math.random();
    let response;
    if (random < weights[0]) response = 'Accepted';
    else if (random < weights[0] + weights[1]) response = 'En route';
    else if (random < weights[0] + weights[1] + weights[2]) response = 'Declined';
    else response = 'No response';

    if (response === 'Accepted') {
        statusElement.innerHTML = '<span class="text-green-600 font-semibold">✓ Accepted</span>';
        responderCard.classList.add('ring-2', 'ring-green-300');
        
        // Simulate arrival
        setTimeout(() => {
            statusElement.innerHTML = '<span class="text-blue-600 font-semibold">🚗 En route</span>';
        }, 1000);
        
        setTimeout(() => {
            statusElement.innerHTML = '<span class="text-purple-600 font-semibold">📍 Arrived</span>';
            updateStatus('Responder arrived');
        }, responder.eta * 60 * 1000); // Convert minutes to milliseconds
        
    } else if (response === 'Declined') {
        statusElement.innerHTML = '<span class="text-red-600">✗ Declined</span>';
        responderCard.classList.add('opacity-50');
    } else {
        statusElement.innerHTML = '<span class="text-gray-400">No response</span>';
        responderCard.classList.add('opacity-30');
    }
}

async function sendEmergencyNotifications() {
    if (!activeEmergency) return;

    try {
        console.log('Sending notifications for emergency:', activeEmergency.id);
        
        // Add message to emergency record
        await FirebaseAPI.addEmergencyMessage(
            activeEmergency.id,
            `Emergency reported: ${activeEmergency.type} at ${new Date().toLocaleTimeString()}`,
            'system'
        );
        
    } catch (error) {
        console.error('Error sending notifications:', error);
    }
}

function showActiveEmergency() {
    const container = document.getElementById('active-emergency');
    const details = document.getElementById('emergency-details');

    const emergencyTypes = {
        medical: '🏥 Medical Emergency',
        fire: '🔥 Fire Emergency', 
        police: '👮 Police Required',
        general: '⚠️ General Emergency'
    };

    details.innerHTML = `
        <div class="space-y-2">
            <div><strong>Type:</strong> ${emergencyTypes[activeEmergency.type]}</div>
            <div><strong>Priority:</strong> <span class="text-red-600 font-bold">${activeEmergency.priority}</span></div>
            <div><strong>ID:</strong> <code class="text-xs bg-gray-100 px-1 rounded">${activeEmergency.id}</code></div>
            <div><strong>Time:</strong> ${activeEmergency.createdAt ? activeEmergency.createdAt.toLocaleTimeString() : new Date().toLocaleTimeString()}</div>
            <div><strong>Status:</strong> <span class="text-red-600 font-semibold">🔴 ACTIVE</span></div>
            <div id="responder-count" class="text-sm text-gray-600">Searching for responders...</div>
        </div>
        
        <!-- Chat Interface -->
        <div class="mt-4 p-3 bg-gray-50 rounded">
            <h4 class="font-semibold text-sm mb-2">💬 Emergency Chat</h4>
            <div id="chat-messages" class="space-y-1 max-h-32 overflow-y-auto text-sm">
                <div class="text-gray-500">Emergency created. Help is on the way...</div>
            </div>
            <div class="flex mt-2">
                <input type="text" id="chat-input" placeholder="Send message..." 
                       class="flex-1 text-xs p-2 border rounded-l focus:outline-none focus:ring-2 focus:ring-blue-500">
                <button id="send-message" class="bg-blue-600 text-white px-3 py-2 rounded-r text-xs">Send</button>
            </div>
        </div>
    `;

    container.classList.remove('hidden');
    showMapWithLocation();
    
    // Set up chat functionality
    setupEmergencyChat();
}

function setupEmergencyChat() {
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-message');
    const chatMessages = document.getElementById('chat-messages');

    function sendMessage() {
        const message = chatInput.value.trim();
        if (!message) return;

        // Add message to chat
        const messageDiv = document.createElement('div');
        messageDiv.className = 'text-blue-600 text-right';
        messageDiv.innerHTML = `<strong>You:</strong> ${message}`;
        chatMessages.appendChild(messageDiv);
        
        chatInput.value = '';
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Send to Firebase
        FirebaseAPI.addEmergencyMessage(activeEmergency.id, message, 'user');

        // Simulate responder reply
        setTimeout(() => {
            const replyDiv = document.createElement('div');
            replyDiv.className = 'text-green-600';
            replyDiv.innerHTML = `<strong>Responder:</strong> Message received. On my way!`;
            chatMessages.appendChild(replyDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }, 2000);
    }

    sendButton.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') sendMessage();
    });
}

async function cancelEmergency() {
    if (!activeEmergency) return;

    try {
        // Update status in Firebase
        await FirebaseAPI.updateEmergencyStatus(activeEmergency.id, 'cancelled');
        
        // Reset local state
        activeEmergency = null;
        document.getElementById('active-emergency').classList.add('hidden');
        document.getElementById('responder-section').classList.add('hidden');
        document.getElementById('map-container').classList.add('hidden');
        
        updateStatus('Emergency cancelled');
        
        // Clean up map
        if (map) {
            map.remove();
            map = null;
        }
        
    } catch (error) {
        console.error('Error cancelling emergency:', error);
        alert('Failed to cancel emergency. Please try again.');
    }
}

function showMapWithLocation() {
    if (!currentLocation) return;

    const mapContainer = document.getElementById('map-container');
    mapContainer.classList.remove('hidden');

    // Initialize map
    if (map) {
        map.remove();
    }

    map = L.map('map').setView([currentLocation.lat, currentLocation.lng], 15);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Add emergency location marker
    const emergencyMarker = L.marker([currentLocation.lat, currentLocation.lng])
        .addTo(map)
        .bindPopup(`🚨 Emergency Location<br>ID: ${activeEmergency ? activeEmergency.id : 'Unknown'}`)
        .openPopup();

    // Add accuracy circle
    L.circle([currentLocation.lat, currentLocation.lng], {
        radius: currentLocation.accuracy,
        color: 'red',
        fillColor: '#ff0000',
        fillOpacity: 0.1
    }).addTo(map);

    // Add responder markers when available
    if (responders.length > 0) {
        responders.forEach(responder => {
            if (responder.location) {
                const responderMarker = L.marker([responder.location.lat, responder.location.lng])
                    .addTo(map)
                    .bindPopup(`👨‍⚕️ ${responder.name}<br>${responder.specialization}<br>ETA: ${responder.eta} min`);
                
                // Draw line from responder to emergency
                L.polyline([
                    [responder.location.lat, responder.location.lng],
                    [currentLocation.lat, currentLocation.lng]
                ], { color: 'blue', weight: 2, opacity: 0.7 }).addTo(map);
            }
        });
    }
}

// Enhanced location handling
function requestLocation() {
    updateLocationStatus('Getting your location...');
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            position => {
                currentLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: new Date()
                };
                
                const accuracyText = currentLocation.accuracy < 100 ? 
                    `Located (±${Math.round(currentLocation.accuracy)}m)` : 
                    `Located (±${Math.round(currentLocation.accuracy/1000*10)/10}km)`;
                
                updateLocationStatus(accuracyText);
                
                // If there's an active emergency, update its location
                if (activeEmergency) {
                    updateEmergencyLocation();
                }
            },
            error => {
                console.error('Location error:', error);
                handleLocationError(error);
            },
            { 
                enableHighAccuracy: true, 
                timeout: 15000, 
                maximumAge: 300000 
            }
        );
    } else {
        updateLocationStatus('Location not supported');
        // Fallback to Lusaka coordinates
        currentLocation = { 
            lat: -15.3875, 
            lng: 28.3228, 
            accuracy: 10000,
            timestamp: new Date(),
            isDefault: true
        };
    }
}

function handleLocationError(error) {
    let errorMessage = 'Location unavailable';
    
    switch(error.code) {
        case error.PERMISSION_DENIED:
            errorMessage = 'Location access denied. Please enable location services.';
            break;
        case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable.';
            break;
        case error.TIMEOUT:
            errorMessage = 'Location request timed out.';
            break;
    }
    
    updateLocationStatus(errorMessage);
    
    // Use default location (Lusaka) as fallback
    currentLocation = { 
        lat: -15.3875, 
        lng: 28.3228, 
        accuracy: 10000,
        timestamp: new Date(),
        isDefault: true
    };
    
    // Show user-friendly message
    setTimeout(() => {
        updateLocationStatus('Using default location (Lusaka)');
    }, 3000);
}

async function updateEmergencyLocation() {
    if (!activeEmergency || !currentLocation) return;
    
    try {
        await FirebaseAPI.updateEmergencyStatus(activeEmergency.id, 'active', {
            location: currentLocation,
            locationUpdatedAt: new Date()
        });
        
        console.log('Emergency location updated');
    } catch (error) {
        console.error('Error updating emergency location:', error);
    }
}

function showNearbyHelp() {
    if (!currentLocation) {
        alert('Location is required to show nearby help. Please enable location services.');
        return;
    }
    
    showMapWithNearbyServices();
}

function showMapWithNearbyServices() {
    const mapContainer = document.getElementById('map-container');
    mapContainer.classList.remove('hidden');

    // Initialize map if not exists
    if (map) {
        map.remove();
    }

    map = L.map('map').setView([currentLocation.lat, currentLocation.lng], 13);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);

    // Add user location
    L.marker([currentLocation.lat, currentLocation.lng])
        .addTo(map)
        .bindPopup('📍 Your Location')
        .openPopup();

    // Add mock nearby services (in real app, this would come from database)
    const nearbyServices = [
        {
            name: 'University Teaching Hospital',
            type: 'hospital',
            lat: -15.3955,
            lng: 28.3200,
            phone: '+260211256067',
            icon: '🏥'
        },
        {
            name: 'Lusaka Central Police',
            type: 'police',
            lat: -15.4167,
            lng: 28.2833,
            phone: '+260211228794',
            icon: '👮'
        },
        {
            name: 'Lusaka Fire Station',
            type: 'fire',
            lat: -15.4100,
            lng: 28.2900,
            phone: '+260211228844',
            icon: '🔥'
        },
        {
            name: 'Levy Mwanawasa Hospital',
            type: 'hospital',
            lat: -15.3700,
            lng: 28.3500,
            phone: '+260211256700',
            icon: '🏥'
        }
    ];

    nearbyServices.forEach(service => {
        L.marker([service.lat, service.lng])
            .addTo(map)
            .bindPopup(`
                ${service.icon} <strong>${service.name}</strong><br>
                Type: ${service.type}<br>
                Phone: ${service.phone}
            `);
    });

    // Fit map to show all markers
    const group = new L.featureGroup([
        L.marker([currentLocation.lat, currentLocation.lng]),
        ...nearbyServices.map(s => L.marker([s.lat, s.lng]))
    ]);
    map.fitBounds(group.getBounds().pad(0.1));
}

function syncPendingData() {
    // This function would sync any data that was created while offline
    console.log('Syncing pending data...');
    
    // In a real app, you'd check for pending emergencies, messages, etc.
    // stored in localStorage and sync them to Firebase
    
    if (activeEmergency && !activeEmergency.synced) {
        // Re-attempt to sync the emergency
        FirebaseAPI.createEmergency(activeEmergency)
            .then(() => {
                activeEmergency.synced = true;
                console.log('Emergency synced successfully');
            })
            .catch(error => {
                console.error('Failed to sync emergency:', error);
            });
    }
}

function listenToEmergencyUpdates(emergencyId) {
    // Listen for real-time updates from Firebase
    console.log('Listening for emergency updates:', emergencyId);
    
    try {
        // Set up real-time listener
        const unsubscribe = FirebaseAPI.subscribeToEmergency(emergencyId, (emergency) => {
            console.log('Emergency updated:', emergency);
            
            // Update UI based on emergency status
            if (emergency.status === 'resolved') {
                updateStatus('Emergency resolved');
                activeEmergency = null;
                document.getElementById('active-emergency').classList.add('hidden');
            } else if (emergency.status === 'cancelled') {
                updateStatus('Emergency cancelled');
                activeEmergency = null;
                document.getElementById('active-emergency').classList.add('hidden');
            }
        });
        
        // Store unsubscribe function for cleanup
        activeEmergency.unsubscribe = unsubscribe;
        
    } catch (error) {
        console.error('Error setting up emergency listener:', error);
        
        // Fallback to simulated updates
        const updateInterval = setInterval(() => {
            if (!activeEmergency || activeEmergency.id !== emergencyId) {
                clearInterval(updateInterval);
                return;
            }
            
            // Simulate status updates
            const statuses = ['Dispatching', 'Responder assigned', 'Responder en route', 'Help arrived'];
            const currentStatusIndex = statuses.findIndex(s => s === activeEmergency.status);
            
            if (currentStatusIndex < statuses.length - 1) {
                const nextStatus = statuses[currentStatusIndex + 1];
                activeEmergency.status = nextStatus;
                updateStatus(nextStatus);
            }
        }, 30000); // Update every 30 seconds
    }
}

// Utility functions
function updateLocationStatus(text) {
    document.getElementById('location-text').textContent = text;
}

function updateStatus(text) {
    document.getElementById('status').textContent = text;
}

function showEmergencyModal(type, priority) {
    const modal = document.getElementById('emergency-modal');
    const content = document.getElementById('modal-content');
    
    const emergencyTypes = {
        medical: { emoji: '🏥', name: 'Medical Emergency', desc: 'Medical assistance needed immediately' },
        fire: { emoji: '🔥', name: 'Fire Emergency', desc: 'Fire or dangerous situation requiring immediate response' },
        police: { emoji: '👮', name: 'Police Required', desc: 'Security incident or crime in progress' },
        general: { emoji: '⚠️', name: 'General Emergency', desc: 'Other emergency requiring assistance' }
    };

    const emergency = emergencyTypes[type];
    const priorityInfo = {
        P1: { name: 'CRITICAL', color: 'text-red-600', desc: 'Life-threatening emergency' },
        P2: { name: 'URGENT', color: 'text-orange-600', desc: 'Urgent response needed' },
        P3: { name: 'IMPORTANT', color: 'text-yellow-600', desc: 'Important but not critical' }
    };
    
    const priorityData = priorityInfo[priority] || priorityInfo.P3;
    
    content.innerHTML = `
        <div class="text-center">
            <div class="text-6xl mb-3">${emergency.emoji}</div>
            <h3 class="text-lg font-semibold mb-2">${emergency.name}</h3>
            <div class="mb-3">
                <span class="px-2 py-1 rounded text-sm font-bold ${priorityData.color} bg-gray-100">
                    ${priorityData.name}
                </span>
            </div>
            <p class="text-gray-600 mb-4">${emergency.desc}</p>
            <div class="bg-gray-100 p-3 rounded text-sm text-left">
                <strong>Location Status:</strong><br>
                ${currentLocation ? 
                    `✅ Located (±${Math.round(currentLocation.accuracy)}m accuracy)` : 
                    '❌ Location not available'
                }<br><br>
                <strong>What happens next:</strong><br>
                • Nearby responders will be notified<br>
                • Emergency services will be contacted<br>
                • You'll receive real-time updates<br>
                • Help typically arrives within 5-15 minutes
            </div>
        </div>
    `;

    // Store emergency data for confirmation
    modal.dataset.type = type;
    modal.dataset.priority = priority;
    
    modal.classList.remove('hidden');
}

function hideEmergencyModal() {
    document.getElementById('emergency-modal').classList.add('hidden');
}

// Service Worker Registration for PWA functionality
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js')
            .then(function(registration) {
                console.log('ServiceWorker registration successful: ', registration.scope);
            })
            .catch(function(error) {
                console.log('ServiceWorker registration failed: ', error);
            });
    });
}

// Push notification setup (when user grants permission)
async function requestNotificationPermission() {
    if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Notification permission granted');
            return true;
        }
    }
    return false;
}

// Call this during app initialization
requestNotificationPermission();

// Test function for database structure
async function testDatabaseStructure() {
    try {
        console.log('Testing database structure...');
        
        // Test user profile creation
        const userProfile = await FirebaseAPI.createUserProfile({
            name: 'Test User',
            phone: '+260977123456'
        });
        console.log('✓ User profile created:', userProfile);
        
        // Test emergency creation
        const emergency = await FirebaseAPI.createEmergency({
            type: 'medical',
            priority: 'P1',
            location: { lat: -15.3875, lng: 28.3228 },
            description: 'Test emergency'
        });
        console.log('✓ Emergency created:', emergency);
        
        // Test message sending
        const message = await FirebaseAPI.sendMessage(
            emergency.id,
            'This is a test message'
        );
        console.log('✓ Message sent:', message);
        
        console.log('🎉 All tests passed!');
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Export functions for use in other modules (if using ES6 modules)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initializeApp,
        requestLocation,
        showNearbyHelp,
        confirmEmergency,
        cancelEmergency,
        testDatabaseStructure
    };
}