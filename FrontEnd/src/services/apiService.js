import axios from "axios";
import store from "../redux/store";
import { logout, refreshTokenSuccess } from "../redux/slices/authSlice";
import {clearPreferences} from "../redux/slices/userPreferencesSlice"
import { API_BASE_URL } from "../constants/constants";

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: { "Content-Type": "application/json" },
});

// Interceptor para agregar token a las solicitudes
api.interceptors.request.use(
    async (config) => {
        let token = store.getState().auth.token;
        const refreshToken = store.getState().auth.refreshToken;

        if (token) {
            config.headers["Authorization"] = `Bearer ${token}`;

            // Verificar si el token ha expirado
            const tokenExp = JSON.parse(atob(token.split(".")[1])).exp * 1000;
            if (Date.now() >= tokenExp) {
                try {
                    const response = await axios.post(`${API_BASE_URL}/token/refresh`, {
                        refresh: refreshToken,
                    });

                    const newToken = response.data.access;
                    store.dispatch(refreshTokenSuccess(newToken));
                    config.headers["Authorization"] = `Bearer ${newToken}`;
                } catch (error) {
                    console.error("Token expirado. Cierra sesión.");
                    store.dispatch(logout());
                    store.dispatch(clearPreferences());
                    return Promise.reject(error);
                }
            }
        }

        return config;
    },
    (error) => Promise.reject(error)
);

export default api;
