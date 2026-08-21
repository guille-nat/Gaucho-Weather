import api from "./apiService";

// Estrategia de unidades única para toda la app: el backend SIEMPRE devuelve
// métrico (no se manda `units=` en ningún request), y la conversión a
// imperial se hace exclusivamente en el cliente (ver utilities/convertUnits).
// Antes cada consumidor mandaba (o no) un `tempUnit` propio: Home nunca lo
// mandaba (siempre pedía métrico igual), Reports lo mandaba con una key
// equivocada que el servicio ignoraba, y Graphics sí lo mandaba, pidiendo al
// backend que convierta — 3 estrategias distintas para el mismo dato.
export const weatherService = {
  getCurrentWeather: async ({ location, latitude, longitude }) => {
    try {
      const params = latitude && longitude
        ? `lat=${latitude}&lon=${longitude}`
        : `location=${location}`;

      const response = await api.get(`/weather/weathers-now/?${params}`);
      return response.data;
    } catch (error) {
      console.error('Error al obtener el clima actual:', error.message);
      throw error;
    }
  },

  getForecast: async ({ location, latitude, longitude }) => {
    try {
      const params = latitude && longitude
        ? `lat=${latitude}&lon=${longitude}`
        : `location=${location}`;

      const response = await api.get(`/weather/weathers-days/?${params}`);
      return response.data;
    } catch (error) {
      console.error('Error al obtener el pronóstico:', error.message);
      throw error;
    }
  },

  getFrostRisk: async ({ location, latitude, longitude }) => {
    try {
      const params = latitude && longitude
        ? `lat=${latitude}&lon=${longitude}`
        : `location=${location}`;

      const response = await api.get(`/weather/frost-risk/?${params}`);
      return response.data;
    } catch (error) {
      console.error('Error al obtener el riesgo de helada:', error.message);
      throw error;
    }
  }
};
