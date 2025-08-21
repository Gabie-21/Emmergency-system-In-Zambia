// sw.js - Service Worker for PWA functionality and offline support

const CACHE_NAME = 'emergency-response-v1.0';
const urlsToCache = [
  '/',
  '/index.html',
  '/css/main.css',
  '/js/main.js',
  '/js/firebase-config.js',
  '/manifest.json',
  // External libraries
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  // Offline fallback page
  '/offline.html'
];

// Install event - cache resources
self.addEventListener('install', function(event) {
  console.log('Service Worker: Install event');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('Service Worker: Caching files');
        return cache.addAll(urlsToCache);
      })
      .then(function() {
        console.log('Service Worker: All files cached');
        return self.skipWaiting(); // Activate immediately
      })
      .catch(function(error) {
        console.error('Service Worker: Cache failed', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', function(event) {
  console.log('Service Worker: Activate event');
  
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('Service Worker: Deleting old cache', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      console.log('Service Worker: Claiming clients');
      return self.clients.claim(); // Take control immediately
    })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', function(event) {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // Skip Firebase and external API requests for cache-first strategy
  if (event.request.url.includes('firebase') || 
      event.request.url.includes('googleapis') ||
      event.request.url.includes('africastalking')) {
    
    // Network first for API calls
    event.respondWith(
      fetch(event.request)
        .catch(function() {
          // If network fails, return offline message for API calls
          return new Response(
            JSON.stringify({ 
              error: 'offline', 
              message: 'This feature requires internet connection' 
            }),
            { 
              headers: { 'Content-Type': 'application/json' },
              status: 503
            }
          );
        })
    );
    return;
  }

  // For app resources, use cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // Return cached version if available
        if (response) {
          console.log('Service Worker: Serving from cache', event.request.url);
          return response;
        }

        console.log('Service Worker: Fetching from network', event.request.url);
        
        // Fetch from network
        return fetch(event.request)
          .then(function(response) {
            // Don't cache if not a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response
            var responseToCache = response.clone();

            // Add to cache
            caches.open(CACHE_NAME)
              .then(function(cache) {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(function() {
            // If both cache and network fail, show offline page
            if (event.request.destination === 'document') {
              return caches.match('/offline.html');
            }
            
            // For other resources, return a basic offline response
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

// Background sync for offline emergency reports
self.addEventListener('sync', function(event) {
  console.log('Service Worker: Background sync event', event.tag);
  
  if (event.tag === 'emergency-sync') {
    event.waitUntil(syncEmergencyData());
  }
});

// Push notification handling
self.addEventListener('push', function(event) {
  console.log('Service Worker: Push notification received', event);
  
  if (!event.data) {
    return;
  }

  const data = event.data.json();
  const title = data.title || 'Emergency Alert';
  const options = {
    body: data.body || 'Emergency notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    image: data.image,
    data: data.data,
    actions: [
      {
        action: 'view',
        title: 'View Details',
        icon: '/icons/view-icon.png'
      },
      {
        action: 'dismiss',
        title: 'Dismiss',
        icon: '/icons/dismiss-icon.png'
      }
    ],
    tag: data.tag || 'emergency',
    requireInteraction: data.urgent || false,
    silent: false,
    vibrate: data.urgent ? [200, 100, 200, 100, 200] : [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', function(event) {
  console.log('Service Worker: Notification click', event);
  
  event.notification.close();

  if (event.action === 'view') {
    // Open the app to view emergency details
    event.waitUntil(
      clients.openWindow('/?emergency=' + (event.notification.data?.emergencyId || ''))
    );
  } else if (event.action === 'dismiss') {
    // Just close the notification
    return;
  } else {
    // Default action - open the app
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Sync emergency data when back online
async function syncEmergencyData() {
  try {
    console.log('Service Worker: Syncing emergency data');
    
    // Get pending emergencies from IndexedDB or localStorage
    const pendingEmergencies = await getPendingEmergencies();
    
    if (pendingEmergencies.length === 0) {
      console.log('Service Worker: No pending emergencies to sync');
      return;
    }

    for (const emergency of pendingEmergencies) {
      try {
        // Send to Firebase
        const response = await fetch('/api/emergencies', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(emergency)
        });

        if (response.ok) {
          // Remove from pending list
          await removePendingEmergency(emergency.id);
          console.log('Service Worker: Emergency synced', emergency.id);
          
          // Notify user
          await self.registration.showNotification('Emergency Synced', {
            body: 'Your emergency report has been successfully submitted.',
            icon: '/icons/icon-192x192.png',
            tag: 'sync-success'
          });
        }
      } catch (error) {
        console.error('Service Worker: Failed to sync emergency', emergency.id, error);
      }
    }
  } catch (error) {
    console.error('Service Worker: Sync failed', error);
  }
}

// Helper functions for offline data management
async function getPendingEmergencies() {
  // In a real implementation, you'd use IndexedDB
  // For now, simulate with an empty array
  return [];
}

async function removePendingEmergency(emergencyId) {
  // Remove from IndexedDB
  console.log('Service Worker: Removing pending emergency', emergencyId);
}

// Handle emergency reporting when offline
self.addEventListener('message', function(event) {
  console.log('Service Worker: Message received', event.data);
  
  if (event.data.action === 'CACHE_EMERGENCY') {
    // Cache emergency for later sync
    cacheEmergencyForSync(event.data.emergency);
    
    // Register for background sync
    self.registration.sync.register('emergency-sync');
    
    // Respond back to the client
    event.ports[0].postMessage({
      success: true,
      message: 'Emergency cached for sync when online'
    });
  }
});

function cacheEmergencyForSync(emergency) {
  // In a real implementation, store in IndexedDB
  console.log('Service Worker: Caching emergency for sync', emergency);
  
  // For now, we'll use a simple approach with postMessage to the client
  // In production, you'd want to use IndexedDB for persistent storage
}

// Handle app update notifications
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('Service Worker: Skip waiting requested');
    self.skipWaiting();
  }
});

// Periodic background sync for responder location updates
self.addEventListener('periodicsync', function(event) {
  console.log('Service Worker: Periodic sync event', event.tag);
  
  if (event.tag === 'responder-location-sync') {
    event.waitUntil(syncResponderLocation());
  }
});

async function syncResponderLocation() {
  try {
    console.log('Service Worker: Syncing responder location');
    
    // Get current location
    const position = await getCurrentPosition();
    
    // Update location in Firebase (this would be handled by the main app)
    const response = await fetch('/api/responder/location', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        timestamp: new Date().toISOString()
      })
    });

    if (response.ok) {
      console.log('Service Worker: Responder location updated');
    }
  } catch (error) {
    console.error('Service Worker: Failed to sync responder location', error);
  }
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 300000
    });
  });
}

// Handle emergency alert broadcasts
self.addEventListener('push', function(event) {
  if (!event.data) return;

  const data = event.data.json();
  
  // Different notification types
  switch (data.type) {
    case 'emergency_assigned':
      showEmergencyAssignedNotification(data);
      break;
    case 'emergency_cancelled':
      showEmergencyCancelledNotification(data);
      break;
    case 'responder_arrived':
      showResponderArrivedNotification(data);
      break;
    case 'emergency_resolved':
      showEmergencyResolvedNotification(data);
      break;
    case 'system_alert':
      showSystemAlertNotification(data);
      break;
    default:
      showDefaultNotification(data);
  }
});

function showEmergencyAssignedNotification(data) {
  const title = '🚨 Emergency Response Assigned';
  const options = {
    body: `Responder ${data.responderName} is heading to your emergency. ETA: ${data.eta} minutes.`,
    icon: '/icons/responder-icon.png',
    badge: '/icons/badge-72x72.png',
    data: { emergencyId: data.emergencyId, type: 'emergency_assigned' },
    actions: [
      { action: 'track', title: 'Track Responder' },
      { action: 'contact', title: 'Contact Responder' }
    ],
    tag: 'emergency-' + data.emergencyId,
    requireInteraction: true,
    vibrate: [200, 100, 200]
  };

  self.registration.showNotification(title, options);
}

function showEmergencyCancelledNotification(data) {
  const title = '❌ Emergency Cancelled';
  const options = {
    body: `Emergency ${data.emergencyId} has been cancelled.`,
    icon: '/icons/cancelled-icon.png',
    badge: '/icons/badge-72x72.png',
    data: { emergencyId: data.emergencyId, type: 'emergency_cancelled' },
    tag: 'emergency-' + data.emergencyId,
    vibrate: [100]
  };

  self.registration.showNotification(title, options);
}

function showResponderArrivedNotification(data) {
  const title = '✅ Help Has Arrived';
  const options = {
    body: `${data.responderName} has arrived at your emergency location.`,
    icon: '/icons/arrived-icon.png',
    badge: '/icons/badge-72x72.png',
    data: { emergencyId: data.emergencyId, type: 'responder_arrived' },
    actions: [
      { action: 'confirm', title: 'Confirm Arrival' },
      { action: 'message', title: 'Send Message' }
    ],
    tag: 'emergency-' + data.emergencyId,
    requireInteraction: true,
    vibrate: [200, 100, 200, 100, 200]
  };

  self.registration.showNotification(title, options);
}

function showEmergencyResolvedNotification(data) {
  const title = '✅ Emergency Resolved';
  const options = {
    body: `Your emergency has been successfully resolved. Thank you for using our service.`,
    icon: '/icons/resolved-icon.png',
    badge: '/icons/badge-72x72.png',
    data: { emergencyId: data.emergencyId, type: 'emergency_resolved' },
    actions: [
      { action: 'feedback', title: 'Leave Feedback' },
      { action: 'view', title: 'View Details' }
    ],
    tag: 'emergency-' + data.emergencyId,
    vibrate: [200]
  };

  self.registration.showNotification(title, options);
}

function showSystemAlertNotification(data) {
  const title = '📢 System Alert';
  const options = {
    body: data.message || 'Important system notification',
    icon: '/icons/alert-icon.png',
    badge: '/icons/badge-72x72.png',
    data: { type: 'system_alert', alertId: data.alertId },
    tag: 'system-alert',
    vibrate: [100, 50, 100]
  };

  self.registration.showNotification(title, options);
}

function showDefaultNotification(data) {
  const title = data.title || 'Emergency Response';
  const options = {
    body: data.body || 'New notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    data: data,
    vibrate: [200, 100, 200]
  };

  self.registration.showNotification(title, options);
}

// Enhanced notification click handling
self.addEventListener('notificationclick', function(event) {
  console.log('Service Worker: Notification click', event.action, event.notification.data);
  
  event.notification.close();

  const data = event.notification.data || {};
  let url = '/';

  switch (event.action) {
    case 'track':
      url = `/?emergency=${data.emergencyId}&view=tracking`;
      break;
    case 'contact':
      url = `/?emergency=${data.emergencyId}&view=contact`;
      break;
    case 'confirm':
      url = `/?emergency=${data.emergencyId}&action=confirm`;
      break;
    case 'message':
      url = `/?emergency=${data.emergencyId}&view=chat`;
      break;
    case 'feedback':
      url = `/?emergency=${data.emergencyId}&view=feedback`;
      break;
    case 'view':
      url = `/?emergency=${data.emergencyId}`;
      break;
    case 'dismiss':
      return; // Just close notification
    default:
      if (data.emergencyId) {
        url = `/?emergency=${data.emergencyId}`;
      }
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        // Check if app is already open
        for (let client of clientList) {
          if (client.url.includes(self.location.origin)) {
            // Focus existing window and navigate
            client.focus();
            return client.navigate(url);
          }
        }
        // Open new window
        return clients.openWindow(url);
      })
  );
});

// Clean up old notifications
self.addEventListener('activate', function(event) {
  event.waitUntil(
    self.registration.getNotifications()
      .then(function(notifications) {
        notifications.forEach(function(notification) {
          // Close old notifications after 24 hours
          const notificationTime = new Date(notification.timestamp);
          const now = new Date();
          const hoursDiff = (now - notificationTime) / (1000 * 60 * 60);
          
          if (hoursDiff > 24) {
            notification.close();
          }
        });
      })
  );
});

// Error handling
self.addEventListener('error', function(event) {
  console.error('Service Worker: Global error', event);
});

self.addEventListener('unhandledrejection', function(event) {
  console.error('Service Worker: Unhandled promise rejection', event);
});

console.log('Service Worker: Script loaded and ready');