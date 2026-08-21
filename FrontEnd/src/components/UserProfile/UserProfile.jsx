"use client"

import { useCallback, useEffect, useState } from "react"
import { useDispatch } from "react-redux"
import { useNavigate } from "react-router-dom"
import {
    User,
    Mail,
    MapPin,
    Bell,
    BellOff,
    Save,
    Trash2,
    Plus,
    CheckCircle,
    Ruler,
    LogOut,
    ChevronDown,
    ChevronUp,
    AlertTriangle,
    Pencil,
} from "lucide-react"
import { getUserProfile, updateUserProfile, updateUserPreferences } from "../../services/userProfileServices"
import { setPreferences, clearPreferences } from "../../redux/slices/userPreferencesSlice"
import { logout } from "../../redux/slices/authSlice"
import { PublicRoutes } from "../../routes/routes"
import Feedback from "../Feedback"
import "./style/UserProfile.css"

// El backend devuelve errores de validación como {campo: ["mensaje", ...]}.
// Nos quedamos con el primer mensaje de cada campo para mostrarlo bajo el
// input correspondiente.
const mapServerErrors = (data) => {
    const mapped = {}
    Object.entries(data).forEach(([field, messages]) => {
        mapped[field] = Array.isArray(messages) ? messages[0] : String(messages)
    })
    return mapped
}

