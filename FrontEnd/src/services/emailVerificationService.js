import api from "./apiService";

// Ruta y query param (token) definidos por
// BackEnd/users/emails.py::send_verification_email — deben coincidir.
export const confirmEmailVerification = async (token) => {
    try {
        const response = await api.post("/users/verify-email", { token });
        return response.data;
    } catch (error) {
        console.error("Error al verificar el correo:", error.message);
        throw error;
    }
};
