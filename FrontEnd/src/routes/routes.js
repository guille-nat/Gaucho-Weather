export const PublicRoutes ={
    LOGIN: '/login',
    REPORTS: '/reports',
    HOME : '/',
    REGISTER: '/register',
    FORGOT_PASSWORD: '/forgot-password',
    // Debe coincidir con el path que arma BackEnd/users/emails.py
    // (send_password_reset_email) para el link del correo de recupero.
    RESET_PASSWORD: '/reset-password',
    // Debe coincidir con el path que arma BackEnd/users/emails.py
    // (send_verification_email) para el link del correo de confirmación.
    VERIFY_EMAIL: '/verify-email'
}

export const PrivateRoutes = {
    HISTORIC: '/historic',
    GRAPHICS: '/graphics',
    PROFILE: '/profile',
}