export default function UserProfile() {
    const dispatch = useDispatch()
    const navigate = useNavigate()

    // Estado del perfil (fuente de verdad: la última respuesta del backend)
    const [profile, setProfile] = useState(null)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState(null)

    const [editMode, setEditMode] = useState(false)
    const [profileSnapshot, setProfileSnapshot] = useState(null)
    const [savingProfile, setSavingProfile] = useState(false)
    const [savingPreferences, setSavingPreferences] = useState(false)

    const [expandedSection, setExpandedSection] = useState(null)
    const [activeTab, setActiveTab] = useState("profile")
    const [newLocation, setNewLocation] = useState({
        name: "",
        lat: "",
        lon: "",
    })
    const [formErrors, setFormErrors] = useState({})
    const [feedback, setFeedback] = useState(null)

    const fetchProfile = useCallback(async () => {
        setLoading(true)
        setLoadError(null)
        try {
            const data = await getUserProfile()
            setProfile(data)
        } catch (error) {
            console.error("Error fetching user profile:", error)
            setLoadError("No pudimos cargar tu perfil. Verificá tu conexión e intentá de nuevo.")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchProfile()
    }, [fetchProfile])

    const enterEditMode = () => {
        setProfileSnapshot(profile.user)
        setFormErrors({})
        setEditMode(true)
    }

    const cancelEdit = () => {
        setProfile((prev) => (prev ? { ...prev, user: profileSnapshot } : prev))
        setFormErrors({})
        setEditMode(false)
    }

    // Handle form submission
    const handleSaveProfile = async (e) => {
        e.preventDefault()
        if (!profile) return

        // Validate form
        const errors = {}

        if (!profile.user.username) {
            errors.username = "El nombre de usuario es obligatorio"
        }

        if (!profile.user.email) {
            errors.email = "El correo electrónico es obligatorio"
        } else if (!/\S+@\S+\.\S+/.test(profile.user.email)) {
            errors.email = "El correo electrónico no es válido"
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors)
            return
        }

        setFormErrors({})
        setSavingProfile(true)
        try {
            const emailChanged = profile.user.email !== profileSnapshot?.email
            const updatedUser = await updateUserProfile({
                username: profile.user.username,
                email: profile.user.email,
                first_name: profile.user.first_name,
                last_name: profile.user.last_name,
            })

            setProfile((prev) => ({ ...prev, user: updatedUser }))
            setEditMode(false)
            setFeedback({
                type: "success",
                message: emailChanged
                    ? "Perfil actualizado. Tu nuevo email queda pendiente de verificación."
                    : "Perfil actualizado correctamente.",
            })
        } catch (error) {
            console.error("Error updating profile:", error)
            const serverErrors = error.response?.data
            if (serverErrors && typeof serverErrors === "object") {
                setFormErrors(mapServerErrors(serverErrors))
            }
            setFeedback({
                type: "error",
                message: "No se pudo actualizar el perfil. Revisá los datos e intentá de nuevo.",
            })
        } finally {
            setSavingProfile(false)
        }
    }

    // Persiste todas las preferencias (unidades, alertas, ubicaciones
    // favoritas) de una sola vez, y refleja el resultado en Redux para que
    // el resto de la app (Home, Reports, Graphics) quede sincronizado.
    const handleSavePreferences = async () => {
        if (!profile) return
        setSavingPreferences(true)
        try {
            const updatedPreferences = await updateUserPreferences({
                favorite_location: profile.preferences.favorite_location,
                alerts_enabled: profile.preferences.alerts_enabled,
                preferred_units: profile.preferences.preferred_units,
            })

            setProfile((prev) => ({ ...prev, preferences: updatedPreferences }))
            dispatch(
                setPreferences({
                    favoriteLocation: updatedPreferences.favorite_location,
                    preferredUnits: updatedPreferences.preferred_units,
                    alertsEnabled: updatedPreferences.alerts_enabled,
                }),
            )
            setFeedback({ type: "success", message: "Tus preferencias fueron guardadas correctamente." })
        } catch (error) {
            console.error("Error updating preferences:", error)
            setFeedback({
                type: "error",
                message: "No se pudieron guardar las preferencias. Intentá de nuevo.",
            })
        } finally {
            setSavingPreferences(false)
        }
    }

    // Toggle section expansion
    const toggleSection = (section) => {
        if (expandedSection === section) {
            setExpandedSection(null)
        } else {
            setExpandedSection(section)
        }
    }

    // Los encabezados de las secciones de preferencias son divs con onClick,
    // sin semántica de control: mismo patrón de accesibilidad que
    // Home.jsx campo-header (role, tabIndex, aria-expanded/aria-controls,
    // Enter/Space).
    const handleSectionHeaderKeyDown = (section) => (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            toggleSection(section)
        }
    }

    // Las siguientes acciones (agregar/quitar ubicación, cambiar unidades,
    // activar alertas) solo tocan el borrador local: recién se persisten al
    // backend cuando se toca "Guardar todas las preferencias". Mostrar un
    // aviso de éxito acá antes de ese guardado real sería mentir.
    const handleAddLocation = (e) => {
        e.preventDefault()
        if (!profile) return

        const errors = {}

        if (!newLocation.name) {
            errors.locationName = "El nombre de la ubicación es obligatorio"
        }

        if (!newLocation.lat) {
            errors.locationLat = "La latitud es obligatoria"
        } else if (isNaN(Number(newLocation.lat))) {
            errors.locationLat = "La latitud debe ser un número"
        }

        if (!newLocation.lon) {
            errors.locationLon = "La longitud es obligatoria"
        } else if (isNaN(Number(newLocation.lon))) {
            errors.locationLon = "La longitud debe ser un número"
        }

        if (Object.keys(errors).length > 0) {
            setFormErrors(errors)
            return
        }

        setFormErrors({})
        setProfile((prev) => ({
            ...prev,
            preferences: {
                ...prev.preferences,
                favorite_location: [
                    ...prev.preferences.favorite_location,
                    { name: newLocation.name, lat: Number(newLocation.lat), lon: Number(newLocation.lon) },
                ],
            },
        }))
        setNewLocation({ name: "", lat: "", lon: "" })
    }

    const handleRemoveLocation = (index) => {
        if (!profile) return
        setProfile((prev) => ({
            ...prev,
            preferences: {
                ...prev.preferences,
                favorite_location: prev.preferences.favorite_location.filter((_, i) => i !== index),
            },
        }))
    }

    const handleToggleAlerts = () => {
        if (!profile) return
        setProfile((prev) => ({
            ...prev,
            preferences: { ...prev.preferences, alerts_enabled: !prev.preferences.alerts_enabled },
        }))
    }

    const handleChangeUnits = (value) => {
        if (!profile) return
        setProfile((prev) => ({
            ...prev,
            preferences: { ...prev.preferences, preferred_units: value },
        }))
    }

    const handleLogout = () => {
        dispatch(logout())
        dispatch(clearPreferences())
        navigate(PublicRoutes.HOME)
    }

    if (loading) {
        return (
            <div className="profile-container">
                <div className="profile-card profile-card--skeleton" aria-busy="true" aria-live="polite">
                    <div className="skeleton-header">
                        <span className="skeleton skeleton-avatar" />
                        <div className="skeleton-header-text">
                            <span className="skeleton skeleton-line skeleton-line--wide" />
                            <span className="skeleton skeleton-line skeleton-line--narrow" />
                        </div>
                    </div>
                    <div className="skeleton-body">
                        <span className="skeleton skeleton-field" />
                        <span className="skeleton skeleton-field" />
                        <span className="skeleton skeleton-field" />
                    </div>
                    <span className="sr-only">Cargando perfil…</span>
                </div>
            </div>
        )
    }

    if (loadError) {
        return (
            <div className="error-container">
                <div className="error-card">
                    <div className="error-title">Error</div>
                    <p className="error-message">{loadError}</p>
                    <div className="error-footer">
                        <button onClick={fetchProfile} className="button">
                            Reintentar
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    if (!profile) {
        return null
    }

    return (
        <div className="profile-container">
            {feedback && (
                <Feedback type={feedback.type} message={feedback.message} onDismiss={() => setFeedback(null)} />
            )}

            <div className="profile-tabs">
                <div className="tabs-list">
                    <button className={`tab ${activeTab === "profile" ? "active" : ""}`} onClick={() => setActiveTab("profile")}>
                        Perfil
                    </button>
                    <button
                        className={`tab ${activeTab === "preferences" ? "active" : ""}`}
                        onClick={() => setActiveTab("preferences")}
                    >
                        Preferencias
                    </button>
                </div>

                {/* Profile Tab */}
                {activeTab === "profile" && (
                    <div className="tab-content">
                        <div className="profile-card">
                            <div className="profile-header">
                                <div className="edit-button-container">
                                    {editMode ? (
                                        <button className="edit-button" onClick={handleSaveProfile} disabled={savingProfile}>
                                            <Save className="icon-small" />
                                            <span className="sr-only">Guardar</span>
                                        </button>
                                    ) : (
                                        <button className="edit-button" onClick={enterEditMode}>
                                            <Pencil className="icon-small" />
                                            <span className="sr-only">Editar</span>
                                        </button>
                                    )}
                                </div>

                                <div className="user-info">
                                    {/* Antes acá había una imagen remota de api.dicebear.com
                                        que le mandaba el username a un tercero solo para
                                        pintar el avatar — y el div de iniciales de abajo ya
                                        lo tapaba por completo (position: absolute encima),
                                        así que ni se llegaba a ver. */}
                                    <div className="user-avatar">
                                        <div className="avatar-fallback">{profile.user.username.substring(0, 2).toUpperCase()}</div>
                                    </div>

                                    <div className="user-details">
                                        <h1 className="user-name">
                                            {profile.user.first_name} {profile.user.last_name}
                                        </h1>
                                        <div className="user-username">
                                            <User className="icon-tiny" />@{profile.user.username}
                                            {profile.user.email_verify && (
                                                <span className="verified-badge">
                                                    <CheckCircle className="icon-tiny" /> Verificado
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="profile-content">
                                <form className="form-fields" onSubmit={handleSaveProfile}>
                                    <div className="form-field">
                                        <label htmlFor="username" className="field-label">
                                            <User className="field-icon" />
                                            Nombre de usuario
                                        </label>
                                        {editMode ? (
                                            <>
                                                <input
                                                    id="username"
                                                    type="text"
                                                    value={profile.user.username}
                                                    onChange={(e) =>
                                                        setProfile({
                                                            ...profile,
                                                            user: { ...profile.user, username: e.target.value },
                                                        })
                                                    }
                                                    className={formErrors.username ? "input input-error" : "input"}
                                                />
                                                {formErrors.username && <p className="error-text">{formErrors.username}</p>}
                                            </>
                                        ) : (
                                            <p className="field-value">{profile.user.username}</p>
                                        )}
                                    </div>

                                    <div className="form-field">
                                        <label htmlFor="email" className="field-label">
                                            <Mail className="field-icon" />
                                            Correo electrónico
                                        </label>
                                        {editMode ? (
                                            <>
                                                <input
                                                    id="email"
                                                    type="email"
                                                    value={profile.user.email}
                                                    onChange={(e) =>
                                                        setProfile({
                                                            ...profile,
                                                            user: { ...profile.user, email: e.target.value },
                                                        })
                                                    }
                                                    className={formErrors.email ? "input input-error" : "input"}
                                                />
                                                {formErrors.email && <p className="error-text">{formErrors.email}</p>}
                                            </>
                                        ) : (
                                            <p className="field-value">{profile.user.email}</p>
                                        )}
                                    </div>

                                    {editMode && (
                                        <>
                                            <div className="form-field">
                                                <label htmlFor="first_name" className="field-label">
                                                    Nombre
                                                </label>
                                                <input
                                                    id="first_name"
                                                    type="text"
                                                    value={profile.user.first_name}
                                                    onChange={(e) =>
                                                        setProfile({
                                                            ...profile,
                                                            user: { ...profile.user, first_name: e.target.value },
                                                        })
                                                    }
                                                    className="input"
                                                />
                                            </div>

                                            <div className="form-field">
                                                <label htmlFor="last_name" className="field-label">
                                                    Apellido
                                                </label>
                                                <input
                                                    id="last_name"
                                                    type="text"
                                                    value={profile.user.last_name}
                                                    onChange={(e) =>
                                                        setProfile({
                                                            ...profile,
                                                            user: { ...profile.user, last_name: e.target.value },
                                                        })
                                                    }
                                                    className="input"
                                                />
                                            </div>
                                        </>
                                    )}
                                </form>
                                {/* "Fecha de registro" / "Último acceso" se sacaron de acá: el
                                    backend (UserSerializer, BackEnd/users/serializers.py) nunca
                                    serializa date_joined ni last_login, así que no hay dato real
                                    que mostrar. Ver reporte de Wave 2 para más detalle. */}
                            </div>

                            <div className="profile-footer">
                                {editMode ? (
                                    <>
                                        <button
                                            type="button"
                                            className="button button-outline cancel-button"
                                            onClick={cancelEdit}
                                            disabled={savingProfile}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            className="button save-button"
                                            onClick={handleSaveProfile}
                                            disabled={savingProfile}
                                        >
                                            <Save className="icon-small" />
                                            {savingProfile ? "Guardando..." : "Guardar cambios"}
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button type="button" className="button button-outline logout-button" onClick={handleLogout}>
                                            <LogOut className="icon-small" />
                                            Cerrar sesión
                                        </button>
                                        <button type="button" className="button edit-profile-button" onClick={enterEditMode}>
                                            <Pencil className="icon-small" />
                                            Editar perfil
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Preferences Tab */}
                {activeTab === "preferences" && (
                    <div className="tab-content">
                        <div className="preferences-card">
                            <div className="card-header">
                                <h1 className="card-title">Preferencias de usuario</h1>
                                <p className="card-description">Configura tus preferencias para personalizar tu experiencia</p>
                            </div>

                            <div className="preferences-content">
                                {/* Units Preference */}
                                <div className="preference-section">
                                    <div
                                        className="section-header"
                                        role="button"
                                        tabIndex={0}
                                        aria-expanded={expandedSection === "units"}
                                        aria-controls="units-section-panel"
                                        onClick={() => toggleSection("units")}
                                        onKeyDown={handleSectionHeaderKeyDown("units")}
                                    >
                                        <div className="section-title">
                                            <Ruler className="section-icon" />
                                            <h3>Sistema de unidades</h3>
                                        </div>
                                        {expandedSection === "units" ? (
                                            <ChevronUp className="toggle-icon" />
                                        ) : (
                                            <ChevronDown className="toggle-icon" />
                                        )}
                                    </div>

                                    {expandedSection === "units" && (
                                        <div id="units-section-panel" className="section-content units-content">
                                            <div className="units-options">
                                                <div className="radio-option">
                                                    <input
                                                        type="radio"
                                                        id="metric"
                                                        name="units"
                                                        value="metric"
                                                        checked={profile.preferences.preferred_units === "metric"}
                                                        onChange={() => handleChangeUnits("metric")}
                                                        className="radio"
                                                    />
                                                    <label htmlFor="metric" className="radio-label">
                                                        Métrico (°C, km/h)
                                                    </label>
                                                </div>
                                                <div className="radio-option">
                                                    <input
                                                        type="radio"
                                                        id="imperial"
                                                        name="units"
                                                        value="imperial"
                                                        checked={profile.preferences.preferred_units === "imperial"}
                                                        onChange={() => handleChangeUnits("imperial")}
                                                        className="radio"
                                                    />
                                                    <label htmlFor="imperial" className="radio-label">
                                                        Imperial (°F, mph)
                                                    </label>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Alerts Preference */}
                                <div className="preference-section">
                                    <div
                                        className="section-header"
                                        role="button"
                                        tabIndex={0}
                                        aria-expanded={expandedSection === "alerts"}
                                        aria-controls="alerts-section-panel"
                                        onClick={() => toggleSection("alerts")}
                                        onKeyDown={handleSectionHeaderKeyDown("alerts")}
                                    >
                                        <div className="section-title">
                                            {profile.preferences.alerts_enabled ? (
                                                <Bell className="section-icon active-icon" />
                                            ) : (
                                                <BellOff className="section-icon" />
                                            )}
                                            <h3>Alertas climáticas</h3>
                                        </div>
                                        {expandedSection === "alerts" ? (
                                            <ChevronUp className="toggle-icon" />
                                        ) : (
                                            <ChevronDown className="toggle-icon" />
                                        )}
                                    </div>

                                    {expandedSection === "alerts" && (
                                        <div id="alerts-section-panel" className="section-content alerts-content">
                                            <div className="alerts-toggle-container">
                                                <div className="alerts-info">
                                                    <label htmlFor="alerts-toggle" className="toggle-label">
                                                        Recibir alertas climáticas
                                                    </label>
                                                    <p className="toggle-description">
                                                        Recibirás notificaciones sobre condiciones climáticas extremas
                                                    </p>
                                                </div>
                                                <div className="toggle-switch">
                                                    <input
                                                        type="checkbox"
                                                        id="alerts-toggle"
                                                        checked={profile.preferences.alerts_enabled}
                                                        onChange={handleToggleAlerts}
                                                        className="toggle-input"
                                                    />
                                                    <label htmlFor="alerts-toggle" className="toggle-label-switch"></label>
                                                </div>
                                            </div>

                                            {profile.preferences.alerts_enabled && (
                                                <div className="alerts-notice">
                                                    <AlertTriangle className="notice-icon" />
                                                    <p className="notice-text">
                                                        Las alertas se enviarán para tus ubicaciones favoritas cuando haya condiciones climáticas
                                                        extremas.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Favorite Locations */}
                                <div className="preference-section">
                                    <div
                                        className="section-header"
                                        role="button"
                                        tabIndex={0}
                                        aria-expanded={expandedSection === "locations"}
                                        aria-controls="locations-section-panel"
                                        onClick={() => toggleSection("locations")}
                                        onKeyDown={handleSectionHeaderKeyDown("locations")}
                                    >
                                        <div className="section-title">
                                            <MapPin className="section-icon" />
                                            <h3>Ubicaciones favoritas</h3>
                                            <span className="locations-count">{profile.preferences.favorite_location.length}</span>
                                        </div>
                                        {expandedSection === "locations" ? (
                                            <ChevronUp className="toggle-icon" />
                                        ) : (
                                            <ChevronDown className="toggle-icon" />
                                        )}
                                    </div>

                                    {expandedSection === "locations" && (
                                        <div id="locations-section-panel" className="section-content locations-content">
                                            {profile.preferences.favorite_location.length > 0 ? (
                                                <div className="locations-list">
                                                    {profile.preferences.favorite_location.map((location, index) => (
                                                        <div key={`${location.name}-${index}`} className="location-item">
                                                            <div className="location-info">
                                                                <MapPin className="location-icon" />
                                                                <div className="location-details">
                                                                    <p className="location-name">{location.name}</p>
                                                                    <p className="location-coordinates">
                                                                        Lat: {location.lat.toFixed(6)}, Lon: {location.lon.toFixed(6)}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveLocation(index)}
                                                                className="delete-location-button"
                                                            >
                                                                <Trash2 className="delete-icon" />
                                                                <span className="sr-only">Eliminar</span>
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="no-locations">
                                                    <MapPin className="no-locations-icon" />
                                                    <p>No tienes ubicaciones favoritas</p>
                                                </div>
                                            )}

                                            <div className="add-location-section">
                                                <h4 className="add-location-title">Agregar nueva ubicación</h4>
                                                <form className="add-location-form" onSubmit={handleAddLocation}>
                                                    <div className="location-field">
                                                        <label htmlFor="location-name" className="location-label">
                                                            Nombre de la ubicación
                                                        </label>
                                                        <input
                                                            id="location-name"
                                                            type="text"
                                                            value={newLocation.name}
                                                            onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
                                                            placeholder="Ej: Mi Ciudad"
                                                            className={formErrors.locationName ? "input input-error" : "input"}
                                                        />
                                                        {formErrors.locationName && <p className="error-text">{formErrors.locationName}</p>}
                                                    </div>

                                                    <div className="coordinates-container">
                                                        <div className="coordinate-field">
                                                            <label htmlFor="location-lat" className="location-label">
                                                                Latitud
                                                            </label>
                                                            <input
                                                                id="location-lat"
                                                                type="text"
                                                                value={newLocation.lat}
                                                                onChange={(e) => setNewLocation({ ...newLocation, lat: e.target.value })}
                                                                placeholder="-32.4782971"
                                                                className={formErrors.locationLat ? "input input-error" : "input"}
                                                            />
                                                            {formErrors.locationLat && <p className="error-text">{formErrors.locationLat}</p>}
                                                        </div>

                                                        <div className="coordinate-field">
                                                            <label htmlFor="location-lon" className="location-label">
                                                                Longitud
                                                            </label>
                                                            <input
                                                                id="location-lon"
                                                                type="text"
                                                                value={newLocation.lon}
                                                                onChange={(e) => setNewLocation({ ...newLocation, lon: e.target.value })}
                                                                placeholder="-61.5805422"
                                                                className={formErrors.locationLon ? "input input-error" : "input"}
                                                            />
                                                            {formErrors.locationLon && <p className="error-text">{formErrors.locationLon}</p>}
                                                        </div>
                                                    </div>

                                                    <button type="submit" className="button add-location-button">
                                                        <Plus className="icon-small" />
                                                        Agregar ubicación
                                                    </button>
                                                </form>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="preferences-footer">
                                <button
                                    type="button"
                                    className="button save-preferences-button"
                                    onClick={handleSavePreferences}
                                    disabled={savingPreferences}
                                >
                                    <Save className="icon-small" />
                                    {savingPreferences ? "Guardando..." : "Guardar todas las preferencias"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
