"use client"

import { useState, useEffect } from "react"
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
} from "lucide-react"
import "./style/UserProfile.css"

export default function UserProfile() {
    // State for user data
    const [profile, setProfile] = useState(null)
    const [loading, setLoading] = useState(true)
    const [editMode, setEditMode] = useState(false)
    const [expandedSection, setExpandedSection] = useState(null)
    const [activeTab, setActiveTab] = useState("profile")
    const [newLocation, setNewLocation] = useState({
        name: "",
        lat: "",
        lon: "",
    })
    const [formErrors, setFormErrors] = useState({})

    // Fetch user data (simulated)
    useEffect(() => {
        // In a real app, this would be an API call
        const fetchUserProfile = async () => {
            try {
                // Simulated API response
                const mockUserProfile = {
                    user: {
                        id: 1,
                        username: "usuario_ejemplo",
                        email: "usuario@ejemplo.com",
                        email_verify: true,
                        first_name: "Usuario",
                        last_name: "Ejemplo",
                        date_joined: "2023-01-15T10:30:00Z",
                        last_login: "2025-03-18T08:45:00Z",
                    },
                    preferences: {
                        id: 1,
                        user: 1,
                        favorite_location: [
                            {
                                lat: -32.4782971,
                                lon: -61.5805422,
                                name: "Rosario",
                            },
                            {
                                lat: -34.6037,
                                lon: -58.3816,
                                name: "Buenos Aires",
                            },
                        ],
                        alerts_enabled: true,
                        preferred_units: "metric",
                    },
                }

                setProfile(mockUserProfile)
                setLoading(false)
            } catch (error) {
                console.error("Error fetching user profile:", error)
                showToast("Error", "No se pudo cargar el perfil de usuario", "error")
                setLoading(false)
            }
        }

        fetchUserProfile()
    }, [])

    // Simple toast notification function
    const showToast = (title, message, type = "success") => {
        // In a real app, you would use a toast library or custom implementation
        alert(`${title}: ${message}`)
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

        // Clear any previous errors
        setFormErrors({})

        // In a real app, this would be an API call to update the profile
        try {
            // Simulate API call
            await new Promise((resolve) => setTimeout(resolve, 800))

            setEditMode(false)
            showToast("Perfil actualizado", "Los cambios han sido guardados correctamente")
        } catch (error) {
            console.error("Error updating profile:", error)
            showToast("Error", "No se pudo actualizar el perfil", "error")
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

    // Handle adding a new location
    const handleAddLocation = (e) => {
        e.preventDefault()
        if (!profile) return

        // Validate location data
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

        // Clear any previous errors
        setFormErrors({})

        // Add the new location
        const updatedProfile = { ...profile }
        updatedProfile.preferences.favorite_location.push({
            name: newLocation.name,
            lat: Number(newLocation.lat),
            lon: Number(newLocation.lon),
        })

        setProfile(updatedProfile)
        setNewLocation({ name: "", lat: "", lon: "" })

        showToast("Ubicación agregada", `${newLocation.name} ha sido agregada a tus ubicaciones favoritas`)
    }

    // Handle removing a location
    const handleRemoveLocation = (index) => {
        if (!profile) return

        const locationName = profile.preferences.favorite_location[index].name
        const updatedProfile = { ...profile }
        updatedProfile.preferences.favorite_location.splice(index, 1)

        setProfile(updatedProfile)

        showToast("Ubicación eliminada", `${locationName} ha sido eliminada de tus ubicaciones favoritas`)
    }

    // Handle toggling alerts
    const handleToggleAlerts = () => {
        if (!profile) return

        const updatedProfile = { ...profile }
        updatedProfile.preferences.alerts_enabled = !updatedProfile.preferences.alerts_enabled

        setProfile(updatedProfile)

        showToast(
            updatedProfile.preferences.alerts_enabled ? "Alertas activadas" : "Alertas desactivadas",
            updatedProfile.preferences.alerts_enabled
                ? "Recibirás notificaciones sobre alertas climáticas"
                : "No recibirás notificaciones sobre alertas climáticas",
        )
    }

    // Handle changing units
    const handleChangeUnits = (value) => {
        if (!profile) return

        const updatedProfile = { ...profile }
        updatedProfile.preferences.preferred_units = value

        setProfile(updatedProfile)

        showToast("Unidades actualizadas", `Has cambiado a unidades ${value === "metric" ? "métricas" : "imperiales"}`)
    }

    // Format date for display
    const formatDate = (dateString) => {
        const date = new Date(dateString)
        return new Intl.DateTimeFormat("es-ES", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        }).format(date)
    }

    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Cargando perfil...</p>
            </div>
        )
    }

    if (!profile) {
        return (
            <div className="error-container">
                <div className="error-card">
                    <div className="error-title">Error</div>
                    <p className="error-message">No se pudo cargar la información del perfil</p>
                    <div className="error-footer">
                        <button onClick={() => window.location.reload()} className="button">
                            Reintentar
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="profile-container">
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
                                        <button className="edit-button" onClick={handleSaveProfile}>
                                            <Save className="icon-small" />
                                            <span className="sr-only">Guardar</span>
                                        </button>
                                    ) : (
                                        <button className="edit-button" onClick={() => setEditMode(true)}>
                                            ✍️
                                            <span className="sr-only">Editar</span>
                                        </button>
                                    )}
                                </div>

                                <div className="user-info">
                                    <div className="user-avatar">
                                        <img
                                            src={`https://api.dicebear.com/7.x/initials/svg?seed=${profile.user.username}`}
                                            alt={profile.user.username}
                                            className="avatar-image"
                                        />
                                        <div className="avatar-fallback">{profile.user.username.substring(0, 2).toUpperCase()}</div>
                                    </div>

                                    <div className="user-details">
                                        <h2 className="user-name">
                                            {profile.user.first_name} {profile.user.last_name}
                                        </h2>
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

                                <div className="dates-section">
                                    <div className="dates-grid">
                                        <div className="date-item">
                                            <p className="date-label">Fecha de registro</p>
                                            <p className="date-value">{formatDate(profile.user.date_joined)}</p>
                                        </div>
                                        <div className="date-item">
                                            <p className="date-label">Último acceso</p>
                                            <p className="date-value">{formatDate(profile.user.last_login)}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="profile-footer">
                                {editMode ? (
                                    <>
                                        <button
                                            type="button"
                                            className="button button-outline cancel-button"
                                            onClick={() => setEditMode(false)}
                                        >
                                            Cancelar
                                        </button>
                                        <button type="button" className="button save-button" onClick={handleSaveProfile}>
                                            <Save className="icon-small" />
                                            Guardar cambios
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button type="button" className="button button-outline logout-button">
                                            <LogOut className="icon-small" />
                                            Cerrar sesión
                                        </button>
                                        <button type="button" className="button edit-profile-button" onClick={() => setEditMode(true)}>
                                        ✍️
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
                                <h2 className="card-title">Preferencias de usuario</h2>
                                <p className="card-description">Configura tus preferencias para personalizar tu experiencia</p>
                            </div>

                            <div className="preferences-content">
                                {/* Units Preference */}
                                <div className="preference-section">
                                    <div className="section-header" onClick={() => toggleSection("units")}>
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
                                        <div className="section-content units-content">
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
                                    <div className="section-header" onClick={() => toggleSection("alerts")}>
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
                                        <div className="section-content alerts-content">
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
                                    <div className="section-header" onClick={() => toggleSection("locations")}>
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
                                        <div className="section-content locations-content">
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
                                    onClick={() => {
                                        showToast("Preferencias guardadas", "Tus preferencias han sido actualizadas correctamente")
                                    }}
                                >
                                    <Save className="icon-small" />
                                    Guardar todas las preferencias
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

