// ===== CONFIGURATION =====
const CONFIG = {
    GEOCODING_API: 'https://geocoding-api.open-meteo.com/v1/search',
    WEATHER_API: 'https://api.open-meteo.com/v1/forecast',
    // Codes météo pour la pluie (Bruine, Pluie, Averses, Orage)
    RAIN_CODES: [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99],
    // Seuil de température
    TEMP_THRESHOLD: 10 
};

// ===== ÉLÉMENTS DOM =====
const elements = {
    cityInput: document.getElementById('ville'),
    searchBtn: document.getElementById('recherche'),
    notifyBtn: document.getElementById('notify-btn'),
    weatherSection: document.getElementById('weather-section'),
    hourlyList: document.getElementById('hourly-list'),
    loading: document.getElementById('loading'),
    errorMessage: document.getElementById('error-message'),
    cityName: document.getElementById('city-name'),
    temperature: document.getElementById('temperature'),
    weatherIcon: document.getElementById('weather-icon'),
    wind: document.getElementById('wind'),
    humidity: document.getElementById('humidity'),
    feelsLike: document.getElementById('feels-like')
};

// ===== INITIALISATION =====
document.addEventListener('DOMContentLoaded', () => {
    // 1. Écouteur sur le bouton de recherche
    if (elements.searchBtn) {
        elements.searchBtn.addEventListener('click', handleSearch);
    }

    // 2. Gestion du bouton Notifications
    if (elements.notifyBtn) {
        updateNotifyButton(); // Vérifie l'état au démarrage
    }

    // 3. Enregistrement du Service Worker (Indispensable pour iOS/Android)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(() => console.log('✅ Service Worker enregistré'))
            .catch(err => console.error('❌ Erreur Service Worker', err));
    }
});

// ===== FONCTIONS PRINCIPALES MÉTÉO =====

async function handleSearch() {
    const query = elements.cityInput.value.trim();
    if (!query) return;

    showLoading();
    hideError();

    try {
        // A. Géocodage
        const geoResponse = await fetch(`${CONFIG.GEOCODING_API}?name=${encodeURIComponent(query)}&count=1&language=fr&format=json`);
        const geoData = await geoResponse.json();
        
        if (!geoData.results || geoData.results.length === 0) {
            throw new Error(`Ville "${query}" introuvable.`);
        }

        const location = geoData.results[0];
        const fullCityName = `${location.name}, ${location.country}`;

        // B. Météo
        await fetchWeather(location.latitude, location.longitude, fullCityName);

    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

async function fetchWeather(lat, lon, cityName) {
    try {
        const url = `${CONFIG.WEATHER_API}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code&timezone=auto&forecast_days=1`;
        
        const res = await fetch(url);
        if (!res.ok) throw new Error('Erreur récupération météo');
        
        const data = await res.json();
        
        // 1. Affichage
        displayWeather(data, cityName);
        
        // 2. Analyse pour les notifications (Pluie / Température)
        checkWeatherAlerts(data, cityName);
        
        hideLoading();
    } catch (error) {
        hideLoading();
        showError(error.message);
    }
}

function displayWeather(data, cityName) {
    const current = data.current;
    
    elements.cityName.textContent = cityName;
    elements.temperature.textContent = Math.round(current.temperature_2m);
    elements.weatherIcon.textContent = getWeatherEmoji(current.weather_code);
    elements.wind.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
    elements.humidity.textContent = `${current.relative_humidity_2m} %`;
    elements.feelsLike.textContent = `${Math.round(current.apparent_temperature)}°C`;

    // Affichage horaire (4 prochaines heures)
    const hourlyHTML = [];
    const currentHour = new Date().getHours();
    
    for(let i = 1; i <= 4; i++) {
        const idx = currentHour + i;
        if (idx < data.hourly.time.length) {
            hourlyHTML.push(`
                <div class="hourly-item">
                    <span>${idx}h</span>
                    <span style="font-size:1.5rem">${getWeatherEmoji(data.hourly.weather_code[idx])}</span>
                    <span>${Math.round(data.hourly.temperature_2m[idx])}°</span>
                </div>
            `);
        }
    }
    elements.hourlyList.innerHTML = hourlyHTML.join('');
    elements.weatherSection.classList.remove('hidden');
}

// ===== LOGIQUE DES NOTIFICATIONS (Le Cœur du sujet) =====

function checkWeatherAlerts(data, cityName) {
    const hourly = data.hourly;
    const currentHour = new Date().getHours();
    
    let rainAlertSent = false;
    let tempAlertSent = false;

    // Analyse des 4 prochaines heures
    for (let i = 1; i <= 4; i++) {
        const index = currentHour + i;
        // Sécurité pour ne pas sortir du tableau
        if (index >= hourly.time.length) break;

        const code = hourly.weather_code[index];
        const temp = hourly.temperature_2m[index];

        // ALERTE PLUIE
        if (!rainAlertSent && CONFIG.RAIN_CODES.includes(code)) {
            sendWeatherNotification(cityName, `☔ Attention : Pluie prévue dans ${i}h !`, 'rain');
            rainAlertSent = true;
        }

        // ALERTE CHALEUR (> 10°C)
        if (!tempAlertSent && temp > CONFIG.TEMP_THRESHOLD) {
            sendWeatherNotification(cityName, `🌡️ Il va faire doux : ${Math.round(temp)}°C dans ${i}h.`, 'temp');
            tempAlertSent = true;
        }
    }
}

function sendWeatherNotification(city, message, tag = 'info') {
    // Si pas de permission, on arrête
    if (Notification.permission !== 'granted') return;

    const title = `Météo : ${city}`;
    const options = {
        body: message,
        tag: tag,
        vibrate: [200, 100, 200]
    };

    // Stratégie Hybride : 
    // Service Worker pour Mobile (Android/iOS) avec Icône
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        options.icon = 'icons/icon-192.png'; 
        navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(title, options);
        });
    } 
    // API Classique pour PC (Sans icône pour éviter bugs Windows)
    else {
        new Notification(title, options);
    }
}

