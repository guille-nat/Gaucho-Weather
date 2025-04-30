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
