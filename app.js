// ===== Configuration =====
const CONFIG = {
    GEOCODING_API: 'https://geocoding-api.open-meteo.com/v1/search',
    WEATHER_API: 'https://api.open-meteo.com/v1/forecast',
    STORAGE_KEY_FAVORITES: 'meteo-pwa-favorites',
    STORAGE_KEY_THEME: 'meteo-pwa-theme',
    RAIN_CODES: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99],
    TEMP_THRESHOLD: 10 // Température seuil pour notification
};

// ===== Éléments DOM =====
const elements = {
    cityInput: document.getElementById('ville'),
    searchBtn: document.getElementById('recherche'),
    notifyBtn: document.getElementById('notify-btn'),
    themeToggle: document.getElementById('theme-toggle'),
    weatherSection: document.getElementById('weather-section'),
    favoritesSection: document.getElementById('favorites-section'),
    favoritesList: document.getElementById('favorites-list'),
    favoriteBtn: document.getElementById('favorite-btn'),
    cityName: document.getElementById('city-name'),
    temperature: document.getElementById('temperature'),
    weatherIcon: document.getElementById('weather-icon'),
    wind: document.getElementById('wind'),
    humidity: document.getElementById('humidity'),
    feelsLike: document.getElementById('feels-like'),
    hourlyList: document.getElementById('hourly-list'),
    loading: document.getElementById('loading'),
    errorMessage: document.getElementById('error-message')
};

// ===== État de l'application =====
let currentCity = null;

// ===== Initialisation =====
document.addEventListener('DOMContentLoaded', () => {
    
    if (elements.searchBtn) {
        elements.searchBtn.addEventListener('click', handleSearch);
    }

     if (elements.notifyBtn) {
        elements.notifyBtn.addEventListener('click', requestNotificationPermission);
    }

    updateNotifyButton();
    registerServiceWorker();
});

// ===== Service Worker =====
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('./service-worker.js');
            console.log('✅ Service Worker enregistré:', registration.scope);
        } catch (error) {
            console.error('❌ Erreur Service Worker:', error);
        }
    }
}

// ===== Notifications =====
function isNotificationSupported() {
    return 'Notification' in window && typeof Notification !== 'undefined';
}

function updateNotifyButton() {
    // 1. Détection iOS / Standalone
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

    // 2. Cas iOS non installé
    if (isIOS && !isStandalone) {
        elements.notifyBtn.textContent = '📥 Installer pour activer';
        elements.notifyBtn.onclick = () => {
             alert("Installez l'application sur l'écran d'accueil pour activer les notifications.");
        };
        return;
    }

    // 3. Cas non supporté
    if (!('Notification' in window)) {
        elements.notifyBtn.textContent = '🚫 Non supporté';
        elements.notifyBtn.disabled = true;
        return;
    }

    // 4. Gestion des états de permission
    const permission = Notification.permission;

    if (permission === 'granted') {
        // C'EST ICI QUE CA BLOQUAIT :
        elements.notifyBtn.textContent = '✅ Test Notification'; // J'ai changé le texte pour que ce soit clair
        elements.notifyBtn.classList.add('granted');
        elements.notifyBtn.classList.remove('denied');
        
        // IMPORTANT : On attache la fonction de test au clic
        elements.notifyBtn.onclick = sendTestNotification; 
        
    } else if (permission === 'denied') {
        elements.notifyBtn.textContent = '❌ Notifications bloquées';
        elements.notifyBtn.classList.add('denied');
        elements.notifyBtn.classList.remove('granted');
        elements.notifyBtn.onclick = () => alert("Allez dans les Réglages de l'iPhone pour réactiver les notifications.");
    } else {
        elements.notifyBtn.textContent = '🔔 Activer les notifications';
        elements.notifyBtn.classList.remove('granted', 'denied');
        elements.notifyBtn.onclick = requestNotificationPermission;
    }
}

// ===== Notifications (Version corrigée pour iOS) =====
// ===== GESTION DES NOTIFICATIONS BLINDÉE POUR IOS =====

async function requestNotificationPermission() {
    // 1. Vérification de l'état actuel
    if (!('Notification' in window)) {
        alert("Ce téléphone ne supporte pas les notifications.");
        return;
    }

    // Si c'est déjà accordé dans les réglages mais que le bouton ne le sait pas encore
    if (Notification.permission === 'granted') {
        // On tente directement d'envoyer la notif de test
        sendTestNotification();
        updateNotifyButton();
        return;
    }

    // 2. Si ce n'est pas encore fait, on demande
    try {
        const permission = await Notification.requestPermission();
        
        if (permission === 'granted') {
            updateNotifyButton();
            sendTestNotification();
        } else {
            // C'est ici que tu avais le message "Accès refusé"
            // Si l'utilisateur refuse ou si iOS bug
            alert("Permission refusée par le système.\n\nAllez dans Réglages > Météo PWA > Notifications pour vérifier.");
        }
    } catch (error) {
        alert("Erreur lors de la demande : " + error.message);
    }
}

