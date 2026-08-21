import api from "./apiService";

export const getUserProfile = async () => {
    try {
        const response = await api.get("/users/profiles");
        return response.data;
    } catch (error) {
        console.error("Error al obtener el perfil del usuario:", error.message);
        throw error;
    }
};

// PATCH parcial: username, email, first_name, last_name. El backend invalida
// la verificación de email si el email cambia y reenvía el correo.
export const updateUserProfile = async (data) => {
    try {
        const response = await api.patch("/users/update", data);
        return response.data;
    } catch (error) {
        console.error("Error al actualizar el perfil del usuario:", error.message);
        throw error;
    }
};

// PATCH parcial: favorite_location, alerts_enabled, preferred_units.
export const updateUserPreferences = async (data) => {
    try {
        const response = await api.patch("/users/update-preferences", data);
        return response.data;
    } catch (error) {
        console.error("Error al actualizar las preferencias del usuario:", error.message);
        throw error;
    }
};
