export const getUserLocation = () => {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('La geolocalización no está soportada por tu navegador.'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                });
            },
            (error) => {
                let errorMsg = "Error desconocido.";
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        errorMsg = "El usuario denegó el permiso de geolocalización.";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMsg = "La información de ubicación no está disponible.";
                        break;
                    case error.TIMEOUT:
                        errorMsg = "Tiempo de espera agotado para obtener la ubicación.";
                        break;
                }
                reject(new Error(errorMsg));
            },
            {
                enableHighAccuracy: true, // Mayor precisión
                timeout: 10000, // Espera hasta 10 segundos
                maximumAge: 0, // No usar ubicaciones en caché
            }
        );
    });
};