// ===== GESTION DU BOUTON ET PERMISSIONS =====

function updateNotifyButton() {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

    // Cas iOS non installé
    if (isIOS && !isStandalone) {
        elements.notifyBtn.textContent = '📥 Installer pour activer notifs';
        elements.notifyBtn.onclick = () => alert("Installez l'app sur l'écran d'accueil (Partager > Sur l'écran d'accueil) pour activer les notifications.");
        return;
    }

    if (!('Notification' in window)) {
        elements.notifyBtn.textContent = '🚫 Notifs non supportées';
        return;
    }

    if (Notification.permission === 'granted') {
        elements.notifyBtn.textContent = '✅ Notifications actives (Test)';
        elements.notifyBtn.classList.add('granted');
        // Au clic, on lance un test manuel
        elements.notifyBtn.onclick = () => sendWeatherNotification("Test", "Ceci est un test manuel !");
    } else {
        elements.notifyBtn.textContent = '🔔 Activer les notifications';
        elements.notifyBtn.onclick = requestPermission;
    }
}

async function requestPermission() {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            updateNotifyButton();
            sendWeatherNotification("Succès", "Notifications activées avec succès !");
        } else {
            alert("Permission refusée. Vérifiez les réglages de votre appareil.");
        }
    } catch (e) {
        alert("Erreur : " + e.message);
    }
}

// ===== UTILITAIRES =====

function getWeatherEmoji(code) {
    const emojis = {
        0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 
        45: '🌫️', 48: '🌫️',
        51: '🌦️', 53: '🌦️', 55: '🌧️', 
        61: '🌧️', 63: '🌧️', 65: '🌧️',
        71: '🌨️', 73: '🌨️', 75: '❄️',
        80: '🌦️', 81: '🌧️', 82: '⛈️',
        95: '⛈️', 96: '⛈️', 99: '⛈️'
    };
    return emojis[code] || '❓';
}

function showLoading() {
    elements.loading.classList.remove('hidden');
    elements.weatherSection.classList.add('hidden');
    elements.errorMessage.classList.add('hidden');
}

function hideLoading() {
    elements.loading.classList.add('hidden');
}

function showError(msg) {
    elements.errorMessage.textContent = msg;
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
