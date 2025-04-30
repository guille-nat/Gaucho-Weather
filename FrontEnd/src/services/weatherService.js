import api from "./apiService";

export const weatherService = {
  getCurrentWeather: async ({ location, latitude, longitude, tempUnit='metric' }) => {
    try {
      const params = latitude && longitude
        ? `lat=${latitude}&lon=${longitude}`
        : `location=${location}`;

      const response = await api.get(`/weather/weathers-now/?${params}&units=${tempUnit}`);
      return response.data;
    } catch (error) {
      console.error('Error al obtener el clima actual:', error.message);
      throw error;
    }
  },

  getForecast: async ({ location, latitude, longitude, tempUnit='metric' }) => {
    try {
      const params = latitude && longitude
        ? `lat=${latitude}&lon=${longitude}`
        : `location=${location}`;

      const response = await api.get(`/weather/weathers-days/?${params}&units=${tempUnit}`);
      return response.data;
    } catch (error) {
      console.error('Error al obtener el pronóstico:', error.message);
      throw error;
    }
  }
};
