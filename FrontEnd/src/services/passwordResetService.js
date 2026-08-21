import api from "./apiService";

// Siempre responde 200 (exista o no la cuenta): así lo definió el backend
// para no filtrar qué correos están registrados. Ver
// BackEnd/users/views.py::password_reset_request.
export const requestPasswordReset = async (email) => {
    try {
        const response = await api.post("/users/password-reset", { email });
        return response.data;
    } catch (error) {
        console.error("Error al solicitar el recupero de contraseña:", error.message);
        throw error;
    }
};

export const confirmPasswordReset = async ({ uid, token, newPassword }) => {
    try {
        const response = await api.post("/users/password-reset/confirm", {
            uid,
            token,
            new_password: newPassword,
        });
        return response.data;
    } catch (error) {
        console.error("Error al confirmar el recupero de contraseña:", error.message);
        throw error;
    }
};