async function sendTestNotification() {
    // Petit message pour confirmer que le clic est bien pris en compte
    console.log("Tentative d'envoi...");

    if (!('serviceWorker' in navigator)) {
        alert("Erreur : Le navigateur ne supporte pas les Service Workers.");
        return;
    }

    try {
        // On attend que le SW soit prêt (c'est souvent là que ça charge sur iPhone)
        const registration = await navigator.serviceWorker.ready;
        
        // Envoi effectif
        await registration.showNotification('Météo PWA', {
            body: 'Si tu lis ça, tout fonctionne ! 🌤️',
            icon: 'icons/icon-192.png',
            vibrate: [200],
            tag: 'test-v1' // Tag unique pour éviter les doublons
        });

    } catch (error) {
        // Si ça échoue, cette alerte te donnera la raison exacte
        alert("Échec de la notification : " + error.message);
    }
}

function sendWeatherNotification(city, message, type = 'info') {
    // 1. Si pas de permission, on ne fait rien
    if (Notification.permission !== 'granted') return;

    const title = `Météo : ${city}`;
    const options = {
        body: message,
        icon: 'icons/icon-192.png', // Vérifie que ce chemin est bon !
        tag: type,
        renotify: true, // Force la notif même si c'est la même qu'avant
        vibrate: [200, 100, 200]
    };

    // 2. Tentative via Service Worker (Mieux pour Android/iOS)
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(registration => {
            registration.showNotification(title, options);
        }).catch(err => {
            // Si le SW échoue, on tente la méthode classique
            console.log("SW erreur, passage en mode classique");
            new Notification(title, options);
        });
    } 
    // 3. Tentative classique (Mieux pour PC)
    else {
        try {
            new Notification(title, options);
        } catch (e) {
            console.error("Erreur notif PC:", e);
        }
    }
}
// ===== Recherche et API Météo =====
async function handleSearch() {
    const query = elements.cityInput.value.trim();
    
    if (!query) {
        showError('Veuillez entrer un nom de ville.');
        return;
    }

    showLoading();
    hideError();

    try {
        // 1. Géocodage : trouver les coordonnées de la ville
        const geoResponse = await fetch(
            `${CONFIG.GEOCODING_API}?name=${encodeURIComponent(query)}&count=1&language=fr&format=json`
        );
        
        if (!geoResponse.ok) throw new Error('Erreur de géocodage');
        
        const geoData = await geoResponse.json();
        
        if (!geoData.results || geoData.results.length === 0) {
            throw new Error(`Ville "${query}" non trouvée. Vérifiez l'orthographe.`);
        }

        const location = geoData.results[0];
        const cityName = `${location.name}${location.admin1 ? ', ' + location.admin1 : ''}, ${location.country}`;
        
        // 2. Récupérer la météo
        await fetchWeather(location.latitude, location.longitude, cityName);
        
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

async function fetchWeather(lat, lon, cityName) {
    showLoading();
    hideError();

    try {
        const weatherResponse = await fetch(
            `${CONFIG.WEATHER_API}?latitude=${lat}&longitude=${lon}` +
            `&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m` +
            `&hourly=temperature_2m,weather_code,precipitation_probability` +
            `&timezone=auto&forecast_days=1`
        );

        if (!weatherResponse.ok) throw new Error('Erreur météo');

        const weatherData = await weatherResponse.json();
        
        currentCity = { name: cityName, lat, lon };
        
        displayWeather(weatherData, cityName);
        
        // --- C'EST ICI QU'ON APPELLE LA VÉRIFICATION ---
        console.log("Analyse des alertes...");
        checkWeatherAlerts(weatherData, cityName);
        // -----------------------------------------------
        
        hideLoading();
        
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

function displayWeather(data, cityName) {
    const current = data.current;
    const hourly = data.hourly;

    // Données actuelles
    elements.cityName.textContent = cityName;
    elements.temperature.textContent = Math.round(current.temperature_2m);
    elements.weatherIcon.textContent = getWeatherEmoji(current.weather_code);
    elements.wind.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
    elements.humidity.textContent = `${current.relative_humidity_2m} %`;
    elements.feelsLike.textContent = `${Math.round(current.apparent_temperature)}°C`;

    // Prévisions horaires (4 prochaines heures)
    const currentHour = new Date().getHours();
    const hourlyItems = [];
    
    for (let i = 0; i < 4; i++) {
        const hourIndex = currentHour + i + 1;
        if (hourIndex < hourly.time.length) {
            const time = new Date(hourly.time[hourIndex]);
            const temp = hourly.temperature_2m[hourIndex];
            const code = hourly.weather_code[hourIndex];
            const isRain = CONFIG.RAIN_CODES.includes(code);
            const isHighTemp = temp > CONFIG.TEMP_THRESHOLD;
            
            let alertClass = '';
            if (isRain) alertClass = 'rain-alert';
            else if (isHighTemp) alertClass = 'temp-alert';

            hourlyItems.push(`
                <div class="hourly-item ${alertClass}">
                    <div class="hourly-time">${time.getHours()}h</div>
                    <div class="hourly-icon">${getWeatherEmoji(code)}</div>
                    <div class="hourly-temp">${Math.round(temp)}°C</div>
                </div>
            `);
        }
    }

    elements.hourlyList.innerHTML = hourlyItems.join('');
    elements.weatherSection.classList.remove('hidden');
}

function checkWeatherAlerts(data, cityName) {
    const hourly = data.hourly;
    const currentHour = new Date().getHours();
    
    let rainAlert = false;
    let tempAlert = false;
    let rainHour = null;
    let highTemp = null;

    // Vérifier les 4 prochaines heures
    for (let i = 1; i <= 4; i++) {
        const hourIndex = currentHour + i;
        if (hourIndex < hourly.time.length) {
            const code = hourly.weather_code[hourIndex];
            const temp = hourly.temperature_2m[hourIndex];
            
            // Vérifier la pluie
            if (!rainAlert && CONFIG.RAIN_CODES.includes(code)) {
                rainAlert = true;
                rainHour = i;
            }
            
            // Vérifier la température > 10°C
            if (!tempAlert && temp > CONFIG.TEMP_THRESHOLD) {
                tempAlert = true;
                highTemp = Math.round(temp);
            }
        }
    }

    // Envoyer les notifications
    if (rainAlert) {
        sendWeatherNotification(
            cityName,
            `🌧️ Pluie prévue dans ${rainHour} heure${rainHour > 1 ? 's' : ''} !`,
            'rain'
        );
    }

    if (tempAlert) {
        sendWeatherNotification(
            cityName,
            `🌡️ Température supérieure à ${CONFIG.TEMP_THRESHOLD}°C prévue (${highTemp}°C)`,
            'temp'
        );
    }
}

// ===== Utilitaires =====
function getWeatherEmoji(code) {
    const weatherEmojis = {
        0: '☀️',      // Clear sky
        1: '🌤️',     // Mainly clear
        2: '⛅',      // Partly cloudy
        3: '☁️',      // Overcast
        45: '🌫️',    // Fog
        48: '🌫️',    // Depositing rime fog
        51: '🌦️',    // Light drizzle
        53: '🌦️',    // Moderate drizzle
        55: '🌧️',    // Dense drizzle
        56: '🌨️',    // Light freezing drizzle
        57: '🌨️',    // Dense freezing drizzle
        61: '🌧️',    // Slight rain
        63: '🌧️',    // Moderate rain
        65: '🌧️',    // Heavy rain
        66: '🌨️',    // Light freezing rain
        67: '🌨️',    // Heavy freezing rain
        71: '🌨️',    // Slight snow
        73: '🌨️',    // Moderate snow
        75: '❄️',     // Heavy snow
        77: '🌨️',    // Snow grains
        80: '🌦️',    // Slight rain showers
        81: '🌧️',    // Moderate rain showers
        82: '⛈️',     // Violent rain showers
        85: '🌨️',    // Slight snow showers
        86: '❄️',     // Heavy snow showers
        95: '⛈️',     // Thunderstorm
        96: '⛈️',     // Thunderstorm with slight hail
        99: '⛈️'      // Thunderstorm with heavy hail
    };
    
    return weatherEmojis[code] || '🌤️';
}

function showLoading() {
    elements.loading.classList.remove('hidden');
    elements.weatherSection.classList.add('hidden');
}

function hideLoading() {
    elements.loading.classList.add('hidden');
}

function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorMessage.classList.remove('hidden');
}

function hideError() {
    elements.errorMessage.classList.add('hidden');
}

function checkWeatherAlerts(data, cityName) {
    // 1. On récupère les données horaires
    const hourly = data.hourly;
    
    // 2. On récupère l'heure actuelle (0-23)
    const currentHour = new Date().getHours();
    
    // Variables pour éviter les doublons (on prévient une seule fois par recherche)
    let rainAlertSent = false;
    let tempAlertSent = false;

    // 3. Boucle sur les 4 prochaines heures (i=1 à i=4)
    for (let i = 1; i <= 4; i++) {
        const targetIndex = currentHour + i; // L'index dans le tableau correspond souvent à l'heure

        // Sécurité : on vérifie qu'on ne sort pas du tableau
        if (targetIndex >= hourly.time.length) break;

        const weatherCode = hourly.weather_code[targetIndex];
        const temperature = hourly.temperature_2m[targetIndex];

        // --- TEST 1 : PLUIE ---
        if (!rainAlertSent && CONFIG.RAIN_CODES.includes(weatherCode)) {
            sendWeatherNotification(
                cityName, 
                `☔ Attention : Pluie prévue dans ${i} heure(s) !`
            );
            rainAlertSent = true; // On arrête de chercher pour la pluie
        }

        // --- TEST 2 : TEMPÉRATURE > 10°C ---
        if (!tempAlertSent && temperature > CONFIG.TEMP_THRESHOLD) {
            sendWeatherNotification(
                cityName, 
                `🌡️ Il va faire doux : ${Math.round(temperature)}°C prévus dans ${i} heure(s).`
            );
            tempAlertSent = true; // On arrête de chercher pour la température
        }
    }
}
