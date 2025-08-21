// main.js - Updated main script with Firebase integration

// main.js - Updated main script with Firebase integration

// main.js - Updated main script with Firebase integration

// Import Firebase SDK
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js';

// Import your configuration
import { firebaseConfig, COLLECTIONS, EMERGENCY_TYPES, EMERGENCY_PRIORITIES } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const analytics = getAnalytics(app);

// Your emergency response functions

// Global state
let currentLocation = null;
let activeEmergency = null;
let map = null;
let responders = [];
let currentUser = null;
let isOnline = navigator.onLine;

// Simulated Firebase functions for development (replace with real Firebase when ready)
const FirebaseAPI = {
  // Simulate user authentication
  async initializeAuth() {
    return new Promise((resolve) => {
      setTimeout(() => {
        currentUser = { uid: 'demo-user-' + Date.now(), isAnonymous: true };
        console.log('Demo user authenticated:', currentUser.uid);
        resolve(currentUser);
      }, 1000);
    });
  },

  // Simulate emergency creation
  async createEmergency(emergencyData) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const emergency = {
          ...emergencyData,
          id: 'EMR' + Date.now(),
          userId: currentUser.uid,
          createdAt: new Date(),
          updatedAt: new Date(),
          status: 'active',
          responders: [],
          messages: []
        };
        
        console.log('Emergency created:', emergency);
        resolve(emergency);
      }, 500);
    });
  },

  // Simulate responder listening
  async listenToNearbyResponders(location, radiusKm, callback) {
    setTimeout(() => {
      const mockResponders = [
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
        },
        { 
          id: 'resp3', 
          name: 'Fire Station Central', 
          type: 'Fire', 
          location: { lat: location.lat + 0.02, lng: location.lng - 0.01 },
          distance: 2.1,
          eta: 8,
          status: 'available',
          phone: '+260955123789',
          specialization: 'Fire & Rescue'
        }
      ];
      callback(mockResponders);
    }, 1000);
  },

  // Simulate emergency updates
  async updateEmergencyStatus(emergencyId, status, additionalData = {}) {
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log('Emergency status updated:', { emergencyId, status, ...additionalData });
        resolve({ success: true });
      }, 300);
    });
  },

  // Simulate message sending
  async addEmergencyMessage(emergencyId, message, senderType = 'user') {
    return new Promise((resolve) => {
      setTimeout(() => {
        const messageData = {
          id: 'msg' + Date.now(),
          emergencyId,
          senderId: currentUser.uid,
          senderType,
          message,
          timestamp: new Date(),
          read: false
        };
        console.log('Message sent:', messageData);
        resolve(messageData);
      }, 200);
    });
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
            // In real app: integrate with WebRTC or phone calling
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
            description: '', // Could add description input in modal
            mediaUrls: [],
            contactPhone: '', // Could add contact info
            status: 'active'
        };

        // Create emergency in Firebase
        activeEmergency = await FirebaseAPI.createEmergency(emergencyData);
        
        hideEmergencyModal();
        showActiveEmergency();
        
        // Start listening for responders
        await dispatchToResponders();
        
        updateStatus('Emergency active');
        
        // Send notifications (simulate for now)
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
                <div class="text-xs text-gray-500">${responder.distance.toFixed(1)}km away</div>
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
        // In real implementation, this would send SMS notifications
        console.log('Sending notifications for emergency:', activeEmergency.id);
        
        // Simulate SMS to emergency contacts
        const emergencyContacts = ['+260977123456', '+260966789012']; // Demo numbers
        console.log('SMS sent to emergency contacts:', emergencyContacts);
        
        // Simulate notification to official services
        console.log('Official services notified:', {
            type: activeEmergency.type,
            location: activeEmergency.location,
            priority: activeEmergency.priority
        });
        
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
            <div><strong>Time:</strong> ${activeEmergency.timestamp.toLocaleTimeString()}</div>
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

        // Send to Firebase (simulated)
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
    // This would listen for real-time updates from Firebase
    console.log('Listening for emergency updates:', emergencyId);
    
    // Simulate periodic updates
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

// Export functions for use in other modules (if using ES6 modules)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initializeApp,
        requestLocation,
        showNearbyHelp,
        confirmEmergency,
        cancelEmergency
    };
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